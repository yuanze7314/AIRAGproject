# LangGraph 编排交接文档

更新时间：2026-06-14

本文件用于新会话继续开发 `AI-Powered Customer Service`。当前主流程已经接入真实 `@langchain/langgraph`，并完成了前置节点拆分、graph 观测、节点级错误分类兜底、stream updates、前端 SSE 实时进度和 MemorySaver checkpoint。

## 当前架构结论

当前不是 ReAct，也不是 Claude Code SDK agent loop，而是显式 LangGraph 工作流：

```text
START
  -> memoryRead
  -> caseUnderstanding
  -> ruleGuardrail
  -> queryRouter
  -> conditional branch:
       general_service_flow -> generalService -> generalReviewQa -> generalFinalize -> END
       after_sales_flow     -> afterSalesStrategy -> afterSalesReply -> afterSalesQa -> afterSalesFinalize -> END
       clarification_flow   -> clarification -> END
       handoff_flow         -> humanHandoff -> END
```

## 关键文件

- `lib/agent/graph/langgraph.ts`
  - 真实 `StateGraph`
  - 每个 node 统一包装 started/completed/failed trace
  - 使用 `streamMode: ["updates", "checkpoints"]`
  - 使用 `MemorySaver` 作为 LangGraph checkpointer
  - 提供 `invoke()` 与 `stream()` 两种执行入口

- `lib/agent/graph/nodes.ts`
  - `runMemoryReadPatchNode`
  - `runCaseUnderstandingPatchNode`
  - `runRuleGuardrailPatchNode`
  - `runQueryRouterPatchNode`
  - 普通客服、售后、澄清、转人工各分支 patch node

- `lib/agent/graph/runner.ts`
  - 把业务 patch node 注册进 LangGraph node map

- `lib/agent/graph/state.ts`
  - `AgentWorkflowState`
  - `mergeWorkflowState`
  - `graphRuntime`、`failedNode`、`graphExecutionHalted`

- `scripts/graph-state-test.mjs`
  - 覆盖真实 LangGraph 分支执行
  - 覆盖前置节点顺序
  - 覆盖 node failed 后按类型选择安全模板或转人工
  - 覆盖 stream/checkpoint 摘要
  - 覆盖 `graph.stream()` 实时 runtime chunks

## 节点级错误处理

每个 LangGraph node 都由 `createWrappedNode()` 包装：

1. 执行前写入 `graph.node.started`
2. 成功后写入 `graph.node.completed`
3. 抛错后写入 `graph.node.failed`
4. 抛错后执行 `classifyNodeFailure()`
5. 设置 `graphExecutionHalted=true`，后续节点 no-op

失败兜底会设置：

- `failedNode`
- `failurePolicy`
- `graphExecutionHalted`

当前 fallback 策略：

- `memoryRead`、`caseUnderstanding`、`ruleGuardrail`、`queryRouter`、QA 类节点失败：安全转人工。
- `afterSalesReply`、`generalService`、`clarification` 等回复生成类节点失败：输出保守安全模板。

## Stream 与 Checkpoint

后端真实使用 LangGraph stream 执行，并把运行时摘要写回 `graphRuntime`：

```ts
graphRuntime: {
  threadId,
  checkpointer: "memory",
  streamMode: ["updates", "checkpoints"],
  streamEvents,
  checkpoints
}
```

前台首页和 `/trace` 页面会展示这些摘要。

实时前端进度已通过 `POST /api/chat/stream` 实现。该接口返回 SSE：

```text
event: runtime
data: GraphRuntimeEvent

event: final
data: ChatApiResponse
```

注意：当前仍使用 `MemorySaver`，未做持久化 checkpoint。

## 当前工具映射

| 节点 | 工具 | 输出 |
| --- | --- | --- |
| memoryRead | `memory.read` | `memory` |
| caseUnderstanding | DeepSeek structured output/fallback | `structuredCase` |
| ruleGuardrail | 本地规则兜底 | `guardrail` |
| queryRouter | DeepSeek structured output/fallback | `routeDecision`, `branch` |
| generalService | `knowledge.rag` | `retrievalResult`, `generalService` |
| generalReviewQa | `llm.judge`, `badcase.lookup` | `reviewLoop`, `llmJudge`, `badcaseHits` |
| afterSalesStrategy | `rule.rag`, `example.retrieve` | `policyEvidence`, `riskStrategy`, `similarExamples` |
| afterSalesReply | `template.retrieve`, `example.retrieve` | `selectedTemplate`, `replyExamples`, `replyDraft` |
| afterSalesQa | `llm.judge`, `badcase.lookup` | `qaResult`, `llmJudge`, `badcaseHits` |
| finalize nodes | `memory.write`, `trace.save` | `templateOutput`, `finalMessage`, `ticketStatus` |

## 验证命令

每次继续开发至少运行：

```powershell
npm run test:graph
npm run build
SMOKE_BASE_URL=http://127.0.0.1:3001 npm run smoke
```

smoke 后清理本地 demo 数据：

```powershell
$encoding = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText((Resolve-Path -LiteralPath 'data\badcases.json'), '[]', $encoding)
[System.IO.File]::WriteAllText((Resolve-Path -LiteralPath 'data\traces.json'), '{}', $encoding)
[System.IO.File]::WriteAllText((Resolve-Path -LiteralPath 'data\memories.json'), '{}', $encoding)
```

## 后续建议

1. 如果要跨请求恢复 checkpoint，需要把 MemorySaver 换成持久化 checkpointer。
2. 可以继续给节点级错误处理增加局部重试，例如 RAG 失败、LLM judge 失败分别处理。
3. 继续打磨移动端客服工作台、trace 过滤和客服快捷操作。
4. 保持首页客服工作台简洁，复杂观测继续放在 `/trace` 页面。
