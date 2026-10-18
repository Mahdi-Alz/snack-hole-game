import * as THREE from 'three';
import { SIZE } from '../config/balance';
import { OBJECT_TYPES } from '../config/objects';
import { ALIVE, DORMANT, FALLING, GONE, MV_NONE, type World, type WObj } from '../core/world';
import { createGhostMaterial, createPropMaterial } from './materials';
import { BUILDERS } from './props';

const geoCache = new Map<number, THREE.BufferGeometry>();

/** Geometry for a type, built once and shared across rounds. */
export function geometryFor(t: number): THREE.BufferGeometry {
  let g = geoCache.get(t);
  if (!g) {
    const def = OBJECT_TYPES[t];
    const b = BUILDERS[def.id];
    if (!b) throw new Error(`no builder for ${def.id}`);
    g = b();
    geoCache.set(t, g);
  }
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const _qt = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/** Opacity of a prop that hides the hole from the camera. */
const GHOST_ALPHA = 0.45;
const MAX_GHOSTS = 24;

/** A prop drawn see-through (depth pre-pass + blended colour pass) instead of in its instanced mesh. */
interface Ghost {
  o: WObj | null;
  depth: THREE.Mesh;
  color: THREE.Mesh;
  mat: THREE.MeshLambertMaterial;
  tint: THREE.Color;
  gold: { value: number };
  alpha: number;
  hold: number;
}

const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true, depthWrite: true });

function meshKey(o: WObj): number {
  return o.t * 2 + (o.gold ? 1 : 0);
}

/** One InstancedMesh per prop type; syncs instance matrices from the simulation each frame. */
export class ObjectsView {
  readonly group = new THREE.Group();
  readonly material = createPropMaterial();
  readonly goldMaterial = createPropMaterial(true);
  /** Instanced mesh per prop type, golden props in their own mesh: key = type * 2 + gold. */
  private meshes = new Map<number, THREE.InstancedMesh>();
  private world: World | null = null;
  private ghosts = new Map<WObj, Ghost>();
  private ghostPool: Ghost[] = [];
  private shadows = true;

