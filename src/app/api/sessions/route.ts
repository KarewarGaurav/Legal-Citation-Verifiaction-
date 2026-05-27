import { NextResponse } from "next/server";
import {
  getRecentCitationSessions,
  type CitationSessionRecord,
} from "@/lib/session-store";
import type { ApiResponse } from "@/lib/types";

export interface SessionsListApiData {
  sessions: CitationSessionRecord[];
}

/**
 * GET /api/sessions?limit=50
 * Returns recent citation sessions (newest first).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const parsed = limitParam ? Number.parseInt(limitParam, 10) : NaN;
  const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : 50;

  try {
    const sessions = await getRecentCitationSessions(limit);
    return NextResponse.json<ApiResponse<SessionsListApiData>>({
      success: true,
      data: { sessions },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load sessions";
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
