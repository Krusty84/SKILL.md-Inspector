/**
 * Plan 14 Parts B–G. Every setting below is user-supplied JSON with no schema
 * enforcement at runtime, and every one of these values reached the scoring or
 * diagnostic layer unchecked: a misspelled severity was published as an Error, a
 * non-numeric collision weight produced `similarity: NaN`, and `maxLength: 0`
 * made every skill in the workspace fail an unsuppressable specification rule.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeUri {
  scheme: string;
  fsPath: string;
  toString(): string;
}

const hoisted = vi.hoisted(() => ({
  overrides: new Map<string, unknown>(),
}));

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [],
    getWorkspaceFolder: () => undefined,
    getConfiguration: () => ({
      get: (key: string, fallback?: unknown) =>
        hoisted.overrides.has(key) ? hoisted.overrides.get(key) : fallback,
      inspect: (key: string) =>
        hoisted.overrides.has(key)
          ? { key, workspaceValue: hoisted.overrides.get(key) }
          : { key, defaultValue: undefined },
    }),
  },
}));

import { invalidateConfigCache, readConfig } from '../../src/config';
import { runAllValidations } from '../../src/validation';
import { validateName } from '../../src/validation/validateName';
import { validateDescription } from '../../src/validation/validateDescription';
import { detectCollisions } from '../../src/workspace/detectSkillCollisions';
import { analyzeDescription } from '../../src/quality/descriptionHeuristics';
import { resolveProfile } from '../../src/profiles';
import { DiagnosticCode, QuickFixId } from '../../src/types/DiagnosticCode';
import { kindForOverrideKey } from '../../src/commands/severityOverridesModel';
import type { SkillDocument } from '../../src/types/SkillDocument';
import type { SkillProfile } from '../../src/types/SkillProfile';

function set(key: string, value: unknown): void {
  hoisted.overrides.set(key, value);
  invalidateConfigCache();
}

function uri(p: string): FakeUri {
  return { scheme: 'file', fsPath: p, toString: () => `file://${p}` };
}

/** A minimal in-memory SKILL.md good enough for the frontmatter-driven rules. */
function skillDoc(frontmatter: Record<string, unknown>, body = '# Body\n\nText.\n'): SkillDocument {
  return {
    uri: 'file:///w/my-skill/SKILL.md',
    filePath: '/w/my-skill/SKILL.md',
    directory: '/w/my-skill',
    content: '',
    frontmatter: frontmatter as SkillDocument['frontmatter'],
    frontmatterRaw: '',
    frontmatterKeyRanges: {},
    frontmatterValueRanges: {},
    yamlStartLine: 1,
    body,
    bodyStartLine: 5,
    parseErrors: [],
  } as unknown as SkillDocument;
}

beforeEach(() => {
  hoisted.overrides.clear();
  invalidateConfigCache();
});

describe('B — the kebab-case name fix must never empty the field', () => {
  const profile = resolveProfile();

  for (const name of ['文档助手', '🎉', '___']) {
    it(`offers no one-click fix for ${JSON.stringify(name)}, whose slug is empty`, () => {
      const diagnostics = validateName(skillDoc({ name, description: 'x'.repeat(60) }), profile);
      const format = diagnostics.find((d) => d.code === DiagnosticCode.NameFormat);
      expect(format, 'the invalid name must still be reported').toBeDefined();
      // Either no fix at all, or a fix whose suggestion is a usable name — never
      // `name: `, which the next pass reports as `skill.name.missing`.
      if (format?.quickFixId === QuickFixId.ConvertNameToKebabCase) {
        expect(String(format.data?.suggestion ?? '')).not.toBe('');
      } else {
        expect(format?.quickFixId).toBeUndefined();
      }
    });
  }

  it('still offers the fix when a usable slug exists', () => {
    const diagnostics = validateName(
      skillDoc({ name: 'My Skill', description: 'x'.repeat(60) }),
      profile,
    );
    const format = diagnostics.find((d) => d.code === DiagnosticCode.NameFormat);
    expect(format?.quickFixId).toBe(QuickFixId.ConvertNameToKebabCase);
    expect(format?.data?.suggestion).toBe('my-skill');
  });
});

