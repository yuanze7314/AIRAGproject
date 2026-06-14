---
stepsCompleted: [1, 2, 3, 4, 5, 6]
includedFiles:
  prd: E:\Agent项目\skill专题\_bmad-output\planning-artifacts\prd-3c-after-sales-agent\prd.md
  architecture: E:\Agent项目\skill专题\_bmad-output\planning-artifacts\architecture-3c-after-sales-agent\architecture.md
  epics: E:\Agent项目\skill专题\_bmad-output\planning-artifacts\epics-3c-after-sales-agent\epics-and-stories.md
  ux: null
---

# Implementation Readiness Assessment Report

**Date:** 2026-06-13
**Project:** skill专题

## Step 1: Document Discovery

### PRD Files Found

**Whole Documents:**
- `E:\Agent项目\skill专题\_bmad-output\planning-artifacts\prd-3c-after-sales-agent\prd.md` (32379 bytes, modified 2026-06-12 23:51:45)

**Sharded Documents:**
- None found

### Architecture Files Found

**Whole Documents:**
- `E:\Agent项目\skill专题\_bmad-output\planning-artifacts\architecture-3c-after-sales-agent\architecture.md` (30845 bytes, modified 2026-06-13)

**Sharded Documents:**
- None found

### Epics & Stories Files Found

**Whole Documents:**
- `E:\Agent项目\skill专题\_bmad-output\planning-artifacts\epics-3c-after-sales-agent\epics-and-stories.md` (15905 bytes, modified 2026-06-13)

**Sharded Documents:**
- None found

### UX Files Found

**Whole Documents:**
- None found

**Sharded Documents:**
- None found

### Issues Found

- No duplicate whole + sharded document conflicts were found.
- No dedicated UX document was found. UI requirements appear to live in the PRD, but this must be validated in later steps.
- `story-index.md` exists under the epics artifact folder but is not the primary epics file and may be stale.

## Step 2: PRD Analysis

### Functional Requirements

