/**
 * Every tunable economy number lives here. Formulas that use them are in core/economy.ts.
 */

// ---------------------------------------------------------------- size & round
export const SIZE = {
  baseRadius: 0.75,
  radiusGrowth: 1.125,
  /** XP needed for L -> L+1 is xpCoef * R(L)^xpExp. */
  xpCoef: 4,
  xpExp: 3.3,
  /** Object fits when footprint <= fit * R. */
  fit: 0.9,
  speedBase: 4.5,
  speedPerRadius: 2.1,
};

export const ROUND = {
  baseTime: 50,
  warmupTime: 20,
  perLevel: 5,
};

export const COMBO = {
  baseWindow: 1.2,
  windowPerLevel: 0.12,
  perStack: 0.02,
  baseCap: 2,
  capPerLevel: 0.05,
};

export const MAGNET = {
  /** pull range = R * (rangeBase + rangePerLevel * lvl) for lvl >= 1 */
  rangeBase: 0.1,
  rangePerLevel: 0.06,
  /** pull speed = (pullBase + pullPerRadius * R) * (1 + 0.03 lvl) */
  pullBase: 2,
  pullPerRadius: 1.5,
};

// ---------------------------------------------------------------- upgrades
export type UpgradeId =
  | 'startSize'
  | 'roundTime'
  | 'speed'
  | 'cashValue'
  | 'growth'
  | 'magnet'
  | 'combo'
  | 'offline'
  | 'golden';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  icon: string;
  desc: string;
  base: number;
  growth: number;
  max: number;
  /** Lifetime cash this run required before the upgrade shows up. */
  unlockAt: number;
  /** Requires at least one helper hole. */
  needsHelper?: boolean;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'startSize', name: 'Starting Size', icon: '⭕', desc: 'Begin each round bigger.', base: 15, growth: 2.05, max: 40, unlockAt: 0 },
  { id: 'speed', name: 'Speed', icon: '💨', desc: 'Glide around the map faster.', base: 12, growth: 1.45, max: 40, unlockAt: 0 },
  { id: 'cashValue', name: 'Cash Value', icon: '💰', desc: 'Everything you eat is worth more. x2 at Lv 25, 50, 75, 100...', base: 25, growth: 1.42, max: Infinity, unlockAt: 0 },
  { id: 'roundTime', name: 'Round Time', icon: '⏱️', desc: 'More seconds per round.', base: 60, growth: 1.6, max: 24, unlockAt: 0 },
  { id: 'growth', name: 'Growth Rate', icon: '📈', desc: 'Gain size XP faster.', base: 60, growth: 1.5, max: 50, unlockAt: 120 },
  { id: 'magnet', name: 'Magnet', icon: '🧲', desc: 'Nearby edible props slide toward you.', base: 200, growth: 1.45, max: 30, unlockAt: 400 },
  { id: 'combo', name: 'Combo Window', icon: '🔥', desc: 'Longer combo window and a higher combo cap.', base: 500, growth: 1.45, max: 30, unlockAt: 2000 },
  { id: 'golden', name: 'Golden Touch', icon: '✨', desc: 'More props spawn golden. Golden props are worth x10.', base: 20000, growth: 2.1, max: 15, unlockAt: 15000 },
  { id: 'offline', name: 'Offline Vault', icon: '🌙', desc: 'Helpers earn longer and better while you are away.', base: 3000, growth: 1.6, max: 16, unlockAt: 0, needsHelper: true },
];

/** Golden props: chance per prop each round (base + per Golden Touch level) and value multiplier. */
export const GOLDEN = { baseChance: 0.01, chancePerLevel: 0.006, valueMul: 10 };

/**
 * In-round random events (not in the hub demo or the warm-up). At round start each event the map
 * supports rolls its `chance`; the ones that hit play one at a time, the first after `firstAt`
 * seconds and the next `gap` seconds after the previous ends, while at least `minLeft` seconds
 * remain (an event that no longer fits is skipped).
 */
export const EVENTS = {
  chance: { rush: 0.3, ufo: 0.25, stampede: 0.35 },
  firstAt: [8, 16] as [number, number],
  gap: [4, 8] as [number, number],
  minLeft: 12,
  rush: { count: 18, duration: 16 },
  ufo: { drops: 10, dropEvery: 0.8, crossTime: 13 },
  stampede: { count: 18, duration: 18, speed: [5, 6.5] as [number, number] },
};

export const CASH_VALUE = { perLevel: 0.15, milestones: [25, 50, 75, 100, 150, 200, 300, 400, 500] };
export const SPEED_PER_LEVEL = 0.04;
export const GROWTH_PER_LEVEL = 0.1;

