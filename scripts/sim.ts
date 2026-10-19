/**
 * Headless balance simulation: a greedy player plays real rounds (same World + map generators as
 * the game, steered by the Bot), shops between rounds and prestiges. Prints when each unlock
 * happens and, with --report, checks the pacing targets from DESIGN.md.
 *
 *   npm run sim                      # 2 runs, event log
 *   npm run sim -- --runs 4 --report # pacing report with PASS/FAIL per target
 *   npm run sim -- --human           # slower 'human' model (the one the targets are tuned for)
 *   npm run sim -- --trace           # per-round level-up timeline
 *   npm run sim -- --moon            # hold the first Singularity until Moon Base is unlocked
 *   npm run sim -- --seed 7          # different (but reproducible) world seeds
 */
import { ABILITIES, DM_UPGRADES, HELPERS, MAPS, SIZE, UPGRADES, type MapId } from '../src/config/balance';
import { checkAchievements } from '../src/core/achievements';
import { Bot } from '../src/core/bot';
import * as eco from '../src/core/economy';
import { formatDuration, formatNumber } from '../src/core/format';
import { generateMap } from '../src/core/mapgen';
import { Rng } from '../src/core/rng';
import { settleRound, summarizeRound } from '../src/core/round';
import { defaultSave, type SaveData } from '../src/core/save';
import { World } from '../src/core/world';

const args = process.argv.slice(2);
const arg = (name: string, def: number) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const RUNS = arg('--runs', 2);
const VERBOSE = args.includes('--verbose');
const TRACE = args.includes('--trace');
const REPORT = args.includes('--report');
const HUMAN = args.includes('--human');
const HOLD_MOON = args.includes('--moon');
const rng = new Rng(arg('--seed', 1));
const DT = 1 / 20;

/** Player model: how quickly the bot re-targets, how hard it pushes the stick, how often it fires abilities. */
interface Profile {
  bot: number;
  stick: number;
  abilityChance: number;
  /** Seconds spent on results + shop per round. */
  overhead: number;
}
const BASE: Profile = HUMAN ? { bot: 0.45, stick: 0.8, abilityChance: 0.01, overhead: 20 } : { bot: 0.8, stick: 1, abilityChance: 1, overhead: 12 };
const withSkill = (s: number): Profile => ({ ...BASE, bot: BASE.bot * s, stick: Math.min(1, BASE.stick * (0.8 + 0.2 * s)) });

// ---------------------------------------------------------------- round

interface RoundStats {
  map: MapId;
  /** Round cash; when the round is recorded, what the game credits. */
  cash: number;
  pct: number;
  startLevel: number;
  endLevel: number;
  roundTime: number;
  /** Seconds into the round of each main-hole level-up. */
  levelTimes: number[];
  /** Seconds between the last main-hole swallow and the end of the round. */
  deadTime: number;
  /** Seconds actually played (shorter than roundTime if the round ended early). */
  played: number;
  /** Maps the recorded round unlocked. */
  unlocked: MapId[];
}

function playRound(save: SaveData, p: Profile, record = true): RoundStats {
  const cfg = eco.buildRoundConfig(save);
  const w = new World(generateMap(save.selectedMap), cfg, { seed: rng.int(1, 1e6) });
  const bot = new Bot(p.bot);
  const levelTimes: number[] = [];
  let lastEat = 0;
  let endAt = 0;
  while (!w.ended) {
    const inp = bot.steer(w, DT);
    w.input = { x: inp.x * p.stick, z: inp.z * p.stick };
    for (const a of ABILITIES) if (w.abilityReady(a.id) && rng.chance(p.abilityChance)) w.useAbility(a.id);
    w.step(DT);
    for (const e of w.events) {
      if (e.k === 'level') levelTimes.push(w.time);
      else if (e.k === 'eat' && e.hole === 0) lastEat = w.time;
      else if ((e.k === 'timeUp' || e.k === 'cleared' || e.k === 'snackedOut') && !endAt) endAt = w.time;
    }
    w.events.length = 0;
  }
  if (!endAt) endAt = w.time;
  const stats: RoundStats = {
    map: save.selectedMap,
    cash: w.cash,
    pct: w.percentEaten,
    startLevel: cfg.startLevel,
    endLevel: w.main.level,
    roundTime: cfg.roundTime,
    levelTimes,
    deadTime: Math.max(0, endAt - lastEat),
    played: endAt,
    unlocked: [],
  };
  if (!record) return stats;
  // The same bookkeeping as the game's end of round (records, map unlocks).
  const settled = settleRound(save, summarizeRound(w));
  stats.cash = settled.total;
  stats.unlocked = settled.unlockedMaps;
  if (settled.completed) mark(`100-${stats.map}-${currentRun}`, `100% of ${stats.map}!`);
  checkAchievements(save);
  return stats;
}

