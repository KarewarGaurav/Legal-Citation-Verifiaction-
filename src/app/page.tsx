"use client";

import { useEffect, useRef, useState } from "react";
import { AnnotationBadges } from "@/components/AnnotationBadges";
import { CitationAlerts } from "@/components/CitationAlerts";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ProcessingMetrics } from "@/components/ProcessingMetrics";
import { QueryInputPanel } from "@/components/QueryInputPanel";
import { ReportActions } from "@/components/ReportActions";
import { DEFAULT_MATTER_ID, getMatterQuery } from "@/lib/legal-matters";
import { ResponseComparison } from "@/components/ResponseComparison";
import type { ResponsePanelLoadingMessage } from "@/components/ResponseComparison";
import { SessionSidebar } from "@/components/SessionSidebar";
import { VerificationReport } from "@/components/VerificationReport";
import { VerificationSummaryCards } from "@/components/VerificationSummaryCards";
import {
  snapshotFromSession,
  useCitationSessions,
} from "@/hooks/useCitationSessions";
import { buildReportFromDashboardFields } from "@/lib/dashboard-mappers";
import { useBrahmoDashboard, type LoadingPhase } from "@/hooks/useBrahmoDashboard";

function loadingMessage(
  phase: LoadingPhase,
  side: "generic" | "verified"
): ResponsePanelLoadingMessage {
  if (phase === "generating") return "Generating AI response...";
  if (phase === "extracting") return "Extracting citations...";
  if (phase === "verifying") return "Verifying citations...";
  if (phase === "annotating") return "Annotating response...";
  if (phase === "reporting") return "Generating report...";
  return side === "generic"
    ? "Generating AI response..."
    : "Verifying citations...";
}