- FR-001：系统必须提供一个 Web 端电商客服后台主界面，支持在对话窗口中查看消费者消息、展示 AI 自动回复结果和转人工状态。
- FR-002：系统必须支持用户上传至少一张图片作为售后证据。
- FR-003：系统必须在对话流中展示消费者消息、消费者图片、AI 自动回复和转人工状态。
- FR-004：主界面只展示客服处理所需的自动回复结果、工单状态、简要风险提示和可执行动作，不展示 RAG 检索详情、Agent 执行链路或内部质检日志。
- FR-005：系统必须允许用户连续多轮追问，并保留当前会话上下文。
- FR-006：系统必须识别用户消息的主要售后意图。
- FR-007：第一版必须支持以下意图：规则咨询、退货退款、质量问题、配件缺失、物流破损、直播承诺争议、仅退款诉求、投诉升级。
- FR-008：系统必须为每次识别输出置信度或解释说明。
- FR-009：当意图不明确时，系统必须生成澄清性回复，而不是直接给处理结论。
- FR-010：系统必须接入一个小型售后规则库。
- FR-011：规则库必须覆盖平台售后规则、3C 类目规则、激活/拆封/二次销售规则、质量问题处理说明、配件缺失规则、物流破损规则、直播承诺争议处理口径。
- FR-012：每次生成回复前，系统必须基于用户输入和会话上下文检索相关规则。
- FR-013：系统必须展示命中的规则标题或摘要，供演示和调试使用。
- FR-014：当规则召回为空或相关性不足时，系统必须降低自动回复确定性，并优先建议补充信息或转人工。
- FR-015：系统必须记录客服文本框对话、消费者消息、AI 自动回复、转人工状态、已要求补充的信息、已采取的处理措施和 badcase 标记。
- FR-016：系统必须在每次触发对话处理时，将当前工单相关记忆作为上下文注入 Case Understanding Agent 与后续回复生成提示词中。
- FR-017：系统必须记录 Agent 是否已经要求用户补充证据、是否已经转人工、是否已经触发重写，避免重复询问或重复执行同类动作。
- FR-018：会话记忆作为外挂模块维护，不要求 Agent 直接长期持有内部状态；Agent 通过 Memory Adapter 读取被注入的上下文。
- FR-019：当同一工单或会话记忆距离最近更新时间超过 7 天时，系统应将历史对话和中间处理措施压缩为摘要记忆。
- FR-020：当同一工单或会话记忆距离最近更新时间超过 30 天时，系统应清除详细记忆，仅保留必要的演示级统计或 badcase 记录。
- FR-021：记忆中不得保存真实敏感隐私数据；MVP 使用本地模拟会话和工单数据。
- FR-022：系统必须支持对用户上传图片进行售后证据线索识别。
- FR-023：第一版图片识别应覆盖：商品破损、外包装破损、配件缺失、商品型号信息、序列号/SN/IMEI、订单截图、物流截图、商品实拍图。
- FR-024：图片识别结果必须以“线索”形式参与回复策略，不得作为最终责任判定。
- FR-025：当图片无法识别或证据不足时，系统必须提示用户补充更清晰的图片或更多角度。
- FR-023：系统必须为每次售后请求输出风险等级：低、中、高。
- FR-024：低风险场景可以直接解释规则和下一步流程。
- FR-025：中风险场景必须包含安抚、补证或流程引导。
- FR-026：高风险场景必须避免直接承诺退款、赔付、补发、最终判责，并建议转人工或进一步核实。
- FR-027：以下信号必须触发高风险或风险升级：仅退款诉求、高额赔付诉求、激活后退货、直播承诺争议、投诉威胁、图片与文本冲突、规则召回不明确。
- FR-028：系统必须生成一段可直接发送给消费者的客服回复。
- FR-029：回复必须包含安抚语气、问题复述、规则或流程依据、下一步动作。
- FR-030：回复不得包含未经规则或人工审核支持的承诺。
- FR-031：回复必须避免“已确认损坏”“确定是物流责任”“一定可以退款”等最终判定措辞。
- FR-032：回复应根据场景选择不同口径，而不是固定模板。
- FR-033：系统必须提供 badcase 记录入口。
- FR-034：badcase 类型必须至少包括：用户继续追问、转人工、意图识别错误、规则引用错误、图片识别失败、回复过度承诺、人工标记。
- FR-035：系统必须保存 badcase 的用户输入、Agent 分析结果、Agent 回复、标记原因和时间。
- FR-036：第一版只需要本地或模拟存储 badcase，不要求接入真实质检平台。
- FR-037：系统必须采用“先结构化、再兜底、再路由、再执行”的 Agent 运行机制。
- FR-038：Agent Orchestrator 必须是确定性调度器，负责执行顺序、分支流转、并行边界、审核循环、最大重写次数、自动回复和转人工终止，不负责自由业务判断。
- FR-039：每轮输入必须先进入 Case Understanding Agent，将客户文本、图片、工单上下文和外挂式记忆整理为结构化业务问题。
- FR-040：Case Understanding Agent 必须输出商品信息、问题描述、用户诉求、证据状态、情绪状态、已知上下文、缺失字段、风险信号、已采取措施摘要。
- FR-041：Rule Guardrail 必须在路由前基于结构化问题标记硬风险、超范围信号、禁止承诺项和兜底约束。
- FR-042：Query Router 必须基于结构化问题和 Rule Guardrail 结果，使用 LLM 结构化意图识别输出四类 routeType：`general_service`、`after_sales`、`needs_clarification`、`handoff_required`。
- FR-043：系统不采用 Embedding 相似性路由作为主路由方案；Embedding 仅用于 RAG 召回，不用于决定业务链路。
- FR-044：当 routeType 为 `general_service` 时，进入普通客服链路：General Service Agent 结合普通客服 RAG 生成回复，提交审核 Agent 审核，通过后直接回复客户。
- FR-045：普通客服审核 Agent 不通过时，必须附带原因要求 General Service Agent 重写；达到最大循环次数后截断自动回复并转人工。
- FR-046：当 routeType 为 `after_sales` 时，进入售后服务链路：Policy & Evidence Agent 与 Risk & Strategy Agent 基于结构化问题并行执行，分别产出规则证据结论和风险策略报告。
- FR-047：Reply Agent 必须基于结构化问题、规则证据结论、风险策略报告和外挂式记忆生成候选售后回复。
- FR-048：QA Agent 必须独立审核售后候选回复；审核不通过时必须附带原因要求 Reply Agent 重写；达到最大循环次数后转人工。
- FR-049：当 routeType 为 `needs_clarification` 时，系统必须向客户发起补充信息请求；客户补充后必须重新进入 Case Understanding Agent，而不是沿用旧路由结果。
- FR-050：当 routeType 为 `handoff_required` 时，系统必须直接显示“正在转接人工”，不得生成业务结论型回复。
- FR-051：业务问题未包含在 MVP 支持范围内时，Rule Guardrail 或 Query Router 必须输出 `handoff_required`。
- FR-052：所有 routeType、审核结果、重写次数、转人工原因和输出模板校验结果必须写入日志/流程观测页。
- FR-053：Query Router 必须以 LLM structured output 形式输出 routeType、confidence、rationale、requiredInfo、riskSignals、guardrailApplied 和 targetFlow。
- FR-054：`general_service` 覆盖产品规格、包装清单、发货时间、快递公司、快递单号示例、订单基础状态等普通客服咨询。
- FR-055：`after_sales` 覆盖规则咨询、退货退款、质量问题、配件缺失、物流破损、直播承诺争议、仅退款诉求、投诉升级等售后服务回复。
- FR-056：`needs_clarification` 用于结构化业务信息不足的情况，例如缺少商品、问题、诉求、证据或必要订单上下文。
- FR-057：`handoff_required` 用于超出处理范围、高风险不可自动回复、审核循环超限、规则依据不足且无法澄清、图片证据严重冲突等情况。
- FR-058：主界面必须以客服可理解的方式展示当前处理状态，如自动回复、需要补充信息、正在转接人工；独立日志/流程观测页展示结构化 Case、Guardrail、Query Router 路由理由和目标链路。
- FR-059：badcase 类型必须支持 `wrong_route`，用于记录普通咨询误入售后链路、售后争议误入普通链路、应澄清却直接回答或应转人工却自动回复的问题。
- FR-060：系统必须为普通客服分支建立独立 RAG 知识库，与售后规则库分开维护。
- FR-061：普通客服知识库必须覆盖商品规格、包装清单、发货时效、快递公司说明、快递单号示例、订单基础状态、平台普通客服口径。
- FR-062：General Service Agent 必须基于检索命中的知识片段生成回复，不得自由编造商品参数、发货时间、快递单号或订单状态。
- FR-063：当普通客服 RAG 未命中或置信度不足时，系统必须回复无法确认并提示补充订单信息或转人工查询，不得伪造数据库查询结果。
- FR-064：当普通客服问题中出现退款、退货、质量问题、赔付、补发、投诉等售后信号时，Rule Guardrail 必须标记硬风险，Query Router 必须切换到 `after_sales` 或 `handoff_required`，不得由普通客服分支继续回答。
- FR-060：系统必须对售后规则 RAG 和普通客服 RAG 采用统一的检索重排序框架，默认策略为 BM25 关键词召回 + Embedding 向量召回 + 业务规则过滤 + Cross-Encoder 重排序。
- FR-061：系统必须先根据 Query Router 的 routeType 限定检索知识库范围：`general_service` 只检索普通客服知识库，`after_sales` 只检索售后规则库，`needs_clarification` 与 `handoff_required` 不直接检索并生成结论性回复。
- FR-062：系统必须在粗召回阶段同时执行 BM25 TopK 与 Embedding TopK，并合并去重候选片段。
- FR-063：系统必须在重排序前执行业务过滤，包括 routeType、售后意图、规则 category、商品类目、风险标签和适用条件过滤。
- FR-064：系统必须使用 Cross-Encoder Reranker 对用户问题与候选片段进行相关性重排序，输出 rerankScore 和排序原因。
- FR-065：第一版如果暂不接入真实 Cross-Encoder 模型，可以使用可替换的 reranker adapter，以关键词权重、意图匹配和语义相似度模拟重排序，但接口必须保留 Cross-Encoder 替换能力。
- FR-066：系统必须输出 groundingConfidence，用于判断当前回复依据是否充分。
- FR-067：当 Top1 分数低于阈值、Top1 与 Top2 分差过小、候选片段类别冲突或命中规则不满足适用条件时，系统必须标记 `insufficient_grounding`。
- FR-068：当出现 `insufficient_grounding` 时，Reply Agent 或 General Service Agent 不得引用具体规则或知识结论，应改为澄清、补充信息、保守解释或转人工。
- FR-069：独立日志/流程观测页必须展示 RAG 检索链路，包括 BM25 命中、Embedding 命中、过滤原因、Rerank TopK、groundingConfidence 和 insufficient_grounding 标记；主界面不默认展示这些检索细节。
- FR-070：MVP 阶段默认使用本地向量索引，不接入云向量数据库或真实业务数据库。
- FR-071：系统默认采用 LanceDB 作为本地文件型向量索引，用于售后规则 RAG 和普通客服 RAG 的 Embedding 召回。
- FR-072：系统必须保留 InMemoryVectorStore adapter，支持无外部依赖的本地演示和单元测试。
- FR-073：向量索引模块必须通过 VectorStore adapter 封装，后续可替换为 Qdrant、pgvector 或其他向量存储，不影响 Agent 编排和 UI。
- FR-074：LanceDB 中只保存本地知识库切片、向量、标题、来源、category、metadata 和更新时间，不保存真实用户隐私、真实订单数据或真实物流数据。
- FR-075：知识库更新时必须支持重新切片、重新生成 embedding、重建或增量更新本地向量索引。
- FR-076：主界面必须定位为电商客服后台，而不是 Agent 调试面板或知识库检索演示页。
- FR-077：主界面只保留两个核心工作区：客服对话窗口和工单管理。
- FR-078：客服对话窗口必须展示消费者消息、图片证据、AI 自动回复、转人工状态、重新生成和标记 badcase 等操作。
- FR-079：AI 回复必须以最终客服回答效果呈现，QA 通过后直接进入客户对话流，不在主界面展开 Agent、RAG、QA 的详细执行过程。
- FR-080：工单管理必须展示工单列表、工单状态、问题类型、风险标签、处理人、最近更新时间、来源平台和当前处理动作。
- FR-081：工单状态至少包括：待处理、处理中、待补充、待人工复核、已转人工、已完成、已标记 badcase。
- FR-082：主界面可以展示轻量提示，例如“正在转接人工”“需补充凭证”“回复已通过安全检查”，但不得展示完整 Agent trace、RAG TopK、prompt 或内部推理链。
- FR-083：系统必须提供独立日志/流程观测页，用于展示 Smart Router、RAG 检索重排、售后 5-Agent 图、QA 质检、重写循环和 badcase 标记。
- FR-084：日志/流程观测页面向演示、调试和运营复盘，不作为一线客服默认工作界面。
- FR-085：主界面需要提供从工单或会话跳转到日志/流程观测页的入口，但默认收起，避免干扰客服处理效率。
- FR-086：系统默认采用自动回复模式，QA Agent 通过后应直接将回复展示给客户，而不是停留为客服可编辑草稿。
- FR-087：当命中高风险、RAG 依据不足、QA 多次不通过、图片证据不清或需要人工核实时，系统不得生成强行回复，必须输出“正在转接人工”的客户可见状态。
- FR-088：自动回复必须在日志/流程观测页记录发送前的 QA 结果、命中规则、风险等级和转人工原因，便于后续复盘。
- FR-089：Agent Orchestrator 必须是确定性调度器，负责分支执行、并行边界、QA 打回、重试上限、自动回复和转人工终止；Smart Router Agent 只负责路由判断，不负责自由调度。
- FR-090：所有客户可见回复在发送前必须经过 Template Output 层进行格式化和最终校验。
- FR-091：Template Output 层必须根据 routeType 选择输出模板：普通客服回答模板、售后服务回答模板、补充信息模板、正在转接人工模板。
- FR-092：普通客服回答模板必须包含问题回应、可确认的信息、依据来源或口径、必要限制说明，不得包含退款、赔付、责任判定等售后承诺。
- FR-093：售后服务回答模板必须包含安抚、问题复述、规则/流程依据、证据补充要求或下一步处理、必要限制说明。
- FR-094：补充信息模板必须明确列出需要客户补充的字段，不得输出售后结论。
- FR-095：转人工模板必须只表达正在转接人工或将由人工继续处理，不得输出未经审核的业务结论。
- FR-096：Template Output 层必须检查禁用承诺、最终判责、图片线索误表述、语气风险、空回复、字段缺失和格式错误。

