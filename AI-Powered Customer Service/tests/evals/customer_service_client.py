from __future__ import annotations

import os
import time
from typing import Any, Dict, List

import requests


BASE_URL = os.getenv("CUSTOMER_SERVICE_BASE_URL", "http://127.0.0.1:3000").rstrip("/")
REQUEST_TIMEOUT_SECONDS = float(os.getenv("CUSTOMER_SERVICE_EVAL_TIMEOUT_SECONDS", "45"))


def _history_from_turns(turns: List[Dict[str, str]]) -> List[Dict[str, str]]:
    history = []
    for index, turn in enumerate(turns):
        history.append(
            {
                "id": f"eval-history-{index}",
                "role": "agent" if turn["role"] == "assistant" else "user",
                "content": turn["content"],
                "createdAt": "2026-06-15T00:00:00.000Z",
            }
        )
    return history


def post_chat(content: str, conversation_id: str, prior_turns: List[Dict[str, str]]) -> Dict[str, Any]:
    started_at = time.perf_counter()
    response = requests.post(
        f"{BASE_URL}/api/chat",
        json={
            "conversationId": conversation_id,
            "content": content,
            "images": [],
            "history": _history_from_turns(prior_turns),
        },
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    elapsed_ms = round((time.perf_counter() - started_at) * 1000, 2)
    response.raise_for_status()
    payload = response.json()
    payload["_eval_elapsed_ms"] = elapsed_ms
    return payload


def assistant_metadata(payload: Dict[str, Any]) -> Dict[str, Any]:
    retrieval = payload.get("retrievalResult") or {}
    route = payload.get("routeDecision") or {}
    structured = payload.get("structuredCase") or {}
    qa = payload.get("qaResult") or {}
    return {
        "trace_id": payload.get("traceId"),
        "route": route.get("routeType"),
        "status": payload.get("visibleStatus"),
        "final_action": payload.get("finalAction"),
        "intent": structured.get("customerIntent"),
        "risk_signals": route.get("riskSignals") or structured.get("riskSignals") or [],
        "knowledge_base": retrieval.get("knowledgeBase"),
        "grounding_confidence": retrieval.get("groundingConfidence"),
        "qa_passed": qa.get("passed"),
        "failed_node": payload.get("failedNode"),
        "fallback_action": (payload.get("failurePolicy") or {}).get("fallbackAction"),
        "elapsed_ms": payload.get("_eval_elapsed_ms"),
        "trace_event_count": len(payload.get("traceEvents") or []),
        "agent_count": len(payload.get("agents") or []),
    }


def retrieval_context_from_payload(payload: Dict[str, Any]) -> List[str]:
    retrieval = payload.get("retrievalResult") or {}
    contexts = []
    for candidate in retrieval.get("rerankedTopK") or []:
        title = candidate.get("title") or candidate.get("id") or "retrieved context"
        content = candidate.get("content") or candidate.get("summary") or ""
        if content:
            contexts.append(f"{title}: {content}")
    return contexts
