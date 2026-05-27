import { NextResponse } from "next/server";

/**
 * GET/POST /api/indian-kanoon
 * Proxies Indian Kanoon API for case lookup and citation validation.
 * @placeholder — implement Kanoon API client with INDIAN_KANOON_API_KEY
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  return NextResponse.json({
    success: false,
    error: "Indian Kanoon route not implemented",
    query: Object.fromEntries(searchParams),
  }, { status: 501 });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  return NextResponse.json({
    success: false,
    error: "Indian Kanoon route not implemented",
    received: body,
  }, { status: 501 });
}
