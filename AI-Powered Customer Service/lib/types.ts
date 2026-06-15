export type AgentStatus = "pending" | "running" | "completed" | "failed" | "needs_rewrite" | "handoff_required";
export type RiskLevel = "low" | "medium" | "high";
export type UserEmotion = "calm" | "normal" | "anxious" | "angry" | "complaint";
export type RouteType = "general_service" | "after_sales" | "needs_clarification" | "handoff_required";
export type FinalAction = "send" | "handoff";
export type VisibleStatus = "sent" | "needs_clarification" | "handoff";
export type TicketStatus = "pending" | "processing" | "needs_clarification" | "needs_human_review" | "handoff" | "completed" | "badcase_marked";

export type ConversationMessage = {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  images?: string[];
  createdAt: string;
};

export type ConversationMemoryRecord = {
  conversationId: string;
  ticketId: string;
  rawMessages: ConversationMessage[];
  actionHistory: string[];
  compressedSummary?: string;
  lastUpdatedAt: string;
  compressedAt?: string;
  expiresAt?: string;
};

export type StructuredCase = {
  caseId: string;
  conversationId: string;
  originalMessage: string;
  productInfo: string;
  issueSummary: string;
  customerIntent: string;
  customerRequest: string;
  requestedOutcome: string;
  evidenceState: string;
  evidenceStatus: "none" | "partial" | "sufficient";
  uploadedEvidence: string[];
  imageClues: string[];
  emotionState: UserEmotion;
  knownContext: string[];
  missingFields: string[];
  previousMissingFields?: string[];
  resolvedMissingFields?: string[];
  newMissingFields?: string[];
  clarificationRound?: number;
  riskSignals: string[];
  priorActions: string[];
  previousActions: string[];
  clarificationQuestions: string[];
  memorySummary: string;
  confidence: number;
  llmSource?: "deepseek" | "fallback";
  llmError?: string;
  visionSource?: "disabled";
  visionError?: string;
};

export type GuardrailResult = {
  hardRiskFlags: string[];
  hardRiskSignals: string[];
  prohibitedCommitments: string[];
  outOfScope: boolean;
  fallbackConstraints: string[];
  recommendedRouteOverride?: RouteType;
  forcedRouteType?: RouteType;
  requiredHumanHandoff: boolean;
  rationale: string;
  guardrailReason: string;
};

export type RouteDecision = {
  routeType: RouteType;
  confidence: number;
  rationale: string;
  requiredInfo: string[];
  riskSignals: string[];
  guardrailApplied: boolean;
  targetFlow: "general_service_flow" | "after_sales_flow" | "clarification_flow" | "handoff_flow";
  llmSource?: "deepseek" | "fallback";
  llmError?: string;
};

export type RetrievalCandidate = {
  id: string;
  title: string;
  content: string;
  category: string;
  source: string;
  score: number;
  rerankScore?: number;
  matchedKeywords?: string[];
  filterReason?: string;
  rankingReason?: string;
  metadata?: Record<string, string | number | boolean | string[]>;
};

export type RetrievalResult = {
  query: string;
  knowledgeBase: "general" | "after_sales";
  vectorStoreSource?: "memory" | "lancedb" | "fallback";
  rerankerSource?: "local" | "cross_encoder" | "fallback";
  rerankerError?: string;
  bm25Candidates: RetrievalCandidate[];
  embeddingCandidates: RetrievalCandidate[];
  filteredCandidates: RetrievalCandidate[];
  rerankedTopK: RetrievalCandidate[];
  groundingConfidence: number;
  insufficientGrounding: boolean;
};

export type GeneralKnowledgeHit = {
  docId: string;
  title: string;
  category: "product_specs" | "delivery_time" | "logistics_info" | "order_info" | "general_style";
  content: string;
  score: number;
  matchedKeywords: string[];
};

export type GeneralServiceResult = {
  category: "product_specs" | "delivery_time" | "logistics_info" | "order_info" | "clarification";
  answer: string;
  dataUsed: string[];
  retrievedKnowledge: GeneralKnowledgeHit[];
  retrievalQuery: string;
  llmSource?: "deepseek" | "fallback";
  llmError?: string;
};

export type ExampleHit = {
  id: string;
  title: string;
  routeType: RouteType;
  purpose: "strategy" | "reply";
  customerIntent?: string;
  summary: string;
  recommendedAction: string;
  score: number;
  source: "static" | "badcase";
};

export type ReplyTemplate = {
  id: string;
  name: string;
  routeType: RouteType;
  tone: "general" | "empathetic" | "handoff" | "clarification";
  requiredSections: string[];
  constraints: string[];
  templateText: string;
};

export type RuleHit = {
  ruleId: string;
  title: string;
  summary: string;
  category: string;
  relevanceScore: number;
};

export type PolicyEvidenceResult = {
  ruleHits: RuleHit[];
  applies: string[];
  notApplies: string[];
  evidenceSufficiency: "sufficient" | "partial" | "insufficient";
  requiredAdditionalEvidence: string[];
  uncertainty: string[];
};

export type RiskStrategyResult = {
  riskLevel: RiskLevel;
  strategyActions: string[];
  prohibitedCommitments: string[];
  requiredDisclaimers: string[];
  handoffRequired: boolean;
  handoffReason?: string;
  rationale: string;
};

