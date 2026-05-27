"use client";

import { useCallback, useEffect, useState } from "react";
import type { SessionsListApiData } from "@/app/api/sessions/route";
import type { CitationSessionRecord } from "@/lib/session-store";
import { rebuildVerificationReportFromSession } from "@/lib/dashboard-mappers";
import type { ApiResponse, SessionDashboardSnapshot } from "@/lib/types";

/** Builds an in-memory dashboard snapshot from a persisted session record. */
export function snapshotFromSession(
  session: CitationSessionRecord
): SessionDashboardSnapshot {
  const report = rebuildVerificationReportFromSession(session);
  return {
    genericResponse: session.originalResponse,
    verifiedResponse: session.annotatedResponse,
    verificationResults: session.verificationResults,
    sectionAlerts: session.sectionAlerts,
    annotations: [],
    annotationSummary: session.verificationSummary,
    processingMetrics: session.processingMetrics,
    report,
    pipeline: null,
    usedMockFallback: false,
  };
}

export function useCitationSessions() {
  const [sessions, setSessions] = useState<CitationSessionRecord[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions?limit=50", { cache: "no-store" });
      const json = (await res.json()) as ApiResponse<SessionsListApiData>;
      if (!json.success || !json.data) {
        throw new Error(json.error ?? "Failed to load sessions");
      }
      setSessions(json.data.sessions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectSession = useCallback((id: string | null) => {
    setActiveSessionId(id);
  }, []);

  const startNewSession = useCallback(() => {
    setActiveSessionId(null);
  }, []);

  const prependSession = useCallback((session: CitationSessionRecord) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== session.id);
      return [session, ...next];
    });
    setActiveSessionId(session.id);
  }, []);

  const removeSession = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
        const json = (await res.json()) as ApiResponse<{ id: string }>;
        if (!json.success) {
          throw new Error(json.error ?? "Failed to delete session");
        }
        setSessions((prev) => prev.filter((s) => s.id !== id));
        setActiveSessionId((current) => (current === id ? null : current));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to delete session"
        );
      }
    },
    []
  );

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) ?? null;

  return {
    sessions,
    activeSession,
    activeSessionId,
    loading,
    error,
    refresh,
    selectSession,
    startNewSession,
    prependSession,
    removeSession,
  };
}
