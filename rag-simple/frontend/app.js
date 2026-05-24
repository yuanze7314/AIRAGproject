const conversationEl = document.querySelector("#conversation");
const questionInput = document.querySelector("#question");
const sourcesEl = document.querySelector("#sources");
const askButton = document.querySelector("#ask-button");
const nextActionEl = document.querySelector("#next-action");
const confidenceEl = document.querySelector("#confidence");
const confidenceLevelEl = document.querySelector("#confidence-level");
const fileInput = document.querySelector("#document-file");
const uploadStatus = document.querySelector("#upload-status");
const hitSnippetEl = document.querySelector("#hit-snippet");
const newChatButton = document.querySelector("#new-chat-button");
const moreSessionsButton = document.querySelector("#more-sessions-button");
const sessionList = document.querySelector("#session-list");
const navLinks = document.querySelectorAll("[data-view]");
const appShell = document.querySelector(".app-shell");
const knowledgePanel = document.querySelector("#knowledge-panel");
const composerEl = document.querySelector(".composer");
const inspectorEl = document.querySelector(".inspector");
const knowledgeFileInput = document.querySelector("#knowledge-file");
const documentList = document.querySelector("#document-list");
const refreshDocumentsButton = document.querySelector("#refresh-documents");
const docCountEl = document.querySelector("#doc-count");
const chunkCountEl = document.querySelector("#chunk-count");
const knowledgeStateEl = document.querySelector("#knowledge-state");

let activeSessionId = "session-1";
let editingSessionId = null;

const defaultAssistantAnswer = `根据《员工手册》相关规定，您入职第一年可享受 5 天年假。
适用对象：入职满 1 年（含）以上的正式员工。
说明：年假天数按自然年累计计算，未休完的年假可按公司政策结转。`;

let sessions = [
  {
    id: "session-1",
    title: "我入职第一年有多少天年假？",
    time: "13:45",
    messages: [
      { role: "user", content: "我入职第一年有多少天年假？" },
      {
        role: "assistant",
        content: defaultAssistantAnswer,
        reasoning: [
          "已理解问题意图：年假天数政策咨询",
          "在知识库中检索相关内容...",
          "命中 2 个相关文档，覆盖相似条款片段",
          "基于检索结果生成回复"
        ],
        sources: ["employee_handbook.md"],
        action: "可直接发送",
        confidence: "92%",
        confidenceLevel: "高置信度",
        snippet: "3.2.1 年假：员工入职满 1 年可享受 5 天带薪年假，根据在职时间按比例计算，年假按自然年累计。"
      }
    ]
  },
  {
    id: "session-2",
    title: "试用期工资如何计算？",
    time: "昨天",
    messages: [
      { role: "user", content: "试用期工资如何计算？" },
      {
        role: "assistant",
        content: "请发送该问题，AI Agent 会基于知识库检索后生成回复。",
        reasoning: ["等待用户继续咨询"],
        sources: ["employee_handbook.md"],
        action: "待生成",
        confidence: "待生成",
        snippet: "切换到该会话后可以继续多轮提问。"
      }
    ]
  }
];

function getActiveSession() {
  return sessions.find((session) => session.id === activeSessionId);
}

function formatSessionTitle(question) {
  return question.replace(/^客户问[:：]\s*/, "").slice(0, 18) || "新的客服会话";
}

function getCurrentTimeLabel() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeQuestion(value) {
  return value.replace(/^客户问[:：]\s*/, "").trim();
}

function createUserMessage(content) {
  const row = document.createElement("div");
  row.className = "user-row message-enter";
  row.innerHTML = `
    <div class="user-message">${escapeHtml(content)}</div>
    <div class="user-avatar" aria-label="用户头像"></div>
  `;
  return row;
}

