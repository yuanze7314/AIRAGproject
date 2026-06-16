import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const scanTargets = [
  "knowledge",
  "data/knowledge-index.json",
  "data/demo-scenarios.json"
];

const textExtensions = new Set([".json", ".md"]);
const suspiciousPatterns = [
  { name: "replacement-question-run", pattern: /\?{4,}/u },
  { name: "replacement-character", pattern: /\uFFFD/u },
  { name: "private-use-mojibake", pattern: /[\uE000-\uF8FF]/u },
  {
    name: "common-chinese-mojibake",
    pattern: /鍟嗗搧|瑙勬牸|鑰虫|钃濈墮|涓诲|缁|淇濅慨|鍙戣揣|閫佽揪|璁㈠崟|鐘舵|鏅€氬|銆|锛|绋嬫垨/u
  }
];
const pausedImageEvidencePattern = /截图|录屏|照片|图片|拍照|实拍图|开箱视频|视频凭证/u;

async function collectFiles(target) {
  const absolute = path.join(repoRoot, target);
  const info = await stat(absolute);
  if (info.isFile()) return textExtensions.has(path.extname(absolute)) ? [absolute] : [];

  const entries = await readdir(absolute, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => collectFiles(path.join(target, entry.name))));
  return nested.flat();
}

function lineForIndex(text, index) {
  return text.slice(0, index).split(/\r?\n/u).length;
}

const files = (await Promise.all(scanTargets.map(collectFiles))).flat();
const findings = [];

for (const file of files) {
  const content = await readFile(file, "utf8");
  const relativeFile = path.relative(repoRoot, file);
  for (const { name, pattern } of suspiciousPatterns) {
    const match = pattern.exec(content);
    if (match) {
      findings.push({
        file: relativeFile,
        line: lineForIndex(content, match.index),
        rule: name,
        sample: match[0]
      });
    }
  }
  const normalizedFile = relativeFile.split(path.sep).join("/");
  if (normalizedFile.startsWith("knowledge/rules/") || normalizedFile === "data/knowledge-index.json") {
    const match = pausedImageEvidencePattern.exec(content);
    if (match) {
      findings.push({
        file: relativeFile,
        line: lineForIndex(content, match.index),
        rule: "image-evidence-request-paused",
        sample: match[0]
      });
    }
  }
}

assert.deepEqual(
  findings,
  [],
  `Knowledge text quality check failed:\n${findings.map((item) => `${item.file}:${item.line} ${item.rule} ${item.sample}`).join("\n")}`
);

const orchestrator = await readFile(path.join(repoRoot, "lib/agent/orchestrator.ts"), "utf8");
assert.match(orchestrator, /直播承诺或赠品权益/u, "Livestream dispute handoff copy should name the disputed promise scenario.");
assert.match(orchestrator, /不会直接确认主播承诺成立/u, "Livestream dispute handoff copy should avoid confirming the streamer promise.");
assert.match(orchestrator, /已为您转接人工客服/u, "Livestream dispute handoff copy should clearly transfer to human support.");

console.log("knowledge quality tests passed");
