import {
  MapBuilder,
  PALETTE,
  areaOf,
  buildRoadGrid,
  center,
  decorateWalks,
  faceDir,
  parkCars,
  ringStrips,
  shrink,
  startSnacks,
  subdivide,
  type Area,
  type MapData,
} from './builder';

const DIRS = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] } as const;
type Side = keyof typeof DIRS;

const LAWNS = ['#8ed36b', '#93d870', '#89cf66', '#97da74'];

function residential(b: MapBuilder, a: Area): void {
  const rng = b.rng;
  subdivide(a, 2, 2).forEach((lot, k) => {
    b.rectArea(shrink(lot, 0.3), rng.pick(LAWNS));
    const ix = k % 2;
    const iz = Math.floor(k / 2);
    const side: Side = rng.pick([ix === 0 ? 'W' : 'E', iz === 0 ? 'N' : 'S'] as Side[]);
    const [dx, dz] = DIRS[side];
    const c = center(lot);
    const big = rng.chance(0.45);
    const type = big ? 'house2' : 'house';
    const depth = big ? 8 : 7; // extent along facing axis
    const setback = rng.range(3.2, 4.2);
    const horizFacing = dz !== 0;
    const lateral = rng.range(-1.4, 1.4);
    let hx: number;
    let hz: number;
    if (horizFacing) {
      hx = c.x + lateral;
      hz = dz < 0 ? lot.z0 + setback + depth / 2 : lot.z1 - setback - depth / 2;
    } else {
      hz = c.z + lateral;
      hx = dx < 0 ? lot.x0 + setback + depth / 2 : lot.x1 - setback - depth / 2;
    }
    const rot = faceDir(dx, dz);
    // Driveway beside the house, running to the sidewalk.
    const side2 = rng.sign();
    const lat = (big ? 3.5 : 3.25) + 2.0;
    const dwLen = setback + depth * 0.6;
    if (horizFacing) {
      const x = hx + side2 * lat;
      const z0 = dz < 0 ? lot.z0 : lot.z1 - dwLen;
      b.rect(x, z0 + dwLen / 2, 3.0, dwLen, '#c9c4b8');
    } else {
      const z = hz + side2 * lat;
      const x0 = dx < 0 ? lot.x0 : lot.x1 - dwLen;
      b.rect(x0 + dwLen / 2, z, dwLen, 3.0, '#c9c4b8');
    }
    b.put(type, hx, hz, rot, { tint: b.tint(PALETTE.house), force: true });
    // Car in the driveway, mailbox by the sidewalk.
    const edgeX = horizFacing ? hx + side2 * lat : dx < 0 ? lot.x0 + 1.2 : lot.x1 - 1.2;
    const edgeZ = horizFacing ? (dz < 0 ? lot.z0 + 1.2 : lot.z1 - 1.2) : hz + side2 * lat;
    if (rng.chance(0.6)) {
      const cx = horizFacing ? edgeX : edgeX - dx * 3.4;
      const cz = horizFacing ? edgeZ - dz * 3.4 : edgeZ;
      b.put(rng.chance(0.8) ? 'car' : 'van', cx, cz, rot + (rng.chance(0.5) ? Math.PI : 0), {
        tint: b.tint(PALETTE.car),
        force: true,
      });
    }
    const mx = horizFacing ? edgeX - side2 * 2.1 : edgeX;
    const mz = horizFacing ? edgeZ : edgeZ - side2 * 2.1;
    b.put('mailbox', mx, mz, rot, { force: true });

    const yard = shrink(lot, 1.2);
    b.scatter('tree', yard, rng.int(1, 2), { scale: [0.75, 1.15] });
    b.scatter('bush', yard, rng.int(2, 4), { scale: [0.8, 1.3] });
    b.scatter('flower', yard, rng.int(1, 3), { tint: () => b.tint(PALETTE.flower) });
    if (rng.chance(0.35)) b.scatter('gnome', yard, rng.int(1, 2));
    if (rng.chance(0.35)) b.scatter('shed', yard, 1);
    if (rng.chance(0.18)) b.scatter('swing', yard, 1);
    if (rng.chance(0.2)) b.scatter('picnic', yard, 1);
    if (rng.chance(0.15)) b.scatter('trash', yard, 1);
    if (rng.chance(0.3)) b.wanderer('dog', yard, 1.6, { flee: true, tint: 0xc98b4f });
  });
}

