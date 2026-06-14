import generalKb from "../../knowledge/general/general-service-kb.json";
import {
  buildAfterSalesRetrievalResult,
  buildGeneralRetrievalResult,
  buildKnowledgeIndexRetrievalResult,
  generalKnowledgeHitsFromRetrievalResult,
  retrieveAfterSalesRulesFromIndex,
  retrieveGeneralKnowledgeFromIndex,
  ruleHitsFromRetrievalResult
} from "../rag/service";
import { loadAfterSalesRules } from "../rag/rules";
import { bm25Search } from "../rag/scoring";
import { generateStructuredOutput } from "../llm/deepseek";
import { saveAutoBadcase } from "../store/badcase";
import { loadConversationMemory, saveConversationMemoryOutcome } from "../store/memory";
import type {
  AgentGraphState,
  AgentNode,
  ConversationMemoryRecord,
  ConversationMessage,
  GeneralKnowledgeHit,
  GeneralServiceResult,
  GuardrailResult,
  PolicyEvidenceResult,
  QAResult,
  ReplyDraft,
  RetrievalResult,
  ReviewLoopState,
  RiskStrategyResult,
  RouteDecision,
  RuleHit,
  StructuredCase,
  TemplateOutputResult,
  TicketStatus,
  TraceEvent,
  VisibleStatus
} from "../types";

const now = () => new Date().toISOString();
const MAX_REVIEW_ATTEMPTS = 2;
const FORBIDDEN_COMMITMENT_TERMS = [
  "一定可以退款",
  "一定退款",
  "可以直接退款",
  "可以退款",
  "无需退货直接退款",
  "不用退货直接退款",
  "可以直接赔付",
  "确认赔付",
  "已经确认是物流责任",
  "确认是物流责任",
  "已确认商品损坏",
  "确认商品损坏",
  "平台一定会补发",
  "确认补发",
  "确认是商家责任",
  "确认责任",
  "确认审核通过"
];
const FINAL_LIABILITY_PATTERNS = [
  /已确认.*责任/,
  /确认.*责任/,
  /责任已经明确/,
  /就是.*责任/,
  /一定是.*责任/
];
const IMAGE_OVERSTATEMENT_PATTERNS = [
  /图片证明/,
  /照片证明/,
  /从图片.*确认/,
  /根据图片.*已经确认/,
  /图片已经确认/
];
const TONE_RISK_PATTERNS = [
  /你自己/,
  /没办法/,
  /随便你/,
  /不归我们管/,
  /你必须接受/
];

type GeneralKbDoc = Omit<GeneralKnowledgeHit, "score" | "matchedKeywords"> & { keywords: string[] };

const structuredCaseSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "caseId",
    "conversationId",
    "originalMessage",
    "productInfo",
    "issueSummary",
    "customerIntent",
    "customerRequest",
    "requestedOutcome",
    "evidenceState",
    "evidenceStatus",
    "uploadedEvidence",
    "imageClues",
    "emotionState",
    "knownContext",
    "missingFields",
    "riskSignals",
    "priorActions",
    "previousActions",
    "clarificationQuestions",
    "memorySummary",
    "confidence"
  ],
  properties: {
    caseId: { type: "string" },
    conversationId: { type: "string" },
    originalMessage: { type: "string" },
    productInfo: { type: "string" },
    issueSummary: { type: "string" },
    customerIntent: { type: "string" },
    customerRequest: { type: "string" },
    requestedOutcome: { type: "string" },
    evidenceState: { type: "string" },
    evidenceStatus: { type: "string", enum: ["none", "partial", "sufficient"] },
    uploadedEvidence: { type: "array", items: { type: "string" } },
    imageClues: { type: "array", items: { type: "string" } },
    emotionState: { type: "string", enum: ["calm", "normal", "anxious", "angry", "complaint"] },
    knownContext: { type: "array", items: { type: "string" } },
    missingFields: { type: "array", items: { type: "string" } },
    riskSignals: { type: "array", items: { type: "string" } },
    priorActions: { type: "array", items: { type: "string" } },
    previousActions: { type: "array", items: { type: "string" } },
    clarificationQuestions: { type: "array", items: { type: "string" } },
    memorySummary: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 }
  }
} as const;

const routeDecisionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["routeType", "confidence", "rationale", "requiredInfo", "riskSignals", "guardrailApplied", "targetFlow"],
  properties: {
    routeType: { type: "string", enum: ["general_service", "after_sales", "needs_clarification", "handoff_required"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    rationale: { type: "string" },
    requiredInfo: { type: "array", items: { type: "string" } },
    riskSignals: { type: "array", items: { type: "string" } },
    guardrailApplied: { type: "boolean" },
    targetFlow: { type: "string", enum: ["general_service_flow", "after_sales_flow", "clarification_flow", "handoff_flow"] }
  }
} as const;

const generalAnswerSchema = {
  type: "object",
  additionalProperties: false,
  required: ["category", "answer"],
  properties: {
    category: { type: "string", enum: ["product_specs", "delivery_time", "logistics_info", "order_info", "clarification"] },
    answer: { type: "string" }
  }
} as const;

const replyDraftSchema = {
  type: "object",
  additionalProperties: false,
  required: ["content", "basisSummary", "respectedConstraints", "qaChecklist"],
  properties: {
    content: { type: "string" },
    basisSummary: { type: "array", items: { type: "string" } },
    respectedConstraints: { type: "array", items: { type: "string" } },
    qaChecklist: { type: "array", items: { type: "string" } }
  }
} as const;

const qaJudgeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["passed", "failureReasons", "rewriteInstructions", "finalAction"],
  properties: {
    passed: { type: "boolean" },
    failureReasons: { type: "array", items: { type: "string" } },
    rewriteInstructions: { type: "array", items: { type: "string" } },
    finalAction: { type: "string", enum: ["send", "rewrite", "handoff"] }
  }
} as const;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isStructuredCase(value: unknown): value is StructuredCase {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.caseId === "string"
    && typeof record.conversationId === "string"
    && typeof record.originalMessage === "string"
    && typeof record.productInfo === "string"
    && typeof record.issueSummary === "string"
    && typeof record.customerIntent === "string"
    && typeof record.customerRequest === "string"
    && typeof record.requestedOutcome === "string"
    && typeof record.evidenceState === "string"
    && ["none", "partial", "sufficient"].includes(String(record.evidenceStatus))
    && isStringArray(record.uploadedEvidence)
    && isStringArray(record.imageClues)
    && ["calm", "normal", "anxious", "angry", "complaint"].includes(String(record.emotionState))
    && isStringArray(record.knownContext)
    && isStringArray(record.missingFields)
    && isStringArray(record.riskSignals)
    && isStringArray(record.priorActions)
    && isStringArray(record.previousActions)
    && isStringArray(record.clarificationQuestions)
    && typeof record.memorySummary === "string"
    && typeof record.confidence === "number";
}

function isRouteDecision(value: unknown): value is RouteDecision {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return ["general_service", "after_sales", "needs_clarification", "handoff_required"].includes(String(record.routeType))
    && typeof record.confidence === "number"
    && typeof record.rationale === "string"
    && isStringArray(record.requiredInfo)
    && isStringArray(record.riskSignals)
    && typeof record.guardrailApplied === "boolean"
    && ["general_service_flow", "after_sales_flow", "clarification_flow", "handoff_flow"].includes(String(record.targetFlow));
}

function isGeneralAnswer(value: unknown): value is Pick<GeneralServiceResult, "category" | "answer"> {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return ["product_specs", "delivery_time", "logistics_info", "order_info", "clarification"].includes(String(record.category))
    && typeof record.answer === "string"
    && record.answer.trim().length > 0;
}

function isReplyDraft(value: unknown): value is ReplyDraft {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.content === "string"
    && record.content.trim().length > 0
    && isStringArray(record.basisSummary)
    && isStringArray(record.respectedConstraints)
    && isStringArray(record.qaChecklist);
}

function isQaJudgeResult(value: unknown): value is Pick<ReviewLoopState, "passed" | "failureReasons" | "rewriteInstructions" | "finalAction"> {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.passed === "boolean"
    && isStringArray(record.failureReasons)
    && isStringArray(record.rewriteInstructions)
    && ["send", "rewrite", "handoff"].includes(String(record.finalAction));
}