Total FR lines extracted: 104

### Non-Functional Requirements

- NFR-001：系统必须默认避免赔付、退款、补发、最终判责承诺。
- NFR-002：所有高风险回复必须包含“需进一步核实”或“以平台审核结果为准”之类的限制性表达。
- NFR-003：图片识别输出必须以疑似、线索、可能等措辞呈现。
- NFR-004：RAG 未命中时不得编造平台规则。
- NFR-005：系统必须能在本地或演示环境中完整跑通 6 个典型场景。
- NFR-006：演示时必须能在独立流程观测界面看到 Agent 的中间判断，包括路由、RAG 检索重排、意图、规则、图片线索、风险等级、策略和 QA 状态。
- NFR-007：售后规则库必须以可编辑文本或结构化文件维护。
- NFR-008：意图类型、风险规则、回复禁用词应可配置。
- NFR-009：badcase 记录结构应便于后续导出或分析。
- NFR-010：[ASSUMPTION] 演示环境下单轮回复应在 10 秒内完成。
- NFR-011：[ASSUMPTION] 图片识别失败时系统应优雅降级为文本售后回复流程。
- NFR-012：[ASSUMPTION] 演示环境下 RAG 检索与重排序应在 2 秒内完成；若 Cross-Encoder 不可用，应自动降级到本地 reranker adapter。
- NFR-013：主界面必须保持电商客服后台体验，避免把内部 Agent 编排、prompt、RAG 重排细节作为默认主视觉；这些信息只在独立日志/流程观测页展示。
- NFR-014：审核循环次数必须可配置，MVP 默认最大重写 2 次，超过后必须转人工。
- NFR-015：记忆压缩和清理策略必须可配置，MVP 默认 7 天压缩、30 天清除详细记忆。

