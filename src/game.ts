import {
  ABILITIES,
  AUTOSAVE_SECONDS,
  BACKUP_SAVE_KEY,
  LEGACY_SAVE_KEY,
  PRESTIGE,
  SAVE_KEY,
  SIZE,
  SKINS,
  UNREADABLE_SAVE_KEY,
  type AbilityId,
  type DmUpgradeId,
  type MapId,
  type UpgradeId,
} from './config/balance';
import { OBJECT_TYPES } from './config/objects';
import { Audio } from './audio/audio';
import { checkAchievements } from './core/achievements';
import { Bot } from './core/bot';
import * as eco from './core/economy';
import { formatCash, formatNumber, setScientific } from './core/format';
import { generateMap } from './core/mapgen';
import { decodeSaveText, defaultSave, encodeSaveText, parseSave, serialize, type SaveData } from './core/save';
import { World, type EventId, type WObj } from './core/world';
import { fixtureSave } from './dev/fixtures';
import { devFlags } from './dev/flags';
import { reducedMotion } from './render/motion';
import { GameRenderer } from './render/scene';
import { cachedThumb, prewarmThumbs, thumbFor } from './render/thumbs';
import type { DebugPanel } from './ui/debug';
import {
  activateFocused,
  anyModalOpen,
  confirmDialog,
  infoDialog,
  openModalCount,
  showOffline,
  showPause,
  showResults,
  showSettings,
  type ModalHandle,
} from './ui/dialogs';
import { h } from './ui/dom';
import { showFatal } from './ui/fatal';
import { Hub } from './ui/hub';
import { Hud } from './ui/hud';
import { Input, PAD } from './ui/input';
import type { HubApi } from './ui/tabs';
import { toast } from './ui/toast';

type State = 'hub' | 'round' | 'results';

/** Seconds of landmark slow-motion. */
const SLOWMO = 1.1;

const EVENT_TEXT: Record<EventId, [string, string]> = {
  rush: ['🚗 RUSH HOUR!', 'Traffic is pouring in'],
  ufo: ['🛸 UFO FLY-BY!', 'Grab the golden drops'],
  stampede: ['🐄 STAMPEDE!', 'Here comes the herd'],
};

/** Consecutive failing frames before the game stops and shows an error screen. */
const MAX_FAILED_FRAMES = 30;

/** Dev test saves (`?fresh`, `?save=NAME`) live in memory, so tests never touch the real save. */
const memoryStore = new Map<string, string>();
const ephemeral = (): boolean => import.meta.env.DEV && devFlags.ephemeral;