// ---------------------------------------------------------------- shopping policy

type Option = { name: string; cost: number; buy: () => boolean; key: string };

function options(s: SaveData): Option[] {
  const out: Option[] = [];
  for (const u of UPGRADES) {
    if (!eco.isUpgradeVisible(s, u) || s.upgrades[u.id] >= u.max) continue;
    out.push({ name: u.name, key: `u-${u.id}`, cost: eco.upgradeCost(u.id, s.upgrades[u.id], s.tier), buy: () => eco.buyUpgrade(s, u.id, 1) > 0 });
  }
  if (s.runCash >= HELPERS.unlockAt && s.helpers < HELPERS.countCosts.length)
    out.push({ name: `Helper #${s.helpers + 1}`, key: `h-${s.helpers + 1}`, cost: eco.helperCountCost(s.helpers, s.tier), buy: () => eco.buyHelper(s) });
  if (s.helpers > 0 && s.helperLevel < HELPERS.levelMax)
    out.push({ name: 'Helper level', key: 'hl', cost: eco.helperLevelCost(s.helperLevel, s.tier), buy: () => eco.buyHelperLevel(s) });
  for (const a of ABILITIES) {
    if (!eco.isAbilityVisible(s, a) || s.abilities[a.id] >= a.maxLevel) continue;
    out.push({ name: `${a.name} ${s.abilities[a.id] === 0 ? 'unlock' : 'level'}`, key: `a-${a.id}-${s.abilities[a.id] === 0 ? 0 : 1}`, cost: eco.abilityCost(a.id, s.abilities[a.id], s.tier), buy: () => eco.buyAbility(s, a.id) });
  }
  return out;
}

interface ShopStats {
  purchases: number;
  /** Cheapest option left after shopping, in rounds of last round's income (Infinity if none). */
  cheapestRounds: number;
  /**
   * Rounds of last round's income still missing for the cheapest option left, after the cash
   * left over from shopping (Infinity if none): <= 1 means it is affordable after the next round.
   */
  waitRounds: number;
  /** Next Starting Size level, in rounds of last round's income. */
  sizeRounds: number;
}

/** Buys the cheapest affordable option until nothing is affordable; returns how many it bought. */
function buyAffordable(s: SaveData): number {
  let purchases = 0;
  for (let guard = 0; guard < 400; guard++) {
    const opts = options(s).filter((o) => o.cost <= s.cash).sort((a, b) => a.cost - b.cost);
    if (!opts.length) break;
    const o = opts[0];
    if (!o.buy()) break;
    purchases++;
    if (!seen.has(o.key)) mark(o.key, `buy ${o.name} (${formatNumber(o.cost)})`);
  }
  return purchases;
}

function shop(s: SaveData, lastRoundCash: number): ShopStats {
  const purchases = buyAffordable(s);
  const inc = Math.max(1, lastRoundCash);
  const cheapest = Math.min(Infinity, ...options(s).map((o) => o.cost));
  return {
    purchases,
    cheapestRounds: cheapest / inc,
    waitRounds: (cheapest - s.cash) / inc,
    sizeRounds: eco.upgradeCost('startSize', s.upgrades.startSize, s.tier) / inc,
  };
}