function createAssistantMessage(message) {
  const card = document.createElement("article");
  card.className = "assistant-card message-enter";
  card.innerHTML = `
    <div class="assistant-meta">
      <div class="mini-bot" aria-hidden="true">AI</div>
      <span>AI Agent</span>
      <time>${getCurrentTimeLabel()}</time>
    </div>
    <div class="reasoning-card${message.loading ? " loading" : ""}">
      <button class="reasoning-title" type="button" aria-expanded="true">
        深度思考 · 检索过程
        <span aria-hidden="true">⌃</span>
      </button>
      <p>${escapeHtml(message.reasoning?.[0] || "正在分析客户问题...")}</p>
      <ul>
        ${(message.reasoning || ["理解问题意图...", "检索知识库...", "生成客服回复..."])
          .slice(1)
          .map((item) => `<li>${escapeHtml(item)}</li>`)
          .join("")}
      </ul>
    </div>
    <div class="answer-text compact">${escapeHtml(message.content || "正在组织回复...")}</div>
  `;
  return card;
}

function renderConversation() {
  const session = getActiveSession();
  conversationEl.innerHTML = "";

  session.messages.forEach((message) => {
    conversationEl.appendChild(
      message.role === "user" ? createUserMessage(message.content) : createAssistantMessage(message)
    );
  });

  conversationEl.scrollTop = conversationEl.scrollHeight;
  syncInspectorFromLastAssistant();
}

function syncInspectorFromLastAssistant() {
  const session = getActiveSession();
  const lastAssistant = [...session.messages].reverse().find((message) => message.role === "assistant");
  if (!lastAssistant) return;

  sourcesEl.textContent = lastAssistant.sources?.join(" / ") || "等待检索";
  nextActionEl.textContent = lastAssistant.action || "建议人工复核后发送。";
  confidenceEl.textContent = lastAssistant.confidence || "待生成";
  confidenceLevelEl.textContent = lastAssistant.confidenceLevel || getConfidenceLevel(lastAssistant.confidence);
  hitSnippetEl.textContent = lastAssistant.snippet || lastAssistant.content.slice(0, 180);
}

function renderSessions() {
  const visibleSessions = sessions;
  sessionList.innerHTML = "";

  visibleSessions.forEach((session) => {
    const isEditing = session.id === editingSessionId;
    const row = document.createElement("div");
    row.className = [
      "session-row",
      session.id === activeSessionId ? "active" : "",
      isEditing ? "editing" : ""
    ]
      .filter(Boolean)
      .join(" ");
    row.dataset.sessionId = session.id;

    const titleControl = document.createElement(isEditing ? "div" : "button");
    titleControl.className = "recent-item";

    if (isEditing) {
      titleControl.innerHTML = `
        <input class="session-title-input" value="${escapeHtml(session.title)}" aria-label="编辑会话名称" />
      `;
    } else {
      titleControl.type = "button";
      titleControl.dataset.sessionId = session.id;
      titleControl.innerHTML = `<span>${escapeHtml(session.title)}</span><small>${session.time}</small>`;
      titleControl.addEventListener("click", () => {
        activeSessionId = session.id;
        const lastUser = [...session.messages].reverse().find((message) => message.role === "user");
        questionInput.value = lastUser ? `客户问：${lastUser.content}` : "";
        renderConversation();
        renderSessions();
      });
      titleControl.addEventListener("dblclick", (event) => {
        event.preventDefault();
        event.stopPropagation();
        beginEditingSession(session.id);
      });
    }

    const actions = document.createElement("div");
    actions.className = "session-actions";
    actions.innerHTML = `
      <button class="session-delete" type="button" data-action="delete" data-session-id="${session.id}" aria-label="删除会话">×</button>
    `;

    row.append(titleControl, actions);

    sessionList.appendChild(row);
  });

  moreSessionsButton.textContent = `${sessions.length} 条`;
  moreSessionsButton.setAttribute("aria-label", "当前会话数量");
  moreSessionsButton.setAttribute("aria-expanded", "true");

  if (editingSessionId) {
    requestAnimationFrame(() => {
      const input = sessionList.querySelector(`.session-row[data-session-id="${editingSessionId}"] .session-title-input`);
      input?.focus();
      input?.select();
    });
  }
}

function beginEditingSession(id) {
  editingSessionId = id;
  renderSessions();
}

function saveSessionTitle(id, value) {
  const session = sessions.find((item) => item.id === id);
  if (!session) {
    editingSessionId = null;
    return;
  }
  const nextTitle = value.trim();
  if (nextTitle) {
    session.title = nextTitle.slice(0, 28);
  }
  editingSessionId = null;
  renderSessions();
}