export default function HomePage() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [query, setQuery] = useState(() => getMatterQuery(DEFAULT_MATTER_ID));
  const [selectedMatterId, setSelectedMatterId] = useState(DEFAULT_MATTER_ID);
  const restoredSessionId = useRef<string | null>(null);

  const {
    sessions,
    activeSession,
    activeSessionId,
    loading: sessionsLoading,
    error: sessionsError,
    refresh: refreshSessions,
    selectSession,
    startNewSession,
    prependSession,
    removeSession,
  } = useCitationSessions();

  const { state, askGeneric, askVerified, clearError, loadSnapshot, resetResponses } =
    useBrahmoDashboard();

  useEffect(() => {
    if (!activeSession) {
      restoredSessionId.current = null;
      return;
    }
    if (restoredSessionId.current === activeSession.id) return;

    restoredSessionId.current = activeSession.id;
    setQuery(activeSession.query);
    loadSnapshot(snapshotFromSession(activeSession));
  }, [activeSession, loadSnapshot]);

  const isBusy = state.genericLoading || state.verifiedLoading;

  const displayReport =
    state.report ??
    buildReportFromDashboardFields({
      query: state.lastQuery || query,
      matterId: selectedMatterId,
      verificationResults: state.verificationResults,
      sectionAlerts: state.sectionAlerts,
      extractedCitationTexts:
        state.pipeline?.extractedCitations.map((c) => c.citationText) ?? [],
      annotationSummary: state.annotationSummary,
    });

  const handleAskGeneric = async () => {
    await askGeneric(query, selectedMatterId);
  };

  const handleAskVerified = async () => {
    const result = await askVerified(
      query,
      selectedMatterId,
      state.genericResponse || undefined
    );
    if (result?.session) {
      prependSession(result.session);
      restoredSessionId.current = result.session.id;
    } else if (result?.snapshot.report) {
      selectSession(null);
      restoredSessionId.current = "__inline__";
    }
  };

  const handleSelectSession = (id: string) => {
    selectSession(id);
  };

  const handleNewSession = () => {
    startNewSession();
    restoredSessionId.current = null;
    setQuery(getMatterQuery(selectedMatterId));
    resetResponses();
    setMobileSidebarOpen(false);
  };

  const handleScenarioSelect = (matterId: string) => {
    setSelectedMatterId(matterId);
    setQuery(getMatterQuery(matterId));
    resetResponses();
  };

  const handleDeleteSession = async (id: string) => {
    await removeSession(id);
    if (activeSessionId === id) {
      setQuery("");
      resetResponses();
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <SessionSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onDeleteSession={(id) => void handleDeleteSession(id)}
        loading={sessionsLoading}
        error={sessionsError}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border/80 bg-surface/80 px-4 py-3 backdrop-blur-md lg:px-6">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className="rounded-lg border border-border/80 p-2 text-muted transition-colors hover:text-foreground lg:hidden"
            aria-label="Open sessions"
          >
            <MenuIcon />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-foreground">
              {activeSession?.title ?? "New citation session"}
            </h2>
            {activeSession ? (
              <time className="text-[11px] text-muted">
                Saved{" "}
                {new Date(activeSession.createdAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            ) : (
              <p className="text-[11px] text-muted">
                Unsaved — runs persist after citation verification
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void refreshSessions()}
            disabled={sessionsLoading}
            className="hidden rounded-lg border border-border/80 px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-foreground disabled:opacity-50 sm:inline-flex"
            aria-label="Refresh sessions"
          >
            Refresh
          </button>
        </header>

        <main className="workspace-scroll flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 lg:px-6">
            <QueryInputPanel
              query={query}
              onQueryChange={setQuery}
              onScenarioSelect={handleScenarioSelect}
              onAskGeneric={() => void handleAskGeneric()}
              onAskVerified={() => void handleAskVerified()}
              isBusy={isBusy}
              genericLoading={state.genericLoading}
              verifiedLoading={state.verifiedLoading}
              loadingPhase={state.loadingPhase}
              sessionTitle={activeSession?.title}
              selectedMatterId={selectedMatterId}
            />

            {state.error && (
              <ErrorBanner message={state.error} onDismiss={clearError} />
            )}

            {state.sessionWarning && !state.error && (
              <p className="glass-card rounded-lg border border-warning/30 bg-warning/[0.06] px-3 py-2 text-xs text-warning">
                Session not saved to database: {state.sessionWarning}. The
                verification report below is still available for this run.
              </p>
            )}

            {state.usedMockFallback && !state.error && (
              <p className="glass-card animate-fade-in rounded-lg px-3 py-2 text-xs text-muted">
                Offline demo mode — using deterministic mock legal responses.
              </p>
            )}

            <ReportActions
              genericResponse={state.genericResponse}
              verifiedResponse={state.verifiedResponse}
              report={displayReport}
              processingMetrics={state.processingMetrics}
              annotationSummary={state.annotationSummary}
            />

            <ResponseComparison
              genericResponse={state.genericResponse}
              verifiedResponse={state.verifiedResponse}
              genericLoading={state.genericLoading}
              verifiedLoading={state.verifiedLoading}
              genericLoadingMessage={loadingMessage(state.loadingPhase, "generic")}
              verifiedLoadingMessage={loadingMessage(
                state.loadingPhase,
                "verified"
              )}
              showVerifiedAnnotated={!!state.verifiedResponse}
            />

            {state.annotationSummary && (
              <VerificationSummaryCards summary={state.annotationSummary} />
            )}

            {state.annotations.length > 0 && (
              <section className="glass-card animate-fade-in stagger-2 rounded-xl p-4 sm:p-5">
                <h3 className="text-sm font-semibold text-foreground">
                  Citation annotations
                </h3>
                <p className="mt-1 text-xs text-muted">
                  Per-citation verification state in the verified response
                </p>
                <div className="mt-4">
                  <AnnotationBadges annotations={state.annotations} />
                </div>
              </section>
            )}

            <CitationAlerts
              results={state.verificationResults}
              sectionAlerts={state.sectionAlerts}
            />

            <ProcessingMetrics metrics={state.processingMetrics} />

            <VerificationReport
              report={displayReport}
              annotationSummary={state.annotationSummary}
              processingMetrics={state.processingMetrics}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M3 5h12M3 9h12M3 13h12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
