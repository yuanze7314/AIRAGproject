import {
  buildKnowledgeIndexRetrievalResult
} from "../../rag/service";
import { listBadcases } from "../../store/badcase";
import { loadConversationMemory, saveConversationMemoryOutcome } from "../../store/memory";
import { saveTraceRun } from "../../store/trace";
import { generateStructuredOutput } from "../../llm/deepseek";
import type {
  BadcaseHit,
  ChatApiResponse,
  ConversationMemoryRecord,
  ConversationMessage,
  ExampleHit,
  FinalAction,
  LlmJudgeOutput,
  ReplyTemplate,
  RetrievalResult,
  RouteType,
  StructuredCase
} from "../../types";

type ToolSource = "memory.read" | "memory.write" | "knowledge.rag" | "rule.rag" | "example.retrieve" | "template.retrieve" | "badcase.lookup" | "llm.judge" | "trace.save";

export type ToolResult<T> = {
  tool: ToolSource;
  output: T;
  summary: string;
};

const judgeSchema = {
  type: "object",
  properties: {
    passed: { type: "boolean" },
    failureReasons: { type: "array", items: { type: "string" } },
    rewriteInstructions: { type: "array", items: { type: "string" } },
    finalAction: { type: "string", enum: ["send", "handoff", "rewrite"] }
  },
  required: ["passed", "failureReasons", "rewriteInstructions", "finalAction"],
  additionalProperties: false
} as const;

const staticExamples: ExampleHit[] = [
  {
    id: "example-after-sales-accessory-missing-strategy",
    title: "配件缺失先核验订单清单",
    routeType: "after_sales",
    purpose: "strategy",
    customerIntent: "accessory_missing",
    summary: "用户反馈少配件时，先依据订单清单与商品包装说明核验，不直接承诺补发。",
    recommendedAction: "安抚用户，说明需要核对订单和包装清单，避免直接承诺补发。",
    score: 0.84,
    source: "static"
  },
  {
    id: "example-after-sales-quality-strategy",
    title: "质量问题走平台核验",
    routeType: "after_sales",
    purpose: "strategy",
    customerIntent: "quality_issue",
    summary: "质量类售后需要保留规则边界，提示按平台流程核验，最终结果以平台审核为准。",
    recommendedAction: "说明核验路径，要求补充文字化问题现象，避免责任归属判断。",
    score: 0.82,
    source: "static"
  },
  {
    id: "example-after-sales-reply-safe",
    title: "售后回复使用保守承诺模板",
    routeType: "after_sales",
    purpose: "reply",
    summary: "回复需包含安抚、复述、核验路径、下一步和限制性说明。",
    recommendedAction: "使用“会进一步核实/以平台审核为准”的表达。",
    score: 0.8,
    source: "static"
  },
  {
    id: "example-general-reply-product",
    title: "普通咨询只回答已检索知识",
    routeType: "general_service",
    purpose: "reply",
    customerIntent: "general_question",
    summary: "普通客服问题只引用商品、订单、物流等知识库内容，不处理售后承诺。",
    recommendedAction: "命中知识后直接回答；若涉及退款赔付，转售后或人工核验。",
    score: 0.78,
    source: "static"
  }
];

