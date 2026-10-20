import { BACKUP_SAVE_KEY, SAVE_KEY } from './config/balance';
import { parseSave } from './core/save';

type Callback<T> = (err: string | null, value?: T) => void;

interface CloudStorage {
  getItem(key: string, cb: Callback<string>): void;
  getItems(keys: string[], cb: Callback<Record<string, string>>): void;
  setItem(key: string, value: string, cb: Callback<boolean>): void;
}

interface WebApp {
  ready(): void;
  expand(): void;
  disableVerticalSwipes?(): void;
  isVersionAtLeast(version: string): boolean;
  CloudStorage: CloudStorage;
}

interface CloudMeta {
  slot: 'a' | 'b';
  n: number;
  at: number;
  z: boolean;
}

const SDK_URL = 'https://telegram.org/js/telegram-web-app.js';
const META_KEY = 'save';
const CHUNK = 4000;
const SDK_TIMEOUT_MS = 5000;
const READ_TIMEOUT_MS = 5000;
const SYNC_DELAY_MS = 5000;

export function inTelegram(): boolean {
  if (/tgWebApp(Data|Platform)=/.test(location.hash + location.search)) return true;
  try {
    return sessionStorage.getItem('__telegram__initParams') !== null;
  } catch {
    return false;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

function loadSdk(): Promise<WebApp> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.onload = () => {
      const wa = (window as unknown as { Telegram?: { WebApp?: WebApp } }).Telegram?.WebApp;
      if (wa) resolve(wa);
      else reject(new Error('no WebApp'));
    };
    s.onerror = () => reject(new Error('sdk failed'));
    document.head.appendChild(s);
  });
}

function call<T>(fn: (cb: Callback<T>) => void): Promise<T | undefined> {
  return new Promise((resolve, reject) => fn((err, v) => (err ? reject(new Error(err)) : resolve(v))));
}

async function pack(text: string): Promise<{ data: string; z: boolean }> {
  if (typeof CompressionStream === 'undefined') return { data: text, z: false };
  const buf = await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
  let bin = '';
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return { data: btoa(bin), z: true };
}

async function unpack(data: string, z: boolean): Promise<string> {
  if (!z) return data;
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
}

const chunkKey = (slot: string, i: number) => `${slot}${i}`;

async function readCloud(cs: CloudStorage): Promise<{ meta: CloudMeta; text: string } | { meta: null }> {
  const raw = await call<string>((cb) => cs.getItem(META_KEY, cb));
  if (!raw) return { meta: null };
  const meta = JSON.parse(raw) as CloudMeta;
  const keys = Array.from({ length: meta.n }, (_, i) => chunkKey(meta.slot, i));
  const values = (await call<Record<string, string>>((cb) => cs.getItems(keys, cb))) ?? {};
  const text = await unpack(keys.map((k) => values[k] ?? '').join(''), meta.z);
  return { meta, text };
}

function localLastSeen(raw: string | null): number {
  if (!raw) return -1;
  try {
    return Number((JSON.parse(raw) as { lastSeen?: unknown }).lastSeen) || 0;
  } catch {
    return 0;
  }
}

function adoptCloudSave(text: string, at: number): void {
  try {
    const local = localStorage.getItem(SAVE_KEY);
    if (at <= localLastSeen(local) || !parseSave(text)) return;
    if (local) localStorage.setItem(BACKUP_SAVE_KEY, JSON.stringify({ at: Date.now(), save: local }));
    localStorage.setItem(SAVE_KEY, text);
  } catch {
    return;
  }
}

class CloudSync {
  private pending: { text: string; at: number } | null = null;
  private timer = 0;
  private busy = false;

  constructor(
    private readonly cs: CloudStorage,
    private slot: 'a' | 'b' | null,
  ) {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void this.flush();
    });
  }

  push(text: string, at: number): void {
    this.pending = { text, at };
    if (!this.timer) this.timer = window.setTimeout(() => void this.flush(), SYNC_DELAY_MS);
  }

  private async flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = 0;
    if (this.busy || !this.pending) return;
    const { text, at } = this.pending;
    this.pending = null;
    this.busy = true;
    try {
      const slot = this.slot === 'a' ? 'b' : 'a';
      const { data, z } = await pack(text);
      const n = Math.max(1, Math.ceil(data.length / CHUNK));
      await Promise.all(Array.from({ length: n }, (_, i) => call<boolean>((cb) => this.cs.setItem(chunkKey(slot, i), data.slice(i * CHUNK, (i + 1) * CHUNK), cb))));
      const meta: CloudMeta = { slot, n, at, z };
      await call<boolean>((cb) => this.cs.setItem(META_KEY, JSON.stringify(meta), cb));
      this.slot = slot;
    } catch {
      this.pending ??= { text, at };
    } finally {
      this.busy = false;
      if (this.pending && !this.timer) this.timer = window.setTimeout(() => void this.flush(), SYNC_DELAY_MS);
    }
  }
}

export async function setupTelegram(): Promise<((text: string, at: number) => void) | undefined> {
  let wa: WebApp;
  try {
    wa = await withTimeout(loadSdk(), SDK_TIMEOUT_MS);
  } catch {
    return undefined;
  }
  wa.ready();
  wa.expand();
  if (wa.isVersionAtLeast('7.7')) wa.disableVerticalSwipes?.();
  if (!wa.isVersionAtLeast('6.9')) return undefined;
  try {
    const cloud = await withTimeout(readCloud(wa.CloudStorage), READ_TIMEOUT_MS);
    if (cloud.meta) adoptCloudSave(cloud.text, cloud.meta.at);
    const sync = new CloudSync(wa.CloudStorage, cloud.meta?.slot ?? null);
    return (text, at) => sync.push(text, at);
  } catch {
    return undefined;
  }
}
