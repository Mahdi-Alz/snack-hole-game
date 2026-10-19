import { formatCash, formatDuration, formatNumber, formatPercent } from '../core/format';
import type { Quality, Settings } from '../core/save';
import type { EndReason } from '../core/world';
import { h } from './dom';

let layer: HTMLDivElement | null = null;

function host(): HTMLDivElement {
  if (!layer) {
    layer = h('div', { class: 'modal-layer' });
    document.getElementById('ui')!.appendChild(layer);
  }
  return layer;
}

export interface ModalHandle {
  el: HTMLDivElement;
  close: () => void;
}

interface OpenModal {
  box: HTMLDivElement;
  close: () => void;
  dismissable: boolean;
  openedAt: number;
}

/** Open modals, top-most last. Esc and focus trapping act on the top one. */
const stack: OpenModal[] = [];
let modalIds = 0;

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
/** A dialog that holds focus itself (results) ignores Enter / gamepad A for this long after opening. */
const BOX_ACTIVATE_DELAY = 600;

/**
 * Enter or gamepad A: presses the focused control, or the dialog's primary button when the dialog
 * box itself has focus (once it has been open for a moment, so a late Dash press cannot skip it).
 */
export function activateFocused(): void {
  const el = document.activeElement as HTMLElement | null;
  const top = stack[stack.length - 1];
  if (top && el === top.box) {
    if (performance.now() - top.openedAt >= BOX_ACTIVATE_DELAY) top.box.querySelector<HTMLElement>('.btn.primary')?.click();
  } else el?.click();
}

// Esc closes the top-most dismissable modal; Tab cycles focus inside it (focus trap).
document.addEventListener('keydown', (e) => {
  const top = stack[stack.length - 1];
  if (!top) return;
  if (e.key === 'Escape') {
    if (top.dismissable) top.close();
    // Handled here either way, so game shortcuts never act on an Esc meant for a dialog.
    e.preventDefault();
    e.stopImmediatePropagation();
  } else if (e.key === 'Enter' && document.activeElement === top.box) {
    e.preventDefault();
    activateFocused();
  } else if (e.key === 'Tab') {
    const items = [...top.box.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const inside = top.box.contains(document.activeElement);
    if (e.shiftKey && (document.activeElement === first || !inside)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
      e.preventDefault();
      first.focus();
    }
  }
});

/**
 * Dialog box over a dimmed backdrop. It takes focus (the first `.primary` button, else the first
 * control), traps Tab inside, closes on Esc and backdrop clicks when dismissable, and hands focus
 * back to whatever had it before.
 */
export function modal(content: HTMLElement, opts: { cls?: string; dismissable?: boolean; onClose?: () => void; focusBox?: boolean } = {}): ModalHandle {
  const backdrop = h('div', { class: 'modal-backdrop' });
  const box = h('div', { class: `modal ${opts.cls ?? ''}`, role: 'dialog', 'aria-modal': 'true', tabindex: '-1' }, content);
  const title = box.querySelector('h2, .res-title');
  if (title) {
    title.id ||= `modal-title-${++modalIds}`;
    box.setAttribute('aria-labelledby', title.id);
  }
  backdrop.appendChild(box);
  host().appendChild(backdrop);
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  requestAnimationFrame(() => backdrop.classList.add('show'));
  const first = opts.focusBox ? null : (box.querySelector<HTMLElement>('.btn.primary') ?? box.querySelector<HTMLElement>(FOCUSABLE));
  (first ?? box).focus({ preventScroll: true });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    const i = stack.indexOf(entry);
    if (i >= 0) stack.splice(i, 1);
    // The box goes dead to clicks and focus while it fades, so a double click never runs an action
    // twice. The backdrop stays hit-testable and swallows that click (close() is now a no-op), so it
    // never falls through to the hub's buy buttons underneath.
    box.inert = true;
    backdrop.classList.remove('show');
    setTimeout(() => backdrop.remove(), 250);
    // Return focus to the opener, or to the dialog now on top.
    const next = stack[stack.length - 1];
    if (next) next.box.focus({ preventScroll: true });
    else if (opener?.isConnected) opener.focus({ preventScroll: true });
    else (document.activeElement as HTMLElement | null)?.blur?.();
    opts.onClose?.();
  };
  const entry: OpenModal = { box, close, dismissable: opts.dismissable !== false, openedAt: performance.now() };
  stack.push(entry);
  if (opts.dismissable !== false) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });
  }
  return { el: box, close };
}

/** Message with one button. Not dismissable when it has an action of its own. */
export function infoDialog(title: string, body: string, button = 'OK', onClick?: () => void): ModalHandle {
  const m = modal(
    h(
      'div',
      null,
      h('h2', null, title),
      h('p', { class: 'modal-text' }, body),
      h(
        'button',
        {
          class: 'btn primary',
          onclick: () => {
            if (onClick) onClick();
            else m.close();
          },
        },
        button,
      ),
    ),
    { dismissable: !onClick },
  );
  return m;
}

export function anyModalOpen(): boolean {
  return !!layer && layer.childElementCount > 0;
}

