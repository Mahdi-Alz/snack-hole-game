import {
  MapBuilder,
  PALETTE,
  buildRoadGrid,
  center,
  decorateWalks,
  faceDir,
  parkCars,
  parkingRow,
  ringPoints,
  shrink,
  type Area,
  type MapData,
} from './builder';

const RUNWAY_Z = -118;
const TAXI_Z = -84;

export function generateAirport(seed: number): MapData {
  const size = 320;
  const b = new MapBuilder('airport', size, seed);
  const rng = b.rng;

  // ---------------------------------------------------------------- airside paint
  b.rect(0, RUNWAY_Z, 290, 28, '#4b4f57');
  b.rect(0, RUNWAY_Z - 12.5, 286, 0.6, '#f4f4f4');
  b.rect(0, RUNWAY_Z + 12.5, 286, 0.6, '#f4f4f4');
  for (let x = -130; x <= 130; x += 10) b.rect(x, RUNWAY_Z, 5, 0.7, '#f4f4f4');
  for (const end of [-1, 1]) {
    for (let k = -4; k <= 4; k++) b.rect(end * 136, RUNWAY_Z + k * 2.6, 8, 1.2, '#f4f4f4');
  }
  b.rect(0, TAXI_Z, 270, 14, '#60646c');
  b.rect(0, TAXI_Z, 266, 0.4, '#f5c542');
  for (const x of [-132, 132]) {
    b.rect(x, (RUNWAY_Z + TAXI_Z) / 2, 14, TAXI_Z - RUNWAY_Z, '#60646c');
    b.rect(x, (RUNWAY_Z + TAXI_Z) / 2, 0.4, TAXI_Z - RUNWAY_Z, '#f5c542');
  }
  const apron: Area = { x0: -125, x1: 125, z0: TAXI_Z + 7, z1: 14 };
  b.rectArea(apron, '#bfc3c8');
  for (let x = -100; x <= 100; x += 40) b.rect(x, -20, 0.4, 60, '#f5c542');
  b.reserveArea({ x0: -145, x1: 145, z0: RUNWAY_Z - 14, z1: TAXI_Z + 7 });

  // Runway lights and windsocks.
  for (let x = -138; x <= 138; x += 10) {
    b.put('runwaylight', x, RUNWAY_Z - 14.2, 0, { force: true });
    b.put('runwaylight', x, RUNWAY_Z + 14.2, 0, { force: true });
  }
  for (let x = -126; x <= 126; x += 14) {
    b.put('runwaylight', x, TAXI_Z - 7.6, 0, { force: true, tint: 0x3b82f6 });
    b.put('runwaylight', x, TAXI_Z + 7.6, 0, { force: true, tint: 0x3b82f6 });
  }
  b.put('windsock', -100, RUNWAY_Z - 20, 0, { force: true });
  b.put('windsock', 100, RUNWAY_Z - 20, Math.PI, { force: true });

  // Taxi loop for moving planes.
  const loop = b.addGraph(
    [
      { x: -132, z: RUNWAY_Z },
      { x: 132, z: RUNWAY_Z },
      { x: 132, z: TAXI_Z },
      { x: -132, z: TAXI_Z },
    ],
    [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ],
  );
  b.graphMover('jet', loop, 0, 10, { tint: 0x3b82f6 });
  b.graphMover('smallplane', loop, 0, 9, { tint: 0xe84a4a });
  b.graphMover('smallplane', loop, 0, 9, { tint: 0x38c172 });
  b.graphMover('jumbo', loop, 0, 8, { tint: 0xe84a4a });

  // ---------------------------------------------------------------- terminal & gates
  b.put('terminal', 0, 34, Math.PI, { force: true });
  const liveries = [0x3b82f6, 0xe84a4a, 0x38c172, 0x9b5de5, 0xf08a24];
  for (const x of [-40, 0, 40]) {
    b.put('jet', x, 2, faceDir(0, 1), { force: true, tint: b.tint(liveries), pad: 0.6 });
    b.put('stairtruck', x + 7, -4, faceDir(0, 1), { force: true });
    for (let k = 0; k < 4; k++) b.put('cone', x - 8 + k * 5, -14, 0, { force: true });
    b.put('luggagecart', x - 9, 4, 0, { force: true });
  }
  b.put('jumbo', -88, -38, faceDir(1, 0), { force: true, tint: b.tint(liveries), pad: 0.6 });
  b.put('jet', 85, -40, faceDir(-1, 0), { force: true, tint: b.tint(liveries), pad: 0.6 });
  b.put('hangar', -100, 40, faceDir(0, -1), { force: true });
  b.put('hangar', 100, 40, faceDir(0, -1), { force: true });
  for (const [x, z] of [
    [-100, 20],
    [-120, 22],
    [100, 20],
    [120, 22],
  ]) {
    b.put('smallplane', x, z, faceDir(0, -1), { force: true, tint: b.tint(liveries) });
  }
  b.put('controltower', 140, 62, 0, { force: true });
  b.put('radar', -142, 62, 0, { force: true });
  b.put('radar', 142, -60, 0, { force: true });

  const apronInner = shrink(apron, 4);
  for (let i = 0; i < 10; i++) b.wanderer('luggagecart', apronInner, 3);
  for (let i = 0; i < 5; i++) b.wanderer('fueltruck', apronInner, 3.5);
  for (let i = 0; i < 3; i++) b.wanderer('bus', apronInner, 4);
  for (let i = 0; i < 40; i++) b.wanderer('worker', apronInner, 1.3, { flee: true });
  for (let i = 0; i < 24; i++) b.wanderer('pilot', apronInner, 1.2, { flee: true });
  // Apron markings: stand boxes, hatched no-park zones and lead-in lines.
  for (let x = -110; x <= 110; x += 20) {
    b.rect(x, -60, 14, 0.4, '#f5c542');
    b.rect(x - 7, -55, 0.4, 10, '#f5c542');
    b.rect(x + 7, -55, 0.4, 10, '#f5c542');
  }
  for (let x = -112; x <= 112; x += 8) b.rect(x, -30, 4, 2.4, '#e9ecef', 0.5);
  b.scatter('cone', apronInner, 110);
  b.scatter('suitcase', apronInner, 120, { tint: () => b.tint(PALETTE.container) });
  b.scatter('barrier', apronInner, 14);
  b.scatter('luggagecart', apronInner, 16);
  b.scatter('runwaylight', apronInner, 40, { tint: () => b.tint([0x3b82f6, 0x38c172, 0xf5c542]) });
  b.scatter('barrel', apronInner, 20, { tint: () => b.tint(PALETTE.container) });
  b.scatter('crate', apronInner, 16);
  b.scatter('stairtruck', apronInner, 4);
  b.scatter('fueltruck', apronInner, 3);
  // Snacks around the start point.
  for (const p of ringPoints(12, 0, -24, 3.4)) b.put(p.k % 2 ? 'suitcase' : 'cone', p.x, p.z, p.ang, { force: true, tint: b.tint(PALETTE.container) });
  for (let i = 0; i < 6; i++) b.wanderer('pilot', { x0: -8, x1: 8, z0: -32, z1: -16 }, 1.1, { flee: true });

  // ---------------------------------------------------------------- landside
  const xs = [-120, -40, 40, 120];
  const zs = [62, 112, 150];
  const grid = buildRoadGrid(b, xs, zs, { roadW: 10, walkW: 2.4, asphalt: '#5a5f68', walk: '#d3cec2', line: '#f4f0e0', crosswalk: '#f2f2f2' });
  const hw = grid.style.roadW / 2;
  // Terminal forecourt with travellers.
  const forecourt: Area = { x0: -30, x1: 30, z0: 46, z1: 62 - hw - 2.4 };
  b.rectArea(forecourt, '#e2ddd1');
  for (let i = 0; i < 24; i++) b.wanderer('person', forecourt, 1.2, { flee: true, tint: b.tint(PALETTE.shirt) });
  b.scatter('suitcase', forecourt, 20, { tint: () => b.tint(PALETTE.container) });
  b.scatter('bench', forecourt, 4);
  b.scatter('trash', forecourt, 3);

  grid.blocks.forEach((blk, i) => {
    const c = center(blk);
    if (i % 3 === 1) {
      b.rectArea(blk, '#d2ccbf');
      b.put('apartment', c.x - 10, c.z, faceDir(0, -1), { force: true, tint: b.tint(PALETTE.building), scale: 1.1 });
      b.put('shop', c.x + 14, c.z - 4, faceDir(0, -1), { force: true, tint: b.tint(PALETTE.house) });
      b.scatter('tree', blk, 5, { scale: [0.7, 1] });
      b.scatter('palm', blk, 3);
    } else {
      const lot = shrink(blk, 1);
      b.rectArea(lot, '#6b7079');
      for (let z = lot.z0 + 4; z < lot.z1 - 2; z += 9) parkingRow(b, lot.x0 + 2, lot.x1 - 1, z, 5, 0.62);
    }
  });
  decorateWalks(b, grid, 6, (r) =>
    r.weighted([
      ['lamp', 10],
      ['palm', 5],
      ['trash', 4],
      ['bench', 3],
      ['busstop', 2],
      ['sign', 2],
      ['hydrant', 3],
      [null, 20],
    ] as [string | null, number][]),
  );
  parkCars(b, grid, 0.3, [
    ['taxi', 4],
    ['car', 3],
  ]);
  const lane = 1.8;
  b.traffic = { graph: grid.graph, lane, speed: 9, types: ['taxi', 'taxi', 'car', 'bus'] };
  for (let i = 0; i < 12; i++) b.graphMover('taxi', grid.graph, lane, 9);
  for (let i = 0; i < 10; i++) b.graphMover('car', grid.graph, lane, 9, { tint: b.tint(PALETTE.car) });
  for (let i = 0; i < 4; i++) b.graphMover('bus', grid.graph, lane, 6.5);
  for (let i = 0; i < 26; i++) b.graphMover('person', grid.graph, rng.sign() * (hw + 1.2), 1.4, { flee: true, tint: b.tint(PALETTE.shirt) });

  // Grass strips between runway, apron and edges.
  const grass: Area[] = [
    { x0: -159, x1: 159, z0: -159, z1: RUNWAY_Z - 16 },
    { x0: -159, x1: -146, z0: RUNWAY_Z - 16, z1: 50 },
    { x0: 146, x1: 159, z0: RUNWAY_Z - 16, z1: 50 },
  ];
  for (const g of grass) {
    b.rectArea(g, '#8fcb63');
    const area = (g.x1 - g.x0) * (g.z1 - g.z0);
    b.scatter(() => rng.weighted([['bush', 3], ['tree', 2], ['rock', 1]] as [string, number][]), g, Math.floor(area / 60), { scale: [0.7, 1.2] });
  }

  return b.build(
    '#9fd06e',
    '#8cc15e',
    { sky: '#a6d6fb', fog: '#d4ebfb', sun: '#fff3e0', hemiSky: '#ddefff', hemiGround: '#7d7a6a', sunIntensity: 2.3 },
    { x: 0, z: -24 },
  );
}
