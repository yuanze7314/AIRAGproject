# Repository note: BMAD/skill 过程产物保留在本地工作区，不随项目仓库上传；仓库内以本文件、DECISION-LOG.md、	asks/TASKS-v0.1.md 和项目 docs/ 作为可提交的项目状态与设计说明。

# 项目状态：3C 售后智能客服 Agent

更新时间：2026-06-13
项目根目录：用户指定的 E 盘项目根目录（`<项目根目录>`）
代码目录：`<项目根目录>\AI-Powered Customer Service`

## 当前实施依据

后续实现以 2026-06-13 对齐后的规划文档为准：


当前已批准的标准运行链路：

`Memory Adapter -> Case Understanding Agent -> Rule Guardrail -> LLM structured Query Router -> 四类路由分支 -> Review/QA 重写循环 -> Template Output -> 直接回复客户或转人工`

## 当前代码快照

这是一个已有项目，不是从零开始的新项目。

已观察到 `AI-Powered Customer Service` 中存在：

- Next.js 应用结构，包括 `app/`、`lib/`、`data/`、`knowledge/` 和 API route。
- API route：`/api/chat`、`/api/scenarios`、`/api/badcases`、`/api/rules`。
- 共享运行类型文件：`lib/types.ts`。
- 确定性 orchestrator 雏形：`lib/agent/orchestrator.ts`。
- 演示场景数据：`data/demo-scenarios.json`。
- 普通客服知识库：`knowledge/general/general-service-kb.json`。
- 售后规则文档：`knowledge/rules/`。
- 本地 badcase 存储文件：`data/badcases.json`。

## 与最新规划的对齐状态

当前状态：部分对齐。

2026-06-13 开发更新：

- 已补齐共享 runtime 类型中的 PRD 核心对象字段，包括 `StructuredCase`、`GuardrailResult`、`RetrievalResult`、`ReviewResult`、`TemplateOutputResult`、`AgentGraphState`。
- `/api/chat` 现在返回标准摘要字段：`traceId`、`visibleStatus`、`finalMessage`、`ticketStatus`，同时保留现有 `AgentGraphState` 兼容结构。
- `runAgentGraph` 现在为每轮输出生成 `traceEvents`，为后续独立日志/流程观测页提供稳定输入。
- 前端已改为消费 `ChatApiResponse`，客户对话流优先展示 `finalMessage`。
- 已运行 `npm run build`，构建和 TypeScript 检查通过。
- 已新增外挂 Memory Adapter：`lib/store/memory.ts`，使用 `data/memories.json` 作为本地 demo store。
- 已实现记忆生命周期策略：超过 7 天压缩详细消息，超过 30 天清理详细记忆。
- 已新增独立日志/流程观测页 `/trace`，主界面通过 `traceId` 跳转，不再默认内嵌完整 trace。
- 已新增图片证据上传入口，主界面可上传多张图片、提交到 `/api/chat`，并在对话流中展示缩略图。
- 已为普通客服和售后分支输出标准 `RetrievalResult`，包含 BM25 candidates、Embedding candidates、filtered candidates、rerankedTopK、groundingConfidence 和 insufficientGrounding。
- 已新增 VectorStore adapter 边界：`lib/rag/vector-store.ts`，包含 `InMemoryVectorStore` 可用实现和 `LanceDBVectorStore` 占位边界。
- 已新增后端本地 trace store：`lib/store/trace.ts` + `data/traces.json` + `/api/traces/[traceId]`，`/api/chat` 会保存每轮完整 graph。
- `/trace` 页面已改为优先读取后端 trace API，localStorage 仅作为兜底。
- 已将 RAG retrieval adapter 从 orchestrator 拆分到 `lib/rag/retrieval.ts`。

已经基本对齐的部分：

- 运行顺序已经从记忆、案件结构化、规则兜底、路由判断开始。
- 路由类型已覆盖 `general_service`、`after_sales`、`needs_clarification`、`handoff_required`。
- orchestrator 中已经拆分普通客服分支和售后服务分支。
- 售后分支已经包含 Policy & Evidence、Risk & Strategy、Reply、QA、Template Output 等雏形。
- 高风险回复已经初步避免直接承诺退款、赔付、补发和最终判责。
- 已采用本地演示数据、本地知识库和本地 badcase 记录。

