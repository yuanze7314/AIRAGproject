import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const nodeRequire = createRequire(import.meta.url);
const projectRoot = process.cwd();

function loadTsModule(relativePath, requireShim = (specifier) => {
  throw new Error(`Unexpected runtime import in ${relativePath}: ${specifier}`);
}) {
  const sourcePath = join(projectRoot, relativePath);
  const source = readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const module = { exports: {} };
  new Function("exports", "module", "require", compiled)(module.exports, module, requireShim);
  return module.exports;
}

const { createInputWorkflowState, createWorkflowState, executeWorkflowNode, executeWorkflowNodes, mergeWorkflowState, requireAgentGraphState } = loadTsModule(
  join("lib", "agent", "graph", "state.ts")
);
const { generateStructuredOutput } = loadTsModule(
  join("lib", "llm", "deepseek.ts")
);
const { customerServiceBranchNodeSequences, customerServicePreRouteNodeSequence } = loadTsModule(
  join("lib", "agent", "graph", "graph.ts")
);
const { classifyNodeFailure, createCustomerServiceLangGraph } = loadTsModule(
  join("lib", "agent", "graph", "langgraph.ts"),
  (specifier) => {
    if (specifier === "@langchain/langgraph") {
      return nodeRequire(specifier);
    }
    if (specifier === "./graph") {
      return { customerServiceBranchNodeSequences, customerServicePreRouteNodeSequence };
    }
    if (specifier === "./state") {
      return { createInputWorkflowState, mergeWorkflowState, requireAgentGraphState };
    }
    throw new Error(`Unexpected runtime import in langgraph.ts: ${specifier}`);
  }
);

assert.equal(classifyNodeFailure("afterSalesReply", new Error("template.retrieve timeout")).fallbackAction, "safe_template");
assert.equal(classifyNodeFailure("generalReviewQa", new Error("llm.judge timeout")).fallbackAction, "handoff");
assert.equal(classifyNodeFailure("memoryRead", new Error("memory adapter unavailable")).fallbackAction, "handoff");

const baseState = createWorkflowState({
  traceId: "trace_test",
  conversationId: "conversation_test",
  ticketId: "T-test",
  messages: []
});

const initialTrace = { id: "trace-1", traceId: "trace_test", type: "memory.loaded", status: "completed", summary: "initial", createdAt: "2026-06-14T00:00:00.000Z" };
const patchTrace = { id: "trace-2", traceId: "trace_test", type: "tool.called", status: "completed", summary: "patched", createdAt: "2026-06-14T00:00:01.000Z" };
const initialAgent = { name: "Context & Routing Agent", status: "completed", summary: "initial" };
const patchAgent = { name: "General Service Agent", status: "completed", summary: "patched" };

const merged = mergeWorkflowState(
  {
    ...baseState,
    traceEvents: [initialTrace],
    agents: [initialAgent]
  },
  {
    finalMessage: "ok",
    traceEvents: [patchTrace],
    agents: [patchAgent]
  }
);

assert.equal(merged.finalMessage, "ok");
assert.deepEqual(merged.traceEvents.map((event) => event.id), ["trace-1", "trace-2"]);
assert.deepEqual(merged.agents.map((agent) => agent.name), ["Context & Routing Agent", "General Service Agent"]);

const executed = await executeWorkflowNode(
  {
    ...baseState,
    traceEvents: [initialTrace],
    agents: [initialAgent]
  },
  async (state) => ({
    finalAction: state.traceId === "trace_test" ? "send" : "handoff",
    traceEvents: [patchTrace],
    agents: [patchAgent]
  })
);

assert.equal(executed.finalAction, "send");
assert.deepEqual(executed.traceEvents.map((event) => event.id), ["trace-1", "trace-2"]);
assert.deepEqual(executed.agents.map((agent) => agent.name), ["Context & Routing Agent", "General Service Agent"]);

const sequenced = await executeWorkflowNodes(
  baseState,
  [
    async () => ({ traceEvents: [initialTrace], agents: [initialAgent] }),
    async (state) => ({
      finalAction: state.traceEvents.length === 1 ? "send" : "handoff",
      traceEvents: [patchTrace],
      agents: [patchAgent]
    })
  ]
);

