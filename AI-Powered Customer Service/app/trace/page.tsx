"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChatApiResponse, TraceEvent } from "../../lib/types";

function routeLabel(route?: string) {
  if (route === "general_service") return "普通客服";
  if (route === "after_sales") return "售后服务";
  if (route === "needs_clarification") return "补充信息";
  if (route === "handoff_required") return "人工兜底";
  return "未知";
}

function statusLabel(status?: string) {
  if (status === "sent") return "已回复";
  if (status === "needs_clarification") return "待补充";
  if (status === "handoff") return "已转人工";
  if (status === "completed") return "完成";
  if (status === "needs_rewrite") return "待重写";
  if (status === "handoff_required") return "需人工";
  return status ?? "-";
}

function eventLabel(type: TraceEvent["type"]) {
  const labels: Record<TraceEvent["type"], string> = {
    "memory.loaded": "记忆读取",
    "case.structured": "案件结构化",
    "guardrail.checked": "规则兜底",
    "router.decided": "路由判断",
    "rag.retrieved": "RAG 检索",
    "branch.generated": "分支生成",
    "review.completed": "普通客服审核",
    "qa.completed": "售后 QA",
    "template.validated": "模板校验",
    "message.sent": "客户回复",
    "handoff.started": "转人工",
    "badcase.marked": "Badcase"
  };
  return labels[type];
}

function joinList(value?: string[]) {
  return value?.length ? value.join("、") : "-";
}

function short(value?: string, fallback = "-") {
  if (!value) return fallback;
  return value.length > 140 ? `${value.slice(0, 140)}...` : value;
}

function reviewAttempt(value: ChatApiResponse["qaResult"] | ChatApiResponse["reviewLoop"] | undefined): number | string {
  if (!value) return "-";
  if (value.attempts?.length) return value.attempts.length;
  return "attempt" in value && typeof value.attempt === "number" ? value.attempt : value.currentAttempt;
}

function reviewFailures(value: ChatApiResponse["qaResult"] | ChatApiResponse["reviewLoop"] | undefined): string[] | undefined {
  if (!value) return undefined;
  return "reasons" in value && Array.isArray(value.reasons) ? value.reasons : value.failureReasons;
}

