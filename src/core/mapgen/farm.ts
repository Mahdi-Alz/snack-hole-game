import {
  MapBuilder,
  PALETTE,
  buildRoadGrid,
  center,
  decorateWalks,
  faceDir,
  fenceRect,
  fieldPaint,
  natureRing,
  ringPoints,
  shrink,
  subdivide,
  type Area,
  type MapData,
} from './builder';

function farmstead(b: MapBuilder, a: Area): void {
  const rng = b.rng;
  b.rectArea(a, '#9fd46e');
  const c = center(a);
  // Gravel yard in the middle.
  const yard = { x0: c.x - 22, x1: c.x + 22, z0: c.z - 16, z1: c.z + 16 };
  b.rectArea(yard, '#d9c79a');
  b.put('farmhouse', c.x - 28, c.z - 24, faceDir(1, 0), { force: true });
  b.put('barn', c.x + 26, c.z - 22, faceDir(-1, 0), { force: true });
  b.put('silo', c.x + 38, c.z - 6, 0, { force: true });
  b.put('silo', c.x + 38, c.z + 2, 0, { force: true, scale: 0.85 });
  b.put('watertower', c.x - 36, c.z + 6, 0, { force: true });
  b.put('greenhouse', c.x - 24, c.z + 28, 0, { force: true });
  b.put('greenhouse', c.x - 10, c.z + 28, 0, { force: true });
  b.put('shed', c.x + 6, c.z - 28, faceDir(0, 1), { force: true });
  b.put('tractor', c.x + 12, c.z - 10, 0.4, { force: true, tint: 0xffffff });
  b.put('truck', c.x - 12, c.z - 6, 1.2, { force: true, tint: b.tint(PALETTE.car) });
  b.scatter('haybale', yard, 8);
  b.scatter('crate', yard, 4);
  b.scatter('barrel', yard, 4, { tint: () => b.tint(PALETTE.container) });
  // Chicken run.
  const run = { x0: c.x + 8, x1: c.x + 30, z0: c.z + 14, z1: c.z + 34 };
  b.rectArea(run, '#c8b98a');
  fenceRect(b, run);
  for (let i = 0; i < 26; i++) b.wanderer('chicken', shrink(run, 1), 0.9, { flee: true });
  b.scatter('pumpkin', shrink(a, 2), 10);
  b.scatter('tree', shrink(a, 2), 10, { scale: [0.8, 1.3] });
  b.scatter('bush', shrink(a, 2), 10);
  for (let i = 0; i < 5; i++) b.wanderer('person', yard, 1.1, { flee: true, tint: b.tint(PALETTE.shirt) });
  for (let i = 0; i < 2; i++) b.wanderer('dog', shrink(a, 4), 1.8, { flee: true, tint: rng.pick([0xc98b4f, 0x2e2a28]) });
}

function crops(b: MapBuilder, a: Area): void {
  const parts = subdivide(a, 2, 2).map((p) => shrink(p, 2));
  // Corn field
  fieldPaint(b, parts[0], ['#a3c464', '#8fb052']);
  for (let x = parts[0].x0 + 2; x < parts[0].x1 - 1; x += 3.4) for (let z = parts[0].z0 + 2; z < parts[0].z1 - 1; z += 3.4) b.put('corn', x, z, b.rng.range(0, 6), { force: true });
  b.put('scarecrow', center(parts[0]).x, center(parts[0]).z, 0, { force: true, tint: 0x3b82f6 });
  // Pumpkin patch
  fieldPaint(b, parts[1], ['#8b6b45', '#7a5c3a'], 2.0, true);
  for (let x = parts[1].x0 + 1.5; x < parts[1].x1 - 1; x += 2.6) for (let z = parts[1].z0 + 1.5; z < parts[1].z1 - 1; z += 2.6) if (b.rng.chance(0.6)) b.put('pumpkin', x, z, b.rng.range(0, 6), { force: true, scale: b.rng.range(0.8, 1.5) });
  b.put('scarecrow', center(parts[1]).x, center(parts[1]).z, 0.8, { force: true, tint: 0xe84a4a });
  // Wheat with hay bales
  fieldPaint(b, parts[2], ['#e8cf6a', '#d9bb52']);
  b.scatter('haybale', parts[2], 18);
  b.put('tractor', center(parts[2]).x, center(parts[2]).z, 0, { force: true });
  // Vegetables + greenhouse row
  fieldPaint(b, parts[3], ['#7fbf5a', '#6aa848', '#8b6b45'], 1.8, true);
  b.put('greenhouse', center(parts[3]).x, parts[3].z0 + 5, 0, { force: true });
  b.put('greenhouse', center(parts[3]).x, parts[3].z1 - 5, 0, { force: true });
  b.scatter('scarecrow', parts[3], 2, { tint: () => b.tint(PALETTE.shirt) });
  for (let i = 0; i < 4; i++) b.wanderer('person', shrink(a, 3), 1.0, { flee: true, tint: b.tint(PALETTE.shirt) });
}

