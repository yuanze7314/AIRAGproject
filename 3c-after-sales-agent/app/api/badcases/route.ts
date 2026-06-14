import { NextRequest, NextResponse } from "next/server";
import { listBadcases, saveBadcase } from "../../../lib/store/badcase";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const record = await saveBadcase({ ...body, source: body.source ?? "manual" });
  return NextResponse.json(record);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const current = await listBadcases({
    type: params.get("type") ?? undefined,
    source: params.get("source") ?? undefined,
    traceId: params.get("traceId") ?? undefined,
    routeType: params.get("routeType") ?? undefined
  });
  return NextResponse.json(current);
}
