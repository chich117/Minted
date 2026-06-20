(() => {
  "use strict";

  // ============================================================================
  // Wingy Hills — a Tiny Wings–style slope glider.
  //
  // One button. Hold to tuck and dive; release to glide. Dive down the
  // downslopes to build speed, then let the crests fling you into the sky.
  // Land smoothly on the next downslope for a "perfect" slide — chain them to
  // light the fever and rack up a score multiplier. Reach a new hill before
  // the sun sets, or night falls and the day is over.
  // ============================================================================

  // ---------- Canvas setup ----------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  // Logical (design) resolution. The canvas is scaled to fit the screen while
  // keeping this internal coordinate system, so play is identical everywhere.
  const W = 360;
  const H = 640;

  let scale = 1;

  function resize() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    scale = Math.min(vw / W, vh / H);
    const dpr = window.devicePixelRatio || 1;

    const cssW = W * scale;
    const cssH = H * scale;
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 100));
  resize();

  // ---------- Physics constants ----------
  const G_GLIDE = 1500;     // gravity while gliding (px/s^2)
  const G_DIVE = 4200;      // gravity while diving (button held) — the "tuck"
  const MIN_SPEED = 150;    // the bird never fully stalls
  const MAX_SPEED = 1400;   // terminal slide speed
  const FRICTION = 0.16;    // gentle drag on the ground so flats bleed speed

  // Where the bird sits horizontally on screen; the world scrolls past it.
  const BIRD_SX = 110;
  const BIRD_R = 13;

  // ---------- Terrain ----------
  // Smooth, continuous rolling hills built from a base sine whose amplitude and
  // wavelength drift slowly with distance, so the hills grow bigger and the
  // valleys deeper the farther you fly. Everything is a pure function of world
  // x, which keeps generation trivial and the ground perfectly seamless.
  const HORIZON = 470;          // mid-line of the hills (screen y at camera 0)
  const PX_PER_METER = 14;      // distance -> "meters" for the score

  function terrainAmp(x) {
    // Amplitude swells with distance (hills get taller) then plateaus, with a
    // slow wobble layered on so no two stretches feel identical.
    const grow = Math.min(150, 60 + x * 0.0016);
    return grow + 28 * Math.sin(x * 0.00055 + 1.3);
  }
  function terrainFreq(x) {
    // Hills stretch out a little as you go, giving longer, faster slopes.
    return 0.0090 - Math.min(0.0035, x * 0.00000045);
  }

  // Terrain height (screen y) at world x. Larger y = lower = valley floor.
  function terrain(x) {
    if (x < 220) {
      // A flat-ish run-up so the very first launch is gentle and readable.
      return HORIZON + 70;
    }
    const xs = x - 220;
    return HORIZON + terrainAmp(xs) * Math.cos(xs * terrainFreq(xs)) + 70 - terrainAmp(0);
  }

  // Slope angle (radians) of the terrain at world x, from a small finite diff.
  function slopeAngle(x) {
    const d = 1.5;
    const dy = terrain(x + d) - terrain(x - d);
    return Math.atan2(dy, 2 * d);
  }

  // ---------- Game state ----------
  const State = { READY: 0, PLAYING: 1, OVER: 2 };
  let state = State.READY;
  let paused = false;

  // The bird is a point that either rides the ground or flies as a projectile.
  const bird = {
    x: 0, y: 0,        // world position
    vx: 0, vy: 0,      // world velocity (px/s)
    onGround: true,
    angle: 0,          // drawn rotation
    airTime: 0,        // time since takeoff (for combo scoring)
  };

  let holding = false;       // button currently pressed
  let startX = 0;            // world x where this run began (for distance)
  let distance = 0;          // meters traveled this run
  let hillsCleared = 0;      // crests passed
  let combo = 0;             // consecutive perfect slides
  let fever = 0;             // 0..1 fever charge; >=1 => fever mode active
  let feverFlash = 0;        // brief flash timer when a perfect lands
  let score = 0;
  let best = Number(localStorage.getItem("wingyHillsBest") || 0);

  // Sun timer: the day drains; cresting a fresh hill tops it back up. Run dry
  // and night falls — game over.
  const DAY_MAX = 8.0;
  let dayLeft = DAY_MAX;

  let particles = [];        // dust kicked up from slides / landings
  let lastCrestX = -Infinity; // world x of the most recent crest counted

  // Parallax clouds drifting across the sky.
  const clouds = [];
  for (let i = 0; i < 5; i++) {
    clouds.push({
      x: Math.random() * W,
      y: 40 + Math.random() * 240,
      s: 0.5 + Math.random() * 0.8,
    });
  }

  // ---------- DOM ----------
  const startScreen = document.getElementById("start-screen");
  const gameoverScreen = document.getElementById("gameover-screen");
  const pauseScreen = document.getElementById("pause-screen");
  const pauseBtn = document.getElementById("pause-btn");
  const scoreEl = document.getElementById("score");
  const multEl = document.getElementById("mult");
  const finalScoreEl = document.getElementById("final-score");
  const finalDistEl = document.getElementById("final-dist");
  const bestScoreEl = document.getElementById("best-score");
  const startBestEl = document.getElementById("start-best");
  const newBestEl = document.getElementById("new-best");
  const hud = document.getElementById("hud");

  startBestEl.textContent = best;
  hud.style.display = "none";

  // ---------- Audio (WebAudio, generated, no asset files) ----------
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  }
  function tone(freq, dur, type = "sine", vol = 0.06, slideTo = null) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur);
  }
  // A rising chirp whose pitch climbs with the current combo — the higher the
  // streak, the brighter the reward.
  function sndPerfect(level) {
    const base = 520 + Math.min(8, level) * 70;
    tone(base, 0.16, "triangle", 0.09, base * 1.5);
  }
  const sndLaunch = () => tone(300, 0.18, "sine", 0.05, 620);
  const sndLand = () => tone(180, 0.08, "sine", 0.05);
  const sndHill = () => tone(700, 0.12, "square", 0.05, 940);
  function sndNight() {
    tone(330, 0.5, "sawtooth", 0.07, 90);
    setTimeout(() => tone(220, 0.6, "sawtooth", 0.06, 70), 120);
  }

  // ---------- Particles ----------
  function spawnDust(x, y, n, power) {
    for (let i = 0; i < n; i++) {
      particles.push({
        x: x + (Math.random() * 8 - 4),
        y: y + (Math.random() * 4 - 2),
        vx: -power * (0.4 + Math.random()) - 40,
        vy: -Math.random() * power * 0.6,
        life: 0,
        maxLife: 0.4 + Math.random() * 0.5,
        r: 2 + Math.random() * 3,
      });
    }
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 300 * dt;       // dust falls back down
      p.vx *= 1 - 1.4 * dt;
      p.r += 9 * dt;
    }
  }

  // ---------- Game flow ----------
  function resetGame() {
    bird.x = 60;
    bird.y = terrain(bird.x) - BIRD_R;
    bird.vx = MIN_SPEED * 1.4;
    bird.vy = 0;
    bird.onGround = true;
    bird.angle = 0;
    bird.airTime = 0;
    startX = bird.x;
    distance = 0;
    hillsCleared = 0;
    combo = 0;
    fever = 0;
    feverFlash = 0;
    score = 0;
    dayLeft = DAY_MAX;
    particles = [];
    lastCrestX = bird.x;
    holding = false;
    scoreEl.textContent = "0";
    updateMultHud();
  }

  function startGame() {
    ensureAudio();
    resetGame();
    state = State.PLAYING;
    paused = false;
    pauseScreen.classList.add("hidden");
    startScreen.classList.add("hidden");
    gameoverScreen.classList.add("hidden");
    hud.style.display = "flex";
    pauseBtn.classList.remove("hidden");
  }

  function setPaused(value) {
    if (state !== State.PLAYING) return;
    paused = value;
    pauseScreen.classList.toggle("hidden", !paused);
    pauseBtn.textContent = paused ? "▶" : "❚❚";
  }
  function togglePause() { setPaused(!paused); }

  function gameOver() {
    state = State.OVER;
    paused = false;
    holding = false;
    pauseScreen.classList.add("hidden");
    pauseBtn.classList.add("hidden");
    hud.style.display = "none";
    sndNight();

    finalScoreEl.textContent = score;
    finalDistEl.textContent = Math.floor(distance) + " m";

    const isNewBest = score > best;
    if (isNewBest) {
      best = score;
      localStorage.setItem("wingyHillsBest", String(best));
    }
    bestScoreEl.textContent = best;
    startBestEl.textContent = best;
    newBestEl.classList.toggle("hidden", !isNewBest);
    gameoverScreen.classList.remove("hidden");
  }

  function multiplier() {
    // Each perfect slide adds to the multiplier; fever doubles it.
    const base = 1 + combo;
    return fever >= 1 ? base * 2 : base;
  }
  function updateMultHud() {
    const m = multiplier();
    multEl.textContent = "x" + m;
    multEl.classList.toggle("fever", fever >= 1);
    multEl.style.visibility = m > 1 ? "visible" : "hidden";
  }

  // ---------- Input ----------
  function press() {
    if (state === State.READY) { startGame(); holding = true; return; }
    if (state === State.OVER) { startGame(); holding = true; return; }
    if (state === State.PLAYING && !paused) holding = true;
  }
  function release() { holding = false; }

  canvas.addEventListener("touchstart", (e) => { e.preventDefault(); press(); }, { passive: false });
  canvas.addEventListener("touchend", (e) => { e.preventDefault(); release(); }, { passive: false });
  canvas.addEventListener("mousedown", (e) => { e.preventDefault(); press(); });
  window.addEventListener("mouseup", release);

  window.addEventListener("touchend", ensureAudio, { passive: true });
  window.addEventListener("pointerdown", ensureAudio, { passive: true });
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowDown" || e.code === "ArrowUp") {
      e.preventDefault();
      if (!e.repeat) press();
    } else if (e.code === "KeyP" || e.code === "Escape") {
      e.preventDefault();
      togglePause();
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space" || e.code === "ArrowDown" || e.code === "ArrowUp") release();
  });

  function onPauseTap(e) { e.preventDefault(); e.stopPropagation(); togglePause(); }
  pauseBtn.addEventListener("touchstart", onPauseTap, { passive: false });
  pauseBtn.addEventListener("click", onPauseTap);

  document.getElementById("start-btn").addEventListener("click", startGame);
  document.getElementById("restart-btn").addEventListener("click", startGame);
  document.getElementById("resume-btn").addEventListener("click", () => setPaused(false));

  document.addEventListener("visibilitychange", () => { if (document.hidden) setPaused(true); });
  window.addEventListener("blur", () => setPaused(true));

  // ---------- Update ----------
  function update(dt) {
    // Clouds drift in every state for a living sky.
    for (const c of clouds) {
      c.x -= 8 * c.s * dt;
      if (c.x < -70) { c.x = W + 50; c.y = 40 + Math.random() * 240; c.s = 0.5 + Math.random() * 0.8; }
    }
    updateParticles(dt);
    if (feverFlash > 0) feverFlash = Math.max(0, feverFlash - dt);

    if (state !== State.PLAYING) {
      if (state === State.READY) {
        // Idle: a bird resting on the opening slope, gently bobbing.
        bird.x = 60;
        bird.y = terrain(bird.x) - BIRD_R + Math.sin(performance.now() / 400) * 3;
        bird.angle = slopeAngle(bird.x);
      }
      return;
    }
    if (paused) return;

    // --- Sun timer ---
    dayLeft -= dt;
    if (dayLeft <= 0) { gameOver(); return; }

    // --- Physics: unified projectile + slope-slide model ---
    // Gravity is applied every frame; the bird flies as a projectile. Whenever
    // its path dips into the ground we snap it to the surface and redirect its
    // velocity along the slope. That single rule produces the whole Tiny Wings
    // feel: diving into a valley accelerates you, and a crest naturally flings
    // you off because the projectile arc simply leaves the receding ground.
    const g = holding ? G_DIVE : G_GLIDE;
    bird.vy += g * dt;

    let nx = bird.x + bird.vx * dt;
    let ny = bird.y + bird.vy * dt;

    const groundY = terrain(nx) - BIRD_R;
    const wasAir = !bird.onGround;

    if (ny >= groundY) {
      // On / into the ground -> slide along the surface.
      ny = groundY;
      const ang = slopeAngle(nx);
      const tx = Math.cos(ang), ty = Math.sin(ang); // downhill-forward tangent
      const speed = Math.hypot(bird.vx, bird.vy);
      const along = bird.vx * tx + bird.vy * ty;      // velocity kept along slope

      if (wasAir) {
        // --- Landing ---
        // Quality = how well the dive lined up with the slope. A clean, fast
        // landing on a downslope is "perfect" and builds the combo + fever.
        const quality = speed > 1 ? along / speed : 0;
        const downhill = ang > 0.12;
        bird.airTime = 0;
        sndLand();
        if (downhill && quality > 0.86 && speed > 260) {
          combo++;
          feverFlash = 0.35;
          fever = Math.min(1.6, fever + 0.22);
          score += 10 * multiplier();
          scoreEl.textContent = score;
          sndPerfect(combo);
          spawnDust(BIRD_SX, H * 0.55, 14, speed * 0.05);
        } else {
          // Sloppy landing — lose the streak (and the fever cools).
          if (combo > 0) combo = 0;
          fever = Math.max(0, fever - 0.5);
          spawnDust(BIRD_SX, H * 0.55, 6, 30);
        }
        updateMultHud();
      }

      // Slide: keep speed along the tangent, with a touch of ground friction so
      // long flats gradually bleed momentum.
      const friMul = 1 - FRICTION * dt;
      bird.vx = along * tx * friMul;
      bird.vy = along * ty * friMul;
      bird.onGround = true;
    } else {
      // Airborne.
      if (!wasAir) { sndLaunch(); }   // just left the ground at a crest
      bird.onGround = false;
      bird.airTime += dt;
    }

    bird.x = nx;
    bird.y = ny;

    // Clamp/maintain forward speed so the run never stalls or breaks physics.
    const sp = Math.hypot(bird.vx, bird.vy);
    if (bird.onGround && sp < MIN_SPEED) {
      const ang = slopeAngle(bird.x);
      bird.vx = MIN_SPEED * Math.cos(ang);
      bird.vy = MIN_SPEED * Math.sin(ang);
    }
    if (sp > MAX_SPEED) {
      const k = MAX_SPEED / sp;
      bird.vx *= k; bird.vy *= k;
    }
    // Fever slowly cools while flying clean; it only stays lit by landing perfects.
    fever = Math.max(0, fever - 0.04 * dt);

    // Drawn angle: follow the velocity vector, lagging slightly for weight.
    const targetAngle = Math.atan2(bird.vy, Math.max(60, Math.abs(bird.vx)) * Math.sign(bird.vx || 1));
    bird.angle += (targetAngle - bird.angle) * Math.min(1, 12 * dt);

    // --- Distance + hill crests ---
    distance = (bird.x - startX) / PX_PER_METER;
    // Count a crest each time we pass a local peak (slope flips downhill) well
    // ahead of the last one; cresting refills the day and scores points.
    const aheadX = bird.x + 4;
    if (slopeAngle(bird.x) <= 0 && slopeAngle(aheadX) > 0 && bird.x - lastCrestX > 60) {
      lastCrestX = bird.x;
      hillsCleared++;
      dayLeft = Math.min(DAY_MAX, dayLeft + DAY_MAX * 0.85);
      score += 5 * multiplier();
      scoreEl.textContent = score;
      sndHill();
    }
  }

  // ---------- Camera ----------
  // Horizontal: keep the bird pinned near the left; the world slides past.
  // Vertical: follow the bird but bias the view so the ground stays on screen,
  // pulling back when you soar high so you can see the next hills.
  function cameraY() {
    let cy = bird.y - H * 0.5;
    const groundHere = terrain(bird.x);
    // Never let the camera drop below the ground line near the bird.
    cy = Math.min(cy, groundHere - H * 0.62);
    return cy;
  }

  // ---------- Render ----------
  function drawSky(camY) {
    // The sky darkens as the day timer runs down — dawn-blue into dusk.
    const t = 1 - Math.max(0, Math.min(1, dayLeft / DAY_MAX)); // 0 day -> 1 night
    const top = mix([78, 192, 202], [25, 30, 74], t);
    const bot = mix([155, 231, 236], [70, 90, 140], t);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgb(top));
    g.addColorStop(1, rgb(bot));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Sun sinking toward the horizon as time drains.
    const sunY = 70 + t * (H * 0.55);
    ctx.fillStyle = t > 0.6 ? "#ffd27a" : "#fff2b0";
    ctx.beginPath();
    ctx.arc(W - 70, sunY, 26, 0, Math.PI * 2);
    ctx.fill();

    // Clouds.
    ctx.fillStyle = `rgba(255,255,255,${0.85 - t * 0.5})`;
    for (const c of clouds) {
      const r = 16 * c.s;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.arc(c.x + r, c.y + 3, r * 0.8, 0, Math.PI * 2);
      ctx.arc(c.x - r, c.y + 3, r * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawHills(camY) {
    const t = 1 - Math.max(0, Math.min(1, dayLeft / DAY_MAX));

    // Far parallax ridge for depth.
    ctx.fillStyle = rgb(mix([122, 198, 160], [40, 70, 90], t));
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let sx = 0; sx <= W; sx += 12) {
      const wx = bird.x + (sx - BIRD_SX) * 0.5;
      const y = (terrain(wx) - camY) * 0.85 + H * 0.12;
      ctx.lineTo(sx, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();

    // Main terrain. Sampled across the screen and filled down to the bottom.
    const top = rgb(mix([120, 205, 90], [46, 92, 60], t));
    const dark = rgb(mix([86, 168, 60], [30, 64, 42], t));
    ctx.beginPath();
    ctx.moveTo(0, H);
    let firstY = 0;
    for (let sx = 0; sx <= W; sx += 6) {
      const wx = bird.x + (sx - BIRD_SX);
      const y = terrain(wx) - camY;
      if (sx === 0) firstY = y;
      ctx.lineTo(sx, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = dark;
    ctx.fill();

    // Bright grass cap: a stroked ribbon along the surface line.
    ctx.beginPath();
    for (let sx = 0; sx <= W; sx += 6) {
      const wx = bird.x + (sx - BIRD_SX);
      const y = terrain(wx) - camY;
      if (sx === 0) ctx.moveTo(sx, y); else ctx.lineTo(sx, y);
    }
    ctx.strokeStyle = top;
    ctx.lineWidth = 10;
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  function drawBird(camY) {
    const sx = BIRD_SX;
    const sy = bird.y - camY;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(bird.angle);

    // Fever glow.
    if (fever >= 1 || feverFlash > 0) {
      const glow = fever >= 1 ? 0.5 : feverFlash;
      ctx.fillStyle = `rgba(255,180,40,${glow})`;
      ctx.beginPath();
      ctx.arc(0, 0, BIRD_R + 8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Body.
    ctx.fillStyle = "#f5d000";
    ctx.beginPath();
    ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#c79a00";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Belly.
    ctx.fillStyle = "#fff0a0";
    ctx.beginPath();
    ctx.arc(-2, 4, BIRD_R * 0.6, 0, Math.PI * 2);
    ctx.fill();

    // Wing — tucked tight when diving, spread when gliding.
    const tuck = holding ? 0.4 : 1;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(-2, 2, 8 * tuck + 2, 5, holding ? -0.5 : 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#c79a00";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Eye.
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(7, -5, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(8.5, -5, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Beak.
    ctx.fillStyle = "#ff8c1a";
    ctx.beginPath();
    ctx.moveTo(11, -1);
    ctx.lineTo(20, 2);
    ctx.lineTo(11, 6);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // Sun-timer arc + altitude tick are drawn straight to screen by render().
  function drawDayBar() {
    const t = Math.max(0, Math.min(1, dayLeft / DAY_MAX));
    const x = 16, y = 16, w = W - 100, h = 8;
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    roundRect(x, y, w, h, 4); ctx.fill();
    ctx.fillStyle = t > 0.3 ? "#ffd84d" : "#ff6b4a";
    roundRect(x, y, w * t, h, 4); ctx.fill();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function render() {
    const camY = cameraY();
    ctx.clearRect(0, 0, W, H);
    drawSky(camY);
    drawHills(camY);

    // Dust particles (stored in screen-space already at spawn time).
    for (const p of particles) {
      const a = (1 - p.life / p.maxLife) * 0.55;
      ctx.fillStyle = `rgba(240,232,195,${a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    drawBird(camY);

    if (state === State.PLAYING) drawDayBar();

    // "PERFECT!" pop on a fresh streak.
    if (feverFlash > 0 && combo > 0 && state === State.PLAYING) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, feverFlash / 0.35);
      ctx.fillStyle = fever >= 1 ? "#ff8a3d" : "#fff";
      ctx.font = "800 22px -apple-system, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(combo >= 3 ? "FEVER! x" + multiplier() : "PERFECT! x" + multiplier(), W / 2, 110);
      ctx.restore();
    }
  }

  // ---------- Colour helpers ----------
  function mix(a, b, t) {
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ];
  }
  function rgb(c) { return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; }

  // ---------- Main loop ----------
  let lastTime = 0;
  function loop(now) {
    if (!lastTime) lastTime = now;
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.05) dt = 0.05;   // clamp after tab switches

    if (!paused) update(dt);
    render();
    requestAnimationFrame(loop);
  }

  resetGame();
  state = State.READY;
  requestAnimationFrame(loop);

  // ---------- PWA: register the offline service worker ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
})();