Total NFRs extracted: 15

### Additional Requirements

#### Product Constraints / Non-goals

- 不做真实售后执行。
- 不接真实订单、支付、物流、赔付系统。
- 不做完整客服工单后台。
- 不做自动判责。
- 不做复杂反欺诈或用户风险画像。
- 不支持视频、语音或全类目售后。

#### Acceptance Criteria Extracted

- AC-001：输入“手机激活后还能退吗？”，系统应识别为激活后退货规则咨询，并避免承诺可退。
- AC-002：输入“耳机用了两天有杂音，我要退款”，系统应识别为质量问题 + 退款诉求，并要求补充证据或检测信息。
- AC-003：上传破损包装图片并描述商品划痕，系统应输出疑似破损线索，并要求进一步核实。
- AC-004：输入“主播说送充电头，但我收到没有”，系统应识别直播承诺争议，并要求补充承诺证据。
- AC-005：输入“我不想退货，你们直接退款”，系统应识别高风险仅退款诉求，不得承诺退款。
- AC-006：输入“不给我处理我就投诉”，系统应识别投诉升级，回复中先安抚并建议人工介入。
- AC-007：任何场景下，Agent 回复不得直接承诺退款、赔付、补发或最终责任判定。
- AC-008：图片识别结果不得被表述为最终事实判定。
- AC-009：RAG 未命中时，系统不得编造规则依据。
- AC-010：高风险场景必须出现补证、核实、平台审核或转人工路径。
- AC-011：对话窗口支持文本输入和图片上传。
- AC-012：主界面只展示客服对话窗口、AI 自动回复/转人工状态和工单管理；独立日志/流程观测页展示 5 个 Agent 的中间结果，包括案件理解、规则与证据、风险与策略、候选回复、独立质检。
- AC-013：系统支持多轮上下文记忆。
- AC-014：系统支持 badcase 标记与记录查看。
- AC-015：输入“这个耳机支持主动降噪吗？”，系统应先形成 StructuredCase，再路由到普通客服咨询，不进入售后 5-Agent 图。
- AC-016：输入“我这个订单什么时候发货 / 快递单号是多少？”，系统应路由到普通客服咨询，并基于普通客服 RAG 知识库命中的演示知识回答。
- AC-017：输入“耳机用了两天有杂音，我要退款”，系统应先形成 StructuredCase，Rule Guardrail 标记质量/退款风险，再路由到售后争议并进入售后服务链路。
- AC-018：输入“这个有问题怎么办”且缺少商品和问题信息时，系统应路由到 needs_clarification 并输出补充信息模板；客户补充后必须重新结构化并重新路由。
- AC-019：主界面必须能区分普通客服回答、售后争议回复和澄清回复；独立流程观测界面必须展示 Smart Router 的路由结果，并能区分普通客服链路与售后 5-Agent 链路。
- AC-020：日志/流程观测页必须展示 BM25 候选、Embedding 候选和重排序 TopK；主界面不默认展示检索细节。
- AC-021：当用户问题为“激活后还能退吗”时，售后规则 RAG 应优先命中激活/拆封/二次销售相关规则，而不是泛化退货规则。
- AC-022：当用户问题为“耳机支持主动降噪吗”时，普通客服 RAG 应只检索普通客服知识库，不进入售后规则库。
- AC-023：当 RAG Top1 置信度不足或候选类别冲突时，系统必须标记 insufficient_grounding，并输出澄清、补证或转人工路径。
- AC-024：主界面不得出现以 Agent 名称堆叠的主要工作区，默认只呈现客服回答效果、会话处理和工单管理。
- AC-025：系统必须提供独立日志/流程观测页，可查看 Smart Router、RAG 重排、售后 5-Agent、QA 打回和 badcase 风险标签。
- AC-026：向量索引默认使用 LanceDB，本地无依赖模式可切换为 InMemoryVectorStore adapter。
- AC-027：主界面生成的回复在 QA 通过后直接发送给客户；无法安全回复时显示正在转接人工。
- AC-028：主界面必须提供工单队列，并支持按待处理、处理中、待补充、待人工复核、已完成等状态查看。
- AC-029：客服在主界面能够完成查看消息、查看 AI 自动回复、查看转人工状态、重新生成、标记 badcase 的闭环。
- AC-030：Agent/RAG/QA 详细日志不得出现在主界面默认视图，只能通过日志/流程观测页查看。
- AC-031：当 QA Agent 通过时，回复应直接进入客户对话流，不需要客服二次确认发送。
- AC-032：当系统无法安全回复时，客户侧应看到“正在转接人工”或同等含义的状态，而不是风险回复或空白失败。
- AC-033：每轮对话必须先生成 StructuredCase，再执行 Rule Guardrail 和 Query Router，日志页可查看三者结果。
- AC-034：普通客服链路的审核 Agent 不通过时必须触发重写；达到最大重写次数后显示正在转接人工。
- AC-035：售后服务链路的 QA Agent 不通过时必须附带原因要求 Reply Agent 重写；达到最大重写次数后显示正在转接人工。
- AC-036：当输入超出 3C 售后和普通客服范围时，系统应路由到 handoff_required 并直接显示正在转接人工。
- AC-037：客户补充信息后，系统必须重新读取外挂式记忆、重新结构化问题并重新路由。
- AC-038：超过 7 天未更新的会话记忆应压缩为摘要；超过 30 天未更新的详细记忆应清除。
- AC-039：所有客户可见回复必须经过 Template Output 层校验后才能发送。

