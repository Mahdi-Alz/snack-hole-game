import {
  MapBuilder,
  PALETTE,
  areaOf,
  buildRoadGrid,
  center,
  decorateWalks,
  faceDir,
  parkCars,
  parkingRow,
  ringStrips,
  shrink,
  startSnacks,
  subdivide,
  type Area,
  type MapData,
} from './builder';

function plazaPaint(b: MapBuilder, a: Area): void {
  b.rectArea(a, '#e4dfd2');
  const c = center(a);
  b.circle(c.x, c.z, Math.min(a.x1 - a.x0, a.z1 - a.z0) * 0.32, '#d6d0c0');
}

function planters(b: MapBuilder, a: Area, n: number): void {
  b.scatter('tree', shrink(a, 1.5), n, { scale: [0.6, 0.8] });
  b.scatter('flower', shrink(a, 1), Math.ceil(n * 0.8), { tint: () => b.tint(PALETTE.flower) });
  b.scatter('bench', shrink(a, 1.5), Math.ceil(n / 2));
}

function towerBlock(b: MapBuilder, a: Area, type: 'skyscraper' | 'glasstower' | 'megatower'): void {
  plazaPaint(b, a);
  const c = center(a);
  b.put(type, c.x, c.z, b.rng.pick([0, Math.PI / 2]), { force: true, tint: b.tint(PALETTE.building) });
  planters(b, a, 6);
  b.scatter('trash', a, 2);
  b.scatter('kiosk', a, 1);
  for (let i = 0; i < 6; i++) b.wanderer('person', shrink(a, 1), 1.3, { flee: true, tint: b.tint(PALETTE.shirt) });
}

function officeBlock(b: MapBuilder, a: Area): void {
  b.rectArea(a, '#d3cec2');
  for (const lot of subdivide(a, 2, 2)) {
    const c = center(lot);
    const t = b.rng.weighted([
      ['office', 3],
      ['apartment', 3],
      ['shop', 1],
    ] as [string, number][]);
    const dx = c.x < (a.x0 + a.x1) / 2 ? -1 : 1;
    b.put(t, c.x, c.z, faceDir(dx, 0), { force: true, tint: b.tint(t === 'shop' ? PALETTE.house : PALETTE.building), scale: t === 'office' ? b.rng.range(0.85, 1.05) : 1 });
  }
  b.scatter('tree', a, 3, { scale: [0.6, 0.8] });
  b.scatter('trash', a, 2);
  b.scatter('bike', a, 2, { tint: () => b.tint(PALETTE.car) });
}

function plazaBlock(b: MapBuilder, a: Area, hall: boolean): void {
  plazaPaint(b, a);
  const c = center(a);
  if (hall) {
    b.put('townhall', c.x, c.z - 3, faceDir(0, 1), { force: true });
    b.put('statue', c.x, c.z + 11, 0, { force: true });
  } else {
    b.put('fountain', c.x, c.z, 0, { force: true });
    b.put('statue', c.x - 9, c.z - 9, 0.6, { force: true });
    b.put('statue', c.x + 9, c.z + 9, -2.4, { force: true });
  }
  planters(b, a, 8);
  b.scatter('phonebooth', a, 2);
  b.scatter('kiosk', a, 2);
  b.scatter('icecream', a, 1);
  b.scatter('trash', a, 3);
  b.scatter('busstop', a, 1);
  for (let i = 0; i < 14; i++) b.wanderer('person', shrink(a, 1), 1.2, { flee: true, tint: b.tint(PALETTE.shirt) });
  for (let i = 0; i < 2; i++) b.wanderer('dog', shrink(a, 1), 1.7, { flee: true, tint: 0xc98b4f });
}

function cityPark(b: MapBuilder, a: Area): void {
  b.rectArea(a, '#7fcf60');
  const c = center(a);
  b.rect(c.x, c.z, a.x1 - a.x0, 3, '#e8d9b0', 0.6);
  b.rect(c.x, c.z, a.x1 - a.x0, 3, '#e8d9b0', -0.6);
  b.circle(c.x, c.z, 5, '#e8d9b0');
  b.put('fountain', c.x, c.z, 0, { force: true });
  b.scatter(() => (b.rng.chance(0.6) ? 'tree' : 'pine'), shrink(a, 2), 16, { scale: [0.8, 1.3] });
  b.scatter('bush', a, 10);
  b.scatter('bench', a, 6);
  b.scatter('picnic', a, 3);
  b.scatter('flower', a, 6, { tint: () => b.tint(PALETTE.flower) });
  b.scatter('lamp', a, 4);
  for (let i = 0; i < 10; i++) b.wanderer('person', shrink(a, 1), 1.1, { flee: true, tint: b.tint(PALETTE.shirt) });
  for (let i = 0; i < 4; i++) b.wanderer('dog', shrink(a, 1), 1.8, { flee: true, tint: b.rng.pick([0xc98b4f, 0x5b4636, 0xf2efe8]) });
}

