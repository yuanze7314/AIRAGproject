"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { BadcaseRecord, RouteType } from "../../lib/types";

type SourceFilter = "" | "manual" | "auto";

const badcaseTypes = [
  "clarification_loop_exceeded",
  "llm_fallback",
  "wrong_route_guarded",
  "qa_failed",
  "manual_mark",
  "wrong_route",
  "rag_miss",
  "wrong_intent",
  "wrong_rule",
  "over_commitment",
  "follow_up_after_reply"
];

function routeLabel(route?: string) {
  if (route === "general_service") return "普通客服";
  if (route === "after_sales") return "售后服务";
  if (route === "needs_clarification") return "补充信息";
  if (route === "handoff_required") return "人工兜底";
  return "未知";
}

function sourceLabel(source?: string) {
  if (source === "auto") return "自动记录";
  if (source === "manual") return "人工标记";
  return "未知来源";
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function short(value?: string) {
  if (!value) return "-";
  return value.length > 120 ? `${value.slice(0, 120)}...` : value;
}

export default function BadcasesPage() {
  const [records, setRecords] = useState<BadcaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [type, setType] = useState("");
  const [source, setSource] = useState<SourceFilter>("");
  const [routeType, setRouteType] = useState<RouteType | "">("");
  const [traceId, setTraceId] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (source) params.set("source", source);
    if (routeType) params.set("routeType", routeType);
    if (traceId.trim()) params.set("traceId", traceId.trim());
    return params.toString();
  }, [routeType, source, traceId, type]);

  async function loadBadcases() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/badcases${query ? `?${query}` : ""}`);
      if (!response.ok) throw new Error("badcase request failed");
      setRecords((await response.json()) as BadcaseRecord[]);
    } catch {
      setError("读取 badcase 列表失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBadcases();
  }, [query]);

  function submit(event: FormEvent) {
    event.preventDefault();
    loadBadcases();
  }

  function resetFilters() {
    setType("");
    setSource("");
    setRouteType("");
    setTraceId("");
  }

  return (
    <main className="shell">
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Badcase review</p>
            <h1>Badcase 复盘</h1>
          </div>
          <nav className="top-actions" aria-label="页面导航">
            <a className="trace-link" href="/">返回客服后台</a>
          </nav>
        </header>

        <form className="filter-bar" onSubmit={submit} aria-label="badcase 筛选">
          <label>
            <span>类型</span>
            <select value={type} onChange={(event) => setType(event.target.value)}>
              <option value="">全部类型</option>
              {badcaseTypes.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>来源</span>
            <select value={source} onChange={(event) => setSource(event.target.value as SourceFilter)}>
              <option value="">全部来源</option>
              <option value="auto">自动记录</option>
              <option value="manual">人工标记</option>
            </select>
          </label>
          <label>
            <span>路由</span>
            <select value={routeType} onChange={(event) => setRouteType(event.target.value as RouteType | "")}>
              <option value="">全部路由</option>
              <option value="general_service">普通客服</option>
              <option value="after_sales">售后服务</option>
              <option value="needs_clarification">补充信息</option>
              <option value="handoff_required">人工兜底</option>
            </select>
          </label>
          <label>
            <span>Trace ID</span>
            <input value={traceId} onChange={(event) => setTraceId(event.target.value)} placeholder="trace_xxx" />
          </label>
          <div className="filter-actions">
            <button type="submit">筛选</button>
            <button type="button" onClick={resetFilters}>清空</button>
          </div>
        </form>

        <section className="route-summary" aria-label="badcase 统计">
          <div><span>当前结果</span><strong>{loading ? "读取中" : `${records.length} 条`}</strong></div>
          <div><span>自动记录</span><strong>{records.filter((record) => record.source === "auto").length}</strong></div>
          <div><span>人工标记</span><strong>{records.filter((record) => record.source === "manual").length}</strong></div>
          <div><span>最新类型</span><strong>{records[0]?.badcaseType ?? "-"}</strong></div>
        </section>

        {error ? (
          <section className="empty-state" role="alert">
            <h2>读取失败</h2>
            <p>{error}</p>
          </section>
        ) : loading ? (
          <section className="empty-state" role="status">
            <h2>正在读取 badcase</h2>
            <p>正在加载本地 badcase store。</p>
          </section>
        ) : records.length === 0 ? (
          <section className="empty-state" role="status">
            <h2>暂无 badcase</h2>
            <p>当前筛选条件下没有记录。可以回到客服后台触发对话，或人工标记一条复盘记录。</p>
          </section>
        ) : (
          <section className="badcase-list" aria-label="badcase 列表">
            {records.map((record) => (
              <article key={record.id} className="badcase-row">
                <div className="badcase-row-head">
                  <div>
                    <strong>{record.badcaseType}</strong>
                    <span>{sourceLabel(record.source)} ｜ {routeLabel(record.routeType)} ｜ {formatTime(record.createdAt)}</span>
                  </div>
                  {record.traceId ? <a href={`/trace?traceId=${encodeURIComponent(record.traceId)}`}>查看 trace</a> : null}
                </div>
                <p><strong>用户消息：</strong>{short(record.userMessage)}</p>
                <p><strong>复盘备注：</strong>{short(record.note)}</p>
                <p><strong>最终状态：</strong>{record.agentAnalysis.visibleStatus} ｜ <strong>最终动作：</strong>{record.agentAnalysis.finalAction}</p>
              </article>
            ))}
          </section>
        )}
      </section>
    </main>
  );
}
