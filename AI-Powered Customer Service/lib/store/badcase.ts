import { promises as fs } from "fs";
import path from "path";
import type { AgentGraphState, BadcaseRecord, RouteType } from "../types";

const filePath = path.join(process.cwd(), "data", "badcases.json");

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

export async function listBadcases(filters?: { type?: string; source?: string; traceId?: string; routeType?: string }) {
  let current: BadcaseRecord[];
  try {
    current = parseStore(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  return current.filter((record) => {
    if (filters?.type && record.badcaseType !== filters.type) return false;
    if (filters?.source && record.source !== filters.source) return false;
    if (filters?.traceId && record.traceId !== filters.traceId) return false;
    if (filters?.routeType && record.routeType !== filters.routeType) return false;
    return true;
  });
}

export async function saveBadcase(input: SaveBadcaseInput) {
  const current = await listBadcases();
  const record: BadcaseRecord = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    source: input.source ?? "manual",
    traceId: input.traceId ?? input.agentAnalysis.traceId,
    routeType: input.routeType ?? input.agentAnalysis.routeDecision?.routeType,
    ...input
  };
  current.unshift(record);
  await fs.writeFile(filePath, JSON.stringify(current, null, 2), "utf8");
  return record;
}

export async function saveAutoBadcase(input: Omit<SaveBadcaseInput, "source">) {
  return saveBadcase({ ...input, source: "auto" });
}
