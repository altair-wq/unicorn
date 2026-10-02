// Plays the real physics with a simple bot to check every generated gap can
// be cleared. Run with: node test/reachability.test.js
'use strict';
const assert = require('assert');
const U = require('../core.js');
const { C } = U;

// 1. Static check: every consecutive pair passes the generator's own test,
//    and each sector has the expected number of planets.
function staticCheck(seed) {
  const w = U.createWorld(seed);
  for (let i = 0; i < 4; i++) U.genSector(w);
  assert.strictEqual(w.planets.length, C.PLANETS_PER_SECTOR * 6);
  for (let i = 1; i < w.planets.length; i++) {
    const a = w.planets[i - 1], b = w.planets[i];
    assert.ok(b.x - b.r > a.x + a.r, `planets overlap (seed ${seed}, #${i})`);
    assert.ok(U.canReach(a, b), `unreachable gap (seed ${seed}, #${i})`);
  }
  assert.strictEqual(w.gates.length, 6);
}

// 2. Dynamic check: a bot plays the real stepGame. It sprints to the
//    walkway edge, jumps, double jumps at the apex and steers in the air
//    toward the next planet, like a player would.
function timeToFall(y, vy, targetY, djump) {
  let t = 0;
  const dt = 1 / 60;
  while (t < 3) {
    vy += C.G * dt;
    if (djump && vy >= 0) { vy = -C.DJUMP; djump = false; }
    y += vy * dt;
    t += dt;
    if (vy > 0 && y >= targetY) return t;
  }
  return t;
}

function botRun(seed, sectors) {
  const g = U.createGame(seed);
  g.time = 1e9;
  const p = g.player;
  let target = null;
  const maxSteps = 120 * 60 * 4;
  for (let step = 0; step < maxSteps; step++) {
    const planets = g.world.planets;
    const inp = U.emptyInput();
    inp.sprint = true;
    if (p.grounded) {
      const cur = p.ground;
      target = planets[planets.indexOf(cur) + 1];
      inp.right = true;
      if (target && p.x > cur.x + cur.r * 0.6) { inp.jumpPressed = true; inp.jump = true; }
    } else if (target) {
      inp.jump = true;
      if (p.airJumps === 0 && p.vy >= 0) inp.jumpPressed = true;
      const t = timeToFall(p.y, p.vy, target.top - C.PR, p.airJumps === 0 && !inp.jumpPressed);
      const landX = p.x + p.vx * t;
      const aim = target.x - target.r * 0.1;
      if (landX < aim - target.r * 0.25) inp.right = true;
      else if (landX > aim + target.r * 0.25) inp.left = true;
    }
    U.stepGame(g, inp, C.STEP);
    if (g.falls > 0) return { ok: false, at: target && target.idx, sector: g.sector };
    if (g.sector >= sectors) return { ok: true };
  }
  return { ok: false, timeout: true, sector: g.sector };
}

let failures = 0;
const SEEDS = 40;
for (let seed = 1; seed <= SEEDS; seed++) {
  staticCheck(seed);
  const r = botRun(seed, 4);
  if (!r.ok) { failures++; console.log('bot failed', seed, r); }
}
assert.strictEqual(failures, 0, `${failures} of ${SEEDS} bot runs failed`);
console.log(`ok: ${SEEDS} worlds, 4 sectors each, all gaps cleared by the bot`);

// 3. Mechanics sanity.
{
  const pl = { x: 0, y: 1000, r: 900, top: 100 };
  // Full jump height ~ JUMP^2 / 2G
  const startY = pl.top - C.PR;
  const p2 = U.createPlayer(pl);
  let peak = 0;
  for (let i = 0; i < 240; i++) {
    const inp = U.emptyInput(); inp.jump = true; inp.jumpPressed = i === 0;
    U.stepPlayer(p2, inp, C.STEP, [pl]);
    peak = Math.max(peak, startY - p2.y);
  }
  const full = C.JUMP * C.JUMP / (2 * C.G);
  assert.ok(Math.abs(peak - full) < 12, `full jump ${peak} vs ${full}`);
  // Short hop is lower
  const p3 = U.createPlayer(pl);
  let hop = 0;
  for (let i = 0; i < 240; i++) {
    const inp = U.emptyInput(); inp.jump = i < 6; inp.jumpPressed = i === 0;
    U.stepPlayer(p3, inp, C.STEP, [pl]);
    hop = Math.max(hop, startY - p3.y);
  }
  assert.ok(hop < full * 0.5, `short hop ${hop}`);
  // Ground pound then jump on landing gives ~1.5x height
  const p4 = U.createPlayer(pl);
  let phase = 0, sup = 0;
  for (let i = 0; i < 600; i++) {
    const inp = U.emptyInput();
    if (i === 0) { inp.jumpPressed = true; inp.jump = true; }
    if (i === 40) inp.downPressed = true;
    if (phase === 0 && p4.events.includes('slam')) { inp.jumpPressed = true; phase = 1; }
    U.stepPlayer(p4, inp, C.STEP, [pl]);
    if (p4.events.includes('super')) phase = 2;
    if (phase === 2) sup = Math.max(sup, startY - p4.y);
  }
  assert.ok(Math.abs(sup / full - 1.5) < 0.1, `super bounce ratio ${sup / full}`);
  console.log(`ok: jump ${peak.toFixed(0)}px, hop ${hop.toFixed(0)}px, super ${sup.toFixed(0)}px`);
}
