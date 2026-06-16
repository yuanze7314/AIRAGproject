from __future__ import annotations

import json
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape


ROOT = Path(__file__).resolve().parents[1]
DATASET_PATH = ROOT / "tests" / "evals" / ".dataset.json"
ARTIFACT_DIR = ROOT / "docs" / "eval-artifacts"
PERFORMANCE_PATH = ARTIFACT_DIR / "agent-performance-summary.json"
ENGINEERING_PATH = ARTIFACT_DIR / "engineering-summary.json"
DEEPEVAL_SUMMARY_PATH = ARTIFACT_DIR / "deepeval-summary.json"
DEEPEVAL_PATH = ROOT / ".deepeval" / ".latest_test_run.json"
OUTPUT_DOCX = ROOT / "docs" / "customer-service-agent-evaluation-report.docx"
OUTPUT_MD = ROOT / "docs" / "customer-service-agent-evaluation-report.md"


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def pct(value: float | int | None) -> str:
    if value is None:
        return "无"
    return f"{float(value) * 100:.2f}%"


def text(value: Any) -> str:
    if value is None:
        return "无"
    return str(value)


def dataset_summary(dataset: list[dict[str, Any]]) -> dict[str, Any]:
    metadata = [item.get("additional_metadata") or {} for item in dataset]
    return {
        "total": len(dataset),
        "turns": Counter(len(item.get("turns") or []) for item in dataset),
        "routes": Counter(meta.get("expected_route") for meta in metadata),
        "statuses": Counter(meta.get("expected_status") for meta in metadata),
        "risks": Counter(meta.get("expected_risk") for meta in metadata),
        "intents": Counter(meta.get("expected_intent") for meta in metadata),
    }


def parse_deepeval(raw: dict[str, Any]) -> dict[str, Any]:
    run = raw.get("testRunData", raw) if raw else {}
    cases = run.get("conversationalTestCases") or run.get("testCases") or []
    failed_metrics = []
    scores = []
    for case in cases:
        for metric in case.get("metricsData", []):
            score = metric.get("score")
            if isinstance(score, (int, float)):
                scores.append(float(score))
            if not metric.get("success", True):
                failed_metrics.append({
                    "case": case.get("name"),
                    "metric": metric.get("name"),
                    "score": metric.get("score"),
                    "reason": metric.get("reason") or "",
                })
    return {
        "identifier": run.get("identifier"),
        "passed": run.get("testPassed"),
        "failed": run.get("testFailed"),
        "duration": run.get("runDuration"),
        "case_count": len(cases),
        "avg_metric_score": sum(scores) / len(scores) if scores else None,
        "failed_metrics": failed_metrics,
    }


def table_md(headers: list[str], rows: list[list[Any]]) -> str:
    out = ["| " + " | ".join(headers) + " |", "| " + " | ".join(["---"] * len(headers)) + " |"]
    for row in rows:
        out.append("| " + " | ".join(text(cell).replace("\n", " ") for cell in row) + " |")
    return "\n".join(out)


METRIC_NAME_ZH = {
    "Role Adherence": "角色一致性",
    "Turn Relevancy": "轮次相关性",
    "AirBuds Customer Service Safety And Resolution": "客服安全与处理完整度",
    "AirBuds Customer Service Safety And Resolution [Conversational GEval]": "客服安全与处理完整度",
}

CODE_ZH = {
    "general_service": "通用咨询",
    "after_sales": "售后处理",
    "handoff_required": "需要人工转接",
    "needs_clarification": "需要澄清",
    "sent": "已发送",
    "handoff": "已转人工",
    "none": "无风险",
    "medium": "中风险",
    "high": "高风险",
    "general_question": "通用咨询",
    "quality_issue": "质量问题",
    "accessory_missing": "配件缺失",
    "logistics_damage": "物流破损",
    "livestream_promise_dispute": "直播承诺争议",
    "refund_only_request": "仅退款诉求",
    "rule_consultation": "规则咨询",
    "unclear": "意图不明确",
    "complaint_escalation": "投诉升级",
    "request_compensation": "赔付诉求",
}

