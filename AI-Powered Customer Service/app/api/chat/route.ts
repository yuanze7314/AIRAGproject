import { NextRequest, NextResponse } from "next/server";
import { traceSaveTool } from "../../../lib/agent/graph/tools";
import { recordGraphBadcases, runAgentGraph } from "../../../lib/agent/orchestrator";
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
  await traceSaveTool(result);
  await recordGraphBadcases(result);

  return NextResponse.json(result);
}
