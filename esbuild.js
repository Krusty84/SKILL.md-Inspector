// Build script for the SKILL.md Inspector extension.
const esbuild = require('esbuild');
const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const plugin = { name: 'esbuild-problem-matcher', setup(build) { build.onStart(() => console.log('[watch] build started')); build.onEnd((result) => { result.errors.forEach(({ text, location }) => { console.error(`[ERROR] ${text}`); if (location) console.error(`    ${location.file}:${location.line}:${location.column}:`); }); console.log('[watch] build finished'); }); } };
const build={ entryPoints:['src/extension.ts'], bundle:true, format:'cjs', minify:production, sourcemap:!production, sourcesContent:false, platform:'node', target:'node18', outfile:'dist/extension.js', external:['vscode'], logLevel:'silent', plugins:[plugin] };
async function main(){ const context=await esbuild.context(build); if(watch) await context.watch(); else { await context.rebuild(); await context.dispose(); } }
main().catch((e)=>{ console.error(e); process.exit(1); });
