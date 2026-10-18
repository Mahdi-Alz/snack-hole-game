# Snack Hole

A hole roams a bright low-poly world and swallows everything smaller than itself — cones, people,
cars, houses, skyscrapers, cargo ships, jumbo jets — feeding a deep incremental meta-game.

![Big round](screenshots/desktop-05-biground.png)

## Run it

```bash
cd snack-hole-game
npm install
npm run dev        # http://localhost:5101
```

```bash
npm run build      # type-check + production build into dist/
npm test           # unit tests
npm run sim -- --human --runs 6 --report   # balance sim with PASS/FAIL pacing targets
npm run smoke      # browser smoke test (needs Google Chrome)
```

## Controls

| Action | Desktop | Touch |
|---|---|---|
| Steer | Mouse (distance from centre = speed), WASD or arrows | Drag anywhere |
| Dash / Vortex / Mega Mouth | Space or 1 / 2 / 3 | On-screen buttons |
| Play | Click PLAY or Enter | Tap PLAY |
| Settings / Pause | Esc | ⚙️ / ⏸ |

Gamepads work too: stick or d-pad steers, A / X / Y for abilities, Start pauses.

## Features

- 6 procedural maps with traffic, animals and events; 106 prop types
- Timed rounds with combos, golden props, landmarks and an early finish when you run out of snacks
- Upgrades, helper holes, abilities, Singularity prestige with endless tiers, skins
- Gulpedia collection and 42 trophies
- Save export / import, offline earnings, installable and playable offline

## Development

In `npm run dev`, press **`** (backtick) for the debug panel. URL flags for testing:
`?mute&fresh&seed=7` (see `src/dev/flags.ts`).

[DESIGN.md](DESIGN.md) covers the economy, pacing and architecture; [CREDITS.md](CREDITS.md)
lists third-party assets.

## License

[MIT](LICENSE)
