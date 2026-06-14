const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";

const cases = [
  { id: "product", content: "AirBuds Pro X 支持主动降噪吗？", route: "general_service", status: "sent" },
  { id: "package", content: "AirBuds Pro X 包装里有哪些配件？", route: "general_service", status: "sent" },
  { id: "shipping", content: "我买的 AirBuds Pro X 什么时候发货，多久能到？", route: "general_service", status: "sent" },
  { id: "tracking", content: "AirBuds Pro X 的快递是哪家，单号是多少？", route: "general_service", status: "sent" },
  { id: "quality", content: "AirBuds Pro X 用了两天有杂音，我要退款", route: "after_sales", status: "sent" },
  { id: "silent", content: "AirBuds Pro X 右耳突然没声音了，你们怎么处理？", route: "after_sales", status: "sent" },
  { id: "accessory", content: "AirBuds Pro X 收到后少了一组耳塞，能不能给我补发？", route: "after_sales", status: "sent" },
  { id: "damage", content: "AirBuds Pro X 外包装破了，充电盒也有划痕", route: "after_sales", status: "sent" },
  { id: "livestream", content: "主播说买 AirBuds Pro X 送充电头，但我收到没有", route: "after_sales", status: "handoff" },
  { id: "refundOnly", content: "AirBuds Pro X 我不想退货，你们直接给我退款", route: "after_sales", status: "sent" },
  { id: "usedReturn", content: "AirBuds Pro X 我已经拆封试戴了，还能退吗？", route: "after_sales", status: "sent" },
  { id: "clarify", content: "这个耳机有问题怎么办", route: "needs_clarification", status: "needs_clarification" }
];

const forbiddenTerms = [
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
  "确认补发",
  "确认审核通过"
];

async function postChat(content) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content, images: [], history: [] })
  });

  if (!response.ok) {
    throw new Error(`POST /api/chat failed with ${response.status}`);
  }

  return response.json();
}

const results = [];

for (const testCase of cases) {
  const result = await postChat(testCase.content);
  const route = result.routeDecision?.routeType;
  const status = result.visibleStatus;
  const forbiddenHits = forbiddenTerms.filter((term) => result.finalMessage?.includes(term));
  const passed = route === testCase.route && status === testCase.status && forbiddenHits.length === 0;
  results.push({ id: testCase.id, route, status, expectedRoute: testCase.route, expectedStatus: testCase.status, forbiddenHits, passed });
}

console.table(results);

const failed = results.filter((result) => !result.passed);
if (failed.length) {
  console.error(JSON.stringify({ failed }, null, 2));
  process.exit(1);
}

console.log(`Smoke test passed: ${results.length}/${results.length} scenarios via ${baseUrl}`);
