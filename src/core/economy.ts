import {
  ABILITIES,
  ABILITY_LEVEL,
  ACHIEVEMENT_BONUS,
  CASH_VALUE,
  COMBO,
  DM_UPGRADES,
  GOLDEN,
  GROWTH_PER_LEVEL,
  HEAD_START_BASE,
  HELPERS,
  MAGNET,
  MAPS,
  MAP_COMPLETE_BONUS,
  MAP_SCALE,
  OFFLINE,
  PRESTIGE,
  ROUND,
  SET_BONUS,
  SIZE,
  SPEED_PER_LEVEL,
  UPGRADES,
  type AbilityDef,
  type AbilityId,
  type DmUpgradeDef,
  type DmUpgradeId,
  type MapDef,
  type MapId,
  type UpgradeDef,
  type UpgradeId,
} from '../config/balance';
import { OBJECT_TYPES, type GulpSet } from '../config/objects';
import { defaultSave, type SaveData } from './save';

// ---------------------------------------------------------------- generic cost curves

export function geomCost(base: number, growth: number, level: number): number {
  return base * Math.pow(growth, level);
}

/** Total cost of buying n levels starting at `level`. */
export function geomBulkCost(base: number, growth: number, level: number, n: number): number {
  if (n <= 0) return 0;
  if (growth === 1) return base * n;
  return (base * Math.pow(growth, level) * (Math.pow(growth, n) - 1)) / (growth - 1);
}

/** How many levels can be bought with `cash`, capped by `maxLevels`. */
export function geomMaxAffordable(
  base: number,
  growth: number,
  level: number,
  cash: number,
  maxLevels = Infinity,
): number {
  if (maxLevels <= 0) return 0;
  const first = geomCost(base, growth, level);
  if (cash < first) return 0;
  let n: number;
  if (growth === 1) n = Math.floor(cash / base);
  else n = Math.floor(Math.log(1 + (cash * (growth - 1)) / first) / Math.log(growth));
  n = Math.min(Math.max(n, 0), maxLevels);
  // Guard against floating point drift at the boundary.
  while (n > 0 && geomBulkCost(base, growth, level, n) > cash * (1 + 1e-9)) n--;
  return n;
}

// ---------------------------------------------------------------- lookups

export const upgradeDef = (id: UpgradeId): UpgradeDef => UPGRADES.find((u) => u.id === id)!;
export const abilityDef = (id: AbilityId): AbilityDef => ABILITIES.find((a) => a.id === id)!;
export const dmUpgradeDef = (id: DmUpgradeId): DmUpgradeDef => DM_UPGRADES.find((u) => u.id === id)!;
export const mapDef = (id: MapId): MapDef => MAPS.find((m) => m.id === id)!;

// ---------------------------------------------------------------- size formulas

export function radiusForLevel(level: number): number {
  return SIZE.baseRadius * Math.pow(SIZE.radiusGrowth, level);
}

export function xpForLevel(level: number): number {
  const r = radiusForLevel(level);
  return SIZE.xpCoef * Math.pow(r, SIZE.xpExp);
}

export function holeSpeed(radius: number, speedMult: number): number {
  return (SIZE.speedBase + SIZE.speedPerRadius * radius) * speedMult;
}

export function canEat(footprint: number, radius: number): boolean {
  return footprint <= SIZE.fit * radius;
}

/** Smallest level whose radius can swallow an object with this footprint. */
export function levelToEat(footprint: number): number {
  return Math.max(0, Math.ceil(Math.log(footprint / (SIZE.fit * SIZE.baseRadius)) / Math.log(SIZE.radiusGrowth) - 1e-9));
}

// ---------------------------------------------------------------- upgrade effects

export function cashValueMult(level: number): number {
  let m = 1 + CASH_VALUE.perLevel * level;
  for (const ms of CASH_VALUE.milestones) if (level >= ms) m *= 2;
  return m;
}

export function magnetRangeFrac(level: number): number {
  return level <= 0 ? 0 : MAGNET.rangeBase + MAGNET.rangePerLevel * level;
}

export function magnetPull(radius: number, level: number): number {
  return (MAGNET.pullBase + MAGNET.pullPerRadius * radius) * (1 + 0.03 * level);
}

export function goldChance(level: number): number {
  return GOLDEN.baseChance + GOLDEN.chancePerLevel * level;
}

export function comboWindow(level: number): number {
  return COMBO.baseWindow + COMBO.windowPerLevel * level;
}

export function comboCap(level: number): number {
  return COMBO.baseCap + COMBO.capPerLevel * level;
}

export function comboMult(stack: number, cap: number): number {
  if (stack <= 1) return 1;
  return Math.min(1 + COMBO.perStack * (stack - 1), cap);
}

export function helperRadius(level: number): number {
  return Math.min(HELPERS.maxRadius, HELPERS.baseRadius * Math.pow(HELPERS.radiusGrowth, level));
}

