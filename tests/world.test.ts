import { describe, expect, it } from 'vitest';
import { GOLDEN, MAPS, ROUND_END, SAVE_VERSION, SIZE } from '../src/config/balance';
import { OBJECT_TYPES, footprintOf, typeId } from '../src/config/objects';
import { Bot } from '../src/core/bot';
import { buildRoundConfig, radiusForLevel, timeBonusFrac } from '../src/core/economy';
import { generateMap } from '../src/core/mapgen';
import { MapBuilder } from '../src/core/mapgen/builder';
import { defaultSave, deserialize, migrate, serialize } from '../src/core/save';
import { SpatialGrid } from '../src/core/spatial';
import { ALIVE, FALLING, GONE, World } from '../src/core/world';

function tinyMap() {
  const b = new MapBuilder('suburb', 100, 1);
  b.put('cone', 0.2, 0, 0, { force: true });
  b.put('car', 6, 0, 0, { force: true });
  b.put('house', -20, 0, 0, { force: true });
  return b.build('#000', '#000', { sky: '#fff', fog: '#fff', sun: '#fff', hemiSky: '#fff', hemiGround: '#000', sunIntensity: 1 });
}

function cfg(startSize = 0) {
  const s = defaultSave(0);
  s.stats.rounds = 1;
  s.upgrades.startSize = startSize;
  return buildRoundConfig(s);
}

describe('swallowing', () => {
  it('eats small objects under the hole and pays cash + XP', () => {
    const w = new World(tinyMap(), cfg());
    w.step(1 / 30);
    const cone = w.objects[0];
    expect(cone.state).toBe(FALLING);
    expect(w.cash).toBeGreaterThan(0);
    expect(w.eaten).toBe(1);
    for (let i = 0; i < 200; i++) w.step(1 / 30);
    expect(cone.state).toBe(GONE);
  });

  it('does not eat objects that are too big, even when centred', () => {
    const w = new World(tinyMap(), cfg());
    w.main.x = 6;
    w.step(1 / 30);
    expect(w.objects[1].state).toBe(ALIVE);
    expect(w.objects[1].wob).toBeGreaterThan(0);
  });

  it('eats the car once the hole is big enough', () => {
    const w = new World(tinyMap(), cfg(12));
    w.main.x = 6;
    w.step(1 / 30);
    expect(w.objects[1].state).toBe(FALLING);
  });

  it('levels up from XP and grows the radius', () => {
    const w = new World(tinyMap(), cfg());
    const r0 = w.main.baseR;
    w.gainXp(1000);
    expect(w.main.level).toBeGreaterThan(0);
    expect(w.main.baseR).toBeGreaterThan(r0);
    expect(w.events.some((e) => e.k === 'level')).toBe(true);
  });

  it('combo stacks for quick successive swallows and lapses after the window', () => {
    const b = new MapBuilder('suburb', 100, 1);
    for (let i = 0; i < 5; i++) b.put('cone', i * 0.05, 0, 0, { force: true });
    const w = new World(b.build('#000', '#000', { sky: '#fff', fog: '#fff', sun: '#fff', hemiSky: '#fff', hemiGround: '#000', sunIntensity: 1 }), cfg());
    w.step(1 / 30);
    expect(w.combo).toBe(5);
    for (let i = 0; i < 90; i++) w.step(1 / 30);
    expect(w.combo).toBe(0);
    expect(w.comboBest).toBe(5);
  });

  it('starts Dash ready and the big abilities half-charged', () => {
    const s = defaultSave(0);
    s.stats.rounds = 1;
    s.abilities = { dash: 1, vortex: 1, mega: 1 };
    const w = new World(tinyMap(), buildRoundConfig(s));
    expect(w.abilityReady('dash')).toBe(true);
    expect(w.abilityReady('vortex')).toBe(false);
    expect(w.abilities.vortex.cd).toBeCloseTo(w.cfg.abilities.vortex.cooldown / 2);
    expect(w.abilities.mega.cd).toBeCloseTo(w.cfg.abilities.mega.cooldown / 2);
  });

  it('golden props are worth GOLDEN.valueMul times more', () => {
    const plain = new World(tinyMap(), cfg());
    const gold = new World(tinyMap(), { ...cfg(), goldChance: 1 });
    expect(gold.objects.every((o) => o.gold)).toBe(true);
    expect(gold.objects[0].value).toBeCloseTo(plain.objects[0].value * GOLDEN.valueMul);
  });

  it('rolls random events per round; their bonus props do not count toward map %', () => {
    const fired = new Set<string>();
    let quiet = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const w = new World(generateMap('farm'), cfg(), { seed });
      const total = w.weightTotal;
      let n = 0;
      while (w.running) {
        w.step(0.1);
        for (const e of w.events) if (e.k === 'event' && e.on) (fired.add(e.id), n++);
        w.events.length = 0;
      }
      if (n === 0) quiet++;
      expect(w.objects.filter((o) => o.event).every((o) => o.w === 0)).toBe(true);
      expect(w.weightTotal).toBe(total);
    }
    // Some rounds get events, some get none.
    expect(fired.size).toBeGreaterThan(1);
    expect(quiet).toBeGreaterThan(0);
  });

  it('ends the round after the timer runs out', () => {
    const w = new World(generateMap('suburb'), cfg());
    let ended = false;
    for (let i = 0; i < 30 * 70 && !ended; i++) {
      w.step(1 / 30);
      ended = w.events.some((e) => e.k === 'end');
      w.events.length = 0;
    }
    expect(ended).toBe(true);
  });
});