function inferProduct(text: string) {
  if (/AirBuds Pro X|耳机|耳塞|AirPods|airpods/i.test(text)) return "AirBuds Pro X";
  return "AirBuds Pro X";
}

function inferEmotion(text: string): StructuredCase["emotionState"] {
  if (/投诉|举报|不给我处理/.test(text)) return "complaint";
  if (/凭什么|必须|马上|现在|赶紧/.test(text)) return "angry";
  if (/急|怎么办|快/.test(text)) return "anxious";
  return "normal";
}

function inferIntent(text: string) {
  if (/投诉|举报|不给我处理/.test(text)) return "complaint_escalation";
  if (/仅退款|直接退款|不想退货/.test(text)) return "refund_only_request";
  if (/主播|直播|承诺|赠品|送/.test(text)) return "livestream_promise_dispute";
  if (/破|压坏|物流破损|包装|划痕/.test(text)) return "logistics_damage";
  if (/杂音|没声音|无声|单边|右耳|左耳|断连|坏|故障|质量|不能用/.test(text)) return "quality_issue";
  if (/配件|充电头|数据线|少了|缺/.test(text)) return "accessory_missing";
  if (/激活|拆封|退/.test(text)) return "rule_consultation";
  if (/规格|参数|蓝牙|续航|保修|降噪|主动降噪|支持|发货|送到|快递|单号|订单/.test(text)) return "general_question";
  return "unclear";
}

function evidenceLabel(evidence: string, index: number) {
  if (evidence.startsWith("data:image/")) {
    return `第 ${index + 1} 个附件：已收到，当前版本不进行图片证据链分析`;
  }
  return `附件备注：${evidence}`;
}

function hasAfterSalesSignal(text: string) {
  return /退款|退货|质量|故障|杂音|坏|坏了|破损|划痕|少了|缺失|补发|赔付|赔偿|投诉|举报|仅退款|激活|拆封|主播|直播|承诺/.test(text);
}

function isOrdinaryServiceQuestion(text: string) {
  return /支持|参数|规格|主动降噪|降噪|蓝牙|续航|保修|发货|快递|物流|单号|订单|什么时候|多久|哪家/.test(text) && !hasAfterSalesSignal(text);
}

function generalRouteDecision(structuredCase: StructuredCase, rationale: string, source?: RouteDecision["llmSource"], error?: string): RouteDecision {
  return {
    routeType: "general_service",
    confidence: 0.88,
    rationale,
    requiredInfo: [],
    riskSignals: structuredCase.riskSignals,
    guardrailApplied: false,
    targetFlow: "general_service_flow",
    llmSource: source,
    llmError: error
  };
}

function latestClarificationFields(memory: ConversationMemoryRecord) {
  const latest = [...memory.actionHistory].reverse().find((action) => action.includes("needs_clarification_fields="));
  if (!latest) return [];
  const match = latest.match(/needs_clarification_fields=([^;]+)/);
  if (!match?.[1]) return [];
  return match[1].split("|").map((field) => field.trim()).filter(Boolean);
}

function clarificationRound(memory: ConversationMemoryRecord) {
  return memory.actionHistory.filter((action) => action.includes("route=needs_clarification")).length;
}

function recentUserContext(messages: ConversationMessage[], memory: ConversationMemoryRecord, previousMissingFields: string[]) {
  const userMessages = [...memory.rawMessages, ...messages]
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter(Boolean);
  const uniqueMessages = userMessages.filter((message, index, all) => all.indexOf(message) === index);
  const latest = messages.at(-1)?.content.trim() ?? "";
  if (!previousMissingFields.length) return latest;
  return uniqueMessages.slice(-4).join(" / ") || latest;
}

function hasSpecificIssue(text: string) {
  return /杂音|没声音|无声|断连|坏|故障|不能用|破损|破了|划痕|少了|缺|配件|耳塞|充电盒|退款|退货|补发|换新|拆封|试戴|发货|快递|物流|单号|主动降噪|降噪|续航|蓝牙|保修|包装|清单/.test(text);
}

function hasActionableRequest(text: string) {
  return /退款|退货|补发|换新|怎么处理|怎么办|能不能|查询|多久|什么时候|支持|有哪些|是否|吗|处理|售后|要|想/.test(text);
}

function deterministicMissingFields(intent: string, contextText: string) {
  if (intent !== "unclear") return [];
  const missing: string[] = [];
  if (!hasSpecificIssue(contextText)) missing.push("具体问题");
  if (!hasActionableRequest(contextText)) missing.push("处理诉求");
  return missing.length ? missing : ["具体问题"];
}

function missingFieldDiff(current: string[], previous: string[]) {
  const currentSet = new Set(current);
  const previousSet = new Set(previous);
  return {
    resolvedMissingFields: previous.filter((field) => !currentSet.has(field)),
    newMissingFields: current.filter((field) => !previousSet.has(field))
  };
}

async function recordAutoBadcase(input: {
  graph: AgentGraphState;
  type: string;
  note: string;
}) {
  try {
    await saveAutoBadcase({
      userMessage: input.graph.messages.at(-1)?.content ?? "",
      agentAnalysis: input.graph,
      badcaseType: input.type,
      note: input.note,
      traceId: input.graph.traceId,
      routeType: input.graph.routeDecision?.routeType
    });
  } catch {
    // Badcase capture must not break the customer-facing response path.
  }
}

export async function recordGraphBadcases(graph: AgentGraphState) {
  const events: Array<{ type: string; note: string }> = [];

  if (graph.structuredCase?.llmSource === "fallback") {
    events.push({ type: "llm_fallback", note: `Case Understanding fallback: ${graph.structuredCase.llmError ?? "unknown"}` });
  }
  if (graph.routeDecision?.llmSource === "fallback") {
    events.push({ type: "llm_fallback", note: `Query Router fallback: ${graph.routeDecision.llmError ?? "unknown"}` });
  }
  if (graph.generalService?.llmSource === "fallback") {
    events.push({ type: "llm_fallback", note: `General Service fallback: ${graph.generalService.llmError ?? "unknown"}` });
  }
  if (graph.replyDraft?.llmSource === "fallback") {
    events.push({ type: "llm_fallback", note: `Reply Agent fallback: ${graph.replyDraft.llmError ?? "unknown"}` });
  }
  if (graph.routeDecision?.rationale.includes("guarded")) {
    events.push({ type: "wrong_route_guarded", note: graph.routeDecision.rationale });
  }
  if (graph.qaResult && !graph.qaResult.passed) {
    events.push({ type: "qa_failed", note: graph.qaResult.failureReasons.join(" | ") || "QA failed" });
  }

  for (const event of events) {
    await recordAutoBadcase({ graph, type: event.type, note: event.note });
  }
}

