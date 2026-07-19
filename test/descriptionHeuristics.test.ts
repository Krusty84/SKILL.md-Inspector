import { describe, it, expect } from 'vitest';
import {
  analyzeDescription,
  hasActionVerb,
  isFrontLoaded,
  tokenize,
  hasPositiveTriggerPhrase,
  hasNegativeBoundaryPhrase,
  hasExclusiveTriggerPhrase,
} from '../src/quality/descriptionHeuristics';
import {
  DEFAULT_HEURISTIC_DICTIONARIES,
  resolveHeuristicDictionaries,
} from '../src/quality/dictionaries';

describe('descriptionHeuristics', () => {
  it('detects action verbs across common inflections', () => {
    expect(hasActionVerb('Format the report').found).toBe(true);
    expect(hasActionVerb('Formats the report').found).toBe(true);
    expect(hasActionVerb('Formatting the report').found).toBe(true);
    expect(hasActionVerb('Generates release notes').found).toBe(true);
    expect(hasActionVerb('Classified the input').found).toBe(true);
    expect(hasActionVerb('A helper for documents').found).toBe(false);
  });

  it('detects positive trigger phrases', () => {
    expect(hasPositiveTriggerPhrase('Use when the user needs a report').found).toBe(true);
    expect(hasPositiveTriggerPhrase('Format the report').found).toBe(false);
  });

  it('does not credit a negative boundary as a positive trigger', () => {
    expect(hasPositiveTriggerPhrase('Do not use when the input is a contract').found).toBe(false);
    expect(hasNegativeBoundaryPhrase('Do not use when the input is a contract').found).toBe(true);
    expect(hasNegativeBoundaryPhrase('Format the report').found).toBe(false);
  });

  it('treats "only use when" as both a positive trigger and an exclusive boundary', () => {
    expect(hasPositiveTriggerPhrase('Only use when preparing a release').found).toBe(true);
    expect(hasExclusiveTriggerPhrase('Only use when preparing a release').found).toBe(true);
    expect(hasNegativeBoundaryPhrase('Only use when preparing a release').found).toBe(false);
    expect(hasExclusiveTriggerPhrase('Use when needed').found).toBe(false);
  });

  it('detects vague wording including simple plurals', () => {
    expect(analyzeDescription('Helps with documents.').vagueTerms).toContain('help');
    expect(analyzeDescription('A powerful and smart tool').vagueTerms).toEqual(
      expect.arrayContaining(['powerful', 'smart']),
    );
  });

  it('recognizes concrete artifacts and acronyms', () => {
    expect(analyzeDescription('Format inspection reports').concreteArtifact).toBe(true);
    expect(analyzeDescription('Convert to PDF').concreteArtifact).toBe(true);
    expect(analyzeDescription('Generate SQL').concreteArtifact).toBe(true); // registry-only acronym
    expect(analyzeDescription('Does helpful things generally').concreteArtifact).toBe(false);
  });

  it('does not treat ordinary uppercase words as artifacts', () => {
    expect(analyzeDescription('Format IMPORTANT THINGS.').concreteArtifact).toBe(false);
    expect(analyzeDescription('Make it GOOD.').concreteArtifact).toBe(false);
  });

  it('does not treat decimals or version numbers as file extensions', () => {
    expect(analyzeDescription('Compute pi to 3.14 precision.').concreteArtifact).toBe(false);
    expect(analyzeDescription('Round totals to 0.50 increments.').concreteArtifact).toBe(false);
    expect(analyzeDescription('Convert .md notes.').concreteArtifact).toBe(true);
    expect(analyzeDescription('Unpack .7z archives.').concreteArtifact).toBe(true);
  });

  it('matches hyphenated vague terms as whole phrases', () => {
    expect(analyzeDescription('A general-purpose helper for anything.').vagueTerms).toContain('general-purpose');
    expect(analyzeDescription('The general approach works well here.').vagueTerms).toContain('general');
  });

  it('tokenizes Latin, Cyrillic, accented, and CJK text', () => {
    expect(tokenize('Format reports')).toEqual(['format', 'reports']);
    expect(tokenize('Форматировать отчёт').length).toBe(2);
    expect(tokenize('café résumé').length).toBe(2);
    expect(tokenize('日本語 テキスト').length).toBeGreaterThan(0);
  });

  it('detects irregular action-verb forms', () => {
    expect(hasActionVerb('wrote the report').found).toBe(true);
    expect(hasActionVerb('written documentation').found).toBe(true);
    expect(hasActionVerb('reads files').found).toBe(true);
    expect(hasActionVerb('built the pipeline').found).toBe(true);
  });

  it('does not consonant-double multisyllabic verbs', () => {
    expect(hasActionVerb('formatting the report').found).toBe(true);
    expect(hasActionVerb('debugged the script').found).toBe(true);
    expect(hasActionVerb('rendering the template').found).toBe(true); // correct form
    expect(hasActionVerb('renderring the template').found).toBe(false); // invalid doubled form
    expect(hasActionVerb('refactorring the code').found).toBe(false);
  });

  it('does not accept the single-consonant misspellings of CVC verbs', () => {
    expect(hasActionVerb('Formating the report').found).toBe(false);
    expect(hasActionVerb('Formated the report').found).toBe(false);
    expect(hasActionVerb('Debuging the script').found).toBe(false);
  });

  it('scopes irregular verbs to the configured action-verb registry', () => {
    const custom = resolveHeuristicDictionaries({ actionVerbs: ['convert'] });
    expect(hasActionVerb('Wrote the report', custom).found).toBe(false);
    expect(hasActionVerb('Built the pipeline', custom).found).toBe(false);
    expect(hasActionVerb('Converted the report', custom).found).toBe(true);
  });

  it('recognizes configured action verbs and explicit forms without built-in leakage', () => {
    const custom = resolveHeuristicDictionaries({
      actionVerbs: ['teach'],
      actionVerbForms: { teach: ['teach', 'teaches', 'teaching', 'taught'] },
    });
    expect(hasActionVerb('Teach API conventions', custom).found).toBe(true);
    expect(hasActionVerb('Taught API conventions', custom).found).toBe(true);
    expect(hasActionVerb('Written API conventions', custom).found).toBe(false);
    expect(hasActionVerb('Built API conventions', custom).found).toBe(false);
  });

  it.each([
    ['Diagnose failing HTTP calls.', 'diagnose'],
    ['This skill diagnoses failing HTTP calls.', 'diagnoses'],
    ['Use this skill when generating PDF reports.', 'generating'],
    ['When asked to summarize a design document, extract the decisions.', 'summarize'],
  ])('matches a capability in an allowed leading position: %s', (description, matched) => {
    const analysis = analyzeDescription(description);
    expect(analysis.actionVerb).toEqual({ found: true, matched });
    expect(analysis.frontLoadedIntent.found).toBe(true);
    expect(analysis.frontLoadedIntent.matchedCapability).toBe(matched);
  });

  it.each([
    'A test case for API behavior. Use when debugging failures.',
    'Formatting rules for source files. Use when reviewing style.',
    'A report containing generated output. Use when reviewing results.',
  ])('does not treat a later noun or adjective as action evidence: %s', (description) => {
    const analysis = analyzeDescription(description);
    expect(analysis.actionVerb.found).toBe(false);
    expect(analysis.frontLoadedIntent.found).toBe(false);
  });

  it('applies positional matching to custom action verbs', () => {
    const custom = resolveHeuristicDictionaries({ actionVerbs: ['frobnicate'] });
    expect(analyzeDescription('Frobnicate API widgets.', custom).actionVerb).toEqual({
      found: true,
      matched: 'frobnicate',
    });
    expect(analyzeDescription('This skill frobnicates API widgets.', custom).actionVerb.found).toBe(
      true,
    );
    expect(
      analyzeDescription('Use this skill when frobnicating API widgets.', custom).actionVerb.found,
    ).toBe(true);
    expect(
      analyzeDescription(
        'A frobnicate example for API widgets. Use when reviewing failures.',
        custom,
      ).actionVerb.found,
    ).toBe(false);
  });

  it('matches typographic apostrophes in boundary phrases', () => {
    expect(hasNegativeBoundaryPhrase('Don’t use for legal transcripts.').found).toBe(true);
    const analysis = analyzeDescription('Summarize meeting notes. Don’t use when drafting contracts.');
    expect(analysis.triggerClause.markerFound).toBe(false); // inner "use when" must not leak
    expect(analysis.boundaryClause.contentFound).toBe(true);
  });

  it('front-loads only when a verb starts the text and an object follows', () => {
    expect(isFrontLoaded('format technical reports using company rules')).toBe(true);
    expect(isFrontLoaded('generates release notes from commit history')).toBe(true);
    expect(isFrontLoaded('format reports')).toBe(true);
    expect(isFrontLoaded('analyze log files')).toBe(true);
    expect(isFrontLoaded('analyze when needed')).toBe(false); // verb, no meaningful task
    expect(isFrontLoaded('analyze and help when needed')).toBe(false);
    expect(isFrontLoaded('a general utility for teams that can analyze many things')).toBe(false);
  });
});