Total ACs extracted: 39

### PRD Completeness Assessment

- PRD contains substantial functional coverage for the latest product direction: Web e-commerce customer service backend, structured case understanding, Rule Guardrail, LLM Query Router, four route branches, review loops, Template Output, memory retention, RAG, vector index, UI constraints, safety and acceptance criteria.
- Important issue found for later validation: FR numbering is inconsistent and includes duplicates after recent revisions. For example, FR-023/FR-024/FR-025 appear in multiple sections, and FR-060 through FR-064 are repeated across ordinary RAG and RAG reranking sections. This does not block conceptual validation, but it will hurt traceability unless corrected before story generation.
- PRD still contains some legacy wording in data/AC areas: RouteDecision lists detectedTopics and 	argetGraph; AC-019/AC-025 still mention Smart Router / 5-Agent phrasing even though latest mechanism is Query Router and four-branch Agent flow. These should be checked in epic coverage validation.
- No dedicated UX document exists. PRD includes UI constraints, but UX coverage should be treated as PRD-contained rather than a separate source.


## Step 3: Epic Coverage Validation

### Epic FR Coverage Extracted

No explicit FR Coverage Map was found in `epics-and-stories.md`.

Semantic coverage found in epics:

| Requirement Area | Epic / Story Coverage | Status |
| --- | --- | --- |
| Web app skeleton and demo data | Epic 1 / Stories 1.1-1.3 | Covered |
| Customer conversation UI | Epic 2 / Story 2.1 | Partial |
| Image upload | Epic 2 / Story 2.2 | Covered |
| Log / process observation page | Epic 2 / Story 2.3 | Partial, still has old 5-Agent wording |
| Badcase marking | Epic 2 / Story 2.4, Epic 8 | Covered |
| Ticket management | Epic 2 / Story 2.5 | Covered |
| Orchestrator and four-branch flow | Epic 3 / Stories 3.1-3.5 | Partial |
| External memory and template output | Epic 3 / Story 3.5 | Partial |
| Case understanding | Epic 4 | Partial, still references old CaseModel and old intent flow |
| Policy & Evidence / rule RAG | Epic 5 | Partial |
| Risk & Strategy | Epic 6 | Covered for older售后 flow, partial for latest Guardrail-first flow |
| Reply and QA | Epic 7 | Partial |
| General Service RAG | Supplemental section only | Partial, not a first-class epic/story |
| RAG reranking algorithm | Not clearly covered | Missing |
| LanceDB / VectorStore adapter | Not covered | Missing |
| Template Output validation details | Story 3.5 only high level | Partial |
| Memory 7-day compression / 30-day cleanup | Story 3.5 | Covered at high level |