export interface PauseInfo {
  timeLeft: number;
  cash: number;
  mapName: string;
  onSettings: () => void;
  onQuit: () => void;
}

/** Mid-round pause menu. Closing it (button, backdrop, Esc) resumes via `onClose`. */
export function showPause(info: PauseInfo, onClose: () => void): ModalHandle {
  const m = modal(
    h(
      'div',
      { class: 'pause' },
      h('h2', null, '⏸ Paused'),
      h('p', { class: 'modal-text' }, `${info.mapName} · ${formatDuration(Math.ceil(info.timeLeft))} left · ${formatCash(info.cash)} so far`),
      h('button', { class: 'btn primary big', onclick: () => m.close() }, 'Resume'),
      h(
        'div',
        { class: 'modal-actions' },
        h('button', { class: 'btn ghost', onclick: () => info.onSettings() }, 'Settings'),
        h(
          'button',
          {
            class: 'btn ghost',
            onclick: () => {
              m.close();
              info.onQuit();
            },
          },
          'End round',
        ),
      ),
      h('p', { class: 'set-hint' }, 'Press Esc to resume. Ending early keeps the cash you ate.'),
    ),
    { cls: 'pause-modal', onClose },
  );
  return m;
}

export function confirmDialog(title: string, body: string, yes: string, onYes: () => void, danger = false): void {
  const m = modal(
    h(
      'div',
      null,
      h('h2', null, title),
      h('p', { class: 'modal-text' }, body),
      h(
        'div',
        { class: 'modal-actions' },
        h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancel'),
        h(
          'button',
          {
            class: `btn ${danger ? 'danger' : 'primary'}`,
            onclick: () => {
              m.close();
              onYes();
            },
          },
          yes,
        ),
      ),
    ),
  );
}

export interface RoundResult {
  cash: number;
  helperCash: number;
  bonus: number;
  /** Paid for finishing early; included in `cash`. */
  timeBonus: number;
  endReason: EndReason;
  eaten: number;
  /** Golden props swallowed. */
  gold: number;
  biggestName: string;
  biggestImg: string;
  percent: number;
  bestPercent: boolean;
  completed: boolean;
  combo: number;
  bestCombo: boolean;
  level: number;
  bestRound: boolean;
  discoveries: { name: string; img: string }[];
  mapName: string;
}

/** End-of-round summary with a counting-up cash total. */
export function showResults(r: RoundResult, onContinue: () => void): void {
  const cashEl = h('div', { class: 'res-cash' }, '$0');
  const stat = (label: string, value: string, isNew = false) =>
    h('div', { class: 'res-stat' }, h('div', { class: 'res-label' }, label), h('div', { class: 'res-value' }, value, isNew ? h('span', { class: 'new-badge' }, 'NEW BEST') : null));
  const disc =
    r.discoveries.length > 0
      ? h(
          'div',
          { class: 'res-disc' },
          h('div', { class: 'res-label' }, `New in Gulpedia (${r.discoveries.length})`),
          h('div', { class: 'res-chips' }, ...r.discoveries.slice(0, 12).map((d) => h('div', { class: 'chip' }, d.img ? h('img', { src: d.img, alt: '' }) : null, d.name))),
        )
      : null;
  const content = h(
    'div',
    { class: 'results' },
    h('div', { class: 'res-title' }, r.endReason === 'cleared' ? '🍽️ MAP CLEARED!' : r.endReason === 'snackedOut' ? '😋 ALL SNACKED OUT!' : "TIME'S UP!"),
    h('div', { class: 'res-sub' }, r.mapName),
    cashEl,
    r.timeBonus > 0 ? h('div', { class: 'res-small' }, `incl. ${formatCash(r.timeBonus)} time bonus for finishing early`) : null,
    r.helperCash > 0 ? h('div', { class: 'res-small' }, `incl. ${formatCash(r.helperCash)} from helper holes`) : null,
    r.bonus > 0 ? h('div', { class: 'res-small' }, `incl. ${formatCash(r.bonus)} warm-up bonus — go buy an upgrade!`) : null,
    h(
      'div',
      { class: 'res-grid' },
      h('div', { class: 'res-stat big' }, h('div', { class: 'res-label' }, 'Biggest bite'), h('div', { class: 'res-biggest' }, r.biggestImg ? h('img', { src: r.biggestImg, alt: '' }) : null, r.biggestName || '—')),
      stat('Map eaten', formatPercent(r.percent), r.bestPercent),
      stat('Best combo', `×${r.combo}`, r.bestCombo),
      stat('Objects', `${formatNumber(r.eaten)}${r.gold > 0 ? ` · ✨${r.gold}` : ''}`),
      stat('Size reached', String(r.level + 1)),
    ),
    r.completed ? h('div', { class: 'res-bonus' }, '+25% permanent cash bonus for clearing this map!') : null,
    disc,
    h('button', { class: 'btn primary big', onclick: () => m.close() }, 'Continue'),
  );
  // Focus stays on the box: Space and gamepad A are Dash, and a late press must not skip the results.
  const m = modal(content, { cls: 'results-modal', dismissable: false, onClose: onContinue, focusBox: true });
  // Count-up animation.
  const start = performance.now();
  const dur = 900;
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / dur);
    const e = 1 - Math.pow(1 - t, 3);
    cashEl.textContent = `+${formatCash(r.cash * e)}`;
    if (t < 1) requestAnimationFrame(tick);
    else if (r.bestRound) cashEl.appendChild(h('span', { class: 'new-badge' }, 'RECORD'));
  };
  requestAnimationFrame(tick);
}

