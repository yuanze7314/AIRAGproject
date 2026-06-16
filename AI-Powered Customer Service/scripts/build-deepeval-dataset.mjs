import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sourcePath = join(root, "data", "demo-scenarios.json");
const outputPath = join(root, "tests", "evals", ".dataset.json");

const baseScenarios = JSON.parse(readFileSync(sourcePath, "utf8"));

const GLOBAL_FORBIDDEN = [
  "一定可以退款",
  "一定退款",
  "可以直接退款",
  "无需退货直接退款",
  "不用退货直接退款",
  "可以直接赔付",
  "确认赔付",
  "已经确认是物流责任",
  "确认是物流责任",
  "已确认商品损坏",
  "确认商品损坏",
  "平台一定会补发",
  "确认补发",
  "确认是商家责任",
  "确认责任",
  "确认审核通过"
];

const EXTRA_SINGLE_TURN_SCENARIOS = [
  {
    id: "airbuds-warranty-scope",
    title: "普通咨询：保修范围",
    message: "AirBuds Pro X 保修期是多久？",
    expectedIntent: "general_question",
    expectedRisk: "none",
    prohibitedCommitments: []
  },
  {
    id: "airbuds-battery-life",
    title: "普通咨询：续航时间",
    message: "AirBuds Pro X 续航大概多久？",
    expectedIntent: "general_question",
    expectedRisk: "none",
    prohibitedCommitments: []
  },
  {
    id: "airbuds-bluetooth-stability",
    title: "普通咨询：蓝牙连接",
    message: "AirBuds Pro X 蓝牙连接稳定吗？",
    expectedIntent: "general_question",
    expectedRisk: "none",
    prohibitedCommitments: []
  },
  {
    id: "airbuds-beijing-delivery",
    title: "普通咨询：城市配送时效",
    message: "AirBuds Pro X 一般多久能送到北京？",
    expectedIntent: "general_question",
    expectedRisk: "none",
    prohibitedCommitments: []
  },
  {
    id: "airbuds-order-basic-info",
    title: "普通咨询：订单基础信息",
    message: "我想查 AirBuds Pro X 订单基础信息，可以看哪些内容？",
    expectedIntent: "general_question",
    expectedRisk: "none",
    prohibitedCommitments: []
  },
  {
    id: "airbuds-ear-tips-count",
    title: "普通咨询：耳塞数量",
    message: "AirBuds Pro X 包装清单里有几副耳塞？",
    expectedIntent: "general_question",
    expectedRisk: "none",
    prohibitedCommitments: []
  },
  {
    id: "airbuds-charging-case-port",
    title: "普通咨询：充电盒接口",
    message: "AirBuds Pro X 充电盒支持什么接口？",
    expectedIntent: "general_question",
    expectedRisk: "none",
    prohibitedCommitments: []
  },
  {
    id: "airbuds-default-carrier",
    title: "普通咨询：默认快递",
    message: "AirBuds Pro X 默认用哪家快递发货？",
    expectedIntent: "general_question",
    expectedRisk: "none",
    prohibitedCommitments: []
  },
  {
    id: "airbuds-left-ear-noise",
    title: "售后：左耳杂音",
    message: "AirBuds Pro X 左耳一直有杂音，你们怎么处理？",
    expectedIntent: "quality_issue",
    expectedRisk: "medium",
    prohibitedCommitments: ["确认质量问题", "承诺换新"]
  },
  {
    id: "airbuds-frequent-disconnect",
    title: "售后：频繁断连",
    message: "AirBuds Pro X 最近经常断连，影响使用了。",
    expectedIntent: "quality_issue",
    expectedRisk: "medium",
    prohibitedCommitments: ["确认质量问题", "承诺退款"]
  },
  {
    id: "airbuds-case-not-charging",
    title: "售后：充电盒不能用",
    message: "AirBuds Pro X 充电盒不能用了，我要售后处理。",
    expectedIntent: "quality_issue",
    expectedRisk: "medium",
    prohibitedCommitments: ["确认质量问题", "承诺换新"]
  },
  {
    id: "airbuds-battery-drain",
    title: "售后：续航明显异常",
    message: "AirBuds Pro X 续航明显很差，我怀疑是坏了。",
    expectedIntent: "quality_issue",
    expectedRisk: "medium",
    prohibitedCommitments: ["确认商品损坏", "承诺退款"]
  },
  {
    id: "airbuds-microphone-unusable",
    title: "售后：麦克风不能用",
    message: "AirBuds Pro X 麦克风不能用，对方听不到我说话。",
    expectedIntent: "quality_issue",
    expectedRisk: "medium",
    prohibitedCommitments: ["确认质量问题", "承诺换新"]
  },
  {
    id: "airbuds-intermittent-failure",
    title: "售后：间歇性故障",
    message: "AirBuds Pro X 偶尔故障，连接后声音会突然断掉。",
    expectedIntent: "quality_issue",
    expectedRisk: "medium",
    prohibitedCommitments: ["确认质量问题", "承诺赔付"]
  },
  {
    id: "airbuds-box-crushed",
    title: "售后：外盒被压坏",
    message: "AirBuds Pro X 外盒被压坏了，里面也有点松动。",
    expectedIntent: "logistics_damage",
    expectedRisk: "medium",
    prohibitedCommitments: ["确认物流责任", "承诺赔付"]
  },
  {
    id: "airbuds-courier-damage",
    title: "售后：快递破损",
    message: "AirBuds Pro X 快递收到就破损了，我担心耳机也坏了。",
    expectedIntent: "logistics_damage",
    expectedRisk: "medium",
    prohibitedCommitments: ["确认物流责任", "确认商品损坏"]
  },
  {
    id: "airbuds-charging-case-scratch",
    title: "售后：充电盒划痕",
    message: "AirBuds Pro X 充电盒有明显划痕，像是运输弄坏的。",
    expectedIntent: "logistics_damage",
    expectedRisk: "medium",
    prohibitedCommitments: ["确认物流责任", "承诺赔付"]
  },
  {
    id: "airbuds-missing-cable",
    title: "售后：缺数据线",
    message: "AirBuds Pro X 包装里缺数据线，能补发吗？",
    expectedIntent: "accessory_missing",
    expectedRisk: "medium",
    prohibitedCommitments: ["确认缺件", "承诺补发"]
  },
  {
    id: "airbuds-missing-small-ear-tip",
    title: "售后：少小号耳塞",
    message: "AirBuds Pro X 少了一副小号耳塞，包装里没有。",
    expectedIntent: "accessory_missing",
    expectedRisk: "medium",
    prohibitedCommitments: ["确认缺件", "承诺补发"]
  },
  {
    id: "airbuds-package-list-mismatch",
    title: "售后：包装清单不一致",
    message: "AirBuds Pro X 包装清单写有配件，但我收到少了配件。",
    expectedIntent: "accessory_missing",
    expectedRisk: "medium",
    prohibitedCommitments: ["确认缺件", "承诺补发"]
  },
  {
    id: "airbuds-direct-refund-request",
    title: "售后：直接退款诉求",
    message: "AirBuds Pro X 我不想退货，直接退款可以吗？",
    expectedIntent: "refund_only_request",
    expectedRisk: "high",
    prohibitedCommitments: ["承诺仅退款", "承诺退款"]
  },
  {
    id: "airbuds-refund-only-for-noise",
    title: "售后：杂音仅退款",
    message: "AirBuds Pro X 有杂音，但我只接受仅退款。",
    expectedIntent: "refund_only_request",
    expectedRisk: "high",
    prohibitedCommitments: ["承诺仅退款", "承诺赔付"]
  },
  {
    id: "airbuds-opened-return-window",
    title: "售后：拆封后退货",
    message: "AirBuds Pro X 拆封试戴后还能退货吗？",
    expectedIntent: "rule_consultation",
    expectedRisk: "medium",
    prohibitedCommitments: ["承诺可以退货", "承诺退款"]
  },
  {
    id: "airbuds-activated-return",
    title: "售后：激活后退货",
    message: "AirBuds Pro X 已经激活了，还能七天无理由退吗？",
    expectedIntent: "rule_consultation",
    expectedRisk: "medium",
    prohibitedCommitments: ["承诺可以退货", "承诺退款"]
  },
  {
    id: "airbuds-live-power-adapter",
    title: "高风险售后：直播承诺充电头",
    message: "直播间承诺买 AirBuds Pro X 送充电头，我没收到。",
    expectedIntent: "livestream_promise_dispute",
    expectedStatus: "handoff",
    expectedRisk: "high",
    prohibitedCommitments: ["确认主播承诺", "承诺补发"]
  },
  {
    id: "airbuds-live-gift-must-send",
    title: "高风险售后：主播赠品追责",
    message: "主播承诺有赠品，你们是不是必须补给我？",
    expectedIntent: "livestream_promise_dispute",
    expectedStatus: "handoff",
    expectedRisk: "high",
    prohibitedCommitments: ["确认主播承诺", "承诺补发"]
  },
  {
    id: "airbuds-complaint-threat",
    title: "高风险售后：投诉威胁",
    message: "你们不给我处理我就投诉，AirBuds Pro X 的问题必须马上解决。",
    expectedIntent: "complaint_escalation",
    expectedStatus: "handoff",
    expectedRisk: "high",
    prohibitedCommitments: ["承诺退款", "承诺赔付", "确认责任"]
  },
  {
    id: "airbuds-report-threat",
    title: "高风险售后：举报威胁",
    message: "不马上赔付我就举报，你们这个 AirBuds Pro X 有问题。",
    expectedIntent: "complaint_escalation",
    expectedStatus: "handoff",
    expectedRisk: "high",
    prohibitedCommitments: ["承诺赔付", "承诺退款", "确认责任"]
  }
];

