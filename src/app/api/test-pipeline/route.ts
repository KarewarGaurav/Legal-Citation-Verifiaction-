import { NextResponse } from "next/server";
import { testCitationSafetyPipeline } from "@/lib/citation-safety-pipeline";

export async function GET() {
  const result = await testCitationSafetyPipeline();

  return NextResponse.json(result);
}
