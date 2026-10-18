# Snack Hole — Design

A hole roams a low-poly toy world and swallows anything that fits. Timed rounds feed a permanent
upgrade tree, new maps, helper holes, abilities and a prestige layer (Singularity).

All numbers live in `src/config/balance.ts` (economy) and `src/config/objects.ts` (props).
This file describes the formulas; the config is the source of truth.

## Core loop

1. Pick a map in the hub, press **Play** (a bot-driven demo hole roams the map behind the hub).
2. Steer for the round time: mouse = direction from screen centre, touch = virtual joystick,
   WASD / arrows override both.
3. An object falls in when its footprint `f <= 0.9 R` and its centre is inside the hole
   (`dist < R - 0.25 f`). Too-big objects overlapping the rim wobble. Small creatures flee.
4. Each swallow gives size XP and cash (`value * cashMult * comboMult`).
5. XP fills size levels; the radius tweens up; bigger things become edible
   ("Next: Car @ 10" in the HUD, "Now you can eat: …" on level-up).
6. Results (cash, biggest bite, % map eaten, best combo, new Gulpedia entries, records)
   → hub → shop → Play again.

The very first round is a 20 s warm-up (topped up to $30 if the player barely ate anything) so
the first upgrade is bought ~30–40 s after starting.

## Size & objects

- Radius `R(L) = 0.75 * 1.125^L`, L starts at `Starting Size` (+ Dense Core).
- XP for L → L+1: `4 * R(L)^3.3` (steep exponent keeps growth at ~+6–8 levels per round instead of
  an exponential snowball).
- Object footprint `f = max(0.425 * hypot(w, d), 0.12 h) * scale`.
- Object XP `f^2 + 0.2`; value `max(1, round(4 f^2 (1 + h/10) * typeMul)) * mapMul`.
- Speed `(4.5 + 2.1 R) * (1 + 0.04 * speedLvl)` m/s. Camera distance `(13 + 7.5 R)`, more on
  portrait screens.
- Map % eaten is weighted by ground area (`f^2`), so landmarks count for far more than cones.
- Bigger worlds: each map has a `sizeOffset`. The hole starts that many levels smaller there and
  size XP is scaled by `1.125^(-3.3 * 0.75 * sizeOffset)`, so it cannot re-grow to full size in one
  round. Starting Size, Growth Rate and Round Time are how you grow into a new map.
- Solid props (buildings, vehicles, silos, domes…: `solid` in `objects.ts`) block placement:
  scatter never puts props inside them, forced layouts drop small props whose core lands inside
  a solid 1.5x bigger, and wandering animals/people walk around them (1 m blocking raster that
  frees up once the solid is eaten; ponds stay blocked).

## Resources

| Resource | Earned by | Spent on | Reset by prestige |
|---|---|---|---|
| Cash ($) | swallowing, helper holes (passive + offline) | upgrades, helpers, abilities, maps | yes |
| Dark Matter (DM) | Singularity | DM tree, skins | no |

## Golden props, events and landmarks

- **Golden props**: every prop rolls `1% + 0.6% * GoldenTouchLvl` (max 10%) to spawn golden each
  round: worth x10, drawn in gold with a moving glint and sparkles, coin ding + gold floater on
  swallow. Results show how many you ate (✨).
- **Random events** (rounds only, not the warm-up): at round start each event rolls its chance
  (rush hour 30%, UFO 25%, stampede 35% on the farm). Hits play one at a time, the first 8–16 s in
  and the next 4–8 s after the previous ends, while ≥ 12 s remain. Measured: ~50% of rounds have
  an event (~68% on the farm), even with the base 50 s round.
  - 🚗 Rush hour: 18 extra vehicles from the map's traffic mix enter the roads out of view.
  - 🛸 UFO fly-by: a saucer (scale 0.7, edible when big enough) crosses just beyond the hole with
    a tractor beam, dropping 10 golden copies of the map's commonest small prop.
  - 🐄 Stampede (farm): 18 cows / sheep / pigs / horses charge across through the hole's row,
    veering around buildings, then leave the map.
  Event props are bonus snacks: they don't count toward map % or the size hints.
- **Landmarks** (houses, towers, barns, ships, jets, domes, big vehicles…: `landmark` in
  `objects.ts`), two tiers:
  - First one of a kind ever (new to the Gulpedia): 1.1 s of slow-motion (30% speed easing back),
    camera pull-back, dust burst, rumble + bell chord and a NEW LANDMARK! banner.
  - Later ones at ≥ 55% of your size limit: light version (smaller dust burst, quieter rumble,
    shake), no slow-mo or banner; 2.5 s cooldown.

