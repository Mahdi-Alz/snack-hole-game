// Per-frame cost of sim, object sync and render in a mid-size round. Starts its own dev server
// unless BASE_URL is set.
import { chromium } from 'playwright-core';
import { devServer } from './devServer.mjs';
const server = await devServer();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(server.base);
await page.waitForFunction(() => window.game !== undefined);
await page.evaluate(() => { const s = window.game.debugState.save; s.stats.rounds = 2; s.upgrades.startSize = 14; s.helpers = 3; s.abilities.vortex = 1; });
await page.evaluate(() => window.game.play());
await page.waitForTimeout(1500);
const r = await page.evaluate(() => {
  const g = window.game; const w = g.debugState.world;
  const out = {};
  let t = performance.now();
  for (let i = 0; i < 60; i++) { w.step(1/60); }
  out.step = (performance.now() - t) / 60;
  const ev = w.events.length; out.events = ev; w.events.length = 0;
  t = performance.now();
  for (let i = 0; i < 60; i++) { for (const o of w.objects) o.dirty = true; g.renderer.objects.update(1/60, i); }
  out.syncAllDirty = (performance.now() - t) / 60;
  t = performance.now();
  for (let i = 0; i < 60; i++) { g.renderer.objects.update(1/60, i); }
  out.syncClean = (performance.now() - t) / 60;
  t = performance.now();
  for (let i = 0; i < 20; i++) g.renderer.render(1/60, w, 'round');
  out.render = (performance.now() - t) / 20;
  out.movers = w.movers.length; out.objects = w.objects.length; out.r = w.main.r;
  return out;
});
console.log(JSON.stringify(r));
await browser.close();
await server.close();
