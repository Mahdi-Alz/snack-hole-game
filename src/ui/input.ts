/**
 * Steering input. Mouse: direction from screen centre to the pointer. Touch: virtual joystick
 * from where the finger went down. Keyboard (WASD / arrows) overrides both.
 * Output is a world-space vector: screen right = +X, screen up = -Z, magnitude 0..1.
 */
export class Input {
  private keys = new Set<string>();
  private mouse: { x: number; y: number } | null = null;
  private touchId: number | null = null;
  private touchOrigin = { x: 0, y: 0 };
  private touchCur = { x: 0, y: 0 };
  private joy: HTMLDivElement;
  private knob: HTMLDivElement;
  enabled = false;
  onAbility: ((slot: number) => void) | null = null;
  onKey: ((key: string) => void) | null = null;

  constructor(surface: HTMLElement) {
    this.joy = document.createElement('div');
    this.joy.className = 'joystick';
    this.knob = document.createElement('div');
    this.knob.className = 'joystick-knob';
    this.joy.appendChild(this.knob);
    document.body.appendChild(this.joy);

    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (this.enabled) {
        if (k === ' ' || k === '1') this.onAbility?.(0);
        if (k === '2') this.onAbility?.(1);
        if (k === '3') this.onAbility?.(2);
        if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
      }
      this.onKey?.(e.key);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse = null;
    });

    surface.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') this.mouse = { x: e.clientX, y: e.clientY };
    });
    surface.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.mouse = null;
    });
    document.addEventListener('mouseleave', () => (this.mouse = null));

    surface.addEventListener(
      'touchstart',
      (e) => {
        if (!this.enabled || this.touchId !== null) return;
        const t = e.changedTouches[0];
        this.touchId = t.identifier;
        this.touchOrigin = { x: t.clientX, y: t.clientY };
        this.touchCur = { ...this.touchOrigin };
        this.updateJoystick(true);
        e.preventDefault();
      },
      { passive: false },
    );
    surface.addEventListener(
      'touchmove',
      (e) => {
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier === this.touchId) {
            this.touchCur = { x: t.clientX, y: t.clientY };
            this.updateJoystick(true);
          }
        }
        e.preventDefault();
      },
      { passive: false },
    );
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.touchId) {
          this.touchId = null;
          this.updateJoystick(false);
        }
      }
    };
    surface.addEventListener('touchend', end);
    surface.addEventListener('touchcancel', end);
  }

  private joyRadius(): number {
    return Math.min(70, Math.min(window.innerWidth, window.innerHeight) * 0.14);
  }

  private updateJoystick(show: boolean): void {
    this.joy.style.display = show && this.enabled ? 'block' : 'none';
    if (!show) return;
    const R = this.joyRadius();
    this.joy.style.left = `${this.touchOrigin.x}px`;
    this.joy.style.top = `${this.touchOrigin.y}px`;
    this.joy.style.width = this.joy.style.height = `${R * 2}px`;
    let dx = this.touchCur.x - this.touchOrigin.x;
    let dy = this.touchCur.y - this.touchOrigin.y;
    const d = Math.hypot(dx, dy);
    if (d > R) {
      dx = (dx / d) * R;
      dy = (dy / d) * R;
    }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  vector(): { x: number; z: number } {
    if (!this.enabled) return { x: 0, z: 0 };
    let kx = 0;
    let kz = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) kx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) kx += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) kz -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) kz += 1;
    if (kx || kz) {
      const m = Math.hypot(kx, kz);
      return { x: kx / m, z: kz / m };
    }
    if (this.touchId !== null) {
      const R = this.joyRadius();
      const dx = this.touchCur.x - this.touchOrigin.x;
      const dy = this.touchCur.y - this.touchOrigin.y;
      const d = Math.hypot(dx, dy);
      if (d < R * 0.12) return { x: 0, z: 0 };
      const m = Math.min(1, d / (R * 0.8));
      return { x: (dx / d) * m, z: (dy / d) * m };
    }
    if (this.mouse) {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const dx = this.mouse.x - cx;
      const dy = this.mouse.y - cy;
      const d = Math.hypot(dx, dy);
      const minDim = Math.min(window.innerWidth, window.innerHeight);
      if (d < minDim * 0.035) return { x: 0, z: 0 };
      const m = Math.min(1, d / (minDim * 0.24));
      return { x: (dx / d) * m, z: (dy / d) * m };
    }
    return { x: 0, z: 0 };
  }

  reset(): void {
    this.touchId = null;
    this.updateJoystick(false);
  }
}