function bestMap(s: SaveData): MapId {
  let best: MapId = 'suburb';
  for (const m of MAPS) if (s.maps[m.id]) best = m.id;
  return best;
}

function buyDmTree(save: SaveData): void {
  for (let guard = 0; guard < 200; guard++) {
    const opts = DM_UPGRADES.filter((d) => eco.dmLevel(save, d.id) < d.max)
      .map((d) => ({ d, c: eco.dmUpgradeCost(d.id, eco.dmLevel(save, d.id)) }))
      .filter((o) => o.c <= save.dm)
      .sort((a, b) => a.c - b.c);
    if (!opts.length) break;
    eco.buyDmUpgrade(save, opts[0].d.id);
  }
}

/** Offline payout for 8 h away, in rounds of the recent average round income. */
function offlineRounds(save: SaveData): number {
  const avg = eco.recentRoundIncome(save);
  if (avg <= 0) return 0;
  const now = 1e12;
  return eco.computeOffline({ ...save, lastSeen: now - 8 * 3600e3 }, now).earned / avg;
}

// ---------------------------------------------------------------- main loop

let clock = 0;
let currentRun = 1;
const events: string[] = [];
const seen = new Set<string>();
function mark(key: string, text: string): void {
  if (seen.has(key)) return;
  seen.add(key);
  events.push(`${formatDuration(clock).padStart(7)}  ${text}`);
}

interface RoundRow extends RoundStats, ShopStats {
  run: number;
  round: number;
  clock: number;
}
interface RunRow {
  run: number;
  start: number;
  end: number;
  rounds: number;
  dm: number;
  /** Seconds from run start until each map was unlocked. */
  mapAt: Partial<Record<MapId, number>>;
  /** Rounds played on each map before the next one unlocked. */
  roundsOn: Partial<Record<MapId, number>>;
  /** 8 h offline payout in rounds of income, measured at the end of the run. */
  offline: number;
  firstPrestigeReady: number;
}
const rounds: RoundRow[] = [];
const runs: RunRow[] = [];
const snapshots: { label: string; save: SaveData }[] = [];

let save = defaultSave(0);
const profile = withSkill(1);
for (let run = 1; run <= RUNS; run++) {
  currentRun = run;
  const row: RunRow = { run, start: clock, end: clock, rounds: 0, dm: 0, mapAt: { suburb: 0 }, roundsOn: {}, offline: 0, firstPrestigeReady: -1 };
  runs.push(row);
  let stuck = 0;
  events.push(`--- run ${run} (DM ${save.dm}, total DM ${save.dmTotal}, tier ${save.tier}) ---`);
  while (true) {
    save.selectedMap = bestMap(save);
    const before = save.selectedMap;
    const levelBefore = save.mapLevel[before];
    const r = playRound(save, profile);
    row.rounds++;
    row.roundsOn[before] = (row.roundsOn[before] ?? 0) + 1;
    clock += r.played + profile.overhead;
    if (row.rounds === 1) mark(`first-${run}`, `round 1 done: $${formatNumber(r.cash)}`);
    if (VERBOSE || row.rounds % 5 === 0)
      events.push(
        `${formatDuration(clock).padStart(7)}    r${row.rounds} ${r.map} $${formatNumber(r.cash)} L${r.startLevel + 1}->L${r.endLevel + 1} ${(r.pct * 100).toFixed(1)}% cash ${formatNumber(save.cash)} mult x${eco.globalCashMult(save).toFixed(1)} up ${Object.values(save.upgrades).join(',')}`,
      );
    if (TRACE)
      events.push(
        `            trace ${r.map} L${r.startLevel + 1}->L${r.endLevel + 1} in ${r.played.toFixed(0)}/${r.roundTime}s dead ${r.deadTime.toFixed(0)}s: ${r.levelTimes.map((t) => t.toFixed(0)).join(' ')}`,
      );
    for (const id of r.unlocked) mark(`map-${id}-${run}`, `unlock map ${eco.mapDef(id).name}`);
    const sh = shop(save, r.cash);
    rounds.push({ ...r, ...sh, run, round: row.rounds, clock });
    const now = bestMap(save);
    if (now !== before) {
      row.mapAt[now] = clock - row.start;
      if (run === 1) snapshots.push({ label: `${now} entry`, save: structuredClone(save) });
    }
    stuck = now !== before || save.mapLevel[now] > levelBefore ? 0 : stuck + 1;
    const dm = eco.dmGain(save);
    if (dm > 0 && row.firstPrestigeReady < 0) {
      row.firstPrestigeReady = clock - row.start;
      mark(`pready-${run}`, `Singularity available (${dm} DM)`);
    }
    // Prestige once the gain is at least +50% of the DM held and progress has stalled: the next
    // map needs a Singularity, or the best size on the newest map has not improved for a while.
    const next = MAPS.find((m) => !save.maps[m.id]);
    const gated = !!next && save.stats.prestiges < next.needsSingularities && save.mapLevel[now] >= eco.mapDef(now).goal;
    const want = Math.max(3, save.dmTotal * 0.5);
    const holdForMoon = HOLD_MOON && !save.maps.moon && row.rounds < 80;
    if ((!holdForMoon && dm >= want && (gated || stuck >= 4)) || row.rounds > 150) {
      row.end = clock;
      row.dm = dm;
      row.offline = offlineRounds(save);
      mark(`prestige-${run}`, `SINGULARITY #${run}: +${dm} DM after ${formatDuration(clock - row.start)} (${row.rounds} rounds)`);
      save = eco.applyPrestige(save, 0);
      buyDmTree(save);
      // The game returns to the hub after a Singularity, so Head Start cash is spent before round 1.
      buyAffordable(save);
      events.push(`         DM tree: ${DM_UPGRADES.map((d) => `${d.id}=${eco.dmLevel(save, d.id)}`).join(' ')}`);
      break;
    }
  }
}
console.log(events.join('\n'));