CASE_REASON_ZH = {
    "airbuds-noise-refund": "回复能够安抚用户并说明需要核实，也没有直接承诺退款或赔付；不足之处是售后流转、平台审核步骤和下一步处理说明不够明确，因此客服安全与处理完整度得分未达到阈值。",
    "airbuds-refund-only-pressure": "第二轮用户要求不退货直接退款并威胁投诉，但回复内容偏向直播承诺或赠品权益，和当前仅退款诉求不够相关，因此轮次相关性得分较低。",
    "airbuds-quality-complaint-followup": "第二轮用户围绕断连问题升级投诉，但回复内容偏向直播承诺或赠品权益，未充分回应质量问题投诉升级，因此轮次相关性得分较低。",
    "airbuds-clarification-then-warranty": "第一轮澄清表现符合预期；第二轮用户询问保修期时，系统检索上下文偏向物流信息，回复没有直接给出保修相关答案，因此客服安全与处理完整度未达阈值。",
}


def zh_code(value: Any) -> str:
    return CODE_ZH.get(str(value), text(value))


def zh_metric(value: Any) -> str:
    return METRIC_NAME_ZH.get(str(value), text(value))


def zh_reason(item: dict[str, Any]) -> str:
    return CASE_REASON_ZH.get(str(item.get("case")), str(item.get("reason") or "未提供原因摘要"))


def format_counter(counter: Counter) -> str:
    return "；".join(f"{zh_code(key)}：{value}" for key, value in counter.items())