export const OFFLINE = {
  baseCapHours: 4,
  capPerLevel: 1,
  baseEfficiency: 0.5,
  efficiencyPerLevel: 0.05,
  minSeconds: 60,
};

// ---------------------------------------------------------------- helper holes
export const HELPERS = {
  unlockAt: 500,
  countCosts: [800, 9e3, 9e4, 9e5, 9e6, 9e7],
  levelBase: 1200,
  levelGrowth: 1.32,
  levelMax: 40,
  baseRadius: 0.7,
  radiusGrowth: 1.05,
  maxRadius: 2.4,
  roundCashShare: 0.6,
  incomeBase: 0.4,
  incomeGrowth: 1.12,
  speed: 5,
};

// ---------------------------------------------------------------- abilities
export type AbilityId = 'dash' | 'vortex' | 'mega';

export interface AbilityDef {
  id: AbilityId;
  name: string;
  icon: string;
  key: string;
  desc: string;
  unlockCost: number;
  unlockAt: number;
  duration: number;
  cooldown: number;
  /** Fraction of the cooldown already charged when a round starts (1 = ready at once). */
  startCharge: number;
  maxLevel: number;
}

export const ABILITIES: AbilityDef[] = [
  { id: 'dash', name: 'Dash', icon: '⚡', key: 'Space / 1', desc: 'Burst of speed.', unlockCost: 1500, unlockAt: 800, duration: 0.6, cooldown: 7, startCharge: 1, maxLevel: 15 },
  { id: 'vortex', name: 'Vortex', icon: '🌀', key: '2', desc: 'Powerful pull on everything edible nearby.', unlockCost: 15000, unlockAt: 8000, duration: 4, cooldown: 22, startCharge: 0.5, maxLevel: 15 },
  { id: 'mega', name: 'Mega Mouth', icon: '👄', key: '3', desc: 'Temporarily grow 45% wider.', unlockCost: 120000, unlockAt: 60000, duration: 5, cooldown: 30, startCharge: 0.5, maxLevel: 15 },
];

export const ABILITY_LEVEL = {
  costMul: 0.6,
  costGrowth: 1.6,
  cooldownPerLevel: 0.06,
  durationPerLevel: 0.08,
  dashSpeed: 2.8,
  vortexRange: 3,
  vortexPull: 3,
  megaScale: 1.45,
};

// ---------------------------------------------------------------- maps
export type MapId = 'suburb' | 'downtown' | 'farm' | 'harbor' | 'airport' | 'moon';

export interface MapDef {
  id: MapId;
  name: string;
  icon: string;
  blurb: string;
  cost: number;
  valueMul: number;
  /** Size levels the hole loses on this map: later maps feel bigger and must be grown into. */
  sizeOffset: number;
  seed: number;
}

export const MAPS: MapDef[] = [
  { id: 'suburb', name: 'Sunny Suburb', icon: '🏡', blurb: 'Leafy streets, parks and cosy houses.', cost: 0, valueMul: 1, sizeOffset: 0, seed: 1101 },
  { id: 'farm', name: 'Happy Farm', icon: '🚜', blurb: 'Barns, fields and lots of animals.', cost: 6000, valueMul: 5, sizeOffset: 2, seed: 3303 },
  { id: 'downtown', name: 'Downtown', icon: '🏙️', blurb: 'Busy avenues and towering skyscrapers.', cost: 300000, valueMul: 30, sizeOffset: 3, seed: 2202 },
  { id: 'harbor', name: 'Harbor', icon: '⚓', blurb: 'Containers, cranes and giant ships.', cost: 5e6, valueMul: 110, sizeOffset: 6, seed: 4404 },
  { id: 'airport', name: 'Airport', icon: '✈️', blurb: 'Jets, hangars and a huge terminal.', cost: 1.5e8, valueMul: 600, sizeOffset: 8, seed: 5505 },
  { id: 'moon', name: 'Moon Base', icon: '🌙', blurb: 'Low gravity, big domes, suspicious cheese.', cost: 3e9, valueMul: 1700, sizeOffset: 11, seed: 6606 },
];

export const MAP_COMPLETE_BONUS = 0.25;

/**
 * Later maps are "bigger worlds": the hole starts `sizeOffset` levels smaller and size XP is
 * scaled by radiusGrowth^(-xpExp * xpPerOffset * sizeOffset), so it cannot simply re-grow to
 * full size inside one round.
 */
export const MAP_SCALE = { xpPerOffset: 0.75 };

