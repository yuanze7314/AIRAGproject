import type {
  AgentGraphState,
  AgentNode,
  BadcaseHit,
  ConversationMemoryRecord,
  ConversationMessage,
  ExampleHit,
  FinalAction,
  GeneralServiceResult,
  GraphRuntimeSummary,
  GraphNodeFailurePolicy,
  GuardrailResult,
  LlmJudgeOutput,
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
  TraceEvent,
  VisibleStatus
} from "../../types";
import type { WorkflowBranch } from "./edges";

export type GraphInput = {
  conversationId?: string;
  content: string;
  images?: string[];
  history?: ConversationMessage[];
};

export type AgentWorkflowState = {
  traceId: string;
  conversationId: string;
  ticketId: string;
  messages: ConversationMessage[];
  memory?: ConversationMemoryRecord;
  structuredCase?: StructuredCase;
  guardrail?: GuardrailResult;
  routeDecision?: RouteDecision;
  branch?: WorkflowBranch;
  clarificationLoopExceeded?: boolean;
  retrievalResult?: RetrievalResult;
  generalService?: GeneralServiceResult;
  policyEvidence?: PolicyEvidenceResult;
  riskStrategy?: RiskStrategyResult;
  similarExamples?: ExampleHit[];
  selectedTemplate?: ReplyTemplate;
  replyExamples?: ExampleHit[];
  replyDraft?: ReplyDraft;
  badcaseHits?: BadcaseHit[];
  llmJudge?: LlmJudgeOutput;
  reviewLoop?: ReviewLoopState;
  qaResult?: QAResult;
  templateOutput?: TemplateOutputResult;
  visibleStatus?: VisibleStatus;
  finalMessage?: string;
  finalReply?: string;
  finalAction?: FinalAction;
  ticketStatus?: TicketStatus;
  handoffReason?: string;
  failedNode?: string;
  failurePolicy?: GraphNodeFailurePolicy;
  graphExecutionHalted?: boolean;
  graphRuntime?: GraphRuntimeSummary;
  traceEvents: TraceEvent[];
  agents: AgentNode<unknown>[];
};

export function createWorkflowState(input: {
  traceId: string;
  conversationId: string;
  ticketId: string;
  messages: ConversationMessage[];
}): AgentWorkflowState {
  return {
    ...input,
    traceEvents: [],
    agents: []
  };
}

export function createInputWorkflowState(input: GraphInput): AgentWorkflowState {
  const conversationId = input.conversationId ?? crypto.randomUUID();
  const ticketId = `T-${conversationId.slice(0, 8)}`;
  const userMessage: ConversationMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: input.content,
    images: input.images ?? [],
    createdAt: new Date().toISOString()
  };
  return createWorkflowState({
    traceId: `trace_${crypto.randomUUID()}`,
    conversationId,
    ticketId,
    messages: [...(input.history ?? []), userMessage]
  });
}

export type WorkflowStatePatch = Partial<Omit<AgentWorkflowState, "traceEvents" | "agents">> & {
  traceEvents?: TraceEvent[];
  agents?: AgentNode<unknown>[];
};

export type WorkflowNode = (state: AgentWorkflowState) => WorkflowStatePatch | Promise<WorkflowStatePatch>;

export function mergeWorkflowState(state: AgentWorkflowState, patch: WorkflowStatePatch): AgentWorkflowState {
  return {
    ...state,
    ...patch,
    traceEvents: patch.traceEvents ? [...state.traceEvents, ...patch.traceEvents] : state.traceEvents,
    agents: patch.agents ? [...state.agents, ...patch.agents] : state.agents
  };
}

export async function executeWorkflowNode(state: AgentWorkflowState, node: WorkflowNode): Promise<AgentWorkflowState> {
  return mergeWorkflowState(state, await node(state));
}

export async function executeWorkflowNodes(state: AgentWorkflowState, nodes: WorkflowNode[]): Promise<AgentWorkflowState> {
  let current = state;
  for (const node of nodes) {
    current = await executeWorkflowNode(current, node);
  }
  return current;
}

export function requireAgentGraphState(state: AgentWorkflowState): AgentGraphState {
  if (!state.memory || !state.visibleStatus || !state.finalMessage || !state.finalAction || !state.ticketStatus) {
    throw new Error("Workflow did not produce a complete agent graph state.");
  }
  return state as AgentGraphState;
}