function storeGet(key: string): string | null {
  if (ephemeral()) return memoryStore.get(key) ?? null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Writes `value`; false when storage is full or blocked. */
function storeSet(key: string, value: string): boolean {
  if (ephemeral()) {
    memoryStore.set(key, value);
    return true;
  }
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** The stored save (or a dev test save), plus the raw text when the stored save is unreadable. */
function loadSave(): { save: SaveData; unreadable: string | null } {
  if (import.meta.env.DEV && devFlags.save !== null) return { save: fixtureSave(devFlags.save), unreadable: null };
  if (import.meta.env.DEV && devFlags.fresh) return { save: defaultSave(), unreadable: null };
  const raw = storeGet(SAVE_KEY) ?? storeGet(LEGACY_SAVE_KEY);
  if (!raw) return { save: defaultSave(), unreadable: null };
  const save = parseSave(raw);
  return save ? { save, unreadable: null } : { save: defaultSave(), unreadable: raw };
}

/** The save replaced by the last import, restore or reset, if it is still readable. */
function readBackup(): { at: number; save: SaveData } | null {
  const text = storeGet(BACKUP_SAVE_KEY);
  if (!text) return null;
  try {
    const b: unknown = JSON.parse(text);
    if (typeof b !== 'object' || b === null) return null;
    const { at, save } = b as { at?: unknown; save?: unknown };
    const parsed = typeof save === 'string' ? parseSave(save) : null;
    return parsed && typeof at === 'number' ? { at, save: parsed } : null;
  } catch {
    return null;
  }
}

export class Game implements HubApi {
  save: SaveData;
  readonly renderer: GameRenderer;
  readonly audio = new Audio();
  readonly input: Input;
  readonly hud: Hud;
  readonly hub: Hub;
  /** Developer panel (backtick); only exists in dev builds. */
  debug: DebugPanel | null = null;
  private state: State = 'hub';
  private world: World | null = null;
  private bot = new Bot(0.8);
  /** Time warp (debug panel and smoke tests). */
  warp = 1;
  private saveTimer = 0;
  private last = performance.now();
  private roundDiscoveries = new Set<number>();
  private hubRestart = 0;
  private hiddenAt = 0;
  private floatersThisFrame = 0;
  /** The combo multiplier reached its cap this streak (plays one flourish, then stays quiet). */
  private comboMaxed = false;
  /** Open pause menu during a round; the simulation is frozen while set. */
  private pauseMenu: ModalHandle | null = null;
  /** Landmark celebration: slow-motion seconds left, cooldown, and banner hold. */
  private slowmo = 0;
  private landmarkCd = 0;
  private landmarkBannerUntil = 0;
  private frameMs = 0;
  private simMs = 0;
  /** Raw text of a stored save that could not be read (kept aside, reported on start). */
  private unreadable: string | null;
  /** Another tab saved the game since this one loaded: this tab stops saving. */
  private stale = false;
  /** The save text this tab last wrote, and when (to spot other tabs' writes). */
  private lastWritten: string | null = null;
  private lastWriteAt = 0;
  /** Shown while the WebGL context is lost. */
  private gpuNotice: ModalHandle | null = null;
  private failedFrames = 0;
  private crashed = false;

  constructor() {
    const loaded = loadSave();
    this.save = loaded.save;
    this.unreadable = loaded.unreadable;
    setScientific(this.save.settings.scientific);
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    const ui = document.getElementById('ui')!;
    this.renderer = new GameRenderer(canvas, this.currentSkin());
    this.renderer.setShadows(this.save.settings.shadows);
    this.renderer.setQuality(this.save.settings.quality);
    this.input = new Input(canvas);
    this.hud = new Hud(ui);
    this.hub = new Hub(ui, this);
    // Dev only: the import and the whole panel are dropped from release builds.
    if (import.meta.env.DEV) void import('./ui/debug').then((m) => (this.debug = new m.DebugPanel(ui, m.debugApiFor(this))));

    this.hub.onPlay = () => this.play();
    this.hub.onSettings = () => this.openSettings();
    this.hud.onAbility = (id) => this.useAbility(id);
    this.hud.onPause = () => this.pause();
    this.input.onAbility = (slot) => this.useAbility(ABILITIES[slot].id);
    this.input.onPadButton = (b) => this.onPadButton(b);
    this.input.onKey = (key) => {
      if (key === '`' || key === '~') this.debug?.toggle();
      if (key === 'Escape' && this.state === 'hub' && !anyModalOpen()) this.openSettings();
      if (key === 'Escape' && this.state === 'round') {
        // Esc resumes only when the pause menu is the top-most dialog (not under Settings).
        if (this.pauseMenu) {
          if (openModalCount() <= 1) this.resume();
        } else if (!anyModalOpen()) this.pause();
      }
      if ((key === 'Enter' || key === ' ') && this.state === 'hub' && !anyModalOpen() && document.activeElement === document.body) this.play();
    };

    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    // pagehide (not beforeunload) also fires on mobile and keeps the page eligible for bfcache.
    window.addEventListener('pagehide', () => this.persist());
    window.addEventListener('storage', (e) => {
      if (e.key !== SAVE_KEY || e.newValue === null) return;
      // Two tabs starting together (session restore) each save once; only the older one steps back.
      const at = (() => {
        try {
          return Number((JSON.parse(e.newValue) as { lastSeen?: unknown }).lastSeen) || Infinity;
        } catch {
          return Infinity;
        }
      })();
      if (at >= this.lastWriteAt) this.onSavedElsewhere();
    });
    // A page restored from the back/forward cache missed storage events while it was away.
    window.addEventListener('pageshow', (e) => {
      if (e.persisted && this.lastWritten !== null && storeGet(SAVE_KEY) !== this.lastWritten) this.onSavedElsewhere();
    });
    document.addEventListener('visibilitychange', () => this.onVisibility());
    canvas.addEventListener('webglcontextlost', () => this.onContextLost());
    canvas.addEventListener('webglcontextrestored', () => this.onContextRestored());
    this.applySettings();
  }

  // ------------------------------------------------------------------ lifecycle
  start(): void {
    const now = Date.now();
    const off = eco.computeOffline(this.save, now);
    this.enterHub();
    this.recoverPendingRound();
    if (off.earned > 0) {
      eco.earn(this.save, off.earned);
      showOffline(off.awaySeconds, off.creditedSeconds, off.earned, off.awaySeconds > off.creditedSeconds);
    }
    if (this.unreadable !== null) {
      // Keep the first damaged copy; if it cannot be stored, this session must not save over it.
      const kept = storeGet(UNREADABLE_SAVE_KEY) !== null || storeSet(UNREADABLE_SAVE_KEY, this.unreadable);
      if (!kept) this.stale = true;
      this.unreadable = null;
      infoDialog(
        'Your save could not be read',
        kept
          ? 'The stored save was damaged, so a new game has started. The damaged copy is kept in this browser instead of being overwritten.'
          : 'The stored save was damaged and there was no room to keep a copy, so this session will not save over it.',
      );
    }
    this.grantAchievements();
    // Store the credited offline time and recovered round now, so a quick reload cannot pay them twice.
    this.persist();
    requestAnimationFrame((t) => this.frame(t));
  }

  private onVisibility(): void {
    if (this.crashed) return;
    if (document.hidden) {
      this.hiddenAt = Date.now();
      this.pause(true);
      this.audio.setHidden(true);
      this.persist();
    } else if (this.hiddenAt) {
      this.audio.setHidden(false);
      // Tab was in the background: treat it like offline time (unless another tab took over).
      const off = eco.computeOffline({ ...this.save, lastSeen: this.hiddenAt }, Date.now());
      if (off.earned > 0 && !this.stale) {
        eco.earn(this.save, off.earned);
        showOffline(off.awaySeconds, off.creditedSeconds, off.earned, off.awaySeconds > off.creditedSeconds);
      }
      this.hiddenAt = 0;
      this.last = performance.now();
    }
  }

  persist(): void {
    if (this.stale) return;
    this.save.lastSeen = Date.now();
    this.save.pendingRoundCash = this.state === 'round' && this.world ? this.world.cash : 0;
    const text = serialize(this.save);
    if (storeSet(SAVE_KEY, text)) {
      this.lastWritten = text;
      this.lastWriteAt = this.save.lastSeen;
    }
  }

  /** Credits the cash of a round that was still running when the game last saved. */
  private recoverPendingRound(): void {
    const cash = this.save.pendingRoundCash;
    if (!(cash > 0)) return;
    this.save.pendingRoundCash = 0;
    eco.earn(this.save, cash);
    toast('Unfinished round', `+${formatCash(cash)} from the round you left`, { icon: '💰' });
  }

  /** Another tab or window saved the game. Saving from this one too would overwrite that progress. */
  private onSavedElsewhere(): void {
    if (this.stale || ephemeral()) return;
    this.stale = true;
    this.pause(true);
    infoDialog(
      'Playing in another tab',
      'Snack Hole was saved from another tab or window, so this one has stopped saving to keep that progress.',
      'Play here instead',
      () => location.reload(),
    );
  }

  private onContextLost(): void {
    this.pause(true);
    this.gpuNotice ??= infoDialog('Graphics paused', 'The graphics card reset. The game will continue as soon as the picture comes back.', 'Reload', () =>
      location.reload(),
    );
  }

  private onContextRestored(): void {
    this.gpuNotice?.close();
    this.gpuNotice = null;
  }

  /** Replaces the whole save (import, restore, reset), keeping the old one as the backup. */
  private replaceSave(next: SaveData): void {
    storeSet(BACKUP_SAVE_KEY, JSON.stringify({ at: Date.now(), save: serialize(this.save) }));
    this.save = next;
    this.recoverPendingRound();
    this.applySettings();
    this.renderer.setSkin(this.currentSkin());
    this.grantAchievements();
    this.hub.selectTab('upgrades');
    this.enterHub();
    this.persist();
  }

  private currentSkin() {
    return SKINS.find((s) => s.id === this.save.skin) ?? SKINS[0];
  }

  // ------------------------------------------------------------------ states
  private setState(st: State): void {
    this.state = st;
    document.body.classList.toggle('in-round', st !== 'hub');
  }

  private enterHub(): void {
    this.resume();
    this.setState('hub');
    this.input.enabled = false;
    this.input.reset();
    this.hud.show(false);
    this.hub.show(true);
    this.startDemo();
    this.audio.setAmbient(this.save.selectedMap);
    this.audio.setMusicMode('hub');
  }

  /** Attract mode behind the hub: a bot-driven hole roams the selected map. */
  private startDemo(): void {
    const cfg = eco.buildRoundConfig(this.save);
    cfg.startLevel = Math.max(5, cfg.startLevel + 3);
    cfg.helpers = 0;
    cfg.cashMult = 0;
    this.world = new World(generateMap(this.save.selectedMap), cfg, { demo: true, seed: devFlags.seed ?? (Date.now() & 0xffff) });
    this.renderer.setWorld(this.world);
    this.hubRestart = 0;
    prewarmThumbs(new Set(this.world.objects.map((o) => o.t)));
  }

  play(): void {
    if (this.state !== 'hub' || anyModalOpen()) return;
    // A half-started round has no way out, so any error here stops the game with the error screen.
    try {
      this.startRound();
    } catch (err) {
      console.error(err);
      this.crash(err);
    }
  }

  private startRound(): void {
    this.audio.unlock();
    this.audio.click();
    this.setState('round');
    this.hub.show(false);
    const cfg = eco.buildRoundConfig(this.save);
    this.world = new World(generateMap(this.save.selectedMap), cfg, { seed: devFlags.seed ?? (Date.now() & 0xffffff) + 1 });
    this.renderer.setWorld(this.world);
    this.hud.setup(this.world);
    this.hud.show(true);
    this.input.enabled = true;
    this.roundDiscoveries.clear();
    const first = this.save.stats.rounds === 0;
    this.hud.banner(first ? 'EAT!' : 'GO!', first ? 'Swallow anything smaller than the hole' : eco.mapDef(cfg.mapId).name);
    if (first) {
      const touch = matchMedia('(pointer: coarse)').matches;
      this.hud.hint(touch ? '👆 Drag anywhere to steer the hole' : '🖱️ Point where you want to go (or use WASD / arrows)', 9);
    } else if (this.save.stats.rounds === 1) this.hud.hint('Bigger hole = bigger snacks. Keep eating to grow!', 5);
    else if (cfg.abilities.dash.level > 0 && this.save.stats.abilitiesUsed === 0) this.hud.hint('⚡ Press Space or tap the ability button to Dash', 6);
    else this.hud.hideHint();
    this.audio.setAmbient(cfg.mapId);
    this.audio.setMusicMode('round');
  }

  /** Opens the pause menu mid-round; `silent` skips the click (tab hidden, GPU reset, other tab). */
  pause(silent = false): void {
    const w = this.world;
    if (this.state !== 'round' || this.pauseMenu || !w || !w.running) return;
    this.input.enabled = false;
    this.input.reset();
    if (!silent) this.audio.click();
    this.audio.setMusicMode('paused');
    this.pauseMenu = showPause(
      {
        timeLeft: w.timeLeft,
        cash: w.cash,
        mapName: eco.mapDef(w.cfg.mapId).name,
        onSettings: () => this.openSettings(),
        onQuit: () => {
          if (this.world === w && w.running) w.timeLeft = 0;
        },
      },
      () => this.resume(),
    );
  }

  resume(): void {
    const menu = this.pauseMenu;
    if (!menu) return;
    this.pauseMenu = null;
    menu.close();
    if (this.state === 'round') {
      this.input.enabled = true;
      this.audio.setMusicMode('round');
    }
  }

  private endRound(): void {
    const w = this.world!;
    const s = this.save;
    this.setState('results');
    this.input.enabled = false;
    this.input.reset();
    // Warm-up safety net: a brand-new player can always afford a first upgrade.
    const warmupBonus = s.stats.rounds === 0 ? Math.max(0, 30 - w.cash) : 0;
    const total = w.cash + warmupBonus;
    eco.earn(s, total);
    const st = s.stats;
    st.rounds += 1;
    st.totalEaten += w.eaten + w.helperEaten;
    const bestCombo = w.comboBest > st.bestCombo && st.rounds > 1 && w.comboBest >= 5;
    st.bestCombo = Math.max(st.bestCombo, w.comboBest);
    st.bestLevel = Math.max(st.bestLevel, w.main.level + 1);
    const bestRound = total > st.bestRoundCash && st.rounds > 1;
    st.bestRoundCash = Math.max(st.bestRoundCash, total);
    if (w.biggest && w.biggest.f > st.biggestF) {
      st.biggestF = w.biggest.f;
      st.biggestType = OBJECT_TYPES[w.biggest.t].id;
    }
    const discoveries: { name: string; img: string }[] = [];
    for (const [t, n] of w.eatenByType) {
      const id = OBJECT_TYPES[t].id;
      if (!s.gulpedia[id]) discoveries.push({ name: OBJECT_TYPES[t].name, img: thumbFor(t) });
      s.gulpedia[id] = (s.gulpedia[id] ?? 0) + n;
    }
    const mapId = w.cfg.mapId;
    const pct = w.percentEaten;
    const bestPercent = pct > s.mapBest[mapId] + 1e-6 && s.mapBest[mapId] > 0 && pct >= 0.001;
    s.mapBest[mapId] = Math.max(s.mapBest[mapId], pct);
    const completed = pct >= 0.9995 && !s.map100[mapId];
    if (completed) s.map100[mapId] = true;
    eco.noteRound(s, mapId, w.main.level, total);
    // Reaching a map's size goal unlocks the next one; jump straight to it.
    for (const id of eco.unlockMaps(s)) {
      const m = eco.mapDef(id);
      s.selectedMap = id;
      toast(`${m.name} unlocked!`, m.sizeOffset ? `A bigger world: you start ${m.sizeOffset} sizes smaller here.` : 'Everything is worth more here.', { icon: m.icon });
    }
    this.grantAchievements();
    this.persist();
    // A cleared map already played the big fanfare when it happened.
    if (w.percentEaten < 0.9995) this.audio.fanfare();
    const biggest = w.biggest;
    showResults(
      {
        cash: total,
        helperCash: w.helperCash,
        bonus: warmupBonus,
        timeBonus: w.timeBonus,
        endReason: w.endReason ?? 'timeUp',
        passiveCash: 0,
        eaten: w.eaten + w.helperEaten,
        gold: w.goldEaten,
        biggestName: biggest ? OBJECT_TYPES[biggest.t].name : '',
        biggestImg: biggest ? thumbFor(biggest.t, biggest.tint) : '',
        percent: pct,
        bestPercent,
        completed,
        combo: w.comboBest,
        bestCombo,
        level: w.main.level,
        bestRound,
        discoveries,
        mapName: eco.mapDef(mapId).name,
      },
      () => this.enterHub(),
    );
  }

  // ------------------------------------------------------------------ frame
  /**
   * The next frame is requested before this one runs, so one exception cannot stop the loop. A
   * frame that keeps failing stops the game with an error screen instead of a silent freeze.
   */
  private frame(now: number): void {
    if (this.crashed) return;
    requestAnimationFrame((t) => this.frame(t));
    try {
      this.tick(now);
      this.failedFrames = 0;
    } catch (err) {
      console.error(err);
      if (++this.failedFrames >= MAX_FAILED_FRAMES) this.crash(err);
    }
  }

  private crash(err: unknown): void {
    this.crashed = true;
    this.persist();
    this.audio.setHidden(true);
    const save = encodeSaveText(serialize(this.save));
    showFatal('Snack Hole hit a problem', `The game stopped because of an error: ${err instanceof Error ? err.message : String(err)}. Your progress is saved.`, [
      { label: 'Reload', onClick: () => location.reload() },
      { label: 'Copy save', onClick: () => void navigator.clipboard?.writeText(save) },
    ]);
  }

  private tick(now: number): void {
    const t0 = performance.now();
    // Before reading any state: a button can start a round or pause it.
    this.input.pollGamepad();
    const realDt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const paused = this.pauseMenu !== null;
    // Landmark slow-motion: drops to 30% speed and eases back over SLOWMO seconds.
    let timeScale = 1;
    if (this.slowmo > 0 && !paused) {
      this.slowmo = Math.max(0, this.slowmo - realDt);
      const k = 1 - this.slowmo / SLOWMO;
      timeScale = 0.3 + 0.7 * k * k;
    }
    if (this.landmarkCd > 0) this.landmarkCd -= realDt;
    const dt = paused ? 0 : realDt * this.warp * timeScale;
    const s = this.save;
    if (!paused) s.stats.playSeconds += realDt;

    const w = this.world;
    if (w && !paused) {
      if (this.state === 'round') w.input = this.input.vector();
      else if (this.state === 'hub') w.input = this.bot.steer(w, dt);
      // Sub-step so time warp stays stable.
      const steps = Math.min(8, Math.max(1, Math.ceil(dt / 0.034)));
      const ts = performance.now();
      for (let i = 0; i < steps; i++) w.step(dt / steps);
      this.handleEvents(w);
      this.simMs += (performance.now() - ts - this.simMs) * 0.05;
      if (this.state === 'hub') {
        this.hubRestart += dt;
        // A big hole can pass 35% within a second; never restart sooner than 45 s.
        if ((w.percentEaten > 0.35 && this.hubRestart > 45) || this.hubRestart > 240) this.startDemo();
      }
    }
    this.renderer.noteFrame(realDt);
    this.renderer.render(paused ? 0 : realDt * timeScale, this.world, this.state === 'hub' ? 'hub' : 'round');
    if (w && this.state !== 'hub') this.hud.update(w, paused ? 0 : realDt);
    this.hub.update(realDt);
    this.audio.endFrame();

    this.saveTimer += realDt;
    if (this.saveTimer >= AUTOSAVE_SECONDS) {
      this.saveTimer = 0;
      this.persist();
      this.grantAchievements();
    }
    if (this.debug?.open) this.debug.refresh();
    this.frameMs += (performance.now() - t0 - this.frameMs) * 0.05;
  }

  private handleEvents(w: World): void {
    const inRound = this.state === 'round' || this.state === 'results';
    this.floatersThisFrame = 0;
    for (const e of w.events) {
      switch (e.k) {
        case 'eat': {
          const hole = w.holes[e.hole];
          const big = e.o.f >= 3;
          this.renderer.particles.swallowBurst(hole.x, hole.z, hole.r, e.hole === 0 ? this.renderer.skinColor : '#a8f0ff', Math.round(3 + e.o.f * 3), big);
          if (!inRound) break;
          this.audio.gulp(e.o.f);
          if (e.hole === 0) {
            this.onMainEat(w, e.o, e.cash);
            this.comboSound(w, e.combo);
          } else if (this.save.settings.floaters && this.floatersThisFrame < 2 && this.hud.floaterCount < 30) {
            const p = this.renderer.project(e.o.x, e.o.h, e.o.z);
            if (p) this.hud.floater(p.x, p.y, `+${formatCash(e.cash)}`, 'helper', 0.75);
          }
          if (big) this.shake(Math.min(1, e.o.f / (w.main.r * 3)));
          break;
        }
        case 'level': {
          if (!inRound) break;
          const hole = w.main;
          this.renderer.particles.ringBurst(hole.x, hole.z, hole.baseR, this.renderer.skinColor);
          this.renderer.pulseHole(1);
          this.audio.levelUp();
          const unlocked = this.newlyEdible(w, e.level);
          // Keep a fresh LANDMARK! banner on screen; the level-up shows as a floater instead.
          if (performance.now() < this.landmarkBannerUntil) {
            const p = this.renderer.project(hole.x, 0, hole.z);
            if (p) this.hud.floater(p.x, p.y - 90, `SIZE ${e.level + 1}!`, 'combo', 1.2);
          } else this.hud.banner(`SIZE ${e.level + 1}`, unlocked ? `Now you can eat: ${unlocked}` : '', 'small');
          break;
        }
        case 'comboEnd':
          this.comboMaxed = false;
          if (inRound && e.n >= 15 && this.save.settings.floaters) {
            const p = this.renderer.project(w.main.x, 0, w.main.z);
            if (p) this.hud.floater(p.x, p.y - 60, `COMBO ×${e.n}!`, 'combo', 1.3);
          }
          break;
        case 'ability':
          this.audio.ability(e.id);
          this.save.stats.abilitiesUsed++;
          if (e.id === 'mega') this.renderer.pulseHole(1.5);
          if (e.id === 'dash') {
            this.renderer.dashBurst(w);
            this.shake(0.35);
          }
          break;
        case 'event':
          if (inRound && e.on) {
            this.audio.eventStinger(e.id);
            const [title, sub] = EVENT_TEXT[e.id];
            this.hud.banner(title, sub);
          }
          break;
        case 'tick':
          this.audio.tick(e.s);
          break;
        case 'timeUp':
          this.hud.hideHint();
          this.audio.whistle();
          this.hud.banner("TIME'S UP!", '', 'big');
          break;
        case 'cleared':
          this.hud.hideHint();
          this.audio.fanfare(true);
          this.shake(1);
          this.hud.banner('MAP CLEARED!', 'You ate absolutely everything', 'big');
          break;
        case 'snackedOut':
          this.hud.hideHint();
          this.audio.whistle();
          this.hud.banner('ALL SNACKED OUT!', e.bonusFrac > 0 ? `Time bonus +${Math.round(e.bonusFrac * 100)}%` : 'Nothing left your size', 'big');
          break;
        case 'end':
          if (this.state === 'round') {
            // A failed end-of-round would leave the game stuck without a results screen.
            try {
              this.endRound();
            } catch (err) {
              console.error(err);
              this.crash(err);
            }
          }
          break;
        case 'gone':
          break;
      }
    }
    w.events.length = 0;
  }

  /**
   * Combo chimes climb every 5 swallows; past the top of the scale only every 25th rings, and
   * once the multiplier is capped one flourish plays and the streak goes quiet.
   */
  private comboSound(w: World, combo: number): void {
    if (combo <= 1) this.comboMaxed = false;
    if (this.comboMaxed) return;
    if (combo > 1 && w.comboMultiplier >= w.cfg.comboCap - 1e-9) {
      this.comboMaxed = true;
      this.audio.comboMax();
      if (this.save.settings.floaters) {
        const p = this.renderer.project(w.main.x, 0, w.main.z);
        if (p) this.hud.floater(p.x, p.y - 70, 'MAX COMBO!', 'combo', 1.2);
      }
      return;
    }
    if (combo < 5 || combo % 5 !== 0) return;
    const step = combo / 5;
    if (step <= 10 || combo % 25 === 0) this.audio.combo(Math.min(step, 10));
  }

  private onMainEat(w: World, o: WObj, cash: number): void {
    const s = this.save;
    const t = o.t;
    const f = o.f;
    if (o.gold) {
      this.audio.goldDing();
      this.renderer.particles.swallowBurst(w.main.x, w.main.z, w.main.r, '#ffd23d', 16, true);
    }
    if (s.settings.floaters && (o.gold || (this.floatersThisFrame < 4 && this.hud.floaterCount < 40))) {
      this.floatersThisFrame++;
      const p = this.renderer.project(o.x, Math.min(o.h, 4), o.z);
      if (p) {
        const scale = Math.min(2.2, 0.85 + Math.log10(1 + f) * 0.9) * (o.gold ? 1.25 : 1);
        this.hud.floater(p.x, p.y, `${o.gold ? '✨ ' : ''}+${formatCash(cash)}`, o.gold ? 'gold' : w.combo >= 25 ? 'hot' : '', scale);
      }
    }
    this.maybeLandmark(w, o, cash);
    this.hud.bumpCash();
    this.renderer.pulseHole(Math.min(1, 0.25 + f / w.main.r));
    const id = OBJECT_TYPES[t].id;
    if (!s.gulpedia[id] && !this.roundDiscoveries.has(t)) {
      this.roundDiscoveries.add(t);
      toast(`New: ${OBJECT_TYPES[t].name}`, 'Added to the Gulpedia', { img: cachedThumb(t) || undefined, icon: '✨', kind: 'gulp', ms: 2200 });
    }
  }

  /**
   * Landmarks get two tiers. The first one of a kind ever (new to the Gulpedia) gets the full
   * moment: slow-motion, camera pull-back, dust, rumble and a banner. Later ones near your size
   * limit get a light version (dust, rumble, shake) that does not interrupt play.
   */
  private maybeLandmark(w: World, o: WObj, cash: number): void {
    const def = OBJECT_TYPES[o.t];
    if (!def.landmark || this.state !== 'round') return;
    const firstEver = !this.save.gulpedia[def.id] && !this.roundDiscoveries.has(o.t);
    if (firstEver) {
      this.landmarkCd = 2.5;
      this.slowmo = SLOWMO;
      this.landmarkBannerUntil = performance.now() + 1500;
      this.renderer.landmarkBurst(w, o.f, true);
      this.shake(0.9);
      this.audio.landmark(o.f, true);
      this.hud.banner('NEW LANDMARK!', `${o.gold ? '✨ Golden ' : ''}${def.name} · +${formatCash(cash)}`);
      return;
    }
    if (this.landmarkCd > 0 || o.f < 0.55 * SIZE.fit * w.main.r) return;
    this.landmarkCd = 2.5;
    this.renderer.landmarkBurst(w, o.f, false);
    this.shake(0.5);
    this.audio.landmark(o.f, false);
  }

  /** Names of prop types that just became edible at this level (for the level-up banner). */
  private newlyEdible(w: World, level: number): string {
    const fitNow = SIZE.fit * eco.radiusForLevel(level);
    const fitBefore = SIZE.fit * eco.radiusForLevel(level - 1);
    const names = new Set<string>();
    for (const o of w.objects) {
      if (o.event) continue;
      if (o.f <= fitNow && o.f > fitBefore) names.add(OBJECT_TYPES[o.t].name);
    }
    return [...names].slice(0, 3).join(', ');
  }

  /**
   * Gamepad buttons. Dialogs: A presses the focused button, B or Start closes (like Esc). Hub: A or
   * Start plays. Round: A / RB Dash, X / LB Vortex, Y / RT Mega Mouth, Start pauses.
   */
  private onPadButton(b: number): void {
    if (anyModalOpen()) {
      if (b === PAD.a) activateFocused();
      else if (b === PAD.b || b === PAD.start) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return;
    }
    if (this.state === 'hub' && (b === PAD.a || b === PAD.start)) this.play();
    else if (this.state === 'round') {
      if (b === PAD.start) this.pause();
      else if (b === PAD.a || b === PAD.rb) this.useAbility('dash');
      else if (b === PAD.x || b === PAD.lb) this.useAbility('vortex');
      else if (b === PAD.y || b === PAD.rt) this.useAbility('mega');
    }
  }

  useAbility(id: AbilityId): void {
    if (this.state !== 'round' || !this.world) return;
    if (!this.world.useAbility(id) && this.world.cfg.abilities[id].level > 0) this.audio.deny();
  }

  // ------------------------------------------------------------------ purchases
  private afterPurchase(ok: boolean, structural = false): void {
    if (ok) {
      this.audio.buy();
      this.grantAchievements();
      if (structural) this.hub.markDirty();
    } else this.audio.deny();
  }

  buyUpgrade(id: UpgradeId): void {
    const before = this.save.upgrades[id];
    const firstEver = Object.values(this.save.upgrades).every((v) => v === 0);
    const got = eco.buyUpgrade(this.save, id, 1);
    this.afterPurchase(got > 0, firstEver || before + got >= eco.upgradeDef(id).max);
  }

  buyHelper(): void {
    this.afterPurchase(eco.buyHelper(this.save), true);
  }

  buyHelperLevel(): void {
    this.afterPurchase(eco.buyHelperLevel(this.save));
  }

  buyAbility(id: AbilityId): void {
    const was = this.save.abilities[id];
    const ok = eco.buyAbility(this.save, id);
    this.afterPurchase(ok, was === 0);
    if (ok && was === 0) toast(`${eco.abilityDef(id).name} unlocked!`, `Press ${eco.abilityDef(id).key} during a round.`, { icon: eco.abilityDef(id).icon });
  }

  selectMap(id: MapId): void {
    if (!this.save.maps[id] || this.state !== 'hub') return;
    this.save.selectedMap = id;
    this.audio.click();
    this.startDemo();
    this.audio.setAmbient(id);
    this.hub.markDirty();
  }

  buyDm(id: DmUpgradeId): void {
    this.afterPurchase(eco.buyDmUpgrade(this.save, id), true);
  }

  buySkin(id: string): void {
    const sk = SKINS.find((s) => s.id === id);
    if (!sk || sk.achievement || this.save.skins.includes(id) || this.save.dm < sk.cost) {
      this.audio.deny();
      return;
    }
    this.save.dm -= sk.cost;
    this.save.skins.push(id);
    this.afterPurchase(true, true);
    this.equipSkin(id);
  }

  equipSkin(id: string): void {
    if (!this.save.skins.includes(id)) return;
    this.save.skin = id;
    this.renderer.setSkin(this.currentSkin());
    this.audio.click();
    this.hub.markDirty();
  }

  prestige(): void {
    const dm = eco.dmGain(this.save);
    if (dm <= 0) {
      this.audio.deny();
      return;
    }
    confirmDialog(
      'Collapse into a Singularity?',
      `You will gain ${formatNumber(dm)} Dark Matter (+${Math.round(dm * PRESTIGE.bonusPerDm * 100)}% cash forever). Cash, upgrades, helpers, abilities${eco.dmLevel(this.save, 'wormhole') ? '' : ' and maps'} reset.`,
      `Gain ${formatNumber(dm)} DM`,
      () => this.doPrestige(),
    );
  }

  private doPrestige(): void {
    this.save = eco.applyPrestige(this.save);
    this.audio.singularity();
    this.shake(1.5);
    this.grantAchievements();
    this.persist();
    this.flash();
    this.hub.selectTab('singularity');
    this.enterHub();
  }

  /** Screen shake, unless the player turned it off or prefers reduced motion. */
  private shake(amount: number): void {
    if (this.save.settings.shake && !reducedMotion()) this.renderer.shake(amount);
  }

  private flash(): void {
    if (reducedMotion()) return;
    const el = h('div', { class: 'flash' });
    document.getElementById('ui')!.appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }

  private grantAchievements(): void {
    for (const a of checkAchievements(this.save)) {
      this.audio.achievement();
      toast(`🏆 ${a.name}`, `${a.desc} (+2% cash)${a.skin ? ' · new skin!' : ''}`, { icon: a.icon, kind: 'ach' });
      this.hub.markDirty();
    }
  }

  // ------------------------------------------------------------------ settings
  private applySettings(): void {
    const st = this.save.settings;
    setScientific(st.scientific);
    this.audio.setVolume(st.volume, st.muted, st.music, st.tunes);
    this.renderer.setShadows(st.shadows);
    this.renderer.setQuality(st.quality);
  }

  openSettings(): void {
    showSettings({
      settings: this.save.settings,
      apply: () => {
        this.applySettings();
        this.hub.markDirty();
      },
      reset: () => this.replaceSave(defaultSave()),
      exportSave: () => encodeSaveText(serialize(this.save)),
      importSave: (text, done) => {
        let next: SaveData | null;
        try {
          next = parseSave(decodeSaveText(text));
          // A save the game cannot start a round with is rejected before it replaces anything.
          if (next) eco.buildRoundConfig(next);
        } catch {
          next = null;
        }
        if (!next) return false;
        const save = next;
        confirmDialog(
          'Import this save?',
          `It has ${formatCash(save.cash)}, ${formatNumber(save.dm)} Dark Matter and ${formatNumber(save.stats.rounds)} rounds played. It replaces your current progress, which is kept as a backup you can restore from Settings.`,
          'Import',
          () => {
            done();
            this.replaceSave(save);
          },
        );
        return true;
      },
      backupTime: () => readBackup()?.at ?? null,
      restoreBackup: (done) => {
        const b = readBackup();
        if (!b) return;
        confirmDialog(
          'Restore the backup?',
          `This brings back the save from ${new Date(b.at).toLocaleString()} (${formatCash(b.save.cash)}, ${formatNumber(b.save.dm)} Dark Matter). Your current progress becomes the backup.`,
          'Restore',
          () => {
            done();
            this.replaceSave(b.save);
          },
        );
      },
    });
  }

  // ------------------------------------------------------------------ debug
  /** Read-only snapshot for the debug panel and smoke tests. */
  get debugState() {
    return { state: this.state, world: this.world, save: this.save, frameMs: this.frameMs, simMs: this.simMs, syncMs: this.renderer.syncMs };
  }
}
