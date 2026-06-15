"use client";

import { FormEvent, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CaretDown, PaperPlaneTilt, SlidersHorizontal, X } from "@phosphor-icons/react";
import type { AgentNode, ChatApiResponse, ConversationMessage, DemoScenario, GraphRuntimeEvent, TicketStatus } from "../lib/types";
import scenarios from "../data/demo-scenarios.json";

const demoScenarios = scenarios as DemoScenario[];

type BadcaseType = "follow_up_after_reply" | "wrong_intent" | "wrong_rule" | "over_commitment" | "manual_mark" | "wrong_route" | "rag_miss";
type ProgressStatus = "pending" | "running" | "completed" | "failed";

type ProgressDefinition = {
  nodeName: string;
  label: string;
  description: string;
};

type ProgressItem = ProgressDefinition & {
  status: ProgressStatus;
};

const preRouteProgress: ProgressDefinition[] = [
  { nodeName: "memoryRead", label: "读取记忆", description: "加载当前会话上下文" },
  { nodeName: "caseUnderstanding", label: "理解问题", description: "结构化客户诉求" },
  { nodeName: "ruleGuardrail", label: "规则兜底", description: "检查禁止承诺与转人工条件" },
  { nodeName: "queryRouter", label: "判断路径", description: "选择普通客服、售后或人工路径" }
];

const branchProgress: Record<string, ProgressDefinition[]> = {
  general_service: [
    { nodeName: "generalService", label: "检索知识", description: "查询通用客服知识" },
    { nodeName: "generalReviewQa", label: "质检复核", description: "检查回复边界" },
    { nodeName: "generalFinalize", label: "输出回复", description: "渲染客户可见话术" }
  ],
  after_sales: [
    { nodeName: "afterSalesStrategy", label: "检索规则", description: "匹配售后规则与相似案例" },
    { nodeName: "afterSalesReply", label: "生成回复", description: "结合模板生成售后话术" },
    { nodeName: "afterSalesQa", label: "质检复核", description: "调用 llm.judge 与 badcase 检查" },
    { nodeName: "afterSalesFinalize", label: "输出回复", description: "渲染客户可见话术" }
  ],
  needs_clarification: [
    { nodeName: "clarification", label: "补充信息", description: "整理需要客户补充的字段" }
  ],
  handoff_required: [
    { nodeName: "humanHandoff", label: "转接人工", description: "生成安全人工兜底话术" }
  ]
};

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

function runtimeNodeLabel(nodeName?: string) {
  const labels: Record<string, string> = {
    memoryRead: "Memory Read Node",
    caseUnderstanding: "Case Understanding Node",
    ruleGuardrail: "Rule Guardrail Node",
    queryRouter: "Query Router Node",
    generalService: "General Service Agent",
    generalReviewQa: "Response Review / QA Node",
    generalFinalize: "Template Output Agent",
    afterSalesStrategy: "After-Sales Strategy Agent",
    afterSalesReply: "After-Sales Reply Agent",
    afterSalesQa: "Response Review / QA Node",
    afterSalesFinalize: "Template Output Agent",
    clarification: "Clarification Agent",
    humanHandoff: "Human Handoff Agent"
  };
  return nodeName ? labels[nodeName] ?? nodeName : "LangGraph";
}

function buildRuntimeSteps(events: GraphRuntimeEvent[]): AgentNode<unknown>[] {
  const steps = new Map<string, AgentNode<unknown>>();

  for (const event of events) {
    if (!event.nodeName) continue;
    const previous = steps.get(event.nodeName);
    const status = event.kind === "error" ? "failed" : event.kind === "node_started" ? "running" : "completed";
    steps.set(event.nodeName, {
      name: runtimeNodeLabel(event.nodeName),
      status,
      summary: event.fallbackAction ? `${event.summary} ｜ fallback=${event.fallbackAction}` : event.summary,
      output: previous?.output
    });
  }

  return [...steps.values()];
}

function inferRouteFromEvents(events: GraphRuntimeEvent[], routeType?: string) {
  if (routeType) return routeType;
  if (events.some((event) => event.nodeName?.startsWith("afterSales"))) return "after_sales";
  if (events.some((event) => event.nodeName?.startsWith("general"))) return "general_service";
  if (events.some((event) => event.nodeName === "clarification")) return "needs_clarification";
  if (events.some((event) => event.nodeName === "humanHandoff")) return "handoff_required";
  return undefined;
}