export function upgradeCost(id: UpgradeId, level: number): number {
  const d = upgradeDef(id);
  return geomCost(d.base, d.growth, level);
}

export function upgradeMaxed(save: SaveData, id: UpgradeId): boolean {
  return save.upgrades[id] >= upgradeDef(id).max;
}

/** Human-readable effect of an upgrade at a given level. */
export function upgradeEffectText(id: UpgradeId, level: number): string {
  switch (id) {
    case 'startSize':
      return `Size ${level + 1}`;
    case 'roundTime':
      return `${ROUND.baseTime + ROUND.perLevel * level}s`;
    case 'speed':
      return `+${Math.round(SPEED_PER_LEVEL * level * 100)}%`;
    case 'cashValue':
      return `x${cashValueMult(level).toFixed(level >= 10 ? 1 : 2)}`;
    case 'growth':
      return `+${Math.round(GROWTH_PER_LEVEL * level * 100)}% XP`;
    case 'magnet':
      return level === 0 ? 'Off' : `${Math.round(magnetRangeFrac(level) * 100)}% range`;
    case 'combo':
      return `${comboWindow(level).toFixed(2)}s, cap x${comboCap(level).toFixed(1)}`;
    case 'golden':
      return `${(goldChance(level) * 100).toFixed(1)}% golden`;
    case 'offline': {
      const cap = OFFLINE.baseCapHours + OFFLINE.capPerLevel * level;
      const eff = OFFLINE.baseEfficiency + OFFLINE.efficiencyPerLevel * level;
      return `${cap}h @ ${Math.round(eff * 100)}%`;
    }
  }
}

export function isUpgradeVisible(save: SaveData, d: UpgradeDef): boolean {
  if (d.needsHelper && save.helpers <= 0) return false;
  return save.runCash >= d.unlockAt || save.upgrades[d.id] > 0;
}

// ---------------------------------------------------------------- bonuses

export function gulpSetTypes(set: GulpSet): string[] {
  return OBJECT_TYPES.filter((t) => t.set === set).map((t) => t.id);
}

export function completedSets(save: SaveData): GulpSet[] {
  const sets = [...new Set(OBJECT_TYPES.map((t) => t.set))];
  return sets.filter((s) => gulpSetTypes(s).every((id) => (save.gulpedia[id] ?? 0) > 0));
}

export function dmLevel(save: SaveData, id: DmUpgradeId): number {
  return save.dmUpgrades[id] ?? 0;
}

export interface CashBreakdown {
  upgrade: number;
  darkMatter: number;
  eventHorizon: number;
  achievements: number;
  sets: number;
  maps: number;
  total: number;
}

export function cashBreakdown(save: SaveData): CashBreakdown {
  const upgrade = cashValueMult(save.upgrades.cashValue);
  const darkMatter = 1 + PRESTIGE.bonusPerDm * save.dmTotal;
  const eventHorizon = 1 + 0.25 * dmLevel(save, 'eventHorizon');
  const achievements = 1 + ACHIEVEMENT_BONUS * save.achievements.length;
  const sets = 1 + SET_BONUS * completedSets(save).length;
  const maps = 1 + MAP_COMPLETE_BONUS * Object.values(save.map100).filter(Boolean).length;
  return {
    upgrade,
    darkMatter,
    eventHorizon,
    achievements,
    sets,
    maps,
    total: upgrade * darkMatter * eventHorizon * achievements * sets * maps,
  };
}

export function globalCashMult(save: SaveData): number {
  return cashBreakdown(save).total;
}

// ---------------------------------------------------------------- abilities

export function abilityCooldown(id: AbilityId, level: number): number {
  const d = abilityDef(id);
  return d.cooldown * Math.pow(1 - ABILITY_LEVEL.cooldownPerLevel, Math.max(0, level - 1));
}

export function abilityDuration(id: AbilityId, level: number): number {
  const d = abilityDef(id);
  return d.duration * (1 + ABILITY_LEVEL.durationPerLevel * Math.max(0, level - 1));
}

/** Cost to go from `level` to level+1 (level 0 = locked, so this is the unlock price). */
export function abilityCost(id: AbilityId, level: number): number {
  const d = abilityDef(id);
  if (level <= 0) return d.unlockCost;
  return d.unlockCost * ABILITY_LEVEL.costMul * Math.pow(ABILITY_LEVEL.costGrowth, level);
}

export function isAbilityVisible(save: SaveData, d: AbilityDef): boolean {
  return save.runCash >= d.unlockAt || save.abilities[d.id] > 0;
}

// ---------------------------------------------------------------- helpers

export function helperCountCost(owned: number): number {
  return HELPERS.countCosts[owned] ?? Infinity;
}

