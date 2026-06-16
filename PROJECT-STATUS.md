# 项目状态：AI-Powered Customer Service

更新时间：2026-06-16

## 仓库说明

- 仓库根目录：`E:\Agent项目\skill专题`
- 应用目录：`E:\Agent项目\skill专题\AI-Powered Customer Service`
- 远端仓库：`https://github.com/yuanze7314/AIRAGproject.git`
- 本地 skill、BMAD、过程产物、旧 `3c-after-sales-agent` 目录不要上传。

## 当前定位

这是一个 3C 售后智能客服 Agent MVP。前台是客服工作台，后端通过真实 `@langchain/langgraph` 执行业务流程。

## 当前运行时架构

当前范式不是 ReAct，而是显式 LangGraph 工作流状态机：

```text
memoryRead
  -> caseUnderstanding
  -> ruleGuardrail
  -> queryRouter
  -> general_service_flow | after_sales_flow | clarification_flow | handoff_flow
  -> finalize
```

## 已完成

- 已接入真实 `@langchain/langgraph@1.4.2` 与 `@langchain/core@1.1.49`。
- 已把 `Context & Routing Agent` 拆成四个真实 LangGraph 前置节点：`memoryRead`、`caseUnderstanding`、`ruleGuardrail`、`queryRouter`。
- 每个 LangGraph node 已自动记录 `graph.node.started`、`graph.node.completed`、`graph.node.failed`。
- 节点失败时已支持分类兜底：关键链路失败转人工，回复生成类失败可降级为安全模板，并设置 `failedNode`、`failurePolicy`、`graphExecutionHalted`。
- 后端执行已切换为 LangGraph `streamMode: ["updates", "checkpoints"]`。
- 已接入 `MemorySaver` checkpoint，并将 stream/checkpoint 摘要写入 `graphRuntime`。
- 已新增 `POST /api/chat/stream`，把 LangGraph runtime events 以 SSE 推给前端。
- 首页已支持实时流程节点状态，`/trace` 页面已展示 Graph runtime 摘要和 fallback 信息。
- `/trace` 页面已重写为干净中文版本，并支持新 graph node 事件展示。
- 售后、普通客服、澄清、转人工四条分支仍保持原有 API 行为。
- 已补充 DeepEval 本地评测链路、50 条会话测试集、知识库质量测试、性能统计脚本和评测报告。
- 已修复包装清单知识库乱码，并调整配件缺失、物流破损、质量问题、直播承诺争议等规则描述。
- 直播承诺或赠品权益场景的转人工模板已明确说明不会确认主播承诺成立，也不会直接承诺补发、赔付或退差价。

## 当前关键文件

- `AI-Powered Customer Service/lib/agent/graph/langgraph.ts`
- `AI-Powered Customer Service/lib/agent/graph/nodes.ts`
- `AI-Powered Customer Service/lib/agent/graph/runner.ts`
- `AI-Powered Customer Service/lib/agent/graph/state.ts`
- `AI-Powered Customer Service/lib/types.ts`
- `AI-Powered Customer Service/app/page.tsx`
- `AI-Powered Customer Service/app/trace/page.tsx`
- `AI-Powered Customer Service/app/api/chat/stream/route.ts`
- `AI-Powered Customer Service/scripts/graph-state-test.mjs`
- `AI-Powered Customer Service/scripts/build-deepeval-dataset.mjs`
- `AI-Powered Customer Service/scripts/eval-performance.mjs`
- `AI-Powered Customer Service/scripts/knowledge-quality-test.mjs`
- `AI-Powered Customer Service/tests/evals/test_airbuds_customer_service.py`

## 已验证

已通过：

```powershell
npm run test:graph
npm run test:knowledge
npm run build
npm run smoke
```

本地评测材料显示：50 条测试集、接口 smoke 12/12 通过、契约通过率 96.00%、路由准确率 98.00%、状态准确率 98.00%、意图准确率 100.00%、禁用承诺通过率 100.00%、错误率 0.00%。DeepEval 本地运行结果为 39 通过 / 11 未通过，未通过项主要用于定位话术完整度、轮次相关性和测试契约对齐。

## 当前风险

- `MemorySaver` 是内存 checkpointer，不适合作为跨进程持久化恢复方案。
- `npm audit` 已知存在 Next/PostCSS 相关 moderate 提示，自动修复会触发破坏性版本变更，应单独处理。
- DeepEval 当前使用 DeepSeek 单一裁判模型，结果适合阶段性背书，不应表述为第三方认证或生产 SLA。
- 个别失败样本仍提示需要继续优化话术完整度、轮次相关性和测试契约。

## 后续建议

1. 继续修复 DeepEval 失败样本，优先处理仅退款高压、质量投诉升级和保修咨询检索偏差。
2. 如果需要跨请求恢复，替换为持久化 LangGraph checkpointer。
3. 继续强化节点级 fallback，优先覆盖 RAG 与 LLM judge 的局部重试。
4. 增加人工抽检记录，补充高风险售后场景的人工评审口径。
