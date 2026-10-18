import { h } from './dom';

let host: HTMLDivElement | null = null;

function container(): HTMLDivElement {
  if (!host) {
    host = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.getElementById('ui')!.appendChild(host);
  }
  return host;
}

/** Small notification card that slides in and fades out. */
export function toast(title: string, body = '', opts: { icon?: string; img?: string; kind?: string; ms?: number } = {}): void {
  const c = container();
  const el = h(
    'div',
    { class: `toast ${opts.kind ?? ''}` },
    opts.img ? h('img', { class: 'toast-img', src: opts.img, alt: '' }) : opts.icon ? h('div', { class: 'toast-icon' }, opts.icon) : null,
    h('div', { class: 'toast-text' }, h('div', { class: 'toast-title' }, title), body ? h('div', { class: 'toast-body' }, body) : null),
  );
  c.appendChild(el);
  while (c.children.length > (window.innerWidth < 760 ? 2 : 4)) c.removeChild(c.firstChild!);
  setTimeout(() => el.classList.add('out'), opts.ms ?? 3200);
  setTimeout(() => el.remove(), (opts.ms ?? 3200) + 500);
}
