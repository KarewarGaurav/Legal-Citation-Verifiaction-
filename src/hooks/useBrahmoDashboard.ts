"use client";

import { useCallback, useState } from "react";
import type { CitationCheckApiData } from "@/app/api/citation-check/route";
import type { LlmApiData } from "@/app/api/llm/route";
import { generateMockLlmResponse } from "@/lib/mock-llm";
import type { CitationSessionRecord } from "@/lib/session-store";
import type {
  ApiResponse,
  CitationAnnotation,
  CitationAnnotationSummary,
  CitationSafetyPipelineResult,
  PipelineProcessingMetrics,
  SectionNormalizationAlert,
  SessionDashboardSnapshot,
  VerificationReport,
  VerificationResult,
} from "@/lib/types";

export interface AskVerifiedResult {
  snapshot: SessionDashboardSnapshot;
  session: CitationSessionRecord | null;
}

export type LoadingPhase =
  | "idle"
  | "generating"
  | "extracting"
  | "verifying"
  | "annotating"
  | "reporting";

export interface DashboardState {
  lastQuery: string;
  genericResponse: string;
  verifiedResponse: string;
  loadingPhase: LoadingPhase;
  genericLoading: boolean;
  verifiedLoading: boolean;
  error: string | null;
  sessionWarning: string | null;
  usedMockFallback: boolean;
  verificationResults: VerificationResult[];
  sectionAlerts: SectionNormalizationAlert[];
  annotations: CitationAnnotation[];
  annotationSummary: CitationAnnotationSummary | null;
  processingMetrics: PipelineProcessingMetrics | null;
  report: VerificationReport | null;
  pipeline: CitationSafetyPipelineResult | null;
}

const INITIAL_STATE: DashboardState = {
  lastQuery: "",
  genericResponse: "",
  verifiedResponse: "",
  loadingPhase: "idle",
  genericLoading: false,
  verifiedLoading: false,
  error: null,
  sessionWarning: null,
  usedMockFallback: false,
  verificationResults: [],
  sectionAlerts: [],
  annotations: [],
  annotationSummary: null,
  processingMetrics: null,
  report: null,
  pipeline: null,
};

async function postJson<T>(url: string, body: unknown): Promise<ApiResponse<T>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<ApiResponse<T>>;
}