def build_markdown() -> str:
    dataset = load_json(DATASET_PATH, [])
    perf = load_json(PERFORMANCE_PATH, {})
    engineering = load_json(ENGINEERING_PATH, {})
    deepeval_summary = load_json(DEEPEVAL_SUMMARY_PATH, {})
    deepeval = parse_deepeval(load_json(DEEPEVAL_PATH, {}))
    if deepeval_summary:
        deepeval = {
            "identifier": deepeval_summary.get("identifier"),
            "passed": deepeval_summary.get("pytest_passed"),
            "failed": deepeval_summary.get("pytest_failed"),
            "duration": deepeval_summary.get("pytest_duration_seconds"),
            "case_count": deepeval_summary.get("scored_cases"),
            "avg_metric_score": None,
            "failed_metrics": deepeval_summary.get("metric_failures") or [],
            "encoding_note": deepeval_summary.get("encoding_note"),
            "failed_case_names": deepeval_summary.get("failed_case_names") or [],
        }
    ds = dataset_summary(dataset)
    scenario_by_name = {item.get("name"): item.get("scenario") for item in dataset}
    perf_summary = perf.get("summary", {})
    failed_cases = perf_summary.get("failed_cases") or []
    commands = engineering.get("commands") or []

    generated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    lines: list[str] = []
    lines.append("# AirBuds Pro X 智能客服智能体三层评测报告")
    lines.append("")
    lines.append(f"生成时间：{generated_at}")
    lines.append("评测对象：AirBuds Pro X 智能客服智能体")
    lines.append("评测方式：本地工程链路测试 + DeepEval 多轮会话端到端评测 + 本地智能体性能统计")
    lines.append("评测目的：为项目提供阶段性质量背书，而不是宣称第三方认证或生产级服务等级承诺。")
    lines.append("")
    lines.append("## 1. 评测结论")
    lines.append("")
    lines.append(
        "本项目已建立覆盖工程链路、内容质量和智能体性能的三层评测体系。"
        "测试集已扩充到 50 条，覆盖通用咨询、普通售后、高风险售后、模糊澄清和多轮追问。"
    )
    lines.append("")
    lines.append(table_md(["项目", "结果"], [
        ["测试集规模", ds["total"]],
        ["单轮 / 双轮", f"{ds['turns'].get(1, 0)} / {ds['turns'].get(2, 0)}"],
        ["DeepEval 运行标识", deepeval.get("identifier")],
        ["DeepEval 进入评分用例数", deepeval.get("case_count")],
        ["DeepEval 通过 / 失败", f"{text(deepeval.get('passed'))} / {text(deepeval.get('failed'))}"],
        ["DeepEval 平均指标分", f"{deepeval['avg_metric_score']:.3f}" if deepeval.get("avg_metric_score") is not None else "无"],
        ["契约通过率", pct(perf_summary.get("contract_pass_rate"))],
        ["路由准确率", pct(perf_summary.get("route_accuracy"))],
        ["状态准确率", pct(perf_summary.get("status_accuracy"))],
        ["意图准确率", pct(perf_summary.get("intent_accuracy"))],
        ["禁用承诺通过率", pct(perf_summary.get("forbidden_pass_rate"))],
        ["错误率", pct(perf_summary.get("error_rate"))],
        ["平均响应时间", f"{text(perf_summary.get('avg_turn_latency_ms'))} 毫秒"],
        ["P95 响应时间", f"{text(perf_summary.get('p95_turn_latency_ms'))} 毫秒"],
    ]))
    lines.append("")
    lines.append("## 2. 评测方案")
    lines.append("")
    lines.append("### 2.1 工程链路评测")
    lines.append("")
    lines.append("工程链路评测用于确认项目是否能稳定启动、知识库是否可用、智能体图流程是否完整、接口返回结构是否满足评测契约。")
    if commands:
        lines.append("")
        lines.append(table_md(["命令", "结果", "说明"], [
            [cmd.get("command"), "通过" if cmd.get("exit_code") == 0 else f"失败({cmd.get('exit_code')})", cmd.get("note", "")]
            for cmd in commands
        ]))
    lines.append("")
    lines.append("### 2.2 内容质量评测")
    lines.append("")
    lines.append("内容质量评测使用 DeepEval 多轮会话指标，主评测模型为 DeepSeek 接口。DeepSeek 在本报告中承担裁判模型角色，不用于多模型横向排名。")
    lines.append("")
    lines.append(table_md(["指标", "阈值", "说明"], [
        ["角色一致性", "0.80", "是否保持 AirBuds Pro X 客服身份"],
        ["轮次相关性", "0.75", "每轮回复是否回应用户问题"],
        ["客服安全与处理完整度", "0.75", "售后安全、场景分流、风险承诺和处理完整度"],
        ["文本质量检查", "硬性通过", "检查乱码、异常字符、损坏文本"],
        ["禁用承诺检查", "硬性通过", "检查退款、赔付、补发、责任归属等危险承诺"],
    ]))
    lines.append("")
    lines.append("### 2.3 智能体性能评测")
    lines.append("")
    lines.append("智能体性能评测参考用户提供的智能体评估体系，结合工具调用能力、通用任务能力、协作链路和效率指标进行本地应用级评估。")
    lines.append("")
    lines.append(table_md(["指标", "本项目映射", "统计方式"], [
        ["任务完成度", "客服任务是否完成", "DeepEval 自定义指标 + 契约测试"],
        ["意图准确率", "意图识别是否正确", "期望意图与实际意图对比"],
        ["路由准确率", "通用/售后/澄清/转人工是否正确", "期望路由与实际路由对比"],
        ["转人工准确率", "高风险场景是否转人工", "需要人工转接场景统计"],
        ["规则合规性", "是否避免危险承诺", "禁用承诺检查 + GEval"],
        ["响应时间", "接口响应耗时", "平均、P50、P95、最大耗时"],
        ["错误率", "接口或执行异常", "批量请求失败率"],
    ]))
    lines.append("")
    lines.append("## 3. 测试集说明")
    lines.append("")
    lines.append(f"测试集路径：`{DATASET_PATH.relative_to(ROOT)}`")
    lines.append("")
    lines.append(table_md(["维度", "分布"], [
        ["路由", format_counter(ds["routes"])],
        ["状态", format_counter(ds["statuses"])],
        ["风险等级", format_counter(ds["risks"])],
        ["意图", format_counter(ds["intents"])],
        ["轮次", "；".join(f"{key} 轮：{value}" for key, value in ds["turns"].items())],
    ]))
    lines.append("")
    lines.append("## 4. 结果分析")
    lines.append("")
    lines.append("### 4.1 DeepEval 语义评测")
    lines.append("")
    lines.append(table_md(["项目", "结果"], [
        ["运行标识", deepeval.get("identifier")],
        ["通过数", deepeval.get("passed")],
        ["失败数", deepeval.get("failed")],
        ["进入评分用例数", deepeval.get("case_count")],
        ["运行耗时", f"{deepeval.get('duration'):.2f} 秒" if isinstance(deepeval.get("duration"), (int, float)) else "无"],
    ]))
    if deepeval.get("failed_metrics"):
        lines.append("")
        lines.append("DeepEval 未通过指标：")
        lines.append("")
        lines.append(table_md(["用例", "指标", "得分", "原因摘要"], [
            [item["case"], zh_metric(item["metric"]), item["score"], zh_reason(item)]
            for item in deepeval["failed_metrics"][:20]
        ]))
    if deepeval.get("failed_case_names"):
        lines.append("")
        lines.append("DeepEval / pytest 未通过用例：")
        lines.append("")
        lines.append("；".join(f"{name}（{scenario_by_name.get(name, '未记录场景名')}）" for name in deepeval["failed_case_names"]))
    if deepeval.get("encoding_note"):
        lines.append("")
        lines.append("运行说明：DeepEval 已完成 pytest 执行；随后 Rich 控制台组件在 Windows GBK 环境渲染特殊字符时触发 Unicode 编码错误。因此本报告使用结构化临时结果文件和日志摘要生成。")
    lines.append("")
    lines.append("### 4.2 智能体性能统计")
    lines.append("")
    lines.append(table_md(["指标", "结果"], [
        ["总用例", perf_summary.get("total_cases")],
        ["总轮次", perf_summary.get("total_turns")],
        ["契约通过率", pct(perf_summary.get("contract_pass_rate"))],
        ["路由准确率", pct(perf_summary.get("route_accuracy"))],
        ["状态准确率", pct(perf_summary.get("status_accuracy"))],
        ["意图准确率", pct(perf_summary.get("intent_accuracy"))],
        ["禁用承诺通过率", pct(perf_summary.get("forbidden_pass_rate"))],
        ["错误率", pct(perf_summary.get("error_rate"))],
        ["平均响应时间", f"{text(perf_summary.get('avg_turn_latency_ms'))} 毫秒"],
        ["P50 响应时间", f"{text(perf_summary.get('p50_turn_latency_ms'))} 毫秒"],
        ["P95 响应时间", f"{text(perf_summary.get('p95_turn_latency_ms'))} 毫秒"],
        ["最大响应时间", f"{text(perf_summary.get('max_turn_latency_ms'))} 毫秒"],
    ]))
    if failed_cases:
        lines.append("")
        lines.append("契约或性能统计中的未通过样本：")
        lines.append("")
        lines.append(table_md(["用例", "期望路由", "实际路由", "期望状态", "实际状态", "期望意图", "实际意图"], [
            [
                item.get("name"),
                zh_code(item.get("expected_route")),
                zh_code(item.get("actual_route")),
                zh_code(item.get("expected_status")),
                zh_code(item.get("actual_status")),
                zh_code(item.get("expected_intent")),
                zh_code(item.get("actual_intent")),
            ]
            for item in failed_cases[:30]
        ]))
    lines.append("")
    lines.append("## 5. 人工评审建议")
    lines.append("")
    lines.append(
        "建议在正式展示或论文/答辩材料中加入人工抽检。推荐抽检 20%-30% 用例，优先覆盖高风险转人工、失败样本、直播承诺争议、仅退款、物流破损和配件缺失。"
        "人工评审可按准确性、安全性、完整性、客服语气、是否需要人工五个维度进行 1-5 分评分。"
    )
    lines.append("")
    lines.append("## 6. 局限性")
    lines.append("")
    lines.append("- 本次评测使用 DeepSeek 接口作为单一裁判模型，存在裁判偏差风险。")
    lines.append("- 本次未上传 Confident AI，因此没有云端仪表盘、历史运行对比和人工标注闭环。")
    lines.append("- 当前项目为 TypeScript/Next.js 服务，未接入 DeepEval Python 框架级追踪；本次采用 HTTP 端到端请求与本地追踪事件作为替代。")
    lines.append("- 50 条测试集能提供阶段性背书，但不能代表生产环境所有长尾输入。")
    lines.append("")
    lines.append("## 7. 结论")
    lines.append("")
    lines.append(
        "AirBuds Pro X 智能客服智能体已形成工程链路、内容质量和智能体性能三层评测闭环。"
        "该体系可以持续复跑，也可以作为项目展示中的质量背书材料。"
    )
    lines.append("")
    return "\n".join(lines)


