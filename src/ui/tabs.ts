import {
  ABILITIES,
  DM_UPGRADES,
  HELPERS,
  MAPS,
  MAP_COMPLETE_BONUS,
  PRESTIGE,
  SKINS,
  UPGRADES,
  type AbilityId,
  type DmUpgradeId,
  type MapId,
  type UpgradeId,
} from '../config/balance';
import { OBJECT_TYPES, SET_NAMES, type GulpSet } from '../config/objects';
import { ACHIEVEMENTS } from '../core/achievements';
import {
  abilityCooldown,
  abilityCost,
  abilityDuration,
  bulkCount,
  cashBreakdown,
  completedSets,
  dmForRunCash,
  dmLevel,
  dmUpgradeCost,
  geomBulkCost,
  gulpSetTypes,
  headStartCash,
  helperCountCost,
  helperLevelCost,
  helperRadius,
  isAbilityVisible,
  isUpgradeVisible,
  passiveIncome,
  runCashForDm,
  upgradeEffectText,
} from '../core/economy';
import { formatCash, formatNumber, formatPercent, formatRate } from '../core/format';
import type { SaveData } from '../core/save';
import { thumbFor } from '../render/thumbs';
import { card, lockedCard, section, type Card } from './cards';
import { h } from './dom';

export interface HubApi {
  save: SaveData;
  bulk: 1 | 10 | 'max';
  setBulk(b: 1 | 10 | 'max'): void;
  buyUpgrade(id: UpgradeId): void;
  buyHelper(): void;
  buyHelperLevel(): void;
  buyAbility(id: AbilityId): void;
  buyMap(id: MapId): void;
  selectMap(id: MapId): void;
  buyDm(id: DmUpgradeId): void;
  prestige(): void;
  buySkin(id: string): void;
  equipSkin(id: string): void;
}

export type TabId = 'upgrades' | 'helpers' | 'abilities' | 'maps' | 'singularity' | 'gulpedia' | 'trophies' | 'skins';

export interface TabDef {
  id: TabId;
  icon: string;
  name: string;
  visible: (s: SaveData) => boolean;
}

export const TABS: TabDef[] = [
  { id: 'upgrades', icon: '⭕', name: 'Upgrades', visible: () => true },
  { id: 'helpers', icon: '👯', name: 'Helpers', visible: (s) => s.runCash >= HELPERS.unlockAt * 0.6 || s.helpers > 0 || s.stats.prestiges > 0 },
  { id: 'abilities', icon: '⚡', name: 'Abilities', visible: (s) => s.runCash >= ABILITIES[0].unlockAt * 0.6 || s.stats.prestiges > 0 },
  { id: 'maps', icon: '🗺️', name: 'Maps', visible: (s) => s.runCash >= MAPS[1].cost * 0.3 || s.stats.prestiges > 0 },
  { id: 'singularity', icon: '🕳️', name: 'Singularity', visible: (s) => s.runCash >= PRESTIGE.minRunCash * 0.25 || s.stats.prestiges > 0 },
  { id: 'gulpedia', icon: '📖', name: 'Gulpedia', visible: (s) => s.stats.rounds >= 1 },
  { id: 'trophies', icon: '🏆', name: 'Trophies', visible: (s) => s.achievements.length > 0 },
  { id: 'skins', icon: '🎨', name: 'Skins', visible: (s) => s.skins.length > 1 || s.stats.prestiges > 0 },
];

const cost = (n: number) => formatCash(n);

