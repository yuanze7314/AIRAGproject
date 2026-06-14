---
title: 内容电商 3C 售后智能客服 Agent PRD
status: aligned-draft
created: 2026-06-12
updated: 2026-06-13
source_brief: ../product-brief-3c-after-sales-agent/brief.md
change_proposal: ../sprint-change-proposal-20260613-agent-runtime-alignment.md
---

# PRD：内容电商 3C 售后智能客服 Agent

## 1. 产品定位

本产品第一版是一个面向内容电商平台的 Web 端智能客服后台 MVP，聚焦 3C 商品售后与普通客服咨询的自动回复。主界面面向一线客服，默认只展示客服对话窗口、客户可见回复、转人工状态和工单管理；Agent 执行链路、RAG 检索重排、审核循环、质检结果和 badcase 复盘放在独立日志/流程观测页。

系统不直接执行退款、退货、补发、赔付、物流查询、订单修改或真实工单流转。普通咨询和售后服务都通过本地 RAG 知识库模拟，不接入真实业务数据库。

## 2. 背景与问题

内容电商 3C 售后对话具有高复杂度和高风险：

1. 3C 商品涉及拆封、激活、二次销售、质量检测、配件、序列号和保修等复杂规则。
2. 用户常通过图片、订单截图、物流截图、商品实拍图等证据表达问题，传统文本机器人难以理解。
3. 3C 客单价较高，错误承诺退款、赔付、补发或最终责任判定会带来明显风控风险。
4. 普通客服咨询与售后争议容易混淆，例如“快递单号是什么”应走普通咨询，“耳机有杂音我要退款”应走售后服务。
5. badcase 如果不能沉淀，系统会重复发生错误路由、错误规则引用和过度承诺。

## 3. 目标用户

### 3.1 直接用户

在抖音、快手、小红书等内容电商平台购买 3C 商品后，在客服窗口发起咨询、投诉或售后举证的消费者。

### 3.2 间接用户

平台客服、售后运营和演示人员。第一版产品通过自动回复、转人工状态、工单管理和日志观测，帮助他们降低重复回复、规则误判、投诉升级和不合理赔付风险。

## 4. MVP 目标

1. 提供一个可运行的 Web 端电商客服后台。
2. 每轮对话先将客户输入结构化，再进行规则兜底和智能路由。
3. 使用 LLM structured output 作为主路由方案，规则兜底处理硬风险和超范围情况。
4. 将普通客服咨询与售后服务分离到不同处理链路。
5. 普通客服咨询通过普通客服 RAG 生成回复并审核。
6. 售后服务通过规则证据 Agent 与风险策略 Agent 并行分析，再由回复 Agent 生成、QA Agent 审核。
7. 审核通过后直接回复客户；无法安全回复或审核循环超限时显示正在转接人工。
8. 所有客户可见输出在发送前经过 Template Output 统一格式化和安全校验。
9. 支持当前会话记忆、图片证据线索、RAG 检索重排、badcase 记录和日志观测。

## 5. 非目标

1. 不做真实退款、退货、补发或赔付执行。
2. 不接入真实订单、支付、物流、仓储或客服工单系统。
3. 不做完整客服坐席后台、主管审核后台或商家协同后台。
4. 不做自动判责。
5. 不做复杂用户风险画像、反欺诈或黑产识别。
6. 不支持视频、语音或全类目售后。
7. 不把主界面做成 Agent 调试面板或 RAG 检索演示页。

## 6. 核心用户场景

### UJ-1：普通产品咨询

用户问“这个耳机支持主动降噪吗？”。系统先生成 StructuredCase，再由 Query Router 判断为 `general_service`，检索普通客服知识库后回答，不进入售后服务链路。

### UJ-2：普通物流咨询

用户问“我的订单什么时候发货 / 快递单号是多少？”。系统通过普通客服 RAG 使用模拟发货时效、快递说明或示例订单状态回答，不接真实物流数据库。

### UJ-3：激活后退货咨询

用户问“手机激活后还能退吗？”。系统判断为售后服务，命中激活、拆封、二次销售相关规则，解释处理路径，但不承诺可以退货。

### UJ-4：质量问题退款诉求

用户说“耳机用了两天有杂音，我要退款”。系统识别质量问题与退款诉求，要求补充故障证据或检测信息，不直接承诺退款。