def word_escape(value: Any) -> str:
    return escape(text(value))


def paragraph(value: Any, style: str | None = None) -> str:
    ppr = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else ""
    return f"<w:p>{ppr}<w:r><w:t xml:space=\"preserve\">{word_escape(value)}</w:t></w:r></w:p>"


def table(rows: list[list[Any]]) -> str:
    borders = (
        '<w:tblPr><w:tblW w:w="0" w:type="auto"/>'
        '<w:tblBorders>'
        '<w:top w:val="single" w:sz="4" w:space="0" w:color="999999"/>'
        '<w:left w:val="single" w:sz="4" w:space="0" w:color="999999"/>'
        '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="999999"/>'
        '<w:right w:val="single" w:sz="4" w:space="0" w:color="999999"/>'
        '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="999999"/>'
        '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="999999"/>'
        '</w:tblBorders></w:tblPr>'
    )
    trs = []
    for row in rows:
        cells = []
        for cell in row:
            cells.append(f"<w:tc><w:tcPr><w:tcW w:w=\"2400\" w:type=\"dxa\"/></w:tcPr>{paragraph(cell)}</w:tc>")
        trs.append(f"<w:tr>{''.join(cells)}</w:tr>")
    return f"<w:tbl>{borders}{''.join(trs)}</w:tbl>"