function upgradesTab(api: HubApi, cards: Card[]): HTMLElement {
  const s = api.save;
  const root = h('div', { class: 'tab-body' });
  const bulkRow = h('div', { class: 'bulk-row' }, h('span', null, 'Buy'));
  for (const b of [1, 10, 'max'] as const) {
    bulkRow.appendChild(
      h('button', { class: `bulk-btn ${api.bulk === b ? 'on' : ''}`, onclick: () => api.setBulk(b) }, b === 'max' ? 'Max' : `x${b}`),
    );
  }
  root.appendChild(bulkRow);
  if (s.stats.rounds >= 1 && Object.values(s.upgrades).every((v) => v === 0)) {
    root.appendChild(h('div', { class: 'tip' }, '💡 Upgrades are permanent. Buy one, then hit PLAY to go again!'));
  }
  let teaser = false;
  for (const d of UPGRADES) {
    if (!isUpgradeVisible(s, d)) {
      if (!teaser && !d.needsHelper) {
        teaser = true;
        root.appendChild(lockedCard(d.icon, d.name, `Earn ${cost(d.unlockAt)} total to unlock.`));
      }
      continue;
    }
    const c = card({
      icon: d.icon,
      title: d.name,
      desc: d.desc,
      level: () => (d.max === Infinity ? `Lv ${s.upgrades[d.id]}` : `Lv ${s.upgrades[d.id]}/${d.max}`),
      effect: () => {
        const lvl = s.upgrades[d.id];
        if (lvl >= d.max) return `${upgradeEffectText(d.id, lvl)} (max)`;
        const n = Math.max(1, bulkCount(s, d.id, api.bulk));
        return `${upgradeEffectText(d.id, lvl)} → ${upgradeEffectText(d.id, lvl + n)}`;
      },
      button: {
        label: () => `+${Math.max(1, bulkCount(s, d.id, api.bulk))}`,
        cost: () => cost(geomBulkCost(d.base, d.growth, s.upgrades[d.id], Math.max(1, bulkCount(s, d.id, api.bulk)))),
        can: () => {
          const n = Math.max(1, bulkCount(s, d.id, api.bulk));
          return s.upgrades[d.id] < d.max && s.cash >= geomBulkCost(d.base, d.growth, s.upgrades[d.id], n);
        },
        onClick: () => api.buyUpgrade(d.id),
        doneText: () => (s.upgrades[d.id] >= d.max ? 'MAXED' : null),
      },
    });
    cards.push(c);
    root.appendChild(c.el);
  }
  return root;
}

function helpersTab(api: HubApi, cards: Card[]): HTMLElement {
  const s = api.save;
  const root = h('div', { class: 'tab-body' });
  const rate = h('div', { class: 'big-stat' });
  cards.push({
    el: rate,
    update: () => {
      rate.textContent = s.helpers > 0 ? `+${formatCash(passiveIncome(s)).replace('$', '$')}/s passive` : 'Helpers earn cash even while you are away.';
    },
  });
  root.appendChild(rate);
  if (s.runCash < HELPERS.unlockAt && s.helpers === 0) {
    root.appendChild(lockedCard('👯', 'Helper Holes', `Earn ${cost(HELPERS.unlockAt)} total to unlock.`));
    return root;
  }
  const count = card({
    icon: '🕳️',
    title: 'Helper Holes',
    desc: 'Mini holes roam during rounds eating small props (60% value) and earn passive cash.',
    level: () => `${s.helpers}/${HELPERS.countCosts.length}`,
    effect: () => `${s.helpers} → ${Math.min(HELPERS.countCosts.length, s.helpers + 1)} helpers`,
    button: {
      label: () => '+1',
      cost: () => cost(helperCountCost(s.helpers)),
      can: () => s.cash >= helperCountCost(s.helpers),
      onClick: () => api.buyHelper(),
      doneText: () => (s.helpers >= HELPERS.countCosts.length ? 'MAXED' : null),
    },
  });
  cards.push(count);
  root.appendChild(count.el);
  if (s.helpers > 0) {
    const lvl = card({
      icon: '📶',
      title: 'Helper Training',
      desc: 'Bigger helpers eat bigger props and earn +12% passive income per level.',
      level: () => `Lv ${s.helperLevel}/${HELPERS.levelMax}`,
      effect: () => `radius ${helperRadius(s.helperLevel).toFixed(2)}m → ${helperRadius(s.helperLevel + 1).toFixed(2)}m`,
      button: {
        label: () => '+1',
        cost: () => cost(helperLevelCost(s.helperLevel)),
        can: () => s.cash >= helperLevelCost(s.helperLevel),
        onClick: () => api.buyHelperLevel(),
        doneText: () => (s.helperLevel >= HELPERS.levelMax ? 'MAXED' : null),
      },
    });
    cards.push(lvl);
    root.appendChild(lvl.el);
  }
  return root;
}

