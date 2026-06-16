import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const datasetPath = join(root, "tests", "evals", ".dataset.json");
const outputPath = join(root, "docs", "eval-artifacts", "agent-performance-summary.json");
const baseUrl = (process.env.CUSTOMER_SERVICE_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const requestTimeoutMs = Number(process.env.CUSTOMER_SERVICE_EVAL_TIMEOUT_MS ?? "45000");

const NEGATED_COMMITMENT_MARKERS = ["不", "未", "无法", "不能", "不得", "不可", "避免", "暂不", "暂不能", "不会", "不应"];
const INTENT_ALIASES = {
  普通咨询: "general_question",
  通用咨询: "general_question",
  商品咨询: "general_question",
  咨询产品性能: "general_question",
  查询配送时间: "general_question",
  查询产品规格: "general_question",
  查询物流信息: "general_question",
  质量问题: "quality_issue",
  质量售后: "quality_issue",
  质量故障: "quality_issue",
  配件缺失: "accessory_missing",
  缺配件: "accessory_missing",
  物流破损: "logistics_damage",
  物流损坏: "logistics_damage",
  索赔: "logistics_damage",
  仅退款: "refund_only_request",
  仅退款诉求: "refund_only_request",
  要求仅退款: "refund_only_request",
  退货咨询: "rule_consultation",
  规则咨询: "rule_consultation",
  直播承诺争议: "livestream_promise_dispute",
  直播赠品争议: "livestream_promise_dispute",
  投诉升级: "complaint_escalation",
  投诉: "complaint_escalation",
  不明确: "unclear",
  信息不足: "unclear"
};

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}

function userTurns(golden) {
  return (golden.turns ?? []).filter((turn) => turn.role === "user").map((turn) => turn.content);
}

function historyFromTurns(turns) {
  return turns.map((turn, index) => ({
    id: `perf-history-${index}`,
    role: turn.role === "assistant" ? "agent" : "user",
    content: turn.content,
    createdAt: "2026-06-15T00:00:00.000Z"
  }));
}

function isNegatedCommitment(text, index) {
  const prefix = text.slice(Math.max(0, index - 12), index);
  return NEGATED_COMMITMENT_MARKERS.some((marker) => prefix.includes(marker));
}

function forbiddenHits(text, phrases) {
  const hits = [];
  for (const phrase of phrases ?? []) {
    if (!phrase) continue;
    let start = text.indexOf(phrase);
    while (start !== -1) {
      if (!isNegatedCommitment(text, start)) {
        hits.push(phrase);
        break;
      }
      start = text.indexOf(phrase, start + phrase.length);
    }
  }
  return hits;
}