export async function caseUnderstandingAgent(messages: ConversationMessage[], memory: ConversationMemoryRecord): Promise<StructuredCase> {
  const latest = messages[messages.length - 1];
  const text = latest?.content ?? "";
  const uploadedEvidence = latest?.images ?? [];
  const fallbackImageClues = uploadedEvidence.map((image, index) => evidenceLabel(image, index));
  const imageClues = fallbackImageClues;
  const previousMissingFields = latestClarificationFields(memory);
  const currentClarificationRound = clarificationRound(memory);
  const contextText = recentUserContext(messages, memory, previousMissingFields);
  const intent = inferIntent(contextText);
  const riskSignals = [
    /退款|退货|仅退款/.test(contextText) ? "refund_request" : "",
    /赔|补发/.test(contextText) ? "compensation_or_reship" : "",
    /投诉|举报/.test(contextText) ? "complaint_escalation" : "",
    /激活|拆封/.test(contextText) ? "activation_or_unsealed" : "",
    /主播|直播|承诺/.test(contextText) ? "livestream_promise" : ""
  ].filter(Boolean);
  const missingFields = deterministicMissingFields(intent, contextText);
  const customerRequest = /退款|退货|仅退款/.test(contextText) ? "退款/退货" : /补发/.test(contextText) ? "补发" : /快递|单号|发货/.test(contextText) ? "查询履约信息" : "咨询处理路径";

  const missingDiff = missingFieldDiff(missingFields, previousMissingFields);

  const fallback: StructuredCase = {
    caseId: memory.ticketId,
    conversationId: memory.conversationId,
    originalMessage: text,
    productInfo: inferProduct(text),
    issueSummary: intent === "general_question" ? "普通客服咨询" : intent === "unclear" ? "问题信息不足" : "售后服务问题",
    customerIntent: intent,
    customerRequest,
    requestedOutcome: customerRequest,
    evidenceState: uploadedEvidence.length ? "已收到附件备注，当前版本不进行图片证据链分析" : "未提供补充附件，当前版本以文字信息和规则库判断为主",
    evidenceStatus: uploadedEvidence.length ? "partial" : "none",
    uploadedEvidence: fallbackImageClues,
    imageClues,
    emotionState: inferEmotion(text),
    knownContext: memory.rawMessages.slice(-6).map((message) => `${message.role}: ${message.content}`),
    missingFields,
    previousMissingFields,
    resolvedMissingFields: missingDiff.resolvedMissingFields,
    newMissingFields: missingDiff.newMissingFields,
    clarificationRound: currentClarificationRound,
    riskSignals,
    priorActions: memory.actionHistory,
    previousActions: memory.actionHistory,
    clarificationQuestions: missingFields.map((field) => `请补充${field}`),
    memorySummary: memory.compressedSummary ?? "",
    confidence: intent === "unclear" ? 0.42 : 0.86,
    visionSource: "disabled",
    visionError: "图片证据链按当前开发计划搁置"
  };

  const result = await generateStructuredOutput<StructuredCase>({
    name: "structured_case",
    schema: structuredCaseSchema,
    fallback,
    validate: isStructuredCase,
    system: [
      "You are a 3C e-commerce after-sales case understanding agent.",
      "Return only fields required by the schema.",
      "Preserve the provided caseId and conversationId exactly.",
      "Classify ordinary service questions separately from after-sales disputes.",
      "Image evidence-chain analysis is disabled in the current product scope; do not infer facts from images.",
      "Use concise Chinese strings for customer-facing business fields."
    ].join("\n"),
    user: {
      caseId: memory.ticketId,
      conversationId: memory.conversationId,
      latestMessage: text,
      mergedConversationContext: contextText,
      imageCount: uploadedEvidence.length,
      imageClues,
      visionSource: "disabled",
      visionError: "图片证据链按当前开发计划搁置",
      previousMissingFields,
      clarificationRound: currentClarificationRound,
      recentMessages: memory.rawMessages.slice(-6).map((message) => ({ role: message.role, content: message.content })),
      priorActions: memory.actionHistory,
      memorySummary: memory.compressedSummary ?? "",
      fallback
    }
  });

  if (result.source === "fallback") return { ...fallback, llmSource: result.source, llmError: result.error };
  const normalizedIntent = intent !== "unclear" && result.value.customerIntent === "unclear" ? intent : result.value.customerIntent;
  const normalizedMissingFields = deterministicMissingFields(normalizedIntent, contextText);
  return {
    ...result.value,
    caseId: memory.ticketId,
    conversationId: memory.conversationId,
    originalMessage: text,
    productInfo: "AirBuds Pro X",
    issueSummary: normalizedIntent === "general_question" ? "普通客服咨询" : normalizedIntent === "unclear" ? "问题信息不足" : "售后服务问题",
    customerIntent: normalizedIntent,
    customerRequest,
    requestedOutcome: customerRequest,
    uploadedEvidence: fallbackImageClues,
    imageClues,
    knownContext: result.value.knownContext.length ? result.value.knownContext : fallback.knownContext,
    missingFields: normalizedMissingFields,
    previousMissingFields,
    resolvedMissingFields: missingFieldDiff(normalizedMissingFields, previousMissingFields).resolvedMissingFields,
    newMissingFields: missingFieldDiff(normalizedMissingFields, previousMissingFields).newMissingFields,
    clarificationRound: currentClarificationRound,
    priorActions: memory.actionHistory,
    previousActions: memory.actionHistory,
    memorySummary: memory.compressedSummary ?? "",
    llmSource: result.source,
    llmError: result.error,
    visionSource: "disabled",
    visionError: "图片证据链按当前开发计划搁置"
  };
}

export async function ruleGuardrailAgent(structuredCase: StructuredCase): Promise<GuardrailResult> {
  const text = structuredCase.originalMessage;
  const hardRiskSignals = [
    ...structuredCase.riskSignals,
    /生鲜|衣服|美妆|食品|家具|酒店|机票/.test(text) ? "out_of_scope_category" : ""
  ].filter(Boolean);
  const outOfScope = hardRiskSignals.includes("out_of_scope_category");
  const requiredHumanHandoff = outOfScope || structuredCase.emotionState === "complaint" || hardRiskSignals.includes("livestream_promise");
  const forcedRouteType = outOfScope ? "handoff_required" : undefined;
  const rationale = outOfScope ? "问题超出 3C 普通客服和售后 MVP 范围" : requiredHumanHandoff ? "命中投诉、直播承诺或需人工核实的硬风险" : "未命中强制人工兜底规则";

  return {
    hardRiskFlags: hardRiskSignals,
    hardRiskSignals,
    prohibitedCommitments: ["承诺退款", "承诺赔付", "承诺补发", "最终责任判定", "确认审核通过"],
    outOfScope,
    fallbackConstraints: ["不得直接承诺退款、赔付、补发或最终责任", "附件备注不能作为最终事实", "规则依据不足时需澄清或转人工"],
    recommendedRouteOverride: forcedRouteType,
    forcedRouteType,
    requiredHumanHandoff,
    rationale,
    guardrailReason: rationale
  };
}

export async function queryRouterAgent(structuredCase: StructuredCase, guardrail: GuardrailResult): Promise<RouteDecision> {
  if (guardrail.forcedRouteType) {
    return {
      routeType: guardrail.forcedRouteType,
      confidence: 0.96,
      rationale: guardrail.guardrailReason,
      requiredInfo: [],
      riskSignals: guardrail.hardRiskSignals,
      guardrailApplied: true,
      targetFlow: "handoff_flow"
    };
  }

  const fallback = buildDeterministicRouteDecision(structuredCase, guardrail);
  const result = await generateStructuredOutput<RouteDecision>({
    name: "route_decision",
    schema: routeDecisionSchema,
    fallback,
    validate: isRouteDecision,
    system: [
      "You are the Query Router for a 3C e-commerce customer service agent.",
      "Choose exactly one routeType: general_service, after_sales, needs_clarification, handoff_required.",
      "Do not use embedding similarity as the business route decision.",
      "If refund, return, quality issue, compensation, reshipment, complaint, activation, unsealed item, livestream promise, accessory missing, logistics damage, or evidence dispute appears, route to after_sales or handoff_required.",
      "If product/order/logistics information is too vague to answer safely, route to needs_clarification.",
      "Respect guardrail hard risks and prohibited commitments."
    ].join("\n"),
    user: { structuredCase, guardrail, fallback }
  });

  const decision = result.value;
  if (structuredCase.customerIntent === "unclear" && structuredCase.missingFields.length) {
    return {
      ...fallback,
      rationale: result.source === "deepseek" ? `Clarification guarded: ${decision.rationale}` : fallback.rationale,
      llmSource: result.source,
      llmError: result.error
    };
  }

  if (structuredCase.customerIntent !== "unclear" && !structuredCase.missingFields.length && decision.routeType === "needs_clarification") {
    return {
      ...fallback,
      rationale: result.source === "deepseek" ? `Resolved clarification guarded: ${decision.rationale}` : fallback.rationale,
      llmSource: result.source,
      llmError: result.error
    };
  }

  if (isOrdinaryServiceQuestion(structuredCase.originalMessage) && decision.routeType === "needs_clarification") {
    return generalRouteDecision(
      structuredCase,
      `DeepSeek over-clarification guarded: ${decision.rationale}`,
      result.source,
      result.error
    );
  }

  if (structuredCase.customerIntent !== "general_question" && decision.routeType === "general_service") {
    if (!isOrdinaryServiceQuestion(structuredCase.originalMessage)) return fallback;
  }

  return {
    ...decision,
    riskSignals: Array.from(new Set([...decision.riskSignals, ...structuredCase.riskSignals, ...guardrail.hardRiskSignals])),
    guardrailApplied: decision.guardrailApplied || guardrail.hardRiskSignals.length > 0,
    rationale: result.source === "deepseek" ? `DeepSeek structured router: ${decision.rationale}` : decision.rationale,
    llmSource: result.source,
    llmError: result.error
  };
}

