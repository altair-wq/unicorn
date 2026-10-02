// Unicorn Orbit — rendering, input, sound and screens.
(function () {
  'use strict';
  const U = window.UnicornCore;
  const C = U.C;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
  };

  let W = 0, H = 0, DPR = 1, SCALE = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    SCALE = Math.max(0.5, Math.min(H / 700, W / 640));
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- sound

  let muted = store.get('unicornOrbitMuted') === '1';
  let actx = null;
  function audio() {
    if (muted) return null;
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(freq, dur, type, vol, slideTo, delay) {
    const a = audio();
    if (!a) return;
    const t0 = a.currentTime + (delay || 0);
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.08, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(a.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
  const sfx = {
    jump: () => tone(380, 0.14, 'square', 0.035, 720),
    djump: () => tone(560, 0.16, 'square', 0.035, 1100),
    super: () => { tone(300, 0.3, 'triangle', 0.08, 1400); tone(600, 0.3, 'sine', 0.05, 2000, 0.05); },
    dash: () => tone(900, 0.12, 'sawtooth', 0.03, 300),
    pound: () => tone(700, 0.12, 'triangle', 0.04, 200),
    slam: () => tone(140, 0.2, 'sine', 0.14, 50),
    land: () => tone(220, 0.05, 'sine', 0.03, 120),
    star: (n) => tone(880 * Math.pow(1.122, Math.min(n, 12)), 0.18, 'sine', 0.07),
    gate: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, 'triangle', 0.06, null, i * 0.07)),
    fall: () => tone(500, 0.45, 'triangle', 0.06, 90),
    over: () => [784, 659, 523, 392].forEach((f, i) => tone(f, 0.25, 'triangle', 0.06, null, i * 0.12)),
  };
  const muteBtn = $('mute');
  function syncMute() { muteBtn.textContent = muted ? '✕' : '♪'; muteBtn.style.opacity = muted ? 0.6 : 1; }
  function toggleMute() { muted = !muted; store.set('unicornOrbitMuted', muted ? '1' : '0'); syncMute(); }
  muteBtn.addEventListener('click', (e) => { toggleMute(); e.currentTarget.blur(); });
  syncMute();

  // ---------------------------------------------------------------- input

  const keys = { left: false, right: false, jump: false, sprint: false, down: false };
  const pressed = { jump: false, down: false, dash: false };
  const touch = { left: false, right: false, jump: false, down: false, dash: false };
  let touchDirSince = 0;

  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
    ArrowDown: 'down', KeyS: 'down',
    ShiftLeft: 'sprint', ShiftRight: 'sprint',
    KeyX: 'dash', KeyK: 'dash',
  };

  window.addEventListener('keydown', (e) => {
    const k = KEYMAP[e.code];
    if (k) e.preventDefault();
    if (e.code === 'KeyM' && !e.repeat) toggleMute();
    if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) togglePause();
    if (state === 'title' || state === 'over') {
      if ((e.code === 'Enter' || e.code === 'Space') && !e.repeat) startGame();
      return;
    }
    if (!k) return;
    if (k in keys) keys[k] = true;
    if (!e.repeat && k in pressed) pressed[k] = true;
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code];
    if (k && k in keys) keys[k] = false;
  });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (state === 'play') togglePause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') togglePause(); });

  function enableTouchUI() { document.body.classList.add('touch'); }
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) enableTouchUI();
  window.addEventListener('touchstart', enableTouchUI, { once: true, passive: true });

  for (const btn of document.querySelectorAll('#pad .btn')) {
    const k = btn.dataset.k;
    const down = (e) => {
      e.preventDefault();
      try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (!touch[k]) {
        touch[k] = true;
        if (k in pressed) pressed[k] = true;
        if (k === 'left' || k === 'right') touchDirSince = performance.now();
      }
      btn.classList.add('on');
      audio();
    };
    const up = (e) => {
      e.preventDefault();
      touch[k] = false;
      btn.classList.remove('on');
    };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function readInput() {
    const inp = U.emptyInput();
    inp.left = keys.left || touch.left;
    inp.right = keys.right || touch.right;
    inp.jump = keys.jump || touch.jump;
    const touchSprint = (touch.left || touch.right) && performance.now() - touchDirSince > 500;
    inp.sprint = keys.sprint || touchSprint;
    inp.jumpPressed = pressed.jump;
    inp.downPressed = pressed.down;
    inp.dashPressed = pressed.dash;
    return inp;
  }
  function clearPressed() { pressed.jump = pressed.down = pressed.dash = false; }

  // ---------------------------------------------------------------- state

  let state = 'title';
  let game = null;
  let best = parseInt(store.get('unicornOrbitBest') || '0', 10) || 0;
  const cam = { x: 0, y: 0, shake: 0 };
  let particles = [];
  let texts = [];
  let npcs = [];
  let flash = null; // {color, t}
  let runPhase = 0;
  let squash = 0;
  let clock = 0;

  function newGame() {
    game = U.createGame((Math.random() * 1e9) | 0);
    const p = game.player;
    cam.x = p.x + 200;
    cam.y = p.y - 80;
    particles = [];
    texts = [];
    flash = null;
    initNpcs();
  }

  function startGame() {
    audio();
    newGame();
    state = 'play';
    $('title').hidden = true;
    $('over').hidden = true;
    $('paused').hidden = true;
    clearPressed();
  }
  function togglePause() {
    if (state === 'play') { state = 'paused'; $('paused').hidden = false; }
    else if (state === 'paused') { state = 'play'; $('paused').hidden = true; clearPressed(); last = performance.now(); }
  }
  function endGame() {
    state = 'over';
    const isBest = game.score > best;
    if (isBest) { best = game.score; store.set('unicornOrbitBest', String(best)); }
    $('finalScore').textContent = game.score + ' ★';
    $('finalInfo').textContent = (isBest ? 'New best! ' : 'Best: ' + best + ' ★. ') +
      'You reached sector ' + (game.sector + 1) + (game.falls ? ' with ' + game.falls + ' fall' + (game.falls > 1 ? 's' : '') + '.' : ' without falling once.');
    $('over').hidden = false;
    sfx.over();
  }
  $('startBtn').addEventListener('click', startGame);
  $('againBtn').addEventListener('click', startGame);
  $('resumeBtn').addEventListener('click', togglePause);
  $('bestLine').textContent = best ? 'Best: ' + best + ' ★' : 'Tip: hold Shift and chain double jumps to fly over big gaps.';

  // ----------------------------------------------------------------- npcs

  const NPC_COLORS = [
    ['#f3e8ff', '#c9a7ff'], ['#e0fff1', '#8fe3bd'], ['#fff0e2', '#ffbe8f'], ['#e3f3ff', '#93c8ff'],
    ['#fffbd9', '#ffe27a'], ['#ffe6f1', '#ff9cc8'], ['#ffffff', '#d9d0ff'],
  ];

  function placeNpc(n, pl) {
    n.pl = pl;
    n.off = (Math.random() - 0.5) * pl.r * 0.8;
    const sx = pl.x + n.off;
    n.x = sx;
    n.y = U.surfaceY(pl, sx) - C.PR * n.scale;
    n.state = 'idle';
    n.t = 0;
    n.wait = 0.6 + Math.random() * 2.2;
  }

  function initNpcs() {
    npcs = [];
    const pls = game.world.planets;
    for (let i = 0; i < 7; i++) {
      const n = { colors: NPC_COLORS[i], scale: 0.7 + Math.random() * 0.35, facing: Math.random() < 0.5 ? -1 : 1, phase: Math.random() * 6 };
      placeNpc(n, pls[Math.min(pls.length - 1, 1 + i * 2 + Math.floor(Math.random() * 2))]);
      npcs.push(n);
    }
  }

  function updateNpcs(dt) {
    const pls = game.world.planets;
    const px = game.player.x;
    for (const n of npcs) {
      n.t += dt;
      if (!pls.includes(n.pl) || n.x < px - 1300) {
        const ahead = pls.filter((pl) => pl.x > px + 500 && pl.x < px + 1500);
        if (ahead.length) placeNpc(n, ahead[Math.floor(Math.random() * ahead.length)]);
        continue;
      }
      if (n.state === 'idle') {
        const hop = Math.abs(Math.sin(n.t * 6 + n.phase)) * 14 * n.scale;
        n.x = n.pl.x + n.off;
        n.y = U.surfaceY(n.pl, n.x) - C.PR * n.scale - hop;
        if (n.t > n.wait) {
          const i = pls.indexOf(n.pl);
          const dir = Math.random() < 0.7 ? 1 : -1;
          const to = pls[i + dir] || pls[i - dir];
          if (to) {
            const off = (Math.random() - 0.5) * to.r * 0.8;
            n.from = { x: n.x, y: n.y };
            n.to = { pl: to, off, x: to.x + off, y: U.surfaceY(to, to.x + off) - C.PR * n.scale };
            n.dur = 0.9 + Math.random() * 0.4;
            n.h = 120 + Math.random() * 120;
            n.facing = n.to.x > n.x ? 1 : -1;
            n.state = 'leap';
            n.t = 0;
          } else {
            n.t = 0;
          }
        }
      } else {
        const k = Math.min(1, n.t / n.dur);
        n.x = n.from.x + (n.to.x - n.from.x) * k;
        n.y = n.from.y + (n.to.y - n.from.y) * k - Math.sin(Math.PI * k) * n.h;
        if (k >= 1) {
          n.pl = n.to.pl;
          n.off = n.to.off;
          n.state = 'idle';
          n.t = 0;
          n.wait = 0.8 + Math.random() * 2.5;
          if (Math.random() < 0.6) sparkle(n.x, n.y + C.PR * n.scale, 4, n.colors[1]);
        }
      }
    }
  }

  // ------------------------------------------------------------ particles

  const RAINBOW = ['#ff5f8f', '#ffa94d', '#ffe45c', '#69e3a1', '#5cc2ff', '#a98bff'];

  function sparkle(x, y, count, color, speed) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (speed || 160) * (0.4 + Math.random() * 0.8);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0.6 + Math.random() * 0.4, max: 1, size: 2 + Math.random() * 3, color: color || RAINBOW[i % 6], g: 300 });
    }
  }
  function dust(x, y, count) {
    for (let i = 0; i < count; i++) {
      const dir = i % 2 ? 1 : -1;
      particles.push({ x, y, vx: dir * (60 + Math.random() * 140), vy: -30 - Math.random() * 80, life: 0.4 + Math.random() * 0.3, max: 0.7, size: 3 + Math.random() * 4, color: 'rgba(255,255,255,0.7)', g: 200 });
    }
  }
  function trail(p) {
    particles.push({ x: p.x - p.facing * 14 + (Math.random() - 0.5) * 6, y: p.y - 4 + (Math.random() - 0.5) * 10, vx: -p.facing * 20, vy: 0, life: 0.45, max: 0.45, size: 5, color: RAINBOW[Math.floor(clock * 30) % 6], g: 0 });
  }
  function floatText(x, y, text, color, size) {
    texts.push({ x, y, text, color: color || '#ffe45c', size: size || 22, life: 1.1 });
  }

  function updateFx(dt) {
    for (const q of particles) {
      q.life -= dt;
      q.vy += q.g * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    }
    particles = particles.filter((q) => q.life > 0);
    if (particles.length > 500) particles.splice(0, particles.length - 500);
    for (const t of texts) { t.life -= dt; t.y -= 50 * dt; }
    texts = texts.filter((t) => t.life > 0);
    if (flash) { flash.t -= dt; if (flash.t <= 0) flash = null; }
    cam.shake = Math.max(0, cam.shake - dt * 30);
    squash = Math.max(0, squash - dt * 5);
  }

  function handleEvents() {
    const p = game.player;
    const feetY = p.y + C.PR;
    for (const e of p.events) {
      if (e === 'jump') { sfx.jump(); dust(p.x, feetY, 4); }
      else if (e === 'djump') { sfx.djump(); sparkle(p.x, feetY, 10, null, 120); }
      else if (e === 'super') { sfx.super(); sparkle(p.x, feetY, 24, null, 260); cam.shake = 6; floatText(p.x, p.y - 40, 'SUPER BOUNCE!', '#ff8fd0', 20); }
      else if (e === 'dash') { sfx.dash(); }
      else if (e === 'pound') { sfx.pound(); }
      else if (e === 'slam') { sfx.slam(); dust(p.x, feetY, 14); cam.shake = 9; squash = 1; }
      else if (e === 'land') { sfx.land(); dust(p.x, feetY, 5); squash = 0.6; }
    }
    for (const ev of game.log) {
      if (ev.type === 'star') {
        sfx.star(ev.combo);
        sparkle(ev.x, ev.y, 8, '#ffe45c');
        floatText(ev.x, ev.y - 10, '+' + ev.pts, ev.pts > 1 ? '#ff8fd0' : '#ffe45c', ev.pts > 1 ? 24 : 20);
      } else if (ev.type === 'gate') {
        sfx.gate();
        sparkle(ev.x, ev.y - 70, 60, null, 320);
        floatText(ev.x, ev.y - 150, 'Sector ' + (ev.sector + 1) + '!  +' + C.GATE_STARS + ' ★  +' + C.GATE_TIME + 's', '#ffffff', 26);
        flash = { color: 'rainbow', t: 0.5, max: 0.5 };
      } else if (ev.type === 'fall') {
        sfx.fall();
        floatText(ev.x, ev.y - 50, '−' + C.FALL_PENALTY + 's', '#ff7a8a', 26);
        flash = { color: '#ff3c64', t: 0.35, max: 0.35 };
        cam.x = ev.x + 150; cam.y = ev.y - 80;
      } else if (ev.type === 'over') {
        endGame();
      }
    }
    game.log.length = 0;
  }

  // ------------------------------------------------------------- drawing

  function hash(a, b, c) {
    let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1b0d3d');
    g.addColorStop(0.55, '#2a1458');
    g.addColorStop(1, '#3d1a5e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Distant nebulae and planets.
    const T = 900;
    const f0 = 0.12;
    const ox = cam.x * SCALE * f0, oy = cam.y * SCALE * f0 * 0.5;
    for (let tx = Math.floor((ox - 300) / T); tx <= Math.floor((ox + W + 300) / T); tx++) {
      const r1 = hash(tx, 7, 1);
      const cx = tx * T + r1 * T - ox, cy = H * (0.2 + hash(tx, 3, 2) * 0.6) - oy * 0.3;
      const neb = ctx.createRadialGradient(cx, cy, 0, cx, cy, 320);
      const hue = Math.floor(hash(tx, 9, 3) * 360);
      neb.addColorStop(0, `hsla(${hue},80%,65%,0.18)`);
      neb.addColorStop(1, `hsla(${hue},80%,65%,0)`);
      ctx.fillStyle = neb;
      ctx.fillRect(cx - 320, cy - 320, 640, 640);
      if (hash(tx, 5, 4) < 0.5) {
        const pr = 20 + hash(tx, 6, 5) * 40;
        const px = cx + 200 * (hash(tx, 8, 6) - 0.5), py = cy + 150;
        const pg = ctx.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr);
        pg.addColorStop(0, `hsla(${hue + 40},60%,72%,0.5)`);
        pg.addColorStop(1, `hsla(${hue + 40},50%,40%,0.35)`);
        ctx.fillStyle = pg;
        ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Star field, three parallax layers.
    const TS = 220;
    for (let layer = 0; layer < 3; layer++) {
      const f = [0.05, 0.12, 0.22][layer];
      const lx = cam.x * SCALE * f, ly = cam.y * SCALE * f * 0.5;
      const x0 = Math.floor(lx / TS), x1 = Math.floor((lx + W) / TS);
      const y0 = Math.floor(ly / TS), y1 = Math.floor((ly + H) / TS);
      for (let tx = x0; tx <= x1; tx++) {
        for (let ty = y0; ty <= y1; ty++) {
          for (let i = 0; i < 5; i++) {
            const sx = tx * TS + hash(tx, ty, i * 3 + layer * 17) * TS - lx;
            const sy = ty * TS + hash(tx, ty, i * 3 + 1 + layer * 17) * TS - ly;
            const tw = 0.55 + 0.45 * Math.sin(clock * (1 + layer) + i + tx * 3 + ty);
            ctx.globalAlpha = (0.35 + layer * 0.25) * tw;
            ctx.fillStyle = '#ffffff';
            const sz = 0.8 + layer * 0.6;
            ctx.fillRect(sx, sy, sz, sz);
          }
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  function worldTransform() {
    const sx = (Math.random() - 0.5) * cam.shake, sy = (Math.random() - 0.5) * cam.shake;
    ctx.setTransform(DPR * SCALE, 0, 0, DPR * SCALE, DPR * (W / 2 - cam.x * SCALE + sx), DPR * (H / 2 - cam.y * SCALE + sy));
  }

  function drawRing(pl, front) {
    ctx.save();
    ctx.translate(pl.x, pl.y + pl.r * 0.1);
    ctx.rotate(pl.ringTilt);
    ctx.lineWidth = 7;
    ctx.strokeStyle = `hsla(${(pl.hue + 160) % 360},80%,78%,0.75)`;
    ctx.beginPath();
    ctx.ellipse(0, 0, pl.r * 1.55, pl.r * 0.28, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = `hsla(${(pl.hue + 160) % 360},90%,90%,0.6)`;
    ctx.beginPath();
    ctx.ellipse(0, 0, pl.r * 1.4, pl.r * 0.22, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlanet(pl) {
    if (pl.ring) drawRing(pl, false);
    const h = pl.hue;
    const g = ctx.createRadialGradient(pl.x - pl.r * 0.35, pl.y - pl.r * 0.45, pl.r * 0.1, pl.x, pl.y, pl.r);
    g.addColorStop(0, `hsl(${h},85%,78%)`);
    g.addColorStop(0.7, `hsl(${h},65%,58%)`);
    g.addColorStop(1, `hsl(${h},55%,40%)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(pl.x, pl.y, pl.r, 0, Math.PI * 2); ctx.fill();
    // Craters
    for (const c of pl.craters) {
      ctx.fillStyle = `hsla(${h},50%,35%,0.35)`;
      ctx.beginPath(); ctx.arc(pl.x + c.dx, pl.y + c.dy, c.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `hsla(${h},80%,85%,0.25)`;
      ctx.beginPath(); ctx.arc(pl.x + c.dx - c.r * 0.2, pl.y + c.dy - c.r * 0.25, c.r * 0.6, 0, Math.PI * 2); ctx.fill();
    }
    // Candy frosting over the walkable top
    const a0 = -Math.PI / 2 - 1.1, a1 = -Math.PI / 2 + 1.1;
    ctx.lineCap = 'round';
    ctx.lineWidth = 9;
    ctx.strokeStyle = `hsl(${(h + 30) % 360},95%,88%)`;
    ctx.beginPath(); ctx.arc(pl.x, pl.y, pl.r - 3, a0, a1); ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.arc(pl.x, pl.y, pl.r - 1, a0 + 0.1, a1 - 0.1); ctx.stroke();
    // Drips
    ctx.fillStyle = `hsl(${(h + 30) % 360},95%,88%)`;
    for (let i = 0; i < 5; i++) {
      const a = a0 + 0.2 + (i / 4) * (a1 - a0 - 0.4);
      const len = 6 + ((pl.id * 7 + i * 13) % 10);
      const x = pl.x + Math.cos(a) * (pl.r - 6), y = pl.y + Math.sin(a) * (pl.r - 6);
      ctx.beginPath(); ctx.ellipse(x, y + len / 2, 3.5, len / 2 + 2, a + Math.PI / 2, 0, Math.PI * 2); ctx.fill();
    }
    if (pl.ring) drawRing(pl, true);
  }

  function drawGate(gate) {
    const x = gate.x, y = gate.y;
    ctx.save();
    ctx.lineCap = 'round';
    const pulse = 1 + Math.sin(clock * 4) * 0.03;
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = RAINBOW[i];
      ctx.globalAlpha = gate.used ? 0.35 : 0.95;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(x, y + 6, (95 - i * 7) * pulse, Math.PI, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Clouds at the feet
    ctx.fillStyle = '#ffffff';
    for (const s of [-1, 1]) {
      const cx = x + s * 74;
      for (const [dx, dy, r] of [[-12, 0, 12], [0, -8, 14], [13, 0, 12]]) {
        ctx.beginPath(); ctx.arc(cx + dx, y + dy, r, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (!gate.used && Math.random() < 0.3) {
      const a = Math.PI + Math.random() * Math.PI;
      particles.push({ x: x + Math.cos(a) * 80, y: y + Math.sin(a) * 80, vx: 0, vy: -20, life: 0.8, max: 0.8, size: 2.5, color: '#fff', g: 0 });
    }
    ctx.restore();
  }

  function drawStar(s) {
    const bob = Math.sin(clock * 3 + s.phase) * 4;
    const r = 11, spin = clock * 1.5 + s.phase;
    ctx.save();
    ctx.translate(s.x, s.y + bob);
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
    glow.addColorStop(0, 'rgba(255,230,120,0.55)');
    glow.addColorStop(1, 'rgba(255,230,120,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(Math.sin(spin) * 0.3);
    ctx.scale(Math.cos(spin * 0.7) * 0.25 + 0.85, 1);
    ctx.fillStyle = '#ffd84d';
    ctx.strokeStyle = '#fff3b0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Unicorn in local space: origin = collision centre, hooves at +PR, facing right.
  function drawUnicorn(x, y, o) {
    const body = o.body || '#ffffff';
    const shade = o.shade || '#f2c9ef';
    ctx.save();
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    ctx.scale((o.facing || 1) * (o.scale || 1) * (1 + (o.squash || 0) * 0.15), (o.scale || 1) * (1 - (o.squash || 0) * 0.15));
    if (o.squash) ctx.translate(0, (o.squash || 0) * 3);
    const ph = o.phase || 0;
    const air = o.air;

    // Tail
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = RAINBOW[i];
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      const wave = Math.sin(ph * 0.5 + clock * 6 + i * 0.5) * 3;
      ctx.beginPath();
      ctx.moveTo(-15, -6 + i * 1.2);
      ctx.quadraticCurveTo(-26, -10 + i * 2 + wave, -30 + i * 0.5, 2 + i * 2.5 + wave);
      ctx.stroke();
    }

    // Legs
    ctx.strokeStyle = shade;
    ctx.lineWidth = 4.5;
    const legs = [[-10, 0], [-5, Math.PI], [6, Math.PI * 0.5], [11, Math.PI * 1.5]];
    legs.forEach(([lx, off], i) => {
      let ang;
      if (air) ang = i < 2 ? 0.7 : -0.7;
      else ang = Math.sin(ph + off) * (o.moving ? 0.6 : 0.05);
      const len = 15;
      const hx = lx + Math.sin(ang) * len, hy = 3 + Math.cos(ang) * len;
      ctx.strokeStyle = i % 2 ? shade : body;
      ctx.beginPath(); ctx.moveTo(lx, 3); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.fillStyle = '#b48ad6';
      ctx.beginPath(); ctx.arc(hx, hy, 2.6, 0, Math.PI * 2); ctx.fill();
    });

    // Body
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, -2, 17, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shade;
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.ellipse(-2, 3, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // Neck + head
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(6, -10); ctx.lineTo(13, -26); ctx.lineTo(21, -22); ctx.lineTo(16, -4);
    ctx.closePath(); ctx.fill();
    ctx.save();
    ctx.translate(19, -24);
    ctx.rotate(0.35);
    ctx.beginPath(); ctx.ellipse(0, 0, 10, 6.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shade;
    ctx.beginPath(); ctx.ellipse(7, 1.5, 3.5, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // Ear
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.moveTo(12, -29); ctx.lineTo(13, -38); ctx.lineTo(17, -30); ctx.closePath(); ctx.fill();
    // Horn
    const hg = ctx.createLinearGradient(17, -30, 25, -46);
    hg.addColorStop(0, '#ffcf4d'); hg.addColorStop(1, '#fff6c2');
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.moveTo(15.5, -30); ctx.lineTo(26, -47); ctx.lineTo(20.5, -28.5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(200,140,40,0.6)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const t = i / 4;
      ctx.beginPath(); ctx.moveTo(15.5 + 10.5 * t - 2, -30 - 17 * t + 1); ctx.lineTo(20.5 + 5.5 * t, -28.5 - 18.5 * t + 2); ctx.stroke();
    }
    // Eye + blush
    ctx.fillStyle = '#2b1640';
    ctx.beginPath(); ctx.arc(21, -26, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(21.7, -26.8, 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,120,170,0.45)';
    ctx.beginPath(); ctx.arc(20, -21.5, 2.4, 0, Math.PI * 2); ctx.fill();

    // Mane
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = RAINBOW[i];
      ctx.lineWidth = 3;
      const wave = Math.sin(clock * 7 + i + ph * 0.3) * 2;
      ctx.beginPath();
      ctx.moveTo(13 - i * 0.8, -31 + i * 4.3);
      ctx.quadraticCurveTo(6 - i, -28 + i * 4 + wave, 2 - i * 1.5, -20 + i * 4.5 + wave);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayer() {
    const p = game.player;
    let rot = 0;
    if (!p.grounded) rot = Math.max(-0.5, Math.min(0.5, p.vy / 1500)) * p.facing;
    else if (p.ground) {
      const nx = (p.x - p.ground.x) / (p.ground.r + C.PR);
      rot = Math.asin(Math.max(-1, Math.min(1, nx))) * 0.6;
    }
    if (p.pounding) rot = 0;
    drawUnicorn(p.x, p.y, {
      facing: p.facing,
      phase: runPhase,
      moving: Math.abs(p.vx) > 20,
      air: !p.grounded,
      rot,
      squash: squash * (p.grounded ? 1 : 0),
    });
    // Double-jump / dash readiness pips
    if (!p.grounded) {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = p.airJumps === 0 ? '#ff8fd0' : 'rgba(255,255,255,0.15)';
      ctx.beginPath(); ctx.arc(p.x - 7, p.y + 30, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = p.canDash ? '#5cc2ff' : 'rgba(255,255,255,0.15)';
      ctx.beginPath(); ctx.arc(p.x + 7, p.y + 30, 3, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (p.bounceT > 0) {
      ctx.strokeStyle = `rgba(255,143,208,${p.bounceT / C.BOUNCE_WIN})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(p.x, p.y + C.PR, 30 * (1.3 - p.bounceT / C.BOUNCE_WIN), 7, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function drawWorld() {
    worldTransform();
    const w = game.world;
    const halfW = W / 2 / SCALE + 200, halfH = H / 2 / SCALE + 200;
    const vis = (x, y, r) => Math.abs(x - cam.x) < halfW + r && Math.abs(y - cam.y) < halfH + r;
    for (const gate of w.gates) if (vis(gate.x, gate.y, 120)) drawGate(gate);
    for (const pl of w.planets) if (vis(pl.x, pl.y, pl.r * 1.6)) drawPlanet(pl);
    for (const s of w.stars) if (!s.taken && vis(s.x, s.y, 30)) drawStar(s);
    for (const n of npcs) {
      if (!vis(n.x, n.y, 60)) continue;
      drawUnicorn(n.x, n.y, { facing: n.facing, scale: n.scale, body: n.colors[0], shade: n.colors[1], air: n.state === 'leap', phase: clock * 12, moving: false });
    }
    drawPlayer();
    for (const q of particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, q.life / q.max));
      ctx.fillStyle = q.color;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of texts) {
      ctx.globalAlpha = Math.min(1, t.life * 2);
      ctx.font = `bold ${t.size}px "Trebuchet MS", system-ui, sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(40,10,70,0.8)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
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

  function drawHud() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const p = game.player;
    const small = W < 520;
    const pad = 14;
    ctx.textBaseline = 'middle';

    // Score
    ctx.textAlign = 'left';
    ctx.font = `bold ${small ? 24 : 30}px "Trebuchet MS", system-ui, sans-serif`;
    ctx.fillStyle = '#ffd84d';
    ctx.fillText('★ ' + game.score, pad, pad + 16);
    ctx.font = '12px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('Best ' + Math.max(best, game.score), pad, pad + 40);

    // Timer
    ctx.textAlign = 'right';
    const tt = Math.ceil(game.time);
    ctx.font = `bold ${small ? 22 : 28}px "Trebuchet MS", system-ui, sans-serif`;
    ctx.fillStyle = game.time < 10 && Math.floor(clock * 4) % 2 ? '#ff7a8a' : '#ffffff';
    ctx.fillText('⏱ ' + tt, W - pad - 48, pad + 18);

    // Sector + progress
    const bw = Math.min(small ? W - 2 * pad : 300, 300);
    const bx = small ? pad : (W - bw) / 2;
    const by = small ? pad + 58 : pad + 28;
    ctx.textAlign = small ? 'left' : 'center';
    ctx.font = '13px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('Sector ' + (game.sector + 1) + ' · to the rainbow gate', small ? bx : W / 2, by - 12);
    roundRect(bx, by, bw, 8, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fill();
    const prog = U.sectorProgress(game);
    if (prog > 0) {
      const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      RAINBOW.forEach((c, i) => g.addColorStop(i / 5, c));
      ctx.save();
      roundRect(bx, by, bw, 8, 4);
      ctx.clip();
      ctx.fillStyle = g;
      ctx.fillRect(bx, by, bw * prog, 8);
      ctx.restore();
    }

    // Combo
    if (!p.grounded && p.combo >= 2) {
      ctx.textAlign = 'center';
      ctx.font = `bold ${20 + Math.min(p.combo, 8) * 2}px "Trebuchet MS", system-ui, sans-serif`;
      ctx.fillStyle = RAINBOW[Math.floor(clock * 12) % 6];
      ctx.fillText('Air combo x' + p.combo, W / 2, by + 36);
    }

    // Arrow to the gate when it's off screen
    const gate = U.nextGate(game);
    if (gate) {
      const sx = W / 2 + (gate.x - cam.x) * SCALE;
      const sy = H / 2 + (gate.y - 60 - cam.y) * SCALE;
      const m = 40;
      if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) {
        const ang = Math.atan2(sy - H / 2, sx - W / 2);
        const ex = Math.max(m, Math.min(W - m, sx)), ey = Math.max(m + 70, Math.min(H - m - (document.body.classList.contains('touch') ? 100 : 0), sy));
        const dist = Math.round((gate.x - p.x) / 100);
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(ang);
        const g = ctx.createLinearGradient(-14, 0, 16, 0);
        RAINBOW.forEach((c, i) => g.addColorStop(i / 5, c));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-10, -13); ctx.lineTo(-4, 0); ctx.lineTo(-10, 13); ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.textAlign = 'center';
        ctx.font = 'bold 11px "Trebuchet MS", system-ui, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText('GATE ' + Math.max(0, dist) + 'm', ex - Math.cos(ang) * 52, ey - Math.sin(ang) * 26);
      }
    }

    if (flash) {
      const a = (flash.t / flash.max) * 0.35;
      if (flash.color === 'rainbow') {
        const g = ctx.createLinearGradient(0, 0, W, H);
        RAINBOW.forEach((c, i) => g.addColorStop(i / 5, c));
        ctx.globalAlpha = a;
        ctx.fillStyle = g;
      } else {
        ctx.globalAlpha = a;
        ctx.fillStyle = flash.color;
      }
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------- loop

  function updateCamera(dt) {
    const p = game.player;
    const lead = p.facing * 140 + p.vx * 0.35;
    const tx = p.x + lead;
    const ty = p.y - 70;
    cam.x += (tx - cam.x) * Math.min(1, dt * 3.5);
    cam.y += (ty - cam.y) * Math.min(1, dt * (p.grounded ? 3 : 1.6));
  }

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;

    if (state === 'play') {
      acc += dt;
      while (acc >= C.STEP && state === 'play') {
        acc -= C.STEP;
        const inp = readInput();
        U.stepGame(game, inp, C.STEP);
        clearPressed();
        const p = game.player;
        runPhase += Math.abs(p.vx) * C.STEP * 0.06;
        if (p.dashT > 0 || (p.sprinting && p.grounded && Math.abs(p.vx) > C.WALK)) trail(p);
        if (p.events.length || game.log.length) handleEvents();
      }
    } else {
      acc = 0;
    }
    if (game && state !== 'paused') {
      updateNpcs(dt);
      updateFx(dt);
      updateCamera(dt);
    }

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawBackground();
    if (game) {
      drawWorld();
      if (state !== 'title') drawHud();
    }
    requestAnimationFrame(frame);
  }

  newGame();
  requestAnimationFrame((t) => { last = t; frame(t); });
})();
