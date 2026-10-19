import { EVENTS } from '../config/balance';
import { OBJECT_TYPES, footprintOf, typeId } from '../config/objects';
import { ALIVE, DORMANT, MV_GRAPH, MV_NONE, MV_RUN, lerpAngle, type WObj, type World } from './world';

export type EventId = 'rush' | 'ufo' | 'stampede';

/** Seconds a runner spends detouring around solids before it barges through (no endless pacing in a pocket). */
const RUNNER_PATIENCE = 4;
/** Paint jobs for rush hour traffic. */
const RUSH_TINTS = [0xe84a4a, 0x3b82f6, 0xf5c542, 0x38c172, 0xffffff, 0xf08a24, 0x9b5de5];

/**
 * Random round events: rush hour traffic, a UFO fly-by that drops golden snacks, and a farm
 * stampede. `setup` rolls which events visit the round and stages their props off-stage
 * (DORMANT); `update` runs one event at a time. The owning World calls in from its step and
 * draws every random number from its seeded Rng, so a round replays exactly from its seed.
 */
export class RoundEvents {
  /** Event in progress, if any. */
  current: EventId | null = null;
  private on = false;
  /** Countdown to the next event while none is running. */
  private timer = 0;
  /** Time left on the running event. */
  private left = 0;
  /** Events rolled for this round, in play order. */
  private plan: EventId[] = [];
  private readonly rushPool: WObj[] = [];
  private readonly herd: WObj[] = [];
  private ufo: WObj | null = null;
  private readonly drops: WObj[] = [];
  private dropTimer = 0;
  private readonly dropping: WObj[] = [];
  /** Runners that reached the edge of the stage this step. */
  private readonly leaving: WObj[] = [];

  constructor(private readonly w: World) {}

  /** The event UFO while it is crossing the map. */
  get ufoFlying(): WObj | null {
    return this.ufo && this.ufo.state === ALIVE ? this.ufo : null;
  }

  /** Off-stage props for the events this map supports, then the roll for which events visit. */
  setup(): void {
    const { map, rng } = this.w;
    const tr = map.traffic;
    if (tr) {
      for (let i = 0; i < EVENTS.rush.count; i++) {
        const o = this.stageObj(rng.pick(tr.types), 1, rng.pick(RUSH_TINTS));
        o.mv = MV_GRAPH;
        o.graph = tr.graph;
        o.lane = tr.lane;
        o.speed = tr.speed * rng.range(0.85, 1.15);
        this.rushPool.push(o);
      }
    }
    this.ufo = this.stageObj('ufo', 0.7, 0x45e0e8);
    this.ufo.mv = MV_RUN;
    this.ufo.fly = true;
    // UFO drops: golden copies of the most common small, squat prop on this map.
    const counts = new Map<string, number>();
    for (const s of map.spawns) {
      const def = OBJECT_TYPES[typeId(s.type)];
      const f = footprintOf(def, 1);
      if (!s.move && f >= 0.3 && f <= 1.2 && def.h <= 1.5) counts.set(s.type, (counts.get(s.type) ?? 0) + 1);
    }
    const dropType = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'cone';
    for (let i = 0; i < EVENTS.ufo.drops; i++) {
      const o = this.stageObj(dropType, rng.range(0.9, 1.3));
      this.w.makeGolden(o);
      this.drops.push(o);
    }
    if (map.herd) {
      for (let i = 0; i < EVENTS.stampede.count; i++) {
        const o = this.stageObj(rng.weighted(map.herd));
        o.mv = MV_RUN;
        this.herd.push(o);
      }
    }
    // Roll which events visit this round, then shuffle their order.
    const kinds: EventId[] = ['ufo'];
    if (this.rushPool.length) kinds.push('rush');
    if (this.herd.length) kinds.push('stampede');
    this.plan = rng.shuffle(kinds.filter((k) => rng.chance(EVENTS.chance[k])));
    this.timer = rng.range(EVENTS.firstAt[0], EVENTS.firstAt[1]);
    this.on = this.plan.length > 0;
  }

  /**
   * Nothing reachable is left to eat: if an event is still to come (and there is time for it),
   * start it right away and return true, so its snacks arrive instead of the round ending.
   */
  hurry(): boolean {
    if (!this.on || !this.plan.length || this.w.timeLeft <= EVENTS.minLeft) return false;
    this.timer = 0;
    return true;
  }