describe('round end', () => {
  const theme = { sky: '#fff', fog: '#fff', sun: '#fff', hemiSky: '#fff', hemiGround: '#000', sunIntensity: 1 };
  /** `small` cones far from the hole plus one cone scaled to footprint `bigF`. */
  function ladderMap(small: number, bigF: number) {
    const b = new MapBuilder('suburb', 200, 1);
    for (let i = 0; i < small; i++) b.put('cone', 30 + i * 1.5, 30, 0, { force: true });
    b.put('cone', -30, -30, 0, { force: true, scale: bigF / footprintOf(OBJECT_TYPES[typeId('cone')]) });
    return b.build('#000', '#000', theme);
  }
  const fitAt = (level: number) => SIZE.fit * radiusForLevel(level);

  it('counts props it could grow into on the XP of everything that fits now', () => {
    const big = fitAt(1) * 0.98;
    expect(new World(ladderMap(0, big), cfg()).reachableLeft()).toBe(0);
    expect(new World(ladderMap(40, big), cfg()).reachableLeft()).toBe(41);
  });

  it('counts what Mega Mouth will fit while it can still be used', () => {
    const big = fitAt(0) * 1.2;
    const s = defaultSave(0);
    s.stats.rounds = 1;
    expect(new World(ladderMap(0, big), buildRoundConfig(s)).reachableLeft()).toBe(0);
    s.abilities.mega = 1;
    expect(new World(ladderMap(0, big), buildRoundConfig(s)).reachableLeft()).toBe(1);
  });

  it('counts the round as done when it cannot grow and only crumbs are left', () => {
    const w = new World(ladderMap(3, 0.3), cfg(12));
    expect(w.reachable().levels).toBe(0);
    expect(w.snackedOut()).toBe(false);
    w.cash = (w.reachable().cash / ROUND_END.crumbs) * 2;
    expect(w.snackedOut()).toBe(true);
  });

  it('finishes early with a time bonus once nothing reachable is left', () => {
    const w = new World(tinyMap(), cfg());
    for (let i = 0; i < 30 * 5 && !w.ended; i++) w.step(1 / 30);
    expect(w.ended).toBe(true);
    expect(w.endReason).toBe('snackedOut');
    expect(w.timeLeft).toBeGreaterThan(50);
    expect(w.timeBonus).toBeCloseTo((w.cash - w.timeBonus) * timeBonusFrac(w.timeLeft));
  });
});

