import { OBJECT_TYPES } from '../config/objects';
import type { MoveGraph } from './mapgen/builder';
import { MV_GRAPH, type WObj } from './world';

/** Seconds between a vehicle's looks at the traffic around it; its speed factor holds in between. */
export const SENSE_EVERY = 0.1;
/** Free road ahead (m) below which a vehicle slows down; it stops once none is left. */
const SLOW = 4;
/** Gap (m) a vehicle keeps to the bumper of the one ahead. */
const GAP = 0.8;
/** Side clearance (m). Smaller than GAP, so a car waiting at a junction stays out of the cross lane. */
const SIDE_GAP = 0.15;
/** Seconds ahead a vehicle predicts the others' moves, so it yields before cross traffic is in its lane. */
const AHEAD = 0.5;
/**
 * A junction reaches this far (m) past its lanes: room for a car turning across it on the diagonal.
 * A vehicle waiting for it keeps its nose outside, and further back while a bigger vehicle turns.
 */
const JUNCTION = 2.5;
/** Headings closer than this (cosine) drive the same way: they share a junction and queue instead. */
const SAME_WAY = 0.7;
/** Headings closer than this (cosine) count as straight on: a wide vehicle turning more swings its corners out. */
const TURNED = 0.995;
/** Longest chain of waiting vehicles followed when looking for a ring. */
const RING = 8;

/**
 * Sets `o.brake`, the speed factor that keeps road vehicle `o` from driving through others. It
 * slows for the nearest vehicle whose box is, or within AHEAD seconds will be, ahead in its path,
 * and stops GAP short of it. Before a junction it also waits while a vehicle going another way is
 * in it or reached it first, and until its road out has room. Road vehicles are the graph movers
 * that do not flee (pedestrians walk the same graphs on the sidewalk lanes). World calls this a
 * few times a second per vehicle (SENSE_EVERY), not every frame.
 */
