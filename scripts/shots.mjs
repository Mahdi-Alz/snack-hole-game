// Screenshots of every map mid-round. Requires the dev server on :5101.
// Usage: node scripts/shots.mjs [startSize] [mapId...]
import { chromium } from 'playwright-core';

const [sizeArg, ...only] = process.argv.slice(2);
const size = Number(sizeArg ?? 10);
const maps = only.length ? only : ['suburb', 'downtown', 'farm', 'harbor', 'airport', 'moon'];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:5101/');
await page.waitForFunction(() => window.game !== undefined);
for (const id of maps) {
  await page.evaluate(
    ({ id, size }) => {
      const g = window.game;
      const s = g.debugState.save;
      s.stats.rounds = Math.max(1, s.stats.rounds);
      s.maps[id] = true;
      s.upgrades.startSize = size;
      g.selectMap(id);
    },
    { id, size },
  );
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `screenshots/map-${id}-hub.png` });
  await page.evaluate(() => window.game.play());
  await page.keyboard.down('w');
  await page.waitForTimeout(2500);
  await page.keyboard.up('w');
  await page.screenshot({ path: `screenshots/map-${id}-round.png` });
  await page.evaluate(() => {
    const w = window.game.debugState.world;
    w.timeLeft = 0.01;
  });
  await page.waitForFunction(() => window.game.debugState.state === 'results', null, { timeout: 30000 });
  await page.click('.results-modal .btn.primary');
  await page.waitForTimeout(400);
}
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
