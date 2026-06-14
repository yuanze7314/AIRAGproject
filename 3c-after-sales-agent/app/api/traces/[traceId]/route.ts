import { NextRequest, NextResponse } from "next/server";
import { getTraceRun } from "../../../../lib/store/trace";

export async function GET(_request: NextRequest, context: { params: Promise<{ traceId: string }> }) {
  const { traceId } = await context.params;
  const trace = await getTraceRun(traceId);

  if (!trace) {
    return NextResponse.json({ error: "trace not found" }, { status: 404 });
  }

  return NextResponse.json(trace);
}
