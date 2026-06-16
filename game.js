(() => {
  "use strict";

  // ---------- Canvas setup ----------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  // Logical (design) resolution. The canvas is scaled to fit the phone while
  // keeping this internal coordinate system, so gameplay is identical on every
  // device.
  const W = 360;
  const H = 640;

  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  function resize() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Fit the play area inside the viewport while preserving aspect ratio.
    scale = Math.min(vw / W, vh / H);
    const dpr = window.devicePixelRatio || 1;

    const cssW = W * scale;
    const cssH = H * scale;
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    // Map logical units -> device pixels.
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.imageSmoothingEnabled = false;

    offsetX = (vw - cssW) / 2;
    offsetY = (vh - cssH) / 2;
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 100));
  resize();

  // ---------- Game constants ----------
  const GRAVITY = 1500;        // px / s^2
  const FLAP_VELOCITY = -430;  // px / s
  const MAX_FALL = 700;
  const PIPE_SPEED = 150;      // px / s
  const PIPE_GAP = 165;        // vertical opening
  const PIPE_WIDTH = 60;
  const PIPE_SPACING = 220;    // horizontal distance between pipes
  const GROUND_HEIGHT = 96;
  const PLAY_HEIGHT = H - GROUND_HEIGHT;

  const BIRD_X = 90;
  const BIRD_R = 15;

  // ---------- Game state ----------
  const State = { READY: 0, PLAYING: 1, OVER: 2 };
  let state = State.READY;

  const bird = { y: PLAY_HEIGHT / 2, vy: 0, angle: 0 };
  let pipes = [];
  let score = 0;
  let best = Number(localStorage.getItem("flappyDashBest") || 0);
  let groundScroll = 0;
  let lastTime = 0;

  // Background clouds for parallax depth.
  const clouds = [];
  for (let i = 0; i < 4; i++) {
    clouds.push({
      x: Math.random() * W,
      y: 60 + Math.random() * 180,
      s: 0.6 + Math.random() * 0.7,
    });
  }

  // ---------- DOM ----------
  const startScreen = document.getElementById("start-screen");
  const gameoverScreen = document.getElementById("gameover-screen");
  const scoreEl = document.getElementById("score");
  const finalScoreEl = document.getElementById("final-score");
  const bestScoreEl = document.getElementById("best-score");
  const startBestEl = document.getElementById("start-best");
  const newBestEl = document.getElementById("new-best");
  const hud = document.getElementById("hud");

  startBestEl.textContent = best;
  hud.style.display = "none";

  // ---------- Audio (WebAudio, generated tones, no assets) ----------
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  }
  function beep(freq, duration, type = "square", vol = 0.06) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  }
  const sndFlap = () => beep(620, 0.09, "square", 0.05);
  const sndScore = () => beep(880, 0.12, "sine", 0.07);
  function sndHit() {
    beep(180, 0.18, "sawtooth", 0.08);
    setTimeout(() => beep(120, 0.22, "sawtooth", 0.07), 60);
  }

  // ---------- Game flow ----------
  function spawnPipe(x) {
    const margin = 60;
    const gapY = margin + Math.random() * (PLAY_HEIGHT - PIPE_GAP - margin * 2);
    pipes.push({ x, gapY, scored: false });
  }

  function resetGame() {
    bird.y = PLAY_HEIGHT / 2;
    bird.vy = 0;
    bird.angle = 0;
    pipes = [];
    score = 0;
    scoreEl.textContent = "0";
    let x = W + 80;
    for (let i = 0; i < 4; i++) {
      spawnPipe(x);
      x += PIPE_SPACING;
    }
  }

  function startGame() {
    ensureAudio();
    resetGame();
    state = State.PLAYING;
    startScreen.classList.add("hidden");
    gameoverScreen.classList.add("hidden");
    hud.style.display = "flex";
    flap();
  }

  function flap() {
    if (state !== State.PLAYING) return;
    bird.vy = FLAP_VELOCITY;
    sndFlap();
  }

  function gameOver() {
    state = State.OVER;
    sndHit();
    hud.style.display = "none";
    finalScoreEl.textContent = score;

    const isNewBest = score > best;
    if (isNewBest) {
      best = score;
      localStorage.setItem("flappyDashBest", String(best));
    }
    bestScoreEl.textContent = best;
    startBestEl.textContent = best;
    newBestEl.classList.toggle("hidden", !isNewBest);
    gameoverScreen.classList.remove("hidden");
  }

  // ---------- Input ----------
  function onTap(e) {
    e.preventDefault();
    if (state === State.PLAYING) flap();
  }
  // Use the container so taps anywhere count, but let buttons work normally.
  canvas.addEventListener("touchstart", onTap, { passive: false });
  canvas.addEventListener("mousedown", onTap);
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      if (state === State.READY) startGame();
      else if (state === State.PLAYING) flap();
      else if (state === State.OVER) startGame();
    }
  });

  document.getElementById("start-btn").addEventListener("click", startGame);
  document.getElementById("restart-btn").addEventListener("click", startGame);

  // ---------- Update ----------
  function update(dt) {
    // Clouds drift slowly regardless of state.
    for (const c of clouds) {
      c.x -= 12 * c.s * dt;
      if (c.x < -60) {
        c.x = W + 40;
        c.y = 60 + Math.random() * 180;
        c.s = 0.6 + Math.random() * 0.7;
      }
    }

    if (state !== State.PLAYING) {
      // Gentle idle bob on the ready screen.
      if (state === State.READY) {
        bird.y = PLAY_HEIGHT / 2 + Math.sin(performance.now() / 300) * 8;
      }
      groundScroll = (groundScroll - PIPE_SPEED * dt) % 24;
      return;
    }

    // Bird physics.
    bird.vy = Math.min(bird.vy + GRAVITY * dt, MAX_FALL);
    bird.y += bird.vy * dt;
    bird.angle = Math.max(-0.5, Math.min(1.4, bird.vy / 600));

    groundScroll = (groundScroll - PIPE_SPEED * dt) % 24;

    // Pipes.
    for (const p of pipes) {
      p.x -= PIPE_SPEED * dt;
      if (!p.scored && p.x + PIPE_WIDTH < BIRD_X - BIRD_R) {
        p.scored = true;
        score++;
        scoreEl.textContent = score;
        sndScore();
      }
    }
    // Recycle off-screen pipes.
    if (pipes.length && pipes[0].x + PIPE_WIDTH < -10) {
      pipes.shift();
      const lastX = pipes[pipes.length - 1].x;
      spawnPipe(lastX + PIPE_SPACING);
    }

    // Collisions.
    if (bird.y + BIRD_R >= PLAY_HEIGHT) {
      bird.y = PLAY_HEIGHT - BIRD_R;
      gameOver();
      return;
    }
    if (bird.y - BIRD_R <= 0) {
      bird.y = BIRD_R;
      bird.vy = 0;
    }
    for (const p of pipes) {
      if (
        BIRD_X + BIRD_R > p.x &&
        BIRD_X - BIRD_R < p.x + PIPE_WIDTH &&
        (bird.y - BIRD_R < p.gapY || bird.y + BIRD_R > p.gapY + PIPE_GAP)
      ) {
        gameOver();
        return;
      }
    }
  }

  // ---------- Render ----------
  function drawBackground() {
    // Sky gradient.
    const g = ctx.createLinearGradient(0, 0, 0, PLAY_HEIGHT);
    g.addColorStop(0, "#4ec0ca");
    g.addColorStop(1, "#9be7ec");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, PLAY_HEIGHT);

    // Clouds.
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (const c of clouds) {
      const r = 18 * c.s;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.arc(c.x + r, c.y + 4, r * 0.8, 0, Math.PI * 2);
      ctx.arc(c.x - r, c.y + 4, r * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Distant hills.
    ctx.fillStyle = "#6fd6a0";
    const hillBase = PLAY_HEIGHT;
    for (let i = -1; i < 5; i++) {
      const hx = i * 90 + ((groundScroll * 0.5) % 90);
      ctx.beginPath();
      ctx.arc(hx, hillBase, 55, Math.PI, 0);
      ctx.fill();
    }
  }

  function drawPipe(p) {
    const topH = p.gapY;
    const botY = p.gapY + PIPE_GAP;
    const botH = PLAY_HEIGHT - botY;
    const lip = 14;

    const body = "#5bbf3a";
    const bodyDark = "#3f9627";
    const light = "#7ed957";

    function pipeSeg(x, y, w, h) {
      ctx.fillStyle = body;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = light;
      ctx.fillRect(x + 4, y, 6, h);
      ctx.fillStyle = bodyDark;
      ctx.fillRect(x + w - 8, y, 8, h);
    }
    function pipeLip(x, y, w) {
      ctx.fillStyle = body;
      ctx.fillRect(x - 3, y, w + 6, lip);
      ctx.fillStyle = light;
      ctx.fillRect(x - 1, y, 6, lip);
      ctx.fillStyle = bodyDark;
      ctx.fillRect(x + w - 5, y, 8, lip);
      ctx.strokeStyle = "rgba(0,0,0,0.15)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 3, y, w + 6, lip);
    }

    // Top pipe.
    pipeSeg(p.x, 0, PIPE_WIDTH, topH - lip);
    pipeLip(p.x, topH - lip, PIPE_WIDTH);
    // Bottom pipe.
    pipeSeg(p.x, botY + lip, PIPE_WIDTH, botH - lip);
    pipeLip(p.x, botY, PIPE_WIDTH);
  }

  function drawBird() {
    ctx.save();
    ctx.translate(BIRD_X, bird.y);
    ctx.rotate(bird.angle);

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

    // Wing (flaps with vertical velocity).
    const wingY = Math.sin(performance.now() / 60) * 3;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(-2, 2 + wingY, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#c79a00";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Eye.
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(7, -5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(9, -5, 2.4, 0, Math.PI * 2);
    ctx.fill();

    // Beak.
    ctx.fillStyle = "#ff8c1a";
    ctx.beginPath();
    ctx.moveTo(12, -1);
    ctx.lineTo(22, 2);
    ctx.lineTo(12, 6);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawGround() {
    const y = PLAY_HEIGHT;
    // Base.
    ctx.fillStyle = "#ded895";
    ctx.fillRect(0, y, W, GROUND_HEIGHT);
    // Top grass strip.
    ctx.fillStyle = "#73c043";
    ctx.fillRect(0, y, W, 14);
    ctx.fillStyle = "#5fa838";
    ctx.fillRect(0, y + 12, W, 4);

    // Scrolling dirt texture.
    ctx.fillStyle = "#caa86a";
    for (let x = -24; x < W + 24; x += 24) {
      const px = x + groundScroll;
      ctx.fillRect(px, y + 22, 12, 8);
      ctx.fillRect(px + 12, y + 40, 12, 8);
    }
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    for (const p of pipes) drawPipe(p);
    drawGround();
    drawBird();
  }

  // ---------- Main loop ----------
  function loop(now) {
    if (!lastTime) lastTime = now;
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    // Clamp dt to avoid huge jumps after tab switches.
    if (dt > 0.05) dt = 0.05;

    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  resetGame();
  // On the ready screen show a single bird hovering; pipes appear on start.
  pipes = [];
  requestAnimationFrame(loop);
})();
