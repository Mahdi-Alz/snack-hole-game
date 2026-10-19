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
6. The round ends when time runs out, when the map is cleared, or early once the hole is
   **snacked out** (below). Results (cash, time bonus, biggest bite, % map eaten, best combo, new
   Gulpedia entries, records) → hub → shop → Play again.
7. Reaching a map's **size goal** unlocks the next map and switches to it.

A round only counts once it ends: closing the tab (or the phone killing it) mid-round keeps nothing
from that round. Ending it from the pause menu does count.

### Round length and early finish

- Rounds last 60 s; Round Time adds +10 s per level, up to 100 s.
- `World.reachable()` works out what the hole can still eat: the props that fit now, plus the
  ones it would fit after growing on all of those (smallest first, one pass to the fixed point),
  plus what Mega Mouth would fit while it is active or recharges before time runs out.
- Every 0.5 s the round checks it. It is **snacked out** when nothing is reachable, or when no
  more growth is possible and the reachable leftovers would pay less than 5% of the round's cash
  so far. Round cash includes combo, so the leftovers are valued at the combo cap. A random event
  still to come starts at once instead. Crumbs never end a round on a map that has not been
  cleared yet while everything left on it is reachable, so the last few % of its 100% stay
  playable.
- Finishing early (snacked out or map cleared) pays a time bonus of +1% of the round's cash per
  second left, up to +50%.

## Size & objects

- Radius `R(L) = 0.75 * 1.125^L`. L starts at Starting Size + Dense Core − the map's size offset −
  the Singularity tier (at most 10), and every round begins with half the XP of its first level.
- XP for L → L+1: `8 * R(L)^2 * min(1, (L + 2) / 6)`. A prop gives `f^2` XP, times
  `1 + 3 * (f / 0.9R)^3` for props close to the size limit. Equal exponents keep the number of
  your-size props per level constant, so growth runs at a steady ~4–6 s per level instead of
  stalling late in a round; the near-limit bonus lets sparse top tiers (a few huge landmarks)
  still grow you. The ramp makes the first few levels quick.
- Each map has an `xpMul`: denser maps grow you slower so each one takes several rounds.
- Object footprint `f = max(0.425 * hypot(w, d), 0.12 h) * scale`.
- Object value `max(1, round(6 f^1.3 (1 + h/20) * typeMul)) * mapMul`. The low exponent keeps
  income growing steadily with size (about x1.17 per level) instead of jumping when a tier of big
  props becomes edible.
- Speed `(4.5 + 2.1 R) * (1 + 0.08 * speedLvl)` m/s. Camera distance `(13 + 7.5 R)`, more on
  portrait screens.
- Map % eaten is weighted by ground area (`f^2`), so landmarks count for far more than cones.
- Size ladders: after generation, `fillLadder` (`core/mapgen/ladder.ts`) shrinks a few props from
  the next tier up into any size level that has nothing new to eat, then closes gaps left right
  below lone landmarks by shrinking everything above them. A test keeps every map's ladder free
  of gaps longer than one level. The ladder test does not check distance, so the next step also
  has to sit near the start: the airport apron carries forklifts, big baggage dollies, follow-me
  cars and service vans for sizes 8–11, otherwise those sizes stalled for 10–30 s per level while
  the hole crossed to the landside trees.
- Solid props (buildings, vehicles, silos, domes…: `solid` in `objects.ts`) block placement:
  scatter never puts props inside them, forced layouts drop small props whose core lands inside
  a solid 1.5x bigger, and wandering animals/people walk around them (1 m blocking raster that
  frees up once the solid is eaten; ponds stay blocked).

## Resources

| Resource | Earned by | Spent on | Reset by Singularity |
|---|---|---|---|
| Cash ($) | rounds (helpers eat for you during rounds), offline return bonus | upgrades, helpers, abilities | yes |
| Dark Matter (DM) | Singularity | DM tree, skins | no |

## Golden props, events and landmarks

- **Golden props**: every prop rolls `1% + 1% * GoldenTouchLvl` (9% at the max level 8) to spawn golden each
  round: worth x10, drawn in gold with a moving glint and sparkles, coin ding + gold floater on
  swallow. Results show how many you ate (✨).
