// Screenshots of every hub tab and dialog with the `midgame` fixture save. Starts its own dev
// server unless BASE_URL is set. Usage: node scripts/ui-shots.mjs [width] [height]
import { chromium } from 'playwright-core';
import { devServer } from './devServer.mjs';

const server = await devServer();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const width = Number(process.argv[2] ?? 1280);
const height = Number(process.argv[3] ?? 800);
const tag = width < 700 ? 'mobile' : 'desktop';
const page = await browser.newPage({ viewport: { width, height } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(new URL('?save=midgame', server.base).href);
await page.waitForFunction(() => window.game !== undefined);
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
await server.close();