describe('maps', () => {
  it('generates every map deterministically with known prop types', () => {
    for (const m of MAPS) {
      const a = generateMap(m.id);
      expect(a.spawns.length).toBeGreaterThan(500);
      const ids = new Set(OBJECT_TYPES.map((t) => t.id));
      for (const s of a.spawns) expect(ids.has(s.type)).toBe(true);
    }
  });

  it('a bot round on the suburb earns cash and grows', () => {
    const w = new World(generateMap('suburb'), cfg());
    const bot = new Bot();
    for (let i = 0; i < 30 * 30; i++) {
      w.input = bot.steer(w, 1 / 30);
      w.step(1 / 30);
      w.events.length = 0;
    }
    expect(w.eaten).toBeGreaterThan(20);
    expect(w.main.level).toBeGreaterThan(2);
  });
});

describe('placement', () => {
  it('drops small props forced inside a bigger building and keeps wanderers out of it', () => {
    const b = new MapBuilder('suburb', 100, 1);
    b.put('house', 0, 0, 0.3, { force: true });
    b.put('bench', 3.0, 2.0, 0, { force: true });
    b.put('bench', 12, 0, 0, { force: true });
    // Inside the rotated house corner but outside its round reservation.
    expect(b.isFree(4.0, 1.9, 0.5)).toBe(false);
    for (let i = 0; i < 20; i++) b.wanderer('dog', { x0: -9, x1: 9, z0: -9, z1: 9 }, 1.6);
    const map = b.build('#000', '#000', { sky: '#fff', fog: '#fff', sun: '#fff', hemiSky: '#fff', hemiGround: '#000', sunIntensity: 1 });
    expect(map.spawns.filter((s) => s.type === 'bench').map((s) => s.x)).toEqual([12]);
    const w = new World(map, cfg());
    for (const o of w.movers) expect(w.blocked(o.x, o.z)).toBe(false);
    for (let i = 0; i < 300; i++) w.step(1 / 30);
    for (const o of w.movers) expect(w.blocked(o.x, o.z)).toBe(false);
  });
});

describe('spatial grid', () => {
  it('finds inserted items and forgets removed ones', () => {
    const g = new SpatialGrid<{ x: number; z: number; cell: number }>(100, 8);
    const a = { x: 1, z: 1, cell: -1 };
    const b = { x: 40, z: 40, cell: -1 };
    g.insert(a);
    g.insert(b);
    const found: unknown[] = [];
    g.query(0, 0, 5, (i) => found.push(i));
    expect(found).toContain(a);
    expect(found).not.toContain(b);
    g.remove(a);
    expect(g.count()).toBe(1);
    b.x = -40;
    g.update(b);
    const found2: unknown[] = [];
    g.query(-40, 40, 2, (i) => found2.push(i));
    expect(found2).toContain(b);
  });
});

describe('save', () => {
  it('round-trips and fills in defaults for missing fields', () => {
    const s = defaultSave(0);
    s.cash = 123;
    s.gulpedia.car = 2;
    s.flags.tab_maps = true;
    const back = deserialize(serialize(s), 0);
    expect(back.cash).toBe(123);
    expect(back.gulpedia.car).toBe(2);
    expect(back.flags.tab_maps).toBe(true);
    const partial = migrate({ version: SAVE_VERSION, cash: 50, upgrades: { speed: 3 } }, 0);
    expect(partial.cash).toBe(50);
    expect(partial.upgrades.speed).toBe(3);
    expect(partial.upgrades.startSize).toBe(0);
    expect(partial.mapLevel.suburb).toBe(0);
    expect(partial.settings.volume).toBeGreaterThan(0);
  });

  it('starts fresh from saves made before the rebalance, keeping only settings', () => {
    const old = migrate({ version: 2, cash: 1e9, dm: 40, upgrades: { speed: 30 }, settings: { volume: 0.2 } }, 0);
    expect(old.cash).toBe(0);
    expect(old.dm).toBe(0);
    expect(old.upgrades.speed).toBe(0);
    expect(old.settings.volume).toBe(0.2);
  });

  it('survives garbage', () => {
    expect(deserialize('not json', 0).cash).toBe(0);
    expect(migrate(42, 0).cash).toBe(0);
    expect(migrate({ cash: -5, selectedMap: 'moon' }, 0).selectedMap).toBe('suburb');
  });
});
