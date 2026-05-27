import { NextResponse } from "next/server";
import { testSectionNormalization } from "@/lib/section-normalizer";

export async function GET() {
  try {
    const result = await testSectionNormalization();
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Section normalization test failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