### UJ-5：包装破损与商品划痕

用户上传图片并描述“包装破了，商品也有划痕”。系统识别图片线索，使用“疑似”“需进一步核实”等措辞，并要求补充更多角度或物流包装照片。

### UJ-6：直播承诺赠品缺失

用户说“主播说送充电头，但我收到没有”。系统识别直播承诺争议，要求补充直播承诺截图、录屏或活动页面信息，并保守引导人工核实。

### UJ-7：仅退款诉求

用户说“我不想退货，你们直接退款”。系统识别高风险仅退款诉求，不承诺退款，提示按平台流程提交凭证或转人工核实。

### UJ-8：投诉升级

用户说“不给我处理我就投诉”。系统识别情绪升级和投诉信号，优先安抚、复述诉求、避免争辩，并可转人工处理。

### UJ-9：信息不足

用户说“这个有问题怎么办”。系统发现缺少商品、问题、诉求或证据信息，输出补充信息请求；客户补充后重新进入 Case Understanding、Rule Guardrail 和 Query Router。

### UJ-10：超范围问题

用户提出非 3C 售后、非普通客服咨询或高风险不可自动回复的问题，系统直接显示正在转接人工。

## 7. Agent 运行机制

### 7.1 总体顺序

每轮对话必须遵循以下顺序：

1. Memory Adapter 读取当前会话记忆、历史回复、已要求补充信息、已采取措施和 badcase 标记。
2. Case Understanding Agent 将客户文本、图片信息、工单上下文和记忆整理为 StructuredCase。
3. Rule Guardrail 基于 StructuredCase 标记硬风险、超范围信号、禁止承诺项和兜底约束。
4. Query Router 基于 StructuredCase 与 GuardrailResult，使用 LLM structured output 输出四类 routeType。
5. Orchestrator 根据 routeType 进入对应分支。
6. 分支内生成候选回复并执行审核或 QA 循环。
7. Template Output 对所有客户可见输出进行模板化和最终安全校验。
8. 输出客户可见回复、补充信息请求或正在转接人工状态。
9. 全流程写入独立日志/流程观测页，主界面只展示客服处理所需信息。

### 7.2 四类路由

1. `general_service`：普通客服咨询，包括产品规格、包装清单、发货时间、快递公司、快递单号示例、订单基础状态、平台普通客服口径。
2. `after_sales`：售后服务，包括规则咨询、退货退款、质量问题、配件缺失、物流破损、直播承诺争议、仅退款诉求、投诉升级。
3. `needs_clarification`：结构化业务信息不足，需要客户补充商品、问题、诉求、证据或订单上下文。
4. `handoff_required`：超出 MVP 范围、高风险不可自动回复、审核循环超限、规则依据不足且无法澄清、图片证据严重冲突等情况。

### 7.3 路由方案选择

主路由方案采用 LLM structured output，而不是 Embedding 相似性路由。

理由：

1. 本业务需要同时判断业务类型、证据充分性、硬风险、补充信息需求和是否转人工，LLM 结构化判断更适合表达复杂条件。
2. Embedding 相似性更适合知识召回，不适合作为业务链路决策的唯一依据。
3. 规则兜底可稳定处理关键词硬风险，例如“仅退款”“投诉”“激活”“赔偿”“主播承诺”等。
4. MVP 需要可解释日志，LLM structured output 可输出 routeType、confidence、rationale、requiredInfo、riskSignals、guardrailApplied 和 targetFlow。

## 8. 功能需求

### 8.1 Web 客服后台

- FR-001：系统必须提供 Web 端电商客服后台主界面。
- FR-002：主界面必须只保留两个核心工作区：客服对话窗口和工单管理。
- FR-003：客服对话窗口必须展示消费者消息、消费者图片、AI 自动回复、补充信息请求和正在转接人工状态。
- FR-004：工单管理必须展示工单列表、工单状态、问题类型、风险标签、处理人、最近更新时间、来源平台和当前处理动作。
- FR-005：工单状态至少包括：待处理、处理中、待补充、待人工复核、已转人工、已完成、已标记 badcase。
- FR-006：主界面不得默认展示完整 Agent trace、RAG TopK、prompt、QA 推理或内部执行日志。
- FR-007：系统必须提供独立日志/流程观测页，用于展示 StructuredCase、Guardrail、Query Router、RAG 检索重排、审核循环、QA 结果和 badcase 标记。
- FR-008：主界面必须提供从会话或工单跳转到日志/流程观测页的入口。

