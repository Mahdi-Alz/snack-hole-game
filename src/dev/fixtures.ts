import { defaultSave, type SaveData } from '../core/save';

/** Named starting saves for the `?save=NAME` dev flag (see flags.ts). */
const FIXTURES: Record<string, (s: SaveData) => void> = {
  /** One Singularity in, farm and downtown unlocked, farm selected; every hub tab has content. */
  midgame: (s) => {
    s.stats.rounds = 30;
    s.cash = 3.2e6;
    s.runCash = 6e7;
    s.lifetimeCash = 8e8;
    s.dm = 12;
    s.dmTotal = 20;
    s.dmClaimed = 10;
    s.stats.prestiges = 1;
    s.helpers = 3;
    s.helperLevel = 6;
    s.abilities.dash = 3;
    s.abilities.vortex = 1;
    Object.assign(s.upgrades, { startSize: 20, speed: 5, cashValue: 6, roundTime: 2, growth: 3, magnet: 4, combo: 3, offline: 1 });
    s.mapLevel.suburb = 18;
    s.mapLevel.farm = 21;
    Object.assign(s.maps, { downtown: true, farm: true });
    s.mapBest.suburb = 1;
    s.map100.suburb = true;
    s.mapBest.downtown = 0.42;
    s.selectedMap = 'farm';
    for (const id of ['cone', 'hydrant', 'person', 'car', 'bus', 'house', 'tree', 'bench', 'dog', 'cow', 'chicken', 'pig', 'barn']) s.gulpedia[id] = 12;
    s.achievements.push('firstBite', 'eat100', 'car', 'house', 'combo25');
    s.skins.push('mint');
  },
};

export function fixtureSave(name: string): SaveData {
  const apply = FIXTURES[name];
  if (!apply) throw new Error(`Unknown ?save fixture "${name}" (known: ${Object.keys(FIXTURES).join(', ')})`);
  const s = defaultSave();
  apply(s);
  return s;
}