function park(b: MapBuilder, a: Area): void {
  const rng = b.rng;
  b.rectArea(a, '#7fd05e');
  const c = center(a);
  const w = a.x1 - a.x0;
  const d = a.z1 - a.z0;
  b.rect(c.x, c.z, w, 2.6, '#e8d9b0');
  b.rect(c.x, c.z, 2.6, d, '#e8d9b0');
  b.circle(c.x, c.z, 4.6, '#e8d9b0');
  b.reserveArea({ x0: a.x0, x1: a.x1, z0: c.z - 1.3, z1: c.z + 1.3 });
  b.reserveArea({ x0: c.x - 1.3, x1: c.x + 1.3, z0: a.z0, z1: a.z1 });
  b.put('fountain', c.x, c.z, 0, { force: true });
  const quads = subdivide(a, 2, 2).map((q) => shrink(q, 1.8));
  const order = rng.shuffle([0, 1, 2, 3]);
  // Pond
  const pq = quads[order[0]];
  const pc = center(pq);
  b.circle(pc.x, pc.z, 6.2, '#f0e1b5');
  b.circle(pc.x, pc.z, 5.4, '#5cb8e6');
  b.circle(pc.x, pc.z, 3.2, '#4aa6d8');
  b.blockCircle(pc.x, pc.z, 6.2);
  b.scatter('bush', pq, 4);
  b.scatter('rock', pq, 3, { scale: [0.7, 1.4] });
  // Playground
  const gq = quads[order[1]];
  b.rectArea(shrink(gq, 0.5), '#f2dfa7');
  b.scatter('swing', gq, 1);
  b.scatter('slide', gq, 2);
  b.scatter('bench', gq, 2);
  // Picnic lawn
  const lq = quads[order[2]];
  b.scatter('picnic', lq, 3);
  b.scatter('tree', lq, 3, { scale: [0.9, 1.25] });
  b.scatter('statue', lq, 1);
  // Woodland
  const wq = quads[order[3]];
  b.scatter(() => (rng.chance(0.5) ? 'tree' : 'pine'), wq, 7, { scale: [0.8, 1.3] });
  b.scatter('bush', wq, 5);
  for (const q of quads) {
    b.scatter('flower', q, 2, { tint: () => b.tint(PALETTE.flower) });
    b.scatter('trash', q, 1);
    b.scatter('lamp', q, 1);
  }
  // Benches along the paths.
  for (let k = -2; k <= 2; k++) {
    if (k === 0) continue;
    const t = k * (w / 6);
    b.put('bench', c.x + t, c.z - 2.4, Math.PI / 2, { force: true });
    b.put('bench', c.x + 2.4, c.z + t, 0, { force: true });
  }
  for (let i = 0; i < 9; i++) b.wanderer('person', shrink(a, 1), 1.2, { flee: true, tint: b.tint(PALETTE.shirt) });
  for (let i = 0; i < 3; i++) b.wanderer('dog', shrink(a, 1), 1.8, { flee: true, tint: rng.pick([0xc98b4f, 0x5b4636, 0xf2efe8]) });
}

function shops(b: MapBuilder, a: Area): void {
  const rng = b.rng;
  b.rectArea(a, '#d8d2c4');
  const halves = subdivide(a, 1, 2);
  const front = rng.chance(0.5) ? halves[0] : halves[1];
  const back = front === halves[0] ? halves[1] : halves[0];
  const facingNorth = front === halves[0];
  // Row of shops facing the road.
  const n = 3;
  const w = (front.x1 - front.x0) / n;
  for (let i = 0; i < n; i++) {
    const x = front.x0 + w * (i + 0.5);
    const z = facingNorth ? front.z0 + 4.5 : front.z1 - 4.5;
    if (i === 1 && rng.chance(0.6)) {
      b.put('gasstation', x, (front.z0 + front.z1) / 2, faceDir(0, facingNorth ? -1 : 1), { force: true });
    } else {
      b.put('shop', x, z, faceDir(0, facingNorth ? -1 : 1), { tint: b.tint(PALETTE.house), force: true });
    }
  }
  // Parking lot.
  const lot = shrink(back, 1);
  b.rectArea(lot, '#6b7079');
  const rows = 6;
  const sw = (lot.x1 - lot.x0) / rows;
  for (let i = 0; i <= rows; i++) b.rect(lot.x0 + i * sw, (lot.z0 + lot.z1) / 2, 0.18, (lot.z1 - lot.z0) * 0.7, '#f4f4f4');
  for (let i = 0; i < rows; i++) {
    if (!rng.chance(0.7)) continue;
    b.put(rng.chance(0.85) ? 'car' : 'van', lot.x0 + sw * (i + 0.5), (lot.z0 + lot.z1) / 2, Math.PI / 2 + (rng.chance(0.5) ? Math.PI : 0), {
      tint: b.tint(PALETTE.car),
      force: true,
    });
  }
  b.scatter('trash', a, 3);
  b.scatter('bike', a, 4, { tint: () => b.tint(PALETTE.car) });
  b.scatter('bench', a, 2);
  b.scatter('kiosk', a, 1);
  b.scatter('icecream', a, 1, { tint: () => 0xffffff });
  b.scatter('cone', a, 4);
  for (let i = 0; i < 5; i++) b.wanderer('person', a, 1.2, { flee: true, tint: b.tint(PALETTE.shirt) });
}