export default function TracePage() {
  const [graph, setGraph] = useState<ChatApiResponse | null>(null);
  const [traceId, setTraceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadTrace() {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("traceId") ?? "";
      setTraceId(id);
      if (!id) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/traces/${encodeURIComponent(id)}`);
        if (response.ok) {
          setGraph((await response.json()) as ChatApiResponse);
          setLoading(false);
          return;
        }

        const raw = window.localStorage.getItem(`agent-trace:${id}`);
        if (raw) setGraph(JSON.parse(raw) as ChatApiResponse);
        else setError("没有找到这次 trace。");
      } catch {
        setError("读取 trace 失败。");
      } finally {
        setLoading(false);
      }
    }

    loadTrace();
  }, []);

  const events = useMemo(() => graph?.traceEvents ?? [], [graph]);
  const topHits = graph?.retrievalResult?.rerankedTopK ?? [];
  const structuredCase = graph?.structuredCase;
  const qaResult = graph?.qaResult ?? graph?.reviewLoop;

  return (
    <main className="shell">
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Process trace</p>
            <h1>日志 / 流程观测页</h1>
          </div>
          <nav className="top-actions" aria-label="页面导航">
            <a className="trace-link" href="/badcases">Badcase 复盘</a>
            <a className="trace-link" href="/">返回客服后台</a>
          </nav>
        </header>

        {loading ? (
          <section className="empty-state" role="status">
            <h2>正在读取流程日志</h2>
            <p>正在从本地 trace store 加载执行链路。</p>
          </section>
        ) : !graph ? (
          <section className="empty-state" role="status">
            <h2>未找到流程日志</h2>
            <p>{traceId ? error || "当前没有这次 trace 的记录。" : "缺少 traceId，请从工单入口进入日志页。"}</p>
          </section>
        ) : (
          <>
            <section className="route-summary" aria-label="流程摘要">
              <div><span>Trace ID</span><strong>{graph.traceId}</strong></div>
              <div><span>工单</span><strong>{graph.ticketId}</strong></div>
              <div><span>路由</span><strong>{routeLabel(graph.routeDecision?.routeType)}</strong></div>
              <div><span>最终状态</span><strong>{statusLabel(graph.visibleStatus)}</strong></div>
            </section>

            <section className="insight-grid" aria-label="复盘摘要">
              <article className="insight-block">
                <span>缺失字段变化</span>
                <p><strong>上一轮：</strong>{joinList(structuredCase?.previousMissingFields)}</p>
                <p><strong>已解决：</strong>{joinList(structuredCase?.resolvedMissingFields)}</p>
                <p><strong>新增：</strong>{joinList(structuredCase?.newMissingFields)}</p>
                <p><strong>当前仍缺：</strong>{joinList(structuredCase?.missingFields)}</p>
              </article>
              <article className="insight-block">
                <span>RAG grounding</span>
                <p><strong>知识库：</strong>{graph.retrievalResult?.knowledgeBase ?? "-"}</p>
                <p><strong>VectorStore：</strong>{graph.retrievalResult?.vectorStoreSource ?? "-"}</p>
                <p><strong>Reranker：</strong>{graph.retrievalResult?.rerankerSource ?? "-"}</p>
                <p><strong>置信度：</strong>{graph.retrievalResult ? graph.retrievalResult.groundingConfidence.toFixed(2) : "-"}</p>
                <p><strong>是否不足：</strong>{graph.retrievalResult?.insufficientGrounding ? "是" : graph.retrievalResult ? "否" : "-"}</p>
                <p><strong>Top1：</strong>{topHits[0]?.title ?? "-"}</p>
              </article>
              <article className="insight-block">
                <span>QA / Review</span>
                <p><strong>是否通过：</strong>{qaResult ? (qaResult.passed ? "通过" : "未通过") : "-"}</p>
                <p><strong>尝试次数：</strong>{reviewAttempt(qaResult)}</p>
                <p><strong>失败原因：</strong>{joinList(reviewFailures(qaResult))}</p>
                <p><strong>输出动作：</strong>{graph.templateOutput?.finalAction === "handoff" ? "转人工" : "自动回复"}</p>
              </article>
            </section>

            <div className="trace-layout">
              <section className="trace-panel standalone" aria-label="流程事件">
                <div className="panel-head">
                  <div>
                    <p className="eyebrow">Trace events</p>
                    <h2>执行事件</h2>
                  </div>
                  <span>{events.length} 条</span>
                </div>
                <div className="timeline">
                  {events.map((event, index) => (
                    <article key={event.id} className="timeline-item">
                      <div className="timeline-index">{index + 1}</div>
                      <div>
                        <div className="timeline-head">
                          <strong>{eventLabel(event.type)}</strong>
                          <span className={`status ${event.status}`}>{statusLabel(event.status)}</span>
                        </div>
                        <p>{event.summary}</p>
                        {event.payload ? <pre>{JSON.stringify(event.payload, null, 2)}</pre> : null}
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <aside className="trace-panel standalone" aria-label="关键对象">
                <div className="panel-head">
                  <div>
                    <p className="eyebrow">Runtime objects</p>
                    <h2>关键对象</h2>
                  </div>
                </div>
                <section className="object-block">
                  <h3>StructuredCase</h3>
                  <pre>{JSON.stringify(graph.structuredCase, null, 2)}</pre>
                </section>
                <section className="object-block">
                  <h3>RouteDecision</h3>
                  <pre>{JSON.stringify(graph.routeDecision, null, 2)}</pre>
                </section>
                <section className="object-block">
                  <h3>RAG TopK</h3>
                  {topHits.length ? (
                    <div className="hit-list">
                      {topHits.map((hit) => (
                        <article key={hit.id}>
                          <strong>{hit.title}</strong>
                          <span>{hit.category} ｜ score {(hit.rerankScore ?? hit.score).toFixed(2)}</span>
                          <p>{short(hit.content)}</p>
                        </article>
                      ))}
                    </div>
                  ) : <p className="muted">本次没有 RAG 命中。</p>}
                </section>
                <section className="object-block">
                  <h3>TemplateOutput</h3>
                  <pre>{JSON.stringify(graph.templateOutput, null, 2)}</pre>
                </section>
              </aside>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
