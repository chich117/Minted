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
- Fly through the gaps in the pipes. Each pipe cleared scores a point.
- Hitting a pipe or the ground ends the run.

## Features

- Responsive canvas that fits any phone screen and survives rotation.
- Smooth, frame-rate–independent physics (delta-timed game loop).
- Best score saved locally with `localStorage`.
- Generated sound effects via the Web Audio API (no audio files).
- Parallax clouds, hills, and a scrolling ground.

## Files

| File         | Purpose                                  |
| ------------ | ---------------------------------------- |
| `index.html` | Markup, overlays (start / game over).    |
| `style.css`  | Layout, HUD, and overlay styling.        |
| `game.js`    | Game loop, physics, rendering, input.    |
