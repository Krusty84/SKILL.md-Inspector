// Appends data-driven user-visible strings to l10n/bundle.l10n.json after
// `vscode-l10n-dev export`. The exporter only sees l10n.t() string literals in
// TypeScript; the security catalog's message/label values are looked up at
// runtime (l10n.t(entry.message)), so their English defaults are merged here to
// make them visible to translators. Runs as part of `npm run l10n:export`.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const bundlePath = path.join(root, 'l10n', 'bundle.l10n.json');
const catalogPath = path.join(root, 'src', 'validation', 'security', 'defaultSecurityCatalog.json');

const bundle = fs.existsSync(bundlePath) ? JSON.parse(fs.readFileSync(bundlePath, 'utf8')) : {};
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

// Localizable catalog strings. Regex `source` fields, `serviceHosts` domains,
// and `_comment` are data, not UI text.
const texts = [];
for (const listKey of ['dangerousCommands', 'riskyCommands', 'injectionPhrases', 'sensitivePaths']) {
  for (const entry of catalog[listKey]) texts.push(entry.message);
}
for (const entry of catalog.secretSignatures) texts.push(entry.label);
texts.push(catalog.secretAssignment.label, catalog.credentialedUrl.label);

let added = 0;
for (const text of texts) {
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error(`Security catalog contains a non-string localizable value: ${JSON.stringify(text)}`);
  }
  if (!Object.prototype.hasOwnProperty.call(bundle, text)) {
    bundle[text] = text;
    added += 1;
  }
}

// Deterministic output: exporter order for exported keys is already stable;
// sort the whole map so repeated runs produce identical files.
const sorted = Object.fromEntries(Object.entries(bundle).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
fs.mkdirSync(path.dirname(bundlePath), { recursive: true });
fs.writeFileSync(bundlePath, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`merge-l10n-data: ${texts.length} catalog strings (${added} new), ${Object.keys(sorted).length} total bundle keys.`);