async function postChat(content, conversationId, priorTurns) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId,
        content,
        images: [],
        history: historyFromTurns(priorTurns)
      }),
      signal: controller.signal
    });
    const elapsedMs = performance.now() - startedAt;
    if (!response.ok) {
      return { ok: false, elapsedMs, error: `HTTP ${response.status}: ${await response.text()}` };
    }
    return { ok: true, elapsedMs, payload: await response.json() };
  } catch (error) {
    return { ok: false, elapsedMs: performance.now() - startedAt, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

function countBy(items, pick) {
  const result = {};
  for (const item of items) {
    const key = pick(item) ?? "unknown";
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

const dataset = JSON.parse(readFileSync(datasetPath, "utf8"));
const caseResults = [];
const allTurnLatencies = [];

for (const golden of dataset) {
  const expected = golden.additional_metadata ?? {};
  const conversationId = `perf-${golden.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const priorTurns = [];
  const turnResults = [];
  let lastPayload = null;
  let error = null;

  for (const content of userTurns(golden)) {
    const result = await postChat(content, conversationId, priorTurns);
    turnResults.push({
      user_message: content,
      ok: result.ok,
      elapsed_ms: round(result.elapsedMs),
      error: result.error
    });
    allTurnLatencies.push(result.elapsedMs);
    if (!result.ok) {
      error = result.error;
      break;
    }
    const assistantText = result.payload.finalMessage ?? "";
    priorTurns.push({ role: "user", content });
    priorTurns.push({ role: "assistant", content: assistantText });
    lastPayload = result.payload;
  }

  const actualRoute = lastPayload?.routeDecision?.routeType;
  const actualStatus = lastPayload?.visibleStatus;
  const actualIntent = INTENT_ALIASES[lastPayload?.structuredCase?.customerIntent] ?? lastPayload?.structuredCase?.customerIntent;
  const finalMessage = lastPayload?.finalMessage ?? "";
  const hits = forbiddenHits(finalMessage, expected.forbidden_phrases);

  caseResults.push({
    name: golden.name,
    scenario: golden.scenario,
    turns: userTurns(golden).length,
    expected_route: expected.expected_route,
    actual_route: actualRoute,
    expected_status: expected.expected_status,
    actual_status: actualStatus,
    expected_intent: expected.expected_intent,
    actual_intent: actualIntent,
    expected_risk: expected.expected_risk,
    route_passed: actualRoute === expected.expected_route,
    status_passed: actualStatus === expected.expected_status,
    intent_passed: actualIntent === expected.expected_intent,
    forbidden_passed: hits.length === 0,
    forbidden_hits: hits,
    error,
    turn_results: turnResults,
    total_elapsed_ms: round(turnResults.reduce((sum, item) => sum + (item.elapsed_ms ?? 0), 0)),
    final_elapsed_ms: turnResults.at(-1)?.elapsed_ms ?? 0,
    trace_event_count: lastPayload?.traceEvents?.length ?? 0,
    agent_count: lastPayload?.agents?.length ?? 0,
    knowledge_base: lastPayload?.retrievalResult?.knowledgeBase
  });
}

const total = caseResults.length;
const errored = caseResults.filter((item) => item.error).length;
const contractPassed = caseResults.filter((item) =>
  !item.error && item.route_passed && item.status_passed && item.intent_passed && item.forbidden_passed
).length;

const summary = {
  generated_at: new Date().toISOString(),
  base_url: baseUrl,
  dataset_path: datasetPath,
  total_cases: total,
  total_turns: dataset.reduce((sum, item) => sum + userTurns(item).length, 0),
  contract_passed: contractPassed,
  contract_pass_rate: round(contractPassed / total),
  route_accuracy: round(caseResults.filter((item) => item.route_passed).length / total),
  status_accuracy: round(caseResults.filter((item) => item.status_passed).length / total),
  intent_accuracy: round(caseResults.filter((item) => item.intent_passed).length / total),
  forbidden_pass_rate: round(caseResults.filter((item) => item.forbidden_passed).length / total),
  error_count: errored,
  error_rate: round(errored / total),
  avg_turn_latency_ms: round(average(allTurnLatencies)),
  p50_turn_latency_ms: round(percentile(allTurnLatencies, 0.5)),
  p95_turn_latency_ms: round(percentile(allTurnLatencies, 0.95)),
  max_turn_latency_ms: round(Math.max(...allTurnLatencies, 0)),
  avg_trace_event_count: round(average(caseResults.map((item) => item.trace_event_count))),
  avg_agent_count: round(average(caseResults.map((item) => item.agent_count))),
  route_distribution: countBy(caseResults, (item) => item.expected_route),
  status_distribution: countBy(caseResults, (item) => item.expected_status),
  risk_distribution: countBy(caseResults, (item) => item.expected_risk),
  failed_cases: caseResults
    .filter((item) => item.error || !item.route_passed || !item.status_passed || !item.intent_passed || !item.forbidden_passed)
    .map((item) => ({
      name: item.name,
      error: item.error,
      expected_route: item.expected_route,
      actual_route: item.actual_route,
      expected_status: item.expected_status,
      actual_status: item.actual_status,
      expected_intent: item.expected_intent,
      actual_intent: item.actual_intent,
      forbidden_hits: item.forbidden_hits
    }))
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify({ summary, cases: caseResults }, null, 2)}\n`, "utf8");
console.log(JSON.stringify(summary, null, 2));