export function useBrahmoDashboard() {
  const [state, setState] = useState<DashboardState>(INITIAL_STATE);

  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }));
  }, []);

  const resetResponses = useCallback(() => {
    setState((s) => ({
      ...s,
      genericResponse: "",
      verifiedResponse: "",
      verificationResults: [],
      sectionAlerts: [],
      annotations: [],
      annotationSummary: null,
      processingMetrics: null,
      report: null,
      pipeline: null,
      error: null,
      sessionWarning: null,
      usedMockFallback: false,
    }));
  }, []);

  const getSnapshot = useCallback((): SessionDashboardSnapshot => {
    const {
      genericResponse,
      verifiedResponse,
      verificationResults,
      sectionAlerts,
      annotations,
      annotationSummary,
      processingMetrics,
      report,
      pipeline,
      usedMockFallback,
    } = state;
    return {
      genericResponse,
      verifiedResponse,
      verificationResults,
      sectionAlerts,
      annotations,
      annotationSummary,
      processingMetrics,
      report,
      pipeline,
      usedMockFallback,
    };
  }, [state]);

  const loadSnapshot = useCallback((snapshot: SessionDashboardSnapshot) => {
    setState((s) => ({
      ...s,
      ...snapshot,
      lastQuery: snapshot.report?.query ?? s.lastQuery,
      loadingPhase: "idle",
      genericLoading: false,
      verifiedLoading: false,
      error: null,
      sessionWarning: null,
    }));
  }, []);

  const askGeneric = useCallback(async (
    query: string,
    matterId?: string
  ): Promise<SessionDashboardSnapshot | null> => {
    if (!query.trim()) {
      setState((s) => ({ ...s, error: "Enter a legal query first." }));
      return null;
    }

    setState((s) => ({
      ...s,
      genericLoading: true,
      loadingPhase: "generating",
      error: null,
    }));

    try {
      const json = await postJson<LlmApiData>("/api/llm", { query, matterId });
      if (json.success && json.data) {
        const snapshot: SessionDashboardSnapshot = {
          genericResponse: json.data.response,
          verifiedResponse: "",
          verificationResults: [],
          sectionAlerts: [],
          annotations: [],
          annotationSummary: null,
          processingMetrics: null,
          report: null,
          pipeline: null,
          usedMockFallback: json.data.source === "mock",
        };
        setState((s) => ({
          ...s,
          ...snapshot,
          genericLoading: false,
          loadingPhase: "idle",
        }));
        return snapshot;
      }
      throw new Error(json.error ?? "LLM request failed");
    } catch (err) {
      const fallback = generateMockLlmResponse(query, matterId);
      const snapshot: SessionDashboardSnapshot = {
        genericResponse: fallback,
        verifiedResponse: "",
        verificationResults: [],
        sectionAlerts: [],
        annotations: [],
        annotationSummary: null,
        processingMetrics: null,
        report: null,
        pipeline: null,
        usedMockFallback: true,
      };
      setState((s) => ({
        ...s,
        ...snapshot,
        genericLoading: false,
        loadingPhase: "idle",
        error:
          err instanceof Error
            ? `${err.message} — showing offline mock response.`
            : "API unavailable — showing offline mock response.",
      }));
      return snapshot;
    }
  }, []);

  const askVerified = useCallback(
    async (
      query: string,
      matterId: string,
      existingGeneric?: string
    ): Promise<AskVerifiedResult | null> => {
      if (!query.trim()) {
        setState((s) => ({ ...s, error: "Enter a legal query first." }));
        return null;
      }

      setState((s) => ({
        ...s,
        verifiedLoading: true,
        genericLoading: !existingGeneric,
        loadingPhase: "generating",
        error: null,
      }));

      let genericText = existingGeneric?.trim() ?? "";
      let usedMock = false;

      try {
        if (!genericText) {
          const llmJson = await postJson<LlmApiData>("/api/llm", {
            query,
            matterId,
          });
          if (llmJson.success && llmJson.data) {
            genericText = llmJson.data.response;
            usedMock = llmJson.data.source === "mock";
          } else {
            genericText = generateMockLlmResponse(query, matterId);
            usedMock = true;
          }
        }

        setState((s) => ({
          ...s,
          genericResponse: genericText,
          genericLoading: false,
          loadingPhase: "extracting",
        }));

        setState((s) => ({ ...s, loadingPhase: "verifying" }));

        const checkJson = await postJson<CitationCheckApiData>(
          "/api/citation-check",
          { query, llmResponse: genericText, matterId }
        );

        if (!checkJson.success || !checkJson.data) {
          throw new Error(checkJson.error ?? "Citation check failed");
        }

        setState((s) => ({ ...s, loadingPhase: "annotating" }));
        setState((s) => ({ ...s, loadingPhase: "reporting" }));

        const { pipeline, report, annotations, session, sessionError } =
          checkJson.data;

        const snapshot: SessionDashboardSnapshot = {
          genericResponse: pipeline.originalResponse,
          verifiedResponse: pipeline.annotatedResponse,
          verificationResults: report.results,
          sectionAlerts: pipeline.sectionNormalization.alerts,
          annotations,
          annotationSummary: pipeline.annotationSummary,
          processingMetrics: pipeline.processingMetrics,
          report,
          pipeline,
          usedMockFallback: usedMock || checkJson.data.llmSource === "mock",
        };

        setState((s) => ({
          ...s,
          ...snapshot,
          lastQuery: query,
          verifiedLoading: false,
          loadingPhase: "idle",
          sessionWarning: sessionError ?? null,
        }));
        return { snapshot, session: session ?? null };
      } catch (err) {
        const fallbackGeneric =
          genericText || generateMockLlmResponse(query, matterId);
        const snapshot: SessionDashboardSnapshot = {
          genericResponse: fallbackGeneric,
          verifiedResponse: "",
          verificationResults: [],
          sectionAlerts: [],
          annotations: [],
          annotationSummary: null,
          processingMetrics: null,
          report: null,
          pipeline: null,
          usedMockFallback: true,
        };
        setState((s) => ({
          ...s,
          ...snapshot,
          verifiedLoading: false,
          genericLoading: false,
          loadingPhase: "idle",
          error:
            err instanceof Error
              ? err.message
              : "Verification pipeline failed",
        }));
        return { snapshot, session: null };
      }
    },
    []
  );

  return {
    state,
    askGeneric,
    askVerified,
    clearError,
    resetResponses,
    getSnapshot,
    loadSnapshot,
  };
}
