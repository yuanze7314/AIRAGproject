import { NextRequest, NextResponse } from "next/server";
import { traceSaveTool } from "../../../../lib/agent/graph/tools";
import { recordGraphBadcases, runAgentGraph } from "../../../../lib/agent/orchestrator";
import type { ChatApiResponse, ConversationMessage } from "../../../../lib/types";

export const runtime = "nodejs";

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

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
  const content = body.content;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sse(event, data)));
      };

      try {
        send("ready", { createdAt: new Date().toISOString() });
        const result: ChatApiResponse = await runAgentGraph({
          conversationId: body.conversationId,
          content,
          images: body.images,
          history: body.history
        }, {
          onRuntimeEvent: (event) => send("runtime", event)
        });

        await traceSaveTool(result);
        await recordGraphBadcases(result);
        send("final", result);
      } catch (error) {
        send("error", { message: errorMessage(error), createdAt: new Date().toISOString() });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