function abilitiesTab(api: HubApi, cards: Card[]): HTMLElement {
  const s = api.save;
  const root = h('div', { class: 'tab-body' });
  root.appendChild(section('Abilities', 'Use during rounds with the keys shown or the on-screen buttons.'));
  let teaser = false;
  for (const a of ABILITIES) {
    if (!isAbilityVisible(s, a)) {
      if (!teaser) {
        teaser = true;
        root.appendChild(lockedCard(a.icon, a.name, `Earn ${cost(a.unlockAt)} total to reveal.`));
      }
      continue;
    }
    const c = card({
      icon: a.icon,
      title: a.name,
      desc: `${a.desc} Key: ${a.key}.`,
      level: () => (s.abilities[a.id] > 0 ? `Lv ${s.abilities[a.id]}/${a.maxLevel}` : 'Locked'),
      effect: () => {
        const l = s.abilities[a.id];
        if (l === 0) return `${abilityDuration(a.id, 1).toFixed(1)}s, every ${abilityCooldown(a.id, 1).toFixed(0)}s`;
        const now = `${abilityDuration(a.id, l).toFixed(1)}s / ${abilityCooldown(a.id, l).toFixed(1)}s cd`;
        if (l >= a.maxLevel) return now;
        return `${now} → ${abilityDuration(a.id, l + 1).toFixed(1)}s / ${abilityCooldown(a.id, l + 1).toFixed(1)}s`;
      },
      button: {
        label: () => (s.abilities[a.id] === 0 ? 'Unlock' : '+1'),
        cost: () => cost(abilityCost(a.id, s.abilities[a.id])),
        can: () => s.cash >= abilityCost(a.id, s.abilities[a.id]),
        onClick: () => api.buyAbility(a.id),
        doneText: () => (s.abilities[a.id] >= a.maxLevel ? 'MAXED' : null),
      },
    });
    cards.push(c);
    root.appendChild(c.el);
  }
  return root;
}

function mapsTab(api: HubApi, cards: Card[]): HTMLElement {
  const s = api.save;
  const root = h('div', { class: 'tab-body' });
  root.appendChild(section('Maps', `Eat 100% of a map for a permanent +${MAP_COMPLETE_BONUS * 100}% cash bonus.`));
  MAPS.forEach((m, i) => {
    const prevOwned = i === 0 || s.maps[MAPS[i - 1].id];
    if (!s.maps[m.id] && !prevOwned) {
      root.appendChild(lockedCard(m.icon, m.name, `Unlock ${MAPS[i - 1].name} first.`));
      return;
    }
    const c = card({
      icon: m.icon,
      title: m.name,
      cls: s.selectedMap === m.id ? 'selected' : '',
      desc: `${m.blurb} Value x${m.valueMul}.${m.sizeOffset ? ` Bigger world: your hole starts ${m.sizeOffset} sizes smaller and grows slower.` : ''}`,
      level: () => (s.map100[m.id] ? '✅ 100%' : s.maps[m.id] ? `best ${formatPercent(s.mapBest[m.id])}` : ''),
      button: {
        label: () => (s.maps[m.id] ? 'Select' : 'Unlock'),
        cost: () => (s.maps[m.id] ? '' : cost(m.cost)),
        can: () => (s.maps[m.id] ? true : s.cash >= m.cost),
        onClick: () => (s.maps[m.id] ? api.selectMap(m.id) : api.buyMap(m.id)),
        doneText: () => (s.selectedMap === m.id ? 'PLAYING' : null),
      },
    });
    cards.push(c);
    root.appendChild(c.el);
  });
  return root;
}

