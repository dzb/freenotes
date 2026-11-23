import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';

await mkdir('dist-electron', { recursive: true });

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  logLevel: 'info',
  legalComments: 'none',
};

await build({
  ...common,
  entryPoints: ['src/main/index.ts'],
  outfile: 'dist-electron/main.cjs',
});

await build({
  ...common,
  entryPoints: ['src/preload/index.ts'],
  outfile: 'dist-electron/preload.cjs',
});
