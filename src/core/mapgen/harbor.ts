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

const WATER_Z = 50;

function containerYard(b: MapBuilder, a: Area): void {
  b.rectArea(a, '#bdb7aa');
  const inner = shrink(a, 3);
  for (let z = inner.z0 + 2; z < inner.z1 - 2; z += 4.2) {
    for (let x = inner.x0 + 4; x < inner.x1 - 4; x += 7) {
      if (b.rng.chance(0.78)) b.put('container', x, z, 0, { force: true, tint: b.tint(PALETTE.container) });
    }
  }
  for (let i = 0; i < 5; i++) b.wanderer('forklift', inner, 2.2);
  for (let i = 0; i < 6; i++) b.wanderer('worker', inner, 1.2, { flee: true });
  b.scatter('cone', a, 8);
}

function warehouses(b: MapBuilder, a: Area): void {
  b.rectArea(a, '#c4beb1');
  const halves = subdivide(a, 1, 2);
  halves.forEach((hf, i) => {
    const c = center(hf);
    b.put('warehouse', c.x, c.z, faceDir(0, i === 0 ? -1 : 1), { force: true, tint: b.tint([0xa9b3bf, 0x8fb3d9, 0xc9a07a, 0x9fc9a0]) });
  });
  b.scatter('crate', a, 18);
  b.scatter('barrel', a, 14, { tint: () => b.tint(PALETTE.container) });
  b.scatter('forklift', a, 2);
  for (let i = 0; i < 6; i++) b.wanderer('worker', shrink(a, 2), 1.2, { flee: true });
}

function fishMarket(b: MapBuilder, a: Area): void {
  b.rectArea(a, '#ddd6c6');
  const c = center(a);
  for (let x = a.x0 + 5; x < a.x1 - 4; x += 5.5) {
    for (const z of [c.z - 9, c.z - 3, c.z + 3, c.z + 9]) b.put('fishstall', x, z, faceDir(0, z < c.z ? 1 : -1), { force: true });
  }
  b.scatter('crate', a, 10);
  b.scatter('barrel', a, 6, { tint: () => b.tint(PALETTE.container) });
  b.scatter('trash', a, 4);
  for (let i = 0; i < 18; i++) b.wanderer('person', shrink(a, 1), 1.1, { flee: true, tint: b.tint(PALETTE.shirt) });
  for (let i = 0; i < 12; i++) b.wanderer('seagull', shrink(a, 1), 1.8, { flee: true });
}

function townBlock(b: MapBuilder, a: Area): void {
  b.rectArea(a, '#cfc9bc');
  const lots = subdivide(a, 2, 2);
  b.put('apartment', center(lots[0]).x, center(lots[0]).z, 0, { force: true, tint: b.tint(PALETTE.building) });
  b.put('shop', center(lots[1]).x, center(lots[1]).z, faceDir(0, -1), { force: true, tint: b.tint(PALETTE.house) });
  b.put('shop', center(lots[2]).x, center(lots[2]).z, faceDir(0, 1), { force: true, tint: b.tint(PALETTE.house) });
  const lot = shrink(lots[3], 1);
  b.rectArea(lot, '#6b7079');
  for (let x = lot.x0 + 2; x < lot.x1 - 1; x += 3) if (b.rng.chance(0.6)) b.put('car', x, (lot.z0 + lot.z1) / 2, Math.PI / 2, { force: true, tint: b.tint(PALETTE.car) });
  b.scatter('palm', a, 4);
  b.scatter('bench', a, 3);
  for (let i = 0; i < 6; i++) b.wanderer('person', shrink(a, 1), 1.2, { flee: true, tint: b.tint(PALETTE.shirt) });
}