export function generateSuburb(seed: number): MapData {
  const size = 230;
  const b = new MapBuilder('suburb', size, seed);
  const rng = b.rng;
  const lines = [-92, -46, 0, 46, 92];
  const grid = buildRoadGrid(b, lines, lines, {
    roadW: 10,
    walkW: 2.4,
    asphalt: '#5d626b',
    walk: '#dcd6c8',
    line: '#f6f1dc',
    crosswalk: '#f2f2f2',
  });
  const hw = grid.style.roadW / 2;

  startSnacks(b, hw);

  const special: Record<string, 'park' | 'shops'> = { '1,1': 'park', '3,2': 'park', '2,1': 'shops', '0,3': 'shops', '2,3': 'park' };
  for (const blk of grid.blocks) {
    const kind = special[`${blk.i},${blk.j}`];
    if (kind === 'park') park(b, blk);
    else if (kind === 'shops') shops(b, blk);
    else residential(b, blk);
  }

  decorateWalks(b, grid, 6.5, (r) =>
    r.weighted([
      ['lamp', 14],
      ['tree', 12],
      ['hydrant', 6],
      ['trash', 7],
      ['bench', 5],
      ['mailbox', 3],
      ['sign', 3],
      ['flower', 6],
      ['bike', 3],
      ['busstop', 2],
      ['cone', 4],
      ['phonebooth', 1],
      [null, 30],
    ] as [string | null, number][]),
  );
  parkCars(b, grid, 0.45, [
    ['car', 8],
    ['van', 2],
    ['truck', 0.5],
  ]);

  // Construction zones with cones on the curb.
  for (let k = 0; k < 6; k++) {
    const s = rng.pick(grid.segments);
    const horiz = s.z0 === s.z1;
    const t = rng.range(0.3, 0.7);
    const bx = s.x0 + (s.x1 - s.x0) * t;
    const bz = s.z0 + (s.z1 - s.z0) * t;
    const side = rng.sign() * (hw - 1);
    for (let c = -3; c <= 3; c++) {
      b.put(c % 3 === 0 ? 'barrier' : 'cone', horiz ? bx + c * 1.6 : bx + side, horiz ? bz + side : bz + c * 1.6, horiz ? 0 : Math.PI / 2, {
        force: true,
      });
    }
  }

  // Traffic.
  const lane = grid.style.roadW * 0.18;
  b.traffic = { graph: grid.graph, lane, speed: 8, types: ['car', 'car', 'car', 'van'] };
  for (let i = 0; i < 22; i++) b.graphMover('car', grid.graph, lane, 8, { tint: b.tint(PALETTE.car) });
  for (let i = 0; i < 3; i++) b.graphMover('van', grid.graph, lane, 7, { tint: b.tint(PALETTE.car) });
  b.graphMover('icecream', grid.graph, lane, 5);
  b.graphMover('schoolbus', grid.graph, lane, 6);
  b.graphMover('bus', grid.graph, lane, 6);
  b.graphMover('truck', grid.graph, lane, 6, { tint: b.tint(PALETTE.car) });
  for (let i = 0; i < 55; i++) {
    b.graphMover('person', grid.graph, rng.sign() * (hw + 1.2), 1.4, { flee: true, tint: b.tint(PALETTE.shirt) });
  }

  // Woodland ring outside the road grid.
  const edge = lines[lines.length - 1] + hw + grid.style.walkW + 1;
  for (const s of ringStrips(b, edge)) {
    const area = areaOf(s);
    b.scatter(() => rng.weighted([['tree', 4], ['pine', 5], ['bush', 3], ['rock', 2]] as [string, number][]), s, Math.floor(area / 22), {
      scale: [0.7, 1.4],
    });
    b.scatter('flower', s, Math.floor(area / 400), { tint: () => b.tint(PALETTE.flower) });
  }

  return b.build(
    '#8ed36b',
    '#78bf58',
    {
      sky: '#a8dcff',
      fog: '#cfeaff',
      sun: '#fff2d9',
      hemiSky: '#cfe9ff',
      hemiGround: '#8a7a5a',
      sunIntensity: 2.2,
    },
    { x: 0, z: 0 },
  );
}
