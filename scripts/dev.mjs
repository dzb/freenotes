import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import electronPath from 'electron';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';

await mkdir('dist-electron', { recursive: true });
const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  logLevel: 'warning',
};
await build({ ...common, entryPoints: ['src/main/index.ts'], outfile: 'dist-electron/main.cjs' });
await build({ ...common, entryPoints: ['src/preload/index.ts'], outfile: 'dist-electron/preload.cjs' });

const server = await createServer();
await server.listen();
const url = server.resolvedUrls?.local?.[0] ?? 'http://127.0.0.1:5173/';
server.printUrls();

const electronArgs = ['.'];
// The npm-distributed Electron binary ships a non-setuid chrome-sandbox helper.
// Running the local development build without the Chromium sandbox is expected;
// packaged release builds should still be sandboxed whenever the system allows it.
electronArgs.push('--no-sandbox');

const child = spawn(electronPath, electronArgs, {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
});

let shuttingDown = false;
const shutdown = async (code = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  await server.close();
  if (!child.killed) child.kill();
  process.exit(code);
};

child.on('close', (code) => shutdown(code ?? 0));
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