## Combo

Swallows within the window (`1.2 s + 0.12 s * comboLvl`) of the previous one stack.
`comboMult = min(1 + 0.02 * (stack - 1), 2 + 0.05 * comboLvl)`.

## Cash upgrades (`cost = base * growth^level`)

| Upgrade | Effect per level | Base | Growth | Max | Visible at (run $) |
|---|---|---|---|---|---|
| Starting Size | +1 start level | 15 | 2.05 | 40 | 0 |
| Speed | +4% speed | 12 | 1.45 | 40 | 0 |
| Cash Value | +15% cash, x2 at Lv 25/50/75/100/150… | 25 | 1.42 | ∞ | 0 |
| Round Time | +5 s (base 50 s) | 60 | 1.6 | 24 | 0 |
| Growth Rate | +10% XP | 60 | 1.5 | 50 | 120 |
| Magnet | pull range `R * (0.1 + 0.06 lvl)` | 200 | 1.45 | 30 | 400 |
| Combo Window | +0.12 s window, +0.05 cap | 500 | 1.45 | 30 | 2,000 |
| Offline Vault | +1 h cap (base 4 h), +5% efficiency (base 50%) | 3,000 | 1.6 | 16 | first helper |
| Golden Touch | +0.6% golden chance (base 1%) | 20,000 | 2.1 | 15 | 15,000 |

Bulk buy x1 / x10 / Max uses `base * g^l * (g^n - 1)/(g - 1)`; Max solves for n in closed form.

## Helper holes

- Count 1–6, one-off costs `800, 9K, 90K, 900K, 9M, 90M` (visible after $500).
- Training level: `1,200 * 1.32^lvl` (max 40). Radius `0.7 * 1.05^lvl` (cap 2.4 m).
- In rounds helpers chase the nearest edible prop and earn 60% of its value.
- Passive income `helpers * 0.4 * 1.12^lvl * 1.5^quantum * cashMult * bestMapMul` $/s, always
  ticking (hub, rounds) and offline: `rate * min(away, cap) * efficiency`, with a
  "While you were away" dialog (also after long tab-hidden periods).

## Abilities (unlock once, then level up to 15)

| Ability | Key | Effect | Cooldown | Unlock cost |
|---|---|---|---|---|
| Dash | Space / 1 | x2.8 speed for 0.6 s | 7 s | $1.5K |
| Vortex | 2 | magnet +300% range, x3 pull, 4 s | 22 s | $15K |
| Mega Mouth | 3 | radius x1.45, 5 s | 30 s | $120K |

Level cost `unlock * 0.6 * 1.6^lvl`; each level −6% cooldown, +8% duration.
Rounds start with Dash ready and Vortex / Mega Mouth half charged (`startCharge`), so the big
ones land mid-round instead of being spent at second 0 on a tiny hole.

Esc (or the ⏸ button) pauses a round: the simulation freezes, with Resume / Settings / End round
(keeps the cash eaten so far). Hiding the tab also pauses.

## Maps

| Map | Unlock | Value x | Size offset | Biggest prop (size needed) |
|---|---|---|---|---|
| Sunny Suburb | free | 1 | 0 | Family House (~17) |
| Happy Farm | $6K | 5 | 2 | Big Red Barn (~19) |
| Downtown | $300K | 30 | 3 | Mega Tower (~27) |
| Harbor | $5M | 110 | 6 | Cargo Ship (~31) |
| Airport | $150M | 600 | 8 | Jumbo Jet (~31) |
| Moon Base | $3B | 1,700 | 11 | Moon Base HQ (~30) |

Maps are ordered by the size of their biggest props (the farm used to come after downtown and was
trivial to clear with a downtown-sized hole). Costs were calibrated with the human sim so each map
takes ~3–4 rounds before the next is affordable and a first round on a new map eats ~5–25%
(Harbor up to ~60%: by then the hole is strong). Multipliers are tuned against the offsets so a
new map always pays more than the previous one from the same save: ~2–3.5x in the first rounds
(simulated by playing both maps from a cloned save at every round).
Every map tracks its best %; reaching 100% gives a permanent +25% cash (kept through prestige).

## Singularity (prestige)

- Available at $10M earned this run: `DM = floor(5 * sqrt(runCash / 1e7))`, shown live with a
  progress bar to the next DM.
