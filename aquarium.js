/* Abyssal — a living aquarium.
   A self-contained canvas engine: procedural fish with steering behaviour,
   sinkable food the fish hunt down, and a layered deep-water environment. */
(() => {
  "use strict";

  const canvas = document.getElementById("tank");
  const ctx = canvas.getContext("2d", { alpha: false });
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- World state ----------------------------------------------------------
  const world = {
    w: 0, h: 0, dpr: 1,
    t: 0,                  // seconds elapsed
    floor: 0,              // y of the sand line
    fish: [],
    food: [],
    bubbles: [],
    motes: [],             // marine snow
    kelp: [],
    rays: [],
    sparks: [],            // eat bursts
    lively: false,         // calm tide (default) vs lively current
    fed: 0,
  };

  const MAX_FISH = 26;
  const MIN_FISH = 1;
  const TAU = Math.PI * 2;

  // ---- Helpers --------------------------------------------------------------
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist2 = (ax, ay, bx, by) => {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  };
  // Shortest signed angular difference b - a, wrapped to [-PI, PI].
  const angDelta = (a, b) => {
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  };

  // Fish species: each is a hue family with a paler belly + fin accent.
  const SPECIES = [
    { name: "ember",   hue: 24,  sat: 82, body: 58, belly: 78, fin: 40 },
    { name: "tang",    hue: 200, sat: 70, body: 56, belly: 80, fin: 64 },
    { name: "koi",     hue: 36,  sat: 70, body: 70, belly: 92, fin: 50 },
    { name: "neon",    hue: 188, sat: 85, body: 62, belly: 86, fin: 70 },
    { name: "amethyst",hue: 282, sat: 55, body: 56, belly: 78, fin: 66 },
    { name: "rosy",    hue: 342, sat: 64, body: 60, belly: 84, fin: 52 },
    { name: "lemon",   hue: 52,  sat: 80, body: 64, belly: 88, fin: 48 },
  ];

  // ---- Fish -----------------------------------------------------------------
  function makeFish(x, y) {
    const sp = pick(SPECIES);
    const len = rand(46, 96);
    return {
      x: x ?? rand(world.w * 0.2, world.w * 0.8),
      y: y ?? rand(world.h * 0.25, world.floor - 40),
      a: rand(0, TAU),          // heading
      len,
      h: len * rand(0.42, 0.5), // body height
      sp,
      speed: rand(34, 52),      // px/s cruising
      v: 0,                     // current speed
      wander: rand(0, TAU),
      phase: rand(0, TAU),
      tailRate: rand(7, 9),
      depth: rand(0.78, 1.05),  // parallax/scale-ish tint
      target: null,             // food being chased
      excite: 0,                // 0..1 hunting energy
    };
  }

  function spawnFish(n) {
    for (let i = 0; i < n && world.fish.length < MAX_FISH; i++) {
      world.fish.push(makeFish());
    }
    updateReadout();
  }

  function removeFish() {
    if (world.fish.length > MIN_FISH) {
      world.fish.pop();
      updateReadout();
    }
  }

  // ---- Food -----------------------------------------------------------------
  function dropFood(x, y, n = 1, spread = 8) {
    for (let i = 0; i < n; i++) {
      world.food.push({
        x: x + rand(-spread, spread),
        y: y + rand(-spread, spread),
        vx: rand(-6, 6),
        vy: rand(6, 16),
        r: rand(2.4, 3.8),
        wob: rand(0, TAU),
        life: 1,        // fades only once resting on the floor
        resting: false,
        rest: 0,
      });
    }
    hideHint();
  }

  function scatterFeed() {
    const count = 7 + ((Math.random() * 5) | 0);
    for (let i = 0; i < count; i++) {
      dropFood(rand(world.w * 0.2, world.w * 0.8), rand(-10, 30), 1, 14);
    }
  }

  function eatBurst(x, y, hue) {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(20, 70);
      world.sparks.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 1,
        hue,
      });
    }
  }

  // ---- Environment seeds ----------------------------------------------------
  function seedEnvironment() {
    // Marine snow
    world.motes.length = 0;
    const moteCount = reduceMotion ? 30 : Math.min(90, Math.round(world.w / 16));
    for (let i = 0; i < moteCount; i++) {
      world.motes.push({
        x: Math.random() * world.w,
        y: Math.random() * world.h,
        r: rand(0.4, 1.6),
        vy: rand(-6, 6),
        vx: rand(-4, 4),
        o: rand(0.05, 0.35),
        p: rand(0, TAU),
      });
    }

    // Kelp strands rooted in the sand
    world.kelp.length = 0;
    const strands = Math.max(4, Math.round(world.w / 220));
    for (let i = 0; i < strands; i++) {
      const x = (i + 0.5) * (world.w / strands) + rand(-40, 40);
      world.kelp.push({
        x,
        h: rand(world.h * 0.22, world.h * 0.42),
        w: rand(7, 16),
        hue: rand(120, 165),
        sway: rand(0, TAU),
        rate: rand(0.5, 0.9),
        blades: 4 + ((Math.random() * 3) | 0),
      });
    }

    // God rays from the surface
    world.rays.length = 0;
    const rayCount = reduceMotion ? 3 : 5;
    for (let i = 0; i < rayCount; i++) {
      world.rays.push({
        x: rand(-0.1, 1.1),
        w: rand(0.05, 0.13),
        tilt: rand(-0.18, 0.18),
        o: rand(0.04, 0.1),
        drift: rand(0.01, 0.03) * (Math.random() < 0.5 ? -1 : 1),
        p: rand(0, TAU),
      });
    }
  }

  // ---- Sizing ---------------------------------------------------------------
  function resize() {
    world.dpr = Math.min(window.devicePixelRatio || 1, 2);
    world.w = window.innerWidth;
    world.h = window.innerHeight;
    canvas.width = Math.round(world.w * world.dpr);
    canvas.height = Math.round(world.h * world.dpr);
    canvas.style.width = world.w + "px";
    canvas.style.height = world.h + "px";
    ctx.setTransform(world.dpr, 0, 0, world.dpr, 0, 0);
    world.floor = world.h * 0.9;
    seedEnvironment();
    // Keep fish inside the new bounds
    for (const f of world.fish) {
      f.x = clamp(f.x, 30, world.w - 30);
      f.y = clamp(f.y, world.h * 0.12, world.floor - 20);
    }
  }

  // ---- Simulation -----------------------------------------------------------
  function update(dt) {
    const speedScale = world.lively ? 1.7 : 1;

    // Food physics
    for (let i = world.food.length - 1; i >= 0; i--) {
      const p = world.food[i];
      if (!p.resting) {
        p.wob += dt * 4;
        p.vy = Math.min(p.vy + 18 * dt, 38);
        p.vx = lerp(p.vx, Math.sin(p.wob) * 8, 0.04);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y >= world.floor - 4) {
          p.y = world.floor - 4;
          p.resting = true;
        }
        if (p.x < 4) { p.x = 4; p.vx *= -0.5; }
        if (p.x > world.w - 4) { p.x = world.w - 4; p.vx *= -0.5; }
      } else {
        p.rest += dt;
        if (p.rest > 6) p.life -= dt * 0.4; // dissolve uneaten food on the sand
      }
      if (p.life <= 0) world.food.splice(i, 1);
    }

    // Fish steering + motion
    for (const f of world.fish) {
      // Find nearest food within sense range
      let best = null, bestD = Infinity;
      const sense = 340 * 340;
      for (const p of world.food) {
        const d = dist2(f.x, f.y, p.x, p.y);
        if (d < sense && d < bestD) { bestD = d; best = p; }
      }
      f.target = best;

      let desired;
      if (best) {
        desired = Math.atan2(best.y - f.y, best.x - f.x);
        f.excite = Math.min(1, f.excite + dt * 2.2);
      } else {
        // Lazy wander
        f.wander += rand(-1, 1) * dt * 1.6;
        desired = f.a + Math.sin(f.wander) * 0.6;
        f.excite = Math.max(0, f.excite - dt * 1.1);
      }

      // Edge avoidance (soft steer back toward open water)
      const m = 90;
      if (f.x < m) desired = lerp(desired, 0, (m - f.x) / m * 0.6);
      if (f.x > world.w - m) desired = lerp(desired, Math.PI, (f.x - (world.w - m)) / m * 0.6);
      if (f.y < world.h * 0.14 + m) desired = Math.abs(desired) > Math.PI / 2 ? -Math.PI / 2 - 0.3 : Math.PI / 2 + 0.3 - Math.PI; // dive
      // Keep above the sand
      if (f.y > world.floor - m) {
        desired = lerp(desired, -Math.PI / 2, clamp((f.y - (world.floor - m)) / m, 0, 1) * 0.8);
      }
      // Ceiling: nudge downward near the surface
      if (f.y < world.h * 0.12) desired = lerp(desired, Math.PI / 2, 0.5);

      // Gentle separation from crowded neighbours
      let sepX = 0, sepY = 0, near = 0;
      for (const o of world.fish) {
        if (o === f) continue;
        const d = dist2(f.x, f.y, o.x, o.y);
        const rr = (f.len + o.len) * 0.6;
        if (d < rr * rr && d > 0.001) {
          const dd = Math.sqrt(d);
          sepX += (f.x - o.x) / dd;
          sepY += (f.y - o.y) / dd;
          near++;
        }
      }
      if (near) {
        const sepA = Math.atan2(sepY, sepX);
        desired = lerp(desired, sepA, 0.25);
      }

      // Smoothly turn toward desired heading
      const turn = (best ? 3.0 : 1.6) * dt;
      f.a += clamp(angDelta(f.a, desired), -turn, turn);

      // Speed: cruise, accelerate when hunting
      const goal = f.speed * (1 + f.excite * 1.4) * speedScale * (reduceMotion ? 0.6 : 1);
      f.v = lerp(f.v, goal, 0.06);
      f.x += Math.cos(f.a) * f.v * dt;
      f.y += Math.sin(f.a) * f.v * dt;
      f.x = clamp(f.x, 6, world.w - 6);
      f.y = clamp(f.y, world.h * 0.1, world.floor - 6);

      // Tail beat scales with speed + excitement
      f.phase += dt * f.tailRate * (0.7 + f.v / 60 + f.excite * 0.6);

      // Eating: mouth reaches the pellet
      if (best) {
        const mouthX = f.x + Math.cos(f.a) * f.len * 0.5;
        const mouthY = f.y + Math.sin(f.a) * f.len * 0.5;
        const reach = f.len * 0.34 + best.r;
        if (dist2(mouthX, mouthY, best.x, best.y) < reach * reach) {
          const idx = world.food.indexOf(best);
          if (idx >= 0) world.food.splice(idx, 1);
          world.fed++;
          f.excite = 1;
          eatBurst(best.x, best.y, f.sp.hue);
          updateReadout();
        }
      }
    }

    // Bubbles
    if (!reduceMotion && Math.random() < dt * 6) {
      const ex = Math.random() < 0.5 ? world.w * 0.18 : world.w * 0.82;
      world.bubbles.push({
        x: ex + rand(-30, 30),
        y: world.floor - 6,
        r: rand(1.5, 4.5),
        vy: rand(28, 60),
        wob: rand(0, TAU),
        o: rand(0.2, 0.5),
      });
    }
    for (let i = world.bubbles.length - 1; i >= 0; i--) {
      const b = world.bubbles[i];
      b.wob += dt * 4;
      b.y -= b.vy * dt;
      b.x += Math.sin(b.wob) * 10 * dt;
      if (b.y < world.h * 0.06) world.bubbles.splice(i, 1);
    }

    // Marine snow drift
    for (const mt of world.motes) {
      mt.p += dt;
      mt.y += mt.vy * dt;
      mt.x += (mt.vx + Math.sin(mt.p) * 3) * dt;
      if (mt.y > world.h) mt.y = 0;
      if (mt.y < 0) mt.y = world.h;
      if (mt.x > world.w) mt.x = 0;
      if (mt.x < 0) mt.x = world.w;
    }

    // Eat sparks
    for (let i = world.sparks.length - 1; i >= 0; i--) {
      const s = world.sparks[i];
      s.life -= dt * 1.6;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 30 * dt;
      if (s.life <= 0) world.sparks.splice(i, 1);
    }
  }

  // ---- Rendering ------------------------------------------------------------
  function drawWater() {
    const g = ctx.createLinearGradient(0, 0, 0, world.h);
    g.addColorStop(0, "#0b3550");
    g.addColorStop(0.35, "#072739");
    g.addColorStop(0.72, "#051a28");
    g.addColorStop(1, "#03101a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, world.w, world.h);
  }

  function drawRays() {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const r of world.rays) {
      const x = (r.x + Math.sin(world.t * r.drift + r.p) * 0.04) * world.w;
      const w = r.w * world.w;
      const topL = x - w / 2, topR = x + w / 2;
      const botL = topL + r.tilt * world.h, botR = topR + r.tilt * world.h;
      const grad = ctx.createLinearGradient(0, 0, 0, world.h * 0.85);
      grad.addColorStop(0, `rgba(150, 220, 255, ${r.o})`);
      grad.addColorStop(1, "rgba(150, 220, 255, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(topL, -10);
      ctx.lineTo(topR, -10);
      ctx.lineTo(botR, world.h * 0.85);
      ctx.lineTo(botL, world.h * 0.85);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawFloor() {
    const fy = world.floor;
    const g = ctx.createLinearGradient(0, fy - 30, 0, world.h);
    g.addColorStop(0, "rgba(40, 52, 60, 0)");
    g.addColorStop(0.4, "#16222b");
    g.addColorStop(1, "#0c161d");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, world.h);
    ctx.lineTo(0, fy + 6);
    const step = world.w / 8;
    for (let i = 0; i <= 8; i++) {
      const x = i * step;
      const y = fy + Math.sin(i * 1.3 + 0.5) * 8;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(world.w, world.h);
    ctx.closePath();
    ctx.fill();
  }

  function drawKelp() {
    for (const k of world.kelp) {
      const sway = Math.sin(world.t * k.rate + k.sway);
      ctx.save();
      ctx.translate(k.x, world.floor);
      ctx.strokeStyle = `hsla(${k.hue}, 45%, 32%, 0.85)`;
      ctx.lineCap = "round";
      for (let b = 0; b < k.blades; b++) {
        const off = (b - k.blades / 2) * (k.w * 0.5);
        const bh = k.h * (0.7 + (b % 2) * 0.3);
        ctx.lineWidth = k.w * 0.45 * (1 - b * 0.04);
        ctx.beginPath();
        ctx.moveTo(off, 0);
        ctx.quadraticCurveTo(
          off + sway * 22, -bh * 0.55,
          off + sway * 46, -bh
        );
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawFish(f) {
    const wag = Math.sin(f.phase) * (0.25 + Math.min(f.v / 120, 0.35));
    const L = f.len, H = f.h;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.a);
    // Flip so the fish stays upright whether swimming left or right
    const facingLeft = Math.cos(f.a) < 0;
    if (facingLeft) ctx.scale(1, -1);

    const sp = f.sp;
    const bodyCol = `hsl(${sp.hue}, ${sp.sat}%, ${sp.body}%)`;
    const bellyCol = `hsl(${sp.hue}, ${sp.sat - 18}%, ${sp.belly}%)`;
    const finCol = `hsla(${sp.hue}, ${sp.sat}%, ${sp.fin}%, 0.72)`;

    // Caudal (tail) fin — sways opposite the body
    ctx.save();
    ctx.translate(-L * 0.42, 0);
    ctx.rotate(wag);
    ctx.fillStyle = finCol;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-L * 0.28, -H * 0.5, -L * 0.4, -H * 0.62);
    ctx.quadraticCurveTo(-L * 0.22, 0, -L * 0.4, H * 0.62);
    ctx.quadraticCurveTo(-L * 0.28, H * 0.5, 0, 0);
    ctx.fill();
    ctx.restore();

    // Dorsal fin
    ctx.fillStyle = finCol;
    ctx.beginPath();
    ctx.moveTo(L * 0.1, -H * 0.42);
    ctx.quadraticCurveTo(-L * 0.05, -H * 0.95, -L * 0.22, -H * 0.34);
    ctx.quadraticCurveTo(-L * 0.05, -H * 0.32, L * 0.1, -H * 0.42);
    ctx.fill();

    // Pectoral fin
    ctx.fillStyle = `hsla(${sp.hue}, ${sp.sat}%, ${sp.fin}%, 0.55)`;
    ctx.beginPath();
    ctx.moveTo(L * 0.08, H * 0.18);
    ctx.quadraticCurveTo(-L * 0.06, H * 0.62, L * 0.18, H * 0.5);
    ctx.quadraticCurveTo(L * 0.2, H * 0.3, L * 0.08, H * 0.18);
    ctx.fill();

    // Body
    const grad = ctx.createLinearGradient(0, -H * 0.5, 0, H * 0.6);
    grad.addColorStop(0, bodyCol);
    grad.addColorStop(1, bellyCol);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(L * 0.5, 0);                                   // nose
    ctx.quadraticCurveTo(L * 0.18, -H * 0.62, -L * 0.36, -H * 0.16); // top
    ctx.quadraticCurveTo(-L * 0.46, 0, -L * 0.36, H * 0.16);  // tail base
    ctx.quadraticCurveTo(L * 0.18, H * 0.62, L * 0.5, 0);     // belly
    ctx.fill();

    // Subtle sheen along the back
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.moveTo(L * 0.42, -H * 0.04);
    ctx.quadraticCurveTo(L * 0.12, -H * 0.42, -L * 0.28, -H * 0.14);
    ctx.quadraticCurveTo(L * 0.05, -H * 0.2, L * 0.42, -H * 0.04);
    ctx.fill();

    // Eye
    ctx.fillStyle = "#f7fbff";
    ctx.beginPath();
    ctx.arc(L * 0.3, -H * 0.08, Math.max(1.6, H * 0.11), 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#06121b";
    ctx.beginPath();
    ctx.arc(L * 0.32, -H * 0.08, Math.max(0.9, H * 0.06), 0, TAU);
    ctx.fill();

    ctx.restore();
  }

  function drawFood() {
    for (const p of world.food) {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = "#d9a566";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 234, 200, 0.6)";
      ctx.beginPath();
      ctx.arc(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.4, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawBubbles() {
    ctx.strokeStyle = "rgba(190, 230, 255, 0.5)";
    for (const b of world.bubbles) {
      ctx.globalAlpha = b.o;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawMotes() {
    ctx.fillStyle = "#cfe9ff";
    for (const mt of world.motes) {
      ctx.globalAlpha = mt.o * (0.6 + 0.4 * Math.sin(mt.p));
      ctx.beginPath();
      ctx.arc(mt.x, mt.y, mt.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawSparks() {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const s of world.sparks) {
      ctx.globalAlpha = clamp(s.life, 0, 1) * 0.8;
      ctx.fillStyle = `hsl(${s.hue}, 90%, 72%)`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2.2 * s.life + 0.6, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function render() {
    drawWater();
    drawRays();
    drawMotes();
    drawFloor();
    drawKelp();
    drawBubbles();
    // Sort fish by depth so larger/near fish layer in front
    world.fish.sort((a, b) => a.depth - b.depth);
    for (const f of world.fish) drawFish(f);
    drawFood();
    drawSparks();
  }

  // ---- Loop -----------------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    dt = Math.min(dt, 0.05); // clamp big gaps (tab switches)
    world.t += dt;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  // ---- HUD ------------------------------------------------------------------
  const elFish = document.getElementById("stat-fish");
  const elFed = document.getElementById("stat-fed");
  const elHint = document.getElementById("hint");
  let hintTimer = null;

  function updateReadout() {
    elFish.textContent = world.fish.length;
    elFed.textContent = world.fed;
  }
  function hideHint() {
    if (elHint && !elHint.classList.contains("is-hidden")) {
      elHint.classList.add("is-hidden");
    }
  }

  // ---- Interaction ----------------------------------------------------------
  canvas.addEventListener("pointerdown", (e) => {
    dropFood(e.clientX, e.clientY, 2 + ((Math.random() * 2) | 0), 10);
  });

  document.getElementById("btn-feed").addEventListener("click", scatterFeed);
  document.getElementById("btn-add").addEventListener("click", () => spawnFish(1));
  document.getElementById("btn-remove").addEventListener("click", removeFish);

  const motionBtn = document.getElementById("btn-motion");
  const motionLabel = document.getElementById("btn-motion-label");
  motionBtn.addEventListener("click", () => {
    world.lively = !world.lively;
    motionBtn.setAttribute("aria-pressed", String(world.lively));
    motionLabel.textContent = world.lively ? "Lively current" : "Calm tide";
  });

  window.addEventListener("resize", resize, { passive: true });

  // Idle hint auto-dismiss
  hintTimer = setTimeout(hideHint, 9000);

  // ---- Boot -----------------------------------------------------------------
  resize();
  spawnFish(reduceMotion ? 8 : 13);
  // Spread initial tail phases so the school doesn't beat in unison
  for (const f of world.fish) f.phase = rand(0, TAU);
  requestAnimationFrame(frame);
})();