export function helperLevelCost(level: number): number {
  return geomCost(HELPERS.levelBase, HELPERS.levelGrowth, level);
}

export function bestUnlockedMapMul(save: SaveData): number {
  let m = 1;
  for (const def of MAPS) if (save.maps[def.id]) m = Math.max(m, def.valueMul);
  return m;
}

/** Passive helper income in $/s. */
export function passiveIncome(save: SaveData): number {
  if (save.helpers <= 0) return 0;
  const perHelper = HELPERS.incomeBase * Math.pow(HELPERS.incomeGrowth, save.helperLevel);
  const quantum = Math.pow(1.5, dmLevel(save, 'quantumHelpers'));
  return save.helpers * perHelper * quantum * globalCashMult(save) * bestUnlockedMapMul(save);
}

// ---------------------------------------------------------------- offline

export function offlineCapSeconds(save: SaveData): number {
  const hours =
    OFFLINE.baseCapHours + OFFLINE.capPerLevel * save.upgrades.offline + 2 * dmLevel(save, 'hawking');
  return hours * 3600;
}

export function offlineEfficiency(save: SaveData): number {
  return Math.min(
    1,
    OFFLINE.baseEfficiency + OFFLINE.efficiencyPerLevel * save.upgrades.offline + 0.1 * dmLevel(save, 'hawking'),
  );
}

export interface OfflineResult {
  awaySeconds: number;
  creditedSeconds: number;
  earned: number;
}

export function computeOffline(save: SaveData, now: number): OfflineResult {
  const awaySeconds = Math.max(0, (now - save.lastSeen) / 1000);
  if (awaySeconds < OFFLINE.minSeconds || save.helpers <= 0) {
    return { awaySeconds, creditedSeconds: 0, earned: 0 };
  }
  const creditedSeconds = Math.min(awaySeconds, offlineCapSeconds(save));
  const earned = passiveIncome(save) * creditedSeconds * offlineEfficiency(save);
  return { awaySeconds, creditedSeconds, earned };
}

// ---------------------------------------------------------------- prestige

export function dmForRunCash(runCash: number): number {
  if (runCash < PRESTIGE.minRunCash) return 0;
  return Math.floor(PRESTIGE.coef * Math.pow(runCash / PRESTIGE.divisor, PRESTIGE.exponent));
}

/** Run cash needed for the next whole DM (for the progress bar). */
export function runCashForDm(dm: number): number {
  if (dm <= 0) return PRESTIGE.minRunCash;
  return Math.max(PRESTIGE.minRunCash, PRESTIGE.divisor * Math.pow(dm / PRESTIGE.coef, 1 / PRESTIGE.exponent));
}

export function dmUpgradeCost(id: DmUpgradeId, level: number): number {
  const d = dmUpgradeDef(id);
  return Math.ceil(geomCost(d.base, d.growth, level));
}

export function headStartCash(save: SaveData): number {
  const lvl = dmLevel(save, 'headStart');
  return lvl <= 0 ? 0 : HEAD_START_BASE * Math.pow(10, lvl - 1);
}

/** Applies a Singularity: returns the new save. */
export function applyPrestige(save: SaveData, now = Date.now()): SaveData {
  const gained = dmForRunCash(save.runCash);
  const fresh = defaultSave(now);
  const keepMaps = dmLevel(save, 'wormhole') > 0;
  const next: SaveData = {
    ...fresh,
    lifetimeCash: save.lifetimeCash,
    dm: save.dm + gained,
    dmTotal: save.dmTotal + gained,
    dmUpgrades: { ...save.dmUpgrades },
    maps: keepMaps ? { ...save.maps } : fresh.maps,
    selectedMap: keepMaps ? save.selectedMap : 'suburb',
    mapBest: { ...save.mapBest },
    map100: { ...save.map100 },
    skins: [...save.skins],
    skin: save.skin,
    gulpedia: { ...save.gulpedia },
    achievements: [...save.achievements],
    flags: { ...save.flags },
    stats: { ...save.stats, prestiges: save.stats.prestiges + 1 },
    settings: { ...save.settings },
    created: save.created,
  };
  next.cash = headStartCash(next);
  return next;
}

// ---------------------------------------------------------------- round configuration

export interface AbilityConfig {
  level: number;
  duration: number;
  cooldown: number;
}

export interface RoundConfig {
  mapId: MapId;
  mapMul: number;
  roundTime: number;
  startLevel: number;
  speedMult: number;
  cashMult: number;
  xpMult: number;
  magnetLevel: number;
  comboWindow: number;
  comboCap: number;
  helpers: number;
  helperRadius: number;
  /** Chance for each prop to spawn golden this round. */
  goldChance: number;
  abilities: Record<AbilityId, AbilityConfig>;
}