与 PRD/架构仍有差距的部分：

- 类型契约已补齐 PRD 核心对象字段，但后续仍需在真实模块拆分和数据来源上继续加固。
- 当前路由和 Agent 行为仍以确定性 mock 为主，还不是可替换的 LLM structured output adapter。
- RAG 已有独立 adapter 模块、标准 `RetrievalResult`、本地 BM25、lexical embedding 和 MVP reranker 输出；真实 Cross-Encoder 仍待实现。
- InMemoryVectorStore 已实现；LanceDBVectorStore 仅保留边界，尚未接入真实 LanceDB 依赖。
- Trace 目前已输出 `traceEvents`，并会保存到后端本地 trace store。
- 日志/流程观测页已经独立，当前优先读取后端本地 trace API，浏览器 localStorage 仅作兜底。
- 记忆对象已有本地 demo store，并实现 7 天压缩和 30 天清理详细记忆。
- 图片证据已支持前端上传和缩略图展示；图片理解仍是 adapter/mock 线索阶段，不做真实视觉识别和最终判责。
- Review/QA 循环仍比较轻，需要加强重写次数、失败原因和转人工原因。
- 每个 story 完成前仍需重新运行 build 和场景验收。

## 建议的下一步开发切片

不要先扩展大功能。建议优先做基础对齐：

1. 接入真实 Cross-Encoder 或更强 reranker adapter。
2. 评估是否安装 LanceDB 并实现真实 LanceDBVectorStore。
3. 继续加强 Review/QA 重写循环与失败原因。
4. 每个切片完成后重新运行 build 和核心场景 smoke test。

## 当前验证说明

- 最近一次 `npm run build` 已通过。
- 已在本地 production server `http://127.0.0.1:3001` 补跑 `/api/chat` 到 `/api/traces/[traceId]` 的实时 HTTP 验证，trace 可写入并读取。
- 已完成核心 smoke test：普通产品咨询、物流咨询、激活后退货、质量问题退款、包装破损、直播承诺、仅退款、投诉升级、信息不足、超范围转人工。
- `npm run smoke` 已在本地 production server `http://127.0.0.1:3001` 验证通过，10/10 场景通过。
- 修复了“这个耳机支持主动降噪吗？”未进入 `general_service` 的路由问题。
- 修复了直播承诺和投诉升级直接跳过售后分支的问题；现在它们先进入 `after_sales`，再由高风险策略转人工。
- 已集中客户可见回复禁止承诺词表，并完成退款、仅退款、包装破损、激活退货场景的禁用词 smoke test，未命中禁止承诺。
- 已修复 `data/demo-scenarios.json` 中文乱码，并扩展到 11 条演示场景；`/api/scenarios` 验证返回中文标题正常。
- 已补强图片 evidence adapter：上传图片会在 StructuredCase 中归一化为“第 N 张图片证据，需视觉 adapter 或人工核实”的疑似线索，不再直接暴露 base64。
- `/api/rules` 已增强为读取 `knowledge/rules/*.md` 并返回规则 id、title、content 和 source，便于日志页和演示调试查看规则库。
- 已新增本地 BM25/lexical embedding scoring 模块 `lib/rag/scoring.ts`，并接入普通客服与售后 `RetrievalResult`。
- Policy & Evidence Agent 已从内置规则数组迁移到 `knowledge/rules/*.md`，通过 `lib/rag/rules.ts` 读取本地售后规则源。
- 售后回复已联动 `insufficientGrounding`：规则依据不足时不引用具体规则结论，改用保守核实口径。
- 已新增 `npm run smoke`，通过 `scripts/smoke-test.mjs` 覆盖 10 个核心场景、路由状态和禁止承诺检查。
- 已增强 Review/QA 安全审查：统一检查禁止承诺、最终责任判定、图片线索误表述、语气风险、售后下一步缺失和普通客服范围串线。
- 已新增 `npm run build:index`，通过 `scripts/build-knowledge-index.mjs` 将普通客服知识和售后规则构建为本地 `data/knowledge-index.json`，包含 13 个 chunks 和 lexical embedding。
- 已新增 `npm run smoke:index`，验证本地知识索引同时包含 general/rules chunks 且每个 chunk 都有 32 维 lexical embedding。
- VectorStore 已支持通过 `createInMemoryVectorStoreFromIndex()` 从 `data/knowledge-index.json` 构建 InMemory 检索实例。

