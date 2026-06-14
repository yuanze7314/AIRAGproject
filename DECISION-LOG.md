# 决策日志：3C 售后智能客服 Agent

更新时间：2026-06-13

## D-001：继续使用已有项目

日期：2026-06-13
状态：已接受

决策：

继续基于 `<项目根目录>\AI-Powered Customer Service` 开发，不从零重建应用。

理由：

现有项目已经包含 Next.js 应用、API route、demo 数据、知识库文件、共享类型和 orchestrator 雏形。复用现有代码可以减少漂移，并保留已有原型价值。

影响：

- 后续工作应以对齐和重构现有实现为主。
- 除非 story 明确要求，不应大范围替换已有可用代码。

## D-002：采用已批准的标准 Agent Runtime

日期：2026-06-13
状态：已接受

决策：

采用以下标准运行链路：

`Memory Adapter -> Case Understanding Agent -> Rule Guardrail -> LLM structured Query Router -> 四类路由分支 -> Review/QA 重写循环 -> Template Output -> 直接回复客户或转人工`

理由：

2026-06-13 已批准的 Sprint Change Proposal 解决了规划文档漂移问题，替换了早期 Smart Router-first 或仅售后 5-Agent 流程的旧表述。

影响：

- Query Router 必须在 StructuredCase 和 Guardrail 之后执行。
- Embedding 相似度不能作为主业务路由。
- 普通客服、售后服务、补充信息、人工兜底是四类独立路由结果。
- Template Output 是所有客户可见输出的最后一道门。

## D-003：主界面是客服后台，不是调试面板

日期：2026-06-13
状态：已接受

决策：

默认主界面应聚焦电商客服后台体验，只展示对话窗口和工单管理。Agent trace、RAG TopK、prompt、QA 细节、rerank 细节应放到独立日志/流程观测页。

理由：

产品直接面向客服处理和演示，不应把内部 Agent 调试信息作为默认主视觉。

影响：

- 当前折叠在主页面里的 trace 视为临时原型。
- 后续应实现独立观测页，并从稳定 trace events 读取数据。

## D-004：MVP 只使用本地演示存储

日期：2026-06-13
状态：已接受

决策：

MVP 使用本地文件和 demo store 保存场景、知识库、badcase、memory 和 trace。不接真实订单、物流、支付、退款、仓储或客服系统。

理由：

PRD 明确要求第一版为本地模拟，避免真实用户数据和真实业务副作用。

影响：

- 不添加真实退款、补发、物流或订单修改能力。
- 所有数据 fixture 需要明确保持 demo-only。

## D-005：知识库和检索边界

日期：2026-06-13
状态：已接受

决策：

普通客服知识库和售后规则库必须隔离。检索框架目标为 BM25 + Embedding + 业务过滤 + reranker adapter，向量存储默认 LanceDB，备用 InMemory。

理由：

知识库隔离可以降低普通咨询和售后规则串线风险。Adapter 边界可以兼顾 MVP 演示和后续替换能力。

影响：

- 普通客服 route 不应使用售后规则生成客户可见结论。
- 售后 route 不应把普通 FAQ 当作规则依据。
- `insufficient_grounding` 必须阻止无依据的具体规则引用。

## D-006：客户可见回复的安全承诺边界

日期：2026-06-13
状态：已接受

决策：

客户可见回复不得直接承诺退款、赔付、补发、审核通过或最终责任判定。

理由：

3C 售后存在明显政策和资金风险。MVP 应展示安全处理路径，而不是模拟真实处置权限。

影响：

- Review、QA 和 Template Output 都必须检查禁止承诺。
- 高风险场景应要求补充证据、保守解释流程，或转人工处理。

## D-007：优先的第一条实现切片

日期：2026-06-13
状态：建议

决策：

优先统一共享 Agent 类型契约和标准 `/api/chat` 响应，再扩展 UI、RAG 或向量存储。

理由：

现有代码已有可用行为，但类型契约与 PRD 存在漂移。先稳定契约能减少后续返工。

影响：

- 优先处理 Story 1.2 和 Story 3.1。
- 完成后重新运行 build 和核心场景 smoke test。
## D-008：知识索引优先作为运行时 RetrievalResult 来源

日期：2026-06-14
状态：已接受

决策：
运行时 `RetrievalResult` 优先从 `data/knowledge-index.json` 读取候选，并通过 knowledgeBase scope 隔离普通客服与售后规则检索。BM25、lexical embedding、业务过滤和 MVP rerank 都围绕索引 chunk 运行；当索引不可用时，保留旧的已命中结果包装逻辑作为兜底。

理由：
此前 knowledge-index 已可构建和 smoke，但运行时仍主要包装 generalService/policyEvidence 已命中结果，检索链路与索引产物存在脱节。优先接入本地索引可以更贴近 Story 4.2/4.3/4.5，同时不引入真实 LanceDB 的部署复杂度。

影响：
- `buildGeneralRetrievalResult` 与 `buildAfterSalesRetrievalResult` 改为异步函数。
- 普通客服只检索 `metadata.knowledgeBase=general`，售后只检索 `metadata.knowledgeBase=after_sales`。
- LanceDB 与真实 Cross-Encoder 仍作为后续增强，不阻塞当前 MVP。

## D-009：统一 RAG Service 门面并复用单轮检索结果

日期：2026-06-14
状态：已接受

决策：
新增 `lib/rag/service.ts` 作为 orchestrator 消费 RAG 能力的统一入口。单轮 graph 内先生成一次 route-scoped `RetrievalResult`，再复用给普通客服知识命中、售后规则命中和 trace 输出，避免业务 Agent 与观测链路重复读取索引和重复计算本地向量候选。

理由：
普通客服与售后链路已经都切到 `knowledge-index` 优先。如果每个 Agent 和 trace 各自再次检索，会带来额外开销，也容易在后续接入 LanceDB、真实 reranker 或缓存时出现入口分散。统一服务门面可以让替换检索后端时改动更集中。

影响：
- `orchestrator` 依赖 `lib/rag/service.ts`，不直接依赖 `lib/rag/retrieval.ts` 的实现细节。
- `RetrievalResult` 同时作为 trace 输出和业务命中的可复用中间产物。
- 后续 RAG 契约测试应优先覆盖 service 门面，而不是直接耦合具体检索实现。

## D-010：项目仓库与本地 skill 过程产物分离

日期：2026-06-14
状态：已接受

决策：
将项目目录重命名为 `AI-Powered Customer Service`，仓库中仅保留项目代码、项目 README、项目状态文档和任务/决策日志。本地 skill、BMAD 工具目录和 BMAD 过程产物不随项目仓库上传。

理由：
项目交付物应与本地 Agent/skill 工作区分离，避免把开发辅助工具、技能缓存或过程产物混入应用仓库。

影响：
- 应用目录为 `AI-Powered Customer Service`。
- npm package 名称为合法包名 `ai-powered-customer-service`。
- `.agents/`、`_bmad/`、`_bmad-output/`、旧本地缓存目录和运行产物均被 `.gitignore` 排除。
