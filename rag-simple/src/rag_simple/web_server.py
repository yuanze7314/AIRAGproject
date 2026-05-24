from __future__ import annotations

import cgi
import io
import json
import os
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


PACKAGE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = PACKAGE_DIR.parents[1]
FRONTEND_DIR = PROJECT_DIR / "frontend"
UPLOADED_KNOWLEDGE: list[dict[str, str]] = []
UPLOADED_DOCUMENTS: dict[str, dict[str, object]] = {}
ACTIVE_DOCUMENT_ID: str | None = None

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


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def chunk_text(
    text: str,
    filename: str,
    document_id: str,
    chunk_size: int = 420,
    overlap: int = 80,
) -> list[dict[str, str]]:
    clean = normalize_text(text)
    if not clean:
        return []

    chunks = []
    start = 0
    index = 1
    while start < len(clean):
        end = min(start + chunk_size, len(clean))
        chunk = clean[start:end].strip()
        if chunk:
            chunks.append(
                {
                    "document_id": document_id,
                    "filename": filename,
                    "content": chunk,
                    "section": f"片段 {index}",
                }
            )
            index += 1
        if end == len(clean):
            break
        start = max(end - overlap, start + 1)
    return chunks


def extract_document_text(filename: str, data: bytes) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix == ".pdf":
        try:
            from pypdf import PdfReader
        except ImportError as exc:
            raise RuntimeError("缺少 pypdf 依赖，请先运行 pip install pypdf") from exc

        reader = PdfReader(io.BytesIO(data))
        pages = [page.extract_text() or "" for page in reader.pages]
        return "\n".join(pages)

    return data.decode("utf-8", errors="ignore")


def score_chunk(question: str, chunk: dict[str, str]) -> int:
    content = chunk["content"]
    compact_question = re.sub(r"\s+", "", question)
    words = [word for word in re.split(r"[\s，。！？、：；,.!?;:]+", question) if len(word) >= 2]
    word_score = sum(4 for word in words if word in content)
    char_score = sum(1 for char in set(compact_question) if char and char in content)
    return word_score + char_score


def search_uploaded_knowledge(question: str) -> dict[str, object] | None:
    if not UPLOADED_KNOWLEDGE:
        return None

    candidates = [
        chunk
        for chunk in UPLOADED_KNOWLEDGE
        if ACTIVE_DOCUMENT_ID is None or chunk.get("document_id") == ACTIVE_DOCUMENT_ID
    ]
    if not candidates:
        candidates = UPLOADED_KNOWLEDGE

    ranked = sorted(
        ((score_chunk(question, chunk), chunk) for chunk in candidates),
        key=lambda item: item[0],
        reverse=True,
    )
    best_score, best_chunk = ranked[0]
    if best_score <= 0:
        return None

    snippet = best_chunk["content"][:220]
    answer = (
        "您好，根据已上传知识库中的相关内容，可以参考以下信息处理：\n"
        f"{snippet}"
        "\n\n如需对外发送，建议客服先核对原文上下文，再结合客户具体情况确认。"
    )
    return {
        "mode": "Uploaded KB",
        "answer": answer,
        "sources": [f"{best_chunk['filename']} · {best_chunk['section']}"],
        "action": "建议核对原文后发送给客户。",
        "confidence": "中" if best_score < 8 else "高",
        "snippet": snippet,
    }


def build_mock_answer(question: str) -> dict[str, object]:
    uploaded_answer = search_uploaded_knowledge(question)
    if uploaded_answer:
        return uploaded_answer

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

    def do_GET(self) -> None:
        if urlparse(self.path).path == "/api/documents":
            self._send_json({"documents": list(UPLOADED_DOCUMENTS.values()), "active_id": ACTIVE_DOCUMENT_ID})
            return
        super().do_GET()

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/upload":
            self._handle_upload()
            return
        if path == "/api/documents/activate":
            self._handle_activate_document()
            return
        if path == "/api/documents/delete":
            self._handle_delete_document()
            return

        if path != "/api/ask":
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

    def _handle_upload(self) -> None:
        global ACTIVE_DOCUMENT_ID

        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type:
            self._send_json({"error": "请使用 multipart/form-data 上传文件。"}, status=400)
            return

        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={
                "REQUEST_METHOD": "POST",
                "CONTENT_TYPE": content_type,
                "CONTENT_LENGTH": self.headers.get("Content-Length", "0"),
            },
        )
        field = form["file"] if "file" in form else None
        if field is None or not getattr(field, "filename", ""):
            self._send_json({"error": "没有收到文件。"}, status=400)
            return

        filename = Path(field.filename).name
        data = field.file.read()
        document_id = f"doc-{len(UPLOADED_DOCUMENTS) + 1}-{abs(hash(filename + str(len(data))))}"
        try:
            text = extract_document_text(filename, data)
            chunks = chunk_text(text, filename, document_id)
        except Exception as exc:
            self._send_json({"error": str(exc)}, status=400)
            return

        if not chunks:
            self._send_json({"error": "没有从文件中提取到可检索文本。"}, status=400)
            return

        UPLOADED_KNOWLEDGE.extend(chunks)
        ACTIVE_DOCUMENT_ID = document_id
        UPLOADED_DOCUMENTS[document_id] = {
            "id": document_id,
            "filename": filename,
            "chunks": len(chunks),
            "active": True,
            "preview": chunks[0]["content"][:160],
        }
        for doc_id, document in UPLOADED_DOCUMENTS.items():
            document["active"] = doc_id == ACTIVE_DOCUMENT_ID
        self._send_json(
            {
                "id": document_id,
                "filename": filename,
                "chunks": len(chunks),
                "preview": chunks[0]["content"][:220],
            }
        )

    def _read_json_payload(self) -> dict[str, object]:
        content_length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(content_length) or b"{}")

    def _handle_activate_document(self) -> None:
        global ACTIVE_DOCUMENT_ID

        payload = self._read_json_payload()
        document_id = str(payload.get("id", ""))
        if document_id not in UPLOADED_DOCUMENTS:
            self._send_json({"error": "文档不存在。"}, status=404)
            return

        ACTIVE_DOCUMENT_ID = document_id
        for doc_id, document in UPLOADED_DOCUMENTS.items():
            document["active"] = doc_id == ACTIVE_DOCUMENT_ID
        self._send_json({"documents": list(UPLOADED_DOCUMENTS.values()), "active_id": ACTIVE_DOCUMENT_ID})

    def _handle_delete_document(self) -> None:
        global ACTIVE_DOCUMENT_ID

        payload = self._read_json_payload()
        document_id = str(payload.get("id", ""))
        if document_id not in UPLOADED_DOCUMENTS:
            self._send_json({"error": "文档不存在。"}, status=404)
            return

        del UPLOADED_DOCUMENTS[document_id]
        UPLOADED_KNOWLEDGE[:] = [chunk for chunk in UPLOADED_KNOWLEDGE if chunk.get("document_id") != document_id]
        if ACTIVE_DOCUMENT_ID == document_id:
            ACTIVE_DOCUMENT_ID = next(iter(UPLOADED_DOCUMENTS), None)
        for doc_id, document in UPLOADED_DOCUMENTS.items():
            document["active"] = doc_id == ACTIVE_DOCUMENT_ID
        self._send_json({"documents": list(UPLOADED_DOCUMENTS.values()), "active_id": ACTIVE_DOCUMENT_ID})

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
