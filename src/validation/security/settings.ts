/**
 * Resolved security-scan settings. The core scanner is `vscode`-free, so this
 * is a plain data object; `src/config.ts` builds it from `skillMdInspector.*`
 * values (compiling and validating the user-supplied regex additions), and
 * `analyzeSkill` falls back to {@link DEFAULT_SECURITY_SETTINGS} when no
 * settings are threaded through (bare Node consumers and unit tests).
 */
export interface SecuritySettings {
  /** Master switch. When false the security rule emits nothing. */
  enabled: boolean;
  /** Scan bundled resource files (scripts etc.) during full analysis. */
  scanResourceFiles: boolean;
  /** Resource files larger than this are skipped (deterministic, bounded work). */
  maxScannedFileSizeBytes: number;
  /** Host suffixes to treat as trusted (suppress service findings). Lowercased. */
  allowedDomains: readonly string[];
  /**
   * Substrings that suppress a **risky-tier** command finding, either by naming
   * the matched command or by being a fuller command line that contains it and
   * appears on the same line. Never suppresses a dangerous-tier finding.
   * Lowercased.
   */
  allowedCommands: readonly string[];
  /** User-added risky-command patterns (compiled and validated in config.ts). */
  additionalRiskyCommands: readonly RegExp[];
  /** User-added dangerous-command patterns (compiled and validated in config.ts). */
  additionalDangerousCommands: readonly RegExp[];
  /** User-added risky-service host suffixes. Lowercased. */
  additionalServiceDomains: readonly string[];
}

const DEFAULT_MAX_SCANNED_FILE_SIZE_BYTES = 256 * 1024;

/**
 * On by default: the checks are static, offline, and deterministic like every
 * other rule, and security findings are the ones authors most need to see.
 * Individual codes remain tunable through the existing severity-override system.
 */
export const DEFAULT_SECURITY_SETTINGS: SecuritySettings = Object.freeze({
  enabled: true,
  scanResourceFiles: true,
  maxScannedFileSizeBytes: DEFAULT_MAX_SCANNED_FILE_SIZE_BYTES,
  allowedDomains: Object.freeze([]),
  allowedCommands: Object.freeze([]),
  additionalRiskyCommands: Object.freeze([]),
  additionalDangerousCommands: Object.freeze([]),
  additionalServiceDomains: Object.freeze([]),
}) as SecuritySettings;
