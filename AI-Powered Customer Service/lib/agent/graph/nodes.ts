import {
  buildAfterSalesRetrievalResult,
  buildGeneralRetrievalResult
} from "../../rag/service";
import { saveAutoBadcase } from "../../store/badcase";
import type {
  AgentGraphState,
  AgentNode,
  BadcaseHit,
  ConversationMemoryRecord,
  ConversationMessage,
  ExampleHit,
  GeneralServiceResult,
  GuardrailResult,
  PolicyEvidenceResult,
  QAResult,
  ReplyDraft,
  ReplyTemplate,
  RetrievalResult,
  ReviewLoopState,
  RiskStrategyResult,
  RouteDecision,
  StructuredCase,
  TemplateOutputResult,
  TicketStatus,
  TraceEvent
} from "../../types";
import { routeByDecision, type WorkflowBranch } from "./edges";
import {
  createInputWorkflowState,
  executeWorkflowNode,
  mergeWorkflowState,
  requireAgentGraphState,
  type AgentWorkflowState,
  type GraphInput,
  type WorkflowStatePatch
} from "./state";
import {
  badcaseLookupTool,
  exampleRetrieveTool,
  knowledgeRagTool,
  memoryReadTool,
  memoryWriteTool,
  ruleRagTool,
  templateRetrieveTool
} from "./tools";

export type CustomerServiceGraphDeps = {
  caseUnderstandingAgent: (messages: ConversationMessage[], memory: ConversationMemoryRecord) => Promise<StructuredCase>;
  ruleGuardrailAgent: (structuredCase: StructuredCase) => Promise<GuardrailResult>;
  queryRouterAgent: (structuredCase: StructuredCase, guardrail: GuardrailResult) => Promise<RouteDecision>;
  categoryFromCase: (structuredCase: StructuredCase) => GeneralServiceResult["category"];
  generalServiceAgent: (structuredCase: StructuredCase, retrievalResult?: RetrievalResult, rewriteInstructions?: string[]) => Promise<GeneralServiceResult>;
  reviewText: (content: string, target: ReviewLoopState["target"], attempt: number) => ReviewLoopState;
  runGeneralReviewLoop: (input: {
    structuredCase: StructuredCase;
    retrievalResult?: RetrievalResult;
    initialService: GeneralServiceResult;
  }) => Promise<{ generalService: GeneralServiceResult; reviewLoop: ReviewLoopState }>;
  policyEvidenceAgent: (structuredCase: StructuredCase, retrievalResult?: RetrievalResult) => Promise<PolicyEvidenceResult>;
  riskStrategyAgent: (structuredCase: StructuredCase, guardrail: GuardrailResult) => Promise<RiskStrategyResult>;
  replyAgent: (
    structuredCase: StructuredCase,
    policy: PolicyEvidenceResult,
    risk: RiskStrategyResult,
    rewriteInstructions?: string[],
    context?: { selectedTemplate?: ReplyTemplate; replyExamples?: ExampleHit[] }
  ) => Promise<ReplyDraft>;
  qaAgent: (reply: ReplyDraft, risk: RiskStrategyResult, attempt: number, context?: {
    structuredCase?: StructuredCase;
    policyEvidence?: PolicyEvidenceResult;
    retrievalResult?: RetrievalResult;
    badcaseHits?: BadcaseHit[];
  }) => Promise<QAResult>;
  templateOutputAgent: (input: { routeType: RouteDecision["routeType"]; content?: string; handoffReason?: string }) => TemplateOutputResult;
};

export type RoutedGraphContext = AgentWorkflowState & {
  memory: ConversationMemoryRecord;
  structuredCase: StructuredCase;
  guardrail: GuardrailResult;
  routeDecision: RouteDecision;
  branch: WorkflowBranch;
  clarificationLoopExceeded: boolean;
};

type AfterSalesStrategyContext = RoutedGraphContext & {
  retrievalResult: RetrievalResult;
  policyEvidence: PolicyEvidenceResult;
  riskStrategy: RiskStrategyResult;
  similarExamples: ExampleHit[];
};

type AfterSalesReplyContext = AfterSalesStrategyContext & {
  selectedTemplate: ReplyTemplate;
  replyExamples: ExampleHit[];
  replyDraft: ReplyDraft;
};

type AfterSalesQaContext = AfterSalesReplyContext & {
  badcaseHits: BadcaseHit[];
  qaResult: QAResult;
};

type GeneralServiceContext = RoutedGraphContext & {
  retrievalResult: RetrievalResult;
  generalService: GeneralServiceResult;
};

