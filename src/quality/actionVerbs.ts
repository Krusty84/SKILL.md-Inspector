/**
 * Base-form action verbs that signal a skill's capability (brief §7.7). Detection
 * expands each to common inflections at runtime (see descriptionHeuristics).
 */
export const ACTION_VERBS: readonly string[] = [
  'analyze',
  'generate',
  'format',
  'convert',
  'review',
  'validate',
  'extract',
  'summarize',
  'transform',
  'compare',
  'inspect',
  'test',
  'debug',
  'create',
  'update',
  'migrate',
  'classify',
  'normalize',
  'calculate',
  // Common additional capability verbs seen in real skills.
  'build',
  'render',
  'parse',
  'lint',
  'refactor',
  'clean',
  'standardize',
  'prepare',
  'organize',
  'detect',
];