describe('C — severityOverrides values and keys are validated', () => {
  it('rejects a misspelled severity instead of publishing it', () => {
    set('severityOverrides', { 'skill.description.vague': 'warn' });
    const config = readConfig(uri('/w/my-skill/SKILL.md') as never);
    expect(config.profile.severityOverrides?.['skill.description.vague']).toBeUndefined();
    expect(
      config.configurationWarnings.some((w) => w.message.includes('warn')),
      'the ignored value must be reported through the output channel',
    ).toBe(true);
  });

  it('keeps the rule default severity when the override is invalid', () => {
    const profile: SkillProfile = {
      ...resolveProfile(),
      severityOverrides: { 'skill.description.vague': 'warn' as never },
    };
    const diagnostics = runAllValidations(
      skillDoc({
        name: 'my-skill',
        description: 'Helps the user with stuff and things in a general way for various needs.',
      }),
      profile,
      { skipFilesystem: true },
    );
    for (const diagnostic of diagnostics) {
      expect(['error', 'warning', 'information']).toContain(diagnostic.severity);
    }
    const vague = diagnostics.find((d) => d.code === DiagnosticCode.DescriptionVague);
    expect(vague?.severity).toBe('warning');
  });

  it('accepts a valid severity and a per-rule key', () => {
    set('severityOverrides', {
      'skill.description.vague': 'information',
      'skill.security.command.risky#chmod-777': 'off',
    });
    const config = readConfig(uri('/w/my-skill/SKILL.md') as never);
    expect(config.profile.severityOverrides).toEqual({
      'skill.description.vague': 'information',
      'skill.security.command.risky#chmod-777': 'off',
    });
    expect(config.configurationWarnings).toHaveLength(0);
  });

  it('labels an unknown key as unknown, not quality', () => {
    expect(kindForOverrideKey('skill.description.vague')).toBe('quality');
    expect(kindForOverrideKey('skill.security.command.risky#chmod-777')).toBe('security');
    expect(kindForOverrideKey('skill.description.vaguee')).toBe('unknown');
  });

  it('warns about an unknown key rather than dropping it silently', () => {
    set('severityOverrides', { 'skill.description.vaguee': 'off' });
    const config = readConfig(uri('/w/my-skill/SKILL.md') as never);
    expect(
      config.configurationWarnings.some((w) => w.message.includes('skill.description.vaguee')),
    ).toBe(true);
  });
});

describe('D — collision numerics never produce NaN', () => {
  const skills = [
    { name: 'invoice-extractor', description: 'Extract line items from PDF invoices into a CSV.' },
    { name: 'weather-reporter', description: 'Summarize a forecast for a city into a short note.' },
  ];

  for (const [label, weights] of Object.entries({
    'a non-numeric weight': { cosine: 'high' },
    'a NaN weight': { cosine: Number.NaN },
    'a negative weight': { scopeOverlap: -5 },
    'an infinite weight': { jaccard: Number.POSITIVE_INFINITY },
  })) {
    it(`falls back to the defaults for ${label}`, () => {
      const collisions = detectCollisions(skills, {
        weights: weights as never,
        threshold: 0,
      });
      for (const collision of collisions) {
        expect(Number.isFinite(collision.similarity), `similarity=${collision.similarity}`).toBe(
          true,
        );
        for (const value of Object.values(collision.metrics)) {
          expect(Number.isFinite(value)).toBe(true);
        }
      }
    });
  }

  it('does not report every pair for a NaN threshold', () => {
    // `NaN < NaN` is false, so an unguarded NaN threshold reported *every* pair
    // — 124,750 of them in a 500-skill workspace.
    const subjects = [
      'Extract line items from PDF invoices into a CSV spreadsheet',
      'Rotate and compress JPEG photographs for a web gallery',
      'Summarize a weather forecast for a city into a short note',
      'Translate German product manuals into Japanese',
      'Lint Terraform modules against an internal style guide',
      'Generate release notes from a git commit range',
      'Convert MIDI files into printable sheet music',
      'Audit npm dependencies for known vulnerabilities',
      'Transcribe podcast audio into a timestamped script',
      'Plot quarterly revenue as a bar chart image',
    ];
    const many = subjects.map((subject, i) => ({
      name: `skill-${i}`,
      description: `${subject}. Use when the user asks for that specific output.`,
    }));
    const all = (many.length * (many.length - 1)) / 2;
    const reported = detectCollisions(many, { threshold: Number.NaN });
    expect(reported.length).toBeLessThan(all);
    // A NaN threshold falls back to the default, which reports these as distinct.
    expect(reported).toEqual(detectCollisions(many));
  });

  it('clamps ngramSize into a usable range', () => {
    expect(() => detectCollisions(skills, { ngramSize: 0 })).not.toThrow();
    expect(() => detectCollisions(skills, { ngramSize: Number.NaN })).not.toThrow();
    const huge = detectCollisions(skills, { ngramSize: 100_000, threshold: 0 });
    for (const collision of huge) {
      expect(Number.isFinite(collision.metrics.charNgram)).toBe(true);
    }
  });

  it('surfaces a configuration warning for malformed weights', () => {
    set('collision.weights', { cosine: 'high' });
    const config = readConfig(uri('/w/my-skill/SKILL.md') as never);
    expect(config.configurationWarnings.some((w) => w.setting.includes('collision'))).toBe(true);
  });
});

