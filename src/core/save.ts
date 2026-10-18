import {
  ABILITIES,
  DM_UPGRADES,
  MAPS,
  SAVE_VERSION,
  UPGRADES,
  type AbilityId,
  type DmUpgradeId,
  type MapId,
  type UpgradeId,
} from '../config/balance';

export interface Settings {
  volume: number;
  muted: boolean;
  /** Ambient sound beds (key kept as `music` for old saves). */
  music: boolean;
  /** Background music. */
  tunes: boolean;
  scientific: boolean;
  shadows: boolean;
  shake: boolean;
  floaters: boolean;
}

export interface Stats {
  rounds: number;
  totalEaten: number;
  bestCombo: number;
  biggestF: number;
  biggestType: string;
  bestLevel: number;
  bestRoundCash: number;
  prestiges: number;
  playSeconds: number;
  abilitiesUsed: number;
}

export interface SaveData {
  version: number;
  cash: number;
  /** Cash earned since the last Singularity (drives Dark Matter). */
  runCash: number;
  lifetimeCash: number;
  dm: number;
  dmTotal: number;
  upgrades: Record<UpgradeId, number>;
  helpers: number;
  helperLevel: number;
  abilities: Record<AbilityId, number>;
  maps: Record<MapId, boolean>;
  selectedMap: MapId;
  mapBest: Record<MapId, number>;
  map100: Record<MapId, boolean>;
  dmUpgrades: Record<DmUpgradeId, number>;
  skins: string[];
  skin: string;
  gulpedia: Record<string, number>;
  achievements: string[];
  /** Misc one-shot UI flags (tabs seen, tutorial hints). */
  flags: Record<string, boolean>;
  stats: Stats;
  settings: Settings;
  lastSeen: number;
  created: number;
}

function record<K extends string, V>(keys: readonly K[], v: V): Record<K, V> {
  const r = {} as Record<K, V>;
  for (const k of keys) r[k] = v;
  return r;
}

export function defaultSave(now = Date.now()): SaveData {
  return {
    version: SAVE_VERSION,
    cash: 0,
    runCash: 0,
    lifetimeCash: 0,
    dm: 0,
    dmTotal: 0,
    upgrades: record(UPGRADES.map((u) => u.id), 0),
    helpers: 0,
    helperLevel: 0,
    abilities: record(ABILITIES.map((a) => a.id), 0),
    maps: { ...record(MAPS.map((m) => m.id), false), suburb: true },
    selectedMap: 'suburb',
    mapBest: record(MAPS.map((m) => m.id), 0),
    map100: record(MAPS.map((m) => m.id), false),
    dmUpgrades: record(DM_UPGRADES.map((u) => u.id), 0),
    skins: ['classic'],
    skin: 'classic',
    gulpedia: {},
    achievements: [],
    flags: {},
    stats: {
      rounds: 0,
      totalEaten: 0,
      bestCombo: 0,
      biggestF: 0,
      biggestType: '',
      bestLevel: 0,
      bestRoundCash: 0,
      prestiges: 0,
      playSeconds: 0,
      abilitiesUsed: 0,
    },
    settings: {
      volume: 0.7,
      muted: false,
      music: true,
      tunes: true,
      scientific: false,
      shadows: true,
      shake: true,
      floaters: true,
    },
    lastSeen: now,
    created: now,
  };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Deep-merge loaded data onto defaults so new fields get sane values and bad types are dropped. */
function mergeInto<T>(def: T, src: unknown): T {
  if (!isObj(def) || !isObj(src)) {
    if (typeof def === typeof src && !Array.isArray(def)) return src as T;
    if (Array.isArray(def) && Array.isArray(src)) return src as T;
    return def;
  }
  const out: Record<string, unknown> = { ...(def as Record<string, unknown>) };
  for (const [k, v] of Object.entries(src)) {
    if (k in out) out[k] = mergeInto(out[k], v);
  }
  return out as T;
}

/** Version migrations: each step upgrades from version n to n+1. */
const MIGRATIONS: Record<number, (d: Record<string, unknown>) => void> = {
  // 0 -> 1: pre-release saves had no version field; nothing to transform.
  0: () => {},
  // 1 -> 2: map % became weighted by ground area, so old best % records no longer compare.
  1: (d) => {
    if (!isObj(d.mapBest)) return;
    const done = isObj(d.map100) ? d.map100 : {};
    for (const k of Object.keys(d.mapBest)) d.mapBest[k] = done[k] === true ? 1 : 0;
  },
};

export function migrate(raw: unknown, now = Date.now()): SaveData {
  if (!isObj(raw)) return defaultSave(now);
  const data = { ...raw };
  let v = typeof data.version === 'number' ? data.version : 0;
  while (v < SAVE_VERSION) {
    MIGRATIONS[v]?.(data);
    v++;
  }
  data.version = SAVE_VERSION;
  const merged = mergeInto(defaultSave(now), data);
  // Gulpedia keys are dynamic: keep only numeric counts.
  const g: Record<string, number> = {};
  if (isObj(data.gulpedia)) {
    for (const [k, c] of Object.entries(data.gulpedia)) if (typeof c === 'number' && c > 0) g[k] = c;
  }
  merged.gulpedia = g;
  const flags: Record<string, boolean> = {};
  if (isObj(data.flags)) {
    for (const [k, v] of Object.entries(data.flags)) if (v === true) flags[k] = true;
  }
  merged.flags = flags;
  merged.maps.suburb = true;
  if (!merged.maps[merged.selectedMap]) merged.selectedMap = 'suburb';
  if (!merged.skins.includes(merged.skin)) merged.skin = 'classic';
  for (const key of ['cash', 'runCash', 'lifetimeCash', 'dm', 'dmTotal'] as const) {
    if (!Number.isFinite(merged[key]) || merged[key] < 0) merged[key] = 0;
  }
  return merged;
}

export function serialize(save: SaveData): string {
  return JSON.stringify(save);
}

export function deserialize(text: string | null, now = Date.now()): SaveData {
  if (!text) return defaultSave(now);
  try {
    return migrate(JSON.parse(text), now);
  } catch {
    return defaultSave(now);
  }
}
