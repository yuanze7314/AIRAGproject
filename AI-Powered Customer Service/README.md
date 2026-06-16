# AI-Powered Customer Service

AI-Powered Customer Service 是一个面向 AirBuds Pro X 3C 售后场景的智能客服 Agent MVP。项目基于 Next.js，采用确定性 Agent Graph 编排、route-scoped RAG Service、本地 knowledge-index、Review/QA 安全闸门和本地 demo store。

它的目标是展示一个可运行、可观测、可评测的智能客服系统：普通咨询直接回答，售后问题进入规则约束流程，模糊问题先澄清，高风险争议转人工。

## 核心能力

- 普通客服：回答包装清单、续航、降噪、发货、物流查询等基础问题。
- 售后处理：识别质量问题、配件缺失、物流破损、仅退款、拆封退货和规则咨询等场景。
- 高风险转人工：直播承诺、投诉升级、强压退款等场景优先转人工。
- RAG 检索：按路由隔离通用知识库与售后规则库，避免普通咨询和售后规则相互污染。
- 安全模板：转人工或兜底时输出保守话术，避免越权承诺。
- 运行追踪：API 返回 trace events、agent summaries、route/status/intent、检索结果和 QA 结果。
- 本地评测：内置 DeepEval 会话测试、知识库质量测试、接口 smoke 和性能统计脚本。

## 快速开始

```powershell
npm install
npm run build:index
npm run build
npm run dev
```

默认开发地址：

```text
http://127.0.0.1:3000
```

## 验证

基础检查：

```powershell
npm run smoke:index
npm run test:graph
npm run test:knowledge
```

如需跑端到端 smoke：

```powershell
npm run start -- --port 3001
$env:SMOKE_BASE_URL="http://127.0.0.1:3001"
npm run smoke
```

如需生成评测数据集与性能统计：

```powershell
npm run eval:dataset
$env:CUSTOMER_SERVICE_BASE_URL="http://127.0.0.1:3001"
npm run eval:performance
```

如需运行 DeepEval 端到端语义评测，请先安装评测依赖并配置 DeepSeek API Key：

```powershell
python -m pip install -r requirements-evals.txt
$env:CUSTOMER_SERVICE_BASE_URL="http://127.0.0.1:3001"
$env:DEEPEVAL_DEEPSEEK_MODEL="deepseek-chat"
deepeval test run tests/evals/test_airbuds_customer_service.py --identifier "airbuds-local"
```

## 评测说明

当前版本包含三层评测：

| 层级 | 内容 |
| --- | --- |
| 工程链路 | 语法检查、知识库索引、图状态测试、知识库质量测试、接口 smoke |
| 内容质量 | DeepEval 多轮会话指标，检查角色一致性、轮次相关性、客服安全与处理完整度 |
| 智能体性能 | 50 条用例端到端请求，统计路由、状态、意图、禁用承诺、耗时和错误率 |

最新本地报告显示：测试集 50 条，接口 smoke 12/12 通过，契约通过率 96.00%，路由准确率 98.00%，状态准确率 98.00%，意图准确率 100.00%，禁用承诺通过率 100.00%，错误率 0.00%。DeepEval 本地运行结果为 39 通过 / 11 未通过，未通过项主要用于定位个别话术完整度、轮次相关性和测试契约对齐问题。

详细材料：

- [`docs/customer-service-agent-evaluation-report.md`](./docs/customer-service-agent-evaluation-report.md)
- [`docs/customer-service-agent-evaluation-rules-explanation.md`](./docs/customer-service-agent-evaluation-rules-explanation.md)
- [`docs/DEEPEVAL-EVALUATION.md`](./docs/DEEPEVAL-EVALUATION.md)

## 主要目录

- `app/`：Next.js 页面和 API routes。
- `lib/agent/`：Agent graph 编排与节点逻辑。
- `lib/rag/`：RAG Service、检索、向量索引、规则读取。
- `knowledge/`：普通客服知识与售后规则源。
- `data/knowledge-index.json`：本地构建的知识索引。
- `scripts/`：索引构建、smoke test、知识库质量测试、DeepEval 数据集生成、性能统计和报告生成。
- `tests/evals/`：DeepEval 多轮客服会话测试集和指标代码。
- `docs/`：架构、RAG adapter、DeepSeek API 接入说明和评测报告。

## 运行约束

- MVP 不接真实订单、物流、退款、支付、仓储或客服系统。
- 客户可见回复不得承诺退款、赔付、补发、审核通过或最终责任判定。
- 普通客服检索仅使用 `knowledgeBase=general`；售后检索仅使用 `knowledgeBase=after_sales`。
- 当前评测用于阶段性质量背书，不代表第三方认证或生产 SLA。