- **Random events** (rounds only, not the hub demo): at round start each event rolls its chance
  (rush hour 30%, UFO 25%, stampede 35% on the farm). Hits play one at a time, the first 8–16 s in
  and the next 4–8 s after the previous ends, while ≥ 12 s remain. Measured: ~50% of rounds have
  an event (~68% on the farm), even with the base 60 s round.
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

Swallows within the window (`1.2 s + 0.15 s * comboLvl`) of the previous one stack.
`comboMult = min(1 + 0.02 * (stack - 1), 2 + 0.15 * comboLvl)`.

## Cash upgrades (`cost = base * growth^level * 4^tier`)

Capped tracks with few, chunky levels and no milestone multipliers. One level is bought at a
time (no bulk buy). Growth-type upgrades (Speed, Growth Rate, Magnet, Round Time) raise how many
levels a round gains, so they are priced like size upgrades.

| Upgrade | Effect per level | Base | Growth | Max | Visible at (run $) |
|---|---|---|---|---|---|
| Starting Size | +1 start level | 45 | 1.65 | 45 | 0 |
| Speed | +8% speed | 60 | 4.5 | 8 | 0 |
| Cash Value | +25% cash (linear) | 100 | 3.5 | 10 | 0 |
| Round Time | +10 s (base 60 s, max 100 s) | 400 | 8 | 4 | 0 |
| Growth Rate | +10% XP | 150 | 5 | 6 | 100 |
| Magnet | pull range `R * (0.15 + 0.12 lvl)` | 200 | 4.5 | 8 | 300 |
| Combo Window | +0.15 s window, +0.15 cap | 500 | 4 | 8 | 1,500 |
| Golden Touch | +1% golden chance (base 1%) | 5,000 | 4 | 8 | 15,000 |
| Offline Vault | +1 h offline cap (base 8 h) | 3,000 | 10 | 4 | 5,000 |

## Helper holes

- Count 1–4, one-off costs `2K, 50K, 1M, 25M` (visible after $800).
- Training level: `5,000 * 3.5^lvl` (max 10). Radius `0.7 * 1.13^lvl` (cap 2.4 m), +10% radius
  and speed per Quantum Helpers level.
- Helpers only work during rounds: they chase the nearest edible prop and earn 60% of its value.
  They earn nothing between rounds or offline.

## Abilities (unlock once, then level up to 5)

| Ability | Key | Effect | Cooldown | Unlock cost |
|---|---|---|---|---|
| Dash | Space / 1 | x2.8 speed for 0.6 s | 7 s | $5K |
| Vortex | 2 | magnet +300% range, x3 pull, 4 s | 22 s | $100K |
| Mega Mouth | 3 | radius x1.45, 5 s | 30 s | $3M |

Level cost `unlock * 4^lvl`; each level −12% cooldown, +20% duration.
Rounds start with Dash ready and Vortex / Mega Mouth half charged (`startCharge`), so the big
ones land mid-round instead of being spent at second 0 on a tiny hole.

Esc (or the ⏸ button) pauses a round: the simulation freezes, with Resume / Settings / End round
(keeps the cash eaten so far). Hiding the tab also pauses.

## Maps

Maps unlock by size, not cash: reach a map's size goal in a round and the next map unlocks (and
is selected). Later maps also need Singularities.

| Map | Unlock | Goal (size) | Value x | Size offset | XP x |
|---|---|---|---|---|---|
| Sunny Suburb | free | 17 | 1 | 0 | 1 |
| Happy Farm | Suburb goal | 20 | 6 | 8 | 0.81 |
| Downtown | Farm goal | 26 | 45 | 16 | 0.62 |
| Harbor | Downtown goal | 25 | 236 | 22 | 0.47 |
| Airport | Harbor goal + 1 Singularity | 28 | 1,000 | 31 | 0.8 |
| Moon Base | Airport goal + 3 Singularities | 26 | 1,400 | 35 | 0.81 |

