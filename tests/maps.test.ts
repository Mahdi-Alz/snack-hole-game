import { describe, expect, it } from 'vitest';
import { MAPS } from '../src/config/balance';
import { OBJECT_TYPES, footprintOf, typeId } from '../src/config/objects';
import { generateMap } from '../src/core/mapgen';
import { spawnLevel } from '../src/core/mapgen/ladder';

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
  }
});