下一步最接近对齐后 story 集中的 Story 2.2、Story 4.3 或 Story 4.4。

## 后续开发约束

- 不要推倒已有可用原型，除非具体 story 明确要求替换。
- 不要把 embedding 相似度作为主业务路由。
- 主界面默认不要展示完整 Agent trace、RAG TopK、prompt 或 QA 推理细节。
- MVP 不接真实订单、物流、支付、退款、仓储或客服系统。
- 所有客户可见输出必须先通过 Review/QA 和 Template Output。
- 高风险场景不得直接承诺退款、赔付、补发或最终责任判定。
## 2026-06-14 开发更新：知识索引接入运行时检索

- 已消除同一轮 graph 内的重复索引检索：普通客服分支和售后分支都会先生成一次 `RetrievalResult`，再复用给业务 Agent 和 trace 输出。
- 已新增 `lib/rag/service.ts` 作为统一 RAG Service 门面；orchestrator 现在从该服务入口消费检索、转换和 RetrievalResult 构建能力，后续替换 LanceDB 或真实 reranker 时可优先收敛在 RAG service 内。
- 已继续收口售后链路：`Policy & Evidence Agent` 现在优先从 `knowledge-index` 召回售后规则，并转换为 `RuleHit`；`knowledge/rules/*.md` 直接读取仅作为索引不可用时的兜底。
- 已通过额外 HTTP 验证确认质量问题场景的 `policyEvidence.ruleHits` 为 `quality-issue`、`platform-after-sales`，且 `retrievalResult.rerankedTopK[].source` 为 `after_sales-knowledge-index:rerank`。
- 已继续收口普通客服链路：`generalServiceAgent` 的知识命中现在也优先来自 `data/knowledge-index.json`，`knowledge/general/general-service-kb.json` 仅作为索引不可用时的兜底。
- 已通过额外 HTTP 验证确认普通客服 trace 中 `retrievalResult.rerankedTopK[].source` 为 `general-knowledge-index:rerank`。
- 已为 `lib/store/memory.ts` 和 `lib/store/trace.ts` 增加 UTF-8 BOM 容错，避免 Windows 工具写入 BOM 后导致 JSON.parse 500。
- 已将 `data/knowledge-index.json` 从“可构建产物”接入到运行时 `RetrievalResult` 生成链路。
- `lib/rag/retrieval.ts` 现在优先按 `metadata.knowledgeBase` 做 route-scoped 检索：普通客服仅检索 general chunks，售后仅检索 after_sales/rules chunks。
- 检索流程已使用 knowledge-index 做 BM25 候选、本地 lexical embedding 候选、业务 category 过滤、合并去重和 MVP rerank。
- `buildGeneralRetrievalResult` 与 `buildAfterSalesRetrievalResult` 已改为异步函数；若索引缺失或不可读，会回退到原有已命中结果包装逻辑。
- 当前仍未接入真实 LanceDB 和真实 Cross-Encoder；`InMemoryVectorStore` 已可从索引构建并作为 MVP 运行时向量检索实现。
- 已重新运行 `npm run build:index`、`npm run smoke:index`、`npm run build`，并在 `http://127.0.0.1:3001` 跑通 `npm run smoke`，10/10 场景通过。

下一步建议：
1. 评估是否继续推进真实 LanceDBVectorStore 接入。
2. 或先把 ordinary/general answer 生成也改为直接消费 knowledge-index 检索结果，减少 `knowledge/general/general-service-kb.json` 与运行时检索的双路径。

## 2026-06-14 开发更新：DeepSeek API 接入