// ---------------------------------------------------------------- report

function median(xs: number[]): number {
  const a = xs.filter((x) => Number.isFinite(x)).sort((p, q) => p - q);
  if (!a.length) return NaN;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
const fmt = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '-');

function report(): void {
  const out: string[] = ['', `=== pacing report (${HUMAN ? 'human' : 'bot'} model, ${RUNS} runs) ===`];
  const checks: [string, string, boolean][] = [];
  const check = (name: string, value: string, ok: boolean) => checks.push([name, value, ok]);

  const firstUp = median(rounds.map((r) => r.levelTimes[0] ?? Infinity));
  check('first size-up in a round (median)', `${fmt(firstUp)} s`, firstUp <= 5);

  const gaps = rounds.flatMap((r) => r.levelTimes.map((t, i) => t - (i ? r.levelTimes[i - 1] : 0)));
  const spl = median(gaps);
  check('seconds per level (median)', `${fmt(spl)} s`, spl >= 4 && spl <= 8);
  // Rounds start with SIZE.startXp of the first level's XP, so the first size-up only needs the
  // rest: scale its time up to a full level before comparing it with the last one.
  const lastOverFirst = median(
    rounds.filter((r) => r.levelTimes.length >= 3).map((r) => {
      const lt = r.levelTimes;
      return (lt[lt.length - 1] - lt[lt.length - 2]) / Math.max(0.5, lt[0] / (1 - SIZE.startXp));
    }),
  );
  check('last level / first level time (median)', `${fmt(lastOverFirst, 2)}x`, lastOverFirst <= 1.5);

  const growth = median(rounds.map((r) => Math.pow(SIZE.radiusGrowth, r.endLevel - r.startLevel)));
  check('radius growth per round (median)', `${fmt(growth, 2)}x`, growth >= 3 && growth <= 5);

  const dead = rounds.map((r) => r.deadTime);
  check('dead time (median / 90th pct)', `${fmt(median(dead))} / ${fmt(dead.sort((a, b) => a - b)[Math.floor(dead.length * 0.9)] ?? NaN)} s`, median(dead) <= 2);

  const buys = median(rounds.map((r) => r.purchases));
  check('purchases per shop visit (median)', fmt(buys), buys >= 1 && buys <= 3);
  const affordable = rounds.filter((r) => r.purchases > 0 || r.waitRounds <= 1).length / Math.max(1, rounds.length);
  check('visits with a purchase now or within 1 round', `${fmt(affordable * 100, 0)}%`, affordable >= 0.9);
  const sizeR = median(rounds.map((r) => r.sizeRounds));
  check('next Starting Size / last round income (median)', fmt(sizeR, 2), sizeR >= 0.3 && sizeR <= 1.5);
  const cheap = median(rounds.map((r) => r.cheapestRounds));
  check('cheapest option left, in rounds of income (median)', fmt(cheap, 2), cheap >= 1 && cheap <= 3);

  const r1 = runs[0];
  const perMap1 = MAPS.map((m) => r1.roundsOn[m.id]).filter((n): n is number => n !== undefined).slice(0, -1);
  check('run 1 rounds per map before the next unlocks', perMap1.join(', ') || '-', perMap1.length > 0 && perMap1.every((n) => n >= 4 && n <= 8));
  const firstPrestige = r1.end - r1.start;
  check('first Singularity', formatDuration(firstPrestige), firstPrestige >= 40 * 60 && firstPrestige <= 60 * 60);

  for (let i = 1; i < runs.length && i <= 2; i++) {
    const prev = runs[i - 1];
    const cur = runs[i];
    const prevBest = MAPS.filter((m) => prev.mapAt[m.id] !== undefined).pop()!.id;
    const at = cur.mapAt[prevBest];
    const ratio = at === undefined ? Infinity : at / Math.max(1, prev.mapAt[prevBest] ?? prev.end - prev.start);
    const [lo, hi] = i === 1 ? [0.35, 0.65] : [0.25, 0.55];
    check(`run ${i + 1} reaches ${prevBest} in (vs run ${i})`, `${fmt(ratio * 100, 0)}%`, ratio >= lo && ratio <= hi);
  }
  const dms = runs.map((r) => r.dm);
  const dmGrowth = Math.max(...dms.slice(1).map((d, i) => d / Math.max(1, dms[i])), 0);
  check('DM per run (growth at most x2)', dms.join(', '), dmGrowth <= 2);
  const moonRun = runs.find((r) => r.mapAt.moon !== undefined);
  const moonClock = moonRun ? moonRun.start + moonRun.mapAt.moon! : Infinity;
  check('all 6 maps reached', moonRun ? `${formatDuration(moonClock)} (run ${moonRun.run})` : 'not reached', moonClock >= 2 * 3600 && moonClock <= 3 * 3600 && (moonRun?.run ?? 0) >= 3);
  const off = median(runs.map((r) => r.offline));
  check('8 h offline payout, in rounds of recent income', fmt(off, 1), off >= 3 && off <= 5);

  // Skill band: same saves, low- vs high-skill player, no shopping in between. Round cash varies a
  // lot with the world seed, so each side averages 8 rounds.
  const band: string[] = [];
  let bandOk = snapshots.length > 0;
  for (const snap of snapshots.slice(0, 3)) {
    const avg = (s: number) => {
      let total = 0;
      for (let i = 0; i < 8; i++) total += playRound(structuredClone(snap.save), withSkill(s), false).cash;
      return total / 8;
    };
    const ratio = avg(1.4) / Math.max(1, avg(0.6));
    band.push(`${snap.label} ${fmt(ratio, 2)}x`);
    if (ratio < 1.5 || ratio > 3) bandOk = false;
  }
  check('skill band (skill 1.4 vs 0.6 income)', band.join(', ') || '-', bandOk);

  const w = Math.max(...checks.map((c) => c[0].length));
  for (const [name, value, ok] of checks) out.push(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(w)}  ${value}`);
  out.push(`${checks.filter((c) => c[2]).length}/${checks.length} targets met`);
  console.log(out.join('\n'));
}

if (REPORT) report();
