import { DiagnosticCode } from '../types/DiagnosticCode';
import type { SkillDiagnostic, SkillDiagnosticSeverity } from '../types/SkillDiagnostic';
import type { SkillDocument } from '../types/SkillDocument';
import type { SkillProfile, MetadataFieldSpec } from '../types/SkillProfile';
import { diag, keyRange } from './util';

// A real XML-like tag: `<` immediately followed by a letter or `/`. Prose
// comparisons (`a < b`, `x > y`) never match because of the required space/letter.
const XML_TAG = /<\/?[a-zA-Z][\w-]*\s*\/?>/;

/**
 * Profile-specific frontmatter metadata rules (Tasks 43–46, 49): reserved words,
 * XML tags, field types, and unknown-key policy. Returns nothing for profiles
 * (e.g. generic) that declare no `metadata` rules.
 */
export function validateProfileMetadata(
  doc: SkillDocument,
  profile: SkillProfile,
): SkillDiagnostic[] {
  const rules = profile.metadata;
  const fm = doc.frontmatter;
  if (!rules || !fm) {
    return [];
  }

  const diagnostics: SkillDiagnostic[] = [];
  const label = profile.label;
  const fields: Array<['name' | 'description', string]> = [
    ['name', typeof fm.name === 'string' ? fm.name : ''],
    ['description', typeof fm.description === 'string' ? fm.description : ''],
  ];

  // 43 — reserved words in name/description.
  if (rules.reservedWords && rules.reservedWords.length > 0) {
    for (const [field, text] of fields) {
      const hit = rules.reservedWords.find((word) => hasWholeWord(text, word));
      if (hit) {
        diagnostics.push(
          diag(
            DiagnosticCode.MetadataReservedWord,
            'warning',
            `${label}: \`${field}\` uses a reserved metadata word "${hit}".`,
            keyRange(doc, field),
          ),
        );
      }
    }
  }

  // 44 — XML-like tags in name/description.
  if (rules.forbidXmlTags) {
    for (const [field, text] of fields) {
      if (XML_TAG.test(text)) {
        diagnostics.push(
          diag(
            DiagnosticCode.MetadataXmlTag,
            'warning',
            `${label}: \`${field}\` must not contain XML-like tags.`,
            keyRange(doc, field),
          ),
        );
      }
    }
  }

  // 45/46 — recognized field types.
  if (rules.fields) {
    for (const [key, spec] of Object.entries(rules.fields)) {
      if (key in fm && !matchesType(fm[key], spec.type)) {
        diagnostics.push(
          diag(
            DiagnosticCode.MetadataFieldType,
            'warning',
            `${label}: \`${key}\` must be ${describeType(spec.type)}.`,
            keyRange(doc, key),
          ),
        );
      }
    }
  }

  // 49 — unknown top-level keys.
  if (rules.unknownKeyPolicy && rules.unknownKeyPolicy !== 'allow') {
    const known = new Set<string>([
      'name',
      'description',
      ...(rules.knownKeys ?? []),
      ...Object.keys(rules.fields ?? {}),
    ]);
    const severity: SkillDiagnosticSeverity =
      rules.unknownKeyPolicy === 'error' ? 'error' : 'warning';
    for (const key of Object.keys(fm)) {
      if (!known.has(key)) {
        diagnostics.push(
          diag(
            DiagnosticCode.MetadataUnknownKey,
            severity,
            `${label}: unknown frontmatter key "${key}".`,
            keyRange(doc, key),
          ),
        );
      }
    }
  }

  return diagnostics;
}

function hasWholeWord(text: string, word: string): boolean {
  return new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i').test(text);
}

function matchesType(value: unknown, type: MetadataFieldSpec['type']): boolean {
  const isStringArray = Array.isArray(value) && value.every((v) => typeof v === 'string');
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    case 'string[]':
      return isStringArray;
    case 'string|string[]':
      return typeof value === 'string' || isStringArray;
  }
}

function describeType(type: MetadataFieldSpec['type']): string {
  switch (type) {
    case 'string':
      return 'a string';
    case 'boolean':
      return 'a boolean';
    case 'string[]':
      return 'a string array';
    case 'string|string[]':
      return 'a string or string array';
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