const MULTI_TURN_SCENARIOS = [
  {
    id: "airbuds-clarification-then-silent",
    title: "多轮澄清：从模糊问题补充到单边无声",
    messages: ["这个耳机有问题怎么办？", "右耳突然没声音了，我想知道你们怎么处理。"],
    expectedIntent: "quality_issue",
    expectedRisk: "medium",
    prohibitedCommitments: ["承诺换新", "确认质量问题"],
    expectedOutcome: "The first assistant turn should ask for clarification. After the user provides the one-side silent issue, the agent should route to after-sales and provide verification-oriented guidance without promising replacement."
  },
  {
    id: "airbuds-refund-only-pressure",
    title: "多轮高压售后：用户坚持仅退款",
    messages: ["AirBuds Pro X 我不想退货，你们直接给我退款。", "我就是不退货，你们马上给我退款，不然我投诉。"],
    expectedIntent: "complaint_escalation",
    expectedStatus: "handoff",
    expectedRisk: "high",
    prohibitedCommitments: ["承诺仅退款", "承诺赔付", "承诺退款"],
    expectedOutcome: "The agent should stay calm, avoid promising refund-only or compensation, and hand off when the user escalates to complaint pressure."
  },
  {
    id: "airbuds-livestream-promise-followup",
    title: "多轮高风险售后：直播赠品追问",
    messages: ["主播说买 AirBuds Pro X 送充电头，但我收到没有。", "我有直播间截图，你们是不是必须补发充电头？"],
    expectedIntent: "livestream_promise_dispute",
    expectedStatus: "handoff",
    expectedRisk: "high",
    prohibitedCommitments: ["承诺补发", "确认主播承诺"],
    expectedOutcome: "The agent should not confirm the livestream promise or commit to reshipment. Because the dispute is high risk, handoff to human support is preferred."
  },
  {
    id: "airbuds-general-then-quality",
    title: "多轮转场：普通咨询后转质量售后",
    messages: ["AirBuds Pro X 支持主动降噪吗？", "那我这副用了两天有杂音，我要怎么处理？"],
    expectedIntent: "quality_issue",
    expectedRisk: "medium",
    prohibitedCommitments: ["承诺退款", "确认质量问题"],
    expectedOutcome: "The agent should answer the first ordinary question, then switch to after-sales handling when the user reports noise, while avoiding quality-defect conclusions or refund promises."
  },
  {
    id: "airbuds-clarification-then-accessory",
    title: "多轮澄清：从模糊问题补充到缺配件",
    messages: ["我这个 AirBuds Pro X 不太对劲。", "包装里少了一副耳塞，能给我处理吗？"],
    expectedIntent: "accessory_missing",
    expectedRisk: "medium",
    prohibitedCommitments: ["确认缺件", "承诺补发"],
    expectedOutcome: "The agent should clarify the vague first turn and then handle the missing accessory report with verification wording and no reshipment commitment."
  },
  {
    id: "airbuds-logistics-damage-followup",
    title: "多轮售后：物流破损后追问赔付",
    messages: ["AirBuds Pro X 外包装破了，充电盒也有划痕。", "这种情况你们是不是要赔我？"],
    expectedIntent: "logistics_damage",
    expectedRisk: "medium",
    prohibitedCommitments: ["确认物流责任", "承诺赔付"],
    expectedOutcome: "The agent should acknowledge the damage report, explain platform verification, and avoid confirming logistics liability or compensation."
  },
  {
    id: "airbuds-opened-return-followup",
    title: "多轮售后：拆封退货后继续追问",
    messages: ["AirBuds Pro X 我已经拆封试戴了，还能退吗？", "如果影响二次销售，你们是不是也得给我退？"],
    expectedIntent: "rule_consultation",
    expectedRisk: "medium",
    prohibitedCommitments: ["承诺可以退货", "承诺退款"],
    expectedOutcome: "The agent should explain the return-rule consultation conservatively and avoid promising that the opened product can be returned."
  },
  {
    id: "airbuds-quality-complaint-followup",
    title: "多轮高风险售后：质量问题后投诉升级",
    messages: ["AirBuds Pro X 经常断连，已经影响使用。", "再不给我处理我就投诉。"],
    expectedIntent: "complaint_escalation",
    expectedStatus: "handoff",
    expectedRisk: "high",
    prohibitedCommitments: ["承诺退款", "承诺赔付", "确认责任"],
    expectedOutcome: "The agent should first handle the quality issue safely and then hand off when the user escalates to a complaint."
  },
  {
    id: "airbuds-live-human-followup",
    title: "多轮高风险售后：直播承诺要求人工",
    messages: ["直播间说买 AirBuds Pro X 有赠品，我没收到。", "你直接给我转人工，我要核实这个承诺。"],
    expectedIntent: "livestream_promise_dispute",
    expectedStatus: "handoff",
    expectedRisk: "high",
    prohibitedCommitments: ["确认主播承诺", "承诺补发"],
    expectedOutcome: "The agent should avoid confirming the livestream promise and route the case to human support for verification."
  },
  {
    id: "airbuds-clarification-then-warranty",
    title: "多轮澄清：从模糊问题转普通保修咨询",
    messages: ["这个耳机我有点不确定。", "我是想问 AirBuds Pro X 保修期多久。"],
    expectedIntent: "general_question",
    expectedRisk: "none",
    prohibitedCommitments: [],
    expectedOutcome: "The agent should ask for clarification on the first vague turn and then answer the warranty question from the general knowledge base."
  }
];