### 8.2 对话输入与图片

- FR-009：系统必须支持用户输入文本消息。
- FR-010：系统必须支持用户上传至少一张图片作为证据。
- FR-011：对话流中必须展示图片缩略图或图片占位。
- FR-012：图片识别必须覆盖商品破损、外包装破损、配件缺失、商品型号信息、序列号/SN/IMEI、订单截图、物流截图和商品实拍图等线索。
- FR-013：图片识别结果只能作为辅助线索，不得作为最终责任判定。
- FR-014：当图片无法识别或证据不足时，系统必须提示客户补充更清晰图片或更多角度。

### 8.3 会话记忆

- FR-015：系统必须记录消费者消息、客服文本框对话、AI 自动回复、转人工状态、已要求补充的信息、已采取的处理措施和 badcase 标记。
- FR-016：每轮对话处理前，系统必须通过 Memory Adapter 将当前工单相关记忆注入 Case Understanding Agent 与后续回复生成上下文。
- FR-017：系统必须记录是否已经要求用户补充证据、是否已经转人工、是否已经触发重写，避免重复询问或重复执行同类动作。
- FR-018：会话记忆作为外挂模块维护，Agent 不直接长期持有内部状态。
- FR-019：当同一工单或会话记忆距离最近更新时间超过 7 天时，系统应将历史对话和中间处理措施压缩为摘要记忆。
- FR-020：当同一工单或会话记忆距离最近更新时间超过 30 天时，系统应清除详细记忆，仅保留必要的演示级统计或 badcase 记录。
- FR-021：MVP 记忆模块不得保存真实敏感隐私数据。

### 8.4 Case Understanding

- FR-022：每轮输入必须先进入 Case Understanding Agent。
- FR-023：Case Understanding Agent 必须输出 StructuredCase。
- FR-024：StructuredCase 必须包含商品信息、问题描述、用户诉求、证据状态、图片线索、情绪状态、已知上下文、缺失字段、风险信号和已采取措施摘要。
- FR-025：当关键信息不足时，StructuredCase 必须标记 missingFields 和 clarificationQuestions。

### 8.5 Rule Guardrail

- FR-026：Rule Guardrail 必须在 Query Router 前执行。
- FR-027：Rule Guardrail 必须基于 StructuredCase 标记硬风险、超范围信号、禁止承诺项和兜底约束。
- FR-028：以下信号必须触发风险升级：仅退款诉求、高额赔付诉求、激活后退货、直播承诺争议、投诉威胁、图片与文本冲突、规则召回不明确。
- FR-029：业务问题未包含在 MVP 支持范围内时，Rule Guardrail 或 Query Router 必须输出 `handoff_required`。

### 8.6 Query Router

- FR-030：Query Router 必须基于 StructuredCase 和 GuardrailResult 执行，不得直接基于原始输入绕过案件结构化。
- FR-031：Query Router 必须使用 LLM structured output 作为主路由方案。
- FR-032：Query Router 必须输出 `routeType`、`confidence`、`rationale`、`requiredInfo`、`riskSignals`、`guardrailApplied` 和 `targetFlow`。
- FR-033：Query Router 只能输出 `general_service`、`after_sales`、`needs_clarification`、`handoff_required` 四类 routeType。
- FR-034：系统不得采用 Embedding 相似性路由作为主路由；Embedding 仅用于 RAG 召回。
- FR-035：当普通客服问题中出现退款、退货、质量问题、赔付、补发、投诉等售后信号时，Query Router 必须切换到 `after_sales` 或 `handoff_required`。

### 8.7 普通客服分支

- FR-036：当 routeType 为 `general_service` 时，系统必须进入普通客服分支。
- FR-037：普通客服分支必须由 General Service Agent 结合普通客服 RAG 生成回复。
- FR-038：普通客服 RAG 必须覆盖商品规格、包装清单、发货时效、快递公司说明、快递单号示例、订单基础状态和平台普通客服口径。
- FR-039：普通客服分支不得自由编造商品参数、发货时间、快递单号或订单状态。
- FR-040：当普通客服 RAG 未命中或置信度不足时，系统必须回复无法确认并提示补充订单信息或转人工查询。
- FR-041：普通客服回复必须提交 General Review Agent 审核。
- FR-042：General Review Agent 不通过时，必须附带原因要求 General Service Agent 重写；达到最大循环次数后转人工。

