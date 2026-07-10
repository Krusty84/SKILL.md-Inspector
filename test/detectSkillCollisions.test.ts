import { describe, it, expect } from 'vitest';
import { detectCollisions, riskFor } from '../src/workspace/detectSkillCollisions';

describe('detectCollisions', () => {
  const skills = [
    {
      name: 'pdf-report-formatter',
      description:
        'Format technical PDF reports using company layout rules. Use when asked to standardize inspection reports.',
    },
    {
      name: 'engineering-report-formatter',
      description:
        'Format technical engineering reports using company layout rules. Use when asked to standardize inspection reports.',
    },
    {
      name: 'release-notes-generator',
      description: 'Generate release notes from git commit history when preparing a version release.',
    },
  ];

  it('flags the two overlapping report formatters and nothing else', () => {
    const collisions = detectCollisions(skills);
    expect(collisions).toHaveLength(1);
    const [collision] = collisions;
    expect([collision.a, collision.b].sort()).toEqual([
      'engineering-report-formatter',
      'pdf-report-formatter',
    ]);
    expect(collision.risk === 'High' || collision.risk === 'Medium').toBe(true);
    expect(collision.sharedTerms).toEqual(expect.arrayContaining(['reports', 'format']));
    expect(collision.recommendation.length).toBeGreaterThan(0);
  });

  it('returns nothing for a single skill', () => {
    expect(detectCollisions([skills[0]])).toEqual([]);
  });
});

describe('riskFor', () => {
  it('maps similarity to risk bands', () => {
    expect(riskFor(0.85)).toBe('High');
    expect(riskFor(0.7)).toBe('Medium');
    expect(riskFor(0.45)).toBe('Low');
  });
});