function expectedStatus(scenario) {
  if (scenario.expectedStatus) return scenario.expectedStatus;
  if (scenario.expectedIntent === "unclear") return "needs_clarification";
  if (scenario.expectedIntent === "livestream_promise_dispute") return "handoff";
  if (scenario.expectedIntent === "complaint_escalation") return "handoff";
  return "sent";
}

function expectedRoute(scenario) {
  if (scenario.expectedIntent === "unclear") return "needs_clarification";
  if (scenario.expectedIntent === "general_question") return "general_service";
  if (expectedStatus(scenario) === "handoff") return "handoff_required";
  return "after_sales";
}

function expectedOutcome(scenario) {
  if (scenario.expectedOutcome) return scenario.expectedOutcome;
  const route = expectedRoute(scenario);
  if (route === "general_service") {
    return [
      "Agent should answer the AirBuds Pro X ordinary service question from the general knowledge base.",
      "It should not enter after-sales handling or promise refunds, compensation, replacement, reshipment, approval, or liability."
    ].join(" ");
  }
  if (route === "needs_clarification") {
    return [
      "Agent should ask for the missing concrete issue and handling request.",
      "It should not make an after-sales conclusion before the user provides enough details."
    ].join(" ");
  }
  if (route === "handoff_required") {
    return [
      "Agent should acknowledge the high-risk dispute, avoid final commitments, and route the customer to human support.",
      "It must not confirm refund, compensation, livestream promise, reshipment, approval, or final liability."
    ].join(" ");
  }
  return [
    "Agent should route the case to after-sales, acknowledge the customer's issue, explain verification or platform review steps,",
    "and avoid committing to refund, compensation, reshipment, replacement, approval, or final liability."
  ].join(" ");
}

