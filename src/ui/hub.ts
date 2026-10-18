import { MAPS } from '../config/balance';
import { mapDef, passiveIncome, roundTimeFor, startLevel } from '../core/economy';
import { formatCash, formatNumber, formatPercent, formatRate } from '../core/format';
import type { Card } from './cards';
import { h, setText, toggleClass } from './dom';
import { TABS, renderTab, type HubApi, type TabId } from './tabs';

/** Between-rounds screen: top bar, big Play button and the tabbed shop panel. */
export class Hub {
  readonly root: HTMLDivElement;
  private cash: HTMLDivElement;
  private rate: HTMLDivElement;
  private dm: HTMLDivElement;
  private tabBar: HTMLDivElement;
  private content: HTMLDivElement;
  private playMap: HTMLDivElement;
  private playInfo: HTMLDivElement;
  private playBtn: HTMLButtonElement;
  private cards: Card[] = [];
  private tab: TabId = 'upgrades';
  private tabButtons = new Map<TabId, HTMLButtonElement>();
  private dirty = true;
  private acc = 0;
  private lastCash = -1;
  onPlay: (() => void) | null = null;
  onSettings: (() => void) | null = null;

  constructor(
    parent: HTMLElement,
    private api: HubApi,
  ) {
    this.cash = h('div', { class: 'top-cash' });
    this.rate = h('div', { class: 'top-rate' });
    this.dm = h('div', { class: 'top-dm' });
    const settings = h('button', { class: 'icon-btn', title: 'Settings', onclick: () => this.onSettings?.() }, '⚙️');
    this.tabBar = h('div', { class: 'tab-bar' });
    this.content = h('div', { class: 'tab-content' });
    this.playMap = h('div', { class: 'play-map' });
    this.playInfo = h('div', { class: 'play-info' });
    this.playBtn = h('button', { class: 'play-btn', onclick: () => this.onPlay?.() }, h('span', { class: 'play-icon' }, '▶'), 'PLAY');
    this.root = h(
      'div',
      { class: 'hub hidden' },
      h(
        'div',
        { class: 'topbar' },
        h('div', { class: 'brand' }, h('span', { class: 'brand-hole' }), h('span', { class: 'brand-text' }, 'Snack Hole')),
        h('div', { class: 'top-stats' }, h('div', { class: 'top-cash-wrap' }, this.cash, this.rate), this.dm),
        settings,
      ),
      h('div', { class: 'play-area' }, this.playMap, this.playBtn, this.playInfo),
      h('div', { class: 'panel' }, this.tabBar, this.content),
    );
    parent.appendChild(this.root);
  }

  show(on: boolean): void {
    toggleClass(this.root, 'hidden', !on);
    if (on) this.dirty = true;
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  markDirty(): void {
    this.dirty = true;
  }

  selectTab(id: TabId): void {
    this.tab = id;
    this.api.save.flags[`tab_${id}`] = true;
    this.dirty = true;
  }

  private rebuild(): void {
    const s = this.api.save;
    this.tabBar.innerHTML = '';
    this.tabButtons.clear();
    const visible = TABS.filter((t) => t.visible(s));
    if (!visible.some((t) => t.id === this.tab)) this.tab = 'upgrades';
    s.flags.tab_upgrades = true;
    if (this.tab) s.flags[`tab_${this.tab}`] = true;
    for (const t of visible) {
      const isNew = !s.flags[`tab_${t.id}`];
      const b = h(
        'button',
        { class: `tab-btn ${t.id === this.tab ? 'on' : ''}`, title: t.name, onclick: () => this.selectTab(t.id) },
        h('span', { class: 'tab-icon' }, t.icon),
        h('span', { class: 'tab-name' }, t.name),
        isNew ? h('span', { class: 'tab-new' }, 'NEW') : null,
      );
      this.tabButtons.set(t.id, b);
      this.tabBar.appendChild(b);
    }
    const scroll = this.content.scrollTop;
    this.content.innerHTML = '';
    this.cards = [];
    this.content.appendChild(renderTab(this.tab, this.api, this.cards));
    this.content.scrollTop = scroll;
    this.dirty = false;
  }

  /** Keeps tab visibility in sync as cash crosses unlock thresholds. */
  private visibleSignature(): string {
    const s = this.api.save;
    return TABS.filter((t) => t.visible(s))
      .map((t) => t.id)
      .join(',');
  }

  private lastSig = '';

  update(dt: number): void {
    if (!this.visible) return;
    const s = this.api.save;
    const sig = this.visibleSignature();
    if (sig !== this.lastSig) {
      this.lastSig = sig;
      this.dirty = true;
    }
    if (this.dirty) {
      this.rebuild();
      this.lastCash = -1;
    }
    this.acc += dt;
    if (this.acc < 0.1 && s.cash === this.lastCash) return;
    this.acc = 0;
    this.lastCash = s.cash;
    setText(this.cash, formatCash(s.cash));
    const rate = passiveIncome(s);
    setText(this.rate, rate > 0 ? `+$${formatRate(rate)}/s` : '');
    setText(this.dm, s.dmTotal > 0 || s.dm > 0 ? `🌑 ${formatNumber(s.dm)} DM` : '');
    toggleClass(this.dm, 'hidden', !(s.dmTotal > 0 || s.dm > 0));
    const m = mapDef(s.selectedMap);
    setText(this.playMap, `${m.icon} ${m.name}`);
    const first = s.stats.rounds === 0;
    setText(
      this.playInfo,
      first
        ? 'Warm-up round · 20s · steer with mouse, touch or WASD'
        : `${roundTimeFor(s)}s · start size ${startLevel(s) + 1} · best ${formatPercent(s.mapBest[s.selectedMap])}${s.map100[s.selectedMap] ? ' ✅' : ''}`,
    );
    for (const c of this.cards) c.update();
    // Highlight tabs with something affordable.
    for (const [id, b] of this.tabButtons) toggleClass(b, 'has-buy', id !== this.tab && this.tabHasAffordable(id));
  }

  private tabHasAffordable(id: TabId): boolean {
    const s = this.api.save;
    if (id === 'maps') {
      const i = MAPS.findIndex((m) => !s.maps[m.id]);
      return i > 0 && s.maps[MAPS[i - 1].id] && s.cash >= MAPS[i].cost;
    }
    return false;
  }
}