describe('E — profile length settings are clamped', () => {
  it('clamps description.maxLength: 0 to something usable', () => {
    set('description.maxLength', 0);
    const { profile, configurationWarnings } = readConfig(uri('/w/my-skill/SKILL.md') as never);
    expect(profile.description.maxLength).toBeGreaterThan(profile.description.minLength);
    expect(configurationWarnings.some((w) => w.setting.includes('description.maxLength'))).toBe(
      true,
    );
    const diagnostics = validateDescription(
      skillDoc({
        name: 'my-skill',
        description: 'Extract line items from PDF invoices. Use when the user asks for a CSV.',
      }),
      profile,
    );
    expect(diagnostics.map((d) => d.code)).not.toContain(DiagnosticCode.DescriptionTooLong);
  });

  it('corrects an inverted min/max pair instead of obeying it', () => {
    set('description.minLength', 500);
    set('description.maxLength', 100);
    const { profile } = readConfig(uri('/w/my-skill/SKILL.md') as never);
    expect(profile.description.minLength).toBeLessThanOrEqual(profile.description.maxLength);
  });

  it('clamps a negative name.maxLength', () => {
    set('name.maxLength', -3);
    const { profile } = readConfig(uri('/w/my-skill/SKILL.md') as never);
    expect(profile.nameMaxLength).toBeGreaterThan(0);
  });
});

describe('F — description length is measured in code points', () => {
  it('counts astral characters once', () => {
    const description = '🙂'.repeat(520);
    expect(analyzeDescription(description).length).toBe(520);
  });

  it('reports the code-point count in the too-long message', () => {
    const profile = resolveProfile();
    const description = '🙂'.repeat(2000); // 2000 code points, 4000 UTF-16 units
    const diagnostics = validateDescription(
      skillDoc({ name: 'my-skill', description }),
      profile,
    );
    const tooLong = diagnostics.find((d) => d.code === DiagnosticCode.DescriptionTooLong);
    expect(tooLong?.message).toContain('2000');
    expect(tooLong?.message).not.toContain('4000');
  });
});

describe('G — tooShort and tooVerbose can never both fire', () => {
  it('suppresses tooVerbose when the profile asks for more than 500 characters', () => {
    const profile = resolveProfile({ descriptionMinLength: 600 });
    const diagnostics = validateDescription(
      skillDoc({ name: 'my-skill', description: 'a '.repeat(275) }),
      profile,
    );
    const codes = diagnostics.map((d) => d.code);
    expect(codes).toContain(DiagnosticCode.DescriptionTooShort);
    expect(codes).not.toContain(DiagnosticCode.DescriptionTooVerbose);
  });

  it('still reports tooVerbose under the default profile', () => {
    const profile = resolveProfile();
    const diagnostics = validateDescription(
      skillDoc({ name: 'my-skill', description: 'a '.repeat(275) }),
      profile,
    );
    expect(diagnostics.map((d) => d.code)).toContain(DiagnosticCode.DescriptionTooVerbose);
  });
});
