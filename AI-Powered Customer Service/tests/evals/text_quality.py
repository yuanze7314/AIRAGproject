from __future__ import annotations

import re
from typing import Iterable


SUSPICIOUS_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("replacement-question-run", re.compile(r"\?{4,}")),
    ("replacement-character", re.compile("\ufffd")),
    (
        "common-chinese-mojibake",
        re.compile(r"鍟|鍖|呰|娓|涓|鐢|绾|瑙|勬|浣犱滑|闂|锛|銆"),
    ),
    ("private-use-mojibake", re.compile(r"[\ue000-\uf8ff]")),
)


def _quality_findings(text: str) -> Iterable[str]:
    for name, pattern in SUSPICIOUS_PATTERNS:
        match = pattern.search(text)
        if match:
            sample = match.group(0)
            yield f"{name}: {sample!r}"


def assert_text_quality(label: str, text: str) -> None:
    findings = list(_quality_findings(text or ""))
    assert findings == [], f"{label} contains suspicious text quality markers: {', '.join(findings)}"
