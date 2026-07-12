/**
 * Registry of artifact / domain terms that signal the concrete subject a skill
 * operates on (brief §7.7). Single source of truth for both the description
 * heuristics and the workspace collision feature extractor. Matched
 * case-insensitively; extend these lists rather than re-introducing broad
 * "any noun" heuristics.
 */

/** Single-word artifact/domain hints. */
export const ARTIFACT_HINTS: readonly string[] = [
  'report',
  'document',
  'file',
  'code',
  'api',
  'table',
  'data',
  'config',
  'configuration',
  'schema',
  'log',
  'test',
  'image',
  'markdown',
  'pdf',
  'csv',
  'json',
  'yaml',
  'diagram',
  'template',
  'manual',
  'spreadsheet',
  'contract',
  'invoice',
  'email',
  'commit',
  'changelog',
  'release',
  'component',
  'query',
  'database',
];

/**
 * Multi-word artifacts/domain phrases. Detected as substrings so a skill's
 * artifact features can carry compound objects like "inspection report".
 */
export const MULTI_WORD_ARTIFACTS: readonly string[] = [
  'inspection report',
  'release notes',
  'commit history',
  'pull request',
  'test suite',
  'design document',
  'api schema',
];
