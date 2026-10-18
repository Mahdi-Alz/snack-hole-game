import { h, setText, toggleClass } from './dom';

export interface CardButton {
  label: () => string;
  cost: () => string;
  can: () => boolean;
  onClick: () => void;
  /** Hide the button (e.g. maxed out) and show this text instead. */
  doneText?: () => string | null;
}

export interface CardSpec {
  icon: string | HTMLElement;
  title: string;
  level?: () => string;
  desc: string;
  effect?: () => string;
  button?: CardButton;
  cls?: string;
}

export interface Card {
  el: HTMLDivElement;
  update: () => void;
}

/** Shop card with live-updating level, effect line and buy button. */
export function card(spec: CardSpec): Card {
  const lvl = h('span', { class: 'card-lvl' });
  const effect = h('div', { class: 'card-effect' });
  const btnLabel = h('div', { class: 'buy-label' });
  const btnCost = h('div', { class: 'buy-cost' });
  const done = h('div', { class: 'card-done' });
  const btn = spec.button
    ? h(
        'button',
        {
          class: 'buy',
          onclick: (e: MouseEvent) => {
            e.stopPropagation();
            spec.button!.onClick();
          },
        },
        btnLabel,
        btnCost,
      )
    : null;
  const el = h(
    'div',
    { class: `card ${spec.cls ?? ''}` },
    h('div', { class: 'card-icon' }, spec.icon),
    h('div', { class: 'card-body' }, h('div', { class: 'card-title' }, spec.title, ' ', lvl), h('div', { class: 'card-desc' }, spec.desc), effect),
    btn,
    done,
  );
  const update = () => {
    setText(lvl, spec.level?.() ?? '');
    if (spec.effect) setText(effect, spec.effect());
    if (spec.button && btn) {
      const d = spec.button.doneText?.() ?? null;
      btn.style.display = d ? 'none' : '';
      done.style.display = d ? '' : 'none';
      if (d) setText(done, d);
      else {
        const label = spec.button.label();
        const cost = spec.button.cost();
        setText(btnLabel, label);
        setText(btnCost, cost);
        const can = spec.button.can();
        toggleClass(btn, 'can', can);
        toggleClass(el, 'affordable', can);
        // The visible label is just "+1 $1.2K"; screen readers also get the item and affordability.
        const name = `${spec.title}: ${label} for ${cost}${can ? '' : ' (not enough yet)'}`;
        if (btn.getAttribute('aria-label') !== name) btn.setAttribute('aria-label', name);
      }
    } else done.style.display = 'none';
  };
  update();
  return { el, update };
}

export function lockedCard(icon: string, title: string, hint: string): HTMLDivElement {
  return h(
    'div',
    { class: 'card locked' },
    h('div', { class: 'card-icon' }, '🔒'),
    h('div', { class: 'card-body' }, h('div', { class: 'card-title' }, `${icon} ${title}`), h('div', { class: 'card-desc' }, hint)),
  );
}

export function section(title: string, sub?: string): HTMLDivElement {
  return h('div', { class: 'section' }, h('div', { class: 'section-title' }, title), sub ? h('div', { class: 'section-sub' }, sub) : null);
}
