# 决策日志：AI-Powered Customer Service

更新时间：2026-06-14

## D-001：继续使用已有项目

状态：已接受
决策：继续基于已有 Next.js 项目开发，不从零重建。

## D-002：项目与本地 skill/过程产物分离

状态：已接受
决策：仓库只提交项目代码、项目文档和必要任务/决策记录。本地 skill、BMAD、过程产物、旧目录不上传。

## D-003：主界面是客服工作台，不是营销页

状态：已接受
决策：首页直接呈现客服提问与回复工作台，展示必要流程摘要，不做 landing page。

## D-004：知识检索作为 tool，而不是独立 Agent

状态：已接受
决策：`knowledge.rag`、`rule.rag`、`example.retrieve`、`template.retrieve` 等能力作为 tool 暴露给业务节点。

理由：RAG 是业务 agent 按需调用的外部能力，更接近 function call/tool。

## D-005：采用显式 LangGraph 工作流，不采用 ReAct 作为主范式

状态：已接受
决策：主 agent runtime 采用显式状态图/工作流编排。

理由：客服售后场景需要可控路由、固定安全边界、可观测 trace、QA 闭环和最终模板输出。

## D-006：接入真实 `@langchain/langgraph`

状态：已接受
决策：安装并接入 `@langchain/langgraph@1.4.2` 与 `@langchain/core@1.1.49`。主流程通过 `StateGraph` 编译并执行。

## D-007：前置 Context & Routing 拆成四个 LangGraph 子节点

状态：已接受
决策：将原先合并的 `Context & Routing Agent` 拆成：

```text
memoryRead -> caseUnderstanding -> ruleGuardrail -> queryRouter
```

理由：拆分后 trace 更清晰，节点失败更容易定位，也为 checkpoint、stream 和节点级 fallback 留出边界。

## D-008：节点级错误处理由 LangGraph wrapper 统一承担

状态：已接受
决策：每个 LangGraph node 统一包装 started/completed/failed 观测和异常兜底。节点抛错后生成安全转人工输出，并设置 `graphExecutionHalted=true`。

理由：业务节点不需要重复写 try/catch；失败路径统一、可观测、不会让客户请求崩掉。

## D-009：先接后端 stream/checkpoint 摘要，不先做前端实时 SSE

状态：已接受
决策：当前使用 LangGraph `streamMode: ["updates", "checkpoints"]` 执行，并把摘要写入 `graphRuntime`。前端展示结果摘要，不做实时流式进度。

理由：这能先验证真实 LangGraph stream/checkpoint 能力，同时避免一次性引入 SSE、fetch streaming、前端增量状态机等较大改动。

## D-010：Checkpoint 当前使用 MemorySaver

状态：已接受
决策：当前使用 `MemorySaver` 作为 LangGraph checkpointer。

理由：MVP 本地 demo 阶段优先验证编排和观测；跨进程持久化恢复后续再接持久化 checkpointer。

## D-011：后续增强优先级

状态：建议

建议顺序：

1. 跑完整 HTTP smoke 并清理测试数据。
2. 如需恢复能力，替换持久化 checkpointer。
3. 继续增强节点级 fallback，优先覆盖 RAG 与 LLM judge 的局部重试。
4. 继续打磨移动端客服工作台和 trace 过滤。

## D-012：实时进度采用 POST SSE，不替换 MemorySaver

状态：已接受

决策：新增 `POST /api/chat/stream`，前端通过 fetch 读取 SSE 事件，实时展示 LangGraph runtime events。当前不做持久化 checkpoint，仍保留 `MemorySaver`。

理由：客服提问需要 POST 请求体；fetch streaming 能保持当前表单提交方式，同时让右侧流程节点实时更新。持久化 checkpoint 是独立能力，本轮不混入。

## D-013：节点失败按类型选择 fallback

状态：已接受

决策：LangGraph wrapper 统一执行 `classifyNodeFailure()`。前置、路由、QA 等安全关键节点失败时转人工；回复生成类节点失败时可输出安全模板，避免因为个性化回复生成失败就中断客服体验。

理由：售后客服要优先安全，但也要避免过度转人工。分类 fallback 能把“系统不可用”和“业务高风险”区分开。
