// Build script for the SKILL.md Inspector extension.
const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const plugin = { name: 'esbuild-problem-matcher', setup(build) { build.onStart(() => console.log('[watch] build started')); build.onEnd((result) => { result.errors.forEach(({ text, location }) => { console.error(`[ERROR] ${text}`); if (location) console.error(`    ${location.file}:${location.line}:${location.column}:`); }); console.log('[watch] build finished'); }); } };
const extensionBuild={ entryPoints:['src/extension.ts'], bundle:true, format:'cjs', minify:production, sourcemap:!production, sourcesContent:false, platform:'node', target:'node18', outfile:'dist/extension.js', external:['vscode'], logLevel:'silent', plugins:[plugin] };
const webviewBuild={ entryPoints:['src/webview/openCodeSessionReport/index.ts'], bundle:true, format:'iife', minify:production, sourcemap:!production, sourcesContent:false, platform:'browser', target:'es2022', outfile:'dist/webview/openCodeSessionReport.js', logLevel:'silent', loader:{'.css':'css'}, plugins:[plugin] };
async function buildAll(){ fs.mkdirSync(path.join('dist','webview'), { recursive:true }); const ctx1=await esbuild.context(extensionBuild); const ctx2=await esbuild.context(webviewBuild); if(watch){ await ctx1.watch(); await ctx2.watch(); } else { await ctx1.rebuild(); await ctx2.rebuild(); await ctx1.dispose(); await ctx2.dispose(); } }
buildAll().catch((e)=>{ console.error(e); process.exit(1); });
