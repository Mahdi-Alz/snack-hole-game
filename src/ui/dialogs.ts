import { formatCash, formatDuration, formatNumber, formatPercent } from '../core/format';
import type { Settings } from '../core/save';
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

export function modal(content: HTMLElement, opts: { cls?: string; dismissable?: boolean; onClose?: () => void } = {}): ModalHandle {
  const backdrop = h('div', { class: 'modal-backdrop' });
  const box = h('div', { class: `modal ${opts.cls ?? ''}` }, content);
  backdrop.appendChild(box);
  host().appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('show'));
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    backdrop.classList.remove('show');
    setTimeout(() => backdrop.remove(), 250);
    opts.onClose?.();
  };
  if (opts.dismissable !== false) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });
  }
  return { el: box, close };
}

export function anyModalOpen(): boolean {
  return !!layer && layer.childElementCount > 0;
}

/** Number of stacked modals (including ones still fading out). */
export function openModalCount(): number {
  return layer ? layer.childElementCount : 0;
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
  passiveCash: number;
  bonus: number;
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
    h('div', { class: 'res-title' }, r.percent >= 0.9995 ? '🍽️ MAP CLEARED!' : "TIME'S UP!"),
    h('div', { class: 'res-sub' }, r.mapName),
    cashEl,
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
  const m = modal(content, { cls: 'results-modal', dismissable: false, onClose: onContinue });
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
      h('p', { class: 'modal-text' }, `You were gone for ${formatDuration(seconds)}. Your helper holes kept munching${capped ? ` (capped at ${formatDuration(credited)})` : ''}.`),
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
  importSave: (s: string) => boolean;
}

export function showSettings(api: SettingsApi): void {
  const s = api.settings;
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
              if (api.importSave(io.value.trim())) m.close();
              else io.classList.add('bad');
            },
          },
          'Import',
        ),
        h(
          'button',
          {
            class: 'btn danger',
            onclick: () =>
              confirmDialog('Reset save?', 'This wipes ALL progress, including Dark Matter, trophies and skins. It cannot be undone.', 'Reset everything', () => {
                m.close();
                api.reset();
              }, true),
          },
          'Reset save',
        ),
      ),
      import.meta.env.DEV ? h('p', { class: 'set-hint' }, 'Tip: press ` (backtick) for the debug panel.') : null,
      h('button', { class: 'btn primary', onclick: () => m.close() }, 'Done'),
    ),
  );
}