// ---------------------------------------------------------------- prestige
export const PRESTIGE = {
  minRunCash: 1e7,
  coef: 5,
  divisor: 1e7,
  exponent: 0.5,
  bonusPerDm: 0.1,
};

export type DmUpgradeId =
  | 'eventHorizon'
  | 'denseCore'
  | 'timeDilation'
  | 'quantumHelpers'
  | 'hawking'
  | 'headStart'
  | 'gravityWell'
  | 'wormhole';

export interface DmUpgradeDef {
  id: DmUpgradeId;
  name: string;
  icon: string;
  desc: string;
  base: number;
  growth: number;
  max: number;
}

export const DM_UPGRADES: DmUpgradeDef[] = [
  { id: 'eventHorizon', name: 'Event Horizon', icon: '🕳️', desc: '+25% cash per level.', base: 1, growth: 1.5, max: 50 },
  { id: 'denseCore', name: 'Dense Core', icon: '🟣', desc: '+1 starting size per level.', base: 2, growth: 1.8, max: 15 },
  { id: 'timeDilation', name: 'Time Dilation', icon: '⌛', desc: '+6 s round time per level.', base: 2, growth: 1.7, max: 15 },
  { id: 'headStart', name: 'Head Start', icon: '🎁', desc: 'Start each run with cash (x10 per level).', base: 1, growth: 2, max: 10 },
  { id: 'quantumHelpers', name: 'Quantum Helpers', icon: '👯', desc: 'Helper income x1.5 per level.', base: 3, growth: 1.9, max: 20 },
  { id: 'gravityWell', name: 'Gravity Well', icon: '🌌', desc: '+2 magnet levels for free, per level.', base: 3, growth: 1.8, max: 10 },
  { id: 'hawking', name: 'Hawking Radiation', icon: '☢️', desc: '+2 h offline cap and +10% offline efficiency.', base: 4, growth: 2, max: 8 },
  { id: 'wormhole', name: 'Wormhole', icon: '🌀', desc: 'Keep unlocked maps through Singularity.', base: 25, growth: 1, max: 1 },
];

export const HEAD_START_BASE = 500;

// ---------------------------------------------------------------- skins
export interface SkinDef {
  id: string;
  name: string;
  rim: string;
  glow: string;
  swirl: 'spiral' | 'rings' | 'stars' | 'none' | 'galaxy';
  swirlColor: string;
  cost: number; // DM, 0 = free/achievement
  achievement?: string;
}

export const SKINS: SkinDef[] = [
  { id: 'classic', name: 'Classic', rim: '#8a5cff', glow: '#b48cff', swirl: 'spiral', swirlColor: '#4b2a9c', cost: 0 },
  { id: 'mint', name: 'Mint Chip', rim: '#3be0b0', glow: '#8affd9', swirl: 'rings', swirlColor: '#14715a', cost: 0, achievement: 'eat1000' },
  { id: 'sunset', name: 'Sunset', rim: '#ff8a3d', glow: '#ffc06b', swirl: 'spiral', swirlColor: '#8c2f1b', cost: 0, achievement: 'combo50' },
  { id: 'ocean', name: 'Deep Ocean', rim: '#2fa8ff', glow: '#85d4ff', swirl: 'rings', swirlColor: '#0c3d7a', cost: 3 },
  { id: 'candy', name: 'Candy', rim: '#ff5fb4', glow: '#ffa6d8', swirl: 'stars', swirlColor: '#8c1d63', cost: 6 },
  { id: 'gold', name: 'Golden Gulp', rim: '#ffd23d', glow: '#fff09a', swirl: 'stars', swirlColor: '#8c6a00', cost: 15 },
  { id: 'toxic', name: 'Toxic', rim: '#9dff2f', glow: '#d6ff8a', swirl: 'spiral', swirlColor: '#3b7a0c', cost: 10 },
  { id: 'galaxy', name: 'Galaxy', rim: '#d38cff', glow: '#ffffff', swirl: 'galaxy', swirlColor: '#2a1a6e', cost: 30 },
  { id: 'void', name: 'True Void', rim: '#222233', glow: '#8888aa', swirl: 'none', swirlColor: '#000000', cost: 0, achievement: 'prestige3' },
];

// ---------------------------------------------------------------- bonuses
export const ACHIEVEMENT_BONUS = 0.02;
export const SET_BONUS = 0.05;

export const AUTOSAVE_SECONDS = 20;
export const SAVE_KEY = 'snack-hole-save';
/** Key used while the game was called Hungry Hole; read only when SAVE_KEY is empty. */
export const LEGACY_SAVE_KEY = 'hungry-hole-save';
export const SAVE_VERSION = 2;