describe('scope-clause selection and artifact signal', () => {
  it('selects the earliest strongest marker across sentences, lines, and casing', () => {
    expect(analyzeDescription('Use when needed. Use when processing PDF invoices.').triggerClause.contentFound).toBe(true);
    expect(analyzeDescription('Use when processing PDF invoices. USE WHEN needed.').triggerClause.matched).toBe('use when');
    expect(analyzeDescription('Do not use when needed.\nDo not use when processing legal contracts.').boundaryClause.contentFound).toBe(true);
    const analysis = analyzeDescription('Do not use when handling invoices. Use when processing PDF reports.');
    expect(analysis.triggerClause.contentFound).toBe(true);
    expect(analysis.triggerClause.contentTokens).toContain('pdf');
  });

  it('credits an uppercase ambiguous acronym as single-token clause content', () => {
    expect(analyzeDescription('Validate assemblies. Use for STEP.').triggerClause.contentFound).toBe(true);
    expect(analyzeDescription('Validate assemblies. Use for step.').triggerClause.contentFound).toBe(false);
    expect(analyzeDescription('Validate assemblies. Use for SQL.').triggerClause.contentFound).toBe(true);
  });

  it('does not credit generic artifacts without supporting context', () => {
    expect(analyzeDescription('Process files when needed.').concreteArtifact).toBe(false);
    expect(analyzeDescription('Handle data.').concreteArtifact).toBe(false);
    expect(analyzeDescription('Work with code.').concreteArtifact).toBe(false);
    expect(analyzeDescription('Validate STEP assemblies before CAD release.').concreteArtifact).toBe(true);
    expect(analyzeDescription('Analyze CAN telemetry from vehicle ECUs.').concreteArtifact).toBe(true);
    expect(analyzeDescription('Review Python code for API schema migrations.').concreteArtifact).toBe(true);
  });

  it('uses editable scope vagueness and restrictive boundary policy', () => {
    const concreteNeeded = resolveHeuristicDictionaries({
      scopeVagueTerms: DEFAULT_HEURISTIC_DICTIONARIES.scopeVagueTerms.filter(
        (term) => term !== 'needed',
      ),
    });
    expect(
      analyzeDescription('Format reports. Use when needed.', concreteNeeded).triggerClause
        .contentFound,
    ).toBe(true);

    const customBoundary = resolveHeuristicDictionaries({
      restrictiveBoundaryPhrases: [
        ...DEFAULT_HEURISTIC_DICTIONARIES.restrictiveBoundaryPhrases,
        'reserved for',
      ],
    });
    expect(
      analyzeDescription('Format reports. Reserved for audited releases.', customBoundary)
        .boundaryClause.contentFound,
    ).toBe(true);
  });

  it('uses editable artifact support and uppercase-only acronym policy', () => {
    const customArtifact = resolveHeuristicDictionaries({
      artifactHints: [...DEFAULT_HEURISTIC_DICTIONARIES.artifactHints, 'widget'],
    });
    expect(analyzeDescription('Calibrate widgets.', customArtifact).concreteArtifact).toBe(true);

    expect(analyzeDescription('Analyze can telemetry.').artifactEvidence.matchedTerms).not.toContain('can');
    const lowercaseAllowed = resolveHeuristicDictionaries({
      uppercaseOnlyAcronyms: DEFAULT_HEURISTIC_DICTIONARIES.uppercaseOnlyAcronyms.filter(
        (term) => term !== 'can',
      ),
    });
    expect(
      analyzeDescription('Analyze can telemetry.', lowercaseAllowed).artifactEvidence.matchedTerms,
    ).toContain('can');
  });
});
