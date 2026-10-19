import * as THREE from 'three';
import { createPropMaterial } from './materials';
import { geometryFor } from './objectsView';

let renderer: THREE.WebGLRenderer | null = null;
/** Set once creating the offscreen renderer failed (no WebGL): later thumbs return '' at once. */
let initFailed = false;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let mesh: THREE.InstancedMesh;
/** One material for every thumbnail, so its shader compiles once instead of once per thumbnail. */
let material: THREE.Material;
/** Background thumbnails wait while set (during rounds), so they never cost a round frame. */
let paused = false;
/** Data URLs keyed by `type:tint` (tint changes the colour of tintable parts). */
const cache = new Map<string, string>();
const SIZE = 96;
const DEFAULT_TINT = 0xff6b6b;
const key = (t: number, tint: number) => `${t}:${tint}`;
/** Transparent 1x1 GIF shown until a thumbnail is rendered. */
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
/** Thumbnails thumbInto renders per animation frame. */
const PER_FRAME = 3;

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
  material = createPropMaterial();
}

/** Holds background thumbnails (prewarm and thumbInto) while `on`; thumbFor still renders. */
export function pauseThumbs(on: boolean): void {
  paused = on;
}

/** Data URL thumbnail of a prop type, rendered once with an offscreen renderer ('' if it cannot). */
export function thumbFor(t: number, tint = DEFAULT_TINT): string {
  const hit = cache.get(key(t, tint));
  if (hit) return hit;
  if (initFailed) return '';
  if (!renderer) {
    try {
      init();
    } catch {
      initFailed = true;
      renderer = null;
      return '';
    }
  }
  const r = renderer!;
  try {
    const geo = geometryFor(t);
    if (mesh) scene.remove(mesh);
    mesh = new THREE.InstancedMesh(geo, material, 1);
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
    r.render(scene, camera);
    // A lost context draws nothing: return '' rather than cache a blank image for good.
    const url = r.getContext().isContextLost() ? '' : r.domElement.toDataURL('image/png');
    if (url) cache.set(key(t, tint), url);
    mesh.dispose();
    return url;
  } catch {
    return '';
  }
}

const queue: number[] = [];
let pumping = false;

/** Renders thumbnails for these types in the background, one every few frames. */
export function prewarmThumbs(types: Iterable<number>): void {
  for (const t of types) if (!cache.has(key(t, DEFAULT_TINT)) && !queue.includes(t)) queue.push(t);
  if (pumping || queue.length === 0) return;
  pumping = true;
  const step = () => {
    if (!paused) {
      const t = queue.shift();
      if (t !== undefined && !cache.has(key(t, DEFAULT_TINT))) thumbFor(t);
    }
    if (queue.length) setTimeout(step, paused ? 500 : 40);
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

/** Images waiting for a type's thumbnail, in request order. */
const waiting = new Map<number, HTMLImageElement[]>();
let drawing = false;

/**
 * Gives `img` the type's thumbnail without blocking: the cached one at once, otherwise a blank
 * placeholder now and the thumbnail a few frames later. Returns `img`.
 */
export function thumbInto(img: HTMLImageElement, t: number): HTMLImageElement {
  const hit = cache.get(key(t, DEFAULT_TINT));
  img.src = hit ?? BLANK;
  if (hit || initFailed) return img;
  const list = waiting.get(t);
  if (list) list.push(img);
  else waiting.set(t, [img]);
  if (!drawing) {
    drawing = true;
    requestAnimationFrame(drawWaiting);
  }
  return img;
}

function drawWaiting(): void {
  if (paused) {
    requestAnimationFrame(drawWaiting);
    return;
  }
  let drawn = 0;
  for (const [t, imgs] of waiting) {
    if (drawn >= PER_FRAME) break;
    waiting.delete(t);
    // The panel may have been rebuilt meanwhile: only images still on the page need it.
    const live = imgs.filter((img) => img.isConnected);
    if (live.length === 0) continue;
    const url = thumbFor(t);
    drawn++;
    if (url) for (const img of live) img.src = url;
  }
  if (waiting.size > 0) requestAnimationFrame(drawWaiting);
  else drawing = false;
}