### Coverage Matrix

| PRD FR Range / Area | PRD Requirement Summary | Epic Coverage | Status |
| --- | --- | --- | --- |
| FR-001-FR-005 | Main customer service backend conversation UI, images, auto reply/handoff status, no internal logs in main UI, multi-turn context | Epic 2.1, 2.2, 2.5 | Partial |
| FR-006-FR-009 | After-sales intent identification and clarification | Epic 4.2 | Partial; old intent framing remains |
| FR-010-FR-014 | After-sales rule RAG | Epic 5.1, 5.2 | Covered at basic level |
| FR-015-FR-021 | External memory, prompt injection, action history, 7-day compression, 30-day cleanup | Epic 3.5, old 4.3 | Partial; needs dedicated implementation story |
| FR-022-FR-025 | Image evidence recognition and safety wording | Epic 2.2, 5.3 | Partial |
| FR-023-FR-027 duplicate block | Risk level and reply strategy | Epic 6.1-6.4 | Covered semantically, but numbering conflict in PRD |
| FR-028-FR-032 | Text reply generation and prohibited wording | Epic 7.1 | Covered semantically |
| FR-033-FR-036 | Badcase record | Epic 2.4, 8.1, 8.2 | Covered |
| FR-037-FR-052 | Latest Agent mechanism: structure first, Rule Guardrail, LLM Query Router, four branches, review loops, handoff | Epic 3.1-3.5 | Partial; no dedicated Rule Guardrail/Query Router stories with full ACs |
| FR-053-FR-059 | Four route definitions and wrong_route badcase | Epic 3.2, supplemental text | Partial |
| FR-060-FR-064 general RAG | Ordinary customer service RAG KB and routing away from售后 signals | Supplemental section only | Partial / weak traceability |
| FR-060-FR-069 RAG reranking duplicate block | BM25 + Embedding + filtering + Cross-Encoder reranking + confidence gate + trace display | Epic 5.2 only basic rule retrieval | Missing for reranking details |
| FR-070-FR-075 | LanceDB/InMemory VectorStore adapter and index rebuild/update | Not found | Missing |
| FR-076-FR-089 | E-commerce service backend UI, ticket states, log page, auto reply, deterministic orchestrator | Epic 2 and 3 | Partial; story text still has older terms |
| FR-090-FR-096 | Template Output for general/after-sales/clarification/handoff and final validation | Epic 3.5, 7.3 | Partial; detailed validation criteria missing |

### Missing Requirements

#### Critical Missing FRs

- FR-070-FR-075: Vector index and vector database planning are not represented in epics/stories.
  - Impact: RAG implementation may choose ad hoc storage or skip LanceDB/InMemory adapter boundaries.
  - Recommendation: Add a dedicated story under Epic 5 or Epic 3 for `VectorStore adapter + LanceDB/InMemory mock`.

- FR-060-FR-069 RAG reranking block: BM25 + Embedding + business filtering + Cross-Encoder rerank + grounding confidence is not captured beyond basic rule retrieval.
  - Impact: RAG quality and safety gates will be underdeveloped.
  - Recommendation: Add a dedicated RAG retrieval/rerank story covering both general_service and after_sales knowledge scopes.

- FR-037-FR-052 latest Agent mechanism: Epics partially mention Memory + Case Understanding + Rule Guardrail + Query Router, but no complete dedicated story sequence exists for Rule Guardrail, LLM Query Router, four branches, ordinary review loop, after-sales QA loop, and handoff cutoff.
  - Impact: Implementation could revert to older Smart Router / 5-Agent flow.
  - Recommendation: Rewrite Epic 3 stories around the final flow.

#### High Priority Missing / Weak Coverage

- FR-053-FR-059: Query Router route definitions and wrong_route badcase are only partially covered.
- FR-060-FR-064 ordinary customer service RAG: exists only as supplemental text, not as numbered epic/story.
- FR-090-FR-096 Template Output: only high-level story coverage; needs specific validation ACs.
- FR-015-FR-021 external memory lifecycle: covered at high level, but needs explicit testable story for 7-day compression and 30-day cleanup.
- FR-076-FR-089 UI/backoffice and deterministic orchestration: partially covered, but some story wording still uses older 5-Agent/log panel phrasing.

