import math
import os
from typing import List, Optional

import torch
from fastapi import FastAPI
from pydantic import BaseModel
from transformers import AutoModelForSequenceClassification, AutoTokenizer


MODEL_NAME = os.getenv("BAAI_RERANKER_MODEL", "BAAI/bge-reranker-base")
DEVICE = os.getenv("BAAI_RERANKER_DEVICE", "cuda" if torch.cuda.is_available() else "cpu")
BATCH_SIZE = int(os.getenv("BAAI_RERANKER_BATCH_SIZE", "8"))
MAX_LENGTH = int(os.getenv("BAAI_RERANKER_MAX_LENGTH", "512"))


class Candidate(BaseModel):
  id: str
  title: str = ""
  content: str
  category: str = ""


class RerankRequest(BaseModel):
  model: Optional[str] = None
  query: str
  candidates: List[Candidate]


class RerankResult(BaseModel):
  id: str
  score: float
  reason: str


class RerankResponse(BaseModel):
  model: str
  device: str
  results: List[RerankResult]


app = FastAPI(title="BAAI BGE Reranker", version="0.1.0")
tokenizer = None
model = None


def sigmoid(value: float) -> float:
  return 1 / (1 + math.exp(-value))


def load_model():
  global tokenizer, model
  if tokenizer is None or model is None:
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME)
    model.to(DEVICE)
    model.eval()
  return tokenizer, model


@app.get("/health")
def health():
  return {"ok": True, "model": MODEL_NAME, "device": DEVICE}


@app.post("/rerank", response_model=RerankResponse)
def rerank(request: RerankRequest):
  local_tokenizer, local_model = load_model()
  pairs = [
    (request.query, f"{candidate.title}\n{candidate.content}".strip())
    for candidate in request.candidates
  ]
  scores: List[float] = []

  with torch.no_grad():
    for start in range(0, len(pairs), BATCH_SIZE):
      batch = pairs[start:start + BATCH_SIZE]
      encoded = local_tokenizer(
        batch,
        padding=True,
        truncation=True,
        max_length=MAX_LENGTH,
        return_tensors="pt",
      ).to(DEVICE)
      logits = local_model(**encoded).logits.view(-1).detach().cpu().tolist()
      scores.extend(sigmoid(float(score)) for score in logits)

  results = [
    RerankResult(
      id=candidate.id,
      score=max(0.0, min(1.0, score)),
      reason=f"BAAI bge-reranker score via {MODEL_NAME}",
    )
    for candidate, score in zip(request.candidates, scores)
  ]
  results.sort(key=lambda item: item.score, reverse=True)
  return RerankResponse(model=MODEL_NAME, device=DEVICE, results=results)


if __name__ == "__main__":
  import uvicorn

  host = os.getenv("BAAI_RERANKER_HOST", "127.0.0.1")
  port = int(os.getenv("BAAI_RERANKER_PORT", "8010"))
  uvicorn.run(app, host=host, port=port)