function singularityTab(api: HubApi, cards: Card[]): HTMLElement {
  const s = api.save;
  const root = h('div', { class: 'tab-body' });
  const gain = h('div', { class: 'sing-gain' });
  const bar = h('div', { class: 'progress-fill' });
  const barText = h('div', { class: 'progress-text' });
  const btn = h('button', { class: 'sing-btn', onclick: () => api.prestige() }, 'Collapse into Singularity');
  const info = h('div', { class: 'sing-info' });
  root.append(
    h('div', { class: 'sing-hero' }, h('div', { class: 'sing-orb' }), gain, h('div', { class: 'progress' }, bar, barText), btn, info),
  );
  cards.push({
    el: gain,
    update: () => {
      const dm = dmForRunCash(s.runCash);
      gain.textContent = dm > 0 ? `+${formatNumber(dm)} Dark Matter` : 'Not enough mass yet';
      const next = runCashForDm(dm + 1);
      const prev = dm > 0 ? runCashForDm(dm) : 0;
      const frac = Math.min(1, Math.max(0, (s.runCash - prev) / (next - prev)));
      bar.style.width = `${(frac * 100).toFixed(1)}%`;
      barText.textContent = `${formatCash(s.runCash)} / ${formatCash(next)} for ${dm > 0 ? 'next' : 'first'} DM`;
      btn.disabled = dm <= 0;
      info.textContent = `Resets cash, upgrades, helpers, abilities${dmLevel(s, 'wormhole') ? '' : ' and maps'}. Each DM ever earned gives +${PRESTIGE.bonusPerDm * 100}% cash forever (you have ${formatNumber(s.dmTotal)}).${headStartCash(s) > 0 ? ` Head Start gives ${formatCash(headStartCash(s))}.` : ''}`;
    },
  });
  root.appendChild(section('Dark Matter Tree', `Unspent: ${formatNumber(s.dm)} DM`));
  for (const d of DM_UPGRADES) {
    const c = card({
      icon: d.icon,
      title: d.name,
      desc: d.desc,
      level: () => `Lv ${dmLevel(s, d.id)}/${d.max}`,
      button: {
        label: () => '+1',
        cost: () => `${formatNumber(dmUpgradeCost(d.id, dmLevel(s, d.id)))} DM`,
        can: () => s.dm >= dmUpgradeCost(d.id, dmLevel(s, d.id)),
        onClick: () => api.buyDm(d.id),
        doneText: () => (dmLevel(s, d.id) >= d.max ? 'MAXED' : null),
      },
    });
    cards.push(c);
    root.appendChild(c.el);
  }
  const b = cashBreakdown(s);
  root.appendChild(section('Cash multiplier', `x${formatRate(b.total)} total`));
  root.appendChild(
    h(
      'div',
      { class: 'breakdown' },
      ...[
        ['Cash Value upgrade', b.upgrade],
        ['Dark Matter', b.darkMatter],
        ['Event Horizon', b.eventHorizon],
        ['Achievements', b.achievements],
        ['Gulpedia sets', b.sets],
        ['100% maps', b.maps],
      ].map(([k, v]) => h('div', { class: 'bd-row' }, h('span', null, String(k)), h('b', null, `x${formatRate(v as number)}`))),
    ),
  );
  return root;
}