- 已将真实模型调用切换为 DeepSeek OpenAI-compatible Chat Completions API：默认 `DEEPSEEK_API_BASE_URL=https://api.deepseek.com`，默认模型 `deepseek-v4-flash`。
- 已新增 `lib/llm/deepseek.ts`、更新 `.env.example` 与新增 `docs/DEEPSEEK-API-INTEGRATION.md`，约定 `DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`、`DEEPSEEK_API_BASE_URL`、`DEEPSEEK_TIMEOUT_MS`、`DEEPSEEK_MAX_TOKENS` 和 `DEEPSEEK_DISABLED`。
- `Case Understanding Agent` 现在优先调用 DeepSeek JSON output 生成 `StructuredCase`；缺少 key、API 失败、超时或结构校验失败时回退到原确定性实现。
- `Query Router Agent` 现在优先调用 DeepSeek JSON output 输出四类 `RouteDecision`；Rule Guardrail 强制转人工不会被模型覆盖，售后意图误入普通客服时会回退到确定性安全路由。
- `General Service Agent` 和售后 `Reply Agent` 也已接入 DeepSeek JSON output，分别基于普通客服检索结果、售后规则证据和风险策略生成候选回复；所有候选回复仍会经过现有 Review/QA 与 Template Output 校验。
- `StructuredCase`、`RouteDecision`、`GeneralServiceResult` 和 `ReplyDraft` 已增加 `llmSource`/`llmError`，日志页可直接观察每个模型调用是 DeepSeek 还是 fallback，以及失败原因。
- 已新增智谱视觉预留接口 `lib/vision/zhipu.ts` 和 `docs/ZHIPU-VISION-INTEGRATION.md`。DeepSeek 继续负责文本/结构化/回复生成；图片证据上传后可在配置 `ZHIPU_API_KEY` 时调用智谱视觉模型生成保守 `imageClues`，未配置或失败时回退到原有人工核实线索。
- `needs_clarification` 分支已增强多轮状态：记录上次缺失字段、已解决字段、新增字段和澄清轮次；连续两轮仍信息不足时自动转人工并记录 badcase。
- `badcase` 已抽象为本地 store，`/api/badcases` 支持 `type/source/traceId/routeType` 简单筛选；`/api/chat` 会自动记录 LLM fallback、模型误路由被 guard 修正、QA 不通过等 badcase。
- RAG 已补充 DeepSeek 常见 intent 别名映射，并支持通过 `RAG_GENERAL_MIN_SCORE`、`RAG_GENERAL_MIN_MARGIN`、`RAG_AFTER_SALES_MIN_SCORE`、`RAG_AFTER_SALES_MIN_MARGIN` 调整 grounding 阈值。
- 已在无 `DEEPSEEK_API_KEY` 环境验证 fallback 链路不破坏既有 MVP：`npm run build:index`、`npm run smoke:index`、`npm run build`、`SMOKE_BASE_URL=http://127.0.0.1:3001 npm run smoke` 均通过，smoke 10/10。
- 待提供真实 `DEEPSEEK_API_KEY` 后，需要补跑真实 API 路径验证，并在 trace rationale 中确认出现 `DeepSeek structured router:`。

## 2026-06-14 开发更新：needs_clarification、badcase、RAG 增强

- `needs_clarification` 已增强为多轮状态分支：记忆中保存上一轮缺失字段，`StructuredCase` 输出 `previousMissingFields`、`resolvedMissingFields`、`newMissingFields`、`clarificationRound`，trace 可直接看到缺失字段变化。
- 连续两轮仍信息不足时，会停止重复追问并转人工；如果用户第三轮补足了关键信息，则会继续合并上下文进入对应业务分支。
- badcase 已形成闭环：`/api/badcases` 支持 `type`、`source`、`traceId`、`routeType` 筛选；`/api/chat` 会自动记录 DeepSeek JSON/fallback、guard 修正误路由、QA 不通过、澄清循环超限等 auto badcase。
- RAG 已补充售后 intent/category 映射，并将 grounding 阈值开放为环境变量：`RAG_GENERAL_MIN_SCORE`、`RAG_GENERAL_MIN_MARGIN`、`RAG_GENERAL_HIGH_CONFIDENCE_BYPASS`、`RAG_AFTER_SALES_MIN_SCORE`、`RAG_AFTER_SALES_MIN_MARGIN`、`RAG_AFTER_SALES_HIGH_CONFIDENCE_BYPASS`。
- 本轮轻量验证通过：`npm run build` 通过；真实 DeepSeek 售后探针命中 `after_sales` / `quality-issue`，grounding=1 且 `insufficientGrounding=false`；三轮仍模糊输入会转人工并写入 `clarification_loop_exceeded` auto badcase。

