const query = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

/** The OS asks for reduced motion: skip screen shake, the dash FOV punch and full-screen flashes. */
export function reducedMotion(): boolean {
  return query?.matches ?? false;
}
