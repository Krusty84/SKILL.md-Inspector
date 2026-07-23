import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { analyzeSkill } from '../src/analysis/analyzeSkill';
import { countO200kTokens } from '../src/analysis/o200kTokenizer';
import { totalSkillTokens } from '../src/analysis/tokenUsage';
import { genericProfile } from '../src/profiles';
import { DiagnosticCode } from '../src/types/DiagnosticCode';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-token-usage-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('o200k_base token metrics', () => {
  it('initializes the lightweight tokenizer and returns a known basic count', () => {
    expect(countO200kTokens('hello world')).toBe(2);
    expect(countO200kTokens('hello world')).toBe(2);
    expect(countO200kTokens('<|endoftext|>')).toBeGreaterThan(1);
  });

  it('totalSkillTokens sums the body, reference, and other-file totals', () => {
    const usage = {
      encoding: 'o200k_base' as const,
      body: { tokens: 320, lines: 12 },
      references: { files: [], totalTokens: 80 },
      otherFiles: { files: [], totalTokens: 15 },
    };
    expect(totalSkillTokens(usage)).toBe(415);
  });

  it('counts only the Markdown body after frontmatter', () => {
    const content = [
      '---',
      'name: frontmatter-words-that-must-not-count',
      'description: Count only body content. Use when testing. Do not use otherwise.',
      '---',
      'hello world',
    ].join('\n');
    const analysis = analyzeSkill(path.join(dir, 'SKILL.md'), content, genericProfile);

    expect(analysis.document.body).toBe('hello world');
    expect(analysis.tokenUsage.body.tokens).toBe(2);
    expect(analysis.tokenUsage.body.tokens).not.toBe(countO200kTokens(content));
  });

  it('classifies recursive resources, sorts paths, and skips hidden and binary files', () => {
    write('references/z.md', 'zulu');
    write('references/nested/a.md', 'alpha');
    write('scripts/run.txt', 'excluded script');
    write('assets/readme.txt', 'excluded asset');
    write('templates/card.txt', 'template content');
    write('unknown/note.txt', 'unknown content');
    write('references/.secret.md', 'hidden reference');
    write('.hidden/note.md', 'hidden directory');
    write('node_modules/package/ignored.txt', 'excluded dependency');
    write('dist/ignored.txt', 'excluded output');
    write('references/image.png', 'text in a known media extension');
    writeBuffer('references/data.unknown', Buffer.from([0, 1, 2, 3, 4]));

    const usage = analyzeSkill(path.join(dir, 'SKILL.md'), validSkill(), genericProfile).tokenUsage;

    expect(usage.references.files.map((entry) => entry.relativePath)).toEqual([
      'references/nested/a.md',
      'references/z.md',
    ]);
    expect(usage.otherFiles.files.map((entry) => entry.relativePath)).toEqual([
      'templates/card.txt',
      'unknown/note.txt',
    ]);
    expect(usage.references.totalTokens).toBe(countO200kTokens('alpha') + countO200kTokens('zulu'));
    expect(usage.otherFiles.totalTokens).toBe(
      countO200kTokens('template content') + countO200kTokens('unknown content'),
    );
  });

  it('text-only analysis never discovers resources and emits no resource-budget diagnostics', () => {
    const body = Array.from({ length: 501 }, () => 'Follow this instruction.').join('\n');
    const content = `${validSkill()}\n${body}`;
    let discoveryCalled = false;
    const analysis = analyzeSkill(path.join(dir, 'SKILL.md'), content, genericProfile, {
      mode: 'text-only',
      discover: () => {
        discoveryCalled = true;
        throw new Error('filesystem discovery must not run');
      },
    });

    expect(discoveryCalled).toBe(false);
    expect('references' in analysis.tokenUsage).toBe(false);
    const tokenCodes = analysis.diagnostics
      .map((diagnostic) => diagnostic.code)
      .filter((code) => code.startsWith('skill.token.'));
    expect(tokenCodes).toContain(DiagnosticCode.BodyLineLimit);
    expect(tokenCodes).not.toContain(DiagnosticCode.ReferenceFileTokenLimit);
    expect(tokenCodes).not.toContain(DiagnosticCode.ReferencesTokenLimit);
    expect(tokenCodes).not.toContain(DiagnosticCode.OtherFilesTokenLimit);
  });
});

function validSkill(): string {
  return [
    '---',
    'name: skill-token-usage-test',
    'description: Analyze token usage. Use when testing token metrics. Do not use otherwise.',
    '---',
    '# Instructions',
  ].join('\n');
}

function write(relativePath: string, content: string): void {
  const absolutePath = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

function writeBuffer(relativePath: string, content: Buffer): void {
  const absolutePath = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}
