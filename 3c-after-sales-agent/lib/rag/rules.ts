import { promises as fs } from "fs";
import path from "path";
import type { RuleHit } from "../types";

const ruleFiles = [
  { id: "c3c-activation-return", category: "rule_consultation", relevanceScore: 0.88 },
  { id: "quality-issue", category: "quality_issue", relevanceScore: 0.84 },
  { id: "logistics-damage", category: "logistics_damage", relevanceScore: 0.82 },
  { id: "livestream-promise", category: "livestream_promise_dispute", relevanceScore: 0.86 },
  { id: "refund-only", category: "refund_only_request", relevanceScore: 0.9 },
  { id: "accessory-missing", category: "accessory_missing", relevanceScore: 0.8 },
  { id: "platform-after-sales", category: "platform_rule", relevanceScore: 0.72 }
];

function titleFromMarkdown(content: string, fallback: string) {
  const titleLine = content.split(/\r?\n/).find((line) => line.startsWith("# "));
  return titleLine?.replace(/^#\s+/, "").trim() || fallback;
}

function summaryFromMarkdown(content: string) {
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith("#"))
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 220);
}

export async function loadAfterSalesRules(): Promise<RuleHit[]> {
  return Promise.all(ruleFiles.map(async (rule) => {
    const filePath = path.join(process.cwd(), "knowledge", "rules", `${rule.id}.md`);
    const content = await fs.readFile(filePath, "utf8");
    return {
      ruleId: rule.id,
      title: titleFromMarkdown(content, rule.id),
      summary: summaryFromMarkdown(content),
      category: rule.category,
      relevanceScore: rule.relevanceScore
    };
  }));
}
