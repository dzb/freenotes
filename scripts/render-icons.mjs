import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';

const svg = await fs.readFile('build/icon.svg', 'utf8');
await fs.mkdir('build/icons', { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:transparent;overflow:hidden}svg{display:block;width:100%;height:100%}</style>${svg}`);
  await page.screenshot({ path: `build/icons/${size}x${size}.png`, omitBackground: true });
  await page.close();
}
await fs.copyFile('build/icons/1024x1024.png', 'build/icon.png');
await fs.copyFile('build/icons/512x512.png', 'resources/icon.png');
await browser.close();
console.log('icons rendered');
