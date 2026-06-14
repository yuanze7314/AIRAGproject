---
title: 内容电商 3C 售后智能客服 Agent Epic 与 Story
status: aligned-draft
created: 2026-06-12
updated: 2026-06-13
source_prd: ../prd-3c-after-sales-agent/prd.md
source_architecture: ../architecture-3c-after-sales-agent/architecture.md
change_proposal: ../sprint-change-proposal-20260613-agent-runtime-alignment.md
---

# Epic 与 Story：内容电商 3C 售后智能客服 Agent

## 拆分原则

1. 先跑通端到端客服回复闭环，再增强模型质量。
2. 主界面优先服务客服处理效率，不默认展示 Agent 调试细节。
3. 每轮对话遵循 Memory -> Case Understanding -> Rule Guardrail -> Query Router -> 四分支 -> 审核/QA -> Template Output。
4. 普通客服咨询和售后服务必须分离到不同 RAG 与审核链路。
5. 每个 Story 必须有可验证输出，并标注 PRD FR 覆盖范围。
6. MVP 可以使用 mock LLM、mock image clues、mock reranker，但接口必须保留替换能力。

## Epic 1：项目基础、类型契约与演示数据

目标：建立可运行的 Next.js MVP 基础，统一 Agent 运行数据契约和本地演示场景，为后续实现提供稳定边界。

### Story 1.1 初始化 Web 全栈项目骨架

作为开发者，我需要一个可运行的 Next.js 全栈项目，以承载客服后台 UI、API route、本地知识库和 Agent 编排模块。

验收标准：

- 项目位于 `E:\Agent项目\skill专题\3c-after-sales-agent`。
- 本地 dev server 可以启动，首页可访问。
- 包含基础目录：`app/`、`lib/agent/`、`lib/rag/`、`lib/store/`、`knowledge/`、`data/`。
- 提供 `/api/chat`、`/api/scenarios`、`/api/badcases` 的基础 route。

FR 覆盖：FR-001、FR-007、FR-079、FR-082。

### Story 1.2 定义 Agent 运行核心类型

作为开发者，我需要统一类型契约，避免 Agent 之间通过自由文本传递导致实现漂移。

验收标准：

- 定义 `RouteType`、`StructuredCase`、`GuardrailResult`、`RouteDecision`、`RetrievalResult`、`ReviewResult`、`TemplateOutputResult`、`AgentGraphState`。
- 类型字段与 PRD 数据对象一致。
- `/api/chat` 返回可序列化的运行摘要。
- UI 与 orchestrator 均引用同一套类型。

FR 覆盖：FR-022 至 FR-035、FR-071 至 FR-078、FR-083、FR-084。

### Story 1.3 创建本地演示场景数据

作为演示者，我需要内置典型客服与售后场景，以快速验证端到端能力。

验收标准：

- `data/demo-scenarios.json` 至少包含 8 个场景。
- 场景覆盖普通产品咨询、物流咨询、激活后退货、质量问题退款、包装破损、直播承诺、仅退款、投诉升级、信息不足和超范围。
- 每个场景包含用户消息、可选图片占位、期望 routeType、期望风险信号和禁止承诺项。
- UI 可选择或填充演示场景。

FR 覆盖：FR-009、FR-010、FR-030 至 FR-035、FR-036、FR-043、FR-051、FR-053。

## Epic 2：客服主界面、工单管理与日志观测

目标：实现电商客服后台体验。主界面只展示对话和工单，详细 Agent/RAG/QA 日志放到独立观测页。

### Story 2.1 实现客服对话窗口

作为客服，我需要在主界面查看消费者消息、图片、AI 回复和转人工状态。

验收标准：

- 支持文本输入和消息发送。
- 对话流展示消费者消息、AI 自动回复、补充信息请求和正在转接人工状态。
- 支持多轮消息追加。
- AI 回复以客户可见效果呈现，审核通过后直接进入客户对话流。
- 不在主界面默认展示 Agent trace 或 RAG TopK。

FR 覆盖：FR-001、FR-002、FR-003、FR-006、FR-009、FR-071。

### Story 2.2 支持图片上传与证据展示

作为消费者，我可以上传图片作为 3C 售后证据，客服可以在对话里看到图片。

验收标准：

- 输入区支持上传至少一张图片。
- 对话流展示图片缩略图或占位。
- 图片信息随消息提交到 `/api/chat`。
- 图片无法解析时 UI 有明确提示。
- 图片识别结果在主界面只以简要证据状态展示，不展开内部识别细节。

FR 覆盖：FR-010 至 FR-014。

### Story 2.3 实现工单管理面板

作为客服，我需要通过工单列表查看当前处理队列和每个工单状态。

验收标准：

