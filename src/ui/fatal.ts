import { h } from './dom';

export interface FatalAction {
  label: string;
  onClick: () => void;
}

/**
 * Full-screen message for problems the game cannot recover from: no WebGL, a failed start, or a
 * frame that keeps throwing. Plain DOM, so it works even when the renderer never came up.
 */
export function showFatal(title: string, body: string, actions: FatalAction[] = [{ label: 'Reload', onClick: () => location.reload() }]): void {
  document.querySelector('.fatal')?.remove();
  const el = h(
    'div',
    { class: 'fatal', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'fatal-title', 'aria-describedby': 'fatal-body' },
    h(
      'div',
      { class: 'fatal-box' },
      h('div', { class: 'brand-hole fatal-hole' }),
      h('h1', { id: 'fatal-title' }, title),
      h('p', { id: 'fatal-body' }, body),
      actions.length
        ? h('div', { class: 'modal-actions' }, ...actions.map((a, i) => h('button', { class: `btn ${i === 0 ? 'primary' : 'ghost'}`, onclick: a.onClick }, a.label)))
        : null,
    ),
  );
  (document.getElementById('ui') ?? document.body).appendChild(el);
  el.querySelector('button')?.focus();
}