### Coverage Statistics

- Total PRD FR lines extracted: 97
- Explicit FRs covered in epics by numbered map: 0
- Semantic coverage: partial across most core areas
- Critical missing/weak requirement areas: 6
- Coverage percentage by explicit traceability: 0%
- Coverage percentage by semantic assessment: approximately 55-65%, but not reliable enough for implementation readiness

### Coverage Conclusion

Epics are not implementation-ready against the latest PRD. The epics document has been partially updated but still contains old model names, old 5-Agent framing, stale story concepts, and no explicit FR traceability map. Before development continues, epics/stories should be regenerated or heavily corrected around the final Agent mechanism.


## Step 4: UX Alignment Assessment

### UX Document Status

No dedicated UX document was found under planning artifacts.

### UX/UI Implied by Product Scope

UX is clearly required because the product is a Web e-commerce customer service backend with:

- Main customer service conversation window
- Ticket management
- Auto reply / handoff status
- Badcase marking
- Separate log / process observation page
- Requirement that main UI must not expose Agent/RAG/QA internals by default

### Alignment Issues

- PRD defines the current UI direction: main interface = customer conversation window + ticket management; logs/process trace in a separate page.
- Architecture mostly supports this through Chat UI, Ticket, and Trace concepts, but still contains some legacy wording such as generic Chat UI and older observability framing.
- Epics partially support UI through Epic 2, but still contain stale wording such as “对话 UI 与分析面板骨架” and Story 2.3 still describes “5 Agent blocks” rather than the latest StructuredCase / Guardrail / Query Router / review loop trace.
- No dedicated UX artifact defines layout, navigation, ticket queue behavior, empty/loading/error states, or responsive behavior.

### Warnings

- Missing UX document is a readiness warning because this is a user-facing Web app.
- PRD-contained UI requirements may be enough for an MVP, but story generation should include explicit UI acceptance criteria for:
  - conversation window
  - ticket queue/statuses
  - auto reply vs handoff display
  - hidden-by-default log/process trace page
  - badcase marking flow
  - mobile/responsive minimum behavior

### UX Alignment Conclusion

UX is implied and partially specified in PRD, but not fully documented as a separate UX artifact. Implementation can proceed only if stories explicitly carry the UI requirements from PRD; otherwise the UI may drift back into an Agent debug panel instead of an e-commerce customer service backend.


## Step 5: Epic Quality Review

### Epic Structure Validation

| Epic | User Value Focus | Independence | Quality Finding |
| --- | --- | --- | --- |
| Epic 1: 项目初始化与基础演示框架 | Low user value; mostly technical setup | Foundational, acceptable for greenfield | Acceptable as setup epic, but should be framed as enabling runnable demo |
| Epic 2: 客服对话窗口、工单管理与日志观测页 | Strong user value | Depends on Epic 1 only | Good direction, but Story 2.3 still references old 5-Agent blocks |
| Epic 3: 确定性 Agent Orchestrator 与运行状态管理 | Mixed; mostly technical, but necessary product behavior | Depends on Epic 1/2 | Needs stronger user-facing acceptance outcomes and final flow cleanup |
| Epic 4: Case Understanding Agent | Technical component epic | Depends on Epic 3 | Should be folded into final Agent flow stories or rewritten with user-visible value |
| Epic 5: Policy & Evidence Agent | Technical component epic | Depends on Epic 3/4 | Acceptable as internal capability, but missing latest RAG rerank and VectorStore scope |
| Epic 6: Risk & Strategy Agent | Technical component epic | Depends on Epic 3/4/5 | Mostly internal; should be linked to customer-visible safe handling/handoff |
| Epic 7: Reply Agent 与 QA Agent | Internal but tied to customer reply safety | Depends on Epic 3/5/6 | Useful but old after-sales-only framing; missing General Review Agent and Template Output details |
| Epic 8: badcase 记录与演示验收 | User/ops value | Depends on prior implementation | Good closure epic, but references old 5-Agent wording |

### Critical Violations

1. **Epics are partially stale against the latest PRD.**
   - Examples: Story 2.3 says “5 Agent blocks”; AC-012 in PRD says log page should show latest structured flow, but epics still use old CaseModel/5-Agent language in multiple places.
   - Impact: Developers may implement outdated Smart Router / 5-Agent architecture instead of Memory → Case Understanding → Rule Guardrail → LLM Query Router → four-branch Agent flow.
   - Remediation: Regenerate or rewrite epics/stories from the latest PRD and architecture.

2. **No explicit FR traceability.**
   - Epics do not map stories to FR IDs.
   - Impact: Requirement coverage cannot be proven, and missing VectorStore/RAG rerank/Template Output details are easy to miss.
   - Remediation: Add FR coverage references to each story.

3. **Several epics are technical component buckets rather than user-value increments.**
   - Examples: Epic 4, 5, 6 are named by internal Agent components.
   - Impact: Stories may become implementation tasks rather than independently valuable slices.
   - Remediation: Reframe around user-observable capabilities, such as “客户问题被可靠结构化并正确分流”, “售后回复在规则与风险约束下安全输出”.