- 主界面展示工单列表、工单状态、问题类型、风险标签、来源平台、最近更新时间和当前处理动作。
- 支持状态：待处理、处理中、待补充、待人工复核、已转人工、已完成、已标记 badcase。
- 点击工单可以联动当前对话。
- 工单提供查看日志/流程观测页入口。

FR 覆盖：FR-004、FR-005、FR-008。

### Story 2.4 实现日志/流程观测页

作为演示者或运营复盘人员，我需要查看一次回复背后的 Agent 执行链路和风险依据。

验收标准：

- 独立页面展示 StructuredCase、GuardrailResult、RouteDecision、RAG 检索重排、审核/QA 循环、Template Output 和转人工原因。
- 展示每个阶段状态：pending、running、completed、failed、needs_rewrite、handoff_required。
- 展示重写次数和审核失败原因。
- 日志页可从工单或会话进入，默认不占据主界面。

FR 覆盖：FR-007、FR-083、FR-084。

### Story 2.5 实现 badcase 标记入口

作为售后运营，我可以将一次回复标记为 badcase，便于后续分析。

验收标准：

- UI 提供 badcase 标记按钮。
- 可选择 badcase 类型：用户继续追问、转人工、意图识别错误、规则引用错误、图片识别失败、回复过度承诺、人工标记、wrong_route。
- 可填写备注。
- 提交后调用 `/api/badcases` 并保存本地记录。
- 日志页可以查看 badcase 标记信息。

FR 覆盖：FR-079 至 FR-082。

## Epic 3：最终 Agent Orchestration Runtime

目标：实现确定性 Agent Orchestrator，跑通 Memory、Case Understanding、Rule Guardrail、Query Router、四分支、审核循环、Template Output 与人工兜底。

### Story 3.1 实现 Orchestrator 状态骨架

作为系统，我需要维护每轮对话的 AgentGraphState，以便可追踪地执行各 Agent 步骤。

验收标准：

- `runAgentGraph` 接收 conversationId、ticketId、message、images、scenario context。
- 创建并更新 `AgentGraphState`。
- 每个阶段写入 trace event。
- `/api/chat` 返回 finalMessage、visibleStatus、routeDecision、ticketStatus、traceId。

FR 覆盖：FR-007、FR-030、FR-083、FR-084。

### Story 3.2 实现 Memory Adapter 与生命周期策略

作为系统，我需要把会话记忆作为外挂上下文注入，而不是让 Agent 长期持有状态。

验收标准：

- Memory Adapter 读取和写入当前会话记忆。
- 每轮处理前将记忆注入 Case Understanding 输入。
- 记录已补充信息、已要求补证、已触发重写、已转人工等 priorActions。
- 超过 7 天未更新压缩为摘要记忆。
- 超过 30 天未更新清除详细记忆。

FR 覆盖：FR-015 至 FR-021。

### Story 3.3 实现 Case Understanding Agent

作为系统，我需要先把客户输入整理为结构化业务问题，再交给路由判断。

验收标准：

- 输出 StructuredCase。
- 覆盖商品信息、问题描述、用户诉求、证据状态、图片线索、情绪状态、已知上下文、缺失字段、风险信号、已采取措施摘要。
- 信息不足时输出 missingFields 和 clarificationQuestions。
- 日志页可查看 StructuredCase。

FR 覆盖：FR-022 至 FR-025。

### Story 3.4 实现 Rule Guardrail

作为系统，我需要在路由前识别硬风险、超范围和禁止承诺项。

验收标准：

- 基于 StructuredCase 输出 GuardrailResult。
- 标记仅退款、高额赔付、激活后退货、直播承诺争议、投诉威胁、图片文本冲突、规则依据不足等风险。
- 输出 prohibitedCommitments 和 fallbackConstraints。
- 超范围问题可建议 `handoff_required`。

FR 覆盖：FR-026 至 FR-029。

### Story 3.5 实现 LLM 结构化 Query Router

作为系统，我需要基于结构化案件和规则兜底结果分配四条业务链路。

验收标准：

- Query Router 输入 StructuredCase 和 GuardrailResult。
- 输出 `general_service`、`after_sales`、`needs_clarification`、`handoff_required` 四类之一。
- 输出 confidence、rationale、requiredInfo、riskSignals、guardrailApplied 和 targetFlow。
- 不使用 Embedding 相似性作为主路由。
- 售后信号不得留在普通客服分支。

FR 覆盖：FR-030 至 FR-035。

### Story 3.6 实现四分支执行和审核循环

作为系统，我需要根据 routeType 执行不同分支，并在审核失败时重写或转人工。

验收标准：

