"use client";

import { FormEvent, useMemo, useState } from "react";
import type { ChatApiResponse, ConversationMessage, DemoScenario, TicketStatus } from "../lib/types";
import scenarios from "../data/demo-scenarios.json";

const demoScenarios = scenarios as DemoScenario[];

type BadcaseType = "follow_up_after_reply" | "wrong_intent" | "wrong_rule" | "over_commitment" | "manual_mark" | "wrong_route" | "rag_miss";

function routeLabel(route?: string) {
  if (route === "general_service") return "普通客服";
  if (route === "after_sales") return "售后服务";
  if (route === "needs_clarification") return "补充信息";
  if (route === "handoff_required") return "人工兜底";
  return "待处理";
}

function statusLabel(action?: string) {
  if (action === "handoff") return "正在转接人工";
  if (action === "send") return "已自动回复";
  return "待处理";
}

function ticketStatusLabel(status?: TicketStatus) {
  if (status === "pending") return "待处理";
  if (status === "processing") return "处理中";
  if (status === "needs_clarification") return "待补充";
  if (status === "needs_human_review") return "待人工复核";
  if (status === "handoff") return "已转人工";
  if (status === "completed") return "已完成";
  if (status === "badcase_marked") return "已标记 badcase";
  return "待处理";
}

export default function Home() {
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [content, setContent] = useState("");
  const [graph, setGraph] = useState<ChatApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [badcaseType, setBadcaseType] = useState<BadcaseType>("manual_mark");
  const [badcaseNote, setBadcaseNote] = useState("");
  const [badcaseSaved, setBadcaseSaved] = useState(false);

  const riskTone = useMemo(() => {
    if (graph?.finalAction === "handoff") return "risk-high";
    if (graph?.riskStrategy?.riskLevel === "high") return "risk-high";
    if (graph?.riskStrategy?.riskLevel === "medium" || graph?.routeDecision?.routeType === "needs_clarification") return "risk-medium";
    return "risk-low";
  }, [graph]);

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    if (!content.trim()) return;
    setLoading(true);
    setBadcaseSaved(false);

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, content, images: [], history: messages })
    });

    const result = (await response.json()) as ChatApiResponse;
    window.localStorage.setItem(`agent-trace:${result.traceId}`, JSON.stringify(result));
    setConversationId(result.conversationId);
    setMessages([
      ...result.messages,
      { id: crypto.randomUUID(), role: "agent", content: result.finalMessage, createdAt: new Date().toISOString() }
    ]);
    setGraph(result);
    setContent("");
    setLoading(false);
  }

  function loadScenario(scenario: DemoScenario) {
    setContent(scenario.message);
    setBadcaseSaved(false);
  }

  async function saveBadcase() {
    if (!graph) return;
    await fetch("/api/badcases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userMessage: graph.messages.at(-1)?.content ?? "",
        agentAnalysis: graph,
        badcaseType,
        note: badcaseNote
      })
    });
    setBadcaseSaved(true);
    setBadcaseNote("");
  }

  const ticketStatus = graph ? ticketStatusLabel(graph.ticketStatus) : "待处理";

  return (
    <main className="shell">
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">E-commerce service console</p>
            <h1>3C 电商客服自动回复后台</h1>
          </div>
          <div className="top-actions">
            <a className="trace-link" href="/badcases">Badcase 复盘</a>
            <div className="route-pill">{routeLabel(graph?.routeDecision?.routeType)}</div>
            <div className={`risk-pill ${riskTone}`}>{statusLabel(graph?.finalAction)}</div>
          </div>
        </header>

        <div className="route-summary" aria-label="会话概览">
          <div><span>会话编号</span><strong>{graph?.conversationId ?? "未创建"}</strong></div>
          <div><span>处理状态</span><strong>{ticketStatus}</strong></div>
          <div><span>问题链路</span><strong>{routeLabel(graph?.routeDecision?.routeType)}</strong></div>
          <div><span>风险等级</span><strong>{graph?.riskStrategy?.riskLevel ?? (graph?.finalAction === "handoff" ? "high" : "none")}</strong></div>
        </div>

        <div className="main-grid service-grid">
          <section className="chat-panel" aria-label="客服对话窗口">
            <div className="scenario-strip" aria-label="演示场景">
              {demoScenarios.map((scenario) => (
                <button key={scenario.id} type="button" onClick={() => loadScenario(scenario)} title={scenario.title}>{scenario.title}</button>
              ))}
            </div>

            <div className="messages" aria-live="polite">
              {messages.length === 0 ? (
                <div className="empty-state">
                  <h2>客服对话窗口</h2>
                  <p>选择一个 3C 普通咨询或售后场景，系统会先结构化问题，再做规则兜底和 LLM 路由。审核通过直接回复客户；无法安全回复时显示正在转接人工。</p>
                </div>
              ) : (
                messages.map((message) => (
                  <article key={message.id} className={`message ${message.role}`}>
                    <span>{message.role === "user" ? "客户" : "智能客服"}</span>
                    <p>{message.content}</p>
                  </article>
                ))
              )}
            </div>

            <form className="composer" onSubmit={sendMessage}>
              <label>
                <span>客户消息</span>
                <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="例如：耳机用了两天有杂音，我要退款。" />
              </label>
              <button type="submit" disabled={loading || !content.trim()}>{loading ? "处理中..." : "触发自动客服"}</button>
            </form>
          </section>

          <aside className="ticket-panel" aria-label="处理观测">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Processing overview</p>
                <h2>处理观测</h2>
              </div>
              <span>{ticketStatus}</span>
            </div>

            <section className="ticket-card active">
              <div><strong>{graph?.conversationId ?? "DEMO"}</strong><span>{ticketStatus}</span></div>
              <p>{graph?.structuredCase?.issueSummary ?? "等待客户发起咨询"}</p>
              <small>来源平台：demo ｜ 问题类型：{routeLabel(graph?.routeDecision?.routeType)}</small>
            </section>

            <section className="ticket-details">
              <h3>处理摘要</h3>
              <p><strong>结构化问题：</strong>{graph?.structuredCase?.customerIntent ?? "-"}</p>
              <p><strong>路由理由：</strong>{graph?.routeDecision?.rationale ?? "-"}</p>
              <p><strong>当前动作：</strong>{graph?.templateOutput?.finalAction === "handoff" ? "转人工" : graph ? "自动回复" : "待处理"}</p>
              <p><strong>记忆摘要：</strong>{graph?.memory.compressedSummary ?? "-"}</p>
            </section>

            {graph ? (
              <a className="trace-toggle" href={`/trace?traceId=${encodeURIComponent(graph.traceId)}`}>查看日志 / 流程观测页</a>
            ) : (
              <button className="trace-toggle" type="button" disabled>查看日志 / 流程观测页</button>
            )}

            <section className="badcase-box">
              <h3>badcase 标记</h3>
              <select value={badcaseType} onChange={(event) => setBadcaseType(event.target.value as BadcaseType)}>
                <option value="manual_mark">人工标记</option>
                <option value="wrong_route">路由错误</option>
                <option value="rag_miss">RAG 未命中</option>
                <option value="follow_up_after_reply">用户继续追问</option>
                <option value="wrong_intent">意图识别错误</option>
                <option value="wrong_rule">规则引用错误</option>
                <option value="over_commitment">回复过度承诺</option>
              </select>
              <textarea value={badcaseNote} onChange={(event) => setBadcaseNote(event.target.value)} placeholder="记录原因" />
              <button type="button" onClick={saveBadcase} disabled={!graph}>保存 badcase</button>
              {badcaseSaved ? <p className="saved">已记录</p> : null}
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