### 8.8 售后服务分支

- FR-043：当 routeType 为 `after_sales` 时，系统必须进入售后服务分支。
- FR-044：售后服务分支必须并行执行 Policy & Evidence Agent 与 Risk & Strategy Agent。
- FR-045：Policy & Evidence Agent 必须检索售后规则库并输出规则证据结论。
- FR-046：Risk & Strategy Agent 必须输出风险等级、策略建议、禁止承诺项和是否需要转人工。
- FR-047：Reply Agent 必须基于 StructuredCase、规则证据结论、风险策略报告和外挂式记忆生成候选售后回复。
- FR-048：QA Agent 必须独立审核候选售后回复。
- FR-049：QA Agent 不通过时必须附带原因要求 Reply Agent 重写；达到最大循环次数后转人工。
- FR-050：高风险场景必须避免直接承诺退款、赔付、补发或最终判责，并建议补证、进一步核实或转人工。

### 8.9 信息不足与人工兜底

- FR-051：当 routeType 为 `needs_clarification` 时，系统必须向客户发起补充信息请求，不得输出结论性回复。
- FR-052：客户补充信息后，系统必须重新读取记忆、重新执行 Case Understanding、Rule Guardrail 和 Query Router。
- FR-053：当 routeType 为 `handoff_required` 时，系统必须直接显示“正在转接人工”或同等含义状态，不得生成未经审核的业务结论。
- FR-054：审核循环超限、RAG 依据不足且无法澄清、图片证据严重冲突或超范围问题必须进入人工兜底。

### 8.10 RAG、检索重排与向量存储

- FR-055：系统必须为普通客服分支和售后服务分支维护相互独立的知识库。
- FR-056：售后规则库必须覆盖平台售后规则、3C 类目规则、激活/拆封/二次销售规则、质量问题处理说明、配件缺失规则、物流破损规则和直播承诺争议处理口径。
- FR-057：系统必须先根据 routeType 限定检索知识库范围。
- FR-058：系统必须采用 BM25 关键词召回 + Embedding 向量召回 + 业务规则过滤 + Cross-Encoder 重排序的统一检索重排框架。
- FR-059：粗召回阶段必须同时执行 BM25 TopK 与 Embedding TopK，并合并去重候选片段。
- FR-060：重排序前必须执行业务过滤，包括 routeType、售后意图、规则 category、商品类目、风险标签和适用条件过滤。
- FR-061：系统必须输出 rerankScore、排序原因和 groundingConfidence。
- FR-062：第一版如果暂不接入真实 Cross-Encoder，可使用可替换 reranker adapter 以关键词权重、意图匹配和语义相似度模拟重排序。
- FR-063：当 Top1 分数低于阈值、Top1 与 Top2 分差过小、候选类别冲突或命中规则不满足适用条件时，系统必须标记 `insufficient_grounding`。
- FR-064：当出现 `insufficient_grounding` 时，Agent 不得引用具体规则或知识结论，应改为澄清、补充信息、保守解释或转人工。
- FR-065：MVP 默认使用本地向量索引，不接入云向量数据库或真实业务数据库。
- FR-066：系统默认采用 LanceDB 作为本地文件型向量索引。
- FR-067：系统必须保留 InMemoryVectorStore adapter，支持无外部依赖的本地演示和单元测试。
- FR-068：向量索引模块必须通过 VectorStore adapter 封装，后续可替换为 Qdrant、pgvector 或其他向量存储。
- FR-069：LanceDB 中只保存本地知识库切片、向量、标题、来源、category、metadata 和更新时间，不保存真实用户隐私、真实订单数据或真实物流数据。
- FR-070：知识库更新时必须支持重新切片、重新生成 embedding、重建或增量更新本地向量索引。

### 8.11 Template Output 与自动回复