function cancelSessionTitleEdit() {
  editingSessionId = null;
  renderSessions();
}

function deleteSession(id) {
  editingSessionId = null;

  if (sessions.length <= 1) {
    sessions = [];
    activeSessionId = "";
    createSession();
    return;
  }

  sessions = sessions.filter((session) => session.id !== id);

  if (activeSessionId === id) {
    activeSessionId = sessions[0].id;
    const lastUser = [...sessions[0].messages].reverse().find((message) => message.role === "user");
    questionInput.value = lastUser ? `客户问：${lastUser.content}` : "";
    renderConversation();
  }

  renderSessions();
}

function setView(view) {
  navLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.view === view);
  });
  const isKnowledge = view === "knowledge";
  const isChat = view === "chat";
  appShell.classList.toggle("is-knowledge", isKnowledge);
  conversationEl.hidden = !isChat;
  knowledgePanel.hidden = !isKnowledge;
  composerEl.hidden = !isChat;
  inspectorEl.hidden = !isChat;
  if (isKnowledge) {
    loadDocuments();
  }
}

function createSession() {
  const id = `session-${Date.now()}`;
  const session = {
    id,
    title: "新的客服会话",
    time: getCurrentTimeLabel(),
    messages: [
      {
        role: "assistant",
        content: "已创建新会话，请输入客户问题开始检索知识库。",
        reasoning: ["等待客户咨询", "发送问题后会检索知识库", "随后生成可复核的客服回复"],
        sources: ["等待检索"],
        action: "待生成",
        confidence: "待生成",
        snippet: "新会话已创建，发送问题后会显示命中的知识片段。"
      }
    ]
  };
  sessions = [session, ...sessions];
  activeSessionId = id;
  editingSessionId = null;
  questionInput.value = "";
  renderConversation();
  renderSessions();
}

async function askQuestion() {
  const question = normalizeQuestion(questionInput.value);
  if (!question) return;

  const session = getActiveSession();
  session.messages.push({ role: "user", content: question });
  session.title = formatSessionTitle(question);
  session.time = getCurrentTimeLabel();

  const loadingMessage = {
    role: "assistant",
    loading: true,
    content: "正在检索知识库并生成回复...",
    reasoning: [
      "已接收客户问题，正在识别意图",
      "检索知识库相关片段...",
      "整理可发送的客服话术..."
    ],
    sources: ["检索中"],
    action: "生成中",
    confidence: "计算中",
    snippet: "正在检索命中片段..."
  };
  session.messages.push(loadingMessage);
  sessions = [session, ...sessions.filter((item) => item.id !== activeSessionId)];
  renderSessions();
  renderConversation();

  askButton.disabled = true;

  try {
    const history = session.messages
      .filter((message) => !message.loading)
      .map(({ role, content }) => ({ role, content }));
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, history })
    });
    if (!response.ok) throw new Error("API unavailable");
    const data = await response.json();
    Object.assign(loadingMessage, normalizeAssistantData(data, question), { loading: false });
  } catch (error) {
    Object.assign(loadingMessage, normalizeAssistantData(getMockAnswer(question), question), { loading: false });
  } finally {
    askButton.disabled = false;
    renderConversation();
  }
}

