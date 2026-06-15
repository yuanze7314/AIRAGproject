import type { RouteDecision } from "../../types";

export type WorkflowBranch =
  | "general_service_flow"
  | "after_sales_flow"
  | "clarification_flow"
  | "handoff_flow";

export function routeByDecision(routeDecision: RouteDecision | undefined): WorkflowBranch {
  if (routeDecision?.routeType === "general_service") return "general_service_flow";
  if (routeDecision?.routeType === "after_sales") return "after_sales_flow";
  if (routeDecision?.routeType === "needs_clarification") return "clarification_flow";
  return "handoff_flow";
}
