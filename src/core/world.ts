import { ABILITIES, ABILITY_LEVEL, EVENTS, GOLDEN, HELPERS, ROUND_END, SIZE, type AbilityId } from '../config/balance';
import { OBJECT_TYPES, baseValueOf, distToSolid, footprintOf, solidShape, typeId, xpOf } from '../config/objects';
import {
  comboMult,
  frontierXpMult,
  holeSpeed,
  magnetPull,
  magnetRangeFrac,
  radiusForLevel,
  timeBonusFrac,
  xpForLevel,
  type RoundConfig,
} from './economy';
import type { MapData } from './mapgen/builder';
import { Rng } from './rng';
import { SpatialGrid } from './spatial';

export const ALIVE = 0;
export const FALLING = 1;
export const GONE = 2;
/** Event prop waiting off-stage (not simulated, not drawn, not counted in map %). */
export const DORMANT = 3;

export const MV_NONE = 0;
export const MV_GRAPH = 1;
export const MV_WANDER = 2;
/** Straight run to (tx, tz), then leave the stage (stampedes, UFO fly-by). */
export const MV_RUN = 3;

export type EventId = 'rush' | 'ufo' | 'stampede';

/** A prop in the world. Plain mutable class so V8 keeps one hidden shape. */
export class WObj {
  id = 0;
  t = 0;
  x = 0;
  z = 0;
  y = 0;
  baseY = 0;
  rot = 0;
  s = 1;
  tint = 0xffffff;
  f = 0;
  h = 0;
  value = 0;
  xp = 0;
  w = 0;
  state = ALIVE;
  cell = -1;
  /** Index inside the renderer's instanced mesh for this type. */
  inst = -1;
  // movement
  mv = MV_NONE;
  speed = 0;
  flee = false;
  graph = 0;
  lane = 0;
  from = 0;
  to = 0;
  phase = 0;
  tx = 0;
  tz = 0;
  wait = 0;
  x0 = 0;
  x1 = 0;
  z0 = 0;
  z1 = 0;
  bob = 0;
  panic = 0;
  // falling
  hole = -1;
  ox = 0;
  oz = 0;
  tilt = 0;
  tdx = 0;
  tdz = 0;
  vy = 0;
  ft = 0;
  wob = 0;
  dirty = true;
  /** Worth GOLDEN.valueMul x; drawn gold. */
  gold = false;
  /** Bonus prop from a random event: excluded from map % and the size hints. */
  event = false;
  /** MV_RUN only: flies (ignores solid props). */
  fly = false;
  /** Falling from the sky (UFO drops). */
  dropVy = 0;
}

export class WHole {
  x = 0;
  z = 0;
  vx = 0;
  vz = 0;
  /** Radius from size level (before Mega Mouth). */
  baseR = 1;
  /** Current, smoothly tweened radius used for eating and drawing. */
  r = 1;
  level = 0;
  xp = 0;
  main = true;
  active = true;
  // helper AI
  tx = 0;
  tz = 0;
  think = 0;
  target: WObj | null = null;
}

export type WEvent =
  | { k: 'eat'; o: WObj; hole: number; cash: number; combo: number }
  | { k: 'gone'; o: WObj }
  | { k: 'level'; level: number }
  | { k: 'comboEnd'; n: number }
  | { k: 'ability'; id: AbilityId }
  | { k: 'tick'; s: number }
  | { k: 'event'; id: EventId; on: boolean }
  | { k: 'timeUp' }
  | { k: 'cleared' }
  /** Nothing reachable is left: the round finishes early with a time bonus. */
  | { k: 'snackedOut'; bonusFrac: number }
  | { k: 'end' };

export type EndReason = 'timeUp' | 'cleared' | 'snackedOut';

export interface AbilityState {
  cd: number;
  active: number;
}

export interface WorldOptions {
  /** Hub attract mode: endless, no timer. */
  demo?: boolean;
  seed?: number;
}

/**
 * 1 m raster of where wanderers may not walk: spawn index + 1 of the biggest solid prop covering
 * the cell (free again once that prop is eaten), -1 for permanent blocks such as ponds.
 */
interface BlockMap {
  n: number;
  half: number;
  cells: Int32Array;
}

const blockCache = new WeakMap<MapData, BlockMap>();
const MOVE_FREE = 0;
const MOVE_ARRIVED = 1;
const MOVE_BLOCKED = 2;