function normalizeAssistantData(data, question = "") {
  const confidence = calculateConfidence({ question, answer: data.answer, sources: data.sources, backendConfidence: data.confidence });
  return {
    role: "assistant",
    content: data.answer,
    reasoning: [
      "已理解客户问题并完成意图识别",
      "在知识库中检索相关内容...",
      `命中 ${data.sources?.length || 1} 个相关来源`,
      "基于检索结果生成回复"
    ],
    sources: data.sources || ["未命中"],
    action: data.action || "建议人工复核后发送。",
    confidence: `${confidence.score}%`,
    confidenceLevel: confidence.level,
    snippet: data.snippet || data.answer.slice(0, 180)
  };
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getConfidenceLevel(confidence) {
  const score = Number.parseInt(String(confidence || "0"), 10);
  if (Number.isNaN(score)) return "待生成";
  if (score >= 80) return "高置信度";
  if (score >= 60) return "中置信度";
  return "低置信度";
}

function calculateConfidence({ question = "", answer = "", sources = [], backendConfidence } = {}) {
  const normalizedSources = Array.isArray(sources) ? sources : [];
  const hasKnowledgeHit = normalizedSources.some((source) => !String(source).includes("未命中"));
  const hasHandbookHit = normalizedSources.some((source) => String(source).includes("employee_handbook"));
  const questionLength = question.replace(/^客户问[:：]\s*/, "").trim().length;
  const answerLength = answer.trim().length;
  const hasActionableText = /建议|申请|确认|提交|联系|转人工|复核|审批/.test(answer);
  const hasCaution = /建议|复核|确认|转人工|正式文件|HR|人工/.test(answer);

  const retrievalScore = hasHandbookHit ? 92 : hasKnowledgeHit ? 78 : 42;
  const contextScore = questionLength >= 12 ? 88 : questionLength >= 6 ? 70 : 45;
  const answerCompletenessScore = answerLength >= 80 && hasActionableText ? 88 : answerLength >= 40 ? 72 : 50;
  const ruleValidationScore = hasKnowledgeHit && hasCaution ? 86 : hasKnowledgeHit ? 76 : 52;

  let score = clampScore(
    0.35 * retrievalScore +
      0.25 * contextScore +
      0.2 * answerCompletenessScore +
      0.2 * ruleValidationScore
  );

  if (backendConfidence === "高") score = Math.max(score, 82);
  if (backendConfidence === "中") score = Math.min(Math.max(score, 60), 79);
  if (backendConfidence === "低") score = Math.min(score, 59);

  return {
    score,
    level: getConfidenceLevel(`${score}%`)
  };
}

const fallbackAnswers = [
  {
    keywords: ["年假", "休假"],
    answer: "您好，根据当前知识库，员工入职第一年享有 5 天带薪年假；工作满 1 年后增加至 10 天。建议您至少提前 2 周通过 HR 系统提交申请，等待直属主管审批。",
    sources: ["employee_handbook.md · 考勤与休假制度"],
    action: "可直接回复客户，并附上 HR 系统申请入口。",
    confidence: "高"
  },
  {
    keywords: ["上海", "住宿", "报销", "出差"],
    answer: "您好，上海属于一线城市，当前住宿报销上限为每日 500 元。请在费用发生后 1 个月内通过财务系统提交票据和报销申请。",
    sources: ["employee_handbook.md · 财务与报销制度"],
    action: "可直接回复客户；如涉及特殊审批，建议补充工单备注。",
    confidence: "高"
  },
  {
    keywords: ["试用期"],
    answer: "您好，根据员工手册，所有新员工试用期为 3 个月。如需确认个人合同条款，建议同步查看入职合同或联系 HR。",
    sources: ["employee_handbook.md · 其他规定"],
    action: "可直接回复客户，复杂劳动合同问题转 HR 复核。",
    confidence: "高"
  },
  {
    keywords: ["病假"],
    answer: "您好，员工每年享有 7 天带薪病假。申请病假时需要提供医疗机构开具的病假证明，以便完成审批。",
    sources: ["employee_handbook.md · 考勤与休假制度"],
    action: "可直接回复客户，并提示保留医疗证明。",
    confidence: "高"
  }
];

function getMockAnswer(question) {
  const matched = fallbackAnswers.find((item) => item.keywords.some((keyword) => question.includes(keyword)));
  return matched || {
    answer: "您好，我没有在当前演示知识库中找到完全匹配的信息。建议转人工客服进一步核实；真实 RAG 接口接入后，可召回更多文档片段再生成回复。",
    sources: ["mock · 后续接入 src/rag_simple/main.py 的 ask_with_rag"],
    action: "建议转人工客服，并补充客户上下文。",
    confidence: "低"
  };
}

async function uploadDocument(file) {
  const formData = new FormData();
  formData.append("file", file);
  uploadStatus.textContent = "正在解析知识文档...";

  try {
    const response = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "上传失败");

    uploadStatus.textContent = `已载入：${data.filename}（${data.chunks} 个片段）`;
    sourcesEl.textContent = data.filename;
    hitSnippetEl.textContent = data.preview || "文档已载入，请输入问题开始检索。";
    await loadDocuments();
  } catch (error) {
    uploadStatus.textContent = error.message || "上传失败，请检查 PDF 是否可复制文本。";
  }
}

