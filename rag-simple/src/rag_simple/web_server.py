from __future__ import annotations

import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


PACKAGE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = PACKAGE_DIR.parents[1]
FRONTEND_DIR = PROJECT_DIR / "frontend"

MOCK_KNOWLEDGE = [
    {
        "keywords": ["年假", "休假"],
        "answer": "您好，根据当前知识库，员工入职第一年享有 5 天带薪年假；工作满 1 年后增加至 10 天。建议您至少提前 2 周通过 HR 系统提交申请，等待直属主管审批。",
        "sources": ["employee_handbook.md · 考勤与休假制度"],
        "action": "可直接回复客户，并附上 HR 系统申请入口。",
        "confidence": "高",
    },
    {
        "keywords": ["上海", "住宿", "报销", "出差"],
        "answer": "您好，上海属于一线城市，当前住宿报销上限为每日 500 元。请在费用发生后 1 个月内通过财务系统提交票据和报销申请。",
        "sources": ["employee_handbook.md · 财务与报销制度"],
        "action": "可直接回复客户；如涉及特殊审批，建议补充工单备注。",
        "confidence": "高",
    },
    {
        "keywords": ["试用期"],
        "answer": "您好，根据员工手册，所有新员工试用期为 3 个月。如需确认个人合同条款，建议同步查看入职合同或联系 HR。",
        "sources": ["employee_handbook.md · 其他规定"],
        "action": "可直接回复客户，复杂劳动合同问题转 HR 复核。",
        "confidence": "高",
    },
    {
        "keywords": ["病假"],
        "answer": "您好，员工每年享有 7 天带薪病假。申请病假时需要提供医疗机构开具的病假证明，以便完成审批。",
        "sources": ["employee_handbook.md · 考勤与休假制度"],
        "action": "可直接回复客户，并提示保留医疗证明。",
        "confidence": "高",
    },
]


def build_mock_answer(question: str) -> dict[str, object]:
    for item in MOCK_KNOWLEDGE:
        if any(keyword in question for keyword in item["keywords"]):
            return {
                "mode": "Mock",
                "answer": item["answer"],
                "sources": item["sources"],
                "action": item["action"],
                "confidence": item["confidence"],
            }

    return {
        "mode": "Mock",
        "answer": "您好，我没有在当前演示知识库中找到完全匹配的信息。建议转人工客服进一步核实；真实 RAG 接口接入后，可召回更多文档片段再生成回复。",
        "sources": ["mock · 可在 AIRAG_ENABLE_REAL_RAG=1 后接入真实链路"],
        "action": "建议转人工客服，并补充客户上下文。",
        "confidence": "低",
    }


def ask_real_rag(question: str) -> dict[str, object]:
    # TODO: productionize this path with request timeout, structured errors, and streaming output.
    from langchain_openai import ChatOpenAI

    from .env_utils import DEEPSEEK_API_KEY
    from .main import ask_with_rag

    if not DEEPSEEK_API_KEY:
        raise RuntimeError("DEEPSEEK_API_KEY is not configured")

    llm = ChatOpenAI(
        temperature=0.2,
        model="deepseek-chat",
        api_key=DEEPSEEK_API_KEY,
        base_url="https://api.deepseek.com",
    )
    answer = ask_with_rag(llm, question)
    return {
        "mode": "RAG",
        "answer": answer,
        "sources": ["Chroma · employee_handbook.md"],
        "action": "建议坐席复核引用后发送给客户。",
        "confidence": "中",
    }


class AIRAGHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(FRONTEND_DIR), **kwargs)

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/api/ask":
            self.send_error(404)
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(content_length) or b"{}")
        question = str(payload.get("question", "")).strip()
        if not question:
            self._send_json({"mode": "Error", "answer": "问题不能为空。", "sources": []}, status=400)
            return

        if os.getenv("AIRAG_ENABLE_REAL_RAG") == "1":
            try:
                self._send_json(ask_real_rag(question))
                return
            except Exception as exc:
                result = build_mock_answer(question)
                result["mode"] = "Mock"
                result["sources"] = [*result["sources"], f"real RAG fallback: {exc}"]
                self._send_json(result)
                return

        self._send_json(build_mock_answer(question))

    def _send_json(self, payload: dict[str, object], status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    host = os.getenv("AIRAG_HOST", "127.0.0.1")
    port = int(os.getenv("AIRAG_PORT", "8000"))
    server = ThreadingHTTPServer((host, port), AIRAGHandler)
    print(f"Customer service RAG demo page: http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