  setWorld(world: World, shadows: boolean): void {
    this.clear();
    this.world = world;
    this.shadows = shadows;
    const counts = new Map<number, number>();
    for (const o of world.objects) counts.set(meshKey(o), (counts.get(meshKey(o)) ?? 0) + 1);
    for (const [key, n] of counts) {
      const mesh = new THREE.InstancedMesh(geometryFor(key >> 1), key & 1 ? this.goldMaterial : this.material, n);
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      this.meshes.set(key, mesh);
      this.group.add(mesh);
    }
    const next = new Map<number, number>();
    for (const o of world.objects) {
      const key = meshKey(o);
      const i = next.get(key) ?? 0;
      next.set(key, i + 1);
      o.inst = i;
      const mesh = this.meshes.get(key)!;
      mesh.setColorAt(i, _c.setHex(o.tint));
      this.writeMatrix(mesh, o, 0);
      o.dirty = false;
    }
    for (const mesh of this.meshes.values()) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  setShadows(on: boolean): void {
    this.shadows = on;
    for (const m of this.meshes.values()) {
      m.castShadow = on;
      m.receiveShadow = on;
    }
    for (const g of this.ghosts.values()) {
      g.color.castShadow = on;
      g.color.receiveShadow = on;
    }
  }

  private writeMatrix(mesh: THREE.InstancedMesh, o: WObj, time: number): void {
    if (o.state === GONE || o.state === DORMANT) {
      mesh.setMatrixAt(o.inst, ZERO);
      return;
    }
    _qy.setFromAxisAngle(_up, o.rot);
    let y = o.y;
    if (o.state === FALLING) {
      _axis.set(o.tdz, 0, -o.tdx).normalize();
      _qt.setFromAxisAngle(_axis, o.tilt);
      _q.multiplyQuaternions(_qt, _qy);
    } else if (o.wob > 0.01) {
      // Too big to fit: rock on the rim.
      const w = o.wob * 0.07 * Math.sin(time * 18 + o.id);
      const hole = this.world!.main;
      const dx = hole.x - o.x;
      const dz = hole.z - o.z;
      const d = Math.hypot(dx, dz) || 1;
      _axis.set(dz / d, 0, -dx / d);
      _qt.setFromAxisAngle(_axis, Math.abs(w) + o.wob * 0.03);
      _q.multiplyQuaternions(_qt, _qy);
    } else if (o.mv !== MV_NONE && o.h < 2.2 && o.wait <= 0) {
      // Little walking bob for people and animals.
      y += Math.abs(Math.sin(o.bob)) * 0.06 * o.s;
      _q.copy(_qy);
    } else {
      _q.copy(_qy);
    }
    _p.set(o.x, y, o.z);
    _s.set(o.s, o.s, o.s);
    _m.compose(_p, _q, _s);
    const ghost = this.ghosts.get(o);
    if (ghost) {
      ghost.color.matrix.copy(_m);
      ghost.depth.matrix.copy(_m);
      mesh.setMatrixAt(o.inst, ZERO);
    } else mesh.setMatrixAt(o.inst, _m);
  }

  // ------------------------------------------------------------ see-through occluders
  private acquireGhost(o: WObj): Ghost | null {
    if (this.ghosts.size >= MAX_GHOSTS) return null;
    let g = this.ghostPool.pop();
    if (!g) {
      const { mat, tint, gold } = createGhostMaterial();
      const depth = new THREE.Mesh(undefined, depthOnly);
      const color = new THREE.Mesh(undefined, mat);
      for (const m of [depth, color]) {
        m.matrixAutoUpdate = false;
        m.frustumCulled = false;
      }
      depth.renderOrder = 3;
      color.renderOrder = 4;
      g = { o: null, depth, color, mat, tint, gold, alpha: 1, hold: 0 };
    }
    const geo = geometryFor(o.t);
    g.depth.geometry = geo;
    g.color.geometry = geo;
    g.color.castShadow = this.shadows;
    g.color.receiveShadow = this.shadows;
    g.tint.setHex(o.tint);
    g.gold.value = o.gold ? 1 : 0;
    g.o = o;
    g.alpha = 1;
    g.mat.opacity = 1;
    this.group.add(g.depth, g.color);
    this.ghosts.set(o, g);
    o.dirty = true;
    return g;
  }

  private releaseGhost(g: Ghost): void {
    this.group.remove(g.depth, g.color);
    if (g.o) {
      this.ghosts.delete(g.o);
      g.o.dirty = true;
    }
    g.o = null;
    this.ghostPool.push(g);
  }

  /**
   * Fades props that stand between the camera and the hole and are too big to swallow, so the
   * player can see what is going on behind a building.
   */
  updateOcclusion(dt: number, cam: THREE.Vector3 | null): void {
    const w = this.world;
    if (w && cam) {
      const h = w.main;
      const R = h.r;
      const fit = SIZE.fit * R;
      const dx = cam.x - h.x;
      const dz = cam.z - h.z;
      const L2 = dx * dx + dz * dz;
      const L = Math.sqrt(L2) || 1;
      const visit = (o: WObj) => {
        // Flying event props (the UFO) pass quickly and are the show: never fade them.
        if (o.state !== ALIVE || o.f <= fit || o.fly) return;
        const top = o.y + o.h;
        if (top < 1 || top < R * 0.5) return;
        const ox = o.x - h.x;
        const oz = o.z - h.z;
        const t = (ox * dx + oz * dz) / L2;
        // Centre well behind the hole (from the camera's side): it cannot hide it.
        if (t * L < -(o.f * 0.6 + R * 0.3)) return;
        const tc = Math.min(1, Math.max(0, t));
        const qx = ox - dx * tc;
        const qz = oz - dz * tc;
        if (qx * qx + qz * qz > (o.f * 0.85 + R * 0.7) ** 2) return;
        // Height of the sight line where it enters the prop's footprint.
        if (cam.y * Math.max(0, t - o.f / L) > top) return;
        const g = this.ghosts.get(o) ?? this.acquireGhost(o);
        if (g) g.hold = 0.3;
      };
      const mx = h.x + dx * 0.5;
      const mz = h.z + dz * 0.5;
      w.grid.query(mx, mz, L * 0.5 + Math.min(w.maxF, 30), visit);
      for (const o of w.movers) visit(o);
    }
    for (const g of [...this.ghosts.values()]) {
      const o = g.o!;
      if (o.state !== ALIVE || !w) {
        this.releaseGhost(g);
        continue;
      }
      g.hold -= dt;
      const want = g.hold > 0 ? GHOST_ALPHA : 1;
      g.alpha += (want - g.alpha) * (1 - Math.exp(-10 * dt));
      if (want === 1 && g.alpha > 0.98) {
        this.releaseGhost(g);
        continue;
      }
      g.mat.opacity = g.alpha;
    }
  }

  update(dt: number, time: number): void {
    const w = this.world;
    if (!w) return;
    const touched = new Set<THREE.InstancedMesh>();
    const objs = w.objects;
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      if (o.wob > 0) {
        o.wob = Math.max(0, o.wob - dt * 1.6);
        o.dirty = true;
      }
      if (!o.dirty) continue;
      o.dirty = false;
      const mesh = this.meshes.get(meshKey(o))!;
      this.writeMatrix(mesh, o, time);
      touched.add(mesh);
    }
    for (const m of touched) m.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    for (const g of [...this.ghosts.values()]) this.releaseGhost(g);
    for (const m of this.meshes.values()) {
      this.group.remove(m);
      m.dispose();
    }
    this.meshes.clear();
    this.world = null;
  }
}
