import { describe, expect, it } from 'vitest';
import { CASH_VALUE, COMBO, HELPERS, MAPS, OFFLINE, PRESTIGE, ROUND, UPGRADES } from '../src/config/balance';
import {
  applyPrestige,
  buyMap,
  buildRoundConfig,
  buyUpgrade,
  bulkCount,
  canEat,
  cashValueMult,
  comboMult,
  computeOffline,
  dmForRunCash,
  earn,
  geomBulkCost,
  geomCost,
  geomMaxAffordable,
  levelToEat,
  passiveIncome,
  radiusForLevel,
  roundTimeFor,
  runCashForDm,
} from '../src/core/economy';
import { defaultSave } from '../src/core/save';

describe('cost curves', () => {
  it('grows exponentially', () => {
    expect(geomCost(10, 1.5, 0)).toBe(10);
    expect(geomCost(10, 1.5, 2)).toBeCloseTo(22.5);
  });

  it('bulk cost equals the sum of single costs', () => {
    let sum = 0;
    for (let i = 3; i < 13; i++) sum += geomCost(12, 1.52, i);
    expect(geomBulkCost(12, 1.52, 3, 10)).toBeCloseTo(sum, 6);
  });

  it('max affordable never overspends and is maximal', () => {
    for (const cash of [0, 11, 12, 100, 12345, 1e9]) {
      const n = geomMaxAffordable(12, 1.52, 2, cash);
      expect(geomBulkCost(12, 1.52, 2, n)).toBeLessThanOrEqual(cash + 1e-6);
      expect(geomBulkCost(12, 1.52, 2, n + 1)).toBeGreaterThan(cash);
    }
    expect(geomMaxAffordable(10, 1.2, 0, 1e12, 5)).toBe(5);
  });
});

describe('upgrades', () => {
  it('buys single and bulk levels, deducting cash', () => {
    const s = defaultSave(0);
    s.cash = 100;
    const base = UPGRADES.find((u) => u.id === 'speed')!.base;
    expect(buyUpgrade(s, 'speed', 1)).toBe(1);
    expect(s.upgrades.speed).toBe(1);
    expect(s.cash).toBeCloseTo(100 - base);
    const n = bulkCount(s, 'speed', 'max');
    const got = buyUpgrade(s, 'speed', n);
    expect(got).toBe(n);
    expect(s.cash).toBeGreaterThanOrEqual(0);
  });

  it('refuses purchases it cannot afford', () => {
    const s = defaultSave(0);
    s.cash = 5;
    expect(buyUpgrade(s, 'startSize', 1)).toBe(0);
    expect(s.cash).toBe(5);
  });

  it('respects max levels', () => {
    const s = defaultSave(0);
    const def = UPGRADES.find((u) => u.id === 'roundTime')!;
    s.upgrades.roundTime = def.max;
    s.cash = 1e30;
    expect(buyUpgrade(s, 'roundTime', 1)).toBe(0);
  });

  it('cash value doubles at milestones', () => {
    const [m1, m2] = CASH_VALUE.milestones;
    const lin = (l: number) => 1 + CASH_VALUE.perLevel * l;
    expect(cashValueMult(m1 - 1)).toBeCloseTo(lin(m1 - 1));
    expect(cashValueMult(m1)).toBeCloseTo(lin(m1) * 2);
    expect(cashValueMult(m2)).toBeCloseTo(lin(m2) * 4);
  });

  it('first round is a short warm-up', () => {
    const s = defaultSave(0);
    expect(roundTimeFor(s)).toBe(20);
    s.stats.rounds = 1;
    expect(roundTimeFor(s)).toBe(ROUND.baseTime);
  });
});

describe('size rules', () => {
  it('levelToEat returns the first level whose radius fits', () => {
    for (const f of [0.3, 1, 2.2, 5, 12]) {
      const l = levelToEat(f);
      expect(canEat(f, radiusForLevel(l))).toBe(true);
      if (l > 0) expect(canEat(f, radiusForLevel(l - 1))).toBe(false);
    }
  });

  it('combo multiplier ramps and caps', () => {
    expect(comboMult(1, 3)).toBe(1);
    expect(comboMult(11, 3)).toBeCloseTo(1 + COMBO.perStack * 10);
    expect(comboMult(100000, 3)).toBe(3);
  });
});