function buildProgressItems(events: GraphRuntimeEvent[], routeType?: string, loading?: boolean): ProgressItem[] {
  const inferredRoute = inferRouteFromEvents(events, routeType);
  const definitions = [...preRouteProgress, ...(inferredRoute ? branchProgress[inferredRoute] ?? [] : [])];
  const statusByNode = new Map<string, ProgressStatus>();

  for (const event of events) {
    if (!event.nodeName) continue;
    if (event.kind === "error") statusByNode.set(event.nodeName, "failed");
    if (event.kind === "node_started") statusByNode.set(event.nodeName, "running");
    if (event.kind === "node_completed" || event.kind === "update") {
      if (statusByNode.get(event.nodeName) !== "failed") statusByNode.set(event.nodeName, "completed");
    }
  }

  if (loading && !events.length) statusByNode.set("memoryRead", "running");

  return definitions.map((definition) => ({
    ...definition,
    status: statusByNode.get(definition.nodeName) ?? "pending"
  }));
}

function currentProgressText(items: ProgressItem[], loading: boolean, graph: ChatApiResponse | null, streamError: string | null) {
  if (streamError) return "实时链路异常";
  const failed = items.find((item) => item.status === "failed");
  if (failed) return `${failed.label}失败，已进入安全兜底`;
  const running = items.find((item) => item.status === "running");
  if (running) return `正在${running.label}`;
  if (loading) return "智能客服处理中";
  if (graph?.finalAction === "handoff") return "已转接人工";
  if (graph?.finalAction === "send") return "已生成回复";
  return "等待客户消息";
}

function parseSseBuffer(buffer: string) {
  const blocks = buffer.split(/\n\n/);
  const rest = blocks.pop() ?? "";
  const messages = blocks
    .map((block) => {
      const lines = block.split(/\r?\n/);
      const event = lines.find((line) => line.startsWith("event: "))?.slice(7).trim() ?? "message";
      const data = lines
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice(6))
        .join("\n");
      return { event, data };
    })
    .filter((message) => message.data);

  return { messages, rest };
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const label = message.role === "user" ? "客户" : message.role === "agent" ? "智能客服" : "系统";

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className={`message ${message.role}`}
    >
      <span>{label}</span>
      <p>{message.content}</p>
    </motion.article>
  );
}

