# 3C After-Sales Agent

3C 售后智能客服 Agent MVP。项目基于 Next.js，采用确定性 Agent Graph 编排、route-scoped RAG Service、本地 knowledge-index、Review/QA 安全闸门和本地 demo store。

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

```powershell
npm run smoke:index
```

如需跑端到端 smoke：

```powershell
npm run start -- --port 3001
$env:SMOKE_BASE_URL="http://127.0.0.1:3001"
npm run smoke
```

## 主要目录

- `app/`：Next.js 页面和 API routes。
- `lib/agent/`：Agent graph 编排与节点逻辑。
- `lib/rag/`：RAG Service、检索、向量索引、规则读取。
- `knowledge/`：普通客服知识与售后规则源。
- `data/knowledge-index.json`：本地构建的知识索引。
- `scripts/`：索引构建与 smoke test。
- `docs/`：架构、RAG adapter、DeepSeek API 接入说明。

## 运行约束

- MVP 不接真实订单、物流、退款、支付、仓储或客服系统。
- 客户可见回复不得承诺退款、赔付、补发、审核通过或最终责任判定。
- 普通客服检索仅使用 `knowledgeBase=general`；售后检索仅使用 `knowledgeBase=after_sales`。
