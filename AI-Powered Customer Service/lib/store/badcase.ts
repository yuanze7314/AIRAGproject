import { promises as fs } from "fs";
import path from "path";
import type { AgentGraphState, BadcaseRecord, RouteType } from "../types";

const fixturePath = path.join(process.cwd(), "data", "badcases.json");
const runtimePath = path.join(process.cwd(), "data", "badcases.local.json");

type SaveBadcaseInput = {
  userMessage: string;
  agentAnalysis: AgentGraphState;
  badcaseType: string;
  note: string;
  source?: "manual" | "auto";
  traceId?: string;
  routeType?: RouteType;
};

function parseStore(content: string): BadcaseRecord[] {
  return JSON.parse(content.replace(/^\uFEFF/, "")) as BadcaseRecord[];
}

async function readStore(filePath: string): Promise<BadcaseRecord[]> {
  try {
    return parseStore(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeRuntimeStore(records: BadcaseRecord[]) {
  await fs.mkdir(path.dirname(runtimePath), { recursive: true });
  await fs.writeFile(runtimePath, JSON.stringify(records, null, 2), "utf8");
}

export async function listBadcases(filters?: { type?: string; source?: string; traceId?: string; routeType?: string }) {
  const current = [
    ...await readStore(runtimePath),
    ...await readStore(fixturePath)
  ];

  return current.filter((record) => {
    if (filters?.type && record.badcaseType !== filters.type) return false;
    if (filters?.source && record.source !== filters.source) return false;
    if (filters?.traceId && record.traceId !== filters.traceId) return false;
    if (filters?.routeType && record.routeType !== filters.routeType) return false;
    return true;
  });
}

export async function saveBadcase(input: SaveBadcaseInput) {
  const current = await readStore(runtimePath);
  const record: BadcaseRecord = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    source: input.source ?? "manual",
    traceId: input.traceId ?? input.agentAnalysis.traceId,
    routeType: input.routeType ?? input.agentAnalysis.routeDecision?.routeType,
    ...input
  };
  current.unshift(record);
  await writeRuntimeStore(current);
  return record;
}

export async function saveAutoBadcase(input: Omit<SaveBadcaseInput, "source">) {
  return saveBadcase({ ...input, source: "auto" });
}
