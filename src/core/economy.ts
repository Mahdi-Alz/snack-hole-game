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
  OFFLINE,
  PRESTIGE,
  QUANTUM_PER_LEVEL,
  ROUND,
  ROUND_END,
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
  const ramp = Math.min(1, (level + SIZE.rampStart) / SIZE.rampLevels);
  return SIZE.xpCoef * Math.pow(r, SIZE.xpExp) * ramp;
}

/** XP multiplier for eating a prop of footprint `f` at radius `r`: props near the size limit count more. */
export function frontierXpMult(f: number, r: number): number {
  return 1 + SIZE.frontierBonus * Math.pow(Math.min(1, f / (SIZE.fit * r)), SIZE.frontierExp);
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
  return 1 + CASH_VALUE.perLevel * level;
}

export function magnetRangeFrac(level: number): number {
  return level <= 0 ? 0 : MAGNET.rangeBase + MAGNET.rangePerLevel * level;
}

export function magnetPull(radius: number, level: number): number {
  return (MAGNET.pullBase + MAGNET.pullPerRadius * radius) * (1 + MAGNET.pullPerLevel * level);
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

export function helperRadius(level: number, quantum = 0): number {
  return Math.min(HELPERS.maxRadius, HELPERS.baseRadius * Math.pow(HELPERS.radiusGrowth, level)) * (1 + QUANTUM_PER_LEVEL * quantum);
}

/** Every Singularity tier multiplies map payouts and all cash prices by the same factor. */
export function tierCostMul(tier: number): number {
  return Math.pow(PRESTIGE.tierScale, tier);
}

export function upgradeCost(id: UpgradeId, level: number, tier = 0): number {
  const d = upgradeDef(id);
  return geomCost(d.base, d.growth, level) * tierCostMul(tier);
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
      return `x${cashValueMult(level).toFixed(2)}`;
    case 'growth':
      return `+${Math.round(GROWTH_PER_LEVEL * level * 100)}% XP`;
    case 'magnet':
      return level === 0 ? 'Off' : `${Math.round(magnetRangeFrac(level) * 100)}% range`;
    case 'combo':
      return `${comboWindow(level).toFixed(2)}s, cap x${comboCap(level).toFixed(1)}`;
    case 'golden':
      return `${(goldChance(level) * 100).toFixed(1)}% golden`;
    case 'offline':
      return `${OFFLINE.baseCapHours + OFFLINE.capPerLevel * level}h`;
  }
}

