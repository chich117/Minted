# Wingy Hills

A Tiny Wings–style slope glider built for phones. Pure HTML5 Canvas +
JavaScript — no build step, no dependencies, no assets to download.

You're a little bird that can't really fly. But you can run, slide, and use the
hills. Dive down the slopes to build speed, fling yourself off the crests, and
glide as far as you can before the sun sets.

## Play

Open `index.html` in any browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000 on your phone or desktop
```

For the best experience, open it on your phone and use "Add to Home Screen" to
launch it fullscreen.

## Controls

- **Press and hold** (tap & hold, or hold **Space** / **↓**) to **tuck and
  dive** — gravity pulls you down harder.
- **Release** to glide.
- **Pause** with the ❚❚ button (top-right), or press **P** / **Esc**.

## How to play

The whole game is one button, all about timing:

- **Dive on the downhills.** Holding while sliding down a slope rockets your
  speed up. Let go as the ground curves back up and the crest launches you into
  the air.
- **Dive back down.** In the air, hold again to dive steeply so you land right
  as the next slope is falling away.
- **Land clean = "perfect."** A fast landing that lines up with a downslope
  counts as a perfect slide. Chain perfects to raise your **score multiplier**
  and, after a few in a row, ignite **FEVER** — a glowing, double-points state.
- **Beat the sunset.** A day timer drains at the top of the screen. Crest a new
  hill to refill it. Run out of daylight and **night falls** — the run ends.

Score comes from distance, hilltops, and especially perfect slides while the
multiplier is high. Your best is saved locally.

## Features

- Procedurally generated rolling hills — endless, seamless, and growing taller
  and faster the farther you fly.
- Authentic one-button slope physics (a unified projectile + slide model):
  dive to gain speed, ride the crests, and get flung naturally.
- **Perfect-slide combos** with a building multiplier and a **Fever** mode.
- A draining **sun timer** with a day-to-dusk sky that darkens as time runs out.
- Responsive canvas that fits any phone and survives rotation, with
  frame-rate–independent physics.
- Pause / resume (button or keyboard), plus auto-pause when the tab loses focus.
- Generated sound effects via the Web Audio API (no audio files).
- Best score saved locally with `localStorage`.
- **Installable PWA** — add it to your home screen for a fullscreen, offline app
  (a service worker caches the whole game).

## Install on your phone

1. Open the game in your mobile browser.
2. Use **Add to Home Screen** (Share menu on iOS, ⋮ menu on Android).
3. Launch it from the home screen icon — it runs fullscreen and works offline.

## Files

| File                      | Purpose                                          |
| ------------------------- | ------------------------------------------------ |
| `index.html`              | Markup, overlays (start / pause / game over).    |
| `style.css`               | Layout, HUD, multiplier, overlay styling.        |
| `game.js`                 | Game loop, terrain, slope physics, scoring.      |
| `manifest.webmanifest`    | PWA metadata (name, icons, display mode).        |
| `sw.js`                   | Service worker for offline caching.              |
| `icon.svg` / `icon-*.png` | App icons (SVG source + generated PNGs).         |
| `tools/gen_icons.py`      | Regenerates the PNG icons from scratch.          |
