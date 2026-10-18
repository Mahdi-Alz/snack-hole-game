import { SIZE } from '../config/balance';
import { ALIVE, type WObj, type World } from './world';

/**
 * Greedy steering used by the balance simulation and the hub attract mode:
 * chase the best value-per-distance edible prop nearby, otherwise roam.
 */
export class Bot {
  private think = 0;
  private target: WObj | null = null;
  private roamX = 0;
  private roamZ = 0;

  constructor(private skill = 1) {}

  steer(world: World, dt: number): { x: number; z: number } {
    const h = world.main;
    this.think -= dt;
    if (this.think <= 0 || !this.target || this.target.state !== ALIVE || this.target.f > SIZE.fit * h.r) {
      this.think = 0.3 / this.skill;
      this.target = this.pick(world);
      if (!this.target) {
        const H = world.map.half * 0.8;
        this.roamX = (world.rng.next() * 2 - 1) * H;
        this.roamZ = (world.rng.next() * 2 - 1) * H;
      }
    }
    const tx = this.target ? this.target.x : this.roamX;
    const tz = this.target ? this.target.z : this.roamZ;
    const dx = tx - h.x;
    const dz = tz - h.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return { x: 0, z: 0 };
    return { x: dx / d, z: dz / d };
  }

  private pick(world: World): WObj | null {
    const h = world.main;
    const fit = SIZE.fit * h.r;
    const search = 10 + 5 * h.r;
    let best: WObj | null = null;
    let bestScore = 0;
    const consider = (o: WObj) => {
      if (o.state !== ALIVE || o.f > fit) return;
      const d = Math.hypot(o.x - h.x, o.z - h.z);
      const score = (o.value + 1) / (d + h.r * 1.5 + 2);
      if (score > bestScore) {
        bestScore = score;
        best = o;
      }
    };
    world.grid.query(h.x, h.z, search, consider);
    for (const o of world.movers) {
      if (Math.abs(o.x - h.x) < search && Math.abs(o.z - h.z) < search) consider(o);
    }
    if (best) return best;
    // Nothing close: sample the map for the nearest edible prop.
    let bestD = Infinity;
    const objs = world.objects;
    for (let i = 0; i < 80; i++) {
      const o = objs[Math.floor(world.rng.next() * objs.length)];
      if (o.state !== ALIVE || o.f > fit) continue;
      const d = Math.hypot(o.x - h.x, o.z - h.z);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }
}
