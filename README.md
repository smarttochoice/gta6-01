# SOLANO HEAT

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/smarttochoice/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/smarttochoice/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game in the spirit of GTA 6, built for the
make.fun **gta6-01** bounty: drive and fight through the sun-soaked coastal
city of Solano Bay as Mara Reyes, getaway driver — five story jobs, traffic,
pedestrians, car theft, a wanted system with police chases, combat, a HUD with
a minimap, and a save that carries your progress.

Bounty: [gta6-01](https://make.fun/bounty/gta6-01)

Want to try make.fun yourself? Start here: https://make.fun/r/w57pvztf

## Play

Serve `game/` with any static server and open `game/index.html` in a desktop
browser — no build step, no network request, everything is vendored or drawn
in code:

```sh
node serve.ts   # serves game/ at http://localhost:8080
```

| Key | Action |
| --- | --- |
| WASD / arrows | Move on foot, drive in a car |
| SHIFT | Run |
| E | Enter / steal a car, leave a car |
| Mouse + click | Aim and shoot (on foot) |
| SPACE | Handbrake |
| P | Pause |
| M | Mute |
| ENTER | Start / retry a job |

## The game

- **A city to explore** — an 8×8 road grid of Solano Bay: apartment blocks,
  parks, palm-lined sidewalks, a beach and the ocean along the south edge,
  all generated from a seed (`?seed=N` rebuilds the same city).
- **On foot and by car** — walk, run, jack traffic cars (the driver bails and
  the law notices), steal parked cars, or take the yellow Comet GT.
- **Traffic and pedestrians** — cars cruise the road grid and stop for the car
  ahead; pedestrians stroll the sidewalks, flee gunfire and speeding cars.
- **Wanted system and police** — crimes build heat across five wanted stars;
  police cars spawn, chase and ram. Lose them out of sight and the heat
  bleeds off; get caught on foot and you are BUSTED, go down and you are
  WASTED.
- **Missions and a story** — five jobs for the fixer Dante Cole: a pickup at
  the docks, a timed car theft, a getaway from a three-star wanted level, a
  shootout on the pier, and a three-store robbery ending in a four-star
  escape to the safehouse. Cash rewards, side pickups ($, health, repairs),
  and a save in `localStorage` (C on the title screen continues).
- **HUD and minimap** — health/armor bars, cash, wanted stars, a bust meter,
  a speedometer with car health, a live minimap with the mission marker, and
  an off-screen GPS arrow.
- **Sound** — everything synthesized live with WebAudio: engine hum, sirens,
  gunshots, crashes, pickups, mission stings and a slow synthwave pad. No
  audio files.

## Layout

- `game/index.html` — the shell (1280×720 canvas, no network loads)
- `game/src/main.js` — boot, fixed-step loop, screens, save wiring
- `game/src/world.js` — simulation: driving, traffic AI, police AI, combat,
  wanted system, mission driver
- `game/src/city.js` — seeded city generation, buildings, road graph
- `game/src/render.js` — canvas renderer, HUD, minimap, screens
- `game/src/missions.js` — the five story jobs
- `game/src/input.js` — keyboard + mouse
- `game/src/audio.js` — WebAudio synth
- `game/src/shots.js` — staged screenshot scenes (`?shot=start|chase|mission|wanted`)
- `game/src/save.js` — localStorage save / continue
- `game/src/config.js` + `game/src/random.js` — tuning and seeded RNG
- `main.ts` — the entry program: copies `game/` + `screenshots/` to
  `/output` and writes `dossier.json` with the vendored make.fun library
- `screenshots/` — four real renders of the game's own code

Screenshots are staged deterministically: `?shot=<scene>&seed=1` plays the
real rules forward with an autopilot and freezes the frame (`shots.json`).

## Originality

Every name, character, place, line of story, piece of art and sound in this
game is original. No Rockstar Games name, logo, character, map, art, music or
asset is used anywhere.
