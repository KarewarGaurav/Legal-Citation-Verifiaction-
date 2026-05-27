import { NextResponse } from "next/server";
import { testCitationExtraction } from "@/lib/citation-extractor";

export async function GET() {
  const result = await testCitationExtraction();

  return NextResponse.json(result);
}