const replyTemplates: ReplyTemplate[] = [
  {
    id: "tpl-after-sales-safe",
    name: "售后安全回复模板",
    routeType: "after_sales",
    tone: "empathetic",
    requiredSections: ["安抚", "问题复述", "规则/证据边界", "下一步", "限制性说明"],
    constraints: ["不承诺退款", "不承诺赔付", "不承诺补发", "不做最终责任判断"],
    templateText: "您好，理解您的反馈。关于{issue}，当前需要结合订单信息、问题说明和平台规则进一步核验。我们会按流程协助处理，最终结果以平台审核为准。"
  },
  {
    id: "tpl-general-service",
    name: "普通客服知识回复模板",
    routeType: "general_service",
    tone: "general",
    requiredSections: ["直接回答", "知识来源边界", "补充信息提示"],
    constraints: ["只使用已检索知识", "不处理退款赔付补发承诺"],
    templateText: "您好，根据当前客服知识库，{answer} 如需核对具体订单，请补充订单详情。"
  },
  {
    id: "tpl-clarification",
    name: "补充信息模板",
    routeType: "needs_clarification",
    tone: "clarification",
    requiredSections: ["说明需要补充", "列出缺失字段"],
    constraints: ["不提前判断结果"],
    templateText: "您好，为了准确处理您的问题，请补充：{fields}。"
  },
  {
    id: "tpl-handoff",
    name: "人工兜底模板",
    routeType: "handoff_required",
    tone: "handoff",
    requiredSections: ["说明转人工", "保持安抚"],
    constraints: ["不输出自动结论"],
    templateText: "您好，当前情况需要人工进一步核实，正在为您转接人工客服，请稍候。"
  }
];

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isLlmJudgePayload(value: unknown): value is Omit<LlmJudgeOutput, "judgeSource" | "judgeError"> {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.passed === "boolean"
    && isStringArray(record.failureReasons)
    && isStringArray(record.rewriteInstructions)
    && (record.finalAction === "send" || record.finalAction === "handoff" || record.finalAction === "rewrite");
}

function tokenScore(text: string, query: string) {
  const normalizedText = text.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  const parts = normalizedQuery.split(/\s+/).filter((part) => part.length >= 2);
  const lexicalScore = parts.reduce((score, part) => score + (normalizedText.includes(part) ? 0.08 : 0), 0);
  const phraseScore = normalizedText.includes(normalizedQuery.slice(0, 12)) ? 0.2 : 0;
  return lexicalScore + phraseScore;
}

export async function memoryReadTool(input: {
  conversationId: string;
  ticketId: string;
  messages: ConversationMessage[];
  history: ConversationMessage[];
}): Promise<ToolResult<ConversationMemoryRecord>> {
  const output = await loadConversationMemory(input);
  return {
    tool: "memory.read",
    output,
    summary: "已读取并注入会话记忆"
  };
}

export async function memoryWriteTool(input: {
  memory: ConversationMemoryRecord;
  messages: ConversationMessage[];
  finalMessage: string;
  finalAction: FinalAction;
  routeType?: RouteType;
  handoffReason?: string;
  missingFields?: string[];
}): Promise<ToolResult<ConversationMemoryRecord>> {
  const output = await saveConversationMemoryOutcome(input);
  return {
    tool: "memory.write",
    output,
    summary: "已写入会话记忆结果"
  };
}

export async function knowledgeRagTool(input: {
  structuredCase: StructuredCase;
  fallbackCategory?: string;
}): Promise<ToolResult<RetrievalResult | undefined>> {
  const output = await buildKnowledgeIndexRetrievalResult({
    structuredCase: input.structuredCase,
    knowledgeBase: "general",
    fallbackCategory: input.fallbackCategory
  });
  return {
    tool: "knowledge.rag",
    output,
    summary: output ? `普通客服 RAG 命中 ${output.rerankedTopK.length} 条` : "普通客服 RAG 未命中索引"
  };
}

export async function ruleRagTool(input: {
  structuredCase: StructuredCase;
}): Promise<ToolResult<RetrievalResult | undefined>> {
  const output = await buildKnowledgeIndexRetrievalResult({
    structuredCase: input.structuredCase,
    knowledgeBase: "after_sales"
  });
  return {
    tool: "rule.rag",
    output,
    summary: output ? `售后规则 RAG 命中 ${output.rerankedTopK.length} 条` : "售后规则 RAG 未命中索引"
  };
}

