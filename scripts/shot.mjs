// Quick screenshot helper: node scripts/shot.mjs <url> <out.png> [waitMs] [width] [height] [keysHeld]
import { chromium } from 'playwright-core';
const [url, out, wait = '3000', w = '1280', h = '800', keys = ''] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto(url);
for (const k of keys.split(',').filter(Boolean)) await page.keyboard.down(k);
await page.waitForTimeout(Number(wait));
await page.screenshot({ path: out });
const info = await page.evaluate(() => {
  const w = window.world;
  return w ? { level: w.main.level, r: w.main.r.toFixed(2), eaten: w.eaten, x: w.main.x.toFixed(1), z: w.main.z.toFixed(1) } : null;
}).catch(() => null);
console.log(JSON.stringify(info));
console.log(errors.slice(0, 20).join('\n'));
await browser.close();
