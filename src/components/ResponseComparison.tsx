import { AnnotatedResponseText } from "@/components/AnnotatedResponseText";

export type ResponsePanelLoadingMessage =
  | "Generating AI response..."
  | "Extracting citations..."
  | "Verifying citations..."
  | "Annotating response..."
  | "Generating report..."
  | "Loading response…";

interface ResponseComparisonProps {
  genericResponse?: string;
  verifiedResponse?: string;
  genericLoading?: boolean;
  verifiedLoading?: boolean;
  genericLoadingMessage?: ResponsePanelLoadingMessage;
  verifiedLoadingMessage?: ResponsePanelLoadingMessage;
  showVerifiedAnnotated?: boolean;
}

const VERIFIED_PIPELINE_STEPS: ResponsePanelLoadingMessage[] = [
  "Extracting citations...",
  "Verifying citations...",
  "Annotating response...",
  "Generating report...",
];

export function ResponseComparison({
  genericResponse,
  verifiedResponse,
  genericLoading = false,
  verifiedLoading = false,
  genericLoadingMessage = "Loading response…",
  verifiedLoadingMessage = "Loading response…",
  showVerifiedAnnotated = true,
}: ResponseComparisonProps) {
  return (
    <section className="animate-fade-in">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          Response comparison
        </h2>
        <span className="text-[11px] text-muted">
          Unverified vs citation-safe output
        </span>
      </div>

      <div className="relative grid grid-cols-1 gap-0 overflow-hidden rounded-xl border border-border/80 lg:grid-cols-2">
        <div
          className="pointer-events-none absolute inset-y-4 left-1/2 z-10 hidden w-px -translate-x-1/2 bg-border lg:block"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted lg:block"
          aria-hidden
        >
          vs
        </div>

        <ResponsePanel
          title="Generic AI"
          subtitle="Unverified — may contain hallucinated citations"
          content={genericResponse}
          isLoading={genericLoading}
          loadingMessage={genericLoadingMessage}
          variant="generic"
        />
        <ResponsePanel
          title="BRAHMO Verified"
          subtitle="Citations checked · sections normalized · hallucinations removed"
          content={verifiedResponse}
          isLoading={verifiedLoading}
          loadingMessage={verifiedLoadingMessage}
          variant="verified"
          showAnnotated={showVerifiedAnnotated && !!verifiedResponse}
        />
      </div>
    </section>
  );
}

interface ResponsePanelProps {
  title: string;
  subtitle: string;
  content?: string;
  isLoading?: boolean;
  loadingMessage?: ResponsePanelLoadingMessage;
  variant: "generic" | "verified";
  showAnnotated?: boolean;
}

function ResponsePanel({
  title,
  subtitle,
  content,
  isLoading,
  loadingMessage = "Loading response…",
  variant,
  showAnnotated,
}: ResponsePanelProps) {
  const isGeneric = variant === "generic";

  return (
    <section
      className={`flex min-h-[min(50vh,320px)] flex-col transition-colors sm:min-h-[360px] ${
        isGeneric
          ? "bg-danger-muted lg:border-r lg:border-border/60"
          : "bg-success-muted"
      }`}
    >
      <header
        className={`shrink-0 border-b px-3 py-2.5 sm:px-4 sm:py-3 ${
          isGeneric
            ? "border-danger/15 bg-danger/5"
            : "border-success/20 bg-success/5"
        }`}
      >
        <div className="flex items-start gap-2 sm:items-center">
          <span
            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold sm:mt-0 ${
              isGeneric
                ? "bg-danger/15 text-danger"
                : "bg-success/15 text-success"
            }`}
            aria-hidden
          >
            {isGeneric ? "!" : "✓"}
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="text-[11px] leading-snug text-muted">{subtitle}</p>
          </div>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-4">
        {isLoading ? (
          <LoadingState message={loadingMessage} variant={variant} />
        ) : content ? (
          showAnnotated ? (
            <AnnotatedResponseText text={content} />
          ) : (
            <p className="legal-response-text whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
              {content}
            </p>
          )
        ) : (
          <p className="text-sm italic text-muted">
            {isGeneric
              ? "Generic AI output will appear here."
              : "Verified output will appear after citation check."}
          </p>
        )}
      </div>
    </section>
  );
}

function LoadingState({
  message,
  variant,
}: {
  message: string;
  variant: "generic" | "verified";
}) {
  return (
    <div className="flex flex-col gap-4" aria-live="polite" aria-busy="true">
      <div
        className={`h-1 w-full overflow-hidden rounded-full ${
          variant === "generic" ? "bg-danger/10" : "bg-success/10"
        }`}
      >
        <div
          className={`h-full w-1/3 rounded-full ${
            variant === "generic" ? "bg-danger/50" : "bg-success/50"
          }`}
          style={{ animation: "brahmo-indeterminate 1.2s ease-in-out infinite" }}
        />
      </div>
      <p className="text-sm font-medium text-foreground">{message}</p>
      {variant === "verified" && (
        <ul className="space-y-2">
          {VERIFIED_PIPELINE_STEPS.map((step) => {
            const active = message === step;
            const currentStep = VERIFIED_PIPELINE_STEPS.includes(
              message as ResponsePanelLoadingMessage
            )
              ? (message as ResponsePanelLoadingMessage)
              : VERIFIED_PIPELINE_STEPS[0];
            const completed =
              VERIFIED_PIPELINE_STEPS.indexOf(step) <
              VERIFIED_PIPELINE_STEPS.indexOf(currentStep);
            return (
              <li
                key={step}
                className={`flex items-center gap-2.5 text-xs ${
                  active
                    ? "font-medium text-foreground"
                    : completed
                      ? "text-muted"
                      : "text-muted/55"
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    active
                      ? "border-success/50 bg-success/15"
                      : completed
                        ? "border-success/30 bg-success/10"
                        : "border-border bg-background/60"
                  }`}
                  aria-hidden
                >
                  {completed && !active ? (
                    <span className="text-[9px] text-success">✓</span>
                  ) : active ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-soft" />
                  ) : null}
                </span>
                {step}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
