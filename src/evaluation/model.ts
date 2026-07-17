/** Offline behavioral trigger evaluation. It is intentionally separate from static quality. */
export type TriggerExpectation = 'should-trigger' | 'should-not-trigger';
export interface TriggerQuery { id: string; prompt: string; expected: TriggerExpectation; }
export interface TriggerEvalSuite { skill: string; queries: TriggerQuery[]; runsPerQuery: number; }
export interface TriggerDecision { queryId: string; run: number; triggered: boolean; }
export interface TriggerProvider { id: string; select(skill: string, prompt: string, run: number): Promise<boolean>; }
export interface TriggerMetrics { truePositives: number; falsePositives: number; trueNegatives: number; falseNegatives: number; precision: number; recall: number; specificity: number; f1: number; stability: number; queryCount: number; runsPerQuery: number; }