async function loadDocuments() {
  try {
    const response = await fetch("/api/documents");
    const data = await response.json();
    renderDocuments(data.documents || []);
  } catch (error) {
    documentList.innerHTML = `<div class="empty-documents">暂时无法读取知识库列表。</div>`;
  }
}

function renderDocuments(documents) {
  const totalChunks = documents.reduce((sum, document) => sum + Number(document.chunks || 0), 0);
  docCountEl.textContent = String(documents.length);
  chunkCountEl.textContent = String(totalChunks);
  knowledgeStateEl.textContent = documents.some((document) => document.active) ? "已选择" : "默认库";

  if (!documents.length) {
    documentList.innerHTML = `<div class="empty-documents">还没有上传文档。点击右上角“上传新 PDF”添加知识库。</div>`;
    return;
  }

  documentList.innerHTML = "";
  documents.forEach((doc) => {
    const card = window.document.createElement("article");
    card.className = `document-card${doc.active ? " active" : ""}`;
    card.innerHTML = `
      <div>
        <h4>${escapeHtml(doc.filename)}</h4>
        <p>${doc.chunks} 个知识片段 · ${escapeHtml(doc.preview || "暂无预览")}</p>
      </div>
      <div class="document-actions">
        <button type="button" data-action="activate" data-id="${doc.id}" ${doc.active ? "disabled" : ""}>
          ${doc.active ? "当前使用" : "设为当前"}
        </button>
        <button class="danger" type="button" data-action="delete" data-id="${doc.id}">删除</button>
      </div>
    `;
    documentList.appendChild(card);
  });
}

async function updateDocument(action, id) {
  const endpoint = action === "delete" ? "/api/documents/delete" : "/api/documents/activate";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id })
  });
  const data = await response.json();
  renderDocuments(data.documents || []);
}

document.querySelectorAll("[data-question]").forEach((button) => {
  button.addEventListener("click", () => {
    questionInput.value = button.dataset.question;
    questionInput.focus();
  });
});

navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    history.replaceState(null, "", link.getAttribute("href"));
    setView(link.dataset.view);
  });
});

newChatButton.addEventListener("click", createSession);

moreSessionsButton.addEventListener("click", () => {
  sessionList.scrollTo({ top: 0, behavior: "smooth" });
  renderSessions();
});

sessionList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  const { action, sessionId } = button.dataset;
  if (action === "delete") {
    button.disabled = true;
    deleteSession(sessionId);
  }
});

sessionList.addEventListener("keydown", (event) => {
  const input = event.target.closest(".session-title-input");
  if (!input) return;
  event.stopPropagation();
  const row = input.closest(".session-row");
  if (event.key === "Enter") {
    event.preventDefault();
    saveSessionTitle(row.dataset.sessionId, input.value);
  }
  if (event.key === "Escape") {
    event.preventDefault();
    cancelSessionTitleEdit();
  }
});

sessionList.addEventListener("focusout", (event) => {
  const input = event.target.closest(".session-title-input");
  if (!input || !editingSessionId) return;
  saveSessionTitle(input.closest(".session-row").dataset.sessionId, input.value);
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) uploadDocument(file);
});

knowledgeFileInput.addEventListener("change", () => {
  const file = knowledgeFileInput.files[0];
  if (file) uploadDocument(file);
});

refreshDocumentsButton.addEventListener("click", loadDocuments);

documentList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  updateDocument(button.dataset.action, button.dataset.id);
});

questionInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    askQuestion();
  }
});

askButton.addEventListener("click", askQuestion);
renderSessions();
renderConversation();
setView(location.hash === "#knowledge" ? "knowledge" : location.hash === "#settings" ? "settings" : "chat");
