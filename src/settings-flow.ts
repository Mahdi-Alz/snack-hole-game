import type { Audio } from './audio/audio';
import * as eco from './core/economy';
import { formatCash, formatNumber, setScientific } from './core/format';
import { decodeSaveText, defaultSave, encodeSaveText, parseSave, serialize, type SaveData, type Settings } from './core/save';
import type { SaveBackup } from './persistence';
import type { GameRenderer } from './render/scene';
import { confirmDialog, showSettings } from './ui/dialogs';

/** Pushes the player's settings to number formatting, audio, graphics and the HUD layout. */
export function applySettings(st: Settings, audio: Audio, renderer: GameRenderer): void {
  setScientific(st.scientific);
  audio.setVolume(st.volume, st.muted, st.music, st.tunes);
  renderer.setShadows(st.shadows);
  renderer.setQuality(st.quality);
  document.body.classList.toggle('abilities-left', st.abilitySide === 'left');
}

export interface SettingsFlow {
  save: () => SaveData;
  /** A setting changed (already stored in the save's settings). */
  onChange: () => void;
  /** Replaces the whole save (import, restore, reset); false when it was not replaced. */
  replaceSave: (next: SaveData) => boolean;
  readBackup: () => SaveBackup | null;
}

/** Opens the Settings dialog: options, plus export, import, backup restore and reset of the save. */
export function openSettingsDialog(f: SettingsFlow): void {
  const save = f.save();
  showSettings({
    settings: save.settings,
    apply: f.onChange,
    reset: () => f.replaceSave(defaultSave()),
    exportSave: () => encodeSaveText(serialize(f.save())),
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
      const imported = next;
      confirmDialog(
        'Import this save?',
        `It has ${formatCash(imported.cash)}, ${formatNumber(imported.dm)} Dark Matter and ${formatNumber(imported.stats.rounds)} rounds played. It replaces your current progress, which is kept as a backup you can restore from Settings.`,
        'Import',
        () => {
          done();
          f.replaceSave(imported);
        },
      );
      return true;
    },
    backupTime: () => f.readBackup()?.at ?? null,
    restoreBackup: (done) => {
      const b = f.readBackup();
      if (!b) return;
      confirmDialog(
        'Restore the backup?',
        `This brings back the save from ${new Date(b.at).toLocaleString()} (${formatCash(b.save.cash)}, ${formatNumber(b.save.dm)} Dark Matter). Your current progress becomes the backup.`,
        'Restore',
        () => {
          done();
          f.replaceSave(b.save);
        },
      );
    },
  });
}
