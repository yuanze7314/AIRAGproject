import type { AgentGraphState } from "../../types";
import type { BranchGraphNodeName } from "./graph";
import type { CustomerServiceLangGraphOptions } from "./langgraph";
import { runCustomerServiceLangGraph } from "./langgraph";
import type { GraphInput, WorkflowNode } from "./state";
import {
  type CustomerServiceGraphDeps,
  runCaseUnderstandingPatchNode,
  runAfterSalesFinalizePatchNode,
  runAfterSalesQaPatchNode,
  runAfterSalesReplyPatchNode,
  runAfterSalesStrategyPatchNode,
  runClarificationPatchNode,
  runGeneralFinalizePatchNode,
  runGeneralReviewQaPatchNode,
  runGeneralServiceAgentPatchNode,
  runHumanHandoffPatchNode,
  runMemoryReadPatchNode,
  runQueryRouterPatchNode,
  runRuleGuardrailPatchNode
} from "./nodes";

export type { CustomerServiceGraphDeps } from "./nodes";

function buildNodeExecutorMap(deps: CustomerServiceGraphDeps) {
  return {
    generalService: (state) => runGeneralServiceAgentPatchNode(state, deps),
    generalReviewQa: (state) => runGeneralReviewQaPatchNode(state, deps),
    generalFinalize: (state) => runGeneralFinalizePatchNode(state, deps),
    afterSalesStrategy: (state) => runAfterSalesStrategyPatchNode(state, deps),
    afterSalesReply: (state) => runAfterSalesReplyPatchNode(state, deps),
    afterSalesQa: (state) => runAfterSalesQaPatchNode(state, deps),
    afterSalesFinalize: (state) => runAfterSalesFinalizePatchNode(state, deps),
    clarification: (state) => runClarificationPatchNode(state, deps),
    humanHandoff: (state) => runHumanHandoffPatchNode(state, deps)
  } satisfies Record<BranchGraphNodeName, WorkflowNode>;
}

export async function runCustomerServiceGraph(input: GraphInput, deps: CustomerServiceGraphDeps, options?: CustomerServiceLangGraphOptions): Promise<AgentGraphState> {
  return runCustomerServiceLangGraph(input, {
    memoryRead: (state) => runMemoryReadPatchNode(state),
    caseUnderstanding: (state) => runCaseUnderstandingPatchNode(state, deps),
    ruleGuardrail: (state) => runRuleGuardrailPatchNode(state, deps),
    queryRouter: (state) => runQueryRouterPatchNode(state, deps),
    ...buildNodeExecutorMap(deps)
  }, options);
}