assert.equal(sequenced.finalAction, "send");
assert.deepEqual(sequenced.traceEvents.map((event) => event.id), ["trace-1", "trace-2"]);
assert.deepEqual(sequenced.agents.map((agent) => agent.name), ["Context & Routing Agent", "General Service Agent"]);

const inputState = createInputWorkflowState({
  conversationId: "conversation_fixed",
  content: "耳机没有声音",
  images: ["image-1"],
  history: [{ id: "history-1", role: "assistant", content: "您好", createdAt: "2026-06-14T00:00:00.000Z" }]
});

assert.equal(inputState.conversationId, "conversation_fixed");
assert.equal(inputState.ticketId, "T-conversa");
assert.equal(inputState.messages.length, 2);
assert.equal(inputState.messages.at(-1).role, "user");
assert.equal(inputState.messages.at(-1).content, "耳机没有声音");
assert.deepEqual(inputState.messages.at(-1).images, ["image-1"]);

assert.throws(
  () => requireAgentGraphState(inputState),
  /did not produce a complete agent graph state/
);

const originalEnv = {
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  DEEPSEEK_API_BASE_URL: process.env.DEEPSEEK_API_BASE_URL,
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL,
  LLM_API_BASE_URL: process.env.LLM_API_BASE_URL,
  LLM_MODEL: process.env.LLM_MODEL,
  LLM_DISABLED: process.env.LLM_DISABLED,
  DEEPSEEK_DISABLED: process.env.DEEPSEEK_DISABLED
};
const originalFetch = globalThis.fetch;
let capturedLlmRequest;
process.env.DEEPSEEK_API_KEY = "test-key";
process.env.DEEPSEEK_API_BASE_URL = "https://api.deepseek.com";
process.env.DEEPSEEK_MODEL = "deepseek-v4-flash";
process.env.LLM_API_BASE_URL = "";
process.env.LLM_MODEL = "";
process.env.LLM_DISABLED = "0";
process.env.DEEPSEEK_DISABLED = "0";
globalThis.fetch = async (url, init) => {
  capturedLlmRequest = { url: String(url), body: JSON.parse(init.body) };
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify({ value: "ok" }) } }] })
  };
};
const llmProbe = await generateStructuredOutput({
  name: "env_probe",
  schema: {
    type: "object",
    properties: { value: { type: "string" } },
    required: ["value"],
    additionalProperties: false
  },
  system: "Return JSON.",
  user: { input: "probe" },
  fallback: { value: "fallback" },
  validate: (value) => Boolean(value && typeof value === "object" && value.value === "ok")
});
assert.equal(llmProbe.source, "deepseek");
assert.equal(capturedLlmRequest.url, "https://api.deepseek.com/chat/completions");
assert.equal(capturedLlmRequest.body.model, "deepseek-v4-flash");
globalThis.fetch = originalFetch;
for (const [key, value] of Object.entries(originalEnv)) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

const badcaseTempDir = mkdtempSync(join(tmpdir(), "badcase-store-"));
mkdirSync(join(badcaseTempDir, "data"), { recursive: true });
writeFileSync(join(badcaseTempDir, "data", "badcases.json"), "[]", "utf8");
const originalCwd = process.cwd();
try {
  process.chdir(badcaseTempDir);
  const { listBadcases, saveBadcase } = loadTsModule(
    join("lib", "store", "badcase.ts"),
    (specifier) => nodeRequire(specifier)
  );
  await saveBadcase({
    userMessage: "runtime generated badcase",
    badcaseType: "qa_failed",
    note: "runtime data must not pollute tracked fixture",
    source: "auto",
    agentAnalysis: {
      traceId: "trace_badcase_runtime",
      routeDecision: { routeType: "after_sales" }
    }
  });

  assert.equal(readFileSync(join(badcaseTempDir, "data", "badcases.json"), "utf8"), "[]");
  const runtimeBadcasePath = join(badcaseTempDir, "data", "badcases.local.json");
  assert.equal(existsSync(runtimeBadcasePath), true);
  const runtimeBadcases = JSON.parse(readFileSync(runtimeBadcasePath, "utf8"));
  assert.equal(runtimeBadcases.length, 1);
  assert.equal(runtimeBadcases[0].userMessage, "runtime generated badcase");
  assert.equal((await listBadcases()).length, 1);
} finally {
  process.chdir(originalCwd);
  rmSync(badcaseTempDir, { recursive: true, force: true });
}

