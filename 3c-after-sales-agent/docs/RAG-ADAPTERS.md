# RAG Adapter Configuration

The runtime now has replaceable adapters for vector search and reranking.

## Vector Store

Default:

```env
RAG_VECTOR_STORE=memory
```

LanceDB:

```env
RAG_VECTOR_STORE=lancedb
LANCEDB_PATH=./data/lancedb
LANCEDB_TABLE=knowledge_chunks
```

When LanceDB is enabled, the runtime rebuilds the local LanceDB table from `data/knowledge-index.json` before retrieval. If LanceDB cannot initialize, retrieval falls back to `InMemoryVectorStore`.

`RetrievalResult.vectorStoreSource` shows the active source: `memory`, `lancedb`, or `fallback`.

## Reranker

Default:

```env
RAG_RERANKER=local
```

Optional BAAI Cross-Encoder HTTP adapter:

```env
RAG_RERANKER=cross_encoder
CROSS_ENCODER_API_URL=http://127.0.0.1:8010/rerank
CROSS_ENCODER_MODEL=BAAI/bge-reranker-base
CROSS_ENCODER_TIMEOUT_MS=10000
CROSS_ENCODER_DISABLED=0
BAAI_RERANKER_MODEL=BAAI/bge-reranker-base
BAAI_RERANKER_HOST=127.0.0.1
BAAI_RERANKER_PORT=8010
BAAI_RERANKER_DEVICE=cpu
```

Install and start the local BAAI service:

```bash
npm run reranker:install
npm run reranker:start
```

The service is implemented in `scripts/baai-reranker-server.py` with FastAPI, PyTorch, and Transformers. It loads `BAAI/bge-reranker-base` by default, accepts the same `/rerank` JSON shape used by the app, and returns normalized scores in `[0, 1]`.

Expected request:

```json
{
  "model": "BAAI/bge-reranker-base",
  "query": "user query",
  "candidates": [
    { "id": "rule-id", "title": "title", "content": "text", "category": "category" }
  ]
}
```

Expected response can be either:

```json
{ "scores": [0.91, 0.72] }
```

or:

```json
{
  "results": [
    { "id": "rule-id", "score": 0.91, "reason": "semantic match" }
  ]
}
```

If the Cross-Encoder endpoint fails, the runtime uses the local heuristic reranker and records `RetrievalResult.rerankerSource=fallback` plus `rerankerError`.
