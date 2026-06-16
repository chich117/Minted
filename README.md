# Flappy Dash

A lightweight Flappy Bird–style game built for phones. Pure HTML5 Canvas +
JavaScript — no build step, no dependencies, no assets to download.

## Play

Open `index.html` in any browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000 on your phone or desktop
```

For the best phone experience, open it on your device and use "Add to Home
Screen" to launch it fullscreen.

## Controls

- **Tap the screen** (or press **Space** / **↑**) to flap.
- **Pause** with the ❚❚ button (top-right), or press **P** / **Esc**.
- Fly through the gaps in the pipes. Each pipe cleared scores a point.
- Hitting a pipe or the ground ends the run.

## Features

- Responsive canvas that fits any phone screen and survives rotation.
- Smooth, frame-rate–independent physics (delta-timed game loop).
- **Progressive difficulty** — pipes speed up, narrow, and close in as your
  score climbs, then plateau so it stays fair.
- **Pause / resume** via on-screen button or keyboard, with automatic pause
  when the tab or app loses focus so a run isn't lost in the background.
- Best score saved locally with `localStorage`.
- Generated sound effects via the Web Audio API (no audio files).
- Parallax clouds, hills, and a scrolling ground.
- **Installable PWA** — add it to your home screen for a fullscreen, offline
  app experience (service worker caches the whole game).

## Install on your phone

1. Open the game in your mobile browser.
2. Use **Add to Home Screen** (Share menu on iOS, ⋮ menu on Android).
3. Launch it from the home screen icon — it runs fullscreen and works offline.

## Files

| File                    | Purpose                                       |
| ----------------------- | --------------------------------------------- |
| `index.html`            | Markup, overlays (start / pause / game over). |
| `style.css`             | Layout, HUD, pause button, overlay styling.   |
| `game.js`               | Game loop, physics, difficulty, input.        |
| `manifest.webmanifest`  | PWA metadata (name, icons, display mode).     |
| `sw.js`                 | Service worker for offline caching.           |
| `icon.svg` / `icon-*.png` | App icons (SVG source + generated PNGs).    |
| `tools/gen_icons.py`    | Regenerates the PNG icons from scratch.        |
