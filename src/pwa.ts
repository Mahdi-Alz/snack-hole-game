/** Cache names the service worker (public/sw.js template, built by vite.config.ts) creates. */
const CACHE_PREFIX = 'snack-hole-';

/**
 * Release builds register the service worker so the game can be installed and played offline.
 * The dev server removes any worker (and its caches) that a local release build left on the same
 * origin, so it never serves stale files in place of Vite's.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) {
    void navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => void r.unregister()));
    void caches?.keys().then((keys) => keys.filter((k) => k.startsWith(CACHE_PREFIX)).forEach((k) => void caches.delete(k)));
    return;
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((err) => console.warn('Service worker not registered', err));
  });
}