function parkingBlock(b: MapBuilder, a: Area): void {
  b.rectArea(a, '#6b7079');
  const rows = 4;
  const rowD = (a.z1 - a.z0) / rows;
  for (let r = 0; r < rows; r++) parkingRow(b, a.x0 + 2, a.x1 - 2, a.z0 + rowD * (r + 0.5), rowD * 0.6, 0.55);
  b.scatter('cone', a, 6);
  b.scatter('barrier', a, 2);
}

export function generateDowntown(seed: number): MapData {
  const size = 250;
  const b = new MapBuilder('downtown', size, seed);
  const rng = b.rng;
  const lines = [-100, -50, 0, 50, 100];
  const grid = buildRoadGrid(b, lines, lines, {
    roadW: 12,
    walkW: 3,
    asphalt: '#555a63',
    walk: '#d1ccbf',
    line: '#f2d24b',
    crosswalk: '#f2f2f2',
  });
  const hw = grid.style.roadW / 2;
  startSnacks(b, hw);

  const kinds: Record<string, string> = {
    '1,1': 'park',
    '2,1': 'mega',
    '1,2': 'hall',
    '2,2': 'plaza',
    '0,0': 'sky',
    '3,3': 'glass',
    '3,0': 'sky',
    '0,3': 'parking',
    '2,0': 'glass',
    '0,2': 'sky',
  };
  for (const blk of grid.blocks) {
    const k = kinds[`${blk.i},${blk.j}`] ?? 'office';
    if (k === 'park') cityPark(b, blk);
    else if (k === 'mega') towerBlock(b, blk, 'megatower');
    else if (k === 'hall') plazaBlock(b, blk, true);
    else if (k === 'plaza') plazaBlock(b, blk, false);
    else if (k === 'sky') towerBlock(b, blk, 'skyscraper');
    else if (k === 'glass') towerBlock(b, blk, 'glasstower');
    else if (k === 'parking') parkingBlock(b, blk);
    else officeBlock(b, blk);
  }

  decorateWalks(b, grid, 5.5, (r) =>
    r.weighted([
      ['lamp', 14],
      ['tree', 8],
      ['hydrant', 6],
      ['trash', 9],
      ['bench', 5],
      ['sign', 3],
      ['flower', 5],
      ['bike', 3],
      ['busstop', 3],
      ['phonebooth', 3],
      ['kiosk', 2],
      ['mailbox', 3],
      ['cone', 3],
      [null, 24],
    ] as [string | null, number][]),
  );
  parkCars(b, grid, 0.55, [
    ['car', 6],
    ['taxi', 3],
    ['van', 2],
    ['truck', 0.6],
  ]);

  const lane = 2.2;
  b.traffic = { graph: grid.graph, lane, speed: 9, types: ['car', 'taxi', 'taxi', 'bus'] };
  for (let i = 0; i < 30; i++) b.graphMover('car', grid.graph, lane, 9, { tint: b.tint(PALETTE.car) });
  for (let i = 0; i < 16; i++) b.graphMover('taxi', grid.graph, lane, 9.5);
  for (let i = 0; i < 5; i++) b.graphMover('bus', grid.graph, lane, 6.5);
  for (let i = 0; i < 4; i++) b.graphMover('truck', grid.graph, lane, 7, { tint: b.tint(PALETTE.car) });
  for (let i = 0; i < 4; i++) b.graphMover('van', grid.graph, lane, 8, { tint: b.tint(PALETTE.car) });
  for (let i = 0; i < 90; i++) b.graphMover('person', grid.graph, rng.sign() * (hw + 1.5), 1.5, { flee: true, tint: b.tint(PALETTE.shirt) });

  // Outer ring of mid-rise buildings and trees.
  const edge = lines[lines.length - 1] + hw + grid.style.walkW + 1;
  for (const s of ringStrips(b, edge)) {
    b.rectArea(s, '#c3beb2');
    const area = areaOf(s);
    b.scatter('apartment', s, Math.floor(area / 500), { tint: () => b.tint(PALETTE.building) });
    b.scatter('shop', s, Math.floor(area / 700), { tint: () => b.tint(PALETTE.house) });
    b.scatter(() => rng.weighted([['tree', 4], ['bush', 3], ['trash', 1], ['lamp', 1], ['bench', 1]] as [string, number][]), s, Math.floor(area / 40), { scale: [0.7, 1.1] });
  }

  return b.build(
    '#bdb9ae',
    '#a9a59a',
    { sky: '#9cc9f0', fog: '#c9dcef', sun: '#fff0d8', hemiSky: '#d6e6ff', hemiGround: '#7a7266', sunIntensity: 2.2 },
    { x: 0, z: 0 },
  );
}