export function isUpgradeVisible(save: SaveData, d: UpgradeDef): boolean {
  if (d.needsHelper && save.helpers <= 0) return false;
  return save.runCash >= d.unlockAt || save.upgrades[d.id] > 0 || save.stats.prestiges > 0;
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
export function abilityCost(id: AbilityId, level: number, tier = 0): number {
  const d = abilityDef(id);
  const base = level <= 0 ? d.unlockCost : d.unlockCost * ABILITY_LEVEL.costMul * Math.pow(ABILITY_LEVEL.costGrowth, level);
  return base * tierCostMul(tier);
}

export function isAbilityVisible(save: SaveData, d: AbilityDef): boolean {
  return save.runCash >= d.unlockAt || save.abilities[d.id] > 0;
}

// ---------------------------------------------------------------- helpers

export function helperCountCost(owned: number, tier = 0): number {
  return (HELPERS.countCosts[owned] ?? Infinity) * tierCostMul(tier);
}

export function helperLevelCost(level: number, tier = 0): number {
  return geomCost(HELPERS.levelBase, HELPERS.levelGrowth, level) * tierCostMul(tier);
}

// ---------------------------------------------------------------- offline

export function offlineCapSeconds(save: SaveData): number {
  const hours =
    OFFLINE.baseCapHours + OFFLINE.capPerLevel * save.upgrades.offline + 2 * dmLevel(save, 'hawking');
  return hours * 3600;
}

/** Average cash of the last few rounds: what time away is paid against. */
export function recentRoundIncome(save: SaveData): number {
  const r = save.recentRoundCash;
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0;
}

/** Offline earnings per hour away. */
export function offlineRate(save: SaveData): number {
  return recentRoundIncome(save) * OFFLINE.roundsPerHour;
}

export interface OfflineResult {
  awaySeconds: number;
  creditedSeconds: number;
  earned: number;
}

export function computeOffline(save: SaveData, now: number): OfflineResult {
  const awaySeconds = Math.max(0, (now - save.lastSeen) / 1000);
  if (awaySeconds < OFFLINE.minSeconds) return { awaySeconds, creditedSeconds: 0, earned: 0 };
  const creditedSeconds = Math.min(awaySeconds, offlineCapSeconds(save));
  return { awaySeconds, creditedSeconds, earned: (offlineRate(save) * creditedSeconds) / 3600 };
}

// ---------------------------------------------------------------- prestige

/** Dark Matter earned in total from `lifetimeCash`, before tier bonuses. */
export function dmForLifetime(lifetimeCash: number): number {
  return Math.floor(PRESTIGE.coef * Math.pow(Math.max(0, lifetimeCash) / PRESTIGE.divisor, PRESTIGE.exponent));
}

/** Lifetime cash at which the formula reaches `dm` Dark Matter (for the progress bar). */
export function lifetimeForDm(dm: number): number {
  return PRESTIGE.divisor * Math.pow(Math.max(0, dm) / PRESTIGE.coef, 1 / PRESTIGE.exponent);
}

/** Dark Matter multiplier from the Singularity tier. */
export function tierDmMult(tier: number): number {
  return 1 + PRESTIGE.tierDmBonus * tier;
}

/** A Singularity needs the prestige map unlocked this run. */
export function prestigeUnlocked(save: SaveData): boolean {
  return save.maps[PRESTIGE.unlockMap];
}

/** Dark Matter a Singularity would pay right now (0 while it is locked). */
export function dmGain(save: SaveData): number {
  if (!prestigeUnlocked(save)) return 0;
  const base = dmForLifetime(save.lifetimeCash) - save.dmClaimed;
  return base > 0 ? Math.floor(base * tierDmMult(save.tier)) : 0;
}

/** Whether this run reached the Moon Base goal, which raises the tier on the next Singularity. */
export function tierUpReady(save: SaveData): boolean {
  const moon = MAPS[MAPS.length - 1];
  return save.mapLevel[moon.id] >= moon.goal;
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
  const gained = dmGain(save);
  const fresh = defaultSave(now);
  const keepMaps = dmLevel(save, 'wormhole') > 0;
  const next: SaveData = {
    ...fresh,
    lifetimeCash: save.lifetimeCash,
    dm: save.dm + gained,
    dmTotal: save.dmTotal + gained,
    dmClaimed: Math.max(save.dmClaimed, dmForLifetime(save.lifetimeCash)),
    tier: save.tier + (tierUpReady(save) ? 1 : 0),
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
  helperSpeedMult: number;
  /** Chance for each prop to spawn golden this round. */
  goldChance: number;
  abilities: Record<AbilityId, AbilityConfig>;
}

/** Starting size level on a map: upgrades minus that map's size offset and the Singularity tier. */
export function startLevel(save: SaveData, mapId: MapId = save.selectedMap): number {
  return Math.max(0, save.upgrades.startSize + dmLevel(save, 'denseCore') - mapDef(mapId).sizeOffset - save.tier);
}

export function roundTimeFor(save: SaveData): number {
  if (save.stats.rounds === 0) return ROUND.warmupTime;
  return ROUND.baseTime + ROUND.perLevel * save.upgrades.roundTime;
}

/** Early-finish bonus as a fraction of round cash, for `secondsLeft` unused seconds. */
export function timeBonusFrac(secondsLeft: number): number {
  return Math.min(ROUND_END.bonusCap, ROUND_END.bonusPerSecond * Math.max(0, Math.floor(secondsLeft)));
}

export function buildRoundConfig(save: SaveData, mapId: MapId = save.selectedMap): RoundConfig {
  const abilities = {} as Record<AbilityId, AbilityConfig>;
  for (const a of ABILITIES) {
    const lvl = save.abilities[a.id];
    abilities[a.id] = { level: lvl, duration: abilityDuration(a.id, lvl), cooldown: abilityCooldown(a.id, lvl) };
  }
  return {
    mapId,
    mapMul: mapDef(mapId).valueMul * tierCostMul(save.tier),
    roundTime: roundTimeFor(save),
    startLevel: startLevel(save, mapId),
    speedMult: 1 + SPEED_PER_LEVEL * save.upgrades.speed,
    cashMult: globalCashMult(save),
    xpMult: (1 + GROWTH_PER_LEVEL * save.upgrades.growth) * mapDef(mapId).xpMul,
    magnetLevel: save.upgrades.magnet + dmLevel(save, 'gravityWell'),
    comboWindow: comboWindow(save.upgrades.combo),
    comboCap: comboCap(save.upgrades.combo),
    helpers: save.helpers,
    helperRadius: helperRadius(save.helperLevel, dmLevel(save, 'quantumHelpers')),
    helperSpeedMult: 1 + QUANTUM_PER_LEVEL * dmLevel(save, 'quantumHelpers'),
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
  const cost = geomBulkCost(d.base, d.growth, lvl, count) * tierCostMul(save.tier);
  if (cost > save.cash) return 0;
  save.cash -= cost;
  save.upgrades[id] = lvl + count;
  return count;
}

export function buyHelper(save: SaveData): boolean {
  const cost = helperCountCost(save.helpers, save.tier);
  if (save.cash < cost) return false;
  save.cash -= cost;
  save.helpers += 1;
  return true;
}

export function buyHelperLevel(save: SaveData): boolean {
  if (save.helperLevel >= HELPERS.levelMax || save.helpers <= 0) return false;
  const cost = helperLevelCost(save.helperLevel, save.tier);
  if (save.cash < cost) return false;
  save.cash -= cost;
  save.helperLevel += 1;
  return true;
}

export function buyAbility(save: SaveData, id: AbilityId): boolean {
  const lvl = save.abilities[id];
  if (lvl >= abilityDef(id).maxLevel) return false;
  const cost = abilityCost(id, lvl, save.tier);
  if (save.cash < cost) return false;
  save.cash -= cost;
  save.abilities[id] = lvl + 1;
  return true;
}

/**
 * Why a map is still locked, or null once it can unlock: the previous map must be unlocked and
 * its size goal reached this run, and enough Singularities must have happened.
 */
export function mapLockReason(save: SaveData, id: MapId): string | null {
  const idx = MAPS.findIndex((m) => m.id === id);
  if (idx <= 0) return null;
  const prev = MAPS[idx - 1];
  const need = MAPS[idx].needsSingularities;
  if (save.stats.prestiges < need) return `Needs ${need} Singularit${need === 1 ? 'y' : 'ies'}`;
  if (!save.maps[prev.id]) return `Unlock ${prev.name} first`;
  if (save.mapLevel[prev.id] < prev.goal) return `Reach size ${prev.goal + 1} on ${prev.name}`;
  return null;
}

/** Unlocks every map whose requirements are met; returns the newly unlocked ones in order. */
export function unlockMaps(save: SaveData): MapId[] {
  const out: MapId[] = [];
  for (const m of MAPS) {
    if (save.maps[m.id] || mapLockReason(save, m.id)) continue;
    save.maps[m.id] = true;
    out.push(m.id);
  }
  return out;
}

/** Records a finished round: best size on the map and recent income (for offline earnings). */
export function noteRound(save: SaveData, mapId: MapId, level: number, cash: number): void {
  save.mapLevel[mapId] = Math.max(save.mapLevel[mapId], level);
  save.recentRoundCash.push(cash);
  const extra = save.recentRoundCash.length - OFFLINE.recentRounds;
  if (extra > 0) save.recentRoundCash.splice(0, extra);
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
