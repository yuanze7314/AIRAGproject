# AIRAGproject

AIRAGproject 是一个面向智能客服与 RAG 应用的本地演示仓库。当前主项目是 [`AI-Powered Customer Service`](./AI-Powered%20Customer%20Service)：一个围绕 AirBuds Pro X 3C 售后场景构建的智能客服 Agent MVP。

项目重点不是只做一段聊天回复，而是把客服场景需要的意图识别、规则检索、售后安全边界、人工转接、运行追踪和质量评测放进同一个可运行应用里。

## 项目组成

| 目录 | 说明 |
| --- | --- |
| [`AI-Powered Customer Service`](./AI-Powered%20Customer%20Service) | 主项目。Next.js 客服工作台，后端使用确定性 Agent Graph 编排、route-scoped RAG Service、本地知识索引、Review/QA 安全闸门和 DeepEval 评测链路。 |
| [`rag-simple`](./rag-simple) | 早期 RAG 智能客服演示项目，用于展示基础知识库问答流程。 |

## 当前主项目能力

- 客服分流：识别普通咨询、质量问题、配件缺失、物流破损、仅退款诉求、直播承诺争议、投诉升级和模糊问题。
- LangGraph 编排：通过 `memoryRead -> caseUnderstanding -> ruleGuardrail -> queryRouter -> flow -> finalize` 的显式工作流执行。
- 路由级 RAG：普通客服只检索 `general` 知识库，售后场景只检索 `after_sales` 规则库。
- 安全边界：客户可见回复避免直接承诺退款、赔付、补发、换新、审核通过、责任归属或主播承诺成立。
- 人工转接：直播承诺、投诉升级等高风险争议优先转人工，并输出保守说明。
- 可观测性：返回 trace events、agent node summaries、route/status/intent、检索上下文和 QA 结果。
- 评测闭环：包含工程链路测试、知识库质量测试、接口 smoke、50 条 DeepEval 会话数据集、端到端性能统计和评测报告。

## 当前版本评测摘要

本轮版本已形成三层评测材料：工程链路、内容质量、智能体性能。详细报告见：

- [`customer-service-agent-evaluation-report.md`](./AI-Powered%20Customer%20Service/docs/customer-service-agent-evaluation-report.md)
- [`customer-service-agent-evaluation-rules-explanation.md`](./AI-Powered%20Customer%20Service/docs/customer-service-agent-evaluation-rules-explanation.md)
- [`DEEPEVAL-EVALUATION.md`](./AI-Powered%20Customer%20Service/docs/DEEPEVAL-EVALUATION.md)

关键结果：

| 指标 | 结果 |
| --- | --- |
| 测试集规模 | 50 条客服会话用例 |
| 单轮 / 双轮 | 40 / 10 |
| 接口 smoke | 12/12 通过 |
| 契约通过率 | 96.00% |
| 路由准确率 | 98.00% |
| 状态准确率 | 98.00% |
| 意图准确率 | 100.00% |
| 禁用承诺通过率 | 100.00% |
| 错误率 | 0.00% |
| DeepEval 本地运行 | 39 通过 / 11 未通过，未通过项主要集中在个别话术完整度、轮次相关性和测试契约对齐 |

这些结果适合作为阶段性质量背书，不应表述为第三方认证、生产 SLA 或完全无缺陷证明。

## AI-Powered Customer Service 快速开始

```powershell
cd "AI-Powered Customer Service"
npm install
npm run build:index
npm run build
npm run dev
```

打开本地工作台：

```text
http://127.0.0.1:3000
```

## AI-Powered Customer Service 验证

基础验证：

```powershell
npm run smoke:index
npm run test:graph
npm run test:knowledge
```

端到端接口 smoke：

```powershell
npm run start -- --port 3001
$env:SMOKE_BASE_URL="http://127.0.0.1:3001"
npm run smoke
```

评测数据集与性能统计：

```powershell
npm run eval:dataset
$env:CUSTOMER_SERVICE_BASE_URL="http://127.0.0.1:3001"
npm run eval:performance
```

DeepEval 本地评测需要先安装 `requirements-evals.txt` 并配置 DeepSeek API Key，详见 [`AI-Powered Customer Service/docs/DEEPEVAL-EVALUATION.md`](./AI-Powered%20Customer%20Service/docs/DEEPEVAL-EVALUATION.md)。

更多主项目说明见 [`AI-Powered Customer Service/README.md`](./AI-Powered%20Customer%20Service/README.md)。

## 安全与边界

- 当前项目是 MVP 演示，不接真实订单、物流、退款、支付、仓储或客服系统。
- 售后回复必须以核实、平台审核和人工处理为边界，不能直接给最终处理结果。
- DeepEval 当前使用 DeepSeek 作为本地裁判模型，评测结果用于项目阶段性说明，不代表多模型横向排名。
- `.deepeval` 缓存、运行日志、pid 文件和大体积 trace 记录属于本地产物，不纳入 GitHub 版本。

## rag-simple 快速开始

```powershell
cd rag-simple
python -m rag_simple.web_server
```

打开：

```text
http://127.0.0.1:8000/
```
