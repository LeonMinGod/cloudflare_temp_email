import { build } from 'esbuild';
await build({entryPoints:['src/index.mjs'],bundle:true,format:'esm',target:'es2022',external:['node:net'],outfile:'dist/index.js',sourcemap:'external',minify:true});