const completeState = {
  ...inputState,
  memory: { conversationId: "conversation_fixed", ticketId: "T-conversa", facts: [], preferences: [], unresolvedSlots: [], previousIntents: [], riskSignals: [], lastUpdatedAt: "2026-06-14T00:00:00.000Z" },
  visibleStatus: "sent",
  finalMessage: "ok",
  finalAction: "send",
  ticketStatus: "completed"
};

assert.equal(requireAgentGraphState(completeState).finalMessage, "ok");

assert.deepEqual(customerServiceBranchNodeSequences.general_service_flow, ["generalService", "generalReviewQa", "generalFinalize"]);
assert.deepEqual(customerServiceBranchNodeSequences.after_sales_flow, ["afterSalesStrategy", "afterSalesReply", "afterSalesQa", "afterSalesFinalize"]);
assert.deepEqual(customerServiceBranchNodeSequences.clarification_flow, ["clarification"]);
assert.deepEqual(customerServiceBranchNodeSequences.handoff_flow, ["humanHandoff"]);
assert.deepEqual(customerServicePreRouteNodeSequence, ["memoryRead", "caseUnderstanding", "ruleGuardrail", "queryRouter"]);

const splitGraphCalls = [];
const langGraph = createCustomerServiceLangGraph({
  memoryRead: async () => {
    splitGraphCalls.push("memoryRead");
    return {
      memory: {
        conversationId: "conversation_langgraph",
        ticketId: "T-langgrap",
        rawMessages: [],
        actionHistory: [],
        lastUpdatedAt: "2026-06-14T00:00:00.000Z"
      },
      traceEvents: [initialTrace],
      agents: [initialAgent]
    };
  },
  caseUnderstanding: async () => {
    splitGraphCalls.push("caseUnderstanding");
    return { structuredCase: { originalMessage: "after sales test", missingFields: [] } };
  },
  ruleGuardrail: async () => {
    splitGraphCalls.push("ruleGuardrail");
    return { guardrail: { requiredHumanHandoff: false, guardrailReason: "ok" } };
  },
  queryRouter: async () => {
    splitGraphCalls.push("queryRouter");
    return { routeDecision: { routeType: "after_sales" }, branch: "after_sales_flow", clarificationLoopExceeded: false };
  },
  afterSalesStrategy: async () => {
    splitGraphCalls.push("afterSalesStrategy");
    return { riskStrategy: { route: "standard", reason: "test", actions: [] } };
  },
  afterSalesReply: async () => {
    splitGraphCalls.push("afterSalesReply");
    return { replyDraft: { content: "draft", citations: [] } };
  },
  afterSalesQa: async () => {
    splitGraphCalls.push("afterSalesQa");
    return { qaResult: { passed: true, issues: [], revisedReply: "approved" } };
  },
  afterSalesFinalize: async () => {
    splitGraphCalls.push("afterSalesFinalize");
    return {
      visibleStatus: "sent",
      finalMessage: "approved",
      finalAction: "send",
      ticketStatus: "completed",
      traceEvents: [patchTrace],
      agents: [patchAgent]
    };
  },
  generalService: async () => ({ finalMessage: "wrong general branch" }),
  generalReviewQa: async () => ({}),
  generalFinalize: async () => ({}),
  clarification: async () => ({ finalMessage: "wrong clarification branch" }),
  humanHandoff: async () => ({ finalMessage: "wrong handoff branch" })
});

const langGraphResult = await langGraph.invoke(
  createInputWorkflowState({
    conversationId: "conversation_langgraph",
    content: "退款售后测试"
  })
);