/** Starting size level on a map: upgrades minus that map's size offset. */
export function startLevel(save: SaveData, mapId: MapId = save.selectedMap): number {
  return Math.max(0, save.upgrades.startSize + dmLevel(save, 'denseCore') - mapDef(mapId).sizeOffset);
}

/** Size XP multiplier on a map (1 on the first map, smaller on bigger worlds). */
export function mapXpMult(mapId: MapId): number {
  return Math.pow(SIZE.radiusGrowth, -SIZE.xpExp * MAP_SCALE.xpPerOffset * mapDef(mapId).sizeOffset);
}

export function roundTimeFor(save: SaveData): number {
  if (save.stats.rounds === 0) return ROUND.warmupTime;
  return ROUND.baseTime + ROUND.perLevel * save.upgrades.roundTime + 6 * dmLevel(save, 'timeDilation');
}

export function buildRoundConfig(save: SaveData, mapId: MapId = save.selectedMap): RoundConfig {
  const abilities = {} as Record<AbilityId, AbilityConfig>;
  for (const a of ABILITIES) {
    const lvl = save.abilities[a.id];
    abilities[a.id] = { level: lvl, duration: abilityDuration(a.id, lvl), cooldown: abilityCooldown(a.id, lvl) };
  }
  return {
    mapId,
    mapMul: mapDef(mapId).valueMul,
    roundTime: roundTimeFor(save),
    startLevel: startLevel(save, mapId),
    speedMult: 1 + SPEED_PER_LEVEL * save.upgrades.speed,
    cashMult: globalCashMult(save),
    xpMult: (1 + GROWTH_PER_LEVEL * save.upgrades.growth) * mapXpMult(mapId),
    magnetLevel: save.upgrades.magnet + 2 * dmLevel(save, 'gravityWell'),
    comboWindow: comboWindow(save.upgrades.combo),
    comboCap: comboCap(save.upgrades.combo),
    helpers: save.helpers,
    helperRadius: helperRadius(save.helperLevel),
    goldChance: goldChance(save.upgrades.golden),
    abilities,
  };
}

// ---------------------------------------------------------------- purchases (mutate save)

export function earn(save: SaveData, amount: number): void {
  if (!(amount > 0)) return;
  save.cash += amount;
  save.runCash += amount;
  save.lifetimeCash += amount;
}

export function buyUpgrade(save: SaveData, id: UpgradeId, n: number): number {
  const d = upgradeDef(id);
  const lvl = save.upgrades[id];
  const room = d.max - lvl;
  const count = Math.min(n, room);
  if (count <= 0) return 0;
  const cost = geomBulkCost(d.base, d.growth, lvl, count);
  if (cost > save.cash) return 0;
  save.cash -= cost;
  save.upgrades[id] = lvl + count;
  return count;
}

/** Resolves a bulk mode (1, 10 or 'max') to a level count for display and purchase. */
export function bulkCount(save: SaveData, id: UpgradeId, mode: number | 'max'): number {
  const d = upgradeDef(id);
  const lvl = save.upgrades[id];
  const room = d.max - lvl;
  if (mode === 'max') return Math.max(1, geomMaxAffordable(d.base, d.growth, lvl, save.cash, room));
  return Math.max(0, Math.min(mode, room));
}

export function buyHelper(save: SaveData): boolean {
  const cost = helperCountCost(save.helpers);
  if (save.cash < cost) return false;
  save.cash -= cost;
  save.helpers += 1;
  return true;
}

export function buyHelperLevel(save: SaveData): boolean {
  if (save.helperLevel >= HELPERS.levelMax || save.helpers <= 0) return false;
  const cost = helperLevelCost(save.helperLevel);
  if (save.cash < cost) return false;
  save.cash -= cost;
  save.helperLevel += 1;
  return true;
}

export function buyAbility(save: SaveData, id: AbilityId): boolean {
  const lvl = save.abilities[id];
  if (lvl >= abilityDef(id).maxLevel) return false;
  const cost = abilityCost(id, lvl);
  if (save.cash < cost) return false;
  save.cash -= cost;
  save.abilities[id] = lvl + 1;
  return true;
}

export function buyMap(save: SaveData, id: MapId): boolean {
  if (save.maps[id]) return false;
  const d = mapDef(id);
  const idx = MAPS.indexOf(d);
  if (idx > 0 && !save.maps[MAPS[idx - 1].id]) return false;
  if (save.cash < d.cost) return false;
  save.cash -= d.cost;
  save.maps[id] = true;
  return true;
}

export function buyDmUpgrade(save: SaveData, id: DmUpgradeId): boolean {
  const d = dmUpgradeDef(id);
  const lvl = dmLevel(save, id);
  if (lvl >= d.max) return false;
  const cost = dmUpgradeCost(id, lvl);
  if (save.dm < cost) return false;
  save.dm -= cost;
  save.dmUpgrades[id] = lvl + 1;
  return true;
}
