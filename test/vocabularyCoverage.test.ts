/**
 * Reproduce-first suite for plan 9 Part A
 * (docs/remediation/plan-9-vocabulary-and-ceilings.md).
 *
 * Every assertion here describes the *target* vocabulary coverage, not the
 * coverage that existed when the file was written. The measured baseline was 39
 * action verbs and 68 artifact hints, which meant a synonym outside those lists
 * cost 41 points and two label bands.
 */
import { describe, expect, it } from 'vitest';
import { analyzeArtifactEvidence, hasActionVerb } from '../src/quality/descriptionHeuristics';
import { computeStaticDescriptionQuality } from '../src/quality/staticDescriptionQuality';
import { DEFAULT_HEURISTIC_DICTIONARIES } from '../src/quality/dictionaries';

/**
 * Verbs the round-3 evaluation found unrecognized. Each is ordinary skill
 * vocabulary, and each hard-capped a description at 59 before this plan.
 */
const REQUIRED_VERBS = [
  'customize',
  'modify',
  'configure',
  'initialize',
  'visualize',
  'simplify',
  'edit',
  'fix',
  'manipulate',
  'delete',
  'remove',
  'fetch',
  'download',
  'upload',
  'send',
  'deploy',
  'install',
  'search',
  'filter',
  'sort',
  'merge',
  'split',
  'encrypt',
  'publish',
  'monitor',
  'simulate',
  'optimize',
  'estimate',
  'predict',
  'rank',
  'sync',
  'backup',
  'restore',
  'rename',
  'copy',
  'move',
  'export',
  'check',
  'verify',
  'audit',
  'scan',
  'measure',
  'count',
  'aggregate',
  'resize',
  'crop',
  'rotate',
  'embed',
];

/** A whole locale failed before: every -ize/-yze verb needs its -ise/-yse spelling. */
const REQUIRED_BRITISH_SPELLINGS = [
  'summarise',
  'organise',
  'normalise',
  'standardise',
  'analyse',
  'customise',
  'optimise',
  'visualise',
  'initialise',
];

/** Artifact terms the evaluation found unrecognized, in the plan's own order. */
const REQUIRED_ARTIFACTS = [
  'chart',
  'dashboard',
  'data visualization',
  'slide deck',
  'presentation',
  'Word document',
  'Slack message',
  'Jira ticket',
  'Kubernetes manifest',
  'Dockerfile',
  'Terraform module',
  'Helm chart',
  'Jupyter notebook',
  'OpenAPI spec',
  'shell script',
  'git branch',
  'stack trace',
  'regex pattern',
  'resume',
  'purchase order',
  'tax return',
  'balance sheet',
  'lease agreement',
  'lab result',
  'patient chart',
];

describe('action-verb vocabulary coverage', () => {
  it.each(REQUIRED_VERBS)('recognizes "%s" as a capability verb', (verb) => {
    expect(hasActionVerb(verb).found).toBe(true);
  });

  it.each(REQUIRED_BRITISH_SPELLINGS)('recognizes the British spelling "%s"', (verb) => {
    expect(hasActionVerb(verb).found).toBe(true);
  });

  it('reaches the size the plan targets', () => {
    expect(DEFAULT_HEURISTIC_DICTIONARIES.actionVerbs.length).toBeGreaterThanOrEqual(140);
  });

  it('pairs every -ize/-yze verb with its -ise/-yse spelling', () => {
    // Exhaustive rather than a sample: the whole point is that no locale is left
    // scoring as if it had stated no capability, and a spot check would let the
    // next added verb quietly reintroduce that.
    const verbs = new Set(DEFAULT_HEURISTIC_DICTIONARIES.actionVerbs);
    const missing = [...verbs]
      .filter((verb) => verb.endsWith('ize') || verb.endsWith('yze'))
      .map((verb) => ({
        verb,
        twin: `${verb.slice(0, -3)}${verb.endsWith('ize') ? 'ise' : 'yse'}`,
      }))
      .filter(({ twin }) => !verbs.has(twin));
    expect(missing).toEqual([]);
  });

  it('keeps the verb list free of duplicates and of non-lowercase entries', () => {
    const verbs = DEFAULT_HEURISTIC_DICTIONARIES.actionVerbs;
    expect(new Set(verbs).size).toBe(verbs.length);
    for (const verb of verbs) {
      expect(verb, verb).toBe(verb.toLowerCase());
    }
  });
});

