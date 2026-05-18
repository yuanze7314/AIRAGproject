# 智能客服回答：RAG 智能客服演示项目

这是一个基于 LangChain、Chroma 和 DeepSeek Chat API 的 RAG 智能客服演示项目。项目将企业制度、FAQ、售后政策等本地知识沉淀为可检索知识库，客服人员或终端用户输入问题后，系统先召回相关知识片段，再生成带有引用依据的客服回复。

当前版本包含一个可本地运行的 Web 演示页，默认使用 mock 数据完成客服问答交互；配置 API Key 和向量库后，可切换到真实 RAG 链路。

## 核心功能

- 智能客服问答：根据本地知识库生成标准化回复。
- RAG 检索增强：使用向量检索召回相关文档片段，降低幻觉风险。
- 坐席辅助信息：展示知识引用、建议动作和置信度。
- 本地知识库：示例知识来自 `employee_handbook.md`，可替换为企业文档。
- Web 演示页面：适合 GitHub 展示、答辩演示和本地体验。

## 技术栈

- Python 3.12
- LangChain
- Chroma
- HuggingFace Embeddings: `BAAI/bge-small-zh-v1.5`
- DeepSeek Chat API
- Vanilla HTML / CSS / JavaScript

## 项目结构

```text
rag-simple/
├─ frontend/
│  ├─ index.html          # 智能客服演示页面
│  ├─ styles.css          # 页面样式
│  └─ app.js              # 前端交互与 mock 回退
├─ src/rag_simple/
│  ├─ employee_handbook.md # 示例企业知识库
│  ├─ env_utils.py         # 环境变量读取
│  ├─ main.py              # RAG 核心逻辑
│  └─ web_server.py        # 本地 Web 服务与 /api/ask 接口
├─ tests/
├─ .env.example
├─ .gitignore
├─ pyproject.toml
└─ poetry.lock
```

## 本地运行

### 1. 进入项目

```powershell
cd E:\codex\AIRAGproject\rag-simple
```

### 2. 启动 Web 演示页

该模式不需要先安装 LangChain 等重型依赖，默认使用 mock 客服知识库：

```powershell
$env:PYTHONPATH="E:\codex\AIRAGproject\rag-simple\src"
python -m rag_simple.web_server
```

浏览器打开：

```text
http://127.0.0.1:8000/
```

### 3. 安装完整 RAG 依赖

使用 Poetry：

```powershell
poetry install
```

或使用 pip：

```powershell
pip install -e .
```

### 4. 配置真实 RAG 接口

复制环境变量示例并填入自己的 DeepSeek API Key：

```powershell
Copy-Item .env.example .env
```

然后设置运行环境变量：

```powershell
$env:DEEPSEEK_API_KEY="your_deepseek_api_key"
$env:AIRAG_ENABLE_REAL_RAG="1"
$env:PYTHONPATH="E:\codex\AIRAGproject\rag-simple\src"
python -m rag_simple.web_server
```

注意：真实 RAG 链路会调用模型 API，并依赖本地 Chroma 向量库。首次运行前需要根据 `main.py` 中的逻辑构建知识库索引。

## 页面预览说明

Web 页面以“智能客服工作台”为主线，包含：

- 项目标题与一句话介绍
- 客服能力展示
- 客服处理流程
- 技术栈标签
- 知识文档导入与客户问题输入
- 客服回复、知识引用、建议动作、置信度
- 售前咨询、售后支持、坐席辅助等适用场景

## GitHub 清理说明

以下内容不应提交到 GitHub，已加入 `.gitignore`：

- `.venv/`、`venv/`
- `.idea/`、`.vscode/`
- `.env`、`.env.*`
- `chroma_db/`
- `*.sqlite`、`*.sqlite3`、`*.db`
- `__pycache__/`、`.pytest_cache/`

## 后续优化方向

- 将文档上传接入真实解析流程，支持 PDF、Word、Markdown。
- 增加流式输出，让客服回复逐字生成。
- 为每次问答保存工单记录和客户上下文。
- 增加人工接管、满意度评价和问题分类。
- 为 RAG 检索结果展示片段相似度和来源页码。
- 增加单元测试和端到端页面测试。