export function showOffline(seconds: number, credited: number, earned: number, capped: boolean): void {
  const m = modal(
    h(
      'div',
      { class: 'offline' },
      h('div', { class: 'offline-icon' }, '🌙'),
      h('h2', null, 'While you were away'),
      h('p', { class: 'modal-text' }, `You were gone for ${formatDuration(seconds)}. Your hole kept snacking${capped ? ` (capped at ${formatDuration(credited)})` : ''}.`),
      h('div', { class: 'res-cash' }, `+${formatCash(earned)}`),
      h('button', { class: 'btn primary big', onclick: () => m.close() }, 'Collect'),
    ),
  );
}

export interface SettingsApi {
  settings: Settings;
  apply: () => void;
  reset: () => void;
  exportSave: () => string;
  /** False when the text is not a save; otherwise asks to confirm and calls `done` once imported. */
  importSave: (s: string, done: () => void) => boolean;
  /** When the backup (the save replaced by the last import, restore or reset) was made, if any. */
  backupTime: () => number | null;
  restoreBackup: (done: () => void) => void;
}

const QUALITY_LABELS: Record<Quality, string> = { auto: 'Auto', high: 'High', low: 'Low (faster)' };

export function showSettings(api: SettingsApi): void {
  const s = api.settings;
  const quality = h('select', { 'aria-label': 'Graphics quality' }, ...Object.entries(QUALITY_LABELS).map(([v, label]) => h('option', { value: v }, label))) as HTMLSelectElement;
  quality.value = s.quality;
  quality.addEventListener('change', () => {
    s.quality = quality.value as Quality;
    api.apply();
  });
  const backupAt = api.backupTime();
  const toggle = (label: string, key: keyof Settings) => {
    const input = h('input', { type: 'checkbox' }) as HTMLInputElement;
    input.checked = Boolean(s[key]);
    input.addEventListener('change', () => {
      (s as unknown as Record<string, unknown>)[key] = input.checked;
      api.apply();
    });
    return h('label', { class: 'set-row' }, h('span', null, label), input);
  };
  const vol = h('input', { type: 'range', min: '0', max: '1', step: '0.05' }) as HTMLInputElement;
  vol.value = String(s.volume);
  vol.addEventListener('input', () => {
    s.volume = Number(vol.value);
    api.apply();
  });
  const io = h('textarea', { class: 'save-io', rows: '3', placeholder: 'Paste a save here to import' }) as HTMLTextAreaElement;
  const m = modal(
    h(
      'div',
      { class: 'settings' },
      h('h2', null, 'Settings'),
      h('label', { class: 'set-row' }, h('span', null, 'Volume'), vol),
      toggle('Mute all', 'muted'),
      toggle('Music', 'tunes'),
      toggle('Ambient sound', 'music'),
      toggle('Scientific notation', 'scientific'),
      h('label', { class: 'set-row' }, h('span', null, 'Graphics quality'), quality),
      toggle('Shadows', 'shadows'),
      toggle('Screen shake', 'shake'),
      toggle('Floating numbers', 'floaters'),
      h('div', { class: 'set-sub' }, 'Save data'),
      io,
      h(
        'div',
        { class: 'modal-actions wrap' },
        h(
          'button',
          {
            class: 'btn ghost',
            onclick: () => {
              io.value = api.exportSave();
              io.select();
            },
          },
          'Export',
        ),
        h(
          'button',
          {
            class: 'btn ghost',
            onclick: () => {
              const ok = api.importSave(io.value.trim(), () => m.close());
              io.classList.toggle('bad', !ok);
              io.setAttribute('aria-invalid', String(!ok));
            },
          },
          'Import',
        ),
        backupAt !== null
          ? h('button', { class: 'btn ghost', title: `Backup from ${new Date(backupAt).toLocaleString()}`, onclick: () => api.restoreBackup(() => m.close()) }, 'Restore backup')
          : null,
        h(
          'button',
          {
            class: 'btn danger',
            onclick: () =>
              confirmDialog(
                'Reset save?',
                'This wipes ALL progress, including Dark Matter, trophies and skins. Restore backup in Settings can bring it back until the next import or reset.',
                'Reset everything',
                () => {
                  m.close();
                  api.reset();
                },
                true,
              ),
          },
          'Reset save',
        ),
      ),
      import.meta.env.DEV ? h('p', { class: 'set-hint' }, 'Tip: press ` (backtick) for the debug panel.') : null,
      h('button', { class: 'btn primary', onclick: () => m.close() }, 'Done'),
    ),
  );
}