- `general_service` 执行 General Service Agent + General Review Agent。
- `after_sales` 并行执行 Policy & Evidence Agent 与 Risk & Strategy Agent，再执行 Reply Agent + QA Agent。
- `needs_clarification` 输出补充信息请求。
- `handoff_required` 输出正在转接人工。
- General Review 或 QA 不通过时附带原因重写。
- 超过最大循环次数后转人工。

FR 覆盖：FR-036 至 FR-054。

### Story 3.7 实现 Template Output 最终输出层

作为系统，我需要在客户可见输出前统一模板化和安全校验。

验收标准：

- 根据 routeType 选择普通客服、售后服务、补充信息或转人工模板。
- 检查禁用承诺、最终判责、图片线索误表述、语气风险、空回复、字段缺失和格式错误。
- 校验通过后返回客户可见 finalMessage。
- 校验不通过且不可重写时转人工。

FR 覆盖：FR-071 至 FR-078。

## Epic 4：RAG、检索重排与 VectorStore

目标：实现普通客服和售后服务两套本地知识库，支持混合召回、业务过滤、重排序、groundingConfidence 和本地向量索引。

### Story 4.1 建立普通客服与售后规则知识库

作为系统，我需要分开维护普通客服知识库和售后规则库，避免知识串线。

验收标准：

- `knowledge/general/` 覆盖商品规格、包装清单、发货时效、快递说明、订单状态示例、普通客服口径。
- `knowledge/rules/` 覆盖平台售后、3C 类目、激活拆封、质量问题、配件缺失、物流破损、直播承诺、仅退款规则。
- 每个知识片段包含 title、category、appliesTo、riskTags、source。

FR 覆盖：FR-038、FR-055、FR-056。

### Story 4.2 实现 RAG 检索范围控制

作为系统，我需要根据 routeType 限定检索知识库范围。

验收标准：

- `general_service` 只检索普通客服知识库。
- `after_sales` 只检索售后规则库。
- `needs_clarification` 与 `handoff_required` 不生成结论性 RAG 回复。
- 日志页展示 knowledgeBase scope。

FR 覆盖：FR-055、FR-057。

### Story 4.3 实现混合召回与业务过滤

作为系统，我需要同时使用关键词和向量召回，并在重排序前过滤不适用内容。

验收标准：

- 执行 BM25 TopK。
- 执行 Embedding TopK。
- 合并去重候选片段。
- 根据 routeType、意图、category、商品类目、风险标签和适用条件过滤。
- 日志页展示过滤原因。

FR 覆盖：FR-058 至 FR-060、FR-084。

### Story 4.4 实现 Reranker Adapter 与 grounding 判断

作为系统，我需要对候选片段进行重排序，并判断回复依据是否充分。

验收标准：

- 提供 Cross-Encoder Reranker Adapter 接口。
- MVP 可用 mock reranker 实现关键词权重、意图匹配、语义相似度模拟。
- 输出 rerankScore、排序原因和 groundingConfidence。
- Top1 分数低、Top1/Top2 分差过小、候选类别冲突或规则不适用时标记 `insufficient_grounding`。
- `insufficient_grounding` 时不得引用具体规则或知识结论。

FR 覆盖：FR-061 至 FR-064。

### Story 4.5 实现 VectorStore Adapter

作为系统，我需要本地向量索引能力，同时保留无依赖演示和后续替换空间。

验收标准：

- 默认实现 LanceDBVectorStore。
- 提供 InMemoryVectorStore adapter。
- VectorStore 支持 upsert、search、deleteBySource、rebuildIndex。
- 知识库更新时支持重新切片、重新 embedding、重建或增量更新索引。
- 向量索引不保存真实用户隐私、真实订单或真实物流数据。

FR 覆盖：FR-065 至 FR-070。

## Epic 5：售后证据、风险策略、回复生成与 QA

目标：增强售后服务分支的规则依据、图片线索、风险控制、回复生成和独立质检能力。

### Story 5.1 实现图片证据线索 adapter

作为系统，我需要从用户图片中提取售后证据线索，但不做最终责任判定。

验收标准：

- 支持 mock 图片识别结果。
- 可输出商品破损、外包装破损、配件缺失、型号信息、序列号/SN/IMEI、订单截图、物流截图、商品实拍图等线索。
- 图片线索以“疑似”“可能”“线索”形式进入 StructuredCase。
- 图片无法识别时提示补充更清晰图片或更多角度。

FR 覆盖：FR-010 至 FR-014。

### Story 5.2 实现 Policy & Evidence Agent

作为系统，我需要为售后回复提供可追踪的规则和证据依据。

验收标准：

- 输入 StructuredCase、图片线索和售后 RAG 结果。
- 输出命中规则、适用条件、证据充分性、缺失证据和保守表述建议。
- RAG 不足时标记 insufficient_grounding。
- 日志页展示规则证据结论。

