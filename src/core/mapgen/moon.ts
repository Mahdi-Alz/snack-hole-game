import { MapBuilder, faceDir, shrink, type Area, type MapData } from './builder';

export function generateMoon(seed: number): MapData {
  const size = 300;
  const b = new MapBuilder('moon', size, seed);
  const rng = b.rng;
  const H = size / 2 - 2;

  // Craters (painted) — big ones first.
  for (let i = 0; i < 46; i++) {
    const r = i < 8 ? rng.range(14, 26) : rng.range(3, 10);
    const x = rng.range(-H + r, H - r);
    const z = rng.range(-H + r, H - r);
    if (Math.hypot(x, z - 30) < r + 14) continue;
    b.circle(x, z, r * 1.12, '#c4c5cb');
    b.circle(x, z, r, '#8f9097');
    b.circle(x + r * 0.15, z + r * 0.15, r * 0.7, '#9c9da4');
  }

  // Rover track network: ring + spokes to the base.
  const ringR = 95;
  const nodes = [{ x: 0, z: -40 }];
  const edges: [number, number][] = [];
  const N = 8;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    nodes.push({ x: Math.cos(a) * ringR, z: Math.sin(a) * ringR });
  }
  for (let i = 0; i < N; i++) edges.push([1 + i, 1 + ((i + 1) % N)]);
  for (const i of [0, 2, 4, 6]) edges.push([0, 1 + i]);
  const tracks = b.addGraph(nodes, edges);
  for (const [p, q] of edges) {
    const A = nodes[p];
    const B = nodes[q];
    const L = Math.hypot(B.x - A.x, B.z - A.z);
    b.rect((A.x + B.x) / 2, (A.z + B.z) / 2, L + 6, 6, '#b9b6ae', Math.atan2(B.z - A.z, B.x - A.x));
  }
  for (const n of nodes) b.circle(n.x, n.z, 5, '#b9b6ae');

  // Moon base HQ and habitat ring.
  b.circle(0, -40, 30, '#c9cbd2');
  b.put('moonbase', 0, -40, 0, { force: true });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    b.put('dome', Math.cos(a) * 44, -40 + Math.sin(a) * 44, -a, { force: true });
  }
  b.circle(-80, 40, 16, '#c9cbd2');
  b.put('bigdome', -80, 40, 0, { force: true });
  b.circle(70, 80, 15, '#c9cbd2');
  b.put('bigdome', 70, 80, 1, { force: true, scale: 0.9 });

  // Solar farm.
  const solar: Area = { x0: 45, x1: 105, z0: -60, z1: -20 };
  b.rectArea(solar, '#b0b1b8');
  for (let x = solar.x0 + 4; x < solar.x1 - 2; x += 6) for (let z = solar.z0 + 4; z < solar.z1 - 2; z += 5) b.put('solarpanel', x, z, 0, { force: true });

  // Launch pads.
  for (const [x, z] of [
    [105, 45],
    [-110, -75],
    [-30, 110],
  ]) {
    b.circle(x, z, 10, '#6e6f76');
    b.ring(x, z, 9, 10, '#f5c542');
    b.put('rocket', x, z, 0, { force: true });
  }
  b.put('lander', -60, -100, 0.4, { force: true });
  b.put('lander', 30, 60, 1.4, { force: true });
  b.put('lander', 120, -110, 0.2, { force: true });

  // Dish array.
  for (let i = 0; i < 5; i++) b.put('dish', -100 + i * 9, -20 + (i % 2) * 6, faceDir(1, -1), { force: true });

  // Start area: rocks, flags and astronauts.
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    b.put(k % 3 === 0 ? 'flag' : 'moonrock', Math.cos(a) * 3.6, 30 + Math.sin(a) * 3.6, a, { force: true, tint: 0xe84a4a, scale: k % 3 === 0 ? 1 : rng.range(0.4, 0.7) });
  }
  for (let i = 0; i < 6; i++) b.wanderer('astronaut', { x0: -10, x1: 10, z0: 20, z1: 40 }, 0.9, { flee: true, tint: 0xe84a4a });

  // Scatter the surface.
  const all: Area = { x0: -H, x1: H, z0: -H, z1: H };
  b.scatter('moonrock', all, 1100, { scale: [0.35, 2.4] });
  b.scatter('boulder', all, 60, { scale: [0.6, 1.8] });
  b.scatter('crystal', all, 26, { scale: [0.7, 1.6], tint: () => rng.pick([0xb05cff, 0x45e0e8, 0xff5fb4]) });
  b.scatter('alienplant', all, 90, { scale: [0.7, 1.3] });
  b.scatter('cheese', all, 10, { scale: [0.8, 1.4] });
  b.scatter('flag', all, 40, { tint: () => rng.pick([0xe84a4a, 0x3b82f6, 0x38c172, 0xf5c542]) });
  b.scatter('solarpanel', all, 12);
  b.scatter('dish', all, 6);
  // Crystal gardens.
  for (let i = 0; i < 5; i++) {
    const cx = rng.range(-H + 20, H - 20);
    const cz = rng.range(-H + 20, H - 20);
    b.scatter('crystal', { x0: cx - 10, x1: cx + 10, z0: cz - 10, z1: cz + 10 }, 8, { scale: [0.5, 1.4], tint: () => rng.pick([0xb05cff, 0x45e0e8, 0xff5fb4]) });
    b.scatter('alienplant', { x0: cx - 12, x1: cx + 12, z0: cz - 12, z1: cz + 12 }, 6);
  }

  for (let i = 0; i < 60; i++) b.wanderer('astronaut', shrink(all, 10), 1.0, { flee: true, tint: rng.pick([0xe84a4a, 0x3b82f6, 0x38c172, 0xf5c542]) });
  for (let i = 0; i < 10; i++) b.graphMover('rover', tracks, 2.2, 4);
  b.traffic = { graph: tracks, lane: 2.2, speed: 5, types: ['rover'] };
  for (let i = 0; i < 3; i++) b.wanderer('ufo', shrink(all, 30), 2.5);

  return b.build(
    '#a5a6ac',
    '#7f8087',
    { sky: '#0b0d1f', fog: '#1a1d35', sun: '#ffffff', hemiSky: '#b8c4ff', hemiGround: '#3a3a44', sunIntensity: 2.6 },
    { x: 0, z: 30 },
  );
}
