// Unicorn Orbit — game rules, physics and world generation.
// No DOM access here, so the same code runs in the browser and in Node tests.
(function (root) {
  'use strict';

  const C = {
    STEP: 1 / 120,
    G: 1700,
    PR: 18, // player collision radius
    WALK: 280,
    SPRINT: 440,
    ACCEL: 1300,
    AIR_ACCEL: 900,
    TURN: 2600,
    FRICTION: 1500,
    AIR_DRAG: 250,
    OVERSPEED_DRAG: 700,
    JUMP: 640,
    DJUMP: 560,
    JUMP_CUT: 0.45,
    COYOTE: 0.1,
    BUFFER: 0.13,
    DASH_V: 720,
    DASH_T: 0.16,
    DASH_CD: 0.45,
    POUND_V: 1000,
    SUPER_MULT: Math.sqrt(1.5), // 1.5x jump height
    BOUNCE_WIN: 0.2,
    MAX_FALL: 1100,
    GROUND_NY: -0.45, // contact normal y below this counts as standing
    SNAP: 10,
    STAR_R: 30,
    // Gaps start tiny and widen with every planet until RAMP_PLANETS in.
    RAMP_PLANETS: 90,
    GAP_START: [25, 80],
    GAP_END: [110, 290],
    RISE_START: 60,
    RISE_END: 160,
    PLANETS_PER_SECTOR: 18,
    START_TIME: 90,
    GATE_TIME: 15,
    GATE_STARS: 10,
    FALL_PENALTY: 3,
  };

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  function surfaceY(pl, x) {
    const dx = clamp(x - pl.x, -pl.r, pl.r);
    return pl.y - Math.sqrt(pl.r * pl.r - dx * dx);
  }

  // ---------------------------------------------------------------- world

  function makePlanet(w, x, top, r, sector, idx) {
    const rng = w.rng;
    const craters = [];
    const n = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.15 + rng() * 0.7); // lower half, below the walkway
      const d = r * (0.35 + rng() * 0.45);
      craters.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d, r: r * (0.08 + rng() * 0.1) });
    }
    return {
      id: w.nextId++,
      x, y: top + r, r, top,
      sector, idx,
      hue: Math.floor(rng() * 360),
      ring: r > 85 && rng() < 0.35,
      ringTilt: (rng() - 0.5) * 0.5,
      craters,
    };
  }

  // Idealised jump (slightly weaker than the real player) from the walkway of
  // `a` to the walkway of `b`. Used to keep every generated gap clearable.
  // Tries a few run-up speeds, since a short gap may need a gentler jump.
  function canReach(a, b, opt) {
    for (const speed of [1, 0.7, 0.45]) {
      if (tryJump(a, b, Object.assign({ speed }, opt))) return true;
    }
    return false;
  }

  function tryJump(a, b, opt) {
    const k = opt.margin == null ? 0.9 : opt.margin;
    const dt = 1 / 120;
    let x = a.x + a.r * 0.6;
    let y = surfaceY(a, x) - C.PR;
    let vx = C.SPRINT * k * opt.speed;
    let vy = -C.JUMP * k;
    let djump = opt.doubleJump !== false;
    for (let t = 0; t < 3; t += dt) {
      vy += C.G * dt;
      if (djump && vy >= 0) { vy = -C.DJUMP * k; djump = false; }
      x += vx * dt;
      y += vy * dt;
      const dx = x - b.x, dy = y - b.y;
      const d = Math.hypot(dx, dy);
      if (d < b.r + C.PR) {
        return dy / d < C.GROUND_NY && vy > 0 && Math.abs(dx) < b.r * 0.8;
      }
      // Clipping the launch planet's far side on the way down is also a miss.
      const ax = x - a.x, ay = y - a.y;
      if (Math.hypot(ax, ay) < a.r + C.PR && t > 0.1) return false;
      if (y > b.y + b.r + 300) return false;
    }
    return false;
  }

  function addStar(w, x, y, kind) {
    w.stars.push({ x, y, kind: kind || 'star', taken: false, phase: w.rng() * 6.28 });
  }

  // 0 at the first planet, 1 once the ramp is done.
  function difficulty(n) {
    return Math.min(1, n / C.RAMP_PLANETS);
  }

  function genSector(w) {
    const s = w.sectorsGenerated++;
    const rng = w.rng;
    for (let i = 0; i < C.PLANETS_PER_SECTOR; i++) {
      const prev = w.planets[w.planets.length - 1];
      let pl = null;
      if (!prev) {
        pl = makePlanet(w, 0, 520, 150, s, i);
      } else {
        const isGate = i === C.PLANETS_PER_SECTOR - 1;
        const d = difficulty(w.nextId);
        const gapMin = C.GAP_START[0] + (C.GAP_END[0] - C.GAP_START[0]) * d;
        const gapMax = C.GAP_START[1] + (C.GAP_END[1] - C.GAP_START[1]) * d;
        const rise = C.RISE_START + (C.RISE_END - C.RISE_START) * d;
        for (let attempt = 0; attempt < 60 && !pl; attempt++) {
          const r = isGate ? 120 + rng() * 20 : 55 + rng() * 80;
          const gap = gapMin + rng() * (gapMax - gapMin);
          const top = clamp(prev.top + (rng() * 2 - 1) * rise + rise * 0.1, 220, 760);
          const cand = makePlanet(w, prev.x + prev.r + gap + r, top, r, s, i);
          if (canReach(prev, cand)) pl = cand;
          else w.nextId--;
        }
        if (!pl) {
          pl = makePlanet(w, prev.x + prev.r + gapMin + 90, prev.top, 90, s, i);
        }
        // Stars along a single-jump arc over the gap.
        const x0 = prev.x + prev.r * 0.6, x1 = pl.x - pl.r * 0.5;
        const y0 = prev.top - C.PR, y1 = pl.top - C.PR;
        const nStars = 2 + Math.floor(rng() * 3);
        const lift = 70 + rng() * 40;
        for (let k = 1; k <= nStars; k++) {
          const t = k / (nStars + 1);
          addStar(w, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t - Math.sin(Math.PI * t) * lift - Math.max(0, y0 - y1) * 0.3);
        }
        if (rng() < 0.45) addStar(w, pl.x + (rng() - 0.5) * pl.r, pl.top - 70 - rng() * 120);
        if (isGate) {
          w.gates.push({ x: pl.x, y: pl.top, planet: pl.id, sector: s, used: false });
        }
      }
      w.planets.push(pl);
    }
  }

  function createWorld(seed) {
    const w = {
      seed,
      rng: mulberry32(seed),
      planets: [],
      stars: [],
      gates: [],
      nextId: 0,
      sectorsGenerated: 0,
    };
    genSector(w);
    genSector(w);
    return w;
  }

  // Drop things far behind the player so long runs stay light.
  function prune(w, x) {
    const cut = x - 2500;
    while (w.planets.length > 4 && w.planets[1].x + w.planets[1].r < cut) w.planets.shift();
    w.stars = w.stars.filter((s) => s.x > cut && !s.taken);
    w.gates = w.gates.filter((g) => g.x > cut);
  }

  function planetById(w, id) {
    for (const p of w.planets) if (p.id === id) return p;
    return null;
  }

  // --------------------------------------------------------------- player

  function createPlayer(pl) {
    return {
      x: pl.x, y: pl.top - C.PR,
      vx: 0, vy: 0,
      facing: 1,
      grounded: true, ground: pl, safe: pl,
      coyote: 0, buffer: 0,
      airJumps: 0, canDash: true, dashT: 0, dashCd: 0,
      pounding: false, bounceT: 0,
      cutDone: true, superJump: false,
      combo: 0,
      sprinting: false,
      events: [],
    };
  }

  function emptyInput() {
    return { left: false, right: false, jump: false, sprint: false, jumpPressed: false, downPressed: false, dashPressed: false };
  }

  function towards(v, target, amount) {
    return v < target ? Math.min(target, v + amount) : Math.max(target, v - amount);
  }

  function stepPlayer(p, inp, dt, planets) {
    const ev = p.events;
    p.buffer = inp.jumpPressed ? C.BUFFER : Math.max(0, p.buffer - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.bounceT = Math.max(0, p.bounceT - dt);
    p.coyote = p.grounded ? C.COYOTE : Math.max(0, p.coyote - dt);

    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    const maxV = inp.sprint ? C.SPRINT : C.WALK;
    p.sprinting = inp.sprint && dir !== 0;

    if (inp.dashPressed && p.canDash && p.dashCd <= 0 && !p.pounding) {
      if (dir) p.facing = dir;
      p.dashT = C.DASH_T;
      p.dashCd = C.DASH_CD;
      if (!p.grounded) p.canDash = false;
      ev.push('dash');
    }
    if (inp.downPressed && !p.grounded && !p.pounding && p.dashT <= 0) {
      p.pounding = true;
      p.cutDone = true;
      ev.push('pound');
    }

    if (p.dashT > 0) {
      p.dashT -= dt;
      p.vx = p.facing * C.DASH_V;
      p.vy = 0;
      if (p.dashT <= 0) p.vx = p.facing * C.SPRINT;
    } else if (p.pounding) {
      p.vx = 0;
      p.vy = C.POUND_V;
    } else {
      const air = !p.grounded;
      if (dir !== 0) {
        p.facing = dir;
        if (p.vx * dir < -5) {
          p.vx += dir * C.TURN * (air ? 0.6 : 1) * dt; // braking to turn around
        } else if (Math.abs(p.vx) <= maxV) {
          p.vx = clamp(p.vx + dir * (air ? C.AIR_ACCEL : C.ACCEL) * dt, -maxV, maxV);
        } else {
          p.vx = towards(p.vx, dir * maxV, C.OVERSPEED_DRAG * dt);
        }
      } else {
        p.vx = towards(p.vx, 0, (air ? C.AIR_DRAG : C.FRICTION) * dt);
      }
      p.vy = Math.min(p.vy + C.G * dt, C.MAX_FALL);
      if (!inp.jump && !p.cutDone && p.vy < 0) {
        p.vy *= C.JUMP_CUT;
        p.cutDone = true;
      }
    }

    if (p.buffer > 0) {
      let jumped = null;
      if (p.grounded && p.bounceT > 0) {
        p.vy = -C.JUMP * C.SUPER_MULT;
        jumped = 'super';
      } else if (p.grounded || p.coyote > 0) {
        p.vy = -C.JUMP;
        jumped = 'jump';
      } else if (p.airJumps < 1 && !p.pounding && p.dashT <= 0) {
        p.vy = -C.DJUMP;
        p.airJumps = 1;
        jumped = 'djump';
      }
      if (jumped) {
        p.buffer = 0;
        p.coyote = 0;
        p.bounceT = 0;
        p.grounded = false;
        p.cutDone = jumped === 'super';
        p.superJump = jumped === 'super';
        ev.push(jumped);
      }
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    const wasGrounded = p.grounded;
    p.grounded = false;
    for (const pl of planets) {
      if (Math.abs(pl.x - p.x) > pl.r + C.PR + 4) continue;
      const dx = p.x - pl.x, dy = p.y - pl.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      const R = pl.r + C.PR;
      if (d >= R) continue;
      const nx = dx / d, ny = dy / d;
      p.x = pl.x + nx * R;
      p.y = pl.y + ny * R;
      const vn = p.vx * nx + p.vy * ny;
      if (vn < 0) { p.vx -= nx * vn; p.vy -= ny * vn; }
      if (ny < C.GROUND_NY) { p.grounded = true; p.ground = pl; }
    }

    // Stick to the curved ground when running over a crest instead of
    // launching off it.
    if (!p.grounded && wasGrounded && p.ground && p.vy > -60 && !p.pounding) {
      const pl = p.ground;
      const dx = p.x - pl.x, dy = p.y - pl.y;
      const d = Math.hypot(dx, dy);
      const R = pl.r + C.PR;
      const ny = dy / d;
      if (d - R < C.SNAP && ny < C.GROUND_NY) {
        const nx = dx / d;
        p.x = pl.x + nx * R;
        p.y = pl.y + ny * R;
        const vn = p.vx * nx + p.vy * ny;
        if (vn > 0) { p.vx -= nx * vn; p.vy -= ny * vn; }
        p.grounded = true;
      }
    }

    if (p.grounded && !wasGrounded) {
      p.airJumps = 0;
      p.canDash = true;
      p.combo = 0;
      p.superJump = false;
      if (p.pounding) {
        p.pounding = false;
        p.bounceT = C.BOUNCE_WIN;
        ev.push('slam');
      } else {
        ev.push('land');
      }
    }
    if (p.grounded) p.safe = p.ground;
  }

  // ----------------------------------------------------------------- game

  function createGame(seed) {
    const world = createWorld(seed);
    const player = createPlayer(world.planets[0]);
    return {
      world, player,
      time: C.START_TIME,
      score: 0,
      sector: 0,
      falls: 0,
      over: false,
      log: [], // {type, ...} for the renderer: pickups, gates, falls
      elapsed: 0,
    };
  }

  function fallLimit(w, x) {
    let lim = -Infinity;
    for (const pl of w.planets) {
      if (Math.abs(pl.x - x) < 1400) lim = Math.max(lim, pl.y + pl.r);
    }
    return (lim === -Infinity ? 1200 : lim) + 450;
  }

  function stepGame(g, inp, dt) {
    if (g.over) return;
    const p = g.player, w = g.world;
    p.events = [];
    g.elapsed += dt;
    g.time -= dt;
    stepPlayer(p, inp, dt, w.planets);

    for (const s of w.stars) {
      if (s.taken) continue;
      if (Math.hypot(s.x - p.x, s.y - p.y) < C.STAR_R) {
        s.taken = true;
        let pts = 1;
        if (!p.grounded) { p.combo++; pts = p.combo; }
        g.score += pts;
        g.log.push({ type: 'star', x: s.x, y: s.y, pts, combo: p.combo });
      }
    }

    for (const gate of w.gates) {
      if (gate.used) continue;
      if (Math.abs(p.x - gate.x) < 40 && p.y > gate.y - 150 && p.y < gate.y + 10) {
        gate.used = true;
        g.score += C.GATE_STARS;
        g.time += C.GATE_TIME;
        g.sector = gate.sector + 1;
        genSector(w);
        g.log.push({ type: 'gate', x: gate.x, y: gate.y, sector: g.sector });
      }
    }

    if (p.y > fallLimit(w, p.x)) {
      const pl = p.safe && w.planets.includes(p.safe) ? p.safe : nearestPlanet(w, p.x);
      Object.assign(p, createPlayer(pl), { facing: p.facing, events: p.events });
      g.time -= C.FALL_PENALTY;
      g.falls++;
      g.log.push({ type: 'fall', x: p.x, y: p.y });
    }

    prune(w, p.x);

    if (g.time <= 0) {
      g.time = 0;
      g.over = true;
      g.log.push({ type: 'over' });
    }
  }

  function nearestPlanet(w, x) {
    let best = w.planets[0];
    for (const pl of w.planets) if (Math.abs(pl.x - x) < Math.abs(best.x - x)) best = pl;
    return best;
  }

  function nextGate(g) {
    for (const gate of g.world.gates) if (!gate.used) return gate;
    return null;
  }

  // Progress (0..1) from the previous gate (or start) to the next gate.
  function sectorProgress(g) {
    const gate = nextGate(g);
    if (!gate) return 0;
    let startX = -Infinity;
    for (const gt of g.world.gates) if (gt.used && gt.x > startX) startX = gt.x;
    if (startX === -Infinity) startX = 0;
    return clamp((g.player.x - startX) / (gate.x - startX), 0, 1);
  }

  const api = {
    C, mulberry32, surfaceY, difficulty, createWorld, genSector, canReach, createPlayer,
    emptyInput, stepPlayer, createGame, stepGame, nextGate, sectorProgress, planetById, fallLimit,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.UnicornCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
