/**
 * Statute reference normalization mode (server env).
 *
 * Flow: read once per call site → section-normalizer gates DB replacements →
 * pipeline uses normalized text for extraction + annotation when enabled.
 */

export type NormalizationMode =
  | "preserve_original"
  | "normalize_to_current_codes";

const MODES: ReadonlySet<NormalizationMode> = new Set([
  "preserve_original",
  "normalize_to_current_codes",
]);

/** Default: map IPC/CrPC/IEA spans to BNS/BNSS/BSA when a DB row exists. */
export const DEFAULT_NORMALIZATION_MODE: NormalizationMode =
  "normalize_to_current_codes";

/**
 * Resolves NORMALIZATION_MODE from the environment.
 * Unknown values fall back to {@link DEFAULT_NORMALIZATION_MODE}.
 */
export function getNormalizationMode(
  env: NodeJS.ProcessEnv = process.env
): NormalizationMode {
  const raw = env.NORMALIZATION_MODE?.trim();
  if (raw && MODES.has(raw as NormalizationMode)) {
    return raw as NormalizationMode;
  }
  return DEFAULT_NORMALIZATION_MODE;
}

export function isNormalizationEnabled(mode: NormalizationMode): boolean {
  return mode === "normalize_to_current_codes";
}
