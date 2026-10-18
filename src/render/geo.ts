import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface PartOpts {
  rx?: number;
  ry?: number;
  rz?: number;
  /** Part takes the per-instance tint colour. */
  tint?: boolean;
  sx?: number;
  sy?: number;
  sz?: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** Builds a geometry from triangles of a convex solid, fixing winding so faces point outward. */
function convex(tris: number[][]): THREE.BufferGeometry {
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const v of tris) {
    cx += v[0];
    cy += v[1];
    cz += v[2];
  }
  cx /= tris.length;
  cy /= tris.length;
  cz /= tris.length;
  const out: number[] = [];
  for (let i = 0; i < tris.length; i += 3) {
    const [a, b, c] = [tris[i], tris[i + 1], tris[i + 2]];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (a[0] + b[0] + c[0]) / 3 - cx, my = (a[1] + b[1] + c[1]) / 3 - cy, mz = (a[2] + b[2] + c[2]) / 3 - cz;
    if (nx * mx + ny * my + nz * mz < 0) out.push(...a, ...c, ...b);
    else out.push(...a, ...b, ...c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(out), 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Tiny low-poly modelling kit: primitives with flat vertex colours merged into one geometry.
 * Every part carries a `tintable` attribute so instanced meshes can recolour only some parts.
 */
export class G {
  private parts: THREE.BufferGeometry[] = [];

  add(geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, o: PartOpts = {}): this {
    const g = geo.index ? geo.toNonIndexed() : geo;
    geo.dispose();
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    if (g.getAttribute('uv1')) g.deleteAttribute('uv1');
    _e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1));
    g.applyMatrix4(_m);
    const n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    if (o.tint) {
      // Tinted parts keep only the brightness of their base colour so the instance tint shows true.
      const v = Math.max((color >> 16) & 255, (color >> 8) & 255, color & 255) / 255;
      const g = Math.round(Math.min(1, Math.max(0.5, v / 0.91)) * 255);
      _c.setHex((g << 16) | (g << 8) | g);
    } else _c.setHex(color);
    for (let i = 0; i < n; i++) {
      col[i * 3] = _c.r;
      col[i * 3 + 1] = _c.g;
      col[i * 3 + 2] = _c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('tintable', new THREE.BufferAttribute(new Float32Array(n).fill(o.tint ? 1 : 0), 1));
    this.parts.push(g);
    return this;
  }

  /** Box centred at (x, y, z). */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, o?: PartOpts): this {
    return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, o);
  }

  /** Box resting on y (bottom face at y). */
  boxB(w: number, h: number, d: number, x: number, y: number, z: number, color: number, o?: PartOpts): this {
    return this.box(w, h, d, x, y + h / 2, z, color, o);
  }

  cyl(rt: number, rb: number, h: number, x: number, y: number, z: number, color: number, seg = 8, o?: PartOpts): this {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y, z, o);
  }

  /** Cylinder resting on y. */
  cylB(rt: number, rb: number, h: number, x: number, y: number, z: number, color: number, seg = 8, o?: PartOpts): this {
    return this.cyl(rt, rb, h, x, y + h / 2, z, color, seg, o);
  }

  cone(r: number, h: number, x: number, y: number, z: number, color: number, seg = 8, o?: PartOpts): this {
    return this.add(new THREE.ConeGeometry(r, h, seg), color, x, y, z, o);
  }

  ball(r: number, x: number, y: number, z: number, color: number, detail = 0, o?: PartOpts): this {
    return this.add(new THREE.IcosahedronGeometry(r, detail), color, x, y, z, o);
  }

  sphere(r: number, x: number, y: number, z: number, color: number, ws = 10, hs = 7, o?: PartOpts): this {
    return this.add(new THREE.SphereGeometry(r, ws, hs), color, x, y, z, o);
  }

  dome(r: number, x: number, y: number, z: number, color: number, ws = 14, hs = 6, o?: PartOpts): this {
    return this.add(new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, Math.PI / 2), color, x, y, z, o);
  }

  /** Wheel: cylinder lying along Z. */
  wheel(r: number, wdt: number, x: number, y: number, z: number, color = 0x22252b): this {
    return this.cyl(r, r, wdt, x, y, z, color, 10, { rx: Math.PI / 2 });
  }

  /**
   * Triangular prism roof: ridge runs along X (length `len`), slopes span Z (`span`),
   * base at y, apex at y + h.
   */
  roof(len: number, span: number, h: number, x: number, y: number, z: number, color: number, o?: PartOpts): this {
    const hl = len / 2;
    const hs = span / 2;
    const A = [-hl, 0, -hs];
    const B = [-hl, 0, hs];
    const C = [-hl, h, 0];
    const D = [hl, 0, -hs];
    const E = [hl, 0, hs];
    const F = [hl, h, 0];
    const tris = [A, C, B, D, E, F, A, D, F, A, F, C, B, C, F, B, F, E, A, B, E, A, E, D];
    return this.add(convex(tris), color, x, y, z, o);
  }

  /** Wedge: box whose top slopes from full height at -X to zero at +X. */
  wedge(w: number, h: number, d: number, x: number, y: number, z: number, color: number, o?: PartOpts): this {
    const hw = w / 2;
    const hd = d / 2;
    const A = [-hw, 0, -hd];
    const B = [-hw, 0, hd];
    const C = [hw, 0, hd];
    const D = [hw, 0, -hd];
    const E = [-hw, h, -hd];
    const F = [-hw, h, hd];
    const tris = [A, C, B, A, D, C, A, B, F, A, F, E, A, E, D, B, C, F, E, F, C, E, C, D];
    return this.add(convex(tris), color, x, y, z, o);
  }

  /** Pointed bow: prism whose base (width `beam` along Z) is at x and whose tip is `len` ahead (+X), base at y. */
  bow(len: number, h: number, beam: number, x: number, y: number, z: number, color: number, o?: PartOpts): this {
    const hb = beam / 2;
    const A = [0, 0, -hb];
    const B = [0, 0, hb];
    const C = [len, 0, 0];
    const D = [0, h, -hb];
    const E = [0, h, hb];
    const F = [len, h, 0];
    const tris = [A, C, B, D, E, F, A, B, E, A, E, D, B, C, F, B, F, E, A, D, F, A, F, C];
    return this.add(convex(tris), color, x, y, z, o);
  }

  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
