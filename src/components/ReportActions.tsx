"use client";

import { useCallback, useState } from "react";
import {
  buildReportExportPayload,
  formatReportAsText,
} from "@/lib/report-utils";
import type {
  CitationAnnotationSummary,
  PipelineProcessingMetrics,
  VerificationReport,
} from "@/lib/types";

interface ReportActionsProps {
  genericResponse?: string;
  verifiedResponse?: string;
  report?: VerificationReport | null;
  processingMetrics?: PipelineProcessingMetrics | null;
  annotationSummary?: CitationAnnotationSummary | null;
}

export function ReportActions({
  genericResponse,
  verifiedResponse,
  report,
  processingMetrics,
  annotationSummary,
}: ReportActionsProps) {
  const [copied, setCopied] = useState<string | null>(null);

  const flashCopied = useCallback((key: string) => {
    setCopied(key);
    window.setTimeout(() => setCopied(null), 2000);
  }, []);

  const copyText = useCallback(
    async (text: string, key: string) => {
      if (!text?.trim()) return;
      try {
        await navigator.clipboard.writeText(text);
        flashCopied(key);
      } catch {
        /* clipboard denied */
      }
    },
    [flashCopied]
  );

  const download = useCallback(
    (content: string, filename: string, mime: string) => {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    },
    []
  );

  const handleDownloadJson = useCallback(() => {
    if (!report) return;
    const payload = buildReportExportPayload(report, {
      metrics: processingMetrics ?? null,
      annotationAccuracy: annotationSummary?.accuracyPercentage,
    });
    const stamp = new Date(report.generatedAt).toISOString().slice(0, 10);
    download(
      JSON.stringify(payload, null, 2),
      `brahmo-report-${stamp}.json`,
      "application/json"
    );
  }, [report, processingMetrics, annotationSummary, download]);

  const handleDownloadTxt = useCallback(() => {
    if (!report) return;
    const payload = buildReportExportPayload(report, {
      metrics: processingMetrics ?? null,
      annotationAccuracy: annotationSummary?.accuracyPercentage,
    });
    const stamp = new Date(report.generatedAt).toISOString().slice(0, 10);
    download(
      formatReportAsText(payload),
      `brahmo-report-${stamp}.txt`,
      "text/plain"
    );
  }, [report, processingMetrics, annotationSummary, download]);

  const hasGeneric = Boolean(genericResponse?.trim());
  const hasVerified = Boolean(verifiedResponse?.trim());
  const hasReport = Boolean(report);

  if (!hasGeneric && !hasVerified && !hasReport) return null;

  return (
    <div className="glass-card flex flex-wrap items-center gap-2 rounded-xl px-3 py-2.5">
      <span className="mr-1 text-[11px] font-medium uppercase tracking-wider text-muted">
        Copy
      </span>
      <ActionButton
        label="Generic response"
        disabled={!hasGeneric}
        active={copied === "generic"}
        onClick={() => void copyText(genericResponse ?? "", "generic")}
      />
      <ActionButton
        label="Verified response"
        disabled={!hasVerified}
        active={copied === "verified"}
        onClick={() => void copyText(verifiedResponse ?? "", "verified")}
      />
      <ActionButton
        label="Verification report"
        disabled={!hasReport}
        active={copied === "report"}
        onClick={() => {
          if (!report) return;
          const payload = buildReportExportPayload(report, {
            metrics: processingMetrics ?? null,
            annotationAccuracy: annotationSummary?.accuracyPercentage,
          });
          void copyText(formatReportAsText(payload), "report");
        }}
      />

      <span className="mx-1 hidden h-4 w-px bg-border sm:inline" aria-hidden />

      <span className="mr-1 text-[11px] font-medium uppercase tracking-wider text-muted">
        Download
      </span>
      <ActionButton
        label="JSON report"
        disabled={!hasReport}
        onClick={handleDownloadJson}
      />
      <ActionButton
        label="TXT report"
        disabled={!hasReport}
        onClick={handleDownloadTxt}
      />
    </div>
  );
}

function ActionButton({
  label,
  disabled,
  active,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border border-border/80 bg-background/50 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-accent/40 hover:bg-accent-muted disabled:cursor-not-allowed disabled:opacity-40"
    >
      {active ? "Copied" : label}
    </button>
  );
}
