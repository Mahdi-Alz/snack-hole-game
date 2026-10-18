import * as THREE from 'three';

const MAX = 700;

const vert = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;
uniform float uScale;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const frag = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = dot(p, p);
  if (d > 1.0) discard;
  float a = (1.0 - d) * vAlpha;
  gl_FragColor = vec4(vColor * a, a);
}
`;

/** CPU-simulated additive sparkle particles (swallow bursts, level-up rings). */
export class Particles {
  readonly points: THREE.Points;
  private pos = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 3);
  private size = new Float32Array(MAX);
  private alpha = new Float32Array(MAX);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private baseSize = new Float32Array(MAX);
  private grav = new Float32Array(MAX);
  private next = 0;
  private mat: THREE.ShaderMaterial;
  private _c = new THREE.Color();

  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  setViewportHeight(h: number): void {
    this.mat.uniforms.uScale.value = h * 0.9;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: string | number, size: number, life: number, gravity = 0): void {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this._c.set(color);
    this.col[i * 3] = this._c.r;
    this.col[i * 3 + 1] = this._c.g;
    this.col[i * 3 + 2] = this._c.b;
    this.baseSize[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grav[i] = gravity;
  }

  /** Burst of sparkles rising out of the hole when something is swallowed. */
  swallowBurst(x: number, z: number, r: number, color: string, amount: number, big: boolean): void {
    const n = Math.min(24, Math.max(2, amount));
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const rr = r * (0.6 + Math.random() * 0.5);
      const sp = (1 + Math.random() * 2) * (0.5 + r * 0.25);
      this.emit(
        x + Math.cos(a) * rr,
        0.1,
        z + Math.sin(a) * rr,
        Math.cos(a) * sp * 0.4,
        sp * (big ? 2.4 : 1.6),
        Math.sin(a) * sp * 0.4,
        color,
        (0.25 + Math.random() * 0.35) * (0.6 + r * 0.35),
        0.5 + Math.random() * 0.5,
        -2 - r,
      );
    }
  }

  /** Expanding ring of sparks around the rim (level up). */
  ringBurst(x: number, z: number, r: number, color: string): void {
    const n = 48;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const sp = 3 + r * 1.2;
      this.emit(x + Math.cos(a) * r, 0.2, z + Math.sin(a) * r, Math.cos(a) * sp, 1.5 + Math.random() * 2, Math.sin(a) * sp, color, 0.5 + r * 0.25, 0.8, -3);
    }
  }

  update(dt: number): void {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        this.size[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.vel[i * 3 + 1] += this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = Math.min(1, t * 2);
      this.size[i] = this.baseSize[i] * (0.4 + 0.6 * t);
    }
    const g = this.points.geometry;
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
  }
}
