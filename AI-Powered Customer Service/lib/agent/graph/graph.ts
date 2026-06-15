import type { WorkflowBranch } from "./edges";

export type GraphNodeName =
  | "memoryRead"
  | "caseUnderstanding"
  | "ruleGuardrail"
  | "queryRouter"
  | "generalService"
  | "generalReviewQa"
  | "generalFinalize"
  | "afterSalesStrategy"
  | "afterSalesReply"
  | "afterSalesQa"
  | "afterSalesFinalize"
  | "clarification"
  | "humanHandoff";

export type PreRouteGraphNodeName = "memoryRead" | "caseUnderstanding" | "ruleGuardrail" | "queryRouter";

export type BranchGraphNodeName = Exclude<GraphNodeName, PreRouteGraphNodeName>;

export type GraphEdge = {
  from: GraphNodeName;
  to: GraphNodeName;
  branch?: WorkflowBranch;
};

export const customerServiceGraphTopology: GraphEdge[] = [
  { from: "memoryRead", to: "caseUnderstanding" },
  { from: "caseUnderstanding", to: "ruleGuardrail" },
  { from: "ruleGuardrail", to: "queryRouter" },
  { from: "queryRouter", to: "generalService", branch: "general_service_flow" },
  { from: "queryRouter", to: "afterSalesStrategy", branch: "after_sales_flow" },
  { from: "queryRouter", to: "clarification", branch: "clarification_flow" },
  { from: "queryRouter", to: "humanHandoff", branch: "handoff_flow" },
  { from: "generalService", to: "generalReviewQa" },
  { from: "generalReviewQa", to: "generalFinalize" },
  { from: "afterSalesStrategy", to: "afterSalesReply" },
  { from: "afterSalesReply", to: "afterSalesQa" },
  { from: "afterSalesQa", to: "afterSalesFinalize" }
];

export const customerServicePreRouteNodeSequence: PreRouteGraphNodeName[] = ["memoryRead", "caseUnderstanding", "ruleGuardrail", "queryRouter"];

export const customerServiceBranchNodeSequences: Record<WorkflowBranch, BranchGraphNodeName[]> = {
  general_service_flow: ["generalService", "generalReviewQa", "generalFinalize"],
  after_sales_flow: ["afterSalesStrategy", "afterSalesReply", "afterSalesQa", "afterSalesFinalize"],
  clarification_flow: ["clarification"],
  handoff_flow: ["humanHandoff"]
};
