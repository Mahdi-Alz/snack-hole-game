import type { MapId } from '../../config/balance';
import { MAPS } from '../../config/balance';
import type { MapData } from './builder';
import { generateAirport } from './airport';
import { generateDowntown } from './downtown';
import { generateFarm } from './farm';
import { generateHarbor } from './harbor';
import { fillLadder } from './ladder';
import { generateMoon } from './moon';
import { generateSuburb } from './suburb';

const GENERATORS: Partial<Record<MapId, (seed: number) => MapData>> = {
  suburb: generateSuburb,
  downtown: generateDowntown,
  farm: generateFarm,
  harbor: generateHarbor,
  airport: generateAirport,
  moon: generateMoon,
};

const cache = new Map<MapId, MapData>();

/** Maps are deterministic per id; generation is cached because rounds replay the same layout. */
export function generateMap(id: MapId): MapData {
  let m = cache.get(id);
  if (!m) {
    const def = MAPS.find((d) => d.id === id)!;
    const gen = GENERATORS[id] ?? generateSuburb;
    m = gen(def.seed);
    m.id = id;
    fillLadder(m);
    cache.set(id, m);
  }
  return m;
}

export type { MapData } from './builder';