export function senseTraffic(o: WObj, movers: readonly WObj[], graphs: readonly MoveGraph[]): void {
  const od = OBJECT_TYPES[o.t];
  const hl = od.w * o.s * 0.5;
  const hw = od.d * o.s * 0.5;
  // Look along the way o is driving: it turns toward its target ahead of its body.
  let cx = o.tx - o.x;
  let cz = o.tz - o.z;
  const cd = Math.hypot(cx, cz);
  if (cd > 1e-3) {
    cx /= cd;
    cz /= cd;
  } else {
    cx = Math.cos(o.rot);
    cz = -Math.sin(o.rot);
  }
  // Road from o's nose to the junction it drives into, while it is close to it but not in it yet.
  const n = graphs[o.graph].nodes[o.to];
  let gate = o.phase === 1 ? (n.x - o.x) * cx + (n.z - o.z) * cz - hl - Math.abs(o.lane) - JUNCTION : -1;
  if (gate >= SLOW + 3) gate = -1;
  const reach = Math.max(hl, hw) + GAP + SLOW + (gate > 0 ? 2 * (Math.abs(o.lane) + JUNCTION) + 3 : 0);
  let free = SLOW;
  let clear = 0;
  let blocker: WObj | null = null;
  for (let i = 0; i < movers.length; i++) {
    const q = movers[i];
    if (q === o || q.mv !== MV_GRAPH || q.flee || q.graph !== o.graph) continue;
    const dx = q.x - o.x;
    const dz = q.z - o.z;
    const qd = OBJECT_TYPES[q.t];
    const ql = qd.w * q.s * 0.5;
    const qw = qd.d * q.s * 0.5;
    // Cheap early out: ql + qw bounds both extents `look` uses below, so this skips only vehicles
    // that check would skip too, without paying for its hypot.
    const far = reach + ql + qw + q.speed * AHEAD;
    if (Math.abs(dx) > far || Math.abs(dz) > far) continue;
    // Half diagonal: how far q's corners swing out while it turns on the spot. That is more than GAP
    // past its length only for wide vehicles (planes); road vehicles turn inside their junction.
    const qr = Math.hypot(ql, qw);
    const wide = qr - ql > GAP;
    const look = reach + (wide ? qr : Math.max(ql, qw)) + q.speed * AHEAD;
    if (Math.abs(dx) > look || Math.abs(dz) > look) continue;
    // The way q drives, and where it gets in the next AHEAD seconds.
    let mx = q.tx - q.x;
    let mz = q.tz - q.z;
    const md = Math.hypot(mx, mz);
    const ux = md > 1e-3 ? mx / md : Math.cos(q.rot);
    const uz = md > 1e-3 ? mz / md : -Math.sin(q.rot);
    const way = ux * cx + uz * cz;
    const qx = Math.cos(q.rot);
    const qz = -Math.sin(q.rot);
    // A wide q swings its corners out while it still turns, and from when it nears a junction it turns at.
    let swing = wide && qx * ux + qz * uz < TURNED;
    if (wide && !swing && q.phase === 1 && q.next >= 0) {
      const nodes = graphs[q.graph].nodes;
      const a = nodes[q.from];
      const b = nodes[q.to];
      const c = nodes[q.next];
      const ax = b.x - a.x;
      const az = b.z - a.z;
      const bx = c.x - b.x;
      const bz = c.z - b.z;
      swing =
        ax * bx + az * bz < TURNED * Math.hypot(ax, az) * Math.hypot(bx, bz) &&
        Math.hypot(q.x - b.x, q.z - b.z) < qr + Math.abs(q.lane);
    }
    if (gate > 0 && gate < free && q.phase === 1 && q.from === o.to && q.to === o.next) {
      // Keep the junction clear: o drives in only once its road out has room for it past the junction.
      const room = Math.hypot(q.x - n.x, q.z - n.z) - ql - Math.abs(o.lane) - JUNCTION - 2 * hl - GAP;
      if (room < 0) {
        free = gate;
        clear = -Infinity;
        blocker = q;
        continue;
      }
    }
    if (gate > 0 && way < SAME_WAY) {
      // Stop clear of q's corners as it turns across the junction on the diagonal.
      const wait = gate - Math.max(0, (ql + qw) * 0.71 + 0.3 - JUNCTION);
      if (wait < free) {
        // q is in the junction, or nearer to it on another approach (first come, first served).
        let first: boolean;
        if (q.phase === 1 && q.to === o.to) {
          const qGate = (n.x - q.x) * ux + (n.z - q.z) * uz - ql - Math.abs(q.lane) - JUNCTION;
          first = qGate < gate || (qGate === gate && q.id < o.id);
        } else first = Math.hypot(q.x - n.x, q.z - n.z) - ql < Math.abs(q.lane) + JUNCTION;
        if (first) {
          free = wait;
          // Waiting outside the junction is always safe, so a ring never picks o to drive on.
          clear = -Infinity;
          blocker = q;
          continue;
        }
      }
    }
    const along = dx * cx + dz * cz;
    // Oncoming traffic keeps to its own lane.
    if (along <= 0 || way < -0.8) continue;
    if (md > 1e-3) {
      const k = Math.min(md, q.speed * q.brake * AHEAD) / md;
      mx *= k;
      mz *= k;
    }
    const cos = qx * cx + qz * cz;
    const sin = Math.abs(qx * cz - qz * cx);
    const ac = Math.abs(cos);
    // q's box, measured across and along o's heading, now and on its way; a circle while it swings.
    const ext = hw + (swing ? qr : ql * sin + qw * ac);
    const s0 = dz * cx - dx * cz;
    const s1 = s0 + mz * cx - mx * cz;
    const sweep = (s0 > 0) !== (s1 > 0) ? -ext : Math.min(Math.abs(s0), Math.abs(s1)) - ext;
    if (sweep > SIDE_GAP) continue;
    const f = along - (swing ? qr : ql * ac + qw * sin) - hl - GAP;
    if (f < free) {
      free = f;
      clear = Math.abs(s0) - ext;
      blocker = q;
    }
  }
  o.clear = clear;
  if (blocker) {
    // Vehicles nosing into a junction together can each wait on the next. The one with the most
    // room beside its blocker right now drives on (lowest id on a tie).
    let first = o;
    let p: WObj | null = blocker;
    for (let k = 0; k < RING && p && p !== o; k++) {
      if (p.clear > first.clear || (p.clear === first.clear && p.id < first.id)) first = p;
      p = p.blocker;
    }
    if (p === o && first === o) blocker = null;
  }
  o.blocker = blocker;
  o.brake = blocker ? Math.max(0, free / SLOW) : 1;
}
