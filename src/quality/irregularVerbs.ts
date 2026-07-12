/**
 * Explicit forms for irregular English action verbs, which the regular
 * `inflect()` morphology cannot derive (e.g. write→wrote/written, build→built).
 * Centralized here as the single source of truth; extend as needed. Each entry
 * lists every recognized surface form, including the base.
 */
export const IRREGULAR_VERB_FORMS: Readonly<Record<string, readonly string[]>> = {
  write: ['write', 'writes', 'writing', 'wrote', 'written'],
  read: ['read', 'reads', 'reading'],
  build: ['build', 'builds', 'building', 'built'],
};