/**
 * The plan's collateral-damage audit outranks its enumeration. `actionVerbs` is
 * excluded from the collision Jaccard set, so promoting a word that names what a
 * skill operates *on* erases real scope signal. Where the two conflicted the
 * audit won, and the resolution is pinned here rather than left as a silent
 * omission from the list above.
 *
 * The tie-breaker was measured, not guessed: over the 74 real skill markdown
 * files plus the plan-8 corpus, a word counts as a noun when it appears in
 * determiner position ("the model") at least 3 times and at least twice as often
 * as in imperative position. `model`, `index`, `label`, `chart`, and `profile`
 * are the five the plan names outright.
 */
describe('noun/verb audit decisions', () => {
  it.each(['chart', 'model', 'index', 'label', 'profile', 'query', 'benchmark'])(
    'routes "%s" to the artifact lists, not the verb list',
    (word) => {
      expect(DEFAULT_HEURISTIC_DICTIONARIES.actionVerbs).not.toContain(word);
      expect(analyzeArtifactEvidence(word).found).toBe(true);
    },
  );

  it.each(['design', 'plan'])('treats "%s" as a low-signal container noun', (word) => {
    expect(DEFAULT_HEURISTIC_DICTIONARIES.actionVerbs).not.toContain(word);
    expect(DEFAULT_HEURISTIC_DICTIONARIES.lowSignalArtifactTerms).toContain(word);
    // Not a concrete artifact on its own — but Part B's structural evidence still
    // reads "Design the wing spar" as a stated capability, so routing these away
    // from the verb list does not push good descriptions into "weak".
    expect(analyzeArtifactEvidence(word).found).toBe(false);
  });

  it('abstains on "import", which is neither a capability nor an artifact', () => {
    // Measured 4 noun / 0 verb, but "an import" names no domain object either.
    // Listing it as an artifact would be worse than leaving it out.
    expect(DEFAULT_HEURISTIC_DICTIONARIES.actionVerbs).not.toContain('import');
    expect(DEFAULT_HEURISTIC_DICTIONARIES.artifactHints).not.toContain('import');
  });

  it('keeps every pre-existing artifact hint out of the verb list', () => {
    // The one exception, `test`, predates this plan and is left alone.
    const verbs = new Set(DEFAULT_HEURISTIC_DICTIONARIES.actionVerbs);
    const both = DEFAULT_HEURISTIC_DICTIONARIES.artifactHints.filter((hint) => verbs.has(hint));
    expect(both).toEqual(['test']);
  });
});

describe('artifact vocabulary coverage', () => {
  it.each(REQUIRED_ARTIFACTS)('recognizes "%s" as concrete artifact evidence', (artifact) => {
    expect(analyzeArtifactEvidence(artifact).found).toBe(true);
  });

  it('reaches the size the plan targets', () => {
    const { artifactHints, multiWordArtifacts } = DEFAULT_HEURISTIC_DICTIONARIES;
    expect(artifactHints.length + multiWordArtifacts.length).toBeGreaterThanOrEqual(240);
  });

  it('keeps the artifact lists free of duplicates', () => {
    const { artifactHints, multiWordArtifacts } = DEFAULT_HEURISTIC_DICTIONARIES;
    expect(new Set(artifactHints).size).toBe(artifactHints.length);
    expect(new Set(multiWordArtifacts).size).toBe(multiWordArtifacts.length);
    // A multi-word phrase in the single-token list can never match, and a
    // single token in the phrase list is matched twice.
    for (const hint of artifactHints) {
      expect(hint.includes(' '), hint).toBe(false);
    }
    for (const phrase of multiWordArtifacts) {
      expect(phrase.includes(' '), phrase).toBe(true);
    }
  });
});

describe('a recognized verb scores the description it belongs to', () => {
  it("scores the dictionary-verb form of the plan's example highly", () => {
    // Its synonym twin ("Pull tables from…") is asserted in
    // structuralEvidence.test.ts: closing that 41-point gap is Part B's job, not
    // something dictionary growth can do.
    const result = computeStaticDescriptionQuality(
      'Extract tables from PDF invoices. Use when the user needs invoice line items. Do not use for images.',
    );
    expect(result.score).toBeGreaterThanOrEqual(90);
  });
});