Offsets were picked so you enter each map near the bottom of its size ladder with the Starting
Size that cleared the previous goal, and need about 5 more levels to reach its goal (5–8 rounds
on a first visit). Value multipliers make a new map's first rounds pay ~1.75x the previous map's
last ones (Airport and Moon were raised to 1,000 and 1,400 because their first rounds paid less
than the previous map's last ones). Goals
sit just below each map's lone top landmark: a goal on a single prop is a cliff. Every map tracks
its best %; reaching 100% gives a permanent +25% cash (kept through prestige).

## Singularity (prestige)

- Available once Downtown is unlocked in the run.
- Dark Matter comes from lifetime cash: `DM total = floor(1.75 * (lifetimeCash / 1e6)^0.25)`, and a
  Singularity pays what has not been claimed yet. Doubling DM needs ~16x the cash, and collapsing
  again at the same point pays nothing, so runs must push further. The panel shows the gain, its
  % of all DM earned so far, the income multiplier after reset, and a hint once the gain is +50%.
- Resets cash, upgrades, helpers, abilities, maps (Wormhole keeps maps), map goals and recent
  income. Keeps DM, DM tree, records, Gulpedia, trophies, 100% bonuses, skins, tier.
- Every DM ever earned gives +10% cash forever (spending does not reduce it).
- DM tree: Event Horizon (+25% cash), Dense Core (+1 start size), Head Start
  (start with $300 × 10^(lvl−1)), Quantum Helpers (+10% helper radius and speed), Gravity Well
  (+1 magnet level), Hawking Radiation (+2 h offline cap), Wormhole (keep maps, 40 DM).
- **Endless tiers.** A Singularity after a run that reached the Moon Base goal raises the tier:
  every map starts 1 size smaller per tier up to 10 sizes (tier 10), map payouts and all cash
  prices scale x4 per tier, and DM gains are x(1 + 0.1 × tier). Past tier 10 a tier only scales
  the numbers, so with maxed Starting Size and Dense Core Moon Base still starts 15 sizes below its
  goal (uncapped it would start at size 1 from about tier 20). Tiers 1, 3, 5 and 10 unlock skins
  (trophies).
- Skins (rim colour + swirl pattern: spiral, rings, stars, galaxy or none) cost 3–30 DM or come
  from trophies.

## Offline earnings

Coming back pays half a round of your recent income (average of the last 5 rounds) per hour
away, from 3 minutes up to an 8 h cap (4 rounds' worth). Offline Vault adds +1 h per level and
Hawking Radiation +2 h per level (18 h max). It needs no helpers and keeps working after a
Singularity (recent income starts low again). Time with the tab hidden counts the same way.

## Gulpedia & trophies

- Gulpedia: all 106 prop types with 3D thumbnails, discovered on first swallow, lifetime counts.
  10 sets (Street, Nature, People & Pets, Park, Vehicles, Buildings, Farm, Harbor, Airport, Moon);
  each completed set gives +5% cash.
- 42 trophies, each +2% cash; seven also unlock skins (four of them for Singularity tiers).

## Pacing (from `npm run sim -- --runs 6 --human --report`)

`npm run sim` plays real rounds with a greedy bot (same World + map generators) that shops
cheapest-first (Head Start cash before a run's first round) and collapses once the DM gain is
+50% of all DM it has earned and progress has stalled (the next map needs a Singularity, or 4 rounds
without a better size). `--human` = slower re-targeting, 80% stick input, rare ability use and
20 s per shop visit. `--report` checks the pacing targets (PASS/FAIL), `--trace` prints each
round's level-up times, `--seed` changes the world seeds.

| Event (human model) | Time |
|---|---|
| Growth Rate, Magnet | 2:40 |
| Happy Farm | 5:30 |
| first helper | 7:00 |
| Downtown | 15:30 |
| Harbor | 33:00 |
| first Singularity (+8 DM) | 46:26 |
| Airport (run 2) | 1h 05m |
| Moon Base (run 4) | 2h 01m |
| first tier (run 4 collapse) | 2h 25m |

Targets met in the latest report (11/17): first size-up ≤ 5 s (3.3 s), 4–8 s per level (4.0 s),
last level ≤ 1.5x the first (1.02x; the first size-up is scaled to a full level's XP), no dead
time, 1–3 purchases per shop visit (3), Starting Size costing 0.3–1.5 rounds (0.62), first
Singularity at 46 min, run 2 back to Harbor in 42% of run 1's time, DM per run growing at most x2
(8, 6, 7, 11, 17, 27), all maps at 2h 01m, 8 h offline = 4 rounds. `--seed 2` and `--seed 3` give
12; any change to the sim's random draws reshuffles which borderline targets pass.
Misses: radius growth per round 7.4x (target 3–5x, which needs 7+ s per level in a 100 s round,
and Downtown/Harbor goals sit 16–20 sizes above their entry level); 90% of visits buying something
or able to after one more round, counting cash left over (89%: late runs spend many rounds on
cleared maps with only Starting Size left to buy, until the sim's +50% DM rule lets it collapse);
cheapest option left 0.53 rounds of income (target 1–3: run 1 income doubles every round across
~10 open tracks and later runs buy 10–30 levels per visit on the early maps); 4–8 rounds per map
in run 1 (4, 6, 9: Downtown took 9); run 3 reaches the Airport in 76% of run 2's time (target
25–55%: each run adds only ~+50% DM, about 1.3x income, and both runs clear the early maps at
about one round per map); skill band 1.09–1.49x (target 1.5–3: a 1.4-skill bot gains only 0.5–2
more sizes per round than a 0.6-skill one, so the band is mostly round-to-round noise).

## Architecture

```
src/
  config/      balance.ts (economy numbers), objects.ts (prop catalogue: 106 types)
  core/        pure logic, no DOM/three — runs headless in tests and the sim
    format.ts      number formatting (K, M, B, T, Qa, Qi, scientific)
    economy.ts     costs, effects, map unlocks, offline, prestige and tiers, round config
    save.ts        versioned save, migration, defaults
    round.ts       settleRound: books a finished round into the save (game and sim share it)
    world.ts       round simulation: holes, swallowing, movers, combo, abilities, early finish
    roundEvents.ts rush hour, UFO fly-by and stampede (staged off-stage, run one at a time)
    traffic.ts     road vehicles slow for the vehicle ahead and take turns at junctions
                   (each looks 10x a second, not every frame)
    mapgen/        seeded procedural maps (builder + one generator per map, ladder.ts fills
                   size-ladder gaps)
    bot.ts         greedy steering (sim + hub attract mode)
    spatial.ts     uniform hash grid
    achievements.ts
  render/      three.js: scene/camera (resolution follows the canvas box; Auto quality lowers the
               pixel ratio while frames run slow), ground decal mesh + hole cut shader, hole
               view, procedural prop geometry, instanced objects, particles, thumbnails,
               motion.ts (prefers-reduced-motion)
  ui/          HTML overlay: hud, hub + tabs, cards, dialogs (focus trap, Esc), toasts, debug
               panel, input (mouse, touch, keys by KeyboardEvent.code, gamepad), fatal.ts
               (error screen)
  audio/       WebAudio synth (gulps, mallet/bell chimes, countdown, fanfare, ambient beds with
               wind/surf swells, birds on the farm and suburb, gulls at the harbor) and
               music.ts: one CC0 track per map from public/music/ (CREDITS.md), looped
               gaplessly, cross-faded on map change, quieter in the hub, ducked while paused
  dev/         dev-only URL testing flags (?mute, ?fresh, ?save=NAME, ?seed=N) and fixture saves
  game.ts      state machine (hub → round → results), autosave, offline, purchases, crash guard
  persistence.ts  SaveStore: localStorage (memory for dev test saves), backup, damaged-save copy,
               one saving tab, warning when the browser refuses a write
  round-fx.ts  RoundFeedback: world events → sounds, particles, banners, floaters, shake,
               landmark slow-motion, results screen
  settings-flow.ts  settings dialog wiring: apply, export, import, restore backup, reset
  pwa.ts       service worker registration (release builds); service-worker.js is the template
               vite.config.ts turns into dist/sw.js
tests/         vitest: format, economy, shop (helpers, abilities, trophies, offline edges), save
               validation, round settlement, world/mapgen, pinned map layouts, events, prop
               builders, map size ladders
scripts/       sim.ts (balance), smoke.mjs / shots.mjs / ui-shots.mjs (Playwright screenshots),
               profile.mjs (frame timings), devServer.mjs (each script starts its own Vite
               unless given a URL)
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
