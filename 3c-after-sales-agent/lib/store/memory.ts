import { promises as fs } from "fs";
import path from "path";
import type { ConversationMemoryRecord, ConversationMessage, FinalAction, RouteType } from "../types";

const memoryPath = path.join(process.cwd(), "data", "memories.json");
const COMPRESS_AFTER_DAYS = 7;
const CLEAR_DETAILS_AFTER_DAYS = 30;

type MemoryStore = Record<string, ConversationMemoryRecord>;

type LoadMemoryInput = {
  conversationId: string;
  ticketId: string;
  messages: ConversationMessage[];
  history: ConversationMessage[];
};

type SaveOutcomeInput = {
  memory: ConversationMemoryRecord;
  messages: ConversationMessage[];
  finalMessage: string;
  finalAction: FinalAction;
  routeType?: RouteType;
  handoffReason?: string;
  missingFields?: string[];
};

function parseJsonStore(content: string): MemoryStore {
  return JSON.parse(content.replace(/^\uFEFF/, "")) as MemoryStore;
}

async function readStore(): Promise<MemoryStore> {
  try {
    const content = await fs.readFile(memoryPath, "utf8");
    return parseJsonStore(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

async function writeStore(store: MemoryStore) {
  await fs.writeFile(memoryPath, JSON.stringify(store, null, 2), "utf8");
}

function daysSince(timestamp?: string) {
  if (!timestamp) return 0;
  const time = new Date(timestamp).getTime();
  if (Number.isNaN(time)) return 0;
  return Math.floor((Date.now() - time) / 86400000);
}

function summarizeMessages(messages: ConversationMessage[]) {
  if (!messages.length) return "无可压缩的历史消息。";
  const latest = messages.slice(-4).map((message) => `${message.role}: ${message.content}`).join(" / ");
  return `历史会话已压缩，共 ${messages.length} 条详细消息。最近上下文：${latest}`;
}

function applyLifecycle(record: ConversationMemoryRecord): ConversationMemoryRecord {
  const ageDays = daysSince(record.lastUpdatedAt);
  const now = new Date().toISOString();

  if (ageDays >= CLEAR_DETAILS_AFTER_DAYS) {
    return {
      ...record,
      rawMessages: [],
      actionHistory: record.actionHistory.slice(-3),
      compressedSummary: `详细记忆已按 ${CLEAR_DETAILS_AFTER_DAYS} 天策略清理，仅保留演示级摘要和最近动作。`,
      compressedAt: record.compressedAt ?? now,
      expiresAt: now
    };
  }

  if (ageDays >= COMPRESS_AFTER_DAYS && record.rawMessages.length) {
    return {
      ...record,
      rawMessages: [],
      actionHistory: record.actionHistory.slice(-6),
      compressedSummary: summarizeMessages(record.rawMessages),
      compressedAt: now
    };
  }

  return record;
}

function actionHistoryFrom(history: ConversationMessage[]) {
  return history
    .filter((message) => message.role !== "user")
    .slice(-6)
    .map((message) => message.content);
}

export async function loadConversationMemory(input: LoadMemoryInput): Promise<ConversationMemoryRecord> {
  const store = await readStore();
  const stored = store[input.conversationId] ? applyLifecycle(store[input.conversationId]) : undefined;
  if (stored) {
    store[input.conversationId] = stored;
    await writeStore(store);
  }
  const rawMessages = [...(stored?.rawMessages ?? []), ...input.messages]
    .filter((message, index, all) => all.findIndex((candidate) => candidate.id === message.id) === index)
    .slice(-24);
  const actionHistory = [...(stored?.actionHistory ?? []), ...actionHistoryFrom(input.history)].slice(-10);

  return {
    conversationId: input.conversationId,
    ticketId: input.ticketId,
    rawMessages,
    actionHistory,
    compressedSummary: stored?.compressedSummary ?? (input.history.length ? `已有 ${input.history.length} 条历史消息，本轮会注入最近对话和已采取措施。` : "暂无历史记忆，本轮从当前输入开始。"),
    lastUpdatedAt: stored?.lastUpdatedAt ?? new Date().toISOString(),
    compressedAt: stored?.compressedAt,
    expiresAt: stored?.expiresAt
  };
}

export async function saveConversationMemoryOutcome(input: SaveOutcomeInput): Promise<ConversationMemoryRecord> {
  const store = await readStore();
  const createdAt = new Date().toISOString();
  const agentMessage: ConversationMessage = {
    id: crypto.randomUUID(),
    role: "agent",
    content: input.finalMessage,
    createdAt
  };
  const action = input.finalAction === "handoff"
    ? `已转人工：${input.handoffReason ?? "需要人工继续处理"}`
    : `已自动回复：${input.routeType ?? "unknown"}`;
  const routeAction = `route=${input.routeType ?? "unknown"}; action=${input.finalAction}; needs_clarification_fields=${(input.missingFields ?? []).join("|")}`;
  const rawMessages = [...input.messages, agentMessage].slice(-24);
  const actionHistory = [...input.memory.actionHistory, action, routeAction].slice(-14);
  const updated: ConversationMemoryRecord = {
    ...input.memory,
    rawMessages,
    actionHistory,
    compressedSummary: rawMessages.length > 1 ? `当前会话已有 ${rawMessages.length} 条消息，最近动作：${action}` : input.memory.compressedSummary,
    lastUpdatedAt: createdAt
  };

  store[input.memory.conversationId] = updated;
  await writeStore(store);
  return updated;
}