FR 覆盖：FR-043 至 FR-046、FR-056、FR-061 至 FR-064。

### Story 5.3 实现 Risk & Strategy Agent

作为系统，我需要为售后回复提供风险等级和策略建议。

验收标准：

- 输出低、中、高风险等级。
- 输出禁止承诺项、安抚策略、补证策略、流程引导和转人工建议。
- 高风险场景默认避免退款、赔付、补发和最终判责承诺。
- 投诉升级、仅退款、直播承诺争议等场景触发风险升级。

FR 覆盖：FR-028、FR-046、FR-050、FR-054。

### Story 5.4 实现 Reply Agent

作为系统，我需要基于规则证据和风险策略生成候选售后回复。

验收标准：

- 输入 StructuredCase、PolicyEvidenceResult、RiskStrategyResult 和记忆上下文。
- 输出候选回复。
- 回复包含安抚、问题复述、规则或流程依据、下一步动作和限制性说明。
- 不直接承诺退款、赔付、补发或最终责任。

FR 覆盖：FR-047、FR-050、FR-075。

### Story 5.5 实现 QA Agent

作为系统，我需要独立审核售后候选回复，防止过度承诺和依据不足。

验收标准：

- QA 检查禁用承诺、最终判责、图片线索误表述、规则依据、语气风险和下一步动作。
- QA 不通过时输出 reasons 和 rewriteInstructions。
- Orchestrator 根据 rewriteInstructions 触发 Reply Agent 重写。
- 超过最大重写次数后转人工。

FR 覆盖：FR-048、FR-049、FR-050、FR-078。

## Epic 6：端到端演示、质量校验与开发就绪

目标：将 UI、Agent runtime、RAG、QA、日志和 badcase 串成可演示、可验收、可继续开发的 MVP 基线。

### Story 6.1 跑通普通客服端到端场景

作为演示者，我需要看到普通咨询从输入到自动回复的完整链路。

验收标准：

- 产品规格咨询命中 `general_service` 并由普通客服 RAG 回答。
- 发货/快递咨询命中 `general_service` 并基于本地演示知识回答。
- 普通客服审核通过后直接进入客户对话流。
- RAG 未命中时不编造信息，提示补充信息或转人工。

FR 覆盖：FR-036 至 FR-042、FR-071 至 FR-078。

### Story 6.2 跑通售后服务端到端场景

作为演示者，我需要看到售后服务从输入到 QA 通过或转人工的完整链路。

验收标准：

- 激活后退货、质量问题退款、包装破损、直播承诺、仅退款、投诉升级场景均进入 `after_sales`。
- Policy & Evidence 与 Risk & Strategy 并行执行。
- Reply Agent 生成候选回复。
- QA 通过后直接回复客户。
- 高风险或 QA 超限时显示正在转接人工。

FR 覆盖：FR-043 至 FR-054、FR-071 至 FR-078。

### Story 6.3 跑通信息不足与超范围场景

作为演示者，我需要验证系统不会在信息不足或超范围时强行回答。

验收标准：

- 信息不足场景输出补充信息模板。
- 客户补充后重新执行 Memory、Case Understanding、Rule Guardrail 和 Query Router。
- 超范围场景直接显示正在转接人工。
- 日志页记录 routeType、原因和最终状态。

FR 覆盖：FR-051 至 FR-054、FR-083、FR-084。

### Story 6.4 建立最小质量检查

作为开发者，我需要通过自动或手动检查确认 MVP 的安全边界没有被破坏。

验收标准：

- 构建通过。
- 端到端 demo 场景手动验收通过。
- 禁用承诺词检查通过。
- 主界面不默认展示 Agent/RAG/QA 内部细节。
- 日志页能解释每个场景的路由、RAG、审核和输出。

FR 覆盖：FR-006、FR-007、FR-071 至 FR-084。

## FR 覆盖总览

| 范围 | 主要覆盖 Story |
| --- | --- |
| Web 客服后台 | 2.1, 2.3, 2.4 |
| 对话与图片 | 2.1, 2.2, 5.1 |
| 会话记忆 | 3.2 |
| Case Understanding | 3.3 |
| Rule Guardrail | 3.4 |
| Query Router | 3.5 |
| 普通客服分支 | 3.6, 4.1, 4.2, 6.1 |
| 售后服务分支 | 3.6, 5.2, 5.3, 5.4, 5.5, 6.2 |
| 信息不足/人工兜底 | 3.6, 6.3 |
| RAG/VectorStore | 4.1 至 4.5 |
| Template Output | 3.7 |
| Badcase/日志 | 2.4, 2.5, 6.4 |

