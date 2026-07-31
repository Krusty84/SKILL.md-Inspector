import { describe, it, expect } from 'vitest';
import catalog from '../../src/quality/defaultHeuristicDictionaries.json';
import {
  DEFAULT_HEURISTIC_DICTIONARIES,
  type HeuristicDictionaries,
} from '../../src/quality/dictionaries';
import {
  capabilityGroupMembersMissingFromVocabulary,
  artifactGroupMembersMissingFromVocabulary,
  undeclaredDualRoleTerms,
} from '../../src/quality/wordForms';

/**
 * Plan 16 Part A/B. `capabilityGroupOf` and `artifactGroupOf` are only ever
 * applied to terms `extractCapabilities` / `extractArtifacts` already emitted,
 * and those only emit members of the source vocabularies. A group member that is
 * in no source vocabulary is dead configuration: it can never be reached, and
 * `synonymGroupConflicts` — which checks that no member is in two groups — does
 * not notice. 54 of the shipped members were in that state.
 */

const dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES;

describe('synonym groups are reachable from the source vocabularies', () => {
  it('has no capability-group member outside actionVerbs', () => {
    expect(capabilityGroupMembersMissingFromVocabulary(dictionaries)).toEqual([]);
  });

  it('has no artifact-group member outside the artifact vocabularies', () => {
    expect(artifactGroupMembersMissingFromVocabulary(dictionaries)).toEqual([]);
  });

  it('checks the raw catalog, not just the resolved dictionaries', () => {
    // The catalog is the source of truth that `sync:heuristic-dictionaries`
    // regenerates package.json from, so the assertion has to hold there too.
    const verbs = new Set(catalog.actionVerbs);
    const dead = Object.values(catalog.capabilitySynonymGroups)
      .flat()
      .filter((member) => !verbs.has(member));
    expect(dead).toEqual([]);
  });
});

describe('terms that are both a verb and an artifact are declared', () => {
  it('lists every dual-role term in dualRoleTerms', () => {
    expect(undeclaredDualRoleTerms(dictionaries)).toEqual([]);
  });

  it('keeps the declared list honest — every entry really is in both', () => {
    const verbs = new Set(dictionaries.actionVerbs);
    const artifacts = new Set([
      ...dictionaries.artifactHints,
      ...dictionaries.multiWordArtifacts,
      ...dictionaries.acronyms,
    ]);
    for (const term of dictionaries.dualRoleTerms) {
      expect(verbs.has(term), `${term} must be in actionVerbs`).toBe(true);
      expect(artifacts.has(term), `${term} must be an artifact term`).toBe(true);
    }
  });
});
