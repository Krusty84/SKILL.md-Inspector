import type { TriggerDecision, TriggerEvalSuite, TriggerProvider } from './model';
export async function runTriggerEvaluation(suite: TriggerEvalSuite, provider: TriggerProvider): Promise<TriggerDecision[]> {
  const decisions: TriggerDecision[] = [];
  for (const query of suite.queries) for (let run = 0; run < suite.runsPerQuery; run++) decisions.push({ queryId: query.id, run, triggered: await provider.select(suite.skill, query.prompt, run) });
  return decisions;
}
export class FakeTriggerProvider implements TriggerProvider {
  readonly id = 'fake-deterministic';
  constructor(private readonly decisions: Record<string, boolean>) {}
  async select(_skill: string, prompt: string, _run: number): Promise<boolean> { return this.decisions[prompt] ?? false; }
}
