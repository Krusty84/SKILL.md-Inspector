import { describe, it, expect } from 'vitest';
import { parseSkillFile } from '../src/parser/parseSkillFile';
import { evaluatePortability } from '../src/workspace/portability';
import { DiagnosticCode } from '../src/types/DiagnosticCode';
import type { SkillProfileId } from '../src/types/SkillProfile';

const CLEAN_BODY = [
  '# Body',
  '',
  '## Examples',
  '',
  'text',
  '',
  '## When to use',
  '',
  'Use when needed. Do not use for x.',
].join('\n');

function docFrom(frontmatter: string[], body = CLEAN_BODY) {
  const content = ['---', ...frontmatter, '---', '', body].join('\n');
  return parseSkillFile('/ws/standalone/SKILL.md', content);
}

function entry(frontmatter: string[], profile: SkillProfileId, body?: string) {
  return evaluatePortability(docFrom(frontmatter, body)).find((e) => e.profile === profile)!;
}

describe('evaluatePortability per-profile (Tasks 41/42)', () => {
  it('validates each profile independently with its own diagnostics', () => {
    const longDescription = `Format inspection reports using claude. ${'x'.repeat(520)}`;
    const doc = docFrom(['name: report-formatter', `description: ${longDescription}`]);
    const entries = evaluatePortability(doc);
    const generic = entries.find((e) => e.profile === 'generic')!;
    const claude = entries.find((e) => e.profile === 'claude')!;

    expect(claude.status).toBe('warning');
    expect(claude.diagnostics.some((d) => d.code === DiagnosticCode.MetadataReservedWord)).toBe(
      true,
    );
    expect(
      claude.diagnostics.some((d) => d.code === DiagnosticCode.PortabilityClaudeDescriptionLong),
    ).toBe(true);
    // The Claude-specific reserved-word rule does not apply to generic.
    expect(generic.status).toBe('pass');
    expect(generic.diagnostics).toEqual([]);
  });

  it('fails every profile on a shared baseline error', () => {
    const entries = evaluatePortability(
      docFrom(['name: Bad Name', 'description: Format inspection reports using company rules.']),
    );
    expect(entries.every((e) => e.status === 'fail')).toBe(true);
  });
});

describe('Codex portability (Tasks 47/48)', () => {
  it('does not warn on a bundled script (no script downgrade, Task 47)', () => {
    // No remote/broken links, no metadata issues -> Codex passes even if it ran scripts.
    expect(
      entry(
        [
          'name: script-user',
          'description: Run project scripts. Use when building. Do not use for docs.',
        ],
        'codex',
      ).status,
    ).toBe('pass');
  });

  it('passes a documentation URL but warns on a remote executable (Task 48)', () => {
    const docBody =
      '# Body\n\nSee [guide](https://example.com/guide).\n\n## Examples\n\ntext\n\n## When to use\n\nUse when needed. Do not use for x.';
    const exeBody =
      '# Body\n\nGrab [tool](https://example.com/tool.exe).\n\n## Examples\n\ntext\n\n## When to use\n\nUse when needed. Do not use for x.';
    const desc =
      'description: Format inspection reports cleanly. Use when needed. Do not use for x.';

    expect(entry(['name: doc-user', desc], 'codex', docBody).status).toBe('pass');

    const exe = entry(['name: exe-user', desc], 'codex', exeBody);
    expect(exe.status).toBe('warning');
    expect(exe.diagnostics.some((d) => d.code === DiagnosticCode.LinkRemoteSuspicious)).toBe(true);
  });
});
