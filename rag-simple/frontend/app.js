const questionInput = document.querySelector("#question");
const answerEl = document.querySelector("#answer");
const sourcesEl = document.querySelector("#sources");
const askButton = document.querySelector("#ask-button");
const fileInput = document.querySelector("#document-file");
const fileName = document.querySelector("#file-name");
const modeBadge = document.querySelector("#mode-badge");
const nextActionEl = document.querySelector("#next-action");
const confidenceEl = document.querySelector("#confidence");

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
  const matched = fallbackAnswers.find((item) =>
    item.keywords.some((keyword) => question.includes(keyword))
  );

  return matched || {
    answer: "您好，我没有在当前演示知识库中找到完全匹配的信息。建议转人工客服进一步核实；真实 RAG 接口接入后，可召回更多文档片段再生成回复。",
    sources: ["mock · 后续接入 src/rag_simple/main.py 的 ask_with_rag"],
    action: "建议转人工客服，并补充客户上下文。",
    confidence: "低"
  };
}

async function askQuestion() {
  const question = questionInput.value.trim();
  if (!question) {
    answerEl.textContent = "请先输入一个问题。";
    return;
  }

  askButton.disabled = true;
  askButton.textContent = "检索生成中...";
  answerEl.textContent = "正在检索客服知识库并生成回复...";

  try {
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question })
    });

    if (!response.ok) {
      throw new Error("API unavailable");
    }

    const data = await response.json();
    renderAnswer(data);
  } catch (error) {
    const data = getMockAnswer(question);
    renderAnswer({ ...data, mode: "Mock" });
  } finally {
    askButton.disabled = false;
    askButton.textContent = "生成客服回复";
  }
}

function renderAnswer(data) {
  answerEl.textContent = data.answer;
  sourcesEl.textContent = data.sources.join(" / ");
  modeBadge.textContent = data.mode || "RAG";
  nextActionEl.textContent = data.action || "建议人工复核后发送。";
  confidenceEl.textContent = data.confidence === "高" ? "92%" : data.confidence === "中" ? "76%" : "48%";
}

document.querySelectorAll("[data-question]").forEach((button) => {
  button.addEventListener("click", () => {
    questionInput.value = button.dataset.question;
    questionInput.focus();
  });
});

fileInput.addEventListener("change", () => {
  const selected = fileInput.files[0];
  fileName.textContent = selected
    ? `${selected.name} 已选择，当前演示仍使用 mock/后端接口处理`
    : "当前演示默认使用企业制度知识库";
});

askButton.addEventListener("click", askQuestion);
