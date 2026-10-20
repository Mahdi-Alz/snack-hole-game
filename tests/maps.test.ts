import { describe, expect, it } from 'vitest';
import { MAPS, UPGRADES } from '../src/config/balance';
import { OBJECT_TYPES, footprintOf, typeId } from '../src/config/objects';
import { buildRoundConfig } from '../src/core/economy';
import { generateMap } from '../src/core/mapgen';
import { spawnLevel } from '../src/core/mapgen/ladder';
import { defaultSave } from '../src/core/save';
import { World } from '../src/core/world';

describe('map size ladders', () => {
  for (const m of MAPS) {
    const map = generateMap(m.id);
    const levels = map.spawns.map(spawnLevel);
    const top = Math.max(...levels);

    it(`${m.id}: never more than one size level without something new to eat`, () => {
      const has = new Set(levels);
      let run = 0;
      let worst = 0;
      for (let l = 1; l < top; l++) {
        run = has.has(l) ? 0 : run + 1;
        worst = Math.max(worst, run);
      }
      expect(worst).toBeLessThanOrEqual(1);
    });

    it(`${m.id}: no single prop is more than a quarter of the map`, () => {
      const w = map.spawns.map((s) => footprintOf(OBJECT_TYPES[typeId(s.type)], s.scale) ** 2);
      const total = w.reduce((a, b) => a + b, 0);
      expect(Math.max(...w) / total).toBeLessThanOrEqual(0.25);
    });

    it(`${m.id}: can be eaten to 100% from the smallest size with Growth Rate maxed and Mega Mouth`, () => {
      const s = defaultSave(0);
      s.maps[m.id] = true;
      s.upgrades.growth = UPGRADES.find((u) => u.id === 'growth')!.max;
      s.abilities.mega = 1;
      const cfg = buildRoundConfig(s, m.id);
      cfg.startLevel = 0;
      const w = new World(map, cfg, { seed: 1 });
      expect(w.reachable().weight / w.weightTotal).toBeCloseTo(1, 6);
    });
  }
});
