import type { SkillProfile } from '../types/SkillProfile';
import { genericProfile } from './genericProfile';
import { EXAMPLES_SECTION, WHEN_TO_USE_SECTION, IO_SECTION } from '../validation/bodySections';

/** VS Code / Copilot skills. */
export const vscodeProfile: SkillProfile = {
  ...genericProfile,
  id: 'vscode',
  label: 'VS Code',
  body: {
    strictness: 'recommended',
    sections: [EXAMPLES_SECTION, WHEN_TO_USE_SECTION, IO_SECTION],
  },
  metadata: {
    // Optional VS Code skill fields (per the current VS Code skill schema).
    fields: {
      'argument-hint': { type: 'string' },
      'user-invocable': { type: 'boolean' },
      'disable-model-invocation': { type: 'boolean' },
      context: { type: 'string|string[]' },
    },
    // Unknown fields stay allowed unless explicitly prohibited (Task 45).
    unknownKeyPolicy: 'allow',
  },
};
