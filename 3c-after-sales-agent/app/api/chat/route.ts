import { NextRequest, NextResponse } from "next/server";
import { recordGraphBadcases, runAgentGraph } from "../../../lib/agent/orchestrator";
import { saveTraceRun } from "../../../lib/store/trace";
import type { ChatApiResponse, ConversationMessage } from "../../../lib/types";

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    conversationId?: string;
    content?: string;
    images?: string[];
    history?: ConversationMessage[];
  };

  if (!body.content?.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const result: ChatApiResponse = await runAgentGraph({
    conversationId: body.conversationId,
    content: body.content,
    images: body.images,
    history: body.history
  });
  await saveTraceRun(result);
  await recordGraphBadcases(result);

  return NextResponse.json(result);
}
