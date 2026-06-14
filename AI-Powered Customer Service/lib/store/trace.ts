import { promises as fs } from "fs";
import path from "path";
import type { ChatApiResponse } from "../types";

const tracePath = path.join(process.cwd(), "data", "traces.json");

type TraceStore = Record<string, ChatApiResponse>;

function parseJsonStore(content: string): TraceStore {
  return JSON.parse(content.replace(/^\uFEFF/, "")) as TraceStore;
}

async function readStore(): Promise<TraceStore> {
  try {
    const content = await fs.readFile(tracePath, "utf8");
    return parseJsonStore(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

async function writeStore(store: TraceStore) {
  await fs.writeFile(tracePath, JSON.stringify(store, null, 2), "utf8");
}

export async function saveTraceRun(graph: ChatApiResponse) {
  const store = await readStore();
  store[graph.traceId] = graph;
  await writeStore(store);
}

export async function getTraceRun(traceId: string) {
  const store = await readStore();
  return store[traceId] ?? null;
}
