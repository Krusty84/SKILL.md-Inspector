// Build script for the SKILL.md Inspector extension and browser webviews.
const esbuild = require('esbuild');
const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const plugin = { name: 'esbuild-problem-matcher', setup(build) { build.onStart(() => console.log('[watch] build started')); build.onEnd((result) => { result.errors.forEach(({ text, location }) => { console.error(`[ERROR] ${text}`); if (location) console.error(`    ${location.file}:${location.line}:${location.column}:`); }); console.log('[watch] build finished'); }); } };
const builds=[{ entryPoints:['src/extension.ts'], bundle:true, format:'cjs', minify:production, sourcemap:!production, sourcesContent:false, platform:'node', target:'node18', outfile:'dist/extension.js', external:['vscode'], logLevel:'silent', plugins:[plugin] }, { entryPoints:['src/webview/openCodeSessionTrace/index.ts'], bundle:true, format:'iife', minify:production, sourcemap:!production, sourcesContent:false, platform:'browser', target:'es2020', outfile:'dist/webview/openCodeSessionTrace.js', logLevel:'silent', plugins:[plugin] }];
async function main(){ const contexts=await Promise.all(builds.map((b)=>esbuild.context(b))); if(watch) await Promise.all(contexts.map((c)=>c.watch())); else { await Promise.all(contexts.map((c)=>c.rebuild())); await Promise.all(contexts.map((c)=>c.dispose())); } }
main().catch((e)=>{ console.error(e); process.exit(1); });
