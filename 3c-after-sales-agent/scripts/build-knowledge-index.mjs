import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "data", "knowledge-index.json");

function normalize(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function tokenize(text) {
  const normalized = normalize(text);
  const words = normalized.split(/\s+/).filter(Boolean);
  const cjkChars = Array.from(normalized).filter((char) => /\p{Script=Han}/u.test(char));
  const cjkBigrams = cjkChars.slice(0, -1).map((char, index) => `${char}${cjkChars[index + 1]}`);
  return [...new Set([...words, ...cjkChars, ...cjkBigrams])];
}

function lexicalEmbedding(text, dimensions = 32) {
  const vector = Array.from({ length: dimensions }, () => 0);
  for (const token of tokenize(text)) {
    let hash = 0;
    for (const char of token) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    vector[Math.abs(hash) % dimensions] += 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value ** 2, 0));
  return norm ? vector.map((value) => Number((value / norm).toFixed(6))) : vector;
}

function markdownTitle(content, fallback) {
  const titleLine = content.split(/\r?\n/).find((line) => line.startsWith("# "));
  return titleLine?.replace(/^#\s+/, "").trim() || fallback;
}

function markdownBody(content) {
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith("#"))
    .join("\n")
    .trim();
}

async function loadGeneralChunks(updatedAt) {
  const generalPath = path.join(root, "knowledge", "general", "general-service-kb.json");
  const docs = JSON.parse(await fs.readFile(generalPath, "utf8"));
  return docs.map((doc) => ({
    id: `general:${doc.docId}`,
    text: doc.content,
    embedding: lexicalEmbedding(`${doc.title} ${doc.content} ${(doc.keywords ?? []).join(" ")}`),
    title: doc.title,
    source: "knowledge/general/general-service-kb.json",
    category: doc.category,
    metadata: {
      knowledgeBase: "general",
      docId: doc.docId,
      keywords: doc.keywords ?? []
    },
    updatedAt
  }));
}

async function loadRuleChunks(updatedAt) {
  const rulesDir = path.join(root, "knowledge", "rules");
  const files = (await fs.readdir(rulesDir)).filter((file) => file.endsWith(".md"));
  return Promise.all(files.map(async (file) => {
    const source = `knowledge/rules/${file}`;
    const content = await fs.readFile(path.join(rulesDir, file), "utf8");
    const id = file.replace(/\.md$/, "");
    const title = markdownTitle(content, id);
    const text = markdownBody(content);
    return {
      id: `rules:${id}`,
      text,
      embedding: lexicalEmbedding(`${title} ${text}`),
      title,
      source,
      category: id,
      metadata: {
        knowledgeBase: "after_sales",
        ruleId: id
      },
      updatedAt
    };
  }));
}

const updatedAt = new Date().toISOString();
const chunks = [...await loadGeneralChunks(updatedAt), ...await loadRuleChunks(updatedAt)];
await fs.writeFile(outputPath, `${JSON.stringify({ updatedAt, chunks }, null, 2)}\n`, "utf8");
console.log(`Knowledge index built: ${chunks.length} chunks -> ${path.relative(root, outputPath)}`);
