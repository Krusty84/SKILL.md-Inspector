const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const packagePath = path.join(root, 'package.json');
const catalogPath = path.join(root, 'src', 'quality', 'defaultHeuristicDictionaries.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

const descriptions = {
  actionVerbs:
    'Base verbs recognized as concrete capabilities in description diagnostics, Static Description Quality, local improvement, and collision features.',
  actionVerbForms:
    'Explicit surface forms for action verbs. Keys are base verbs and values are recognized forms; explicit entries take precedence over regular morphology.',
  vagueTerms:
    'Words and phrases treated as vague in description diagnostics and Static Description Quality.',
  artifactHints:
    'High-signal artifact and domain terms used by description quality and collision feature extraction.',
  lowSignalArtifactTerms:
    'Generic artifact terms that count only when accompanied by an artifact support term.',
  multiWordArtifacts:
    'Multi-word artifact phrases recognized by description quality and collision feature extraction.',
  artifactSupportTerms:
    'Domain terms that make a low-signal artifact such as file, data, code, or document concrete.',
  acronyms: 'Acronyms and technology names recognized as concrete artifact or domain evidence.',
  uppercaseOnlyAcronyms:
    'Ambiguous acronyms that count only when their matched spelling is uppercase.',
  positiveTriggerPhrases: 'Phrases that introduce a positive usage-trigger clause.',
  negativeBoundaryPhrases:
    'Phrases that introduce a negative usage boundary and separate collision scopes.',
  exclusiveTriggerPhrases:
    'Phrases that act as both a positive usage trigger and an exclusive boundary.',
  restrictiveBoundaryPhrases:
    'Non-negative phrases that restrict scope for boundary detection and scoring.',
  overbroadTriggerPhrases:
    'Conservative phrases that indicate an overbroad skill-selection scope when used in a usage or trigger context.',
  frontLoadedFillerTerms:
    'Terms ignored when deciding whether the opening sentence names a concrete capability object.',
  scopeStopwords:
    'Terms ignored when evaluating whether trigger and boundary clauses contain concrete scope.',
  scopeVagueTerms:
    'Terms that make trigger and boundary clause content too vague to receive full credit.',
  irregularSingularForms:
    'Irregular plural normalization used by artifact matching and collision analysis. Keys are singular bases and values are plural forms.',
  collisionStopwords:
    'Common terms removed before workspace description collision similarity is calculated.',
};

const mappingKeys = new Set(['actionVerbForms', 'irregularSingularForms']);
const dictionaryPrefix = 'skillMdInspector.heuristics.';
const visiblePrefix = 'skillMdInspector.heuristics.dictionaryValues.';

function stringArraySchema() {
  return { type: 'array', items: { type: 'string' } };
}

function visibleSetting(key) {
  const value = catalog[key];
  if (mappingKeys.has(key)) {
    return {
      type: 'object',
      scope: 'resource',
      default: value,
      description: descriptions[key],
      propertyNames: { minLength: 1 },
      additionalProperties: stringArraySchema(),
    };
  }
  return {
    type: 'array',
    scope: 'resource',
    default: value,
    description: descriptions[key],
    items: { type: 'string' },
  };
}

const properties = packageJson.contributes.configuration.properties;
const generated = Object.fromEntries(
  Object.keys(catalog).map((key) => [`${visiblePrefix}${key}`, visibleSetting(key)]),
);

if (process.argv.includes('--check')) {
  const actual = Object.fromEntries(
    Object.entries(properties).filter(([key]) => key.startsWith(dictionaryPrefix)),
  );
  if (JSON.stringify(actual) !== JSON.stringify(generated)) {
    console.error(
      'Heuristic dictionary settings are out of sync. Run npm run sync:heuristic-dictionaries.',
    );
    process.exit(1);
  }
  process.exit(0);
}

const nextProperties = {};
let inserted = false;
for (const [key, value] of Object.entries(properties)) {
  if (key.startsWith(dictionaryPrefix)) {
    if (!inserted) {
      Object.assign(nextProperties, generated);
      inserted = true;
    }
    continue;
  }
  nextProperties[key] = value;
}
if (!inserted) Object.assign(nextProperties, generated);
packageJson.contributes.configuration.properties = nextProperties;
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