assert.equal(requireAgentGraphState(langGraphResult).finalMessage, "approved");
assert.equal(langGraphResult.riskStrategy?.route, "standard");
assert.deepEqual(splitGraphCalls, ["memoryRead", "caseUnderstanding", "ruleGuardrail", "queryRouter", "afterSalesStrategy", "afterSalesReply", "afterSalesQa", "afterSalesFinalize"]);
assert(langGraphResult.traceEvents.some((event) => event.type === "graph.node.started" && event.payload?.nodeName === "memoryRead"));
assert(langGraphResult.traceEvents.some((event) => event.type === "graph.node.completed" && event.payload?.nodeName === "afterSalesFinalize"));
assert(langGraphResult.graphRuntime?.streamEvents.some((event) => event.kind === "node_started" && event.nodeName === "memoryRead"));
assert(langGraphResult.graphRuntime?.streamEvents.some((event) => event.kind === "node_completed" && event.nodeName === "afterSalesFinalize"));
assert(langGraphResult.graphRuntime?.streamEvents.some((event) => event.kind === "update" && event.nodeName === "afterSalesFinalize"));
assert(langGraphResult.graphRuntime?.checkpoints.length >= 1);

const streamingCalls = [];
const streamingGraph = createCustomerServiceLangGraph({
  memoryRead: async () => {
    streamingCalls.push("memoryRead");
    return {
      memory: {
        conversationId: "conversation_stream",
        ticketId: "T-stream",
        rawMessages: [],
        actionHistory: [],
        lastUpdatedAt: "2026-06-14T00:00:00.000Z"
      }
    };
  },
  caseUnderstanding: async () => {
    streamingCalls.push("caseUnderstanding");
    return { structuredCase: { originalMessage: "stream test", missingFields: [] } };
  },
  ruleGuardrail: async () => {
    streamingCalls.push("ruleGuardrail");
    return { guardrail: { requiredHumanHandoff: false, guardrailReason: "ok" } };
  },
  queryRouter: async () => {
    streamingCalls.push("queryRouter");
    return { routeDecision: { routeType: "general_service" }, branch: "general_service_flow", clarificationLoopExceeded: false };
  },
  generalService: async () => {
    streamingCalls.push("generalService");
    return { generalService: { category: "product_specs", answer: "ok" } };
  },
  generalReviewQa: async () => {
    streamingCalls.push("generalReviewQa");
    return {};
  },
  generalFinalize: async () => {
    streamingCalls.push("generalFinalize");
    return {
      visibleStatus: "sent",
      finalMessage: "stream approved",
      finalAction: "send",
      ticketStatus: "completed"
    };
  },
  afterSalesStrategy: async () => ({}),
  afterSalesReply: async () => ({}),
  afterSalesQa: async () => ({}),
  afterSalesFinalize: async () => ({}),
  clarification: async () => ({}),
  humanHandoff: async () => ({})
});

const streamChunks = [];
for await (const chunk of streamingGraph.stream(createInputWorkflowState({ conversationId: "conversation_stream", content: "流式测试" }))) {
  streamChunks.push(chunk);
}

assert(streamChunks.some((chunk) => chunk.kind === "runtime" && chunk.event.kind === "node_started" && chunk.event.nodeName === "memoryRead"));
assert(streamChunks.some((chunk) => chunk.kind === "runtime" && chunk.event.kind === "node_completed" && chunk.event.nodeName === "generalFinalize"));
assert.equal(streamChunks.at(-1).kind, "final");
assert.equal(requireAgentGraphState(streamChunks.at(-1).graph).finalMessage, "stream approved");
assert.deepEqual(streamingCalls, ["memoryRead", "caseUnderstanding", "ruleGuardrail", "queryRouter", "generalService", "generalReviewQa", "generalFinalize"]);

