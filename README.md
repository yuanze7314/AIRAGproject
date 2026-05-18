# 智能客服回答：RAG 智能客服项目

项目主体位于 [`rag-simple`](./rag-simple)。当前版本已包装为一个可本地演示的 RAG 智能客服项目，包含前端页面、mock 问答接口和可接入真实 RAG 的后端入口。

快速启动：

```powershell
cd E:\codex\AIRAGproject\rag-simple
$env:PYTHONPATH="E:\codex\AIRAGproject\rag-simple\src"
python -m rag_simple.web_server
```

打开 `http://127.0.0.1:8000/` 查看页面。