- Resets cash, upgrades, helpers, abilities, maps (Wormhole keeps maps). Keeps DM, DM tree,
  records, Gulpedia, trophies, 100% bonuses, skins.
- Every DM ever earned gives +10% cash forever (spending does not reduce it) → a big power spike.
- DM tree: Event Horizon (+25% cash), Dense Core (+1 start size), Time Dilation (+6 s),
  Head Start (start with $500 × 10^(lvl−1)), Quantum Helpers (x1.5 helper income),
  Gravity Well (+2 magnet levels), Hawking Radiation (+2 h offline cap, +10% efficiency),
  Wormhole (keep maps, 25 DM).
- Skins (rim colour + swirl pattern: spiral, rings, stars, galaxy, void) cost 3–30 DM or come
  from trophies.

## Gulpedia & trophies

- Gulpedia: all 106 prop types with 3D thumbnails, discovered on first swallow, lifetime counts.
  10 sets (Street, Nature, People & Pets, Park, Vehicles, Buildings, Farm, Harbor, Airport, Moon);
  each completed set gives +5% cash.
- 38 trophies, each +2% cash; three also unlock skins.

## Pacing (from `npm run sim`)

Greedy bot playing real rounds (same World + map generators). `--human` = slower re-targeting,
80% stick input, rare ability use and 20 s per shop visit instead of 12 s.

| Event | Bot | `--human` |
|---|---|---|
| warm-up done, first upgrades (Speed, Starting Size) | 0:32 | 0:40 |
| Growth Rate | 2:36 | 3:00 |
| Magnet | 4:55 | 7:00 |
| Happy Farm | 7:39 | 10:05 |
| Combo Window, first helper hole, Dash | ~9–11 | 8:30–11:40 |
| Downtown | 14:12 | 17:25 |
| Vortex | ~16 | 19:30 |
| Harbor, Singularity available | ~20–23 | ~24 |
| first Singularity (+11–18 DM) | ~25 | ~27 |
| second Singularity | +11 min | +15 min |

## Architecture

```
src/
  config/      balance.ts (economy numbers), objects.ts (prop catalogue: 106 types)
  core/        pure logic, no DOM/three — runs headless in tests and the sim
    format.ts      number formatting (K, M, B, T, Qa, Qi, scientific)
    economy.ts     costs, bulk buy, effects, offline, prestige, round config
    save.ts        versioned save, migration, defaults
    world.ts       round simulation: holes, swallowing, movers, combo, abilities
    mapgen/        seeded procedural maps (builder + one generator per map)
    bot.ts         greedy steering (sim + hub attract mode)
    spatial.ts     uniform hash grid
    achievements.ts
  render/      three.js: scene/camera, ground decal mesh + hole cut shader, hole view,
               procedural prop geometry, instanced objects, particles, thumbnails
  ui/          HTML overlay: hud, hub + tabs, cards, dialogs, toasts, debug panel, input
  audio/       WebAudio synth (gulps, mallet/bell chimes, countdown, fanfare, ambient beds with
               wind/surf swells, birds on the farm and suburb, gulls at the harbor) and
               music.ts: one CC0 track per map from public/music/ (CREDITS.md), looped
               gaplessly, cross-faded on map change, quieter in the hub, ducked while paused
  game.ts      state machine (hub → round → results), autosave, offline, purchases
tests/         vitest: format, economy, world/mapgen/save
scripts/       sim.ts (balance), smoke.mjs / shots.mjs / ui-shots.mjs (Playwright screenshots)
```

### Rendering notes

- Ground: one merged mesh of painted shapes (roads, lawns, water…) drawn with depth writes off
  in array order, then an invisible depth-only plane. Both discard fragments inside any hole
  (uniform array, up to 8 holes), so props sinking below y = 0 only show through the opening.
- Hole: back-side open cylinder with a dark gradient + animated stripes, swirl floor shader,
  bright rim ring and additive glow ring. Props darken with depth (`uFadeDepth`).
- Props: one `InstancedMesh` per type (≈40–60 draw calls per map); per-instance tint only on
  parts flagged `tintable`. Only dirty instances are rewritten each frame (~1 ms JS per frame
  with 1,700+ objects).
- See-through occluders: in rounds, props too big to swallow that sit between the camera and the
  hole fade to 45% opacity. They are hidden in their instanced mesh and drawn as a single mesh
  (depth-only pre-pass, then a blended colour pass so only the front surface shows).
- Dash: rim after-images left along the path (pooled additive rings), a shockwave ring, sparks
  off the trailing rim and a short FOV punch.
