# TASKS v0.1：3C 售后智能客服 Agent

更新时间：2026-06-13
范围：将已有项目对齐到 2026-06-13 已批准的 Agent runtime 规划。

## 状态说明

- `done`：已实现，且大体符合规划。
- `partial`：已有雏形，但需要对齐或加固。
- `todo`：尚未实现。
- `blocked`：前置任务完成前不应开始。

## 基础工程

| ID | 状态 | 任务 | 来源 |
| --- | --- | --- | --- |
| T-001 | done | 保留现有 Next.js 项目 `AI-Powered Customer Service`，不要从零重建。 | Story 1.1 |
| T-002 | done | 统一运行时类型：`StructuredCase`、`GuardrailResult`、`RouteDecision`、`RetrievalResult`、`ReviewResult`、`TemplateOutputResult`、`AgentGraphState`。 | Story 1.2 |
| T-003 | done | 让 `/api/chat` 返回标准摘要：`conversationId`、`ticketId`、`visibleStatus`、`finalMessage`、`routeDecision`、`ticketStatus`、`traceId`。 | Story 1.2, 3.1 |
| T-004 | done | 检查 demo 场景是否覆盖至少 8 个验收场景，并包含期望路由、风险信号和禁止承诺项。 | Story 1.3 |

## UI 与工作流

| ID | 状态 | 任务 | 来源 |
| --- | --- | --- | --- |
| T-101 | partial | 主界面保持客服对话 + 工单管理，不默认暴露内部 trace。 | Story 2.1, 2.3 |
| T-102 | done | 实现独立日志/流程观测页，展示 trace、路由、RAG、Review/QA、Template Output 和 badcase。 | Story 2.4 |
| T-103 | partial | 保留 badcase 标记入口，并按规划 taxonomy 写入本地记录。 | Story 2.5 |
| T-104 | done | 增加真实图片上传 UI，或建立清晰的上传到 evidence clues 的 adapter 路径。 | Story 2.2, 5.1 |

## Agent Runtime

| ID | 状态 | 任务 | 来源 |
| --- | --- | --- | --- |
| T-201 | partial | 保持标准执行顺序：Memory -> Case Understanding -> Rule Guardrail -> Query Router -> 分支 -> Review/QA -> Template Output。 | Story 3.1 |
| T-202 | done | 将 Memory Adapter 拆成真实外挂模块，提供 read/write API。 | Story 3.2 |
| T-203 | done | 实现 7 天记忆压缩和 30 天详细记忆清理。 | Story 3.2 |
| T-204 | partial | 对齐 Case Understanding 输出字段，包括 `imageClues`、`knownContext`、`priorActions`、`clarificationQuestions`。 | Story 3.3 |
| T-205 | partial | 对齐 Rule Guardrail 字段，包括硬风险、超范围、禁止承诺、兜底约束、建议路由覆盖。 | Story 3.4 |
| T-206 | partial | 将当前确定性 router 包装或替换为 LLM structured-output adapter，同时保留确定性 fallback。 | Story 3.5 |
| T-207 | partial | 加强四类分支执行、重写循环计数、最大尝试次数和转人工原因。 | Story 3.6 |
| T-208 | partial | 对齐 Template Output 字段和最终安全校验。 | Story 3.7 |

## RAG 与知识库

| ID | 状态 | 任务 | 来源 |
| --- | --- | --- | --- |
| T-301 | partial | 保留普通客服知识库和售后规则库的隔离。 | Story 4.1 |
| T-302 | partial | 强制 route-scoped retrieval：普通客服只检索 general，售后只检索 rules。 | Story 4.2 |
| T-303 | done | 实现 BM25 TopK + Embedding TopK + 合并去重。 | Story 4.3 |
| T-304 | done | 实现业务过滤：routeType、intent、category、商品类目、riskTags、适用条件。 | Story 4.3 |
| T-305 | done | 实现 reranker adapter、groundingConfidence 和 `insufficient_grounding`。 | Story 4.4 |
| T-306 | partial | 实现 VectorStore adapter，默认 LanceDB，备用 InMemory。 | Story 4.5 |
| T-307 | done | `/api/rules` 返回本地售后规则库条目，便于日志页和演示调试查看。 | Story 2.4, 4.1 |
| T-308 | done | Policy & Evidence Agent 从 `knowledge/rules/*.md` 读取本地售后规则源，不再依赖内置规则数组。 | Story 4.1, 5.2 |
| T-309 | done | 增加本地知识索引构建脚本，将 general/rules 知识切片并生成 lexical embedding。 | Story 4.5 |
| T-310 | done | 增加知识索引 smoke 检查，并支持从索引构建 InMemoryVectorStore。 | Story 4.5, 6.4 |

## 售后质量控制

| ID | 状态 | 任务 | 来源 |
| --- | --- | --- | --- |
| T-401 | partial | 保持 Policy & Evidence Agent 输出可追踪规则命中和证据充分度。 | Story 5.2 |
| T-402 | partial | 保持 Risk & Strategy Agent 输出风险等级、禁止承诺、限制性说明和转人工建议。 | Story 5.3 |
| T-403 | done | 加强 Reply Agent，使其基于规则证据、风险策略、记忆和安全下一步生成回复。 | Story 5.4 |
| T-404 | done | 加强 QA Agent，检查禁止承诺、最终判责、图片误表述、依据不足、语气和下一步动作。 | Story 5.5 |

## 验证