function pasture(b: MapBuilder, a: Area): void {
  b.rectArea(a, '#8fd067');
  const c = center(a);
  const pen = shrink(a, 4);
  fenceRect(b, pen);
  // Pond with trees
  b.circle(c.x + 18, c.z + 18, 10, '#e9d9a8');
  b.circle(c.x + 18, c.z + 18, 9, '#5cb8e6');
  b.blockCircle(c.x + 18, c.z + 18, 10);
  b.put('windmill', c.x - 30, c.z - 30, 0.4, { force: true });
  b.scatter('tree', pen, 8, { scale: [0.9, 1.3] });
  b.scatter('haybale', pen, 10);
  b.scatter('rock', pen, 6, { scale: [0.8, 1.6] });
  const inner = shrink(pen, 2);
  for (let i = 0; i < 18; i++) b.wanderer('cow', inner, 0.6);
  for (let i = 0; i < 26; i++) b.wanderer('sheep', inner, 0.7, { flee: true });
  for (let i = 0; i < 8; i++) b.wanderer('horse', inner, 1.0);
}

function orchard(b: MapBuilder, a: Area): void {
  b.rectArea(a, '#98d36c');
  const halves = subdivide(a, 2, 1);
  const o = shrink(halves[0], 3);
  for (let x = o.x0 + 2; x < o.x1; x += 6) for (let z = o.z0 + 2; z < o.z1; z += 6) b.put('tree', x + b.rng.range(-0.5, 0.5), z + b.rng.range(-0.5, 0.5), b.rng.range(0, 6), { force: true, scale: b.rng.range(0.7, 0.95) });
  const h = halves[1];
  const c = center(h);
  b.put('farmhouse', c.x, h.z0 + 12, faceDir(0, -1), { force: true, scale: 0.9 });
  b.put('barn', c.x + 8, h.z1 - 14, faceDir(0, -1), { force: true, scale: 0.85 });
  b.put('windmill', h.x1 - 8, h.z0 + 8, 0, { force: true });
  b.put('silo', h.x0 + 6, h.z1 - 8, 0, { force: true });
  const sty = { x0: c.x - 18, x1: c.x + 2, z0: c.z - 8, z1: c.z + 8 };
  b.rectArea(sty, '#a57b52');
  fenceRect(b, sty);
  for (let i = 0; i < 14; i++) b.wanderer('pig', shrink(sty, 1), 0.7, { flee: true });
  b.scatter('haybale', h, 6);
  b.scatter('pumpkin', h, 8);
  for (let i = 0; i < 10; i++) b.wanderer('chicken', shrink(h, 3), 0.9, { flee: true });
}

export function generateFarm(seed: number): MapData {
  const size = 280;
  const b = new MapBuilder('farm', size, seed);
  const rng = b.rng;
  const lines = [-110, 0, 110];
  const grid = buildRoadGrid(b, lines, lines, {
    roadW: 7,
    walkW: 1.4,
    asphalt: '#b8925f',
    walk: '#a8c76a',
  });
  const hw = grid.style.roadW / 2;

  // Start: a chicken party at the crossroads.
  for (const p of ringPoints(12, 0, 0, 3.5)) b.put('pumpkin', p.x, p.z, p.ang, { force: true });
  for (let i = 0; i < 14; i++) b.wanderer('chicken', { x0: -8, x1: 8, z0: -8, z1: 8 }, 0.8, { flee: true });
  b.put('haybale', -6, -6, 0, { force: true });
  b.put('haybale', 6, 6, 0, { force: true });

  const kinds = ['farmstead', 'crops', 'pasture', 'orchard'];
  grid.blocks.forEach((blk, i) => {
    const k = kinds[i % kinds.length];
    if (k === 'farmstead') farmstead(b, blk);
    else if (k === 'crops') crops(b, blk);
    else if (k === 'pasture') pasture(b, blk);
    else orchard(b, blk);
  });

  decorateWalks(b, grid, 7, (r) =>
    r.weighted([
      ['fence', 10],
      ['tree', 6],
      ['haybale', 3],
      ['mailbox', 1],
      ['pumpkin', 3],
      ['bush', 4],
      ['scarecrow', 1],
      [null, 20],
    ] as [string | null, number][]),
    0.3,
  );

  const lane = 1.6;
  b.traffic = { graph: grid.graph, lane, speed: 6, types: ['tractor', 'tractor', 'truck', 'car'] };
  for (let i = 0; i < 6; i++) b.graphMover('tractor', grid.graph, lane, 4);
  for (let i = 0; i < 3; i++) b.graphMover('truck', grid.graph, lane, 6, { tint: b.tint(PALETTE.car) });
  for (let i = 0; i < 4; i++) b.graphMover('car', grid.graph, lane, 7, { tint: b.tint(PALETTE.car) });
  for (let i = 0; i < 2; i++) b.graphMover('van', grid.graph, lane, 6, { tint: b.tint(PALETTE.car) });
  for (let i = 0; i < 16; i++) b.graphMover('person', grid.graph, rng.sign() * (hw + 0.7), 1.2, { flee: true, tint: b.tint(PALETTE.shirt) });
  for (let i = 0; i < 6; i++) b.graphMover('dog', grid.graph, rng.sign() * (hw + 0.7), 1.8, { flee: true, tint: 0xc98b4f });
  b.herd = [
    ['cow', 4],
    ['sheep', 4],
    ['pig', 2],
    ['horse', 2],
  ];

  natureRing(b, lines[2] + hw + grid.style.walkW + 1, [
    ['tree', 4],
    ['pine', 4],
    ['bush', 3],
    ['rock', 2],
    ['haybale', 1],
  ], 24);

  return b.build(
    '#9cd46c',
    '#86c25a',
    { sky: '#aee0ff', fog: '#d8f0ff', sun: '#fff4d6', hemiSky: '#dff2ff', hemiGround: '#8a7a4a', sunIntensity: 2.3 },
    { x: 0, z: 0 },
  );
}