function RuntimeProgress({ items, compact = false }: { items: ProgressItem[]; compact?: boolean }) {
  const visibleItems = compact ? items.slice(0, 8) : items;

  return (
    <section className={`runtime-progress ${compact ? "compact" : ""}`} aria-label="智能客服处理进度">
      <div className="progress-track">
        {visibleItems.map((item, index) => (
          <motion.div
            layout
            key={item.nodeName}
            className={`progress-step ${item.status}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 32, delay: index * 0.025 }}
          >
            <motion.span
              className="progress-dot"
              animate={item.status === "running" ? { scale: [1, 1.14, 1] } : { scale: 1 }}
              transition={item.status === "running" ? { repeat: Infinity, duration: 1.2, ease: "easeInOut" } : undefined}
            />
            <strong>{item.label}</strong>
            {!compact ? <small>{item.description}</small> : null}
          </motion.div>
        ))}
      </div>
    </section>
  );
}

type DetailsDrawerProps = {
  open: boolean;
  onClose: () => void;
  graph: ChatApiResponse | null;
  ticketStatus: string;
  workflowSteps: AgentNode<unknown>[];
  progressItems: ProgressItem[];
  runtimeEvents: GraphRuntimeEvent[];
  toolEvents: ChatApiResponse["traceEvents"];
  ragHits: NonNullable<ChatApiResponse["retrievalResult"]>["rerankedTopK"];
  qaSummary: ChatApiResponse["qaResult"] | ChatApiResponse["reviewLoop"] | undefined;
  checkpointCount: number;
  runtimeEventCount: number;
  streamError: string | null;
  badcaseType: BadcaseType;
  badcaseNote: string;
  badcaseSaved: boolean;
  onBadcaseTypeChange: (value: BadcaseType) => void;
  onBadcaseNoteChange: (value: string) => void;
  onSaveBadcase: () => Promise<void>;
  onLoadScenario: (scenario: DemoScenario) => void;
};

function DetailsDrawer(props: DetailsDrawerProps) {
  return (
    <AnimatePresence>
      {props.open ? (
        <>
          <motion.button
            type="button"
            className="drawer-backdrop"
            aria-label="关闭流程详情"
            onClick={props.onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.aside
            className="details-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="流程详情"
            initial={{ opacity: 0, x: 36 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 36 }}
            transition={{ type: "spring", stiffness: 360, damping: 34 }}
          >
            <div className="drawer-head">
              <div>
                <p className="eyebrow">LangGraph runtime</p>
                <h2>流程详情</h2>
              </div>
              <button type="button" className="icon-button" onClick={props.onClose} aria-label="关闭流程详情">
                <X size={18} weight="bold" />
              </button>
            </div>

            <details className="detail-section" open>
              <summary><span>演示问题</span><CaretDown size={16} /></summary>
              <div className="scenario-list">
                {demoScenarios.map((scenario) => (
                  <button key={scenario.id} type="button" onClick={() => props.onLoadScenario(scenario)}>
                    {scenario.title}
                  </button>
                ))}
              </div>
            </details>

            <details className="detail-section" open>
              <summary><span>处理进度</span><CaretDown size={16} /></summary>
              <div className="summary-grid">
                <div><span>会话编号</span><strong>{props.graph?.conversationId ?? "未创建"}</strong></div>
                <div><span>处理状态</span><strong>{props.ticketStatus}</strong></div>
                <div><span>问题链路</span><strong>{routeLabel(props.graph?.routeDecision?.routeType)}</strong></div>
                <div><span>风险等级</span><strong>{props.graph?.riskStrategy?.riskLevel ?? (props.graph?.finalAction === "handoff" ? "high" : "none")}</strong></div>
              </div>
              <RuntimeProgress items={props.progressItems} />
              {props.streamError ? <p className="stream-error">{props.streamError}</p> : null}
            </details>

            <details className="detail-section">
              <summary><span>节点记录</span><CaretDown size={16} /></summary>
              <div className="mini-timeline">
                {props.workflowSteps.length ? props.workflowSteps.map((agent, index) => (
                  <article key={`${agent.name}-${index}`} className="mini-step">
                    <div className={`step-dot ${agent.status}`}>{index + 1}</div>
                    <div>
                      <div className="step-title"><strong>{agent.name}</strong><span>{agent.status}</span></div>
                      <p>{agent.summary}</p>
                    </div>
                  </article>
                )) : <p className="muted">暂无节点记录</p>}
              </div>
            </details>

            <details className="detail-section">
              <summary><span>Runtime / checkpoints</span><CaretDown size={16} /></summary>
              <div className="tool-list">
                <article>
                  <strong>stream</strong>
                  <span>{props.runtimeEventCount ? `updates + checkpoints ｜ ${props.runtimeEventCount} events` : "暂无运行时事件"}</span>
                </article>
                <article>
                  <strong>checkpoint</strong>
                  <span>{props.graph?.graphRuntime ? `${props.graph.graphRuntime.checkpointer} ｜ thread ${props.graph.graphRuntime.threadId}` : `${props.checkpointCount} checkpoints`}</span>
                </article>
                {props.graph?.failedNode ? (
                  <article>
                    <strong>failure</strong>
                    <span>{props.graph.failedNode} 已触发 {props.graph.failurePolicy?.fallbackAction === "safe_template" ? "安全模板" : "安全转人工"}</span>
                  </article>
                ) : null}
              </div>
            </details>

            <details className="detail-section">
              <summary><span>Tool calls</span><CaretDown size={16} /></summary>
              <div className="tool-list">
                {props.toolEvents.length ? props.toolEvents.slice(0, 8).map((event) => {
                  const payload = event.payload as { tool?: string } | undefined;
                  return (
                    <article key={event.id}>
                      <strong>{payload?.tool ?? "tool"}</strong>
                      <span>{event.summary}</span>
                    </article>
                  );
                }) : <p className="muted">暂无工具调用</p>}
              </div>
            </details>

            <details className="detail-section">
              <summary><span>证据 / QA</span><CaretDown size={16} /></summary>
              <div className="evidence-grid">
                <div>
                  <span>RAG</span>
                  <strong>{props.ragHits.length ? `${props.ragHits.length} 条命中` : "-"}</strong>
                  <p>{props.ragHits[0]?.title ?? props.ragHits[0]?.content ?? "暂无命中"}</p>
                </div>
                <div>
                  <span>Template</span>
                  <strong>{props.graph?.selectedTemplate?.id ?? props.graph?.templateOutput?.templateType ?? "-"}</strong>
                  <p>{props.graph?.templateOutput?.validationPassed ? "校验通过" : props.graph ? "需人工或模板兜底" : "暂无模板"}</p>
                </div>
                <div>
                  <span>QA</span>
                  <strong>{props.qaSummary ? (props.qaSummary.passed ? "通过" : "未通过") : "-"}</strong>
                  <p>{props.qaSummary?.failureReasons?.[0] ?? props.graph?.handoffReason ?? "暂无风险"}</p>
                </div>
              </div>
            </details>

            <details className="detail-section">
              <summary><span>Badcase 标记</span><CaretDown size={16} /></summary>
              <div className="badcase-box compact">
                <select value={props.badcaseType} onChange={(event) => props.onBadcaseTypeChange(event.target.value as BadcaseType)}>
                  <option value="manual_mark">人工标记</option>
                  <option value="wrong_route">路由错误</option>
                  <option value="rag_miss">RAG 未命中</option>
                  <option value="follow_up_after_reply">用户继续追问</option>
                  <option value="wrong_intent">意图识别错误</option>
                  <option value="wrong_rule">规则引用错误</option>
                  <option value="over_commitment">回复过度承诺</option>
                </select>
                <textarea value={props.badcaseNote} onChange={(event) => props.onBadcaseNoteChange(event.target.value)} placeholder="记录原因" />
                <button type="button" onClick={props.onSaveBadcase} disabled={!props.graph}>保存 badcase</button>
                {props.badcaseSaved ? <p className="saved">已记录</p> : null}
              </div>
            </details>

            <div className="drawer-links">
              {props.graph ? <a href={`/trace?traceId=${encodeURIComponent(props.graph.traceId)}`}>查看 Trace</a> : <span>暂无 Trace</span>}
              <a href="/badcases">Badcase 复盘</a>
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

export default function Home() {
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [content, setContent] = useState("");
  const [graph, setGraph] = useState<ChatApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [runtimeEvents, setRuntimeEvents] = useState<GraphRuntimeEvent[]>([]);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [badcaseType, setBadcaseType] = useState<BadcaseType>("manual_mark");
  const [badcaseNote, setBadcaseNote] = useState("");
  const [badcaseSaved, setBadcaseSaved] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const riskTone = useMemo(() => {
    if (graph?.finalAction === "handoff") return "risk-high";
    if (graph?.riskStrategy?.riskLevel === "high") return "risk-high";
    if (graph?.riskStrategy?.riskLevel === "medium" || graph?.routeDecision?.routeType === "needs_clarification") return "risk-medium";
    return "risk-low";
  }, [graph]);

  const activeRuntimeEvents = graph?.graphRuntime?.streamEvents ?? runtimeEvents;
  const liveWorkflowSteps = useMemo(() => buildRuntimeSteps(activeRuntimeEvents), [activeRuntimeEvents]);
  const progressItems = useMemo(
    () => buildProgressItems(activeRuntimeEvents, graph?.routeDecision?.routeType, loading),
    [activeRuntimeEvents, graph?.routeDecision?.routeType, loading]
  );

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    if (!content.trim()) return;
    const history = messages;
    const outgoing: ConversationMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      images: [],
      createdAt: new Date().toISOString()
    };

    setLoading(true);
    setBadcaseSaved(false);
    setRuntimeEvents([]);
    setStreamError(null);
    setGraph(null);
    setMessages([...history, outgoing]);

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, content, images: [], history })
      });

      if (!response.ok || !response.body) {
        throw new Error("stream request failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: ChatApiResponse | null = null;

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const parsed = parseSseBuffer(buffer);
        buffer = parsed.rest;

        for (const message of parsed.messages) {
          if (message.event === "runtime") {
            const runtimeEvent = JSON.parse(message.data) as GraphRuntimeEvent;
            setRuntimeEvents((current) => [...current, runtimeEvent].slice(-120));
          }
          if (message.event === "final") {
            finalResult = JSON.parse(message.data) as ChatApiResponse;
          }
          if (message.event === "error") {
            const payload = JSON.parse(message.data) as { message?: string };
            throw new Error(payload.message ?? "stream failed");
          }
        }

        if (done) break;
      }

      if (!finalResult) throw new Error("stream completed without final graph");

      window.localStorage.setItem(`agent-trace:${finalResult.traceId}`, JSON.stringify(finalResult));
      setConversationId(finalResult.conversationId);
      setMessages([
        ...finalResult.messages,
        { id: crypto.randomUUID(), role: "agent", content: finalResult.finalMessage, createdAt: new Date().toISOString() }
      ]);
      setGraph(finalResult);
      setContent("");
    } catch (error) {
      setStreamError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  function loadScenario(scenario: DemoScenario) {
    setContent(scenario.message);
    setBadcaseSaved(false);
    setDetailsOpen(false);
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

  const ticketStatus = loading && !graph ? "处理中" : graph ? ticketStatusLabel(graph.ticketStatus) : "待处理";
  const toolEvents = graph?.traceEvents.filter((event) => event.type === "tool.called") ?? [];
  const ragHits = graph?.retrievalResult?.rerankedTopK ?? [];
  const qaSummary = graph?.qaResult ?? graph?.reviewLoop;
  const workflowSteps = graph?.agents.length ? graph.agents : liveWorkflowSteps;
  const checkpointCount = graph?.graphRuntime?.checkpoints.length ?? runtimeEvents.filter((event) => event.kind === "checkpoint").length;
  const runtimeEventCount = graph?.graphRuntime?.streamEvents.length ?? runtimeEvents.length;
  const progressText = currentProgressText(progressItems, loading, graph, streamError);

  return (
    <main className="customer-shell">
      <motion.section
        className="customer-stage"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
      >
        <header className="customer-topbar">
          <div>
            <p className="eyebrow">AI customer service</p>
            <h1>客服对话</h1>
          </div>
          <div className="top-actions">
            <span className={`status-chip ${riskTone}`}>{ticketStatus}</span>
            <button type="button" className="secondary-button" onClick={() => setDetailsOpen(true)}>
              <SlidersHorizontal size={18} weight="bold" />
              流程详情
            </button>
          </div>
        </header>

        <section className="conversation-card" aria-label="客服对话">
          <div className="conversation-status" aria-live="polite">
            <div>
              <span className={`live-dot ${streamError ? "failed" : loading ? "running" : graph ? "completed" : ""}`} />
              <strong>{progressText}</strong>
              <small>{routeLabel(graph?.routeDecision?.routeType)} ｜ {statusLabel(graph?.finalAction)}</small>
            </div>
            <button type="button" onClick={() => setDetailsOpen(true)}>查看流程</button>
          </div>

          <RuntimeProgress items={progressItems} compact />

          <div className="messages" aria-live="polite">
            <AnimatePresence initial={false}>
              {messages.length === 0 ? (
                <motion.div
                  key="empty"
                  className="empty-state"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <h2>等待客户消息</h2>
                  <p>客服窗口已就绪。</p>
                </motion.div>
              ) : (
                messages.map((message) => <MessageBubble key={message.id} message={message} />)
              )}

              {loading ? (
                <motion.article
                  key="processing"
                  className="message agent processing"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <span>智能客服</span>
                  <p>{progressText}</p>
                  <div className="typing-bars" aria-hidden="true"><i /><i /><i /></div>
                </motion.article>
              ) : null}

              {streamError ? (
                <motion.article
                  key="stream-error"
                  className="message system"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <span>系统</span>
                  <p>{streamError}</p>
                </motion.article>
              ) : null}
            </AnimatePresence>
          </div>

          <form className="composer" onSubmit={sendMessage}>
            <label htmlFor="customer-message">
              <span>客户消息</span>
              <textarea
                id="customer-message"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="例如：订单号 CS202606140001，AirBuds Pro X 到货两天，左右耳都有明显杂音，想申请退货退款。"
              />
            </label>
            <div className="composer-actions">
              <button type="button" className="secondary-button" onClick={() => setDetailsOpen(true)}>示例 / 详情</button>
              <motion.button
                type="submit"
                className="send-button"
                disabled={loading || !content.trim()}
                whileTap={{ scale: 0.98 }}
              >
                <PaperPlaneTilt size={18} weight="bold" />
                {loading ? "处理中" : "发送"}
              </motion.button>
            </div>
          </form>
        </section>
      </motion.section>

      <DetailsDrawer
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        graph={graph}
        ticketStatus={ticketStatus}
        workflowSteps={workflowSteps}
        progressItems={progressItems}
        runtimeEvents={activeRuntimeEvents}
        toolEvents={toolEvents}
        ragHits={ragHits}
        qaSummary={qaSummary}
        checkpointCount={checkpointCount}
        runtimeEventCount={runtimeEventCount}
        streamError={streamError}
        badcaseType={badcaseType}
        badcaseNote={badcaseNote}
        badcaseSaved={badcaseSaved}
        onBadcaseTypeChange={setBadcaseType}
        onBadcaseNoteChange={setBadcaseNote}
        onSaveBadcase={saveBadcase}
        onLoadScenario={loadScenario}
      />
    </main>
  );
}
