# AIRAGproject

AIRAGproject 是一个面向智能客服与 RAG 应用的本地演示仓库。当前主项目是 [`AI-Powered Customer Service`](./AI-Powered%20Customer%20Service)，它围绕 AirBuds Pro X 3C 售后场景构建了一个可运行的智能客服 Agent。

项目重点是把客服对话、意图分流、知识检索、售后规则、风险边界和人工转接组织成一个完整应用。用户在前端输入问题后，后台会按 LangGraph 风格的流程处理，并输出克制、可追踪的客服回复。

## 项目组成

| 目录 | 说明 |
| --- | --- |
| [`AI-Powered Customer Service`](./AI-Powered%20Customer%20Service) | 主项目。基于 Next.js 的 3C 智能客服 Agent，包含客服界面、LangGraph 风格编排、RAG 检索、售后策略和人工转接链路。 |
| [`rag-simple`](./rag-simple) | 早期 RAG 客服演示项目，用于展示基础知识库问答流程。 |

## 主项目能力

- 客服分流：识别普通咨询、质量问题、配件缺失、物流破损、仅退款诉求、直播承诺争议、投诉升级和模糊问题。
- LangGraph 风格编排：按上下文理解、规则约束、路由决策、分支处理和最终输出组织 Agent 链路。
- 路由级 RAG：普通客服只使用通用知识库，售后场景只使用售后规则库。
- 售后策略：针对质量、物流、配件、激活/拆封、直播权益等场景生成保守处理路径。
- 人工转接：直播承诺、投诉升级等高风险争议优先转人工继续核实。
- 运行追踪：保留路由、检索、节点摘要和最终状态，方便查看 Agent 执行过程。

## AI-Powered Customer Service 快速开始

```powershell
cd "AI-Powered Customer Service"
npm install
Copy-Item .env.example .env.local
npm run build:index
npm run dev
```

打开本地客服界面：

```text
http://127.0.0.1:3000
```

如需调用 DeepSeek，请在 `.env.local` 中配置：

```text
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_API_BASE_URL=https://api.deepseek.com
```

如需使用本地确定性演示模式，可设置：

```text
DEEPSEEK_DISABLED=1
```

更多主项目说明见 [`AI-Powered Customer Service/README.md`](./AI-Powered%20Customer%20Service/README.md)。

## 目录结构

```text
AI-Powered Customer Service/   3C 智能客服 Agent 主项目
rag-simple/                    早期 RAG 客服演示项目
docs/                          仓库级说明文档
PROJECT-STATUS.md              项目状态记录
DECISION-LOG.md                关键决策记录
tasks/                         任务拆分与开发记录
```

## 当前边界

- 当前项目是本地演示应用，不是完整生产客服平台。
- 不连接真实订单、支付、退款、仓储、物流或 CRM 系统。
- 客户可见回复不得承诺退款、赔付、补发、审核通过或最终责任结论。
- 图片证据链分析当前暂停，系统优先基于文字描述、订单信息、平台记录和人工转接处理。
- 高风险或争议场景应使用保守话术，并转人工继续核实。

## rag-simple 快速开始

```powershell
cd rag-simple
python -m rag_simple.web_server
```

打开：

```text
http://127.0.0.1:8000/
```
