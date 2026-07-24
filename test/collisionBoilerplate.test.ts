/**
 * Regression suite for plan 4 (docs/remediation/plan-4-collision-and-morphology.md):
 * shared description *boilerplate* ("Use this skill when the user asks to …")
 * must not read as scope overlap, while true near-duplicates keep being
 * reported. Uses default weights, threshold, and dictionaries.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COLLISION_THRESHOLD,
  detectCollisions,
} from '../src/workspace/detectSkillCollisions';

/** Clearly distinct skills sharing only house template phrasing. */
const TEMPLATE_PAIR = [
  {
    name: 'terraform-review',
    description:
      'Use this skill when the user asks to review, validate, or lint infrastructure code. This skill helps the user work with Terraform plans and modules. Do not use when the user asks about application code.',
  },
  {
    name: 'sql-review',
    description:
      'Use this skill when the user asks to review, validate, or lint database queries. This skill helps the user work with SQL statements and migrations. Do not use when the user asks about application code.',
  },
];

/** Genuinely overlapping near-duplicates that must keep being reported. */
const NEAR_DUPLICATE_PAIR = [
  {
    name: 'a-skill',
    description: 'Format PDF invoices for the accounting team using standard layout rules.',
  },
  {
    name: 'b-skill',
    description: 'Format PDF invoices for the legal team using contract layout rules.',
  },
];

function composite(skills: typeof TEMPLATE_PAIR): number {
  const [collision] = detectCollisions(skills, { threshold: 0 });
  return collision?.similarity ?? 0;
}

describe('collision boilerplate damping', () => {
  it('does not report the template pair (composite below the default threshold)', () => {
    expect(composite(TEMPLATE_PAIR)).toBeLessThan(DEFAULT_COLLISION_THRESHOLD);
    expect(detectCollisions(TEMPLATE_PAIR)).toHaveLength(0);
  });

  it('still reports the true near-duplicate pair at Medium risk or above', () => {
    const [collision] = detectCollisions(NEAR_DUPLICATE_PAIR);
    expect(collision).toBeDefined();
    expect(collision.similarity).toBeGreaterThanOrEqual(0.6);
    expect(collision.risk === 'Medium' || collision.risk === 'High').toBe(true);
  });

  it('ranks the near-duplicate pair strictly above the template pair', () => {
    expect(composite(NEAR_DUPLICATE_PAIR)).toBeGreaterThan(composite(TEMPLATE_PAIR));
  });

  it('keeps the char n-gram metric from measuring template prose', () => {
    const [collision] = detectCollisions(TEMPLATE_PAIR, { threshold: 0 });
    // Raw-text n-grams scored 0.88 on this pair; content-token n-grams must not.
    expect(collision.metrics.charNgram).toBeLessThan(0.6);
  });

  it('survives a description consisting only of capability verbs (empty Jaccard sets)', () => {
    const verbsOnly = [
      { name: 'x-skill', description: 'Format. Validate. Review.' },
      { name: 'y-skill', description: 'Format. Validate. Review.' },
    ];
    const [collision] = detectCollisions(verbsOnly, { threshold: 0 });
    // Verb-only descriptions have empty verb-filtered Jaccard sets → metric 0,
    // never NaN; the other metrics still see the verbs.
    expect(collision.metrics.jaccard).toBe(0);
    expect(Number.isNaN(collision.similarity)).toBe(false);
    expect(collision.metrics.cosine).toBeGreaterThan(0.9);
  });
});