type GeneralReviewContext = GeneralServiceContext & {
  reviewLoop: ReviewLoopState;
  badcaseHits: BadcaseHit[];
  llmJudge: {
    passed: boolean;
    failureReasons: string[];
    rewriteInstructions: string[];
    finalAction: ReviewLoopState["finalAction"];
    judgeSource?: ReviewLoopState["judgeSource"];
    judgeError?: string;
  };
};

const now = () => new Date().toISOString();

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

function qaAttempt(content: string, review: QAResult): NonNullable<QAResult["attempts"]>[number] {
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

async function persistMemoryForOutput(input: {
  memory: ConversationMemoryRecord;
  messages: ConversationMessage[];
  templateOutput: TemplateOutputResult;
  routeType?: RouteDecision["routeType"];
  handoffReason?: string;
  missingFields?: string[];
}) {
  const result = await memoryWriteTool({
    memory: input.memory,
    messages: input.messages,
    finalMessage: input.templateOutput.finalMessage,
    finalAction: input.templateOutput.finalAction,
    routeType: input.routeType,
    handoffReason: input.handoffReason ?? input.templateOutput.handoffReason,
    missingFields: input.missingFields
  });
  return result.output;
}

export function requireRoutedGraphContext(state: AgentWorkflowState): RoutedGraphContext {
  if (!state.memory || !state.structuredCase || !state.guardrail || !state.routeDecision || !state.branch || state.clarificationLoopExceeded === undefined) {
    throw new Error("Context & Routing node did not produce a complete routed graph context.");
  }
  return state as RoutedGraphContext;
}

function requireMemoryContext(state: AgentWorkflowState): AgentWorkflowState & { memory: ConversationMemoryRecord } {
  if (!state.memory) {
    throw new Error("Memory Read node did not produce memory.");
  }
  return state as AgentWorkflowState & { memory: ConversationMemoryRecord };
}

function requireStructuredCaseContext(state: AgentWorkflowState): AgentWorkflowState & { memory: ConversationMemoryRecord; structuredCase: StructuredCase } {
  const context = requireMemoryContext(state);
  if (!context.structuredCase) {
    throw new Error("Case Understanding node did not produce structuredCase.");
  }
  return context as AgentWorkflowState & { memory: ConversationMemoryRecord; structuredCase: StructuredCase };
}

function requireGuardrailContext(state: AgentWorkflowState): AgentWorkflowState & { memory: ConversationMemoryRecord; structuredCase: StructuredCase; guardrail: GuardrailResult } {
  const context = requireStructuredCaseContext(state);
  if (!context.guardrail) {
    throw new Error("Rule Guardrail node did not produce guardrail.");
  }
  return context as AgentWorkflowState & { memory: ConversationMemoryRecord; structuredCase: StructuredCase; guardrail: GuardrailResult };
}

export function requireGeneralServiceContext(state: AgentWorkflowState): GeneralServiceContext {
  const context = requireRoutedGraphContext(state);
  if (!context.retrievalResult || !context.generalService) {
    throw new Error("General Service Agent node did not produce a complete general service context.");
  }
  return context as GeneralServiceContext;
}

export function requireGeneralReviewContext(state: AgentWorkflowState): GeneralReviewContext {
  const context = requireGeneralServiceContext(state);
  if (!context.reviewLoop || !context.badcaseHits || !context.llmJudge) {
    throw new Error("General Review / QA node did not produce a complete general review context.");
  }
  return context as GeneralReviewContext;
}

export function requireAfterSalesStrategyContext(state: AgentWorkflowState): AfterSalesStrategyContext {
  const context = requireRoutedGraphContext(state);
  if (!context.retrievalResult || !context.policyEvidence || !context.riskStrategy || !context.similarExamples) {
    throw new Error("After-Sales Strategy node did not produce a complete strategy context.");
  }
  return context as AfterSalesStrategyContext;
}

export function requireAfterSalesReplyContext(state: AgentWorkflowState): AfterSalesReplyContext {
  const context = requireAfterSalesStrategyContext(state);
  if (!context.selectedTemplate || !context.replyExamples || !context.replyDraft) {
    throw new Error("After-Sales Reply node did not produce a complete reply context.");
  }
  return context as AfterSalesReplyContext;
}

export function requireAfterSalesQaContext(state: AgentWorkflowState): AfterSalesQaContext {
  const context = requireAfterSalesReplyContext(state);
  if (!context.badcaseHits || !context.qaResult) {
    throw new Error("After-Sales QA node did not produce a complete QA context.");
  }
  return context as AfterSalesQaContext;
}

export async function runMemoryReadPatchNode(state: AgentWorkflowState): Promise<WorkflowStatePatch> {
  const history = state.messages.slice(0, -1);
  const memoryTool = await memoryReadTool({
    conversationId: state.conversationId,
    ticketId: state.ticketId,
    messages: state.messages,
    history
  });
  const memory = memoryTool.output;

  return {
    memory,
    traceEvents: [
      traceEvent(state.traceId, "memory.loaded", "completed", "已通过 Memory Adapter 读取会话记忆", memory),
      traceEvent(state.traceId, "tool.called", "completed", memoryTool.summary, { tool: memoryTool.tool })
    ],
    agents: [
      node("Memory Read Node", "completed", "memory.read completed", {
        memory,
        tools: [memoryTool.tool]
      })
    ]
  };
}

export async function runCaseUnderstandingPatchNode(state: AgentWorkflowState, deps: CustomerServiceGraphDeps): Promise<WorkflowStatePatch> {
  const context = requireMemoryContext(state);
  const structuredCase = await deps.caseUnderstandingAgent(context.messages, context.memory);

  return {
    structuredCase,
    traceEvents: [
      traceEvent(state.traceId, "case.structured", "completed", structuredCase.issueSummary, structuredCase)
    ],
    agents: [
      node("Case Understanding Node", "completed", structuredCase.issueSummary, {
        structuredCase,
        tools: ["llm.structuredOutput"]
      })
    ]
  };
}

export async function runRuleGuardrailPatchNode(state: AgentWorkflowState, deps: CustomerServiceGraphDeps): Promise<WorkflowStatePatch> {
  const context = requireStructuredCaseContext(state);
  const guardrail = await deps.ruleGuardrailAgent(context.structuredCase);

  return {
    guardrail,
    traceEvents: [
      traceEvent(state.traceId, "guardrail.checked", guardrail.requiredHumanHandoff ? "handoff_required" : "completed", guardrail.guardrailReason, guardrail)
    ],
    agents: [
      node("Rule Guardrail Node", guardrail.requiredHumanHandoff ? "handoff_required" : "completed", guardrail.guardrailReason, {
        guardrail
      })
    ]
  };
}

export async function runQueryRouterPatchNode(state: AgentWorkflowState, deps: CustomerServiceGraphDeps): Promise<WorkflowStatePatch> {
  const context = requireGuardrailContext(state);
  const routeDecision = await deps.queryRouterAgent(context.structuredCase, context.guardrail);
  const branch = routeByDecision(routeDecision);

  return {
    routeDecision,
    branch,
    clarificationLoopExceeded: (context.structuredCase.clarificationRound ?? 0) >= 1 && context.structuredCase.missingFields.length > 0,
    traceEvents: [
      traceEvent(state.traceId, "router.decided", "completed", `${routeDecision.routeType}: ${routeDecision.rationale}`, routeDecision)
    ],
    agents: [
      node("Query Router Node", "completed", `route=${routeDecision.routeType}; branch=${branch}`, {
        routeDecision,
        branch,
        tools: ["llm.structuredOutput"]
      })
    ]
  };
}

export async function runContextRoutingPatchNode(state: AgentWorkflowState, deps: CustomerServiceGraphDeps): Promise<WorkflowStatePatch> {
  let current = state;
  const initialTraceCount = state.traceEvents.length;
  const initialAgentCount = state.agents.length;

  current = mergeWorkflowState(current, await runMemoryReadPatchNode(current));
  current = mergeWorkflowState(current, await runCaseUnderstandingPatchNode(current, deps));
  current = mergeWorkflowState(current, await runRuleGuardrailPatchNode(current, deps));
  current = mergeWorkflowState(current, await runQueryRouterPatchNode(current, deps));

  const context = requireRoutedGraphContext(current);

  return {
    memory: context.memory,
    structuredCase: context.structuredCase,
    guardrail: context.guardrail,
    routeDecision: context.routeDecision,
    branch: context.branch,
    clarificationLoopExceeded: context.clarificationLoopExceeded,
    traceEvents: current.traceEvents.slice(initialTraceCount),
    agents: current.agents.slice(initialAgentCount)
  };
}

export async function runContextRoutingNode(input: GraphInput, deps: CustomerServiceGraphDeps): Promise<RoutedGraphContext> {
  const routedState = await executeWorkflowNode(
    createInputWorkflowState(input),
    (state) => runContextRoutingPatchNode(state, deps)
  );
  return requireRoutedGraphContext(routedState);
}

export async function runHumanHandoffPatchNode(state: AgentWorkflowState, deps: CustomerServiceGraphDeps): Promise<WorkflowStatePatch> {
  const context = requireRoutedGraphContext(state);
  const templateOutput = deps.templateOutputAgent({ routeType: context.routeDecision.routeType, handoffReason: context.guardrail.guardrailReason });
  const updatedMemory = await persistMemoryForOutput({
    memory: context.memory,
    messages: context.messages,
    templateOutput,
    routeType: context.routeDecision.routeType,
    handoffReason: context.guardrail.guardrailReason
  });

  const patch: WorkflowStatePatch = {
    memory: updatedMemory,
    templateOutput,
    visibleStatus: templateOutput.visibleStatus,
    finalMessage: templateOutput.finalMessage,
    finalReply: templateOutput.renderedText,
    finalAction: "handoff",
    ticketStatus: ticketStatusFrom(context.routeDecision.routeType, templateOutput.finalAction),
    handoffReason: context.guardrail.guardrailReason,
    agents: [
      node("Human Handoff Agent", "handoff_required", context.guardrail.guardrailReason, templateOutput),
      node("Template Output Agent", "completed", "已输出转人工模板", templateOutput)
    ],
    traceEvents: [
      traceEvent(context.traceId, "handoff.started", "handoff_required", context.guardrail.guardrailReason, templateOutput),
      traceEvent(context.traceId, "template.validated", "completed", "已输出转人工模板", templateOutput)
    ]
  };

  if (context.clarificationLoopExceeded) {
    const graph = requireAgentGraphState(mergeWorkflowState(context, patch));
    await recordAutoBadcase({ graph, type: "clarification_loop_exceeded", note: "Clarification loop exceeded and router sent the case to handoff." });
  }
  return patch;
}

export async function runHumanHandoffNode(context: RoutedGraphContext, deps: CustomerServiceGraphDeps): Promise<AgentGraphState> {
  const state = await executeWorkflowNode(context, (current) => runHumanHandoffPatchNode(current, deps));
  return requireAgentGraphState(state);
}

export async function runClarificationPatchNode(state: AgentWorkflowState, deps: CustomerServiceGraphDeps): Promise<WorkflowStatePatch> {
  const context = requireRoutedGraphContext(state);
  if (context.clarificationLoopExceeded) {
    const handoffReason = "连续两轮信息仍不足，转人工避免重复追问";
    const templateOutput = deps.templateOutputAgent({ routeType: "handoff_required", handoffReason });
    const updatedMemory = await persistMemoryForOutput({
      memory: context.memory,
      messages: context.messages,
      templateOutput,
      routeType: context.routeDecision.routeType,
      handoffReason,
      missingFields: context.structuredCase.missingFields
    });
    const clarificationOutput = {
      requiredInfo: context.routeDecision.requiredInfo,
      missingFields: context.structuredCase.missingFields,
      previousMissingFields: context.structuredCase.previousMissingFields,
      resolvedMissingFields: context.structuredCase.resolvedMissingFields,
      newMissingFields: context.structuredCase.newMissingFields,
      clarificationRound: context.structuredCase.clarificationRound
    };

    const patch: WorkflowStatePatch = {
      memory: updatedMemory,
      templateOutput,
      visibleStatus: templateOutput.visibleStatus,
      finalMessage: templateOutput.finalMessage,
      finalReply: templateOutput.renderedText,
      finalAction: "handoff",
      ticketStatus: "handoff",
      handoffReason,
      agents: [
        node("Clarification Agent", "handoff_required", handoffReason, clarificationOutput),
        node("Template Output Agent", "completed", "连续澄清超限，输出转人工模板", templateOutput)
      ],
      traceEvents: [
        traceEvent(context.traceId, "branch.generated", "handoff_required", handoffReason, clarificationOutput),
        traceEvent(context.traceId, "handoff.started", "handoff_required", handoffReason, templateOutput)
      ]
    };

    const graph = requireAgentGraphState(mergeWorkflowState(context, patch));
    await recordAutoBadcase({ graph, type: "clarification_loop_exceeded", note: handoffReason });
    return patch;
  }

  const remainingFields = context.routeDecision.requiredInfo.length ? context.routeDecision.requiredInfo : context.structuredCase.missingFields;
  const resolvedText = context.structuredCase.resolvedMissingFields?.length ? `已收到您补充的${context.structuredCase.resolvedMissingFields.join("、")}。` : "";
  const content = `您好，${resolvedText}为了准确处理您的问题，请补充：${remainingFields.length ? remainingFields.join("、") : "具体问题"}。`;
  const templateOutput = deps.templateOutputAgent({ routeType: context.routeDecision.routeType, content });
  const updatedMemory = await persistMemoryForOutput({
    memory: context.memory,
    messages: context.messages,
    templateOutput,
    routeType: context.routeDecision.routeType,
    missingFields: context.routeDecision.requiredInfo
  });
  const clarificationOutput = {
    content,
    requiredInfo: remainingFields,
    previousMissingFields: context.structuredCase.previousMissingFields,
    resolvedMissingFields: context.structuredCase.resolvedMissingFields,
    newMissingFields: context.structuredCase.newMissingFields,
    clarificationRound: context.structuredCase.clarificationRound
  };

  return {
    memory: updatedMemory,
    templateOutput,
    visibleStatus: templateOutput.visibleStatus,
    finalMessage: templateOutput.finalMessage,
    finalReply: templateOutput.renderedText,
    finalAction: templateOutput.finalAction,
    ticketStatus: ticketStatusFrom(context.routeDecision.routeType, templateOutput.finalAction),
    agents: [
      node("Clarification Agent", "completed", "已生成补充信息回复", clarificationOutput),
      node("Template Output Agent", "completed", "补充信息模板校验通过", templateOutput)
    ],
    traceEvents: [
      traceEvent(context.traceId, "branch.generated", "completed", "已生成补充信息回复", clarificationOutput),
      traceEvent(context.traceId, "template.validated", "completed", "补充信息模板校验通过", templateOutput),
      traceEvent(
        context.traceId,
        templateOutput.finalAction === "handoff" ? "handoff.started" : "message.sent",
        templateOutput.finalAction === "handoff" ? "handoff_required" : "completed",
        templateOutput.finalMessage,
        templateOutput
      )
    ]
  };
}

export async function runClarificationNode(context: RoutedGraphContext, deps: CustomerServiceGraphDeps): Promise<AgentGraphState> {
  const state = await executeWorkflowNode(context, (current) => runClarificationPatchNode(current, deps));
  return requireAgentGraphState(state);
}

export async function runGeneralServiceAgentPatchNode(state: AgentWorkflowState, deps: CustomerServiceGraphDeps): Promise<WorkflowStatePatch> {
  const context = requireRoutedGraphContext(state);
  const generalCategory = deps.categoryFromCase(context.structuredCase);
  const knowledgeTool = await knowledgeRagTool({
    structuredCase: context.structuredCase,
    fallbackCategory: generalCategory
  });
  const initialRetrievalResult = knowledgeTool.output;
  const initialService = await deps.generalServiceAgent(context.structuredCase, initialRetrievalResult);
  const retrievalResult = await buildGeneralRetrievalResult(context.structuredCase, initialService, initialRetrievalResult);
  let generalService = initialService;
  const firstReview = deps.reviewText(generalService.answer, "general_service_reply", 1);
  if (!firstReview.passed && firstReview.finalAction === "rewrite") {
    generalService = {
      ...generalService,
      answer: `${generalService.answer} 如仍无法确认，我会为您转人工继续核实。`
    };
  }

  return {
    retrievalResult,
    generalService,
    agents: [
      node("General Service Agent", "completed", `命中 ${generalService.retrievedKnowledge.length} 条普通客服知识`, generalService)
    ],
    traceEvents: [
      traceEvent(context.traceId, "rag.retrieved", retrievalResult.insufficientGrounding ? "needs_rewrite" : "completed", `命中 ${retrievalResult.rerankedTopK.length} 条普通客服知识，grounding=${retrievalResult.groundingConfidence.toFixed(2)}`, retrievalResult),
      traceEvent(context.traceId, "tool.called", "completed", knowledgeTool.summary, { tool: knowledgeTool.tool, retrievalResult: knowledgeTool.output })
    ]
  };
}

export async function runGeneralServiceAgentNode(context: RoutedGraphContext, deps: CustomerServiceGraphDeps): Promise<GeneralServiceContext> {
  const state = await executeWorkflowNode(context, (current) => runGeneralServiceAgentPatchNode(current, deps));
  return requireGeneralServiceContext(state);
}

export async function runGeneralReviewQaPatchNode(state: AgentWorkflowState, deps: CustomerServiceGraphDeps): Promise<WorkflowStatePatch> {
  const context = requireGeneralServiceContext(state);
  const reviewedGeneral = await deps.runGeneralReviewLoop({
    structuredCase: context.structuredCase,
    retrievalResult: context.retrievalResult,
    initialService: context.generalService
  });
  const generalService = reviewedGeneral.generalService;
  const reviewLoop = reviewedGeneral.reviewLoop;
  const badcaseTool = await badcaseLookupTool({ query: context.structuredCase.originalMessage, routeType: context.routeDecision.routeType });
  const badcaseHits = badcaseTool.output;
  const llmJudge = {
    passed: reviewLoop.passed,
    failureReasons: reviewLoop.failureReasons,
    rewriteInstructions: reviewLoop.rewriteInstructions,
    finalAction: reviewLoop.finalAction,
    judgeSource: reviewLoop.judgeSource,
    judgeError: reviewLoop.judgeError
  };

  return {
    generalService,
    reviewLoop,
    badcaseHits,
    llmJudge,
    agents: [
      node("Response Review / QA Node", reviewLoop.passed ? "completed" : "handoff_required", reviewLoop.passed ? "qa passed" : "qa needs handoff or rewrite", {
        reviewLoop,
        badcaseHits,
        llmJudge,
        tools: ["llm.judge", badcaseTool.tool]
      })
    ],
    traceEvents: [
      traceEvent(context.traceId, "tool.called", "completed", badcaseTool.summary, { tool: badcaseTool.tool, badcaseHits }),
      traceEvent(context.traceId, "tool.called", reviewLoop.passed ? "completed" : "handoff_required", "llm.judge 已完成普通客服回复质检", { tool: "llm.judge", llmJudge, attempts: reviewLoop.attempts }),
      traceEvent(context.traceId, "branch.generated", "completed", "已生成普通客服候选回复", generalService),
      traceEvent(context.traceId, "review.completed", reviewLoop.passed ? "completed" : "handoff_required", reviewLoop.passed ? "普通回复审核通过" : "普通回复审核超限，转人工", reviewLoop)
    ]
  };
}

export async function runGeneralReviewQaNode(context: GeneralServiceContext, deps: CustomerServiceGraphDeps): Promise<GeneralReviewContext> {
  const state = await executeWorkflowNode(context, (current) => runGeneralReviewQaPatchNode(current, deps));
  return requireGeneralReviewContext(state);
}

export async function runGeneralFinalizePatchNode(state: AgentWorkflowState, deps: CustomerServiceGraphDeps): Promise<WorkflowStatePatch> {
  const context = requireGeneralReviewContext(state);
  const templateOutput = deps.templateOutputAgent({
    routeType: context.reviewLoop.finalAction === "handoff" ? "handoff_required" : context.routeDecision.routeType,
    content: context.generalService.answer
  });
  const handoffReason = templateOutput.finalAction === "handoff" ? "普通客服审核或模板校验未通过" : undefined;
  const updatedMemory = await persistMemoryForOutput({
    memory: context.memory,
    messages: context.messages,
    templateOutput,
    routeType: context.routeDecision.routeType,
    handoffReason
  });

  return {
    memory: updatedMemory,
    templateOutput,
    visibleStatus: templateOutput.visibleStatus,
    finalMessage: templateOutput.finalMessage,
    finalReply: templateOutput.renderedText,
    finalAction: templateOutput.finalAction,
    ticketStatus: ticketStatusFrom(context.routeDecision.routeType, templateOutput.finalAction),
    handoffReason,
    agents: [
      node("Template Output Agent", templateOutput.validationPassed ? "completed" : "handoff_required", "已完成普通客服模板校验", templateOutput)
    ],
    traceEvents: [
      traceEvent(context.traceId, "template.validated", templateOutput.validationPassed ? "completed" : "handoff_required", "已完成普通客服模板校验", templateOutput),
      traceEvent(
        context.traceId,
        templateOutput.finalAction === "handoff" ? "handoff.started" : "message.sent",
        templateOutput.finalAction === "handoff" ? "handoff_required" : "completed",
        templateOutput.finalMessage,
        templateOutput
      )
    ]
  };
}

export async function runGeneralFinalizeNode(context: GeneralReviewContext, deps: CustomerServiceGraphDeps): Promise<AgentGraphState> {
  const state = await executeWorkflowNode(context, (current) => runGeneralFinalizePatchNode(current, deps));
  return requireAgentGraphState(state);
}

export async function runGeneralServiceNode(context: RoutedGraphContext, deps: CustomerServiceGraphDeps): Promise<AgentGraphState> {
  const serviceContext = await runGeneralServiceAgentNode(context, deps);
  const reviewContext = await runGeneralReviewQaNode(serviceContext, deps);
  return runGeneralFinalizeNode(reviewContext, deps);
}

export async function runAfterSalesStrategyPatchNode(state: AgentWorkflowState, deps: CustomerServiceGraphDeps): Promise<WorkflowStatePatch> {
  const context = requireRoutedGraphContext(state);
  const ruleTool = await ruleRagTool({ structuredCase: context.structuredCase });
  const initialRetrievalResult = ruleTool.output;
  const [policyEvidence, riskStrategy, strategyExamplesTool] = await Promise.all([
    deps.policyEvidenceAgent(context.structuredCase, initialRetrievalResult),
    deps.riskStrategyAgent(context.structuredCase, context.guardrail),
    exampleRetrieveTool({ structuredCase: context.structuredCase, routeType: "after_sales", purpose: "strategy" })
  ]);
  const similarExamples = strategyExamplesTool.output;
  const retrievalResult = await buildAfterSalesRetrievalResult(context.structuredCase, policyEvidence, initialRetrievalResult);
  if (retrievalResult.insufficientGrounding) {
    policyEvidence.uncertainty.push("RAG grounding 不足，回复不得引用具体规则结论");
  }

  return {
    retrievalResult,
    policyEvidence,
    riskStrategy,
    similarExamples,
    agents: [
      node("After-Sales Strategy Agent", riskStrategy.handoffRequired ? "handoff_required" : "completed", `${riskStrategy.riskLevel}; examples=${similarExamples.length}`, {
        policyEvidence,
        riskStrategy,
        similarExamples,
        tools: [ruleTool.tool, strategyExamplesTool.tool]
      })
    ],
    traceEvents: [
      traceEvent(context.traceId, "rag.retrieved", retrievalResult.insufficientGrounding ? "needs_rewrite" : "completed", `命中 ${retrievalResult.rerankedTopK.length} 条售后规则，grounding=${retrievalResult.groundingConfidence.toFixed(2)}`, retrievalResult),
      traceEvent(context.traceId, "tool.called", "completed", ruleTool.summary, { tool: ruleTool.tool, retrievalResult: ruleTool.output }),
      traceEvent(context.traceId, "tool.called", "completed", strategyExamplesTool.summary, { tool: strategyExamplesTool.tool, examples: similarExamples })
    ]
  };
}

export async function runAfterSalesStrategyNode(context: RoutedGraphContext, deps: CustomerServiceGraphDeps): Promise<AfterSalesStrategyContext> {
  const state = await executeWorkflowNode(context, (current) => runAfterSalesStrategyPatchNode(current, deps));
  return requireAfterSalesStrategyContext(state);
}

export async function runAfterSalesReplyPatchNode(state: AgentWorkflowState, deps: CustomerServiceGraphDeps): Promise<WorkflowStatePatch> {
  const context = requireAfterSalesStrategyContext(state);
  const [templateTool, replyExamplesTool] = await Promise.all([
    templateRetrieveTool({ routeType: context.routeDecision.routeType, riskLevel: context.riskStrategy.riskLevel }),
    exampleRetrieveTool({ structuredCase: context.structuredCase, routeType: "after_sales", purpose: "reply" })
  ]);
  const selectedTemplate = templateTool.output;
  const replyExamples = replyExamplesTool.output;
  const replyDraft = await deps.replyAgent(context.structuredCase, context.policyEvidence, context.riskStrategy, [], {
    selectedTemplate,
    replyExamples
  });

  return {
    selectedTemplate,
    replyExamples,
    replyDraft,
    agents: [
      node("After-Sales Reply Agent", "completed", `template=${selectedTemplate.id}; examples=${replyExamples.length}`, {
        replyDraft,
        selectedTemplate,
        replyExamples,
        tools: [templateTool.tool, replyExamplesTool.tool]
      })
    ],
    traceEvents: [
      traceEvent(context.traceId, "tool.called", "completed", templateTool.summary, { tool: templateTool.tool, template: selectedTemplate }),
      traceEvent(context.traceId, "tool.called", "completed", replyExamplesTool.summary, { tool: replyExamplesTool.tool, examples: replyExamples }),
      traceEvent(context.traceId, "branch.generated", "completed", "已生成售后候选回复", { policyEvidence: context.policyEvidence, riskStrategy: context.riskStrategy, replyDraft })
    ]
  };
}

export async function runAfterSalesReplyNode(context: AfterSalesStrategyContext, deps: CustomerServiceGraphDeps): Promise<AfterSalesReplyContext> {
  const state = await executeWorkflowNode(context, (current) => runAfterSalesReplyPatchNode(current, deps));
  return requireAfterSalesReplyContext(state);
}

export async function runAfterSalesQaPatchNode(state: AgentWorkflowState, deps: CustomerServiceGraphDeps): Promise<WorkflowStatePatch> {
  const context = requireAfterSalesReplyContext(state);
  const badcaseTool = await badcaseLookupTool({ query: context.structuredCase.originalMessage, routeType: context.routeDecision.routeType });
  const badcaseHits = badcaseTool.output;
  let replyDraft = context.replyDraft;
  let qaResult = await deps.qaAgent(replyDraft, context.riskStrategy, 1, {
    structuredCase: context.structuredCase,
    policyEvidence: context.policyEvidence,
    retrievalResult: context.retrievalResult,
    badcaseHits
  });
  const attempts: NonNullable<QAResult["attempts"]> = [qaAttempt(replyDraft.content, qaResult)];

  while (!qaResult.passed && qaResult.finalAction === "rewrite" && qaResult.currentAttempt < qaResult.maxAttempts) {
    replyDraft = await deps.replyAgent(context.structuredCase, context.policyEvidence, context.riskStrategy, qaResult.rewriteInstructions, {
      selectedTemplate: context.selectedTemplate,
      replyExamples: context.replyExamples
    });
    qaResult = await deps.qaAgent(replyDraft, context.riskStrategy, qaResult.currentAttempt + 1, {
      structuredCase: context.structuredCase,
      policyEvidence: context.policyEvidence,
      retrievalResult: context.retrievalResult,
      badcaseHits
    });
    attempts.push(qaAttempt(replyDraft.content, qaResult));
  }

  qaResult = { ...qaResult, attempts };

  return {
    replyDraft,
    badcaseHits,
    qaResult,
    agents: [
      node("Response Review / QA Node", qaResult.status, qaResult.passed ? "qa passed" : "qa needs handoff or rewrite", {
        qaResult,
        badcaseHits,
        llmJudge: qaResult.llmJudge,
        tools: ["llm.judge", badcaseTool.tool]
      })
    ],
    traceEvents: [
      traceEvent(context.traceId, "tool.called", "completed", badcaseTool.summary, { tool: badcaseTool.tool, badcaseHits }),
      traceEvent(context.traceId, "tool.called", qaResult.status, "llm.judge 已完成售后回复质检", { tool: "llm.judge", llmJudge: qaResult.llmJudge, attempts }),
      traceEvent(context.traceId, "qa.completed", qaResult.status, qaResult.passed ? "售后质检通过" : "售后质检未通过或转人工", qaResult)
    ]
  };
}

export async function runAfterSalesQaNode(context: AfterSalesReplyContext, deps: CustomerServiceGraphDeps): Promise<AfterSalesQaContext> {
  const state = await executeWorkflowNode(context, (current) => runAfterSalesQaPatchNode(current, deps));
  return requireAfterSalesQaContext(state);
}

export async function runAfterSalesFinalizePatchNode(state: AgentWorkflowState, deps: CustomerServiceGraphDeps): Promise<WorkflowStatePatch> {
  const context = requireAfterSalesQaContext(state);
  const finalRoute = context.riskStrategy.handoffRequired || context.qaResult.finalAction === "handoff" ? "handoff_required" : context.routeDecision.routeType;
  const templateOutput = deps.templateOutputAgent({ routeType: finalRoute, content: context.replyDraft.content, handoffReason: context.riskStrategy.handoffReason });
  const handoffReason = templateOutput.finalAction === "handoff" ? context.riskStrategy.handoffReason ?? "审核循环超限或模板校验未通过" : undefined;
  const updatedMemory = await persistMemoryForOutput({
    memory: context.memory,
    messages: context.messages,
    templateOutput,
    routeType: context.routeDecision.routeType,
    handoffReason
  });

  return {
    memory: updatedMemory,
    llmJudge: context.qaResult.llmJudge,
    templateOutput,
    visibleStatus: templateOutput.visibleStatus,
    finalMessage: templateOutput.finalMessage,
    finalReply: templateOutput.renderedText,
    finalAction: templateOutput.finalAction,
    ticketStatus: ticketStatusFrom(context.routeDecision.routeType, templateOutput.finalAction),
    handoffReason,
    agents: [
      node("Template Output Agent", templateOutput.validationPassed ? "completed" : "handoff_required", "已完成售后模板校验", templateOutput)
    ],
    traceEvents: [
      traceEvent(context.traceId, "template.validated", templateOutput.validationPassed ? "completed" : "handoff_required", "已完成售后模板校验", templateOutput),
      traceEvent(
        context.traceId,
        templateOutput.finalAction === "handoff" ? "handoff.started" : "message.sent",
        templateOutput.finalAction === "handoff" ? "handoff_required" : "completed",
        templateOutput.finalMessage,
        templateOutput
      )
    ]
  };
}

export async function runAfterSalesFinalizeNode(context: AfterSalesQaContext, deps: CustomerServiceGraphDeps): Promise<AgentGraphState> {
  const state = await executeWorkflowNode(context, (current) => runAfterSalesFinalizePatchNode(current, deps));
  return requireAgentGraphState(state);
}

export async function runAfterSalesFlowNode(context: RoutedGraphContext, deps: CustomerServiceGraphDeps): Promise<AgentGraphState> {
  const strategyContext = await runAfterSalesStrategyNode(context, deps);
  const replyContext = await runAfterSalesReplyNode(strategyContext, deps);
  const qaContext = await runAfterSalesQaNode(replyContext, deps);
  return runAfterSalesFinalizeNode(qaContext, deps);
}
