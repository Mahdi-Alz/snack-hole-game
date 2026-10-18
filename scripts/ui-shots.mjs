// Screenshots of every hub tab and dialog with a mid-game save. Requires the dev server on :5101.
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const width = Number(process.argv[2] ?? 1280);
const height = Number(process.argv[3] ?? 800);
const tag = width < 700 ? 'mobile' : 'desktop';
const page = await browser.newPage({ viewport: { width, height } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:5101/');
await page.waitForFunction(() => window.game !== undefined);
await page.evaluate(() => {
  const g = window.game;
  const s = g.debugState.save;
  s.stats.rounds = 30;
  s.cash = 3.2e6;
  s.runCash = 6e7;
  s.lifetimeCash = 8e7;
  s.dm = 12;
  s.dmTotal = 20;
  s.stats.prestiges = 1;
  s.helpers = 3;
  s.helperLevel = 6;
  s.abilities.dash = 3;
  s.abilities.vortex = 1;
  Object.assign(s.upgrades, { startSize: 9, speed: 14, cashValue: 18, roundTime: 8, growth: 9, magnet: 6, combo: 4, offline: 2 });
  Object.assign(s.maps, { downtown: true, farm: true });
  s.mapBest.suburb = 1;
  s.map100.suburb = true;
  s.mapBest.downtown = 0.42;
  s.selectedMap = 'farm';
  for (const id of ['cone', 'hydrant', 'person', 'car', 'bus', 'house', 'tree', 'bench', 'dog', 'cow', 'chicken', 'pig', 'barn']) s.gulpedia[id] = 12;
  s.achievements.push('firstBite', 'eat100', 'car', 'house', 'combo25');
  s.skins.push('mint');
  g.selectMap('farm');
});
await page.waitForTimeout(800);
const tabs = ['upgrades', 'helpers', 'abilities', 'maps', 'singularity', 'gulpedia', 'trophies', 'skins'];
for (const t of tabs) {
  await page.evaluate((t) => window.game.hub.selectTab(t), t);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `screenshots/${tag}-tab-${t}.png` });
}
await page.evaluate(() => window.game.openSettings());
await page.waitForTimeout(500);
await page.screenshot({ path: `screenshots/${tag}-settings.png` });
await page.keyboard.press('Escape');
await page.mouse.click(5, 5);
await page.waitForTimeout(400);
await page.keyboard.press('`');
await page.waitForTimeout(300);
await page.screenshot({ path: `screenshots/${tag}-debug.png` });
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
