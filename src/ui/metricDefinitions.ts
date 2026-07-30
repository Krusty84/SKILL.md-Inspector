import * as l10n from '@vscode/l10n';
import type { AuthoringLabel } from '../authoring/authoringQuality';
import type { CompatibilityVerdict } from '../types/AgentCompatibility';

/**
 * One-sentence definitions of the reported metrics, shared by every surface that
 * shows them (skill report, workspace report, tree hover) so a heading and its
 * tooltip can never drift apart.
 *
 * Each metric name states what the code actually computes: `Description
 * completeness` counts convention coverage, `Authoring hygiene` counts
 * structural defects. Neither is a judgement of the content, and the wording
 * below is what says so to the reader.
 *
 * Functions, not constants, so the text is resolved after the l10n bundle is
 * configured. The English defaults contain no HTML metacharacters, so callers
 * inline them into `title` attributes verbatim rather than escaped; translated
 * bundles must respect the same constraint.
 */
export function descriptionCompletenessDefinition(): string {
  return l10n.t(
    "How many of 7 structural conventions the description satisfies (capability verb, usage trigger, concrete artifact, boundary, front-loaded intent, low vagueness, length). Convention coverage, not a judgement of the wording's usefulness.",
  );
}

export function authoringHygieneDefinition(): string {
  return l10n.t(
    'Structural defects in the Markdown body and bundled resources (empty sections, unclosed fences, placeholders, repetition, size). It does not assess whether the instructions are correct or safe.',
  );
}

export function lowTextCoverageDefinition(): string {
  return l10n.t(
    'Fewer than 3 comparable content tokens (often non-Latin script); this similarity is derived mostly from the skill names.',
  );
}

export function agentCompatibilityDefinition(): string {
  return l10n.t(
    'Per-agent verdicts from projecting the skill against documented agent behavior (spec baseline, Claude Code, Codex, OpenCode). A static projection, not a runtime test.',
  );
}

export function securityDefinition(): string {
  return l10n.t(
    'Static security findings in the SKILL.md and its bundled files: dangerous or risky commands, risky public services, hardcoded credentials, prompt-injection wording, hidden content, and sensitive-path references. Offline analysis; nothing is executed.',
  );
}

/** Shown by both reports when the settings disable every compatibility agent. */
export function compatibilityAllAgentsDisabledText(): string {
  return l10n.t('All compatibility agents are disabled in the extension settings.');
}

/** Visible headings for the two hygiene sections of the skill report. */
export function authoringHygieneInstructionsHeading(): string {
  return l10n.t('Authoring hygiene (instructions)');
}
export function authoringHygieneResourcesHeading(): string {
  return l10n.t('Authoring hygiene (resources)');
}

/**
 * Renders an `AuthoringLabel` for readers. The stored labels are kebab-case
 * because they are also a machine-readable field of the exported index; the
 * display form is localized here.
 */
export function authoringLabelText(label: AuthoringLabel): string {
  switch (label) {
    case 'clean':
      return l10n.t('Clean');
    case 'minor-issues':
      return l10n.t('Minor issues');
    case 'issues':
      return l10n.t('Issues');
    case 'defects':
      return l10n.t('Defects');
  }
}

/**
 * Reader-facing wording for a compatibility verdict. `not-evaluated` must
 * always render as words, never as an empty or zero-like cell.
 */
export function compatibilityVerdictText(verdict: CompatibilityVerdict): string {
  switch (verdict) {
    case 'compatible':
      return l10n.t('compatible');
    case 'notes':
      return l10n.t('compatible with notes');
    case 'issues':
      return l10n.t('issues');
    case 'not-evaluated':
      return l10n.t('not evaluated');
  }
}

/**
 * The verbatim scope statement under every compatibility table (plan §7); the
 * README reuses the same sentence so the surfaces cannot drift apart.
 */
export function compatibilityFooterText(verifiedOn: string): string {
  return l10n.t(
    'Based on documented behavior verified on {0}. This is a static projection, not a runtime test — it does not prove an agent will select or correctly execute the skill.',
    verifiedOn,
  );
}