function gulpediaTab(api: HubApi): HTMLElement {
  const s = api.save;
  const root = h('div', { class: 'tab-body' });
  const found = Object.keys(s.gulpedia).length;
  const done = completedSets(s);
  root.appendChild(section('Gulpedia', `${found}/${OBJECT_TYPES.length} discovered · ${done.length} sets complete (+5% cash each)`));
  const sets = [...new Set(OBJECT_TYPES.map((t) => t.set))] as GulpSet[];
  for (const set of sets) {
    const ids = gulpSetTypes(set);
    const have = ids.filter((id) => (s.gulpedia[id] ?? 0) > 0).length;
    const grid = h('div', { class: 'gulp-grid' });
    for (const id of ids) {
      const t = OBJECT_TYPES.findIndex((o) => o.id === id);
      const n = s.gulpedia[id] ?? 0;
      const def = OBJECT_TYPES[t];
      grid.appendChild(
        h(
          'div',
          { class: `gulp-item ${n > 0 ? '' : 'unknown'}`, title: n > 0 ? `${def.name} — eaten ${formatNumber(n)}` : 'Not discovered yet' },
          n > 0 ? h('img', { src: thumbFor(t), alt: def.name }) : h('div', { class: 'gulp-q' }, '?'),
          h('div', { class: 'gulp-name' }, n > 0 ? def.name : '???'),
          n > 0 ? h('div', { class: 'gulp-count' }, `×${formatNumber(n)}`) : null,
        ),
      );
    }
    root.append(h('div', { class: `gulp-set ${have === ids.length ? 'complete' : ''}` }, h('div', { class: 'gulp-set-title' }, `${SET_NAMES[set]} ${have}/${ids.length}${have === ids.length ? ' ✅' : ''}`), grid));
  }
  return root;
}

function trophiesTab(api: HubApi): HTMLElement {
  const s = api.save;
  const root = h('div', { class: 'tab-body' });
  root.appendChild(section('Trophies', `${s.achievements.length}/${ACHIEVEMENTS.length} · each gives +2% cash`));
  const grid = h('div', { class: 'ach-grid' });
  for (const a of ACHIEVEMENTS) {
    const got = s.achievements.includes(a.id);
    grid.appendChild(
      h(
        'div',
        { class: `ach ${got ? 'got' : ''}`, title: a.desc },
        h('div', { class: 'ach-icon' }, got ? a.icon : '🔒'),
        h('div', { class: 'ach-name' }, a.name),
        h('div', { class: 'ach-desc' }, a.desc + (a.skin ? ' (unlocks a skin)' : '')),
      ),
    );
  }
  root.appendChild(grid);
  return root;
}

function skinsTab(api: HubApi, cards: Card[]): HTMLElement {
  const s = api.save;
  const root = h('div', { class: 'tab-body' });
  root.appendChild(section('Hole Skins', 'Cosmetic rim glows and swirl patterns.'));
  for (const sk of SKINS) {
    const owned = s.skins.includes(sk.id);
    const swatch = h('div', { class: 'skin-swatch', style: `--rim:${sk.rim};--glow:${sk.glow};--swirl:${sk.swirlColor}` });
    const c = card({
      icon: swatch,
      title: sk.name,
      desc: owned ? `Swirl: ${sk.swirl}` : sk.achievement ? `Unlock: ${ACHIEVEMENTS.find((a) => a.id === sk.achievement)?.name ?? 'achievement'}` : `${sk.cost} Dark Matter`,
      button: {
        label: () => (s.skins.includes(sk.id) ? 'Equip' : 'Buy'),
        cost: () => (s.skins.includes(sk.id) ? '' : `${sk.cost} DM`),
        can: () => s.skins.includes(sk.id) || (sk.cost > 0 && !sk.achievement && s.dm >= sk.cost),
        onClick: () => (s.skins.includes(sk.id) ? api.equipSkin(sk.id) : api.buySkin(sk.id)),
        doneText: () => (s.skin === sk.id ? 'EQUIPPED' : !s.skins.includes(sk.id) && sk.achievement ? 'LOCKED' : null),
      },
    });
    cards.push(c);
    root.appendChild(c.el);
  }
  return root;
}

export function renderTab(id: TabId, api: HubApi, cards: Card[]): HTMLElement {
  switch (id) {
    case 'upgrades':
      return upgradesTab(api, cards);
    case 'helpers':
      return helpersTab(api, cards);
    case 'abilities':
      return abilitiesTab(api, cards);
    case 'maps':
      return mapsTab(api, cards);
    case 'singularity':
      return singularityTab(api, cards);
    case 'gulpedia':
      return gulpediaTab(api);
    case 'trophies':
      return trophiesTab(api);
    case 'skins':
      return skinsTab(api, cards);
  }
}
