import { Annotation, END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import type { AgentGraphState, AgentNode, GraphNodeFailurePolicy, GraphRuntimeEvent, TraceEvent } from "../../types";
import {
  customerServiceBranchNodeSequences,
  customerServicePreRouteNodeSequence,
  type BranchGraphNodeName,
  type PreRouteGraphNodeName
} from "./graph";
import { createInputWorkflowState, mergeWorkflowState, requireAgentGraphState, type AgentWorkflowState, type GraphInput, type WorkflowNode, type WorkflowStatePatch } from "./state";
import type { WorkflowBranch } from "./edges";

export type CustomerServiceLangGraphNodeName = PreRouteGraphNodeName | BranchGraphNodeName;

export type CustomerServiceLangGraphNodeMap = Record<CustomerServiceLangGraphNodeName, WorkflowNode>;

export type CustomerServiceGraphStreamChunk =
  | { kind: "runtime"; event: GraphRuntimeEvent }
  | { kind: "final"; graph: AgentWorkflowState }
  | { kind: "fatal"; error: string };

export type CustomerServiceLangGraphOptions = {
  onRuntimeEvent?: (event: GraphRuntimeEvent) => void | Promise<void>;
};

const LangGraphWorkflowState = Annotation.Root({
  state: Annotation<AgentWorkflowState>({
    reducer: (_current, update) => update
  })
});

type WrappedLangGraphState = typeof LangGraphWorkflowState.State;
type WrappedLangGraphUpdate = typeof LangGraphWorkflowState.Update;
type StreamableCompiledGraph = {
  stream: (
    input: { state: AgentWorkflowState },
    options: { streamMode: Array<"updates" | "checkpoints">; configurable: { thread_id: string } }
  ) => Promise<AsyncIterable<unknown>>;
};

type RuntimeCollector = {
  streamEvents: GraphRuntimeEvent[];
  checkpoints: GraphRuntimeEvent[];
  emit: (event: GraphRuntimeEvent) => Promise<void>;
};

const customerServiceCheckpointer = new MemorySaver();

const branchEntryNodeMap = {
  general_service_flow: customerServiceBranchNodeSequences.general_service_flow[0],
  after_sales_flow: customerServiceBranchNodeSequences.after_sales_flow[0],
  clarification_flow: customerServiceBranchNodeSequences.clarification_flow[0],
  handoff_flow: customerServiceBranchNodeSequences.handoff_flow[0]
} satisfies Record<WorkflowBranch, BranchGraphNodeName>;

function now() {
  return new Date().toISOString();
}

function agentNode<T>(name: string, status: AgentNode<T>["status"], summary: string, output?: T): AgentNode<T> {
  return { name, status, summary, output };
}

function traceEvent(traceId: string, type: TraceEvent["type"], status: TraceEvent["status"], summary: string, payload?: unknown): TraceEvent {
  return { id: crypto.randomUUID(), traceId, type, status, summary, payload, createdAt: now() };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function createRuntimeCollector(onRuntimeEvent?: CustomerServiceLangGraphOptions["onRuntimeEvent"]): RuntimeCollector {
  const streamEvents: GraphRuntimeEvent[] = [];
  const checkpoints: GraphRuntimeEvent[] = [];

  return {
    streamEvents,
    checkpoints,
    async emit(event) {
      streamEvents.push(event);
      if (event.kind === "checkpoint") checkpoints.push(event);
      try {
        await onRuntimeEvent?.(event);
      } catch {
        // Runtime observers must not break the customer-facing graph.
      }
    }
  };
}

function runtimeNodeEvent(kind: "node_started" | "node_completed", nodeName: string): GraphRuntimeEvent {
  return {
    kind,
    nodeName,
    summary: kind === "node_started" ? `${nodeName} started` : `${nodeName} completed`,
    createdAt: now()
  };
}

function runtimeErrorEvent(nodeName: string, policy: GraphNodeFailurePolicy, message: string): GraphRuntimeEvent {
  return {
    kind: "error",
    nodeName,
    summary: `${nodeName} failed: ${message}`,
    errorCategory: policy.category,
    fallbackAction: policy.fallbackAction,
    createdAt: now()
  };
}

function createFallbackMemory(state: AgentWorkflowState) {
  return state.memory ?? {
    conversationId: state.conversationId,
    ticketId: state.ticketId,
    rawMessages: state.messages,
    actionHistory: [],
    lastUpdatedAt: now()
  };
}

function categoryFromNode(nodeName: CustomerServiceLangGraphNodeName, message: string): GraphNodeFailurePolicy["category"] {
  const lower = message.toLowerCase();
  if (nodeName === "memoryRead") return "memory";
  if (nodeName === "caseUnderstanding") return "understanding";
  if (nodeName === "ruleGuardrail") return "guardrail";
  if (nodeName === "queryRouter") return "routing";
  if (lower.includes("template.retrieve") || lower.includes("template")) return "template";
  if (lower.includes("rag") || lower.includes("retrieve") || lower.includes("knowledge")) return "retrieval";
  if (lower.includes("llm.judge") || lower.includes("judge") || nodeName.endsWith("Qa") || nodeName.endsWith("ReviewQa")) return "qa";
  if (nodeName === "afterSalesReply" || nodeName === "generalService" || nodeName === "clarification") return "reply_generation";
  return "unknown";
}

export function classifyNodeFailure(nodeName: CustomerServiceLangGraphNodeName, error: unknown): GraphNodeFailurePolicy {
  const message = errorMessage(error);
  const category = categoryFromNode(nodeName, message);
  const safeTemplateNodes: CustomerServiceLangGraphNodeName[] = ["afterSalesReply", "generalService", "clarification"];
  const canUseSafeTemplate = safeTemplateNodes.includes(nodeName) && category !== "qa";

  if (canUseSafeTemplate) {
    return {
      nodeName,
      category,
      severity: "recoverable",
      fallbackAction: "safe_template",
      customerSafe: true,
      reason: `${nodeName} failed but can fall back to a constrained customer-safe template.`
    };
  }

  return {
    nodeName,
    category,
    severity: "handoff",
    fallbackAction: "handoff",
    customerSafe: true,
    reason: `${nodeName} failed in a safety-critical step; handoff is required.`
  };
}

function createFallbackRouteDecision(state: AgentWorkflowState, policy: GraphNodeFailurePolicy, handoffReason: string) {
  const routeType = policy.fallbackAction === "safe_template" && state.routeDecision?.routeType === "general_service"
    ? "general_service"
    : policy.fallbackAction === "safe_template"
      ? "after_sales"
      : "handoff_required";

  return state.routeDecision ?? {
    routeType,
    confidence: 0,
    rationale: handoffReason,
    requiredInfo: [],
    riskSignals: ["graph_node_error"],
    guardrailApplied: true,
    targetFlow: routeType === "general_service" ? "general_service_flow" : routeType === "after_sales" ? "after_sales_flow" : "handoff_flow"
  };
}

function safeTemplateText(state: AgentWorkflowState) {
  const routeType = state.routeDecision?.routeType;
  const userMessage = state.structuredCase?.originalMessage ?? state.messages.at(-1)?.content ?? "您的问题";
  const product = state.structuredCase?.productInfo;

  if (routeType === "general_service") {
    return `您好，已收到您的咨询。当前暂时无法生成个性化回复，为避免给出不准确的信息，请您补充具体商品型号、订单或物流信息，我们会继续为您核实。`;
  }

  return `您好，已收到您关于“${product ? `${product}，` : ""}${userMessage}”的反馈。当前暂时无法生成个性化回复，为避免误判，请您补充订单信息、商品状态、问题现象、发生时间和复现步骤；我们会按平台售后规则继续核实。`;
}

function createSafeTemplateFailurePatch(state: AgentWorkflowState, policy: GraphNodeFailurePolicy, message: string): WorkflowStatePatch {
  const finalMessage = safeTemplateText(state);
  const handoffReason = `${policy.nodeName} failed: ${message}`;
  const routeDecision = createFallbackRouteDecision(state, policy, handoffReason);
  const templateType = routeDecision.routeType === "general_service" ? "general_service" : "after_sales";

  return {
    memory: createFallbackMemory(state),
    routeDecision,
    branch: state.branch ?? (templateType === "general_service" ? "general_service_flow" : "after_sales_flow"),
    clarificationLoopExceeded: state.clarificationLoopExceeded ?? false,
    visibleStatus: "sent",
    finalMessage,
    finalReply: finalMessage,
    finalAction: "send",
    ticketStatus: "completed",
    failedNode: policy.nodeName,
    failurePolicy: policy,
    graphExecutionHalted: true,
    templateOutput: {
      visibleStatus: "sent",
      finalMessage,
      templateType,
      renderedText: finalMessage,
      validationPassed: true,
      validationErrors: [],
      safetyChecks: ["节点失败后使用安全模板", "未承诺退款、赔付或补发", "提示继续补充必要信息"],
      finalAction: "send"
    },
    agents: [
      agentNode(`LangGraph ${policy.nodeName}`, "failed", handoffReason, { nodeName: policy.nodeName, error: message, policy }),
      agentNode("Template Output Agent", "completed", "已使用节点失败安全模板", { finalMessage, policy })
    ],
    traceEvents: [
      traceEvent(state.traceId, "graph.node.failed", "failed", handoffReason, { nodeName: policy.nodeName, error: message, policy }),
      traceEvent(state.traceId, "template.validated", "completed", "已使用节点失败安全模板", { finalMessage, policy })
    ]
  };
}

function createHandoffFailurePatch(state: AgentWorkflowState, policy: GraphNodeFailurePolicy, message: string): WorkflowStatePatch {
  const finalMessage = "抱歉，当前自动处理链路出现异常，已为您转接人工客服继续核实。";
  const handoffReason = `${policy.nodeName} failed: ${message}`;

  return {
    memory: createFallbackMemory(state),
    routeDecision: createFallbackRouteDecision(state, policy, handoffReason),
    branch: state.branch ?? "handoff_flow",
    clarificationLoopExceeded: state.clarificationLoopExceeded ?? false,
    visibleStatus: "handoff",
    finalMessage,
    finalReply: finalMessage,
    finalAction: "handoff",
    ticketStatus: "handoff",
    handoffReason,
    failedNode: policy.nodeName,
    failurePolicy: policy,
    graphExecutionHalted: true,
    agents: [
      agentNode(`LangGraph ${policy.nodeName}`, "failed", handoffReason, { nodeName: policy.nodeName, error: message, policy }),
      agentNode("Human Handoff Agent", "handoff_required", "graph node failed, handoff required", { handoffReason, policy })
    ],
    traceEvents: [
      traceEvent(state.traceId, "graph.node.failed", "failed", handoffReason, { nodeName: policy.nodeName, error: message, policy }),
      traceEvent(state.traceId, "handoff.started", "handoff_required", handoffReason, { finalMessage, handoffReason, policy })
    ]
  };
}

function createNodeFailurePatch(state: AgentWorkflowState, nodeName: CustomerServiceLangGraphNodeName, error: unknown): WorkflowStatePatch {
  const message = errorMessage(error);
  const policy = classifyNodeFailure(nodeName, error);

  if (policy.fallbackAction === "safe_template") {
    return createSafeTemplateFailurePatch(state, policy, message);
  }

  return createHandoffFailurePatch(state, policy, message);
}

function createWrappedNode(nodeName: CustomerServiceLangGraphNodeName, node: WorkflowNode, runtimeCollector?: RuntimeCollector) {
  return async (wrappedState: WrappedLangGraphState): Promise<WrappedLangGraphUpdate> => {
    if (wrappedState.state.graphExecutionHalted) {
      return { state: wrappedState.state };
    }

    const startedState = mergeWorkflowState(wrappedState.state, {
      traceEvents: [
        traceEvent(wrappedState.state.traceId, "graph.node.started", "running", `${nodeName} started`, { nodeName })
      ]
    });
    await runtimeCollector?.emit(runtimeNodeEvent("node_started", nodeName));

    try {
      const nextState = mergeWorkflowState(startedState, await node(startedState));
      const completedState = mergeWorkflowState(nextState, {
        traceEvents: [
          traceEvent(nextState.traceId, "graph.node.completed", "completed", `${nodeName} completed`, { nodeName })
        ]
      });
      await runtimeCollector?.emit(runtimeNodeEvent("node_completed", nodeName));
      return { state: completedState };
    } catch (error) {
      const patch = createNodeFailurePatch(startedState, nodeName, error);
      const failedState = mergeWorkflowState(startedState, patch);
      const policy = failedState.failurePolicy ?? classifyNodeFailure(nodeName, error);
      await runtimeCollector?.emit(runtimeErrorEvent(nodeName, policy, errorMessage(error)));
      return { state: failedState };
    }
  };
}

function selectWorkflowBranch(wrappedState: WrappedLangGraphState): WorkflowBranch {
  const branch = wrappedState.state.branch;
  if (!branch) {
    throw new Error("Query Router node did not produce a workflow branch.");
  }
  return branch;
}

function runtimeEventFromUpdate(nodeName: string, state: AgentWorkflowState): GraphRuntimeEvent {
  const failed = state.failedNode === nodeName;
  return {
    kind: failed ? "error" : "update",
    nodeName,
    summary: failed ? `${nodeName} failed` : `${nodeName} updated state`,
    errorCategory: failed ? state.failurePolicy?.category : undefined,
    fallbackAction: failed ? state.failurePolicy?.fallbackAction : undefined,
    createdAt: now()
  };
}

function checkpointEventFromChunk(chunk: Record<string, unknown>): GraphRuntimeEvent {
  const config = chunk.config as { configurable?: { checkpoint_id?: string } } | undefined;
  const metadata = chunk.metadata as { step?: number } | undefined;
  const next = Array.isArray(chunk.next) ? chunk.next.map(String) : [];
  return {
    kind: "checkpoint",
    checkpointId: config?.configurable?.checkpoint_id,
    step: metadata?.step,
    next,
    summary: `checkpoint step ${metadata?.step ?? "-"}`,
    createdAt: now()
  };
}

async function runWithStreamAndCheckpoints(compiledGraph: StreamableCompiledGraph, state: AgentWorkflowState, runtimeCollector: RuntimeCollector) {
  const threadId = state.conversationId || state.traceId;
  let finalState = state;
  const stream = await compiledGraph.stream(
    { state },
    {
      streamMode: ["updates", "checkpoints"],
      configurable: { thread_id: threadId }
    }
  );

  for await (const chunk of stream) {
    if (!Array.isArray(chunk)) continue;
    const [mode, payload] = chunk as [string, unknown];
    if (mode === "updates" && payload && typeof payload === "object") {
      for (const [nodeName, update] of Object.entries(payload as Record<string, { state?: AgentWorkflowState }>)) {
        if (update?.state) {
          finalState = update.state;
          await runtimeCollector.emit(runtimeEventFromUpdate(nodeName, update.state));
        }
      }
    }
    if (mode === "checkpoints" && payload && typeof payload === "object") {
      await runtimeCollector.emit(checkpointEventFromChunk(payload as Record<string, unknown>));
    }
  }

  return {
    ...finalState,
    graphRuntime: {
      threadId,
      checkpointer: "memory",
      streamMode: ["updates", "checkpoints"],
      streamEvents: runtimeCollector.streamEvents,
      checkpoints: runtimeCollector.checkpoints
    }
  } satisfies AgentWorkflowState;
}

function createCompiledGraph(nodes: CustomerServiceLangGraphNodeMap, runtimeCollector?: RuntimeCollector) {
  return new StateGraph(LangGraphWorkflowState)
    .addNode("memoryRead", createWrappedNode("memoryRead", nodes.memoryRead, runtimeCollector))
    .addNode("caseUnderstanding", createWrappedNode("caseUnderstanding", nodes.caseUnderstanding, runtimeCollector))
    .addNode("ruleGuardrail", createWrappedNode("ruleGuardrail", nodes.ruleGuardrail, runtimeCollector))
    .addNode("queryRouter", createWrappedNode("queryRouter", nodes.queryRouter, runtimeCollector))
    .addNode("generalService", createWrappedNode("generalService", nodes.generalService, runtimeCollector))
    .addNode("generalReviewQa", createWrappedNode("generalReviewQa", nodes.generalReviewQa, runtimeCollector))
    .addNode("generalFinalize", createWrappedNode("generalFinalize", nodes.generalFinalize, runtimeCollector))
    .addNode("afterSalesStrategy", createWrappedNode("afterSalesStrategy", nodes.afterSalesStrategy, runtimeCollector))
    .addNode("afterSalesReply", createWrappedNode("afterSalesReply", nodes.afterSalesReply, runtimeCollector))
    .addNode("afterSalesQa", createWrappedNode("afterSalesQa", nodes.afterSalesQa, runtimeCollector))
    .addNode("afterSalesFinalize", createWrappedNode("afterSalesFinalize", nodes.afterSalesFinalize, runtimeCollector))
    .addNode("clarification", createWrappedNode("clarification", nodes.clarification, runtimeCollector))
    .addNode("humanHandoff", createWrappedNode("humanHandoff", nodes.humanHandoff, runtimeCollector))
    .addEdge(START, customerServicePreRouteNodeSequence[0])
    .addEdge("memoryRead", "caseUnderstanding")
    .addEdge("caseUnderstanding", "ruleGuardrail")
    .addEdge("ruleGuardrail", "queryRouter")
    .addConditionalEdges("queryRouter", selectWorkflowBranch, branchEntryNodeMap)
    .addEdge("generalService", "generalReviewQa")
    .addEdge("generalReviewQa", "generalFinalize")
    .addEdge("generalFinalize", END)
    .addEdge("afterSalesStrategy", "afterSalesReply")
    .addEdge("afterSalesReply", "afterSalesQa")
    .addEdge("afterSalesQa", "afterSalesFinalize")
    .addEdge("afterSalesFinalize", END)
    .addEdge("clarification", END)
    .addEdge("humanHandoff", END);
}

function createAsyncQueue<T>() {
  const values: T[] = [];
  const waiters: Array<(result: IteratorResult<T>) => void> = [];
  let closed = false;

  return {
    push(value: T) {
      if (closed) return;
      const waiter = waiters.shift();
      if (waiter) {
        waiter({ value, done: false });
      } else {
        values.push(value);
      }
    },
    close() {
      closed = true;
      while (waiters.length) {
        const waiter = waiters.shift();
        waiter?.({ value: undefined, done: true });
      }
    },
    async *[Symbol.asyncIterator]() {
      while (true) {
        const value = values.shift();
        if (value) {
          yield value;
          continue;
        }
        if (closed) break;
        const result = await new Promise<IteratorResult<T>>((resolve) => waiters.push(resolve));
        if (result.done) break;
        yield result.value;
      }
    }
  };
}

export function createCustomerServiceLangGraph(nodes: CustomerServiceLangGraphNodeMap, options: CustomerServiceLangGraphOptions = {}) {
  const compiledGraph = createCompiledGraph(nodes).compile({ checkpointer: customerServiceCheckpointer });

  async function invokeWithObserver(state: AgentWorkflowState, onRuntimeEvent?: CustomerServiceLangGraphOptions["onRuntimeEvent"]) {
    const runtimeCollector = createRuntimeCollector(onRuntimeEvent ?? options.onRuntimeEvent);
    const observedGraph = createCompiledGraph(nodes, runtimeCollector).compile({ checkpointer: customerServiceCheckpointer });
    return runWithStreamAndCheckpoints(observedGraph, state, runtimeCollector);
  }

  return {
    compiledGraph,
    async invoke(state: AgentWorkflowState): Promise<AgentWorkflowState> {
      return invokeWithObserver(state);
    },
    async *stream(state: AgentWorkflowState): AsyncGenerator<CustomerServiceGraphStreamChunk> {
      const queue = createAsyncQueue<CustomerServiceGraphStreamChunk>();
      const run = invokeWithObserver(state, (event) => queue.push({ kind: "runtime", event }))
        .then((graph) => queue.push({ kind: "final", graph }))
        .catch((error) => queue.push({ kind: "fatal", error: errorMessage(error) }))
        .finally(() => queue.close());

      for await (const chunk of queue) {
        yield chunk;
      }
      await run;
    }
  };
}

export async function runCustomerServiceLangGraph(
  input: GraphInput,
  nodes: CustomerServiceLangGraphNodeMap,
  options?: CustomerServiceLangGraphOptions
): Promise<AgentGraphState> {
  const graph = createCustomerServiceLangGraph(nodes, options);
  return requireAgentGraphState(await graph.invoke(createInputWorkflowState(input)));
}
