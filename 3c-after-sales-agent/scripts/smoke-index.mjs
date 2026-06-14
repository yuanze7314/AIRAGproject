import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const index = JSON.parse(await readFile(path.join(root, "data", "knowledge-index.json"), "utf8"));

if (!Array.isArray(index.chunks) || index.chunks.length < 10) {
  throw new Error(`Expected at least 10 knowledge chunks, got ${index.chunks?.length ?? 0}`);
}

const hasGeneral = index.chunks.some((chunk) => chunk.metadata?.knowledgeBase === "general");
const hasRules = index.chunks.some((chunk) => chunk.metadata?.knowledgeBase === "after_sales");
const allHaveEmbeddings = index.chunks.every((chunk) => Array.isArray(chunk.embedding) && chunk.embedding.length === 32);

if (!hasGeneral) throw new Error("Knowledge index has no general chunks");
if (!hasRules) throw new Error("Knowledge index has no after-sales rule chunks");
if (!allHaveEmbeddings) throw new Error("Some knowledge chunks are missing 32-d lexical embeddings");

console.log(JSON.stringify({
  chunks: index.chunks.length,
  hasGeneral,
  hasRules,
  allHaveEmbeddings
}, null, 2));
