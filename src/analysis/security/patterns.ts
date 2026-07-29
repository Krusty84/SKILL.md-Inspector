import catalog from './defaultSecurityCatalog.json';
import type { SecuritySettings } from './settings';

/** A command pattern with the human explanation used in its diagnostic message. */
export interface CompiledCommandPattern {
  id: string;
  re: RegExp;
  message: string;
}

/** A secret signature: the raw value is never echoed, only the label is shown. */
export interface CompiledSecretSignature {
  id: string;
  label: string;
  re: RegExp;
}

/** A labeled pattern (injection phrases, sensitive paths). */
export interface CompiledLabeledPattern {
  id: string;
  re: RegExp;
  message: string;
}

export interface CompiledSecurityPatterns {
  dangerousCommands: readonly CompiledCommandPattern[];
  riskyCommands: readonly CompiledCommandPattern[];
  /** Combined host-suffix matcher (group 1 = the host), or null if no hosts. */
  serviceHostRe: RegExp | null;
  secretSignatures: readonly CompiledSecretSignature[];
  /** Generic `key = value` credential; group 2 is the value tested for placeholders. */
  secretAssignment: { id: string; label: string; re: RegExp };
  credentialedUrl: { id: string; label: string; re: RegExp };
  /** Placeholder detector; a secret whose value matches this is a template, not a leak. */
  secretPlaceholder: RegExp;
  injectionPhrases: readonly CompiledLabeledPattern[];
  sensitivePaths: readonly CompiledLabeledPattern[];
  /** Imperative/command wording used to decide whether an HTML comment is hidden instruction. */
  hiddenImperative: RegExp;
}

interface RawCommand {
  id: string;
  source: string;
  message: string;
}
interface RawSecret {
  id: string;
  label: string;
  source: string;
}

function compileCommands(entries: readonly RawCommand[]): CompiledCommandPattern[] {
  return entries.map((e) => ({ id: e.id, re: new RegExp(e.source, 'gi'), message: e.message }));
}

const BUILTIN_DANGEROUS = compileCommands(catalog.dangerousCommands as RawCommand[]);
const BUILTIN_RISKY = compileCommands(catalog.riskyCommands as RawCommand[]);
const BUILTIN_SECRET_SIGNATURES: CompiledSecretSignature[] = (
  catalog.secretSignatures as RawSecret[]
).map((e) => ({ id: e.id, label: e.label, re: new RegExp(e.source, 'g') }));
const SECRET_ASSIGNMENT = {
  id: catalog.secretAssignment.id,
  label: catalog.secretAssignment.label,
  re: new RegExp(catalog.secretAssignment.source, 'gi'),
};
const CREDENTIALED_URL = {
  id: catalog.credentialedUrl.id,
  label: catalog.credentialedUrl.label,
  re: new RegExp(catalog.credentialedUrl.source, 'gi'),
};
const SECRET_PLACEHOLDER = new RegExp(catalog.secretPlaceholder.source, 'i');
const BUILTIN_INJECTION: CompiledLabeledPattern[] = (
  catalog.injectionPhrases as RawCommand[]
).map((e) => ({ id: e.id, re: new RegExp(e.source, 'gi'), message: e.message }));
const BUILTIN_SENSITIVE_PATHS: CompiledLabeledPattern[] = (
  catalog.sensitivePaths as RawCommand[]
).map((e) => ({ id: e.id, re: new RegExp(e.source, 'gi'), message: e.message }));
const HIDDEN_IMPERATIVE = new RegExp(catalog.hiddenImperative.source, 'i');
const BUILTIN_SERVICE_HOSTS: readonly string[] = catalog.serviceHosts;

/** Escapes a host so it can be embedded in the combined service-host alternation. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds the combined host-suffix matcher. A host matches when it appears as a
 * token (in a URL or bare), so `curl https://webhook.site/x` and a bare
 * `webhook.site` both hit. Group 1 is the host, for range mapping.
 */
function buildServiceHostRe(hosts: readonly string[]): RegExp | null {
  if (hosts.length === 0) {
    return null;
  }
  const alternation = hosts.map(escapeRegExp).join('|');
  return new RegExp(`(?:^|[^\\w.-])((?:[a-z0-9-]+\\.)*(?:${alternation}))(?![\\w-])`, 'gi');
}

/** Re-normalizes a user-supplied pattern to global + case-insensitive, avoiding shared state. */
function normalizeUserPattern(re: RegExp): RegExp {
  return new RegExp(re.source, 'gi');
}

const resolvedCache = new WeakMap<SecuritySettings, CompiledSecurityPatterns>();

/**
 * Merges the built-in catalog with the settings' user additions into one
 * compiled pattern set, cached by settings-object identity so per-keystroke
 * runs reuse compiled regexes (the config layer keeps the settings object
 * identity-stable per scope, mirroring the heuristic-dictionary caching).
 */
export function resolveSecurityPatterns(settings: SecuritySettings): CompiledSecurityPatterns {
  const cached = resolvedCache.get(settings);
  if (cached) {
    return cached;
  }
  const dangerousCommands =
    settings.additionalDangerousCommands.length === 0
      ? BUILTIN_DANGEROUS
      : [
          ...BUILTIN_DANGEROUS,
          ...settings.additionalDangerousCommands.map((re, i) => ({
            id: `user-dangerous-${i}`,
            re: normalizeUserPattern(re),
            message: 'matches a user-configured dangerous-command pattern.',
          })),
        ];
  const riskyCommands =
    settings.additionalRiskyCommands.length === 0
      ? BUILTIN_RISKY
      : [
          ...BUILTIN_RISKY,
          ...settings.additionalRiskyCommands.map((re, i) => ({
            id: `user-risky-${i}`,
            re: normalizeUserPattern(re),
            message: 'matches a user-configured risky-command pattern.',
          })),
        ];
  const hosts =
    settings.additionalServiceDomains.length === 0
      ? BUILTIN_SERVICE_HOSTS
      : [...BUILTIN_SERVICE_HOSTS, ...settings.additionalServiceDomains];
  const resolved: CompiledSecurityPatterns = {
    dangerousCommands,
    riskyCommands,
    serviceHostRe: buildServiceHostRe(hosts),
    secretSignatures: BUILTIN_SECRET_SIGNATURES,
    secretAssignment: SECRET_ASSIGNMENT,
    credentialedUrl: CREDENTIALED_URL,
    secretPlaceholder: SECRET_PLACEHOLDER,
    injectionPhrases: BUILTIN_INJECTION,
    sensitivePaths: BUILTIN_SENSITIVE_PATHS,
    hiddenImperative: HIDDEN_IMPERATIVE,
  };
  resolvedCache.set(settings, resolved);
  return resolved;
}
