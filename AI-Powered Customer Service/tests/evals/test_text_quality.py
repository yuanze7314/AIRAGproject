from __future__ import annotations

import pytest

from text_quality import assert_text_quality


def test_text_quality_rejects_question_mark_replacement_runs():
    with pytest.raises(AssertionError, match="replacement-question-run"):
        assert_text_quality("assistant", "AirBuds Pro X ?????????USB-C ??????")


def test_text_quality_rejects_common_chinese_mojibake():
    with pytest.raises(AssertionError, match="common-chinese-mojibake"):
        assert_text_quality("retrieval", "AirBuds Pro X 鍖呰娓呭崟")


def test_text_quality_accepts_clean_customer_service_text():
    assert_text_quality(
        "assistant",
        "AirBuds Pro X 标准包装清单包含耳机本体、充电盒、USB-C 充电线、三组耳塞、快速指南和保修说明。",
    )
