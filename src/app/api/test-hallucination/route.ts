import { NextResponse } from "next/server";
import { testHallucinationDetection } from "@/lib/hallucination-detector";

export async function GET() {
  const result = testHallucinationDetection();

  return NextResponse.json(result);
}
