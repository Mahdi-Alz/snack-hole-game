/**
 * Headless balance simulation: a greedy player plays real rounds (same World + map generators as
 * the game, steered by the Bot), shops between rounds and prestiges. Prints when each unlock
 * happens so pacing can be tuned in src/config/balance.ts.
 *
 *   npm run sim            # first run + second run after prestige
 *   npm run sim -- --runs 3
 */
import { ABILITIES, DM_UPGRADES, HELPERS, MAPS, UPGRADES, type MapId } from '../src/config/balance';
import { OBJECT_TYPES } from '../src/config/objects';
import { checkAchievements } from '../src/core/achievements';
import { Bot } from '../src/core/bot';
import * as eco from '../src/core/economy';
import { formatDuration, formatNumber } from '../src/core/format';
import { generateMap } from '../src/core/mapgen';
import { defaultSave, type SaveData } from '../src/core/save';
import { World } from '../src/core/world';

const args = process.argv.slice(2);
const RUNS = Number(args[args.indexOf('--runs') + 1] || 2);
const VERBOSE = args.includes('--verbose');
/** Rough human model: slower re-targeting, 80% stick input, abilities used less often, longer shopping. */
const HUMAN = args.includes('--human');
const SHOP_OVERHEAD = HUMAN ? 20 : 12; // seconds spent on results + shop per round
const DT = 1 / 20;

let clock = 0;
let currentRun = 1;
const events: string[] = [];
const seen = new Set<string>();
function mark(key: string, text: string): void {
  if (seen.has(key)) return;
  seen.add(key);
  events.push(`${formatDuration(clock).padStart(7)}  ${text}`);
}

function playRound(save: SaveData): { cash: number; pct: number; level: number } {
  const cfg = eco.buildRoundConfig(save);
  const w = new World(generateMap(save.selectedMap), cfg, { seed: Math.floor(Math.random() * 1e6) });
  const bot = new Bot(HUMAN ? 0.45 : 0.8);
  while (!w.ended) {
    const inp = bot.steer(w, DT);
    w.input = HUMAN ? { x: inp.x * 0.8, z: inp.z * 0.8 } : inp;
    for (const a of ABILITIES) if (w.abilityReady(a.id) && (!HUMAN || Math.random() < 0.01)) w.useAbility(a.id);
    w.step(DT);
    w.events.length = 0;
  }
  const s = save;
  eco.earn(s, w.cash);
  s.stats.rounds++;
  s.stats.totalEaten += w.eaten + w.helperEaten;
  s.stats.bestCombo = Math.max(s.stats.bestCombo, w.comboBest);
  s.stats.bestLevel = Math.max(s.stats.bestLevel, w.main.level + 1);
  s.stats.bestRoundCash = Math.max(s.stats.bestRoundCash, w.cash);
  for (const [t, n] of w.eatenByType) s.gulpedia[OBJECT_TYPES[t].id] = (s.gulpedia[OBJECT_TYPES[t].id] ?? 0) + n;
  s.mapBest[save.selectedMap] = Math.max(s.mapBest[save.selectedMap], w.percentEaten);
  if (w.percentEaten >= 0.9995 && !s.map100[save.selectedMap]) {
    s.map100[save.selectedMap] = true;
    mark(`100-${save.selectedMap}-${currentRun}`, `100% of ${save.selectedMap}!`);
  }
  checkAchievements(s);
  return { cash: w.cash, pct: w.percentEaten, level: w.main.level };
}

type Option = { name: string; cost: number; buy: () => boolean; key: string };

function options(s: SaveData): Option[] {
  const out: Option[] = [];
  for (const u of UPGRADES) {
    if (!eco.isUpgradeVisible(s, u) || s.upgrades[u.id] >= u.max) continue;
    out.push({ name: u.name, key: `u-${u.id}`, cost: eco.upgradeCost(u.id, s.upgrades[u.id]), buy: () => eco.buyUpgrade(s, u.id, 1) > 0 });
  }
  if (s.runCash >= HELPERS.unlockAt && s.helpers < HELPERS.countCosts.length)
    out.push({ name: `Helper #${s.helpers + 1}`, key: `h-${s.helpers + 1}`, cost: eco.helperCountCost(s.helpers), buy: () => eco.buyHelper(s) });
  if (s.helpers > 0 && s.helperLevel < HELPERS.levelMax)
    out.push({ name: 'Helper level', key: 'hl', cost: eco.helperLevelCost(s.helperLevel), buy: () => eco.buyHelperLevel(s) });
  for (const a of ABILITIES) {
    if (!eco.isAbilityVisible(s, a) || s.abilities[a.id] >= a.maxLevel) continue;
    out.push({ name: `${a.name} ${s.abilities[a.id] === 0 ? 'unlock' : 'level'}`, key: `a-${a.id}-${s.abilities[a.id] === 0 ? 0 : 1}`, cost: eco.abilityCost(a.id, s.abilities[a.id]), buy: () => eco.buyAbility(s, a.id) });
  }
  return out;
}

