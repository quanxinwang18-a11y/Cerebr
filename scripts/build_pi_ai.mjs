import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entryPoint = path.join(repoRoot, 'scripts', 'pi-ai-browser-entry.mjs');
const outdir = path.join(repoRoot, 'src', 'vendor', 'pi-ai');

await rm(outdir, { recursive: true, force: true });

const result = await build({
    entryPoints: { index: entryPoint },
    outdir,
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    target: ['chrome141'],
    entryNames: '[name]',
    chunkNames: 'chunks/[name]-[hash]',
    assetNames: 'assets/[name]-[hash]',
    legalComments: 'eof',
    metafile: true,
    sourcemap: false,
    minify: true,
    treeShaking: true,
    define: {
        process: 'undefined',
    },
    logLevel: 'info',
});

const outputs = Object.keys(result.metafile.outputs);
const forbiddenImports = [];
for (const [output, metadata] of Object.entries(result.metafile.outputs)) {
    for (const imported of metadata.imports || []) {
        if (/^(?:node:|https?:\/\/)/u.test(imported.path)) {
            forbiddenImports.push(`${output} -> ${imported.path}`);
        }
    }
}
if (forbiddenImports.length > 0) {
    throw new Error(`Browser bundle contains forbidden imports:\n${forbiddenImports.join('\n')}`);
}

console.log(`[pi-ai] generated ${outputs.length} browser assets in ${path.relative(repoRoot, outdir)}`);