function buildDeterministicRouteDecision(structuredCase: StructuredCase, guardrail: GuardrailResult): RouteDecision {
  if (structuredCase.confidence < 0.5 || structuredCase.missingFields.length >= 3) {
    return {
      routeType: "needs_clarification",
      confidence: 0.72,
      rationale: "结构化信息不足，需要先补充商品、问题和诉求。",
      requiredInfo: structuredCase.missingFields,
      riskSignals: structuredCase.riskSignals,
      guardrailApplied: false,
      targetFlow: "clarification_flow"
    };
  }

  if (structuredCase.customerIntent === "general_question") {
    return {
      routeType: "general_service",
      confidence: 0.88,
      rationale: "结构化问题属于产品、发货、快递或订单基础咨询。",
      requiredInfo: [],
      riskSignals: structuredCase.riskSignals,
      guardrailApplied: false,
      targetFlow: "general_service_flow"
    };
  }

  return {
    routeType: "after_sales",
    confidence: 0.9,
    rationale: "结构化问题包含售后规则、质量、退货退款、证据或风险信号。",
    requiredInfo: structuredCase.missingFields,
    riskSignals: structuredCase.riskSignals,
    guardrailApplied: false,
    targetFlow: "after_sales_flow"
  };
}

function categoryFromCase(structuredCase: StructuredCase): GeneralServiceResult["category"] {
  const text = structuredCase.originalMessage;
  if (/快递|物流|单号|运单/.test(text)) return "logistics_info";
  if (/发货|送到|送达|到货|多久/.test(text)) return "delivery_time";
  if (/订单|付款|地址/.test(text)) return "order_info";
  if (/规格|参数|蓝牙|续航|保修|降噪|内存|容量/.test(text)) return "product_specs";
  return "clarification";
}