function shop(s: SaveData, lastRoundCash: number): void {
  // Save up for the next map if it is within ~3 rounds of income.
  const next = MAPS.find((m) => !s.maps[m.id]);
  if (next && s.cash >= next.cost) {
    eco.buyMap(s, next.id);
    s.selectedMap = next.id;
    mark(`map-${next.id}-${currentRun}`, `unlock map ${next.name} (cost ${formatNumber(next.cost)})`);
  }
  const reserve = next && next.cost <= lastRoundCash * 1.5 ? next.cost : 0;
  for (let guard = 0; guard < 400; guard++) {
    const opts = options(s).filter((o) => o.cost <= s.cash - reserve).sort((a, b) => a.cost - b.cost);
    if (!opts.length) break;
    const o = opts[0];
    if (!o.buy()) break;
    if (!seen.has(o.key)) mark(o.key, `buy ${o.name} (${formatNumber(o.cost)})`);
  }
  for (const u of UPGRADES) if (eco.isUpgradeVisible(s, u)) mark(`vis-${u.id}`, `upgrade visible: ${u.name}`);
}

function bestMap(s: SaveData): MapId {
  let best: MapId = 'suburb';
  for (const m of MAPS) if (s.maps[m.id]) best = m.id;
  return best;
}

let save = defaultSave(0);
for (let run = 1; run <= RUNS; run++) {
  currentRun = run;
  const runStart = clock;
  let lastCash = 0;
  let rounds = 0;
  let prestigeReadyAt = -1;
  events.push(`--- run ${run} (DM ${save.dm}, total DM ${save.dmTotal}) ---`);
  while (true) {
    save.selectedMap = bestMap(save);
    const r = playRound(save);
    rounds++;
    const roundTime = eco.roundTimeFor({ ...save, stats: { ...save.stats, rounds: save.stats.rounds - 1 } });
    const passive = eco.passiveIncome(save) * (roundTime + SHOP_OVERHEAD);
    eco.earn(save, passive);
    clock += roundTime + SHOP_OVERHEAD;
    lastCash = r.cash;
    if (rounds === 1) mark(`first-${run}`, `round 1 done: $${formatNumber(r.cash)}`);
    if (VERBOSE || rounds % 5 === 0)
      events.push(
        `${formatDuration(clock).padStart(7)}    r${rounds} ${save.selectedMap} $${formatNumber(r.cash)} (+${formatNumber(passive)} idle) L${r.level + 1} ${(r.pct * 100).toFixed(1)}% cash ${formatNumber(save.cash)} mult x${eco.globalCashMult(save).toFixed(1)} up ${Object.values(save.upgrades).join(",")}`,
      );
    shop(save, lastCash);
    const dm = eco.dmForRunCash(save.runCash);
    if (dm > 0 && prestigeReadyAt < 0) {
      prestigeReadyAt = clock;
      mark(`pready-${run}`, `Singularity available (${dm} DM)`);
    }
    // Prestige once the gain is meaningful relative to what we have, or progress stalls.
    const want = Math.max(5, save.dmTotal * (args.includes("--patient") ? 2 : 0.6));
    const holdForMoon = args.includes('--moon') && !save.maps.moon && rounds < 60;
    if ((!holdForMoon && dm >= want && clock - prestigeReadyAt > 60) || rounds > 220) {
      mark(`prestige-${run}`, `SINGULARITY #${run}: +${dm} DM after ${formatDuration(clock - runStart)} (${rounds} rounds)`);
      save = eco.applyPrestige(save, 0);
      for (let guard = 0; guard < 200; guard++) {
        const opts = DM_UPGRADES.filter((d) => eco.dmLevel(save, d.id) < d.max)
          .map((d) => ({ d, c: eco.dmUpgradeCost(d.id, eco.dmLevel(save, d.id)) }))
          .filter((o) => o.c <= save.dm)
          .sort((a, b) => a.c - b.c);
        if (!opts.length) break;
        eco.buyDmUpgrade(save, opts[0].d.id);
      }
      events.push(`         DM tree: ${DM_UPGRADES.map((d) => `${d.id}=${eco.dmLevel(save, d.id)}`).join(' ')}`);
      break;
    }
  }
}
console.log(events.join('\n'));
