import { describe, expect, it } from 'vitest';
import { buildRoundConfig } from '../src/core/economy';
import { generateMap } from '../src/core/mapgen';
import { defaultSave } from '../src/core/save';
import { ALIVE, MV_RUN, World } from '../src/core/world';

function farmConfig() {
  const s = defaultSave(0);
  s.stats.rounds = 1;
  return buildRoundConfig(s, 'farm');
}

describe('stampede', () => {
  it('every animal that is not eaten runs off the stage, even through the farmstead buildings', () => {
    const dt = 1 / 20;
    let checked = false;
    // The first seed (from 1) whose round rolls a stampede.
    for (let seed = 1; seed <= 30 && !checked; seed++) {
      const w = new World(generateMap('farm'), farmConfig(), { seed });
      // Park the hole in the farmstead so the herd runs into the barn and the farmhouse.
      w.main.x = -55;
      w.main.z = -55;
      let on = -1;
      let off = -1;
      while (w.time < 80 && (off < 0 || w.time < off + 30)) {
        w.step(dt);
        for (const e of w.events) if (e.k === 'event' && e.id === 'stampede') e.on ? (on = w.time) : (off = w.time);
        w.events.length = 0;
        if (on < 0 && w.time > 75) break;
      }
      if (on < 0) continue;
      expect(off).toBeGreaterThan(on);
      const runners = w.objects.filter((o) => o.mv === MV_RUN && !o.fly);
      expect(runners.length).toBeGreaterThan(0);
      expect(runners.filter((o) => o.state === ALIVE)).toEqual([]);
      checked = true;
    }
    expect(checked).toBe(true);
  });
});
