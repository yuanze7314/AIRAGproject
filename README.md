# AIRAGproject

本仓库包含两个智能客服 / RAG 相关项目：

- [`rag-simple`](./rag-simple)：原有 RAG 智能客服演示项目。
- [`AI-Powered Customer Service`](./AI-Powered%20Customer%20Service)：AI-Powered Customer Service 项目，包含确定性 Agent Graph 编排、route-scoped RAG Service、本地 knowledge-index、Review/QA 安全闸门和本地 demo store。

## AI-Powered Customer Service 快速开始

```powershell
cd "AI-Powered Customer Service"
npm install
npm run build:index
npm run build
npm run dev
```

打开：

```text
http://127.0.0.1:3000
```

## AI-Powered Customer Service 验证

```powershell
npm run smoke:index
```

端到端 smoke：

```powershell
npm run start -- --port 3001
$env:SMOKE_BASE_URL="http://127.0.0.1:3001"
npm run smoke
```

更多说明见 [`AI-Powered Customer Service/README.md`](./AI-Powered%20Customer%20Service/README.md)。

## rag-simple 快速开始

```powershell
cd rag-simple
python -m rag_simple.web_server
```

打开：

```text
http://127.0.0.1:8000/
```