| ID | 状态 | 任务 | 来源 |
| --- | --- | --- | --- |
| T-501 | done | 合同和 runtime 对齐后运行 build。 | Story 6.4 |
| T-502 | done | smoke test 普通产品咨询和物流咨询。 | Story 6.1 |
| T-503 | done | smoke test 售后场景：激活后退货、质量问题退款、包装破损、直播承诺、仅退款、投诉升级。 | Story 6.2 |
| T-504 | done | smoke test 信息不足和超范围转人工场景。 | Story 6.3 |
| T-505 | done | 增加客户可见回复的禁止承诺检查。 | Story 6.4 |
| T-506 | done | 增加 `npm run smoke`，覆盖核心 10 个路由、状态和禁止承诺场景。 | Story 6.4 |

## 新增实施补充

| ID | 状态 | 任务 | 来源 |
| --- | --- | --- | --- |
| T-601 | done | 增加后端本地 trace store，并提供 `/api/traces/[traceId]` 查询接口。 | Story 2.4, 3.1 |
| T-602 | done | 补跑 `/api/chat` 写入 trace 后再通过 `/api/traces/[traceId]` 读取的 HTTP 验证。 | Story 6.4 |

## 立即建议

`T-002`、`T-003`、`T-004`、`T-102`、`T-104`、`T-202`、`T-203`、`T-303` 至 `T-305`、`T-501` 至 `T-505` 已完成；`T-306` 已有 InMemory 与 LanceDB 边界。下一步建议继续推进 LanceDB 接入或把售后规则检索从内置规则数组迁移到 markdown 知识库读取。
## 2026-06-14 追加任务状态

| ID | 状态 | 任务 | 来源 |
| --- | --- | --- | --- |
| T-311 | done | 将运行时 `RetrievalResult` 优先切换为从 `data/knowledge-index.json` 读取候选，并通过 `InMemoryVectorStore` 执行本地向量候选召回；保留旧命中包装逻辑作为兜底。 | Story 4.2, 4.3, 4.5 |
| T-312 | done | 将普通客服回答生成的知识命中优先切换到 `knowledge-index`，使 `generalServiceAgent` 的 `dataUsed/retrievedKnowledge` 与 trace 中的 RAG 来源保持一致。 | Story 4.1, 4.2, 4.3 |
| T-313 | done | 将 `Policy & Evidence Agent` 的售后规则命中优先切换到 `knowledge-index`，并将索引 ruleId/category 转换回 `RuleHit` 业务契约；markdown 直读仅作为兜底。 | Story 4.1, 4.2, 5.2 |
| T-314 | done | 复用单轮 graph 内的索引 `RetrievalResult`，避免业务 Agent 与 trace 各自重复检索；新增 `lib/rag/service.ts` 作为统一 RAG Service 门面。 | Story 4.3, 4.4, 4.5 |
| T-603 | done | 加固本地 `memories.json` 与 `traces.json` 读取逻辑，兼容 UTF-8 BOM，避免 Windows 写入工具导致 JSON.parse 失败。 | Story 6.4 |

验证：
- `npm run build:index` 通过，生成 13 个 knowledge chunks。
- `npm run smoke:index` 通过，确认 general/rules chunks 与 embedding 完整。
- `npm run build` 通过。
- `SMOKE_BASE_URL=http://127.0.0.1:3001 npm run smoke` 通过，10/10 核心场景通过。
- 额外验证普通客服请求“这个耳机支持主动降噪吗？”返回 `general_service`，且 RAG source 为 `general-knowledge-index:rerank`。
- 额外验证售后请求“耳机用了两天有杂音，我要退款”返回 `after_sales`，`policyEvidence.ruleHits` 与 `after_sales-knowledge-index:rerank` 命中一致。
- 额外验证单轮复用改造后，普通客服与售后代表场景的 `dataUsed/ruleHits` 仍与 `retrievalResult.rerankedTopK` 来源一致。

## 2026-06-14 DeepSeek API 接入追加任务

| ID | 状态 | 任务 | 来源 |
| --- | --- | --- | --- |
| T-701 | done | 新增 DeepSeek/OpenAI-compatible adapter：`lib/llm/deepseek.ts`，统一处理 `/chat/completions`、JSON output、本地 schema 校验、超时、错误和 fallback。 | Story 3.3, 3.5 |
| T-702 | done | `Case Understanding Agent` 优先调用真实 DeepSeek JSON output，失败时回退确定性本地实现。 | Story 3.3 |
| T-703 | done | `Query Router Agent` 优先调用真实 DeepSeek JSON output，保留 Rule Guardrail 强制兜底和售后误路由保护。 | Story 3.5 |
| T-704 | done | 新增 `.env.example` 与 `docs/DEEPSEEK-API-INTEGRATION.md`，说明 `DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`、`DEEPSEEK_DISABLED` 等配置。 | Story 6.4 |
| T-705 | partial | 使用真实 `DEEPSEEK_API_KEY` 补跑 API 路径验收，并确认 trace rationale 出现 `DeepSeek structured router:`。 | Story 6.4 |

验证：
- 无 `DEEPSEEK_API_KEY` 环境下，`npm run build:index` 通过。
- 无 `DEEPSEEK_API_KEY` 环境下，`npm run smoke:index` 通过。
- 无 `DEEPSEEK_API_KEY` 环境下，`npm run build` 通过。
- 无 `DEEPSEEK_API_KEY` 环境下，`SMOKE_BASE_URL=http://127.0.0.1:3001 npm run smoke` 通过，10/10 核心场景通过。
