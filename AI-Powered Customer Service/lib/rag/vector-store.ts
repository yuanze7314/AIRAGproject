import { promises as fs } from "fs";
import path from "path";

export type VectorChunk = {
  id: string;
  text: string;
  embedding: number[];
  title: string;
  source: string;
  category: string;
  metadata?: Record<string, string | number | boolean | string[]>;
  updatedAt: string;
};

export type VectorSearchFilter = {
  category?: string;
  source?: string;
  metadata?: Record<string, string | number | boolean>;
};

export type VectorSearchResult = VectorChunk & {
  score: number;
};

export interface VectorStore {
  readonly kind: "memory" | "lancedb";
  upsertChunks(chunks: VectorChunk[]): Promise<void>;
  searchEmbedding(queryEmbedding: number[], topK: number, filter?: VectorSearchFilter): Promise<VectorSearchResult[]>;
  deleteBySource(sourceId: string): Promise<void>;
  rebuildIndex(chunks: VectorChunk[]): Promise<void>;
}

function cosineSimilarity(a: number[], b: number[]) {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    aNorm += a[index] ** 2;
    bNorm += b[index] ** 2;
  }
  if (!aNorm || !bNorm) return 0;
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

function matchesFilter(chunk: VectorChunk, filter?: VectorSearchFilter) {
  if (!filter) return true;
  if (filter.category && chunk.category !== filter.category) return false;
  if (filter.source && chunk.source !== filter.source) return false;
  if (!filter.metadata) return true;
  return Object.entries(filter.metadata).every(([key, value]) => chunk.metadata?.[key] === value);
}

export class InMemoryVectorStore implements VectorStore {
  readonly kind = "memory" as const;

  private chunks = new Map<string, VectorChunk>();

  async upsertChunks(chunks: VectorChunk[]) {
    for (const chunk of chunks) {
      this.chunks.set(chunk.id, chunk);
    }
  }

  async searchEmbedding(queryEmbedding: number[], topK: number, filter?: VectorSearchFilter) {
    return Array.from(this.chunks.values())
      .filter((chunk) => matchesFilter(chunk, filter))
      .map((chunk) => ({ ...chunk, score: cosineSimilarity(queryEmbedding, chunk.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  async deleteBySource(sourceId: string) {
    for (const [id, chunk] of this.chunks.entries()) {
      if (chunk.source === sourceId) this.chunks.delete(id);
    }
  }

  async rebuildIndex(chunks: VectorChunk[]) {
    this.chunks.clear();
    await this.upsertChunks(chunks);
  }
}

export class LanceDBVectorStore implements VectorStore {
  readonly kind = "lancedb" as const;

  constructor(
    private readonly dbPath = process.env.LANCEDB_PATH ?? path.join(process.cwd(), "data", "lancedb"),
    private readonly tableName = process.env.LANCEDB_TABLE ?? "knowledge_chunks"
  ) {}

  private async table(mode: "open" | "overwrite" = "open", chunks: VectorChunk[] = []) {
    const lancedb = await importLanceDB();
    await fs.mkdir(this.dbPath, { recursive: true });
    const db = await lancedb.connect(this.dbPath);
    if (mode === "overwrite") {
      return db.createTable(this.tableName, chunks.map(chunkToRow), { mode: "overwrite" });
    }
    try {
      return await db.openTable(this.tableName);
    } catch {
      return db.createTable(this.tableName, chunks.map(chunkToRow), { mode: "overwrite" });
    }
  }

  async upsertChunks(chunks: VectorChunk[]): Promise<void> {
    if (!chunks.length) return;
    const table = await this.table("open", chunks);
    await table.add(chunks.map(chunkToRow));
  }

  async searchEmbedding(queryEmbedding: number[], topK: number, filter?: VectorSearchFilter): Promise<VectorSearchResult[]> {
    const table = await this.table();
    let query = table.search(queryEmbedding).limit(topK * 4);
    const rows = await query.toArray() as LanceRow[];
    return rows
      .map(rowToChunk)
      .filter((chunk) => matchesFilter(chunk, filter))
      .slice(0, topK);
  }

  async deleteBySource(sourceId: string): Promise<void> {
    const table = await this.table();
    await table.delete(`source = '${sourceId.replace(/'/g, "''")}'`);
  }

  async rebuildIndex(chunks: VectorChunk[]): Promise<void> {
    await this.table("overwrite", chunks);
  }
}

async function importLanceDB() {
  const runtimeImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<typeof import("@lancedb/lancedb")>;
  return runtimeImport("@lancedb/lancedb");
}

export function createVectorStore(kind: "memory" | "lancedb" = "memory"): VectorStore {
  if (kind === "lancedb") return new LanceDBVectorStore();
  return new InMemoryVectorStore();
}

type LanceRow = {
  id: string;
  text: string;
  vector: number[];
  title: string;
  source: string;
  category: string;
  metadataJson: string;
  updatedAt: string;
  _distance?: number;
};

function chunkToRow(chunk: VectorChunk): LanceRow {
  return {
    id: chunk.id,
    text: chunk.text,
    vector: chunk.embedding,
    title: chunk.title,
    source: chunk.source,
    category: chunk.category,
    metadataJson: JSON.stringify(chunk.metadata ?? {}),
    updatedAt: chunk.updatedAt
  };
}

function rowToChunk(row: LanceRow): VectorSearchResult {
  let metadata: VectorChunk["metadata"] = {};
  try {
    metadata = JSON.parse(row.metadataJson || "{}") as VectorChunk["metadata"];
  } catch {
    metadata = {};
  }
  return {
    id: row.id,
    text: row.text,
    embedding: row.vector,
    title: row.title,
    source: row.source,
    category: row.category,
    metadata,
    updatedAt: row.updatedAt,
    score: typeof row._distance === "number" ? 1 / (1 + row._distance) : 0
  };
}

export async function loadKnowledgeIndexChunks(indexPath = path.join(process.cwd(), "data", "knowledge-index.json")): Promise<VectorChunk[]> {
  const content = await fs.readFile(indexPath, "utf8");
  const index = JSON.parse(content) as { chunks: VectorChunk[] };
  return index.chunks ?? [];
}

export async function createInMemoryVectorStoreFromIndex(indexPath?: string) {
  const store = new InMemoryVectorStore();
  await store.rebuildIndex(await loadKnowledgeIndexChunks(indexPath));
  return store;
}

export async function createConfiguredVectorStoreFromIndex(indexPath?: string): Promise<VectorStore> {
  const chunks = await loadKnowledgeIndexChunks(indexPath);
  const preferred = process.env.RAG_VECTOR_STORE === "lancedb" ? "lancedb" : "memory";
  const store = createVectorStore(preferred);
  try {
    await store.rebuildIndex(chunks);
    return store;
  } catch {
    const fallback = new InMemoryVectorStore();
    await fallback.rebuildIndex(chunks);
    return fallback;
  }
}
