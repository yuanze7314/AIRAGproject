import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

const ruleIds = [
  "platform-after-sales",
  "c3c-activation-return",
  "quality-issue",
  "accessory-missing",
  "logistics-damage",
  "livestream-promise",
  "refund-only"
];

function titleFromMarkdown(content: string, fallback: string) {
  const titleLine = content.split(/\r?\n/).find((line) => line.startsWith("# "));
  return titleLine?.replace(/^#\s+/, "").trim() || fallback;
}

export async function GET() {
  const rules = await Promise.all(ruleIds.map(async (id) => {
    const filePath = path.join(process.cwd(), "knowledge", "rules", `${id}.md`);
    const content = await fs.readFile(filePath, "utf8");
    return {
      id,
      title: titleFromMarkdown(content, id),
      content,
      source: `knowledge/rules/${id}.md`
    };
  }));

  return NextResponse.json({ rules });
}