const failingGraph = createCustomerServiceLangGraph({
  memoryRead: async () => {
    throw new Error("memory adapter unavailable");
  },
  caseUnderstanding: async () => {
    throw new Error("should be skipped after graph halt");
  },
  ruleGuardrail: async () => ({}),
  queryRouter: async () => ({}),
  generalService: async () => ({}),
  generalReviewQa: async () => ({}),
  generalFinalize: async () => ({}),
  afterSalesStrategy: async () => ({}),
  afterSalesReply: async () => ({}),
  afterSalesQa: async () => ({}),
  afterSalesFinalize: async () => ({}),
  clarification: async () => ({}),
  humanHandoff: async () => ({})
});

const failedGraphResult = await failingGraph.invoke(
  createInputWorkflowState({
    conversationId: "conversation_failed",
    content: "失败兜底测试"
  })
);

assert.equal(failedGraphResult.finalAction, "handoff");
assert.equal(failedGraphResult.ticketStatus, "handoff");
assert.equal(failedGraphResult.failedNode, "memoryRead");
assert.equal(failedGraphResult.failurePolicy?.fallbackAction, "handoff");
assert.equal(failedGraphResult.graphExecutionHalted, true);
assert(failedGraphResult.traceEvents.some((event) => event.type === "graph.node.failed" && event.payload?.nodeName === "memoryRead"));
assert(failedGraphResult.graphRuntime?.streamEvents.some((event) => event.kind === "error" && event.nodeName === "memoryRead"));

const replyFallbackGraph = createCustomerServiceLangGraph({
  memoryRead: async () => ({
    memory: {
      conversationId: "conversation_reply_fallback",
      ticketId: "T-reply",
      rawMessages: [],
      actionHistory: [],
      lastUpdatedAt: "2026-06-14T00:00:00.000Z"
    }
  }),
  caseUnderstanding: async () => ({
    structuredCase: {
      originalMessage: "耳机杂音，想退款",
      productInfo: "AirBuds Pro X",
      customerIntent: "quality_issue",
      customerRequest: "退款",
      missingFields: ["订单号", "故障凭证"]
    }
  }),
  ruleGuardrail: async () => ({ guardrail: { requiredHumanHandoff: false, guardrailReason: "ok" } }),
  queryRouter: async () => ({ routeDecision: { routeType: "after_sales" }, branch: "after_sales_flow", clarificationLoopExceeded: false }),
  afterSalesStrategy: async () => ({ riskStrategy: { riskLevel: "medium", strategyActions: [], prohibitedCommitments: [], requiredDisclaimers: [], handoffRequired: false, rationale: "safe" } }),
  afterSalesReply: async () => {
    throw new Error("template.retrieve timeout");
  },
  afterSalesQa: async () => {
    throw new Error("should be skipped after safe template fallback");
  },
  afterSalesFinalize: async () => ({}),
  generalService: async () => ({}),
  generalReviewQa: async () => ({}),
  generalFinalize: async () => ({}),
  clarification: async () => ({}),
  humanHandoff: async () => ({})
});

const replyFallbackResult = await replyFallbackGraph.invoke(
  createInputWorkflowState({
    conversationId: "conversation_reply_fallback",
    content: "耳机杂音，想退款"
  })
);

assert.equal(replyFallbackResult.failedNode, "afterSalesReply");
assert.equal(replyFallbackResult.failurePolicy?.fallbackAction, "safe_template");
assert.equal(replyFallbackResult.finalAction, "send");
assert.equal(replyFallbackResult.ticketStatus, "completed");
assert.match(replyFallbackResult.finalMessage, /暂时无法生成个性化回复|补充订单信息/);
const bannedFallbackEvidenceTerms = ["图片", "照片", "截图", "视觉凭证", "图像", "image", "photo", "screenshot", "visual proof", "鍥剧墖", "鐓х墖", "鎴浘", "瑙嗚鍑瘉"];
assert.deepEqual(
  bannedFallbackEvidenceTerms.filter((term) => replyFallbackResult.finalMessage.includes(term)),
  []
);
assert(replyFallbackResult.graphRuntime?.streamEvents.some((event) => event.kind === "error" && event.nodeName === "afterSalesReply" && event.fallbackAction === "safe_template"));

console.log("graph state tests passed");