export async function retrieveGeneralKnowledge(structuredCase: StructuredCase, retrievalResult?: RetrievalResult): Promise<GeneralKnowledgeHit[]> {
  const targetCategory = categoryFromCase(structuredCase);
  const reusedHits = generalKnowledgeHitsFromRetrievalResult(retrievalResult);
  if (reusedHits?.length) return reusedHits;

  const indexedHits = await retrieveGeneralKnowledgeFromIndex(structuredCase, targetCategory);
  if (indexedHits?.length) return indexedHits;

  const query = structuredCase.originalMessage;
  const docs = generalKb as GeneralKbDoc[];
  return bm25Search(query, docs.map((doc) => ({ ...doc, id: doc.docId })), 6)
    .map((doc) => ({
      docId: doc.docId,
      title: doc.title,
      category: doc.category,
      content: doc.content,
      score: doc.score + (doc.category === targetCategory ? 3 : doc.category === "general_style" ? 1 : 0),
      matchedKeywords: doc.matchedKeywords
    }) satisfies GeneralKnowledgeHit)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function buildGeneralAnswer(category: GeneralServiceResult["category"], hits: GeneralKnowledgeHit[]): string {
  const primary = hits[0];
  if (!primary) {
    return "您好，当前没有检索到足够匹配的普通客服知识。您可以补充商品型号、订单详情页信息或问题截图，我会继续为您核实。";
  }
  if (category === "logistics_info" || category === "delivery_time" || category === "order_info") {
    return `您好，根据当前客服知识库，${primary.content}`;
  }
  if (category === "product_specs") {
    return `您好，根据当前客服知识库，${primary.content} 如果您需要核对具体型号，请以商品详情页或订单快照为准。`;
  }
  return "您好，我还需要确认一下，您是想咨询商品规格、发货物流，还是遇到了退货退款、质量问题等售后情况？";
}

export async function generalServiceAgent(structuredCase: StructuredCase, retrievalResult?: RetrievalResult, rewriteInstructions: string[] = []): Promise<GeneralServiceResult> {
  const category = categoryFromCase(structuredCase);
  const hits = await retrieveGeneralKnowledge(structuredCase, retrievalResult);
  const fallback: GeneralServiceResult = {
    category,
    answer: rewriteInstructions.length ? rewriteGeneralServiceAnswer(buildGeneralAnswer(category, hits), rewriteInstructions) : buildGeneralAnswer(category, hits),
    dataUsed: hits.map((hit) => hit.title),
    retrievedKnowledge: hits,
    retrievalQuery: structuredCase.originalMessage
  };

  const result = await generateStructuredOutput<Pick<GeneralServiceResult, "category" | "answer">>({
    name: "general_service_answer",
    schema: generalAnswerSchema,
    fallback: { category: fallback.category, answer: fallback.answer },
    validate: isGeneralAnswer,
    system: [
      "You are a 3C e-commerce general customer service answer agent.",
      "Use only the provided retrieved knowledge.",
      "Do not invent product parameters, delivery dates, tracking numbers, order status, refunds, compensation, reshipment, or liability.",
      "If retrieved knowledge is insufficient, ask for missing order or product information or suggest human verification.",
      "If rewriteInstructions are provided, revise the answer to satisfy them.",
      "Return concise Chinese customer-visible text."
    ].join("\n"),
    user: {
      structuredCase,
      category,
      retrievedKnowledge: hits,
      retrievalResult,
      rewriteInstructions,
      fallback: { category: fallback.category, answer: fallback.answer }
    }
  });

  return {
    ...fallback,
    category: result.value.category,
    answer: result.source === "deepseek" ? result.value.answer : fallback.answer,
    llmSource: result.source,
    llmError: result.error
  };
}

function evaluateReplySafety(content: string, target: ReviewLoopState["target"]) {
  const failureReasons: string[] = [];
  const rewriteInstructions: string[] = [];
  const riskFlags: string[] = [];
  const forbiddenHits = FORBIDDEN_COMMITMENT_TERMS.filter((term) => content.includes(term));

  if (forbiddenHits.length) {
    failureReasons.push(...forbiddenHits.map((term) => `命中禁止承诺：${term}`));
    rewriteInstructions.push("移除退款、赔付、补发、审核通过或最终责任相关承诺，改为补证、核实或转人工。");
    riskFlags.push("forbidden_commitment");
  }

  if (FINAL_LIABILITY_PATTERNS.some((pattern) => pattern.test(content))) {
    failureReasons.push("存在最终责任判定或责任归属过度表述");
    rewriteInstructions.push("删除最终责任判定，改为“需进一步核实，以平台审核结果为准”。");
    riskFlags.push("final_liability");
  }

  if (IMAGE_OVERSTATEMENT_PATTERNS.some((pattern) => pattern.test(content))) {
    failureReasons.push("存在将图片或附件信息表述为最终事实的问题");
    rewriteInstructions.push("移除图片事实判断，仅保留文字信息核实和平台审核路径。");
    riskFlags.push("image_overstatement");
  }

  if (TONE_RISK_PATTERNS.some((pattern) => pattern.test(content))) {
    failureReasons.push("存在可能刺激用户情绪的语气风险");
    rewriteInstructions.push("改为安抚、复述诉求和清晰下一步，不与用户争辩。");
    riskFlags.push("tone_risk");
  }

  if (target === "after_sales_reply" && !/补充|凭证|核实|审核|人工|平台|提交|处理/.test(content)) {
    failureReasons.push("售后回复缺少明确的补证、核实、平台流程或人工处理下一步");
    rewriteInstructions.push("补充客户下一步动作，例如补充凭证、等待平台审核或转人工核实。");
    riskFlags.push("missing_next_action");
  }

  if (target === "after_sales_reply" && /图片|照片|实拍图|截图|拍照/.test(content)) {
    failureReasons.push("当前阶段已暂停图片证据链，不应要求客户补充图片、照片、实拍图或截图");
    rewriteInstructions.push("移除图片、照片、实拍图或截图要求，改为订单信息、商品当前状态说明、问题发生场景与复现步骤。");
    riskFlags.push("image_evidence_paused");
  }

  if (target === "general_service_reply" && /退款|退货|赔付|补发|责任/.test(content)) {
    failureReasons.push("普通客服回复包含售后处置或责任相关表达");
    rewriteInstructions.push("普通客服回复应限制在规格、物流、订单基础信息；售后信号需转售后或人工。");
    riskFlags.push("general_service_scope_leak");
  }

  return { failureReasons, rewriteInstructions: [...new Set(rewriteInstructions)], riskFlags: [...new Set(riskFlags)] };
}

function reviewText(content: string, target: ReviewLoopState["target"], attempt: number): ReviewLoopState {
  const safety = evaluateReplySafety(content, target);
  const failureReasons = safety.failureReasons;
  const passed = failureReasons.length === 0;
  return {
    target,
    maxAttempts: MAX_REVIEW_ATTEMPTS,
    currentAttempt: attempt,
    passed,
    failureReasons,
    rewriteInstructions: safety.rewriteInstructions.length ? safety.rewriteInstructions : failureReasons.map((reason) => `移除或改写风险表述：${reason}`),
    finalAction: passed ? "send" : attempt >= MAX_REVIEW_ATTEMPTS ? "handoff" : "rewrite"
  };
}

function reviewAttempt(content: string, review: ReviewLoopState): NonNullable<ReviewLoopState["attempts"]>[number] {
  return {
    attempt: review.currentAttempt,
    content,
    passed: review.passed,
    failureReasons: review.failureReasons,
    rewriteInstructions: review.rewriteInstructions,
    finalAction: review.finalAction,
    judgeSource: review.judgeSource
  };
}

async function llmQaJudge(input: {
  content: string;
  target: ReviewLoopState["target"];
  attempt: number;
  structuredCase?: StructuredCase;
  policyEvidence?: PolicyEvidenceResult;
  riskStrategy?: RiskStrategyResult;
  retrievalResult?: RetrievalResult;
}): Promise<ReviewLoopState> {
  const fallback = reviewText(input.content, input.target, input.attempt);
  const result = await generateStructuredOutput<Pick<ReviewLoopState, "passed" | "failureReasons" | "rewriteInstructions" | "finalAction">>({
    name: input.target === "after_sales_reply" ? "after_sales_llm_qa_judge" : "general_llm_review_judge",
    schema: qaJudgeSchema,
    fallback: {
      passed: fallback.passed,
      failureReasons: fallback.failureReasons,
      rewriteInstructions: fallback.rewriteInstructions,
      finalAction: fallback.finalAction
    },
    validate: isQaJudgeResult,
    system: [
      "You are an independent QA judge for a Chinese e-commerce customer service Agent.",
      "The only product in scope is AirBuds Pro X wireless earbuds.",
      "Review the customer-visible reply independently from the drafting agent.",
      "Fail the reply if it promises refund, compensation, reshipment, replacement, final liability, or guaranteed approval.",
      "Fail the reply if it asks users for photos, screenshots, image uploads, product pictures, or visual proof.",
      "Fail after-sales replies that do not mention verification, evidence, platform review, or human handoff when information is insufficient.",
      "Fail general-service replies that answer refund, return, compensation, replacement, or liability as ordinary service.",
      "Return JSON only."
    ].join("\n"),
    user: {
      target: input.target,
      attempt: input.attempt,
      reply: input.content,
      structuredCase: input.structuredCase,
      policyEvidence: input.policyEvidence,
      riskStrategy: input.riskStrategy,
      retrievalResult: input.retrievalResult
    }
  });

  return {
    target: input.target,
    maxAttempts: MAX_REVIEW_ATTEMPTS,
    currentAttempt: input.attempt,
    passed: result.value.passed,
    failureReasons: result.value.failureReasons,
    rewriteInstructions: result.value.rewriteInstructions,
    finalAction: result.value.passed ? "send" : input.attempt >= MAX_REVIEW_ATTEMPTS ? "handoff" : result.value.finalAction,
    judgeSource: result.source,
    judgeError: result.error
  };
}

function combineReviewResults(ruleReview: ReviewLoopState, llmReview: ReviewLoopState): ReviewLoopState {
  const passed = ruleReview.passed && llmReview.passed;
  const failureReasons = [...new Set([...ruleReview.failureReasons, ...llmReview.failureReasons])];
  const rewriteInstructions = [...new Set([...ruleReview.rewriteInstructions, ...llmReview.rewriteInstructions])];
  const shouldHandoff = ruleReview.finalAction === "handoff" || llmReview.finalAction === "handoff";
  return {
    ...ruleReview,
    passed,
    failureReasons,
    rewriteInstructions,
    finalAction: passed ? "send" : shouldHandoff ? "handoff" : "rewrite",
    judgeSource: llmReview.judgeSource,
    judgeError: llmReview.judgeError
  };
}

function rewriteGeneralServiceAnswer(answer: string, instructions: string[]) {
  const instructionText = instructions.join(" ");
  if (/售后|退款|退货|赔付|补发|责任|refund|compensation|reship/i.test(instructionText)) {
    return "您好，当前普通客服知识库只能回答商品规格、订单、发货和物流等基础咨询。关于退款、退货、赔付、补发或责任判断，我不能直接承诺处理结果，需要转售后或人工进一步核实。";
  }
  return `${answer} 如果当前信息仍不足，请补充商品型号或订单详情，我会继续为您核实。`;
}

async function runGeneralReviewLoop(input: {
  structuredCase: StructuredCase;
  retrievalResult?: RetrievalResult;
  initialService: GeneralServiceResult;
}) {
  let service = input.initialService;
  const attempts: NonNullable<ReviewLoopState["attempts"]> = [];
  let reviewLoop = combineReviewResults(
    reviewText(service.answer, "general_service_reply", 1),
    await llmQaJudge({ content: service.answer, target: "general_service_reply", attempt: 1, structuredCase: input.structuredCase, retrievalResult: input.retrievalResult })
  );
  attempts.push(reviewAttempt(service.answer, reviewLoop));

  while (!reviewLoop.passed && reviewLoop.finalAction === "rewrite" && reviewLoop.currentAttempt < MAX_REVIEW_ATTEMPTS) {
    service = await generalServiceAgent(input.structuredCase, input.retrievalResult, reviewLoop.rewriteInstructions);
    const attempt = reviewLoop.currentAttempt + 1;
    reviewLoop = combineReviewResults(
      reviewText(service.answer, "general_service_reply", attempt),
      await llmQaJudge({ content: service.answer, target: "general_service_reply", attempt, structuredCase: input.structuredCase, retrievalResult: input.retrievalResult })
    );
    attempts.push(reviewAttempt(service.answer, reviewLoop));
  }

  return {
    generalService: service,
    reviewLoop: { ...reviewLoop, attempts }
  };
}

export async function policyEvidenceAgent(structuredCase: StructuredCase, retrievalResult?: RetrievalResult): Promise<PolicyEvidenceResult> {
  const indexedRules = ruleHitsFromRetrievalResult(retrievalResult) ?? await retrieveAfterSalesRulesFromIndex(structuredCase);
  const rules = indexedRules?.length ? indexedRules : await loadAfterSalesRules();
  const matched = rules
    .filter((rule) => rule.category === structuredCase.customerIntent || rule.category === "platform_rule")
    .slice(0, 3);
  const ruleHits = matched.length ? matched : [rules[rules.length - 1]];
  const needsEvidence = ["quality_issue", "logistics_damage", "livestream_promise_dispute", "refund_only_request", "accessory_missing"].includes(structuredCase.customerIntent);
  return {
    ruleHits,
    applies: ruleHits.map((rule) => rule.title),
    notApplies: ["不自动判责", "不直接执行退款/赔付/补发"],
    evidenceSufficiency: needsEvidence ? (structuredCase.uploadedEvidence.length ? "partial" : "insufficient") : "partial",
    requiredAdditionalEvidence: needsEvidence ? ["订单信息", "商品当前状态说明", "问题发生场景与复现步骤", "平台要求的补充凭证"] : [],
    uncertainty: matched.length ? [] : ["规则召回不足，需要保守回复或转人工"]
  };
}

export async function riskStrategyAgent(structuredCase: StructuredCase, guardrail: GuardrailResult): Promise<RiskStrategyResult> {
  const highRisk = guardrail.requiredHumanHandoff || structuredCase.riskSignals.length > 0 || /退款|赔付|仅退款|激活/.test(structuredCase.originalMessage);
  const mediumRisk = structuredCase.missingFields.length > 0 || structuredCase.evidenceStatus !== "sufficient";
  return {
    riskLevel: highRisk ? "high" : mediumRisk ? "medium" : "low",
    strategyActions: highRisk ? ["comfort_user", "request_evidence", "avoid_commitment", "transfer_human"] : ["comfort_user", "explain_rule", "guide_platform_process"],
    prohibitedCommitments: guardrail.prohibitedCommitments,
    requiredDisclaimers: ["需进一步核实", "最终结果以平台审核为准"],
    handoffRequired: guardrail.requiredHumanHandoff,
    handoffReason: guardrail.requiredHumanHandoff ? guardrail.guardrailReason : undefined,
    rationale: highRisk ? "命中高风险或硬约束，不允许承诺处理结果。" : mediumRisk ? "当前证据或信息仍需补充。" : "可按规则解释和流程引导。"
  };
}

async function fallbackReplyAgent(structuredCase: StructuredCase, policy: PolicyEvidenceResult, risk: RiskStrategyResult, rewriteInstructions: string[] = []): Promise<ReplyDraft> {
  const prefix = rewriteInstructions.length ? "您好，为避免误解，我重新说明一下。" : "您好，理解您的诉求。";
  const ruleTitle = policy.ruleHits[0]?.title ?? "平台售后规则";
  const basisText = policy.uncertainty.length ? "当前售后处理原则和您提供的信息" : `${ruleTitle}以及您提供的凭证`;
  const evidenceText = policy.requiredAdditionalEvidence.length ? `建议您补充${policy.requiredAdditionalEvidence.slice(0, 3).join("、")}，方便进一步核实。` : "我们会结合您提供的信息继续核实。";
  return {
    content: `${prefix}关于您反馈的“${structuredCase.originalMessage}”，当前需要结合${basisText}进一步判断。${policy.uncertainty.length ? "当前规则依据还不充分，不能直接引用具体规则结论。" : ""}${evidenceText}目前无法直接承诺退款、赔付、补发或最终责任，最终处理需以平台审核结果为准。`,
    basisSummary: policy.uncertainty.length ? ["规则依据不足，采用保守核实口径"] : policy.ruleHits.map((rule) => rule.title),
    respectedConstraints: risk.prohibitedCommitments,
    qaChecklist: ["未承诺退款", "未承诺赔付", "未最终判责", "包含核实或补证说明"]
  };
}

export async function replyAgent(structuredCase: StructuredCase, policy: PolicyEvidenceResult, risk: RiskStrategyResult, rewriteInstructions: string[] = []): Promise<ReplyDraft> {
  const fallback = await fallbackReplyAgent(structuredCase, policy, risk, rewriteInstructions);
  const result = await generateStructuredOutput<ReplyDraft>({
    name: "after_sales_reply_draft",
    schema: replyDraftSchema,
    fallback,
    validate: isReplyDraft,
    system: [
      "You are a 3C e-commerce after-sales reply drafting agent.",
      "Generate a customer-visible Chinese reply based on structured case, policy evidence, risk strategy, and rewrite instructions.",
      "Always include empathy, a short restatement, evidence or process guidance, next action, and necessary limitation wording.",
      "Never promise refund, compensation, reshipment, approval, final liability, or final responsibility.",
      "If evidence or rules are insufficient, use conservative verification wording and do not cite a specific rule conclusion.",
      "The image evidence-chain feature is paused. Do not ask users for photos, screenshots, image uploads, product pictures, or visual proof."
    ].join("\n"),
    user: { structuredCase, policy, risk, rewriteInstructions, fallback }
  });

  return {
    ...result.value,
    llmSource: result.source,
    llmError: result.error
  };
}

export async function qaAgent(reply: ReplyDraft, risk: RiskStrategyResult, attempt: number, context?: {
  structuredCase?: StructuredCase;
  policyEvidence?: PolicyEvidenceResult;
  retrievalResult?: RetrievalResult;
}): Promise<QAResult> {
  const review = combineReviewResults(
    reviewText(reply.content, "after_sales_reply", attempt),
    await llmQaJudge({
      content: reply.content,
      target: "after_sales_reply",
      attempt,
      structuredCase: context?.structuredCase,
      policyEvidence: context?.policyEvidence,
      riskStrategy: risk,
      retrievalResult: context?.retrievalResult
    })
  );
  if (risk.riskLevel === "high" && !/核实|审核|人工|补充/.test(reply.content)) {
    review.passed = false;
    review.failureReasons.push("高风险场景缺少核实、审核、人工或补证路径");
    review.rewriteInstructions.push("补充核实、审核、人工或补证路径");
    review.finalAction = attempt >= MAX_REVIEW_ATTEMPTS ? "handoff" : "rewrite";
  }
  return {
    ...review,
    status: review.passed ? "completed" : review.finalAction === "handoff" ? "handoff_required" : "needs_rewrite",
    badcaseRiskTags: evaluateReplySafety(reply.content, "after_sales_reply").riskFlags
  };
}

async function runAfterSalesQaLoop(input: {
  structuredCase: StructuredCase;
  policyEvidence: PolicyEvidenceResult;
  riskStrategy: RiskStrategyResult;
  retrievalResult?: RetrievalResult;
}) {
  let rewriteInstructions: string[] = [];
  let replyDraft = await replyAgent(input.structuredCase, input.policyEvidence, input.riskStrategy, rewriteInstructions);
  let qaResult = await qaAgent(replyDraft, input.riskStrategy, 1, input);
  const attempts: NonNullable<QAResult["attempts"]> = [reviewAttempt(replyDraft.content, qaResult)];

  while (!qaResult.passed && qaResult.finalAction === "rewrite" && qaResult.currentAttempt < MAX_REVIEW_ATTEMPTS) {
    rewriteInstructions = qaResult.rewriteInstructions;
    replyDraft = await replyAgent(input.structuredCase, input.policyEvidence, input.riskStrategy, rewriteInstructions);
    qaResult = await qaAgent(replyDraft, input.riskStrategy, qaResult.currentAttempt + 1, input);
    attempts.push(reviewAttempt(replyDraft.content, qaResult));
  }

  return {
    replyDraft,
    qaResult: { ...qaResult, attempts }
  };
}

export function templateOutputAgent(input: { routeType: RouteDecision["routeType"]; content?: string; handoffReason?: string }): TemplateOutputResult {
  const templateType = input.routeType === "general_service" ? "general_service" : input.routeType === "after_sales" ? "after_sales" : input.routeType === "needs_clarification" ? "clarification" : "handoff";
  const renderedText = templateType === "handoff"
    ? "您好，当前情况需要人工进一步核实，正在为您转接人工客服，请稍候。"
    : input.content ?? "您好，为了准确处理您的问题，请补充商品信息、订单信息和具体诉求。";
  const validationErrors = evaluateReplySafety(renderedText, templateType === "general_service" ? "general_service_reply" : "after_sales_reply").failureReasons;
  const finalAction = templateType === "handoff" || validationErrors.length ? "handoff" : "send";
  const visibleStatus: VisibleStatus = finalAction === "handoff" ? "handoff" : templateType === "clarification" ? "needs_clarification" : "sent";
  return {
    visibleStatus,
    finalMessage: renderedText,
    templateType,
    renderedText,
    validationPassed: validationErrors.length === 0,
    validationErrors,
    safetyChecks: validationErrors.length ? validationErrors.map((term) => `命中风险表达：${term}`) : ["未命中禁止承诺", "已生成客户可见模板", "已保留必要限制说明"],
    finalAction,
    handoffReason: finalAction === "handoff" ? input.handoffReason ?? validationErrors.join("、") : undefined
  };
}

function node<T>(name: string, status: AgentNode<T>["status"], summary: string, output?: T): AgentNode<T> {
  return { name, status, summary, output };
}

function traceEvent(traceId: string, type: TraceEvent["type"], status: TraceEvent["status"], summary: string, payload?: unknown): TraceEvent {
  return { id: crypto.randomUUID(), traceId, type, status, summary, payload, createdAt: now() };
}

function ticketStatusFrom(routeType: RouteDecision["routeType"] | undefined, finalAction: TemplateOutputResult["finalAction"]): TicketStatus {
  if (finalAction === "handoff") return "handoff";
  if (routeType === "needs_clarification") return "needs_clarification";
  return "completed";
}

async function persistMemoryForOutput(input: {
  memory: ConversationMemoryRecord;
  messages: ConversationMessage[];
  templateOutput: TemplateOutputResult;
  routeType?: RouteDecision["routeType"];
  handoffReason?: string;
  missingFields?: string[];
}) {
  return saveConversationMemoryOutcome({
    memory: input.memory,
    messages: input.messages,
    finalMessage: input.templateOutput.finalMessage,
    finalAction: input.templateOutput.finalAction,
    routeType: input.routeType,
    handoffReason: input.handoffReason ?? input.templateOutput.handoffReason,
    missingFields: input.missingFields
  });
}

export async function runAgentGraph(input: { conversationId?: string; content: string; images?: string[]; history?: ConversationMessage[] }): Promise<AgentGraphState> {
  const traceId = `trace_${crypto.randomUUID()}`;
  const conversationId = input.conversationId ?? crypto.randomUUID();
  const ticketId = `T-${conversationId.slice(0, 8)}`;
  const userMessage: ConversationMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: input.content,
    images: input.images ?? [],
    createdAt: now()
  };
  const messages = [...(input.history ?? []), userMessage];
  const memory = await loadConversationMemory({ conversationId, ticketId, messages, history: input.history ?? [] });
  const structuredCase = await caseUnderstandingAgent(messages, memory);
  const guardrail = await ruleGuardrailAgent(structuredCase);
  const routeDecision = await queryRouterAgent(structuredCase, guardrail);
  const agents: AgentNode<unknown>[] = [
    node("Memory Agent", "completed", "已通过外挂 Memory Adapter 注入会话记忆与已采取措施", memory),
    node("Case Understanding Agent", "completed", structuredCase.issueSummary, structuredCase),
    node("Rule Guardrail Agent", guardrail.requiredHumanHandoff ? "handoff_required" : "completed", guardrail.guardrailReason, guardrail),
    node("Query Router Agent", "completed", `${routeDecision.routeType}：${routeDecision.rationale}`, routeDecision)
  ];
  const traceEvents: TraceEvent[] = [
    traceEvent(traceId, "memory.loaded", "completed", "已通过外挂 Memory Adapter 读取并注入会话记忆", memory),
    traceEvent(traceId, "case.structured", "completed", structuredCase.issueSummary, structuredCase),
    traceEvent(traceId, "guardrail.checked", guardrail.requiredHumanHandoff ? "handoff_required" : "completed", guardrail.guardrailReason, guardrail),
    traceEvent(traceId, "router.decided", "completed", `${routeDecision.routeType}：${routeDecision.rationale}`, routeDecision)
  ];
  const clarificationLoopExceeded = (structuredCase.clarificationRound ?? 0) >= 1 && structuredCase.missingFields.length > 0;

  if (routeDecision.routeType === "handoff_required") {
    const templateOutput = templateOutputAgent({ routeType: routeDecision.routeType, handoffReason: guardrail.guardrailReason });
    const updatedMemory = await persistMemoryForOutput({ memory, messages, templateOutput, routeType: routeDecision.routeType, handoffReason: guardrail.guardrailReason });
    agents.push(node("Human Handoff Agent", "handoff_required", guardrail.guardrailReason, templateOutput));
    agents.push(node("Template Output Agent", "completed", "已输出转人工模板", templateOutput));
    traceEvents.push(traceEvent(traceId, "handoff.started", "handoff_required", guardrail.guardrailReason, templateOutput));
    traceEvents.push(traceEvent(traceId, "template.validated", "completed", "已输出转人工模板", templateOutput));
    const graph: AgentGraphState = {
      traceId,
      conversationId,
      ticketId,
      messages,
      memory: updatedMemory,
      structuredCase,
      guardrail,
      routeDecision,
      templateOutput,
      visibleStatus: templateOutput.visibleStatus,
      finalMessage: templateOutput.finalMessage,
      finalReply: templateOutput.renderedText,
      finalAction: "handoff",
      ticketStatus: ticketStatusFrom(routeDecision.routeType, templateOutput.finalAction),
      handoffReason: guardrail.guardrailReason,
      traceEvents,
      agents
    };
    if (clarificationLoopExceeded) {
      await recordAutoBadcase({ graph, type: "clarification_loop_exceeded", note: "Clarification loop exceeded and router sent the case to handoff." });
    }
    return graph;
  }

  if (routeDecision.routeType === "needs_clarification") {
    if (clarificationLoopExceeded) {
      const handoffReason = "连续两轮信息仍不足，转人工避免重复追问";
      const templateOutput = templateOutputAgent({ routeType: "handoff_required", handoffReason });
      const updatedMemory = await persistMemoryForOutput({ memory, messages, templateOutput, routeType: routeDecision.routeType, handoffReason, missingFields: structuredCase.missingFields });
      agents.push(node("Clarification Agent", "handoff_required", handoffReason, { requiredInfo: routeDecision.requiredInfo, missingFields: structuredCase.missingFields, previousMissingFields: structuredCase.previousMissingFields, resolvedMissingFields: structuredCase.resolvedMissingFields, newMissingFields: structuredCase.newMissingFields, clarificationRound: structuredCase.clarificationRound }));
      agents.push(node("Template Output Agent", "completed", "连续澄清超限，输出转人工模板", templateOutput));
      traceEvents.push(traceEvent(traceId, "branch.generated", "handoff_required", handoffReason, { requiredInfo: routeDecision.requiredInfo, missingFields: structuredCase.missingFields, previousMissingFields: structuredCase.previousMissingFields, resolvedMissingFields: structuredCase.resolvedMissingFields, newMissingFields: structuredCase.newMissingFields, clarificationRound: structuredCase.clarificationRound }));
      traceEvents.push(traceEvent(traceId, "handoff.started", "handoff_required", handoffReason, templateOutput));
      const graph: AgentGraphState = {
        traceId,
        conversationId,
        ticketId,
        messages,
        memory: updatedMemory,
        structuredCase,
        guardrail,
        routeDecision,
        templateOutput,
        visibleStatus: templateOutput.visibleStatus,
        finalMessage: templateOutput.finalMessage,
        finalReply: templateOutput.renderedText,
        finalAction: "handoff",
        ticketStatus: "handoff",
        handoffReason,
        traceEvents,
        agents
      };
      await recordAutoBadcase({ graph, type: "clarification_loop_exceeded", note: handoffReason });
      return graph;
    }
    const remainingFields = routeDecision.requiredInfo.length ? routeDecision.requiredInfo : structuredCase.missingFields;
    const resolvedText = structuredCase.resolvedMissingFields?.length ? `已收到您补充的${structuredCase.resolvedMissingFields.join("、")}。` : "";
    const content = `您好，${resolvedText}为了准确处理您的问题，请补充：${remainingFields.length ? remainingFields.join("、") : "具体问题"}。`;
    const templateOutput = templateOutputAgent({ routeType: routeDecision.routeType, content });
    const updatedMemory = await persistMemoryForOutput({ memory, messages, templateOutput, routeType: routeDecision.routeType, missingFields: routeDecision.requiredInfo });
    agents.push(node("Clarification Agent", "completed", "已生成补充信息回复", { content, requiredInfo: remainingFields, previousMissingFields: structuredCase.previousMissingFields, resolvedMissingFields: structuredCase.resolvedMissingFields, newMissingFields: structuredCase.newMissingFields, clarificationRound: structuredCase.clarificationRound }));
    agents.push(node("Template Output Agent", "completed", "补充信息模板校验通过", templateOutput));
    traceEvents.push(traceEvent(traceId, "branch.generated", "completed", "已生成补充信息回复", { content, requiredInfo: remainingFields, previousMissingFields: structuredCase.previousMissingFields, resolvedMissingFields: structuredCase.resolvedMissingFields, newMissingFields: structuredCase.newMissingFields, clarificationRound: structuredCase.clarificationRound }));
    traceEvents.push(traceEvent(traceId, "template.validated", "completed", "补充信息模板校验通过", templateOutput));
    traceEvents.push(traceEvent(traceId, templateOutput.finalAction === "handoff" ? "handoff.started" : "message.sent", templateOutput.finalAction === "handoff" ? "handoff_required" : "completed", templateOutput.finalMessage, templateOutput));
    return {
      traceId,
      conversationId,
      ticketId,
      messages,
      memory: updatedMemory,
      structuredCase,
      guardrail,
      routeDecision,
      templateOutput,
      visibleStatus: templateOutput.visibleStatus,
      finalMessage: templateOutput.finalMessage,
      finalReply: templateOutput.renderedText,
      finalAction: templateOutput.finalAction,
      ticketStatus: ticketStatusFrom(routeDecision.routeType, templateOutput.finalAction),
      traceEvents,
      agents
    };
  }

  if (routeDecision.routeType === "general_service") {
    const generalCategory = categoryFromCase(structuredCase);
    const initialRetrievalResult = await buildKnowledgeIndexRetrievalResult({
      structuredCase,
      knowledgeBase: "general",
      fallbackCategory: generalCategory
    });
    let generalService = await generalServiceAgent(structuredCase, initialRetrievalResult);
    const retrievalResult = await buildGeneralRetrievalResult(structuredCase, generalService, initialRetrievalResult);
    let reviewLoop = reviewText(generalService.answer, "general_service_reply", 1);
    if (!reviewLoop.passed && reviewLoop.finalAction === "rewrite") {
      generalService.answer = `${generalService.answer} 如仍无法确认，我会为您转人工继续核实。`;
      reviewLoop = reviewText(generalService.answer, "general_service_reply", 2);
    }
    const reviewedGeneral = await runGeneralReviewLoop({ structuredCase, retrievalResult, initialService: generalService });
    generalService = reviewedGeneral.generalService;
    reviewLoop = reviewedGeneral.reviewLoop;
    const templateOutput = templateOutputAgent({ routeType: reviewLoop.finalAction === "handoff" ? "handoff_required" : routeDecision.routeType, content: generalService.answer });
    const handoffReason = templateOutput.finalAction === "handoff" ? "普通客服审核或模板校验未通过" : undefined;
    const updatedMemory = await persistMemoryForOutput({ memory, messages, templateOutput, routeType: routeDecision.routeType, handoffReason });
    agents.push(node("General Service Agent", "completed", `命中 ${generalService.retrievedKnowledge.length} 条普通客服知识`, generalService));
    agents.push(node("General Review Agent", reviewLoop.passed ? "completed" : "handoff_required", reviewLoop.passed ? "普通回复审核通过" : "普通回复审核超限，转人工", reviewLoop));
    agents.push(node("Template Output Agent", templateOutput.validationPassed ? "completed" : "handoff_required", "已完成普通客服模板校验", templateOutput));
    traceEvents.push(traceEvent(traceId, "rag.retrieved", retrievalResult.insufficientGrounding ? "needs_rewrite" : "completed", `命中 ${retrievalResult.rerankedTopK.length} 条普通客服知识，grounding=${retrievalResult.groundingConfidence.toFixed(2)}`, retrievalResult));
    traceEvents.push(traceEvent(traceId, "branch.generated", "completed", "已生成普通客服候选回复", generalService));
    traceEvents.push(traceEvent(traceId, "review.completed", reviewLoop.passed ? "completed" : "handoff_required", reviewLoop.passed ? "普通回复审核通过" : "普通回复审核超限，转人工", reviewLoop));
    traceEvents.push(traceEvent(traceId, "template.validated", templateOutput.validationPassed ? "completed" : "handoff_required", "已完成普通客服模板校验", templateOutput));
    traceEvents.push(traceEvent(traceId, templateOutput.finalAction === "handoff" ? "handoff.started" : "message.sent", templateOutput.finalAction === "handoff" ? "handoff_required" : "completed", templateOutput.finalMessage, templateOutput));
    return {
      traceId,
      conversationId,
      ticketId,
      messages,
      memory: updatedMemory,
      structuredCase,
      guardrail,
      routeDecision,
      retrievalResult,
      generalService,
      reviewLoop,
      templateOutput,
      visibleStatus: templateOutput.visibleStatus,
      finalMessage: templateOutput.finalMessage,
      finalReply: templateOutput.renderedText,
      finalAction: templateOutput.finalAction,
      ticketStatus: ticketStatusFrom(routeDecision.routeType, templateOutput.finalAction),
      handoffReason,
      traceEvents,
      agents
    };
  }

  const initialRetrievalResult = await buildKnowledgeIndexRetrievalResult({
    structuredCase,
    knowledgeBase: "after_sales"
  });
  const [policyEvidence, riskStrategy] = await Promise.all([
    policyEvidenceAgent(structuredCase, initialRetrievalResult),
    riskStrategyAgent(structuredCase, guardrail)
  ]);
  const retrievalResult = await buildAfterSalesRetrievalResult(structuredCase, policyEvidence, initialRetrievalResult);
  if (retrievalResult.insufficientGrounding) {
    policyEvidence.uncertainty.push("RAG grounding 不足，回复不得引用具体规则结论");
  }
  const { replyDraft, qaResult } = await runAfterSalesQaLoop({ structuredCase, policyEvidence, riskStrategy, retrievalResult });
  const finalRoute = riskStrategy.handoffRequired || qaResult.finalAction === "handoff" ? "handoff_required" : routeDecision.routeType;
  const templateOutput = templateOutputAgent({ routeType: finalRoute, content: replyDraft.content, handoffReason: riskStrategy.handoffReason });
  const handoffReason = templateOutput.finalAction === "handoff" ? riskStrategy.handoffReason ?? "审核循环超限或模板校验未通过" : undefined;
  const updatedMemory = await persistMemoryForOutput({ memory, messages, templateOutput, routeType: routeDecision.routeType, handoffReason });
  agents.push(node("Policy & Evidence Agent", "completed", `命中 ${policyEvidence.ruleHits.length} 条规则，证据充分度：${policyEvidence.evidenceSufficiency}`, policyEvidence));
  agents.push(node("Risk & Strategy Agent", riskStrategy.handoffRequired ? "handoff_required" : "completed", `${riskStrategy.riskLevel} 风险：${riskStrategy.rationale}`, riskStrategy));
  agents.push(node("Reply Agent", "completed", "已生成售后候选回复", replyDraft));
  agents.push(node("QA Agent", qaResult.status, qaResult.passed ? "售后质检通过" : "售后质检未通过或转人工", qaResult));
  agents.push(node("Template Output Agent", templateOutput.validationPassed ? "completed" : "handoff_required", "已完成售后模板校验", templateOutput));
  traceEvents.push(traceEvent(traceId, "rag.retrieved", retrievalResult.insufficientGrounding ? "needs_rewrite" : "completed", `命中 ${retrievalResult.rerankedTopK.length} 条售后规则，grounding=${retrievalResult.groundingConfidence.toFixed(2)}`, retrievalResult));
  traceEvents.push(traceEvent(traceId, "branch.generated", "completed", "已生成售后候选回复", { policyEvidence, riskStrategy, replyDraft }));
  traceEvents.push(traceEvent(traceId, "qa.completed", qaResult.status, qaResult.passed ? "售后质检通过" : "售后质检未通过或转人工", qaResult));
  traceEvents.push(traceEvent(traceId, "template.validated", templateOutput.validationPassed ? "completed" : "handoff_required", "已完成售后模板校验", templateOutput));
  traceEvents.push(traceEvent(traceId, templateOutput.finalAction === "handoff" ? "handoff.started" : "message.sent", templateOutput.finalAction === "handoff" ? "handoff_required" : "completed", templateOutput.finalMessage, templateOutput));

  return {
    traceId,
    conversationId,
    ticketId,
    messages,
    memory: updatedMemory,
    structuredCase,
    guardrail,
    routeDecision,
    retrievalResult,
    policyEvidence,
    riskStrategy,
    replyDraft,
    qaResult,
    templateOutput,
    visibleStatus: templateOutput.visibleStatus,
    finalMessage: templateOutput.finalMessage,
    finalReply: templateOutput.renderedText,
    finalAction: templateOutput.finalAction,
    ticketStatus: ticketStatusFrom(routeDecision.routeType, templateOutput.finalAction),
    handoffReason,
    traceEvents,
    agents
  };
}