  /** Once per step, after the movers: clears runners that left, drops UFO snacks and runs the event clock. */
  update(dt: number): void {
    const movers = this.w.movers;
    for (const o of this.leaving) {
      const i = movers.indexOf(o);
      if (i >= 0) {
        movers[i] = movers[movers.length - 1];
        movers.pop();
      }
    }
    this.leaving.length = 0;
    this.updateDrops(dt);

    if (!this.w.running || !this.on) return;
    if (this.current) this.updateEvent(dt);
    else {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.w.timeLeft > EVENTS.minLeft && this.plan.length) this.start(this.plan.shift()!);
        else this.on = false;
      }
    }
  }

  /** MV_RUN: straight run, sidestepping solids (unless flying); leaves the stage on arrival. */
  updateRunner(o: WObj, dt: number): void {
    const w = this.w;
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
    if (o.fly || !w.blocked(nx, nz)) o.detour = 0;
    else if (o.detour < RUNNER_PATIENCE && !w.blocked(o.x, o.z)) {
      // Veer around the building: try a diagonal to either side, then (square-on to a wall, where
      // both diagonals still run into it) slide sideways along it until the way ahead clears.
      o.detour += dt;
      const s = (o.id & 1) * 2 - 1;
      search: for (const fwd of [1, 0]) {
        for (const side of [s, -s]) {
          const ax = o.x + (ux * fwd - uz * side) * step * 0.8;
          const az = o.z + (uz * fwd + ux * side) * step * 0.8;
          if (!w.blocked(ax, az)) {
            nx = ax;
            nz = az;
            break search;
          }
        }
      }
      if (w.blocked(nx, nz)) return;
    }
    o.rot = lerpAngle(o.rot, Math.atan2(-(nz - o.z), nx - o.x), 1 - Math.exp(-8 * dt));
    o.x = nx;
    o.z = nz;
  }

  /** A DORMANT event prop; its weight stays 0, so it never counts toward map %. */
  private stageObj(type: string, scale = 1, tint = 0xffffff): WObj {
    const o = this.w.initObj(type, scale, tint);
    o.state = DORMANT;
    o.event = true;
    return o;
  }

  /** Brings a staged prop on stage at (x, z). */
  private activate(o: WObj, x: number, z: number): void {
    const w = this.w;
    o.x = x;
    o.z = z;
    o.state = ALIVE;
    o.dirty = true;
    o.bob = w.rng.range(0, 10);
    if (o.mv === MV_NONE) w.grid.insert(o);
    else w.movers.push(o);
  }

  private start(id: EventId): void {
    const { map, rng, main: h } = this.w;
    this.current = id;
    const H = map.half - 4;
    const clamp = (v: number) => Math.max(-H, Math.min(H, v));
    if (id === 'rush') {
      this.left = EVENTS.rush.duration;
      const g = map.graphs[map.traffic!.graph];
      for (const o of this.rushPool) {
        if (o.state !== DORMANT) continue;
        // Enter on a road segment out of sight of the hole.
        let a = 0;
        let b = 0;
        for (let tries = 0; tries < 12; tries++) {
          a = rng.int(0, g.nodes.length - 1);
          if (!g.adj[a].length) continue;
          b = rng.pick(g.adj[a]);
          if (Math.hypot(g.nodes[a].x - h.x, g.nodes[a].z - h.z) > 30 + h.r * 4) break;
        }
        if (!g.adj[a].length) continue;
        o.from = a;
        o.to = b;
        o.wait = rng.range(0, 1.5);
        this.activate(o, g.nodes[a].x, g.nodes[a].z);
        this.w.initGraphMover(o);
      }
    } else if (id === 'ufo') {
      // Cross the screen sideways just beyond the hole (the camera looks from +Z), so the
      // saucer never hides the hole and its drops land in view.
      const u = this.ufo!;
      const dir = rng.chance(0.5) ? 1 : -1;
      const R = 46 + h.r * 3;
      const z = clamp(h.z - (5 + h.r * 1.3 + u.f * 0.5));
      u.tx = clamp(h.x + dir * R);
      u.tz = z;
      u.speed = (R * 2) / EVENTS.ufo.crossTime;
      u.rot = dir > 0 ? 0 : Math.PI;
      this.activate(u, clamp(h.x - dir * R), z);
      this.left = EVENTS.ufo.crossTime + 2;
      this.dropTimer = 0;
    } else {
      this.left = EVENTS.stampede.duration;
      const dir = rng.chance(0.5) ? 1 : -1;
      const R = 42 + h.r * 3;
      const z0 = h.z + rng.range(-3, 3);
      for (const o of this.herd) {
        if (o.state !== DORMANT) continue;
        const dz = rng.range(-6, 6);
        const lag = rng.range(0, 10);
        o.tx = clamp(h.x + dir * (R + 30));
        o.tz = clamp(z0 + dz);
        o.speed = rng.range(EVENTS.stampede.speed[0], EVENTS.stampede.speed[1]);
        o.rot = dir > 0 ? 0 : Math.PI;
        o.detour = 0;
        this.activate(o, clamp(h.x - dir * (R + lag)), clamp(z0 + dz));
      }
    }
    this.w.events.push({ k: 'event', id, on: true });
  }

  private updateEvent(dt: number): void {
    const { main, rng } = this.w;
    if (this.current === 'ufo') {
      const u = this.ufo!;
      if (u.state === ALIVE && Math.hypot(u.x - main.x, u.z - main.z) < 34 + main.r * 2) {
        this.dropTimer -= dt;
        const next = this.drops.find((o) => o.state === DORMANT);
        if (next && this.dropTimer <= 0) {
          this.dropTimer = EVENTS.ufo.dropEvery;
          next.y = u.y + 1;
          next.dropVy = 0;
          this.activate(next, u.x + rng.range(-1, 1), u.z + rng.range(-1, 1));
          this.dropping.push(next);
        }
      }
    }
    this.left -= dt;
    const done = this.left <= 0 || (this.current === 'ufo' && this.ufo!.state !== ALIVE) || (this.current === 'stampede' && !this.herd.some((o) => o.state === ALIVE));
    if (done) {
      this.w.events.push({ k: 'event', id: this.current!, on: false });
      this.current = null;
      this.timer = rng.range(EVENTS.gap[0], EVENTS.gap[1]);
      if (!this.plan.length) this.on = false;
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
}