export function generateHarbor(seed: number): MapData {
  const size = 280;
  const b = new MapBuilder('harbor', size, seed);
  const rng = b.rng;
  const H = size / 2;

  // Sea first so roads and quay paint on top of it.
  b.rect(0, WATER_Z + 400, 1800, 800, '#4aa0d8');
  b.rect(0, WATER_Z + 2, 1800, 4, '#7cc4ea');

  const xs = [-105, -35, 35, 105];
  const zs = [-105, -35, 26];
  const grid = buildRoadGrid(b, xs, zs, { roadW: 10, walkW: 2.4, asphalt: '#575c64', walk: '#cfc9bb', line: '#f4f0e0' });
  const hw = grid.style.roadW / 2;
  startSnacks(b, hw, -35, -35);

  const kinds = ['yard', 'warehouse', 'yard', 'market', 'town', 'warehouse'];
  grid.blocks.forEach((blk, i) => {
    const k = kinds[i % kinds.length];
    if (k === 'yard') containerYard(b, blk);
    else if (k === 'warehouse') warehouses(b, blk);
    else if (k === 'market') fishMarket(b, blk);
    else townBlock(b, blk);
  });

  // Quay between the waterfront road and the sea.
  const quay: Area = { x0: -H, x1: H, z0: 26 + hw + grid.style.walkW, z1: WATER_Z };
  b.rectArea(quay, '#d2ccbd');
  b.rect(0, WATER_Z - 0.6, size, 1.2, '#f5c542');
  for (let x = -110; x <= 110; x += 44) b.put('crane', x, WATER_Z - 6, 0, { force: true, pad: 0.4 });
  b.scatter('container', quay, 10, { tint: () => b.tint(PALETTE.container) });
  b.scatter('crate', quay, 14);
  b.scatter('barrel', quay, 12, { tint: () => b.tint(PALETTE.container) });
  for (let i = 0; i < 14; i++) b.wanderer('seagull', shrink(quay, 1), 1.8, { flee: true });
  for (let i = 0; i < 10; i++) b.wanderer('worker', shrink(quay, 1), 1.2, { flee: true });

  // Piers with moored boats.
  for (const px of [-110, -75, -40]) {
    b.rect(px, WATER_Z + 18, 5, 36, '#a8743f');
    b.reserveArea({ x0: px - 2.5, x1: px + 2.5, z0: WATER_Z, z1: WATER_Z + 36 });
    for (let z = WATER_Z + 6; z < WATER_Z + 34; z += 8) {
      const t = rng.weighted([
        ['boat', 4],
        ['fishingboat', 2],
      ] as [string, number][]);
      b.put(t, px + rng.sign() * 6, z, rng.chance(0.5) ? 0 : Math.PI, { force: true, tint: b.tint(PALETTE.container) });
    }
    b.put('barrel', px, WATER_Z + 34, 0, { force: true });
  }
  b.put('cargoship', 50, WATER_Z + 14, 0, { force: true, pad: 0.5 });
  b.put('yacht', -10, WATER_Z + 40, 0.3, { force: true });
  b.put('yacht', 110, WATER_Z + 45, 2.8, { force: true });

  // Lighthouse island.
  b.circle(95, 108, 13, '#ead9a6');
  b.circle(95, 108, 9, '#9fcf6a');
  b.put('lighthouse', 95, 108, 0, { force: true });
  b.scatter('rock', { x0: 84, x1: 106, z0: 97, z1: 119 }, 10, { scale: [0.8, 2.2] });
  b.scatter('palm', { x0: 88, x1: 102, z0: 101, z1: 115 }, 3);
  for (let i = 0; i < 6; i++) b.wanderer('seagull', { x0: 86, x1: 104, z0: 99, z1: 117 }, 1.8, { flee: true });

  const sea: Area = { x0: -H + 4, x1: H - 4, z0: WATER_Z + 8, z1: H - 4 };
  b.scatter('buoy', sea, 16);
  for (let i = 0; i < 6; i++) b.wanderer('boat', sea, 3, { tint: b.tint(PALETTE.container) });
  for (let i = 0; i < 3; i++) b.wanderer('fishingboat', sea, 2, { tint: b.tint(PALETTE.container) });

  decorateWalks(b, grid, 6, (r) =>
    r.weighted([
      ['lamp', 10],
      ['palm', 4],
      ['trash', 5],
      ['bench', 3],
      ['hydrant', 4],
      ['crate', 4],
      ['barrel', 4],
      ['cone', 3],
      ['sign', 2],
      [null, 22],
    ] as [string | null, number][]),
  );
  parkCars(b, grid, 0.35, [
    ['car', 4],
    ['van', 2],
    ['truck', 2],
  ]);

  const lane = 1.8;
  b.traffic = { graph: grid.graph, lane, speed: 7, types: ['truck', 'car', 'car', 'van'] };
  for (let i = 0; i < 10; i++) b.graphMover('truck', grid.graph, lane, 6.5, { tint: b.tint(PALETTE.car) });
  for (let i = 0; i < 10; i++) b.graphMover('car', grid.graph, lane, 8, { tint: b.tint(PALETTE.car) });
  for (let i = 0; i < 4; i++) b.graphMover('fueltruck', grid.graph, lane, 6);
  for (let i = 0; i < 30; i++) b.graphMover(rng.chance(0.5) ? 'worker' : 'person', grid.graph, rng.sign() * (hw + 1.2), 1.3, { flee: true, tint: b.tint(PALETTE.shirt) });

  // Land beyond the roads (north and sides): container stacks, scrub and trees.
  // The quay and the sea lie south of the waterfront road (z = 26), so there is no south strip.
  const edge = 105 + hw + grid.style.walkW + 1;
  const [north, , west, east] = ringStrips(b, edge);
  for (const s of [north, { ...west, z1: 26 }, { ...east, z1: 26 }]) {
    const area = areaOf(s);
    b.scatter('container', s, Math.floor(area / 180), { tint: () => b.tint(PALETTE.container) });
    b.scatter(() => rng.weighted([['palm', 3], ['bush', 3], ['crate', 2], ['barrel', 2], ['rock', 1]] as [string, number][]), s, Math.floor(area / 35), { scale: [0.8, 1.2] });
  }

  return b.build(
    '#c7c1b4',
    '#b5ae9f',
    { sky: '#9fd3f5', fog: '#cfe9f7', sun: '#fff1dc', hemiSky: '#d9efff', hemiGround: '#6f7a80', sunIntensity: 2.2 },
    { x: -35, z: -35 },
  );
}
