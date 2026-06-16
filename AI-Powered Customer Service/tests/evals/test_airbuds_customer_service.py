from __future__ import annotations

from uuid import uuid4
from pathlib import Path
from typing import Any, Dict, List

import pytest

from deepeval import assert_test
from deepeval.dataset import EvaluationDataset
from deepeval.test_case import ConversationalTestCase, Turn

from customer_service_client import assistant_metadata, post_chat, retrieval_context_from_payload
from metrics import MULTI_TURN_METRICS
from text_quality import assert_text_quality


DATASET_PATH = Path("tests/evals/.dataset.json")
NEGATED_COMMITMENT_MARKERS = (
    "不",
    "未",
    "无法",
    "不能",
    "不得",
    "不可",
    "避免",
    "暂不",
    "暂不能",
    "不会",
    "不应",
)

INTENT_ALIASES = {
    "普通咨询": "general_question",
    "通用咨询": "general_question",
    "商品咨询": "general_question",
    "咨询产品性能": "general_question",
    "查询配送时间": "general_question",
    "查询产品规格": "general_question",
    "查询物流信息": "general_question",
    "质量问题": "quality_issue",
    "质量售后": "quality_issue",
    "质量故障": "quality_issue",
    "配件缺失": "accessory_missing",
    "缺配件": "accessory_missing",
    "物流破损": "logistics_damage",
    "物流损坏": "logistics_damage",
    "索赔": "logistics_damage",
    "仅退款": "refund_only_request",
    "仅退款诉求": "refund_only_request",
    "要求仅退款": "refund_only_request",
    "退货咨询": "rule_consultation",
    "规则咨询": "rule_consultation",
    "直播承诺争议": "livestream_promise_dispute",
    "直播赠品争议": "livestream_promise_dispute",
    "投诉升级": "complaint_escalation",
    "投诉": "complaint_escalation",
    "不明确": "unclear",
    "信息不足": "unclear",
}

dataset = EvaluationDataset()
dataset.add_goldens_from_json_file(file_path=str(DATASET_PATH))


def _user_turns(golden) -> List[str]:
    return [turn.content for turn in golden.turns if turn.role == "user"]


def _is_negated_commitment(text: str, index: int) -> bool:
    prefix = text[max(0, index - 12):index]
    return any(marker in prefix for marker in NEGATED_COMMITMENT_MARKERS)


def _forbidden_hits(text: str, phrases: List[str]) -> List[str]:
    hits: List[str] = []
    for phrase in phrases:
        if not phrase:
            continue
        start = text.find(phrase)
        while start != -1:
            if not _is_negated_commitment(text, start):
                hits.append(phrase)
                break
            start = text.find(phrase, start + len(phrase))
    return hits


def _assert_contract(payload: Dict[str, Any], expected: Dict[str, Any], assistant_text: str) -> None:
    route = (payload.get("routeDecision") or {}).get("routeType")
    status = payload.get("visibleStatus")
    intent = (payload.get("structuredCase") or {}).get("customerIntent")
    normalized_intent = INTENT_ALIASES.get(intent, intent)
    retrieval = payload.get("retrievalResult") or {}

    assert route == expected["expected_route"]
    assert status == expected["expected_status"]
    if expected.get("expected_intent"):
        assert normalized_intent == expected["expected_intent"]

    forbidden_hits = _forbidden_hits(assistant_text, expected.get("forbidden_phrases", []))
    assert forbidden_hits == []

    assert payload.get("finalMessage")
    assert payload.get("traceEvents"), "traceEvents should be present for observability"
    assert payload.get("agents"), "agent node summaries should be present for observability"

    if expected["expected_route"] == "general_service":
        assert retrieval.get("knowledgeBase") in (None, "general")
    if expected["expected_route"] == "after_sales":
        assert retrieval.get("knowledgeBase") in (None, "after_sales")


def _run_conversation(golden) -> ConversationalTestCase:
    metadata = golden.additional_metadata or {}
    conversation_id = f"deepeval-{golden.name}-{uuid4()}"
    prior_turns: List[Dict[str, str]] = []
    deepeval_turns: List[Turn] = []
    last_payload: Dict[str, Any] | None = None

    for user_message in _user_turns(golden):
        deepeval_turns.append(Turn(role="user", content=user_message))
        payload = post_chat(user_message, conversation_id, prior_turns)
        assistant_text = payload.get("finalMessage") or ""
        retrieval_context = retrieval_context_from_payload(payload)
        assert_text_quality(f"{golden.name} assistant", assistant_text)
        for index, context in enumerate(retrieval_context):
            assert_text_quality(f"{golden.name} retrieval_context[{index}]", context)
        prior_turns.extend(
            [
                {"role": "user", "content": user_message},
                {"role": "assistant", "content": assistant_text},
            ]
        )
        deepeval_turns.append(
            Turn(
                role="assistant",
                content=assistant_text,
                retrieval_context=retrieval_context,
                metadata=assistant_metadata(payload),
            )
        )
        last_payload = payload

    assert last_payload is not None
    _assert_contract(last_payload, metadata, "\n".join(turn.content for turn in deepeval_turns if turn.role == "assistant"))

    return ConversationalTestCase(
        name=golden.name,
        scenario=golden.scenario,
        expected_outcome=golden.expected_outcome,
        user_description=golden.user_description,
        turns=deepeval_turns,
        chatbot_role=(
            "AirBuds Pro X customer service agent that answers product questions, handles after-sales safely, "
            "asks for clarification when needed, and hands off high-risk disputes."
        ),
        metadata=metadata,
    )


@pytest.mark.parametrize("golden", dataset.goldens, ids=lambda golden: golden.name)
def test_airbuds_customer_service_conversation(golden):
    test_case = _run_conversation(golden)
    assert_test(test_case=test_case, metrics=MULTI_TURN_METRICS)
