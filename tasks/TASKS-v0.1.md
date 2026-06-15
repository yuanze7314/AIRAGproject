# TASKS v0.1：AI-Powered Customer Service

更新时间：2026-06-14

状态说明：

- `done`：已实现并通过对应验证。
- `partial`：已有实现，但还需要加固或补验。
- `todo`：尚未开始。

## Agent Runtime

| ID | 状态 | 任务 |
| --- | --- | --- |
| T-201 | done | 建立 `AgentWorkflowState`、state patch、merge/reducer 语义。 |
| T-202 | done | 接入真实 `@langchain/langgraph@1.4.2`。 |
| T-203 | done | 将前置大节点拆成 `memoryRead`、`caseUnderstanding`、`ruleGuardrail`、`queryRouter`。 |
| T-204 | done | 保留四条业务分支：普通客服、售后、澄清、转人工。 |
| T-205 | done | 售后分支拆为 Strategy、Reply、QA、Finalize。 |
| T-206 | done | 普通客服分支拆为 Service、Review/QA、Finalize。 |
| T-207 | done | 每个 LangGraph node 自动记录 started/completed/failed trace。 |
| T-208 | done | 节点异常时按失败类型选择安全模板或转人工，并写入 `failedNode`、`failurePolicy`、`graphExecutionHalted`。 |
| T-209 | done | 使用 LangGraph stream 收集 updates/checkpoints。 |
| T-210 | done | 使用 `MemorySaver` checkpointer，并把摘要写入 `graphRuntime`。 |
| T-211 | done | 已新增 `/api/chat/stream`，前端通过 SSE 实时展示 LangGraph runtime events。 |
| T-212 | partial | 持久化 checkpoint 尚未实现，当前为内存 checkpoint。 |

## Tools 与 RAG

| ID | 状态 | 任务 |
| --- | --- | --- |
| T-301 | done | 将知识检索作为 tool：`knowledge.rag`、`rule.rag`。 |
| T-302 | done | 售后策略节点接入 `example.retrieve`。 |
| T-303 | done | 售后回复节点接入 `template.retrieve` 与 `example.retrieve`。 |
| T-304 | done | QA 节点接入 `llm.judge` 与 `badcase.lookup`。 |

## UI 与观测

| ID | 状态 | 任务 |
| --- | --- | --- |
| T-401 | done | 首页展示客服回复、流程节点、tool calls、RAG/template/QA 摘要。 |
| T-402 | done | 首页新增 Graph runtime 摘要。 |
| T-403 | done | `/trace` 页面支持 graph node 事件、GraphRuntime、checkpoint 摘要展示。 |
| T-404 | done | `/trace` 页面重写为干净中文版本。 |
| T-405 | done | 首页支持请求进行中实时展示 LangGraph 节点状态，并保留完成后的摘要。 |

## 验证

| ID | 状态 | 任务 |
| --- | --- | --- |
| T-501 | done | `npm run test:graph` 覆盖 state merge、前置节点顺序、LangGraph 分支、节点失败兜底、stream/checkpoint 摘要。 |
| T-502 | done | `npm run build` 通过。 |
| T-503 | todo | 补跑 `SMOKE_BASE_URL=http://127.0.0.1:3001 npm run smoke`。 |
| T-504 | todo | smoke 后清理 `data/badcases.json`、`data/traces.json`、`data/memories.json`。 |

## 下一步建议

1. 先完成 T-503/T-504。
2. 如果需要恢复能力，把 `MemorySaver` 替换为持久化 checkpointer。
3. 继续补移动端细节、trace 过滤和节点失败局部重试。