- FR-071：系统默认采用自动回复模式，审核或 QA 通过后应直接将回复展示给客户。
- FR-072：所有客户可见回复在发送前必须经过 Template Output 层。
- FR-073：Template Output 必须根据 routeType 选择普通客服回答模板、售后服务回答模板、补充信息模板或转人工模板。
- FR-074：普通客服回答模板必须包含问题回应、可确认信息、依据来源或口径、必要限制说明，不得包含退款、赔付、责任判定等售后承诺。
- FR-075：售后服务回答模板必须包含安抚、问题复述、规则或流程依据、证据补充要求或下一步处理、必要限制说明。
- FR-076：补充信息模板必须明确列出需要客户补充的字段，不得输出售后结论。
- FR-077：转人工模板只能表达正在转接人工或将由人工继续处理，不得输出未经审核的业务结论。
- FR-078：Template Output 必须检查禁用承诺、最终判责、图片线索误表述、语气风险、空回复、字段缺失和格式错误。

### 8.12 Badcase 与日志

- FR-079：系统必须提供 badcase 记录入口。
- FR-080：badcase 类型必须至少包括：用户继续追问、转人工、意图识别错误、规则引用错误、图片识别失败、回复过度承诺、人工标记、wrong_route。
- FR-081：系统必须保存 badcase 的用户输入、Agent 分析结果、Agent 回复、标记原因和时间。
- FR-082：第一版只需要本地或模拟存储 badcase，不要求接入真实质检平台。
- FR-083：日志/流程观测页必须展示 routeType、审核结果、重写次数、转人工原因和 Template Output 校验结果。
- FR-084：日志/流程观测页必须展示 RAG 检索链路，包括 BM25 命中、Embedding 命中、过滤原因、Rerank TopK、groundingConfidence 和 insufficient_grounding 标记。

## 9. 非功能需求

- NFR-001：系统必须默认避免赔付、退款、补发和最终判责承诺。
- NFR-002：所有高风险回复必须包含“需进一步核实”“以平台审核结果为准”等限制性表达。
- NFR-003：图片识别输出必须以疑似、线索、可能等措辞呈现。
- NFR-004：RAG 未命中时不得编造平台规则、商品参数、发货时间、快递单号或订单状态。
- NFR-005：MVP 必须能在本地或演示环境中完整跑通至少 8 个典型场景。
- NFR-006：演示时必须能在独立流程观测页看到 Agent 中间判断、路由、RAG 重排、规则、图片线索、风险等级、策略和 QA 状态。
- NFR-007：售后规则库和普通客服知识库必须以可编辑文本或结构化文件维护。
- NFR-008：意图类型、风险规则、审核循环次数、回复禁用词和记忆生命周期应可配置。
- NFR-009：badcase 记录结构应便于后续导出或分析。
- NFR-010：演示环境下单轮回复目标时延应控制在 10 秒内。
- NFR-011：图片识别失败时系统应优雅降级为文本处理流程。
- NFR-012：演示环境下 RAG 检索与重排序目标时延应控制在 2 秒内；若 Cross-Encoder 不可用，应自动降级到本地 reranker adapter。
- NFR-013：主界面必须保持电商客服后台体验，不将内部 Agent 编排、prompt、RAG 重排细节作为默认主视觉。
- NFR-014：审核循环次数必须可配置，MVP 默认最大重写 2 次，超过后必须转人工。
- NFR-015：记忆压缩和清理策略必须可配置，MVP 默认 7 天压缩、30 天清除详细记忆。

## 10. 核心数据对象

### 10.1 StructuredCase

- `caseId`
- `conversationId`
- `productInfo`
- `issueSummary`
- `customerRequest`
- `evidenceState`
- `imageClues`
- `emotionState`
- `knownContext`
- `missingFields`
- `riskSignals`
- `priorActions`
- `clarificationQuestions`

### 10.2 GuardrailResult

- `hardRiskFlags`
- `outOfScope`
- `prohibitedCommitments`
- `fallbackConstraints`
- `recommendedRouteOverride`
- `rationale`

### 10.3 RouteDecision

- `routeType`
- `confidence`
- `rationale`
- `requiredInfo`
- `riskSignals`
- `guardrailApplied`
- `targetFlow`

### 10.4 RetrievalResult

- `query`
- `knowledgeBase`
- `bm25Candidates`
- `embeddingCandidates`
- `filteredCandidates`
- `rerankedTopK`
- `groundingConfidence`
- `insufficientGrounding`

