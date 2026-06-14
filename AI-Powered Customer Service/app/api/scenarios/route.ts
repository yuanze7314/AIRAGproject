import { NextResponse } from "next/server";
import { demoScenarios } from "../../../lib/data/scenarios";

export async function GET() {
  return NextResponse.json(demoScenarios);
}