describe('maps', () => {
  it('must be unlocked in order', () => {
    const s = defaultSave(0);
    s.cash = 1e12;
    expect(buyMap(s, MAPS[2].id)).toBe(false);
    expect(buyMap(s, MAPS[1].id)).toBe(true);
    expect(buyMap(s, MAPS[2].id)).toBe(true);
  });

  it('later maps start the hole smaller and grow it slower', () => {
    const s = defaultSave(0);
    s.stats.rounds = 1;
    s.upgrades.startSize = 20;
    const first = buildRoundConfig(s, MAPS[0].id);
    const last = buildRoundConfig(s, MAPS[MAPS.length - 1].id);
    expect(first.startLevel).toBe(20);
    expect(last.startLevel).toBe(20 - MAPS[MAPS.length - 1].sizeOffset);
    expect(last.xpMult).toBeLessThan(first.xpMult);
    s.upgrades.startSize = 0;
    expect(buildRoundConfig(s, MAPS[MAPS.length - 1].id).startLevel).toBe(0);
  });
});

describe('offline progress', () => {
  it('earns nothing without helpers or for short absences', () => {
    const s = defaultSave(0);
    expect(computeOffline(s, 10 * 3600e3).earned).toBe(0);
    s.helpers = 1;
    expect(computeOffline(s, 30e3).earned).toBe(0);
  });

  it('caps the credited time and applies efficiency', () => {
    const s = defaultSave(0);
    s.helpers = 2;
    const rate = passiveIncome(s);
    const r = computeOffline(s, 48 * 3600e3);
    expect(r.creditedSeconds).toBe(OFFLINE.baseCapHours * 3600);
    expect(r.earned).toBeCloseTo(rate * OFFLINE.baseCapHours * 3600 * OFFLINE.baseEfficiency, 3);
    s.upgrades.offline = 2;
    expect(computeOffline(s, 48 * 3600e3).creditedSeconds).toBe((OFFLINE.baseCapHours + 2) * 3600);
  });

  it('passive income scales with helper count and level', () => {
    const s = defaultSave(0);
    s.helpers = 1;
    const one = passiveIncome(s);
    expect(one).toBeCloseTo(HELPERS.incomeBase);
    s.helpers = 3;
    s.helperLevel = 2;
    expect(passiveIncome(s)).toBeCloseTo(3 * HELPERS.incomeBase * HELPERS.incomeGrowth ** 2);
  });
});

describe('prestige', () => {
  it('needs a minimum run and follows the sqrt curve', () => {
    const d = PRESTIGE.divisor;
    expect(dmForRunCash(PRESTIGE.minRunCash - 1)).toBe(0);
    expect(dmForRunCash(d)).toBe(PRESTIGE.coef);
    expect(dmForRunCash(4 * d)).toBe(2 * PRESTIGE.coef);
    expect(dmForRunCash(runCashForDm(12))).toBeGreaterThanOrEqual(12);
  });

  it('resets the run but keeps meta progress', () => {
    const s = defaultSave(0);
    earn(s, 4 * PRESTIGE.divisor);
    s.upgrades.speed = 10;
    s.maps.downtown = true;
    s.gulpedia.car = 3;
    s.achievements.push('firstBite');
    s.map100.suburb = true;
    const n = applyPrestige(s);
    expect(n.dm).toBe(2 * PRESTIGE.coef);
    expect(n.dmTotal).toBe(2 * PRESTIGE.coef);
    expect(n.cash).toBe(0);
    expect(n.upgrades.speed).toBe(0);
    expect(n.maps.downtown).toBe(false);
    expect(n.gulpedia.car).toBe(3);
    expect(n.achievements).toContain('firstBite');
    expect(n.map100.suburb).toBe(true);
    expect(n.lifetimeCash).toBe(4 * PRESTIGE.divisor);
    expect(n.stats.prestiges).toBe(1);
  });

  it('wormhole keeps maps and head start grants cash', () => {
    const s = defaultSave(0);
    earn(s, 1e6);
    s.maps.downtown = true;
    s.dmUpgrades.wormhole = 1;
    s.dmUpgrades.headStart = 2;
    const n = applyPrestige(s);
    expect(n.maps.downtown).toBe(true);
    expect(n.cash).toBe(5000);
  });
});
