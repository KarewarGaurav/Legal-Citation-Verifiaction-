import { NextResponse } from "next/server";
import { normalizeSections } from "@/lib/section-normalizer";

/**
 * POST /api/normalize-sections
 * Normalizes statute section references in legal text.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const text =
    typeof body === "object" &&
    body !== null &&
    "text" in body &&
    typeof (body as { text: unknown }).text === "string"
      ? (body as { text: string }).text
      : "";

  if (!text.trim()) {
    return NextResponse.json(
      { success: false, error: "Request body must include a non-empty `text` field" },
      { status: 400 }
    );
  }

  try {
    const result = await normalizeSections(text);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Section normalization failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