## 2026-06-14 开发更新：日志观测与 badcase 复盘补齐

- 已重写 `/trace` 日志/流程观测页，修复页面中文乱码，并补齐规划要求的复盘摘要：缺失字段变化、RAG grounding、QA/Review、RAG TopK、Template Output。
- 已新增 `/badcases` 复盘页，支持按 badcase 类型、来源、路由、traceId 筛选，并可从列表直接跳转到对应 trace。
- 客服后台首页已增加 `Badcase 复盘` 入口，主界面仍保持客服工作台定位，不默认展开 Agent 内部细节。
- 已完成轻量验证：`npm run build` 通过；`/`、`/badcases`、`/trace?traceId=...` 页面均可打开，关键复盘字段可见。

## 2026-06-14 开发更新：LanceDB、Reranker Adapter、General Review、QA Loop

- 已接入 `@lancedb/lancedb`，`LanceDBVectorStore` 从占位实现变为真实可运行实现；通过 `RAG_VECTOR_STORE=lancedb` 启用，失败时自动回退 InMemory。
- `RetrievalResult` 已新增 `vectorStoreSource`、`rerankerSource`、`rerankerError`，trace 页可直接观察当前使用的 VectorStore 与 Reranker。
- 已新增 `lib/rag/reranker.ts`，提供 `RerankerAdapter`、本地启发式 reranker、Cross-Encoder HTTP adapter；真实 Cross-Encoder 可通过 `RAG_RERANKER=cross_encoder` 与 `CROSS_ENCODER_API_URL` 接入。
- 普通客服分支已抽出独立 `runGeneralReviewLoop`，General Review Agent 不再只是内联判断，审核 attempts 会写入 `reviewLoop.attempts`。
- 售后分支已抽出 `runAfterSalesQaLoop`，Reply Agent / QA Agent 会按 rewriteInstructions 循环到上限，attempts 写入 `qaResult.attempts`。
- 已补充 `docs/RAG-ADAPTERS.md` 说明 LanceDB 与 Cross-Encoder adapter 的配置方式。
- 本轮验证：`npm run build` 通过；以 `RAG_VECTOR_STORE=lancedb` 启动 `http://127.0.0.1:3001` 后，普通客服和售后接口均返回 `vectorStoreSource=lancedb`、`rerankerSource=local`，review/QA attempts 可见。

## 2026-06-14 开发更新：BAAI bge-reranker-base 接入

- 已新增本地 BAAI reranker 服务 `scripts/baai-reranker-server.py`，基于 FastAPI + PyTorch + Transformers，默认模型为 `BAAI/bge-reranker-base`。
- 已新增 `requirements-reranker.txt` 与 npm 脚本：`npm run reranker:install`、`npm run reranker:start`。
- 已安装本地 reranker 依赖，并启动 `http://127.0.0.1:8010/rerank`；`/health` 与 `/rerank` 均已验证通过。
- Next.js Agent 已以 `RAG_RERANKER=cross_encoder`、`CROSS_ENCODER_API_URL=http://127.0.0.1:8010/rerank` 启动，当前 3001 服务实际使用 BAAI Cross-Encoder reranker。
- 接口验证通过：售后质量问题场景返回 `vectorStoreSource=lancedb`、`rerankerSource=cross_encoder`、Top1=`quality-issue`；普通客服耳机规格咨询返回 `rerankerSource=cross_encoder`、Top1=`general-product-earbuds-specs`。