function blockMapFor(map: MapData): BlockMap {
  let bm = blockCache.get(map);
  if (bm) return bm;
  const n = Math.ceil(map.size);
  const half = map.size / 2;
  const cells = new Int32Array(n * n);
  const best = new Float32Array(n * n);
  const margin = 0.35;
  const raster = (x: number, z: number, ext: number, hit: (cx: number, cz: number) => boolean, value: number, f: number) => {
    const i0 = Math.max(0, Math.floor(x - ext + half));
    const i1 = Math.min(n - 1, Math.floor(x + ext + half));
    const j0 = Math.max(0, Math.floor(z - ext + half));
    const j1 = Math.min(n - 1, Math.floor(z + ext + half));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = i + j * n;
        if (cells[k] < 0 || best[k] >= f) continue;
        if (!hit(i + 0.5 - half, j + 0.5 - half)) continue;
        cells[k] = value;
        best[k] = f;
      }
    }
  };
  map.spawns.forEach((s, idx) => {
    if (s.move) return;
    const def = OBJECT_TYPES[typeId(s.type)];
    const shape = solidShape(def, s.scale);
    if (!shape) return;
    const ext = (shape.round ? shape.hw : Math.hypot(shape.hw, shape.hd)) + margin + 1;
    raster(s.x, s.z, ext, (cx, cz) => distToSolid(shape, s.x, s.z, s.rot, cx, cz) <= margin, idx + 1, footprintOf(def, s.scale));
  });
  for (const b of map.blocks) raster(b.x, b.z, b.r + 1, (cx, cz) => Math.hypot(cx - b.x, cz - b.z) <= b.r, -1, Infinity);
  bm = { n, half, cells };
  blockCache.set(map, bm);
  return bm;
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class World {
  readonly objects: WObj[] = [];
  readonly movers: WObj[] = [];
  readonly falling: WObj[] = [];
  readonly holes: WHole[] = [];
  readonly grid: SpatialGrid<WObj>;
  readonly events: WEvent[] = [];
  readonly rng: Rng;
  readonly abilities: Record<AbilityId, AbilityState> = {
    dash: { cd: 0, active: 0 },
    vortex: { cd: 0, active: 0 },
    mega: { cd: 0, active: 0 },
  };

  input = { x: 0, z: 0 };
  time = 0;
  timeLeft: number;
  running = true;
  ended = false;
  endReason: EndReason | null = null;
  /** Cash paid for finishing early (already included in `cash`). */
  timeBonus = 0;
  private endDelay = 0;
  private reachCheck = 0;
  /** Objects sorted by footprint, for reachableLeft. */
  private bySize: WObj[] = [];

  cash = 0;
  helperCash = 0;
  eaten = 0;
  helperEaten = 0;
  biggest: WObj | null = null;
  combo = 0;
  comboTimer = 0;
  comboBest = 0;
  weightTotal = 0;
  weightEaten = 0;
  maxF = 1;
  levelsGained = 0;
  /** Count of eaten objects per type id, for Gulpedia. */
  readonly eatenByType = new Map<number, number>();
  /** Golden props (for sparkles). */
  readonly golden: WObj[] = [];
  goldEaten = 0;
  /** Random event in progress, if any. */
  eventId: EventId | null = null;
  private readonly block: BlockMap;
  private eventsOn = false;
  private eventTimer = 0;
  private eventLeft = 0;
  /** Events rolled for this round, in play order. */
  private plan: EventId[] = [];
  private rushPool: WObj[] = [];
  private herd: WObj[] = [];
  private ufo: WObj | null = null;
  private drops: WObj[] = [];
  private dropTimer = 0;
  private readonly dropping: WObj[] = [];
  private readonly leaving: WObj[] = [];

  constructor(
    readonly map: MapData,
    readonly cfg: RoundConfig,
    readonly opts: WorldOptions = {},
  ) {
    this.rng = new Rng(opts.seed ?? 12345);
    this.grid = new SpatialGrid<WObj>(map.size, 8);
    this.block = blockMapFor(map);
    this.timeLeft = opts.demo ? Infinity : cfg.roundTime;
    // Big abilities start part-charged so they land mid-round instead of being spent at second 0.
    for (const a of ABILITIES) this.abilities[a.id].cd = cfg.abilities[a.id].cooldown * (1 - a.startCharge);

    let id = 0;
    for (const s of map.spawns) {
      const t = typeId(s.type);
      const def = OBJECT_TYPES[t];
      const o = new WObj();
      o.id = id++;
      o.t = t;
      o.x = s.x;
      o.z = s.z;
      o.rot = s.rot;
      o.s = s.scale;
      o.tint = s.tint;
      o.f = footprintOf(def, s.scale);
      o.h = def.h * s.scale;
      o.baseY = o.y = def.hover ?? 0;
      o.value = baseValueOf(def, s.scale) * cfg.mapMul;
      o.xp = xpOf(def, s.scale);
      // Map % is weighted by ground area, so landmarks count for more than a pile of cones.
      o.w = o.f * o.f;
      this.weightTotal += o.w;
      this.maxF = Math.max(this.maxF, o.f);
      const mv = s.move;
      if (mv) {
        o.speed = mv.speed;
        o.flee = !!mv.flee;
        o.bob = this.rng.range(0, 10);
        if (mv.kind === 'graph') {
          o.mv = MV_GRAPH;
          o.graph = mv.graph;
          o.lane = mv.lane;
          o.from = mv.from;
          o.to = mv.to;
          this.initGraphMover(o);
        } else {
          o.mv = MV_WANDER;
          o.x0 = mv.x0;
          o.x1 = mv.x1;
          o.z0 = mv.z0;
          o.z1 = mv.z1;
          o.tx = o.x;
          o.tz = o.z;
          o.wait = this.rng.range(0, 2);
        }
        this.movers.push(o);
      } else {
        this.grid.insert(o);
      }
      this.objects.push(o);
    }

    if (!opts.demo) this.setupEvents();
    for (const o of this.objects) {
      if (o.gold || this.rng.next() >= cfg.goldChance) continue;
      this.makeGolden(o);
    }

    const main = new WHole();
    main.x = map.start.x;
    main.z = map.start.z;
    main.level = cfg.startLevel;
    main.baseR = main.r = radiusForLevel(cfg.startLevel);
    // Head start on the first size-up so every round opens with a quick level.
    main.xp = xpForLevel(cfg.startLevel) * SIZE.startXp;
    this.holes.push(main);

    for (let i = 0; i < cfg.helpers; i++) {
      const h = new WHole();
      const ang = (i / Math.max(1, cfg.helpers)) * Math.PI * 2 + 0.6;
      h.main = false;
      h.x = map.start.x + Math.cos(ang) * 14;
      h.z = map.start.z + Math.sin(ang) * 14;
      h.baseR = h.r = cfg.helperRadius;
      h.think = i * 0.1;
      this.holes.push(h);
    }
  }

  get main(): WHole {
    return this.holes[0];
  }

  /** The event UFO while it is crossing the map. */
  get ufoFlying(): WObj | null {
    return this.ufo && this.ufo.state === ALIVE ? this.ufo : null;
  }

  private makeGolden(o: WObj): void {
    o.gold = true;
    o.value *= GOLDEN.valueMul;
    this.golden.push(o);
  }

  // ------------------------------------------------------------ random events
  /** Off-stage props for the events this map supports. They join the world when an event fires. */
  private eventObj(type: string, scale = 1, tint = 0xffffff): WObj {
    const t = typeId(type);
    const def = OBJECT_TYPES[t];
    const o = new WObj();
    o.id = this.objects.length;
    o.t = t;
    o.s = scale;
    o.tint = tint;
    o.f = footprintOf(def, scale);
    o.h = def.h * scale;
    o.baseY = o.y = def.hover ?? 0;
    o.value = baseValueOf(def, scale) * this.cfg.mapMul;
    o.xp = xpOf(def, scale);
    o.w = 0;
    o.state = DORMANT;
    o.event = true;
    this.objects.push(o);
    return o;
  }

  private setupEvents(): void {
    const tr = this.map.traffic;
    if (tr) {
      for (let i = 0; i < EVENTS.rush.count; i++) {
        const o = this.eventObj(this.rng.pick(tr.types), 1, this.rng.pick([0xe84a4a, 0x3b82f6, 0xf5c542, 0x38c172, 0xffffff, 0xf08a24, 0x9b5de5]));
        o.mv = MV_GRAPH;
        o.graph = tr.graph;
        o.lane = tr.lane;
        o.speed = tr.speed * this.rng.range(0.85, 1.15);
        this.rushPool.push(o);
      }
    }
    this.ufo = this.eventObj('ufo', 0.7, 0x45e0e8);
    this.ufo.mv = MV_RUN;
    this.ufo.fly = true;
    // UFO drops: golden copies of the most common small, squat prop on this map.
    const counts = new Map<string, number>();
    for (const s of this.map.spawns) {
      const def = OBJECT_TYPES[typeId(s.type)];
      const f = footprintOf(def, 1);
      if (!s.move && f >= 0.3 && f <= 1.2 && def.h <= 1.5) counts.set(s.type, (counts.get(s.type) ?? 0) + 1);
    }
    const dropType = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'cone';
    for (let i = 0; i < EVENTS.ufo.drops; i++) this.makeGolden((this.drops[i] = this.eventObj(dropType, this.rng.range(0.9, 1.3))));
    if (this.map.id === 'farm') {
      const animals: [string, number][] = [
        ['cow', 4],
        ['sheep', 4],
        ['pig', 2],
        ['horse', 2],
      ];
      for (let i = 0; i < EVENTS.stampede.count; i++) {
        const o = this.eventObj(this.rng.weighted(animals));
        o.mv = MV_RUN;
        this.herd.push(o);
      }
    }
    // Roll which events visit this round, then shuffle their order.
    const kinds: EventId[] = ['ufo'];
    if (this.rushPool.length) kinds.push('rush');
    if (this.herd.length) kinds.push('stampede');
    this.plan = kinds.filter((k) => this.rng.chance(EVENTS.chance[k]));
    for (let i = this.plan.length - 1; i > 0; i--) {
      const j = this.rng.int(0, i);
      [this.plan[i], this.plan[j]] = [this.plan[j], this.plan[i]];
    }
    this.eventTimer = this.rng.range(EVENTS.firstAt[0], EVENTS.firstAt[1]);
    this.eventsOn = this.plan.length > 0;
  }

  private activate(o: WObj, x: number, z: number): void {
    o.x = x;
    o.z = z;
    o.state = ALIVE;
    o.dirty = true;
    o.bob = this.rng.range(0, 10);
    if (o.mv === MV_NONE) this.grid.insert(o);
    else this.movers.push(o);
  }

  private startEvent(id: EventId): void {
    const h = this.main;
    this.eventId = id;
    const H = this.map.half - 4;
    const clamp = (v: number) => Math.max(-H, Math.min(H, v));
    if (id === 'rush') {
      this.eventLeft = EVENTS.rush.duration;
      const g = this.map.graphs[this.map.traffic!.graph];
      for (const o of this.rushPool) {
        if (o.state !== DORMANT) continue;
        // Enter on a road segment out of sight of the hole.
        let a = 0;
        let b = 0;
        for (let tries = 0; tries < 12; tries++) {
          a = this.rng.int(0, g.nodes.length - 1);
          if (!g.adj[a].length) continue;
          b = this.rng.pick(g.adj[a]);
          if (Math.hypot(g.nodes[a].x - h.x, g.nodes[a].z - h.z) > 30 + h.r * 4) break;
        }
        if (!g.adj[a].length) continue;
        o.from = a;
        o.to = b;
        o.wait = this.rng.range(0, 1.5);
        this.activate(o, g.nodes[a].x, g.nodes[a].z);
        this.initGraphMover(o);
      }
    } else if (id === 'ufo') {
      // Cross the screen sideways just beyond the hole (the camera looks from +Z), so the
      // saucer never hides the hole and its drops land in view.
      const u = this.ufo!;
      const dir = this.rng.chance(0.5) ? 1 : -1;
      const R = 46 + h.r * 3;
      const z = clamp(h.z - (5 + h.r * 1.3 + u.f * 0.5));
      u.tx = clamp(h.x + dir * R);
      u.tz = z;
      u.speed = (R * 2) / EVENTS.ufo.crossTime;
      u.rot = dir > 0 ? 0 : Math.PI;
      this.activate(u, clamp(h.x - dir * R), z);
      this.eventLeft = EVENTS.ufo.crossTime + 2;
      this.dropTimer = 0;
    } else {
      this.eventLeft = EVENTS.stampede.duration;
      const dir = this.rng.chance(0.5) ? 1 : -1;
      const R = 42 + h.r * 3;
      const z0 = h.z + this.rng.range(-3, 3);
      for (const o of this.herd) {
        if (o.state !== DORMANT) continue;
        const dz = this.rng.range(-6, 6);
        const lag = this.rng.range(0, 10);
        o.tx = clamp(h.x + dir * (R + 30));
        o.tz = clamp(z0 + dz);
        o.speed = this.rng.range(EVENTS.stampede.speed[0], EVENTS.stampede.speed[1]);
        o.rot = dir > 0 ? 0 : Math.PI;
        this.activate(o, clamp(h.x - dir * (R + lag)), clamp(z0 + dz));
      }
    }
    this.events.push({ k: 'event', id, on: true });
  }

  private updateEvent(dt: number): void {
    if (this.eventId === 'ufo') {
      const u = this.ufo!;
      if (u.state === ALIVE && Math.hypot(u.x - this.main.x, u.z - this.main.z) < 34 + this.main.r * 2) {
        this.dropTimer -= dt;
        const next = this.drops.find((o) => o.state === DORMANT);
        if (next && this.dropTimer <= 0) {
          this.dropTimer = EVENTS.ufo.dropEvery;
          next.y = u.y + 1;
          next.dropVy = 0;
          this.activate(next, u.x + this.rng.range(-1, 1), u.z + this.rng.range(-1, 1));
          this.dropping.push(next);
        }
      }
    }
    this.eventLeft -= dt;
    const done = this.eventLeft <= 0 || (this.eventId === 'ufo' && this.ufo!.state !== ALIVE) || (this.eventId === 'stampede' && !this.herd.some((o) => o.state === ALIVE));
    if (done) {
      this.events.push({ k: 'event', id: this.eventId!, on: false });
      this.eventId = null;
      this.eventTimer = this.rng.range(EVENTS.gap[0], EVENTS.gap[1]);
      if (!this.plan.length) this.eventsOn = false;
    }
  }

  private updateDrops(dt: number): void {
    const d = this.dropping;
    for (let i = d.length - 1; i >= 0; i--) {
      const o = d[i];
      if (o.state !== ALIVE) {
        d[i] = d[d.length - 1];
        d.pop();
        continue;
      }
      o.dropVy += 14 * dt;
      o.y -= o.dropVy * dt;
      o.dirty = true;
      if (o.y <= o.baseY) {
        o.y = o.baseY;
        d[i] = d[d.length - 1];
        d.pop();
      }
    }
  }

  /** MV_RUN: straight run, sidestepping solids (unless flying); leaves the stage on arrival. */
  private updateRunner(o: WObj, dt: number): void {
    const dx = o.tx - o.x;
    const dz = o.tz - o.z;
    const d = Math.hypot(dx, dz);
    const step = o.speed * dt;
    o.bob += dt * (4 + o.speed * 3);
    o.dirty = true;
    if (d <= step) {
      o.state = DORMANT;
      this.leaving.push(o);
      return;
    }
    const ux = dx / d;
    const uz = dz / d;
    let nx = o.x + ux * step;
    let nz = o.z + uz * step;
    if (!o.fly && this.blocked(nx, nz) && !this.blocked(o.x, o.z)) {
      // Veer around the building: try a diagonal to either side.
      const s = (o.id & 1) * 2 - 1;
      for (const side of [s, -s]) {
        const ax = o.x + (ux - uz * side) * step * 0.8;
        const az = o.z + (uz + ux * side) * step * 0.8;
        if (!this.blocked(ax, az)) {
          nx = ax;
          nz = az;
          break;
        }
      }
      if (this.blocked(nx, nz)) return;
    }
    o.rot = lerpAngle(o.rot, Math.atan2(-(nz - o.z), nx - o.x), 1 - Math.exp(-8 * dt));
    o.x = nx;
    o.z = nz;
  }

  get percentEaten(): number {
    return this.weightTotal > 0 ? this.weightEaten / this.weightTotal : 0;
  }

  get comboMultiplier(): number {
    return comboMult(this.combo, this.cfg.comboCap);
  }

  /** XP progress (0..1) toward the next size level. */
  get levelProgress(): number {
    return Math.min(1, this.main.xp / xpForLevel(this.main.level));
  }

  canEat(o: WObj, hole: WHole = this.main): boolean {
    return o.f <= SIZE.fit * hole.r;
  }

  /**
   * What the main hole can still eat this round: the props that fit now, plus the ones that would
   * fit after growing on all of those (props are taken smallest first, so one pass reaches the
   * fixed point). While Mega Mouth is active or will recharge before time runs out, the enlarged
   * mouth counts too. Dormant event props are not counted. `levels` is how many more size levels
   * that food is worth and `cash` what it would pay (before combo).
   */
  reachable(): { count: number; levels: number; cash: number } {
    if (this.bySize.length !== this.objects.length) this.bySize = [...this.objects].sort((a, b) => a.f - b.f);
    const mega = this.abilities.mega;
    const megaUsable = this.cfg.abilities.mega.level > 0 && (mega.active > 0 || mega.cd <= this.timeLeft);
    const mouth = SIZE.fit * (megaUsable ? ABILITY_LEVEL.megaScale : 1);
    let level = this.main.level;
    let xp = this.main.xp;
    let need = xpForLevel(level);
    let r = radiusForLevel(level);
    let fit = mouth * r;
    let count = 0;
    let cash = 0;
    for (const o of this.bySize) {
      if (o.state !== ALIVE) continue;
      if (o.f > fit) break;
      count++;
      cash += o.value * this.cfg.cashMult;
      xp += o.xp * this.cfg.xpMult * frontierXpMult(o.f, r);
      while (xp >= need) {
        xp -= need;
        level++;
        need = xpForLevel(level);
        r = radiusForLevel(level);
        fit = mouth * r;
      }
    }
    return { count, levels: level - this.main.level, cash };
  }

  reachableLeft(): number {
    return this.reachable().count;
  }

  /**
   * The round is over once nothing reachable is left, or once the hole cannot grow any more and
   * only crumbs remain (worth less than `crumbs` of what this round has paid so far).
   */
  snackedOut(): boolean {
    const r = this.reachable();
    return r.count === 0 || (r.levels === 0 && r.cash < this.cash * ROUND_END.crumbs);
  }

  // ------------------------------------------------------------ abilities
  abilityReady(id: AbilityId): boolean {
    return this.cfg.abilities[id].level > 0 && this.abilities[id].cd <= 0 && this.running;
  }

  useAbility(id: AbilityId): boolean {
    if (!this.abilityReady(id)) return false;
    const c = this.cfg.abilities[id];
    this.abilities[id].active = c.duration;
    this.abilities[id].cd = c.cooldown;
    this.events.push({ k: 'ability', id });
    return true;
  }

  // ------------------------------------------------------------ movers
  private initGraphMover(o: WObj): void {
    // Spawn sits on the centre line; snap onto the lane and head for the edge end.
    const g = this.map.graphs[o.graph];
    const a = g.nodes[o.from];
    const b = g.nodes[o.to];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const L = Math.hypot(dx, dz) || 1;
    o.x += (-dz / L) * o.lane;
    o.z += (dx / L) * o.lane;
    o.rot = Math.atan2(-dz, dx);
    this.setGraphTarget(o, 1);
  }

  private setGraphTarget(o: WObj, phase: number): void {
    const g = this.map.graphs[o.graph];
    const a = g.nodes[o.from];
    const b = g.nodes[o.to];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const L = Math.hypot(dx, dz) || 1;
    const ux = dx / L;
    const uz = dz / L;
    const rx = -uz;
    const rz = ux;
    const c = Math.min(Math.abs(o.lane), L * 0.3);
    o.phase = phase;
    if (phase === 0) {
      o.tx = a.x + rx * o.lane + ux * c;
      o.tz = a.z + rz * o.lane + uz * c;
    } else {
      o.tx = b.x + rx * o.lane - ux * c;
      o.tz = b.z + rz * o.lane - uz * c;
    }
  }

  private advanceGraph(o: WObj): void {
    if (o.phase === 0) {
      this.setGraphTarget(o, 1);
      return;
    }
    const adj = this.map.graphs[o.graph].adj[o.to];
    let next = o.from;
    if (adj.length > 1) {
      // Avoid U-turns unless at a dead end.
      for (let tries = 0; tries < 6; tries++) {
        next = adj[Math.floor(this.rng.next() * adj.length)];
        if (next !== o.from) break;
      }
    } else if (adj.length === 1) next = adj[0];
    o.from = o.to;
    o.to = next;
    this.setGraphTarget(o, 0);
  }

  /** True where a wanderer may not walk: inside an uneaten solid prop or a pond. */
  blocked(x: number, z: number): boolean {
    const b = this.block;
    const i = Math.floor(x + b.half);
    const j = Math.floor(z + b.half);
    if (i < 0 || j < 0 || i >= b.n || j >= b.n) return false;
    const v = b.cells[i + j * b.n];
    if (v === 0) return false;
    return v < 0 || this.objects[v - 1].state === ALIVE;
  }

  private moveToward(o: WObj, speed: number, dt: number, avoid = false): number {
    const dx = o.tx - o.x;
    const dz = o.tz - o.z;
    const d = Math.hypot(dx, dz);
    const step = speed * dt;
    if (d <= step || d < 1e-4) {
      if (avoid && this.blocked(o.tx, o.tz)) return MOVE_BLOCKED;
      o.x = o.tx;
      o.z = o.tz;
      return MOVE_ARRIVED;
    }
    const nx = o.x + (dx / d) * step;
    const nz = o.z + (dz / d) * step;
    // A mover already inside (pulled in by the magnet) may always walk out.
    if (avoid && this.blocked(nx, nz) && !this.blocked(o.x, o.z)) return MOVE_BLOCKED;
    o.x = nx;
    o.z = nz;
    o.rot = lerpAngle(o.rot, Math.atan2(-dz, dx), 1 - Math.exp(-10 * dt));
    return MOVE_FREE;
  }

  /** Next wander target inside the mover's area, preferring spots outside solid props. */
  private pickWanderTarget(o: WObj): void {
    const span = 10;
    for (let tries = 0; tries < 6; tries++) {
      o.tx = Math.min(o.x1, Math.max(o.x0, o.x + this.rng.range(-span, span)));
      o.tz = Math.min(o.z1, Math.max(o.z0, o.z + this.rng.range(-span, span)));
      if (!this.blocked(o.tx, o.tz) && !this.blocked((o.x + o.tx) / 2, (o.z + o.tz) / 2)) return;
    }
  }

  private updateMover(o: WObj, dt: number): void {
    if (o.mv === MV_RUN) {
      this.updateRunner(o, dt);
      return;
    }
    const main = this.main;
    // Small things panic and run from a hole that can eat them.
    if (o.flee && main.active && o.f <= SIZE.fit * main.r) {
      const dx = o.x - main.x;
      const dz = o.z - main.z;
      const fr = main.r * 2.2 + 3;
      const d2 = dx * dx + dz * dz;
      if (d2 < fr * fr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const sp = o.speed * 1.9 * dt;
        const nx = o.x + (dx / d) * sp;
        const nz = o.z + (dz / d) * sp;
        // Slide along walls instead of running into buildings.
        if (!this.blocked(nx, nz) || this.blocked(o.x, o.z)) {
          o.x = nx;
          o.z = nz;
        } else if (!this.blocked(nx, o.z)) o.x = nx;
        else if (!this.blocked(o.x, nz)) o.z = nz;
        o.rot = lerpAngle(o.rot, Math.atan2(-dz, dx), 1 - Math.exp(-12 * dt));
        o.bob += dt * 14;
        o.panic = 0.4;
        this.clampToMap(o);
        o.dirty = true;
        return;
      }
    }
    if (o.panic > 0) o.panic -= dt;
    if (o.wait > 0) {
      o.wait -= dt;
      return;
    }
    o.bob += dt * (4 + o.speed * 3);
    if (o.mv === MV_GRAPH) {
      if (this.moveToward(o, o.speed, dt) === MOVE_ARRIVED) this.advanceGraph(o);
    } else {
      const res = this.moveToward(o, o.speed, dt, true);
      if (res !== MOVE_FREE) {
        o.wait = res === MOVE_BLOCKED ? this.rng.range(0.1, 0.5) : this.rng.range(0.4, 3);
        this.pickWanderTarget(o);
      }
    }
    o.dirty = true;
  }

  private clampToMap(o: { x: number; z: number }): void {
    const h = this.map.half - 0.5;
    if (o.x < -h) o.x = -h;
    else if (o.x > h) o.x = h;
    if (o.z < -h) o.z = -h;
    else if (o.z > h) o.z = h;
  }

  // ------------------------------------------------------------ holes
  private moveMain(dt: number): void {
    const h = this.main;
    const dash = this.abilities.dash.active > 0;
    let ix = this.input.x;
    let iz = this.input.z;
    if (!this.running) ix = iz = 0;
    const mag = Math.hypot(ix, iz);
    if (mag > 1) {
      ix /= mag;
      iz /= mag;
    }
    let speed = holeSpeed(h.baseR, this.cfg.speedMult);
    if (dash) {
      speed *= ABILITY_LEVEL.dashSpeed;
      if (mag < 0.2) {
        // Dash in the current travel direction if there is no input.
        const v = Math.hypot(h.vx, h.vz);
        if (v > 0.01) {
          ix = h.vx / v;
          iz = h.vz / v;
        }
      } else {
        ix /= Math.max(mag, 1e-6);
        iz /= Math.max(mag, 1e-6);
      }
    }
    const k = 1 - Math.exp(-(dash ? 14 : 9) * dt);
    h.vx += (ix * speed - h.vx) * k;
    h.vz += (iz * speed - h.vz) * k;
    h.x += h.vx * dt;
    h.z += h.vz * dt;
    this.clampToMap(h);
  }

  private findHelperTarget(h: WHole): WObj | null {
    const fit = SIZE.fit * h.r;
    let best: WObj | null = null;
    let bestD = Infinity;
    const visit = (o: WObj) => {
      if (o.state !== ALIVE || o.f > fit) return;
      const d = (o.x - h.x) ** 2 + (o.z - h.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    };
    this.grid.query(h.x, h.z, 24, visit);
    for (const o of this.movers) {
      if (Math.abs(o.x - h.x) < 24 && Math.abs(o.z - h.z) < 24) visit(o);
    }
    return best;
  }

  private moveHelper(h: WHole, dt: number): void {
    h.think -= dt;
    if (h.think <= 0 || (h.target && h.target.state !== ALIVE)) {
      h.think = 0.5 + this.rng.next() * 0.3;
      h.target = this.findHelperTarget(h);
      if (!h.target) {
        const H = this.map.half - 10;
        h.tx = Math.max(-H, Math.min(H, h.x + this.rng.range(-40, 40)));
        h.tz = Math.max(-H, Math.min(H, h.z + this.rng.range(-40, 40)));
      }
    }
    const tx = h.target ? h.target.x : h.tx;
    const tz = h.target ? h.target.z : h.tz;
    const dx = tx - h.x;
    const dz = tz - h.z;
    const d = Math.hypot(dx, dz);
    const speed = HELPERS.speed * this.cfg.helperSpeedMult * (1 + 0.4 * h.r) * (this.running ? 1 : 0);
    const k = 1 - Math.exp(-5 * dt);
    const ix = d > 0.05 ? dx / d : 0;
    const iz = d > 0.05 ? dz / d : 0;
    h.vx += (ix * speed - h.vx) * k;
    h.vz += (iz * speed - h.vz) * k;
    h.x += h.vx * dt;
    h.z += h.vz * dt;
    this.clampToMap(h);
  }

  private processHole(hi: number, dt: number): void {
    const H = this.holes[hi];
    if (!H.active) return;
    const R = H.r;
    const fit = SIZE.fit * R;
    let magR = 0;
    let pull = 0;
    if (H.main) {
      const vortex = this.abilities.vortex.active > 0;
      const frac = magnetRangeFrac(this.cfg.magnetLevel) + (vortex ? ABILITY_LEVEL.vortexRange : 0);
      magR = R * frac;
      pull = magnetPull(R, this.cfg.magnetLevel) * (vortex ? ABILITY_LEVEL.vortexPull : 1);
    }
    const wobR = H.main ? Math.min(this.maxF, 2.5 * R + 6) * 0.8 : 0;
    const qr = R + Math.max(magR, wobR);
    const visit = (o: WObj) => {
      if (o.state !== ALIVE) return;
      const dx = o.x - H.x;
      const dz = o.z - H.z;
      const d2 = dx * dx + dz * dz;
      if (o.f <= fit) {
        const inner = R - 0.25 * o.f;
        if (d2 < inner * inner) {
          this.swallow(o, hi, dx, dz);
          return;
        }
        if (magR > 0) {
          const mr = R + magR;
          if (d2 < mr * mr) {
            const d = Math.sqrt(d2);
            const step = Math.min(pull * dt * (1.5 - d / mr), d - inner * 0.5);
            if (step > 0) {
              o.x -= (dx / d) * step;
              o.z -= (dz / d) * step;
              if (o.mv === MV_NONE) this.grid.update(o);
              o.dirty = true;
            }
          }
        }
      } else if (H.main) {
        const reach = R + o.f * 0.7;
        if (d2 < reach * reach) {
          const w = Math.min(1, 1.3 - Math.sqrt(d2) / reach);
          if (w > o.wob) o.wob = w;
          o.dirty = true;
        }
      }
    };
    this.grid.query(H.x, H.z, qr, visit);
    const movers = this.movers;
    for (let i = movers.length - 1; i >= 0; i--) {
      const o = movers[i];
      if (Math.abs(o.x - H.x) < qr + o.f && Math.abs(o.z - H.z) < qr + o.f) visit(o);
    }
  }

  private swallow(o: WObj, hi: number, dx: number, dz: number): void {
    o.state = FALLING;
    o.hole = hi;
    o.ox = dx;
    o.oz = dz;
    o.ft = 0;
    o.vy = 0;
    o.tilt = 0;
    const d = Math.hypot(dx, dz);
    if (d > 1e-3) {
      o.tdx = -dx / d;
      o.tdz = -dz / d;
    } else {
      const a = this.rng.range(0, Math.PI * 2);
      o.tdx = Math.cos(a);
      o.tdz = Math.sin(a);
    }
    if (o.mv !== MV_NONE) {
      const i = this.movers.indexOf(o);
      if (i >= 0) {
        this.movers[i] = this.movers[this.movers.length - 1];
        this.movers.pop();
      }
    } else {
      this.grid.remove(o);
    }
    this.falling.push(o);
    o.dirty = true;
    this.weightEaten += o.w;
    this.eatenByType.set(o.t, (this.eatenByType.get(o.t) ?? 0) + 1);
    if (o.gold) this.goldEaten++;

    const H = this.holes[hi];
    let cash: number;
    if (H.main) {
      this.eaten++;
      this.combo = this.comboTimer > 0 ? this.combo + 1 : 1;
      this.comboTimer = this.cfg.comboWindow;
      if (this.combo > this.comboBest) this.comboBest = this.combo;
      cash = o.value * this.cfg.cashMult * comboMult(this.combo, this.cfg.comboCap);
      if (!this.biggest || o.f > this.biggest.f) this.biggest = o;
      this.gainXp(o.xp * this.cfg.xpMult * frontierXpMult(o.f, H.baseR));
    } else {
      this.helperEaten++;
      cash = o.value * this.cfg.cashMult * HELPERS.roundCashShare;
      this.helperCash += cash;
    }
    this.cash += cash;
    this.events.push({ k: 'eat', o, hole: hi, cash, combo: H.main ? this.combo : 0 });
  }

  gainXp(xp: number): void {
    const h = this.main;
    h.xp += xp;
    let need = xpForLevel(h.level);
    while (h.xp >= need) {
      h.xp -= need;
      h.level++;
      this.levelsGained++;
      h.baseR = radiusForLevel(h.level);
      this.events.push({ k: 'level', level: h.level });
      need = xpForLevel(h.level);
    }
  }

  private updateFalling(dt: number): void {
    const f = this.falling;
    for (let i = f.length - 1; i >= 0; i--) {
      const o = f[i];
      const H = this.holes[o.hole];
      o.ft += dt;
      const k = Math.exp(-3.5 * dt);
      o.ox *= k;
      o.oz *= k;
      o.tilt = Math.min(1.35, o.tilt + dt * 3.4);
      if (o.ft > 0.08) {
        o.vy += (14 + 5 * H.r) * dt;
        o.y -= o.vy * dt;
      }
      o.x = H.x + o.ox;
      o.z = H.z + o.oz;
      o.dirty = true;
      if (o.y < o.baseY - (o.h * 1.1 + H.r * 1.3 + 1) || o.ft > 3.5) {
        o.state = GONE;
        f[i] = f[f.length - 1];
        f.pop();
        this.events.push({ k: 'gone', o });
      }
    }
  }

  // ------------------------------------------------------------ main step
  step(dt: number): void {
    this.time += dt;
    if (this.running && !this.opts.demo) {
      const before = Math.ceil(this.timeLeft);
      this.timeLeft -= dt;
      const after = Math.ceil(this.timeLeft);
      if (after < before && after <= 5 && after >= 1) this.events.push({ k: 'tick', s: after });
      const cleared = this.weightEaten >= this.weightTotal * 0.9995;
      let snackedOut = false;
      if (!cleared && this.timeLeft > 0) {
        this.reachCheck -= dt;
        if (this.reachCheck <= 0) {
          this.reachCheck = ROUND_END.checkEvery;
          if (!this.eventId && this.snackedOut()) {
            // A random event still to come brings new snacks: start it now instead of ending.
            if (this.eventsOn && this.plan.length && this.timeLeft > EVENTS.minLeft) this.eventTimer = 0;
            else snackedOut = true;
          }
        }
      }
      if (this.timeLeft <= 0 || cleared || snackedOut) {
        this.timeLeft = Math.max(0, this.timeLeft);
        this.running = false;
        this.endReason = cleared ? 'cleared' : snackedOut ? 'snackedOut' : 'timeUp';
        const bonusFrac = this.endReason === 'timeUp' ? 0 : timeBonusFrac(this.timeLeft);
        this.timeBonus = this.cash * bonusFrac;
        this.cash += this.timeBonus;
        this.endDelay = cleared ? 2.4 : ROUND_END.endDelay;
        this.events.push(snackedOut ? { k: 'snackedOut', bonusFrac } : { k: cleared ? 'cleared' : 'timeUp' });
        if (this.combo > 0) this.events.push({ k: 'comboEnd', n: this.combo });
        this.combo = 0;
        this.comboTimer = 0;
      }
    } else if (!this.running && !this.ended) {
      this.endDelay -= dt;
      if (this.endDelay <= 0 && this.falling.length === 0) {
        this.ended = true;
        this.events.push({ k: 'end' });
      }
    }

    for (const id of ['dash', 'vortex', 'mega'] as AbilityId[]) {
      const a = this.abilities[id];
      if (a.cd > 0) a.cd -= dt;
      if (a.active > 0) a.active -= dt;
    }

    this.moveMain(dt);
    for (let i = 1; i < this.holes.length; i++) this.moveHelper(this.holes[i], dt);

    const mega = this.abilities.mega.active > 0 ? ABILITY_LEVEL.megaScale : 1;
    const kr = 1 - Math.exp(-5 * dt);
    const main = this.main;
    main.r += (main.baseR * mega - main.r) * kr;

    const movers = this.movers;
    for (let i = 0; i < movers.length; i++) this.updateMover(movers[i], dt);
    for (const o of this.leaving) {
      const i = movers.indexOf(o);
      if (i >= 0) {
        movers[i] = movers[movers.length - 1];
        movers.pop();
      }
    }
    this.leaving.length = 0;
    this.updateDrops(dt);

    if (this.running && this.eventsOn) {
      if (this.eventId) this.updateEvent(dt);
      else {
        this.eventTimer -= dt;
        if (this.eventTimer <= 0) {
          if (this.timeLeft > EVENTS.minLeft && this.plan.length) this.startEvent(this.plan.shift()!);
          else this.eventsOn = false;
        }
      }
    }

    if (this.running) {
      for (let i = 0; i < this.holes.length; i++) this.processHole(i, dt);
    }
    this.updateFalling(dt);

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.events.push({ k: 'comboEnd', n: this.combo });
        this.combo = 0;
      }
    }
  }
}
