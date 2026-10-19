import { BACKUP_SAVE_KEY, LEGACY_SAVE_KEY, SAVE_KEY, UNREADABLE_SAVE_KEY } from './config/balance';
import { defaultSave, parseSave, serialize, type SaveData } from './core/save';
import { fixtureSave } from './dev/fixtures';
import { devFlags } from './dev/flags';
import { infoDialog } from './ui/dialogs';
import { toast } from './ui/toast';

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

/** The save replaced by the last import, restore or reset. */
export interface SaveBackup {
  at: number;
  save: SaveData;
}

/**
 * Where the save lives: localStorage (or memory for dev test saves), plus the backup kept by
 * import, restore and reset, and the copy of a save that could not be read. It also guards
 * against two tabs saving over each other: once another tab or window saves, this one goes
 * stale and stops writing. Storage problems are explained to the player here.
 */
export class SaveStore {
  private isStale = false;
  /** Called once, when another tab or window saves the game and this tab goes stale (before the notice shows). */
  private onSavedElsewhere: () => void = () => {};
  /** The save text this tab last wrote, and when (to spot other tabs' writes). */
  private lastWritten: string | null = null;
  private lastWriteAt = 0;
  private warnedWriteFailed = false;
  /** Raw text of a stored save that could not be read (kept aside, reported on start). */
  private unreadable: string | null = null;

  /** Another tab saved the game since this one loaded (or a damaged save could not be kept aside): this tab stops saving. */
  get stale(): boolean {
    return this.isStale;
  }

  /** Starts watching for other tabs' saves; `onSavedElsewhere` runs once, when this tab goes stale. */
  watchOtherTabs(onSavedElsewhere: () => void): void {
    this.onSavedElsewhere = onSavedElsewhere;
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
      if (at >= this.lastWriteAt) this.savedElsewhere();
    });
    // A page restored from the back/forward cache missed storage events while it was away.
    window.addEventListener('pageshow', (e) => {
      if (e.persisted && this.lastWritten !== null && storeGet(SAVE_KEY) !== this.lastWritten) this.savedElsewhere();
    });
  }

  /** The stored save (or a dev test save). An unreadable one gives a new save and is reported by reportUnreadable(). */
  load(): SaveData {
    if (import.meta.env.DEV && devFlags.save !== null) return fixtureSave(devFlags.save);
    if (import.meta.env.DEV && devFlags.fresh) return defaultSave();
    const raw = storeGet(SAVE_KEY) ?? storeGet(LEGACY_SAVE_KEY);
    if (!raw) return defaultSave();
    const save = parseSave(raw);
    if (save) return save;
    this.unreadable = raw;
    return defaultSave();
  }

  /**
   * Tells the player when load() found an unreadable save. The first damaged copy is kept aside;
   * if it cannot be stored, this tab goes stale so it never saves over the damaged save.
   */
  reportUnreadable(): void {
    const raw = this.unreadable;
    if (raw === null) return;
    this.unreadable = null;
    const kept = storeGet(UNREADABLE_SAVE_KEY) !== null || storeSet(UNREADABLE_SAVE_KEY, raw);
    if (!kept) this.isStale = true;
    infoDialog(
      'Your save could not be read',
      kept
        ? 'The stored save was damaged, so a new game has started. The damaged copy is kept in this browser instead of being overwritten.'
        : 'The stored save was damaged and there was no room to keep a copy, so this session will not save over it.',
    );
  }

  /**
   * Writes the save. False when this tab is stale or storage refused it; the first refusal tells
   * the player once per session.
   */
  write(save: SaveData): boolean {
    if (this.isStale) return false;
    const text = serialize(save);
    if (!storeSet(SAVE_KEY, text)) {
      if (!this.warnedWriteFailed) {
        this.warnedWriteFailed = true;
        toast("Progress can't be saved", 'This browser blocked the save or is out of space. Export your save from Settings to keep it.', { icon: '⚠️', ms: 8000 });
      }
      return false;
    }
    this.lastWritten = text;
    this.lastWriteAt = save.lastSeen;
    return true;
  }

  /** The save replaced by the last import, restore or reset, if it is still readable. */
  readBackup(): SaveBackup | null {
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

  /**
   * Stores `save` as the backup before it is replaced. False (and the player is told) when storage
   * works but refused the backup. When this session never stored a save at all (site data blocked),
   * there is nothing on disk to protect, so the replace may go ahead.
   */
  writeBackup(save: SaveData): boolean {
    if (storeSet(BACKUP_SAVE_KEY, JSON.stringify({ at: Date.now(), save: serialize(save) }))) return true;
    if (this.lastWritten === null) return true;
    infoDialog(
      'Save not replaced',
      'This browser could not store a backup of your current progress (storage is full or blocked), so nothing was changed. Export your save from Settings to keep a copy.',
    );
    return false;
  }

  /** Another tab or window saved the game. Saving from this one too would overwrite that progress. */
  private savedElsewhere(): void {
    if (this.isStale || ephemeral()) return;
    this.isStale = true;
    this.onSavedElsewhere();
    infoDialog(
      'Playing in another tab',
      'Snack Hole was saved from another tab or window, so this one has stopped saving to keep that progress.',
      'Play here instead',
      () => location.reload(),
    );
  }
}
