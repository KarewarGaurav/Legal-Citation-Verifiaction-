import { NextResponse } from "next/server";
import { testCitationVerification } from "@/lib/citation-verifier";

export async function GET() {
  const result = await testCitationVerification();

  return NextResponse.json(result);
}
