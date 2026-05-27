import { NextResponse } from "next/server";
import {
  deleteCitationSession,
  getCitationSessionById,
  type CitationSessionRecord,
} from "@/lib/session-store";
import type { ApiResponse } from "@/lib/types";

export interface SessionDetailApiData {
  session: CitationSessionRecord;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** GET /api/sessions/[id] — fetch a single session by id. */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const session = await getCitationSessionById(id);
    if (!session) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Session not found" },
        { status: 404 }
      );
    }
    return NextResponse.json<ApiResponse<SessionDetailApiData>>({
      success: true,
      data: { session },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load session";
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

/** DELETE /api/sessions/[id] — remove a session from history. */
export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    await deleteCitationSession(id);
    return NextResponse.json<ApiResponse<{ id: string }>>({
      success: true,
      data: { id },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete session";
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
