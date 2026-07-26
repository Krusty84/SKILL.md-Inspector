import type { AuthoringLabel } from '../authoring/authoringQuality';

/**
 * Short definitions of the reported metrics, shared by every surface that
 * shows them (skill report, workspace report, tree hover) so a heading and its
 * tooltip can never drift apart.
 *
 * Each metric name states what the code actually computes: `Description
 * completeness` counts convention coverage, `Authoring hygiene` counts
 * structural defects. Neither is a judgement of the content, and the wording
 * below is what says so to the reader.
 *
 * These are static literals with no HTML metacharacters, so they are inlined
 * into `title` attributes verbatim rather than escaped.
 */
export const DESCRIPTION_COMPLETENESS_DEFINITION =
  "How many of 7 structural conventions the description satisfies (capability verb, usage trigger, concrete artifact, boundary, front-loaded intent, low vagueness, length). Convention coverage, not a judgement of the wording's usefulness. It is deterministic and does not guarantee that an agent will select this skill at runtime.";

export const AUTHORING_HYGIENE_DEFINITION =
  'Structural defects in the Markdown body and bundled resources (empty sections, unclosed fences, placeholders, repetition, size). It does not assess whether the instructions are correct or safe.';

export const LOW_TEXT_COVERAGE_DEFINITION =
  'Fewer than 3 comparable content tokens (often non-Latin script); this similarity is derived mostly from the skill names.';

/** Visible headings for the two hygiene sections of the skill report. */
export const AUTHORING_HYGIENE_INSTRUCTIONS_HEADING = 'Authoring hygiene (instructions)';
export const AUTHORING_HYGIENE_RESOURCES_HEADING = 'Authoring hygiene (resources)';

/**
 * Renders an `AuthoringLabel` for readers. The stored labels are kebab-case
 * because they are also a machine-readable field of the exported index; only the
 * spacing and capitalization differ here.
 */
export function authoringLabelText(label: AuthoringLabel): string {
  return label === 'minor-issues' ? 'Minor issues' : label.charAt(0).toUpperCase() + label.slice(1);
}