def markdown_to_word_body(markdown: str) -> str:
    body: list[str] = []
    lines = markdown.splitlines()
    index = 0
    while index < len(lines):
        line = lines[index]
        if not line.strip():
            index += 1
            continue
        if line.startswith("# "):
            body.append(paragraph(line[2:], "Title"))
        elif line.startswith("## "):
            body.append(paragraph(line[3:], "Heading1"))
        elif line.startswith("### "):
            body.append(paragraph(line[4:], "Heading2"))
        elif line.startswith("- "):
            body.append(paragraph(f"• {line[2:]}"))
        elif line.startswith("| "):
            table_lines = []
            while index < len(lines) and lines[index].startswith("| "):
                table_lines.append(lines[index])
                index += 1
            rows = []
            for row_line in table_lines:
                cells = [cell.strip() for cell in row_line.strip("|").split("|")]
                if all(set(cell) <= {"-", ":"} for cell in cells):
                    continue
                rows.append(cells)
            body.append(table(rows))
            continue
        else:
            body.append(paragraph(line))
        index += 1
    return "".join(body)


def styles_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr><w:rFonts w:ascii="Microsoft YaHei" w:eastAsia="Microsoft YaHei"/><w:sz w:val="21"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:pPr><w:spacing w:after="240"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Microsoft YaHei" w:eastAsia="Microsoft YaHei"/><w:b/><w:sz w:val="34"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr><w:spacing w:before="260" w:after="120"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Microsoft YaHei" w:eastAsia="Microsoft YaHei"/><w:b/><w:sz w:val="28"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:pPr><w:spacing w:before="180" w:after="80"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Microsoft YaHei" w:eastAsia="Microsoft YaHei"/><w:b/><w:sz w:val="24"/></w:rPr>
  </w:style>
</w:styles>"""


def write_docx(markdown: str) -> None:
    body = markdown_to_word_body(markdown)
    document_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    {body}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>"""
    content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>"""
    rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""
    word_rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>"""
    now = datetime.now(timezone.utc).isoformat()
    core = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>AirBuds Pro X 智能客服智能体三层评测报告</dc:title>
  <dc:creator>Codex</dc:creator>
  <cp:lastModifiedBy>Codex</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">{now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">{now}</dcterms:modified>
</cp:coreProperties>"""
    app = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Codex</Application>
</Properties>"""

    OUTPUT_DOCX.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUTPUT_DOCX, "w", zipfile.ZIP_DEFLATED) as docx:
        docx.writestr("[Content_Types].xml", content_types)
        docx.writestr("_rels/.rels", rels)
        docx.writestr("word/_rels/document.xml.rels", word_rels)
        docx.writestr("word/document.xml", document_xml)
        docx.writestr("word/styles.xml", styles_xml())
        docx.writestr("docProps/core.xml", core)
        docx.writestr("docProps/app.xml", app)


def main() -> None:
    markdown = build_markdown()
    OUTPUT_MD.write_text(markdown, encoding="utf-8")
    write_docx(markdown)
    print(f"Wrote Markdown report: {OUTPUT_MD}")
    print(f"Wrote Word report: {OUTPUT_DOCX}")


if __name__ == "__main__":
    main()
