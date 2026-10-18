import * as THREE from 'three';
import { OBJECT_TYPES } from '../config/objects';
import { createPropMaterial } from './materials';
import { geometryFor } from './objectsView';

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let mesh: THREE.InstancedMesh;
/** Data URLs keyed by `type:tint` (tint changes the colour of tintable parts). */
const cache = new Map<string, string>();
const SIZE = 96;
const DEFAULT_TINT = 0xff6b6b;
const key = (t: number, tint: number) => `${t}:${tint}`;

function init(): void {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a5a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(-3, 5, 4);
  scene.add(sun);
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 2000);
}

/** Data URL thumbnail of a prop type, rendered once with an offscreen renderer. */
export function thumbFor(t: number, tint = DEFAULT_TINT): string {
  const hit = cache.get(key(t, tint));
  if (hit) return hit;
  try {
    if (!renderer) init();
    const geo = geometryFor(t);
    if (mesh) scene.remove(mesh);
    mesh = new THREE.InstancedMesh(geo, createPropMaterial(), 1);
    mesh.setMatrixAt(0, new THREE.Matrix4());
    mesh.setColorAt(0, new THREE.Color(tint));
    scene.add(mesh);
    const box = geo.boundingBox!;
    const sphere = geo.boundingSphere!;
    const center = new THREE.Vector3();
    box.getCenter(center);
    const dist = (sphere.radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.05;
    const dir = new THREE.Vector3(1.0, 0.75, 1.2).normalize();
    camera.position.copy(center).addScaledVector(dir, dist);
    camera.near = dist * 0.05;
    camera.far = dist * 4;
    camera.updateProjectionMatrix();
    camera.lookAt(center);
    renderer!.render(scene, camera);
    const url = renderer!.domElement.toDataURL('image/png');
    cache.set(key(t, tint), url);
    (mesh.material as THREE.Material).dispose();
    mesh.dispose();
    return url;
  } catch {
    return '';
  }
}

export function thumbForId(id: string): string {
  const t = OBJECT_TYPES.findIndex((o) => o.id === id);
  return t >= 0 ? thumbFor(t) : '';
}

const queue: number[] = [];
let pumping = false;

/** Renders thumbnails for these types in the background, one every few frames. */
export function prewarmThumbs(types: Iterable<number>): void {
  for (const t of types) if (!cache.has(key(t, DEFAULT_TINT)) && !queue.includes(t)) queue.push(t);
  if (pumping || queue.length === 0) return;
  pumping = true;
  const step = () => {
    const t = queue.shift();
    if (t !== undefined && !cache.has(key(t, DEFAULT_TINT))) thumbFor(t);
    if (queue.length) setTimeout(step, 40);
    else pumping = false;
  };
  setTimeout(step, 40);
}

/** Cached thumbnail or '' (and schedules it) — never blocks a frame. */
export function cachedThumb(t: number): string {
  const hit = cache.get(key(t, DEFAULT_TINT));
  if (hit) return hit;
  prewarmThumbs([t]);
  return '';
}
