const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const packagePath = path.join(root, 'package.json');
const catalogPath = path.join(root, 'src', 'quality', 'defaultHeuristicDictionaries.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

// Each generated setting's description is an NLS placeholder; the English text
// lives in package.nls.json under the same key. Adding a catalog key therefore
// also requires adding its description to package.nls.json (test/packageNls.test.ts
// fails until both sides agree).
function nlsDescription(key) {
  return `%skillMdInspector.config.heuristics.dictionaryValues.${key}.description%`;
}

const mappingKeys = new Set([
  'actionVerbForms',
  'irregularSingularForms',
  'capabilitySynonymGroups',
  'artifactSynonymGroups',
]);
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
      description: nlsDescription(key),
      propertyNames: { minLength: 1 },
      additionalProperties: stringArraySchema(),
    };
  }
  return {
    type: 'array',
    scope: 'resource',
    default: value,
    description: nlsDescription(key),
    items: { type: 'string' },
  };
}

// The heuristics dictionary settings all live in one configuration category.
// `contributes.configuration` is an array of titled categories (a legacy single
// object is still handled), so locate the category that owns them.
const configurationGroups = Array.isArray(packageJson.contributes.configuration)
  ? packageJson.contributes.configuration
  : [packageJson.contributes.configuration];
const heuristicsGroup = configurationGroups.find(
  (group) =>
    group &&
    group.properties &&
    Object.keys(group.properties).some((key) => key.startsWith(dictionaryPrefix)),
);
if (!heuristicsGroup) {
  throw new Error('Could not find the configuration category containing heuristics settings.');
}
const properties = heuristicsGroup.properties;
const generated = Object.fromEntries(
  Object.keys(catalog).map((key) => [`${visiblePrefix}${key}`, visibleSetting(key)]),
);

if (process.argv.includes('--check')) {
  const actual = Object.fromEntries(
    Object.entries(properties).filter(([key]) => key.startsWith(dictionaryPrefix)),
  );
  // Order is a settings-UI concern, not drift: a setting may be positioned
  // anywhere in package.json. Drift means a missing/extra key or a value that no
  // longer matches the canonical catalog, so compare as an unordered key→value map.
  const actualKeys = Object.keys(actual).sort();
  const generatedKeys = Object.keys(generated).sort();
  const drifted =
    JSON.stringify(actualKeys) !== JSON.stringify(generatedKeys) ||
    actualKeys.some((key) => JSON.stringify(actual[key]) !== JSON.stringify(generated[key]));
  if (drifted) {
    console.error(
      'Heuristic dictionary settings are out of sync. Run npm run sync:heuristic-dictionaries.',
    );
    process.exit(1);
  }
  process.exit(0);
}

const nextProperties = {};
for (const [key, value] of Object.entries(properties)) {
  if (key.startsWith(dictionaryPrefix)) {
    // Regenerate each heuristic setting in place, preserving the author's chosen
    // ordering in package.json. Settings whose catalog key no longer exists are
    // dropped (skipped here); brand-new catalog keys are appended below.
    if (Object.prototype.hasOwnProperty.call(generated, key)) {
      nextProperties[key] = generated[key];
    }
    continue;
  }
  nextProperties[key] = value;
}
for (const [key, value] of Object.entries(generated)) {
  if (!Object.prototype.hasOwnProperty.call(nextProperties, key)) {
    nextProperties[key] = value;
  }
}
heuristicsGroup.properties = nextProperties;
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
