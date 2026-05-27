"use client";

import type { CitationSessionRecord } from "@/lib/session-store";

interface SessionSidebarProps {
  sessions: CitationSessionRecord[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession?: (id: string) => void;
  loading?: boolean;
  error?: string | null;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

function formatSessionTime(iso: string): string {
  const date = new Date(iso);
  const diffHours = (Date.now() - date.getTime()) / (1000 * 60 * 60);

  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${Math.floor(diffHours)}h ago`;
  if (diffHours < 48) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function sessionPreview(session: CitationSessionRecord): string {
  const source =
    session.annotatedResponse.trim() ||
    session.originalResponse.trim() ||
    session.query.trim();
  if (!source) return "No responses yet";
  const plain = source
    .replace(
      /\[.*?\]|\(Verified\)|\(Unverified\)|\(Removed:[^)]*\)|\(Corrected\)|~~/g,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
  return plain.length <= 72 ? plain : `${plain.slice(0, 72)}…`;
}

export function SessionSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  loading = false,
  error = null,
  mobileOpen = false,
  onCloseMobile,
  collapsed = false,
  onToggleCollapse,
}: SessionSidebarProps) {
  const handleSelect = (id: string) => {
    onSelectSession(id);
    onCloseMobile?.();
  };

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 ease-out lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "w-[4.25rem]" : "w-72"}`}
      >
        <div
          className={`border-b border-sidebar-border ${collapsed ? "px-2 py-3" : "px-4 py-4"}`}
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-xs font-bold text-white">
              B
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <h1 className="text-base font-semibold tracking-tight text-foreground">
                  BRAHMO
                </h1>
                <p className="text-[11px] text-muted">Citation Safety Engine</p>
              </div>
            )}
            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className={`ml-auto hidden rounded-md border border-border/60 p-1.5 text-muted hover:text-foreground lg:flex ${
                  collapsed ? "mx-auto" : ""
                }`}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                <ChevronIcon collapsed={collapsed} />
              </button>
            )}
          </div>
          {!collapsed && (
            <p className="mt-2 text-xs text-muted">Legal AI · Citation integrity</p>
          )}
        </div>

        <button
          type="button"
          onClick={onNewSession}
          title="New Citation Session"
          className={`mx-3 mt-4 flex items-center justify-center gap-2 rounded-lg border border-border/80 bg-surface text-sm font-medium text-foreground transition-all hover:border-accent/40 hover:bg-accent-muted ${
            collapsed ? "px-2 py-2.5" : "w-[calc(100%-1.5rem)] px-3 py-2.5"
          }`}
        >
          <PlusIcon />
          {!collapsed && <span>New session</span>}
        </button>

        <nav className="workspace-scroll mt-4 flex-1 overflow-y-auto px-2 pb-2">
          {!collapsed && (
            <p className="mb-2 px-2 text-[11px] font-medium uppercase tracking-wider text-muted">
              Recent sessions
            </p>
          )}

          {loading ? (
            <SessionSkeletonList collapsed={collapsed} />
          ) : error ? (
            !collapsed && (
              <p className="px-3 py-3 text-xs text-danger">{error}</p>
            )
          ) : sessions.length === 0 ? (
            !collapsed && <EmptyState />
          ) : (
            <ul className="space-y-0.5">
              {sessions.map((session) => {
                const isActive = session.id === activeSessionId;
                return (
                  <li
                    key={session.id}
                    className={`group flex items-stretch rounded-lg ${
                      isActive
                        ? "border border-accent/25 bg-accent-muted"
                        : "border border-transparent hover:bg-surface/60"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelect(session.id)}
                      title={collapsed ? session.title : undefined}
                      className={`min-w-0 flex-1 text-left transition-colors ${
                        collapsed ? "px-2 py-2" : "px-3 py-2.5"
                      }`}
                    >
                      {collapsed ? (
                        <span
                          className={`mx-auto flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-bold ${
                            isActive
                              ? "bg-accent text-white"
                              : "bg-surface text-muted"
                          }`}
                        >
                          {session.title.charAt(0).toUpperCase()}
                        </span>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-2 pr-1">
                            <p
                              className={`line-clamp-1 text-sm font-medium ${
                                isActive ? "text-accent" : "text-foreground"
                              }`}
                            >
                              {session.title}
                            </p>
                            <time className="shrink-0 text-[10px] text-muted">
                              {formatSessionTime(session.createdAt)}
                            </time>
                          </div>
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted">
                            {sessionPreview(session)}
                          </p>
                        </>
                      )}
                    </button>
                    {onDeleteSession && !collapsed && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete "${session.title}"?`)) {
                            onDeleteSession(session.id);
                          }
                        }}
                        aria-label={`Delete ${session.title}`}
                        className="mt-2 mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-danger/20 bg-danger/10 text-danger opacity-0 transition-opacity hover:border-danger/40 hover:bg-danger/20 focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        {!collapsed && (
          <footer className="border-t border-sidebar-border px-4 py-3">
            <p className="text-[11px] text-muted">Citation Safety Engine</p>
            <p className="text-[10px] text-muted/70">Professional legal use only</p>
          </footer>
        )}
      </aside>
    </>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg px-3 py-6 text-center">
      <p className="text-xs font-medium text-foreground">
        No previous sessions yet
      </p>
      <p className="mt-1 text-[11px] text-muted/80">
        Run a verified query to save your first session.
      </p>
    </div>
  );
}

function SessionSkeletonList({ collapsed }: { collapsed: boolean }) {
  return (
    <ul
      className="space-y-1.5 px-1"
      aria-busy="true"
      aria-label="Loading sessions"
    >
      {[0, 1, 2, 3].map((i) => (
        <li
          key={i}
          className={`animate-pulse-soft rounded-lg border border-border/40 bg-surface/40 ${
            collapsed ? "mx-auto h-8 w-8" : "px-3 py-2.5"
          }`}
        >
          {!collapsed && (
            <>
              <div className="h-3 w-2/3 rounded bg-border/60" />
              <div className="mt-2 h-2.5 w-5/6 rounded bg-border/40" />
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d={collapsed ? "M5 3l4 4-4 4" : "M9 3L5 7l4 4"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className="shrink-0 text-muted"
    >
      <path
        d="M8 3v10M3 8h10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M3 4h8M5.5 4V2.5h3V4M4 4l.5 7.5h5L10 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