export type ReplyDraft = {
  content: string;
  basisSummary: string[];
  respectedConstraints: string[];
  qaChecklist: string[];
  llmSource?: "deepseek" | "fallback";
  llmError?: string;
};

export type ReviewResult = {
  passed: boolean;
  reasons: string[];
  rewriteInstructions: string[];
  riskFlags: string[];
  attempt: number;
};

export type LlmJudgeOutput = {
  passed: boolean;
  failureReasons: string[];
  rewriteInstructions: string[];
  finalAction: FinalAction | "rewrite";
  judgeSource?: "rules" | "deepseek" | "fallback";
  judgeError?: string;
};

export type ReviewLoopState = {
  target: "general_service_reply" | "after_sales_reply";
  maxAttempts: number;
  currentAttempt: number;
  passed: boolean;
  failureReasons: string[];
  rewriteInstructions: string[];
  finalAction: FinalAction | "rewrite";
  attempts?: Array<{
    attempt: number;
    content: string;
    passed: boolean;
    failureReasons: string[];
    rewriteInstructions: string[];
    finalAction: FinalAction | "rewrite";
    judgeSource?: "rules" | "deepseek" | "fallback";
  }>;
  judgeSource?: "rules" | "deepseek" | "fallback";
  judgeError?: string;
};

export type QAResult = ReviewLoopState & {
  status: AgentStatus;
  badcaseRiskTags: string[];
  llmJudge?: LlmJudgeOutput;
  badcaseHits?: BadcaseHit[];
};

export type BadcaseHit = {
  id: string;
  badcaseType: string;
  note: string;
  routeType?: RouteType;
  score: number;
  source?: "manual" | "auto";
  traceId?: string;
};

export type TemplateOutputResult = {
  visibleStatus: VisibleStatus;
  finalMessage: string;
  templateType: "general_service" | "after_sales" | "clarification" | "handoff";
  renderedText: string;
  validationPassed: boolean;
  validationErrors: string[];
  safetyChecks: string[];
  finalAction: FinalAction;
  handoffReason?: string;
};

export type GraphRuntimeEvent = {
  kind: "node_started" | "node_completed" | "update" | "checkpoint" | "error";
  nodeName?: string;
  checkpointId?: string;
  step?: number;
  next?: string[];
  summary: string;
  errorCategory?: GraphNodeFailurePolicy["category"];
  fallbackAction?: GraphNodeFailurePolicy["fallbackAction"];
  createdAt: string;
};

export type GraphRuntimeSummary = {
  threadId: string;
  checkpointer: "memory";
  streamMode: Array<"updates" | "checkpoints">;
  streamEvents: GraphRuntimeEvent[];
  checkpoints: GraphRuntimeEvent[];
};

export type GraphNodeFailurePolicy = {
  nodeName: string;
  category: "memory" | "understanding" | "guardrail" | "routing" | "retrieval" | "reply_generation" | "qa" | "template" | "unknown";
  severity: "recoverable" | "handoff";
  fallbackAction: "safe_template" | "handoff";
  customerSafe: boolean;
  reason: string;
};

export type AgentNode<T> = {
  name: string;
  status: AgentStatus;
  summary: string;
  output?: T;
};

export type TraceEvent = {
  id: string;
  traceId: string;
  type:
    | "memory.loaded"
    | "case.structured"
    | "guardrail.checked"
    | "router.decided"
    | "rag.retrieved"
    | "branch.generated"
    | "review.completed"
    | "qa.completed"
    | "template.validated"
    | "message.sent"
    | "handoff.started"
    | "badcase.marked"
    | "tool.called"
    | "graph.node.started"
    | "graph.node.completed"
    | "graph.node.failed";
  status: AgentStatus;
  summary: string;
  payload?: unknown;
  createdAt: string;
};

export type AgentGraphState = {
  traceId: string;
  conversationId: string;
  ticketId: string;
  messages: ConversationMessage[];
  memory: ConversationMemoryRecord;
  structuredCase?: StructuredCase;
  guardrail?: GuardrailResult;
  routeDecision?: RouteDecision;
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
  visibleStatus: VisibleStatus;
  finalMessage: string;
  finalReply?: string;
  finalAction: FinalAction;
  ticketStatus: TicketStatus;
  handoffReason?: string;
  failedNode?: string;
  failurePolicy?: GraphNodeFailurePolicy;
  graphExecutionHalted?: boolean;
  graphRuntime?: GraphRuntimeSummary;
  traceEvents: TraceEvent[];
  agents: AgentNode<unknown>[];
};

export type ChatApiResponse = AgentGraphState & {
  visibleStatus: VisibleStatus;
  finalMessage: string;
  ticketStatus: TicketStatus;
  traceId: string;
};

export type DemoScenario = {
  id: string;
  title: string;
  message: string;
  imageHint?: string;
  expectedIntent: string;
  expectedRisk: RiskLevel | "none";
  prohibitedCommitments: string[];
};

export type BadcaseRecord = {
  id: string;
  createdAt: string;
  userMessage: string;
  agentAnalysis: AgentGraphState;
  badcaseType: string;
  note: string;
  source?: "manual" | "auto";
  traceId?: string;
  routeType?: RouteType;
};