### 10.5 ReviewResult

- `passed`
- `reasons`
- `rewriteInstructions`
- `riskFlags`
- `attempt`

### 10.6 TemplateOutputResult

- `visibleStatus`
- `finalMessage`
- `templateType`
- `safetyChecks`
- `handoffReason`

## 11. 验收标准

- AC-001：输入“这个耳机支持主动降噪吗？”，系统应先生成 StructuredCase，再路由到 `general_service`，通过普通客服 RAG 回答。
- AC-002：输入“我的订单什么时候发货 / 快递单号是多少？”，系统应路由到 `general_service`，基于普通客服 RAG 的演示知识回答，不伪造真实数据库查询。
- AC-003：输入“手机激活后还能退吗？”，系统应路由到 `after_sales`，命中激活/拆封/二次销售规则，不承诺可退。
- AC-004：输入“耳机用了两天有杂音，我要退款”，系统应路由到 `after_sales`，识别质量问题与退款诉求，要求补充证据或检测信息。
- AC-005：上传破损包装图片并描述商品划痕，系统应输出疑似破损线索，不得表述为最终事实判定。
- AC-006：输入“主播说送充电头，但我收到没有”，系统应识别直播承诺争议，并要求补充承诺证据。
- AC-007：输入“我不想退货，你们直接退款”，系统应识别高风险仅退款诉求，不得承诺退款。
- AC-008：输入“不给我处理我就投诉”，系统应识别投诉升级，回复中先安抚并建议人工介入或进一步核实。
- AC-009：输入“这个有问题怎么办”且缺少商品和问题信息时，系统应路由到 `needs_clarification` 并输出补充信息模板。
- AC-010：客户补充信息后，系统必须重新读取记忆、重新结构化问题并重新路由。
- AC-011：输入超出 3C 售后和普通客服范围的问题时，系统应路由到 `handoff_required` 并显示正在转接人工。
- AC-012：任何场景下，Agent 回复不得直接承诺退款、赔付、补发或最终责任判定。
- AC-013：RAG 未命中时，系统不得编造规则、商品参数、发货时间、快递单号或订单状态。
- AC-014：当 RAG Top1 置信度不足或候选类别冲突时，系统必须标记 `insufficient_grounding` 并输出澄清、补证或转人工路径。
- AC-015：普通客服链路的审核 Agent 不通过时必须触发重写；达到最大重写次数后显示正在转接人工。
- AC-016：售后服务链路的 QA Agent 不通过时必须附带原因要求 Reply Agent 重写；达到最大重写次数后显示正在转接人工。
- AC-017：QA 或审核通过后，回复应直接进入客户对话流，不需要客服二次确认发送。
- AC-018：所有客户可见回复必须经过 Template Output 层校验后才能发送。
- AC-019：主界面只展示客服对话窗口、AI 自动回复/转人工状态和工单管理，不默认展示 Agent/RAG/QA 详细日志。
- AC-020：日志/流程观测页必须展示 StructuredCase、Rule Guardrail、Query Router、RAG 重排、审核循环、Template Output 和 badcase 风险标签。
- AC-021：主界面必须提供工单队列，并支持按待处理、处理中、待补充、待人工复核、已完成等状态查看。
- AC-022：客服在主界面能够完成查看消息、查看 AI 自动回复、查看转人工状态、重新生成、标记 badcase 的闭环。
- AC-023：超过 7 天未更新的会话记忆应压缩为摘要；超过 30 天未更新的详细记忆应清除。
- AC-024：向量索引默认使用 LanceDB，本地无依赖模式可切换为 InMemoryVectorStore adapter。
- AC-025：日志/流程观测页必须展示 BM25 候选、Embedding 候选、业务过滤原因、Rerank TopK 和 groundingConfidence。

## 12. 第一版成功标准

1. 可以在本地启动 Web 客服后台。
2. 主界面呈现为电商客服后台，而不是 Agent 调试面板。
3. 至少 8 个典型场景可以跑通端到端流程。
4. 普通客服咨询和售后服务能被正确分流。
5. 高风险、信息不足、审核失败和超范围问题能进入补充信息或转人工路径。
6. 日志/流程观测页能解释每次回复为什么这样处理。
7. badcase 能被本地记录。