### Major Issues

1. **Story 3.2 still omits full latest routing sequence.**
   - It mentions Memory, Case Understanding, Rule Guardrail and Query Router, but acceptance criteria do not fully cover `needs_clarification`, `handoff_required`, General Review Agent max loop, Template Output final validation, and customer re-entry after information补充.

2. **General Service branch is under-modeled.**
   - General Service Agent, ordinary customer service RAG, and General Review Agent are not first-class stories.
   - The supplemental section exists but is not enough for implementation planning.

3. **RAG reranking and vector indexing are missing as stories.**
   - PRD specifies BM25 + Embedding + business filtering + Cross-Encoder rerank + LanceDB/InMemory adapter.
   - Epics only mention simple rule retrieval.

4. **UX acceptance criteria are not fully specific.**
   - Main UI vs log/process page separation is stated but not fully broken down into testable states: empty, loading, auto replied, needs info, handoff, badcase marked.

5. **Acceptance criteria are mostly bullet lists, not Given/When/Then.**
   - This is workable for MVP but below BMAD best practice.

### Minor Concerns

- `story-index.md` is stale and conflicts with the updated epics file.
- Some text still says “5-Agent 架构说明” or “售后 5-Agent” even though final mechanism has more components and four branches.
- Epic 8 says “8 scenarios” but current demo scenarios include 9 cases.

### Best Practices Compliance Checklist

| Check | Result |
| --- | --- |
| Epics deliver user value | Partial |
| Epics can function independently | Partial |
| Stories appropriately sized | Partial |
| No forward dependencies | Mostly OK, but internal component epics create sequencing rigidity |
| Database/entity creation when needed | Not applicable / local JSON only |
| Clear acceptance criteria | Partial |
| Traceability to FRs maintained | No |

### Recommendations

1. Run a corrective epic/story rewrite before further development.
2. Regenerate `story-index.md` from the corrected epics.
3. Add dedicated stories for:
   - StructuredCase + Rule Guardrail + LLM Query Router
   - General Service Agent + General Review Agent
   - RAG hybrid retrieval/rerank + grounding confidence
   - VectorStore adapter: LanceDB + InMemory
   - Template Output validation
   - External memory lifecycle: prompt injection, 7-day compression, 30-day cleanup
   - Main service console vs log/process observation page
4. Update every story with FR references and testable acceptance criteria.


## Summary and Recommendations

### Overall Readiness Status

**NOT READY for story-based implementation.**

The PRD has evolved to the latest Agent mechanism, but Architecture and Epics/Stories are only partially synchronized. The implementation artifacts do not yet provide a reliable story-by-story execution path.

### Critical Issues Requiring Immediate Action

1. **Epics/stories are stale against the latest PRD.**
   - Latest PRD requires: Memory → Case Understanding → Rule Guardrail → LLM Query Router → four branches → review loops → Template Output.
   - Epics still contain old 5-Agent wording, old Smart Router references, and old story-index entries.

2. **No explicit FR traceability map exists.**
   - The epics do not map stories to PRD FR IDs.
   - Explicit traceability coverage is effectively 0%.

3. **Key PRD capabilities are missing or weak in stories.**
   - RAG hybrid retrieval and reranking
   - LanceDB/InMemory VectorStore adapter
   - General Service Agent + General Review Agent
   - Rule Guardrail and LLM Query Router as first-class implementation stories
   - Template Output validation details
   - Memory lifecycle: 7-day compression, 30-day cleanup

4. **UX is implied but no separate UX document exists.**
   - This can be acceptable for MVP only if epics/stories carry strong UI acceptance criteria.
   - Current stories are not precise enough for main console vs log/process page separation.

5. **PRD itself has numbering and legacy wording issues.**
   - FR numbers are duplicated in multiple places.
   - Some data model and AC text still references older Smart Router / 5-Agent terminology.

### Recommended Next Steps

1. Run a corrective course update on planning artifacts.
   - Fix PRD FR numbering.
   - Remove remaining Smart Router / 5-Agent legacy wording where it conflicts with Query Router and four-branch flow.

2. Regenerate or rewrite `epics-and-stories.md` from the latest PRD.
   - Add explicit FR references to each story.
   - Replace stale story-index after the rewrite.

3. Create implementation-ready stories for the first development slice.
   - Suggested first slice: foundational types + Orchestrator mock for Memory, StructuredCase, Rule Guardrail, Query Router, four branches, Template Output.

4. Only after the corrected stories exist, enter `bmad-dev-story`.
   - Do not continue ad hoc coding against stale stories.

5. Optional but recommended: create a lightweight UX spec.
   - Cover main service console, ticket management, auto-reply states, handoff states, badcase marking, and log/process observation page.

### Final Note

This assessment identified issues across 5 categories: requirements traceability, epic/story staleness, missing implementation coverage, UX documentation gaps, and PRD numbering/legacy wording. Address the critical issues before proceeding to BMAD story-based implementation.

**Assessor:** Codex / BMAD readiness workflow
**Completed:** 2026-06-13