export async function badcaseLookupTool(input: {
  query: string;
  routeType?: RouteType;
  limit?: number;
}): Promise<ToolResult<BadcaseHit[]>> {
  const records = await listBadcases(input.routeType ? { routeType: input.routeType } : undefined);
  const output = records
    .map((record) => {
      const haystack = [record.userMessage, record.badcaseType, record.note].join(" ");
      const score = tokenScore(haystack, input.query)
        + (record.routeType === input.routeType ? 0.25 : 0)
        + (record.source === "auto" ? 0.05 : 0);
      return {
        id: record.id,
        badcaseType: record.badcaseType,
        note: record.note,
        routeType: record.routeType,
        score,
        source: record.source,
        traceId: record.traceId
      } satisfies BadcaseHit;
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit ?? 3);

  return {
    tool: "badcase.lookup",
    output,
    summary: `Badcase lookup 返回 ${output.length} 条`
  };
}

export async function exampleRetrieveTool(input: {
  structuredCase: StructuredCase;
  routeType: RouteType;
  purpose: ExampleHit["purpose"];
  limit?: number;
}): Promise<ToolResult<ExampleHit[]>> {
  const query = input.structuredCase.originalMessage;
  const candidates = staticExamples
    .filter((example) => example.routeType === input.routeType && example.purpose === input.purpose)
    .map((example) => ({
      ...example,
      score: example.score
        + (example.customerIntent === input.structuredCase.customerIntent ? 0.1 : 0)
        + tokenScore(`${example.title} ${example.summary} ${example.recommendedAction}`, query)
    }));
  const badcaseTool = await badcaseLookupTool({ query, routeType: input.routeType, limit: 2 });
  const badcaseExamples = badcaseTool.output.map((hit) => ({
    id: `badcase-example-${hit.id}`,
    title: `历史 badcase: ${hit.badcaseType}`,
    routeType: input.routeType,
    purpose: input.purpose,
    customerIntent: input.structuredCase.customerIntent,
    summary: hit.note,
    recommendedAction: "参考历史 badcase，优先避免相同失败原因。",
    score: hit.score,
    source: "badcase"
  }) satisfies ExampleHit);
  const output = [...candidates, ...badcaseExamples]
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit ?? 3);

  return {
    tool: "example.retrieve",
    output,
    summary: `示例检索返回 ${output.length} 条`
  };
}

export async function templateRetrieveTool(input: {
  routeType: RouteType;
  riskLevel?: "low" | "medium" | "high";
}): Promise<ToolResult<ReplyTemplate>> {
  const routeType = input.riskLevel === "high" && input.routeType === "handoff_required"
    ? "handoff_required"
    : input.routeType;
  const output = replyTemplates.find((template) => template.routeType === routeType) ?? replyTemplates[0];
  return {
    tool: "template.retrieve",
    output,
    summary: `已选择模板 ${output.id}`
  };
}

export async function llmJudgeTool(input: {
  content: string;
  target: "general_service_reply" | "after_sales_reply";
  attempt: number;
  fallback: Omit<LlmJudgeOutput, "judgeSource" | "judgeError">;
  context?: unknown;
}): Promise<ToolResult<LlmJudgeOutput>> {
  const result = await generateStructuredOutput<Omit<LlmJudgeOutput, "judgeSource" | "judgeError">>({
    name: input.target === "after_sales_reply" ? "after_sales_llm_judge_tool" : "general_llm_judge_tool",
    schema: judgeSchema,
    fallback: input.fallback,
    validate: isLlmJudgePayload,
    system: [
      "You are the llm.judge tool in a LangGraph-style customer service workflow.",
      "Judge only the customer-visible reply.",
      "Fail replies that promise refund, compensation, reshipment, replacement, guaranteed approval, or final liability.",
      "Fail replies that ask for photos, screenshots, image uploads, product pictures, or visual proof.",
      "For after-sales replies, require verification, evidence/process guidance, platform review, or human handoff wording.",
      "Return JSON only."
    ].join("\n"),
    user: {
      target: input.target,
      attempt: input.attempt,
      reply: input.content,
      context: input.context,
      fallback: input.fallback
    }
  });

  return {
    tool: "llm.judge",
    output: {
      ...result.value,
      judgeSource: result.source,
      judgeError: result.error
    },
    summary: result.value.passed ? "LLM judge 通过" : "LLM judge 未通过"
  };
}

export async function traceSaveTool(input: ChatApiResponse): Promise<ToolResult<{ traceId: string }>> {
  await saveTraceRun(input);
  return {
    tool: "trace.save",
    output: { traceId: input.traceId },
    summary: "已保存 trace"
  };
}