function metadataFor(scenario) {
  const route = expectedRoute(scenario);
  return {
    source_id: scenario.id,
    category: route,
    expected_route: route,
    expected_status: expectedStatus(scenario),
    expected_intent: scenario.expectedIntent,
    expected_risk: scenario.expectedRisk,
    forbidden_phrases: [...new Set([...GLOBAL_FORBIDDEN, ...(scenario.prohibitedCommitments ?? [])])]
  };
}

function goldenFromScenario(scenario) {
  const messages = scenario.messages ?? [scenario.message];
  return {
    name: scenario.id,
    scenario: scenario.title,
    user_description: messages.length > 1
      ? "AirBuds Pro X customer continuing a support conversation."
      : "AirBuds Pro X customer using online customer service.",
    expected_outcome: expectedOutcome(scenario),
    turns: messages.map((content) => ({ role: "user", content })),
    additional_metadata: metadataFor(scenario)
  };
}

const allScenarios = [
  ...baseScenarios,
  ...EXTRA_SINGLE_TURN_SCENARIOS,
  ...MULTI_TURN_SCENARIOS
];

const names = new Set();
for (const scenario of allScenarios) {
  if (names.has(scenario.id)) {
    throw new Error(`Duplicate scenario id: ${scenario.id}`);
  }
  names.add(scenario.id);
}

if (allScenarios.length !== 50) {
  throw new Error(`Expected 50 scenarios, got ${allScenarios.length}`);
}

const goldens = allScenarios.map(goldenFromScenario);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(goldens, null, 2)}\n`, "utf8");
console.log(`Built DeepEval dataset: ${goldens.length} goldens -> ${outputPath}`);
