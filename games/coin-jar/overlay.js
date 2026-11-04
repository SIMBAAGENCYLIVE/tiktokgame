/* Coin Jar Pro (clone) — overlay runtime.
 *
 * Connects to the Tikfinity desktop Events API WebSocket (ws://127.0.0.1:21213/),
 * counts gift coins toward a goal, and renders a glass jar full of physics-driven
 * gift "coins". When "Combine like gifts" (combine=1) is on, two identical gifts
 * that bump into each other merge into one bigger gift — a 2048 / Suika mechanic.
 *
 * Pure counting/merge math lives in lib.js (window.CoinJarLib). Physics is Matter.js.
 */
(function () {
  'use strict';
  const L = window.CoinJarLib;
  const M = window.Matter;

  // ---- config -------------------------------------------------------------
  const params = new URLSearchParams(window.location.search);
  const cfg = L.parseConfig(params);

  const el = (id) => document.getElementById(id);
  const app = el('app');
  const layerFront = el('jarFront');
  const layerBack = el('jarBack');
  const layerBottom = el('jarBottom');
  const canvas = el('canvas');
  const ctx = canvas.getContext('2d');

  // ---- apply appearance from config --------------------------------------
  const root = document.documentElement.style;
  // Font (Coin Jar Pro): load the chosen family + derive size/spacing CSS vars.
  const FONT_FAMILY = "'" + cfg.fontType + "', " + cfg.font;
  loadWebFont(cfg.fontType);
  root.setProperty('--cjp-theme', cfg.theme);
  root.setProperty('--cjp-accent', cfg.accent);
  root.setProperty('--cjp-jar', cfg.jarColor);
  root.setProperty('--cjp-width', cfg.width + 'px');
  root.setProperty('--cjp-font', FONT_FAMILY);
  root.setProperty('--cjp-font-scale', (cfg.fontSize / 50).toFixed(3));
  root.setProperty('--cjp-letter', (((cfg.fontLetterSpacing - 50) / 50) * 1.5).toFixed(2) + 'px');
  root.setProperty('--cjp-line', (0.9 + (cfg.fontLineSpacing / 100) * 0.9).toFixed(2));
  if (cfg.bg && cfg.bg !== 'transparent') document.body.style.background = cfg.bg;
  // Position: X/Y offset + overall scale (origin is bottom-center).
  const posTransform = 'translateX(calc(-50% + ' + cfg.xOffset + 'px)) translateY(' + cfg.yOffset + 'px)';
  app.style.transform = posTransform + (cfg.scale && cfg.scale !== 1 ? ' scale(' + cfg.scale + ')' : '');

  // Load a Google-hosted web font for the chosen family (system fonts skip this).
  function loadWebFont(family) {
    if (!family) return;
    const sys = ['inter', 'segoe ui', 'system-ui', 'arial', 'sans-serif', 'serif'];
    if (sys.includes(String(family).toLowerCase())) return;
    try {
      const href = 'https://fonts.googleapis.com/css2?family=' +
        encodeURIComponent(family).replace(/%20/g, '+') + ':wght@400;700;900&display=swap';
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    } catch (_) { /* offline: fall back to system fonts */ }
  }

  // Layout (CSS px). The jar art is authored on a 500px-square front jar, sitting in a
  // taller canvas so gifts can OVERFLOW above it. The user's layered PNGs go: back pieces
  // behind the gift canvas, front glass over it.
  const JAR_W = cfg.width;                  // displayed front-jar size
  const S = JAR_W / 500;                    // art is authored at 500px
  const CW = Math.round(548 * S);           // container / canvas width
  const CH = Math.round(901 * S);           // container / canvas height (overflow headroom)
  app.style.width = CW + 'px';
  app.style.height = CH + 'px';
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = CW * dpr;
  canvas.height = CH * dpr;
  canvas.style.width = CW + 'px';
  canvas.style.height = CH + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // FX layer (over the front glass): cracks, the shatter flash, and glass shards.
  const fxCanvas = el('fx');
  const fx = fxCanvas.getContext('2d');
  fxCanvas.width = CW * dpr;
  fxCanvas.height = CH * dpr;
  fxCanvas.style.width = CW + 'px';
  fxCanvas.style.height = CH + 'px';
  fx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Front jar (500x500): centred horizontally, anchored to the BOTTOM of the container so it
  // sits on the ground. Overflow gifts pile ABOVE it, and any that spill out rest beside it.
  const JARW = Math.round(500 * S);
  const JBX = Math.round((CW - JARW) / 2);
  const JBY = Math.round(CH - JARW);
  // Physics interior (where gifts pile) as inset fractions of the 500-unit jar box.
  const inX = L.clamp(cfg.jarInsetX, 0, 0.45);
  const inT = L.clamp(cfg.jarInsetTop, 0, 0.8);
  const inB = L.clamp(cfg.jarInsetBottom, 0, 0.8);
  const IL = JBX + JARW * inX;
  const IR = JBX + JARW * (1 - inX);
  const ITOP = JBY + JARW * inT;
  const IBOT = JBY + JARW * (1 - inB);
  const GIFT_R = Math.max(5, cfg.baseRadius * S * cfg.giftScale);

  // Place the user's layered jar art (back pieces behind the canvas, front glass over it).
  function layoutLayer(elm, src, w, h, left, top) {
    if (!elm) return;
    elm.src = src;
    elm.style.width = w + 'px'; elm.style.height = h + 'px';
    elm.style.left = left + 'px'; elm.style.top = top + 'px';
    elm.onerror = () => { elm.style.display = 'none'; };
  }
  layoutLayer(layerFront, cfg.jarFrontImage, JARW, JARW, JBX, JBY);
  layoutLayer(layerBack, cfg.jarBackImage, Math.round(256 * S), Math.round(34 * S),
    Math.round((CW - 256 * S) / 2), Math.round(JBY + 45 * S));
  layoutLayer(layerBottom, cfg.jarBottomImage, Math.round(233 * S), Math.round(62 * S),
    Math.round((CW - 233 * S) / 2), Math.round(JBY + 375 * S));

  // Give every jar layer the SAME world pivot (the jar's base centre) so the drop-in
  // rotation sways them coherently instead of each spinning about its own centre.
  function setPivot(elm, left, top) {
    if (elm) elm.style.transformOrigin = (CW / 2 - left) + 'px ' + (JBY + JARW * (1 - inB) - top) + 'px';
  }
  setPivot(layerFront, JBX, JBY);
  setPivot(layerBack, Math.round((CW - 256 * S) / 2), Math.round(JBY + 45 * S));
  setPivot(layerBottom, Math.round((CW - 233 * S) / 2), Math.round(JBY + 375 * S));

  // ---- state --------------------------------------------------------------
  // A signature of the goal-defining config. If the streamer changes goal/start/mode,
  // previously stored progress is stale and must NOT override the new configuration.
  const STATE_SIG = cfg.goal + '|' + (cfg.start || 0) + '|' + cfg.onGoal;
  let state = { total: cfg.start || 0, goal: cfg.goal, cycles: 0 };
  if (cfg.persist && !cfg.demo) {
    try {
      const saved = JSON.parse(localStorage.getItem('cjp:' + cfg.persistKey) || 'null');
      if (saved && saved.sig === STATE_SIG && typeof saved.total === 'number') {
        state = { total: saved.total, goal: saved.goal || cfg.goal, cycles: saved.cycles || 0 };
      }
    } catch (_) { /* ignore */ }
  }
  let combine = cfg.combine;

  function persist() {
    if (!cfg.persist || cfg.demo) return;   // never write progress while demoing / previewing
    try {
      localStorage.setItem('cjp:' + cfg.persistKey,
        JSON.stringify({ total: state.total, goal: state.goal, cycles: state.cycles, sig: STATE_SIG }));
    } catch (_) {}
  }

  // ---- sounds (optional) --------------------------------------------------
  function play(url) {
    if (!url) return;
    try { const a = new Audio(url); a.volume = cfg.volume; a.play().catch(() => {}); } catch (_) {}
  }

  // ---- gift visuals -------------------------------------------------------
  const imgCache = new Map();
  const SHAPE_SAMPLE_SIZE = 64;
  const IMAGE_LOAD_TIMEOUT_MS = 5000;

  function sampleImageShape(image) {
    const sample = document.createElement('canvas');
    sample.width = sample.height = SHAPE_SAMPLE_SIZE;
    const sampleCtx = sample.getContext('2d', { willReadFrequently: true });
    sampleCtx.drawImage(image, 0, 0, SHAPE_SAMPLE_SIZE, SHAPE_SAMPLE_SIZE);
    return L.silhouetteHull(
      sampleCtx.getImageData(0, 0, SHAPE_SAMPLE_SIZE, SHAPE_SAMPLE_SIZE),
      SHAPE_SAMPLE_SIZE,
      SHAPE_SAMPLE_SIZE
    );
  }

  function loadGiftImage(rec, url, cors) {
    const image = new Image();
    if (cors) image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    rec.img = image;
    let finished = false;
    let timeout = null;
    function finishAttempt() {
      if (finished || rec.img !== image) return false;
      finished = true;
      clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      return true;
    }
    function failAttempt(timedOut) {
      if (!finishAttempt()) return;
      if (cors) {
        loadGiftImage(rec, url, false);
        return;
      }
      rec.ok = false;
      rec.shapeState = 'failed';
      debugLog(timedOut ? 'Gift image timed out; using fallback hitbox' : 'Gift image failed');
      upgradeImageBodies(rec);
    }
    image.onload = () => {
      if (!finishAttempt()) return;
      rec.ok = true;
      rec.shape = null;
      if (cors) {
        try {
          rec.shape = sampleImageShape(image);
        } catch (err) {
          debugLog('Image alpha unavailable: ' + String(err && err.message ? err.message : err));
        }
      }
      rec.shapeState = rec.shape ? 'ready' : 'fallback';
      pileDirty = true;
      upgradeImageBodies(rec);
    };
    image.onerror = () => failAttempt(false);
    timeout = setTimeout(() => failAttempt(true), IMAGE_LOAD_TIMEOUT_MS);
    image.src = url;
  }

  function getImage(url) {
    if (!url) return null;
    if (imgCache.has(url)) return imgCache.get(url);
    const rec = { img: null, ok: false, shape: null, shapeState: 'loading' };
    imgCache.set(url, rec);
    loadGiftImage(rec, url, true);
    return rec;
  }
  function colorFor(giftId) {
    let h = 0;
    const s = String(giftId);
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return 'hsl(' + h + ' 75% 58%)';
  }
  const KNOWN_EMOJI = {
    rose: '🌹', tiktok: '🎵', gg: '🎮', heart: '❤️', 'finger heart': '🫰',
    perfume: '🌸', doughnut: '🍩', donut: '🍩', star: '⭐', 'love you': '💛',
    'hand hearts': '🤲', 'ice cream cone': '🍦', orange: '🍊', galaxy: '🌌',
    rocket: '🚀', lion: '🦁', 'tiktok universe': '🌠', diamond: '💎', coral: '🪸',
    sunglasses: '😎', cake: '🍰', pizza: '🍕', crown: '👑', money: '💰',
  };
  function emojiFor(giftName) {
    return KNOWN_EMOJI[String(giftName || '').toLowerCase()] || null;
  }

  // ---- physics ------------------------------------------------------------
  // enableSleeping lets settled gifts stop simulating — big win once the jar fills.
  const engine = M.Engine.create({ enableSleeping: true });
  engine.gravity.y = cfg.gravity;
  // Fewer solver iterations — plenty for casual stacking, much cheaper per frame.
  engine.positionIterations = 3;
  engine.velocityIterations = 2;
  engine.constraintIterations = 1;
  const world = engine.world;

  const wallOpts = { isStatic: true, restitution: 0.04, friction: 0.5 };
  const jarWallH = IBOT - ITOP;
  // Walls live in their own composite so the whole enclosure can be removed when the jar
  // shatters (letting gifts fly off-screen) and re-added when a fresh jar has dropped in.
  let walls = null;
  function addWalls() {
    if (walls) return;
    walls = M.Composite.create();
    M.Composite.add(walls, [
      // the BOX around the jar — fully encloses gifts so overflow is caught and piles up
      M.Bodies.rectangle(CW / 2, CH + 30, CW + 200, 60, wallOpts),                  // box floor
      M.Bodies.rectangle(CW / 2, -30, CW + 200, 60, wallOpts),                      // box top
      M.Bodies.rectangle(-30, CH / 2, 60, CH * 3, wallOpts),                        // box left
      M.Bodies.rectangle(CW + 30, CH / 2, 60, CH * 3, wallOpts),                    // box right
      // jar interior — walls only up to the mouth, so a full jar OVERFLOWS over the top
      M.Bodies.rectangle(IL - 5, ITOP + jarWallH / 2, 10, jarWallH, wallOpts),      // jar wall left
      M.Bodies.rectangle(IR + 5, ITOP + jarWallH / 2, 10, jarWallH, wallOpts),      // jar wall right
      M.Bodies.rectangle((IL + IR) / 2, IBOT + 8, (IR - IL) + 12, 16, wallOpts),    // jar floor
    ]);
    M.Composite.add(world, walls);
  }
  function removeWalls() {
    if (!walls) return;
    M.Composite.remove(world, walls);
    walls = null;
  }
  addWalls();

  // ---- settled-pile render cache -----------------------------------------
  // Settled gifts are made static (see freezeIfSettled) and never move again, so we draw
  // them ONCE to an offscreen "pile" canvas and just blit that each frame. The per-frame
  // loop then only redraws the handful of in-flight gifts — keeping draw cost ~O(active)
  // instead of O(all), which is what actually matters at high body counts / 2x-DPI OBS
  // sources. (Physics was already cheap: settled gifts are static.)
  const pileCanvas = document.createElement('canvas');
  pileCanvas.width = Math.round(CW * dpr);
  pileCanvas.height = Math.round(CH * dpr);
  const pileCtx = pileCanvas.getContext('2d');
  pileCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  let pileDirty = true;                       // rebuild when a gift freezes / merges / resets
  function rebuildPile() {
    pileCtx.clearRect(0, 0, CW, CH);
    for (const bd of M.Composite.allBodies(world)) {
      if (bd.isStatic && bd.plugin && bd.plugin.gift) drawGift(bd, pileCtx);
    }
  }

  let spawnSeq = 0;
  function emojiShapeFor(gift) {
    if (!gift.emoji) return null;
    return emojiShape(gift.emoji);
  }

  function giftShape(gift) {
    if (gift.img) {
      if (gift.img.shape) return gift.img.shape;
      if (gift.img.ok) return null;
    }
    return emojiShapeFor(gift);
  }

  function giftBodyOptions() {
    return {
      restitution: cfg.restitution,
      friction: 0.3,
      frictionAir: 0.02,
      density: 0.0014,
      sleepThreshold: 24,
    };
  }

  function createGiftBody(x, y, radius, gift, shape) {
    let body = null;
    if (shape && shape.vertices.length >= 3) {
      const vertices = shape.vertices.map((point) => ({
        x: point.x * radius,
        y: point.y * radius,
      }));
      try {
        body = M.Bodies.fromVertices(x, y, vertices, giftBodyOptions(), false, 0.01, 1, 0.01);
      } catch (err) {
        debugLog('Silhouette fallback: ' + String(err && err.message ? err.message : err));
      }
    }
    if (!body) {
      shape = null;
      body = M.Bodies.circle(x, y, radius, giftBodyOptions());
    }
    gift.hitbox = shape ? 'silhouette' : 'circle';
    gift.hitboxShape = shape;
    body.plugin = { gift };
    return body;
  }

  function makeBody(x, y, radius, gift) {
    gift.radius = radius;
    gift.born = performance.now();
    gift.seq = spawnSeq++;
    const body = createGiftBody(x, y, radius, gift, giftShape(gift));
    M.Composite.add(world, body);
    return body;
  }

  function replaceGiftBody(body) {
    const gift = body && body.plugin && body.plugin.gift;
    if (!gift || gift.pending) return body;
    const shape = giftShape(gift);
    if (gift.hitboxShape === shape) return body;

    const replacement = createGiftBody(
      body.position.x,
      body.position.y,
      gift.radius,
      gift,
      shape
    );
    M.Body.setAngle(replacement, body.angle);
    M.Body.setVelocity(replacement, { x: body.velocity.x, y: body.velocity.y });
    M.Body.setAngularVelocity(replacement, body.angularVelocity);
    gift.born = performance.now();
    gift.rest = 0;
    M.Composite.remove(world, body);
    M.Composite.add(world, replacement);
    pileDirty = true;
    return replacement;
  }

  function upgradeImageBodies(rec) {
    if (!world) return;
    for (const body of M.Composite.allBodies(world).slice()) {
      if (!body.plugin || !body.plugin.gift) continue;
      const gift = body.plugin.gift;
      if (gift.img !== rec) continue;
      const replacement = replaceGiftBody(body);
      if (replacement === body && body.isStatic) accountOverflowIfFinal(body, gift);
    }
  }

  function giftBodyCount() {
    const all = M.Composite.allBodies(world);
    let n = 0;
    for (let i = 0; i < all.length; i++) if (all[i].plugin && all[i].plugin.gift) n++;
    return n;
  }

  // Single entry point — the gift "dropper" portal sits at the very TOP of the screen,
  // so gifts fall the full height into the jar (overflow then fills the box below).
  const ENTRY_X = CW / 2;
  const ENTRY_Y = Math.max(16 * S, GIFT_R + 4);
  const spawnQ = [];          // queued gift "units" waiting to stream in one-by-one
  const visualQueueLimit = Math.max(200, cfg.maxBodies * 2);
  let skippedVisuals = 0;
  let lastRelease = 0;

  // Queue a finalized gift event's icons. They stream in one at a time (paced by
  // streamStagger) from a single point on a spread-cone trajectory — or, with
  // stream=off, burst all at once. Bodies are bounded by maxBodies (queue included).
  function spawnGift(g) {
    const live = jarPhase === 'live';
    if (!cfg.jarBreaks && live && giftBodyCount() + spawnQ.length >= cfg.maxBodies) return;
    if (spawnQ.length >= visualQueueLimit) { skippedVisuals++; return; }
    const units = L.clamp(Math.max(1, Math.floor(g.repeatCount)), 1, cfg.spawnCap);
    const value = Math.max(1, g.diamondCount || 1);
    const meta = {
      giftId: g.giftId, giftName: g.giftName, value, count: 1,
      img: getImage(g.pictureUrl), color: colorFor(g.giftId), emoji: emojiFor(g.giftName),
      radius: GIFT_R * (cfg.sizeByValue ? L.sizeScale(value, cfg) : 1),   // worth more = bigger
      big: value >= cfg.bigGiftCoins,
    };
    // While the jar is shattering / dropping in, CACHE the icons in spawnQ so they pour into
    // the fresh jar as soon as it's back (they're already counted in the total/leaderboard).
    for (let i = 0; i < units; i++) {
      if (cfg.stream || !live) {
        if (spawnQ.length >= visualQueueLimit) { skippedVisuals += units - i; break; }
        spawnQ.push(meta);
      }
      else releaseGift(meta);
    }
    // a big gift cracks the jar on the way in (damage scales with value; 5×+ shatters it)
    if (cfg.jarBreaks && live && value >= cfg.crackBigGiftCoins) addDamage(L.crackIncrement(value, false, cfg));
  }

  // Drop one gift from the entry point along a launch trajectory inside the cone.
  function releaseGift(meta) {
    if (!cfg.jarBreaks && giftBodyCount() >= cfg.maxBodies) return;
    const body = makeBody(ENTRY_X, ENTRY_Y, meta.radius, {
      giftId: meta.giftId, giftName: meta.giftName, value: meta.value, count: meta.count,
      img: meta.img, color: meta.color, emoji: meta.emoji,
    });
    const v = L.launchVelocity(cfg.spreadDeg, cfg.launchSpeed, Math.random());
    M.Body.setVelocity(body, { x: v.vx, y: v.vy });
    M.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.12);
    pop(ENTRY_X, ENTRY_Y);
    if (meta.big && cfg.bigGiftSplash) spawnConfetti(ENTRY_X, ENTRY_Y + 6, 16, cfg.accent);   // optional splash for valuable gifts
  }

  // Release queued gifts one at a time, paced by streamStagger.
  function processSpawnQ(now) {
    if (jarPhase !== 'live' || !spawnQ.length) return;
    // Drain faster when there's a backlog (e.g. gifts cached while the jar was shattering) so
    // they catch up "as soon as possible" instead of trickling in for ages.
    const backlog = spawnQ.length;
    const stagger = backlog > 12 ? Math.max(25, cfg.streamStagger * 0.4) : cfg.streamStagger;
    if (now - lastRelease < stagger) return;
    lastRelease = now;
    let n = backlog > 60 ? 5 : backlog > 25 ? 3 : backlog > 12 ? 2 : 1;
    while (n-- > 0 && spawnQ.length) releaseGift(spawnQ.shift());
  }

  // A quick expanding ring where a gift drops in.
  function pop(x, y) { effects.push({ type: 'ring', x, y, r: 6, max: 26, life: 1 }); }

  // ---- merging (2048 / Suika) --------------------------------------------
  const effects = [];          // pop rings + floating texts
  const confetti = [];

  M.Events.on(engine, 'collisionStart', (evt) => {
    if (!combine || jarPhase !== 'live') return;
    for (const pair of evt.pairs) {
      const a = pair.bodyA, b = pair.bodyB;
      const ga = a.plugin && a.plugin.gift, gb = b.plugin && b.plugin.gift;
      if (!ga || !gb || ga.pending || gb.pending) continue;
      if (L.mergeAction(ga, gb) !== 'merge') continue;   // same gift only (size need not match)
      ga.pending = gb.pending = true;
      mergeQueue.push({ a, b });
    }
  });

  let mergeQueue = [];
  function processMerges() {
    if (!mergeQueue.length) return;
    const q = mergeQueue; mergeQueue = [];
    for (const item of q) {
      const a = item.a, b = item.b;
      const ga = a.plugin && a.plugin.gift, gb = b.plugin && b.plugin.gift;
      if (!ga || !gb) continue;
      const mx = (a.position.x + b.position.x) / 2;
      const my = (a.position.y + b.position.y) / 2;
      const vx = (a.velocity.x + b.velocity.x) / 2;
      const merged = L.mergeResult(ga, gb);            // same gift; counts add up
      M.Composite.remove(world, a);
      M.Composite.remove(world, b);
      pileDirty = true;                         // a settled gift may have been removed
      const body = makeBody(mx, my, GIFT_R * L.combineScale(merged.count, cfg), {
        giftId: merged.giftId, giftName: merged.giftName, count: merged.count,
        value: merged.value, img: ga.img, color: ga.color, emoji: ga.emoji,
        overflowCounted: !!ga.overflowCounted && !!gb.overflowCounted,
      });
      M.Body.setVelocity(body, { x: vx, y: -1 });
      play(cfg.mergeSound);
    }
  }

  // ---- jar breaking: crack -> shatter -> drop a fresh jar in -> tally ------
  const JC_X = (IL + IR) / 2;             // jar centre
  const JC_Y = (ITOP + IBOT) / 2;
  const CRACK_TOP = JBY + JARW * 0.25;    // below the rim/threads: cracks live on the BODY only
  const CRACK_BOT = IBOT;
  const DROP_MS = 1300;                   // length of the drop-in animation
  let jarPhase = 'dropping';              // 'dropping' | 'live' | 'exploding'
  let jarDamage = 0;
  let brokenCount = 0;
  let dropStart = performance.now();
  let respawnTimer = null;
  let flash = 0;                          // 0..1 white shatter flash
  let crackSeed = 1357;
  const cracks = [];                      // {x1,y1,x2,y2,w} crack segments on the glass
  const shards = [];                      // exploding glass pieces
  const flyaways = [];                    // gifts following a precomputed explosion path (no physics)
  const tallyEl = el('tally');

  // small deterministic PRNG so cracks/shards look varied but are cheap
  function rng() { crackSeed = (crackSeed * 1103515245 + 12345) & 0x7fffffff; return crackSeed / 0x7fffffff; }

  // Jagged crack lines radiating from an impact point on the glass.
  function addCrack(x, y, n) {
    n = Math.max(2, n | 0);
    for (let k = 0; k < n; k++) {
      let px = x, py = y, ang = rng() * Math.PI * 2;
      const segs = 2 + Math.floor(rng() * 3);
      for (let s = 0; s < segs; s++) {
        ang += (rng() - 0.5) * 1.0;
        const len = (7 + rng() * 16) * S;
        const nx = px + Math.cos(ang) * len, ny = py + Math.sin(ang) * len;
        cracks.push({ x1: px, y1: py, x2: nx, y2: ny, w: Math.max(1.0, (2.3 - s * 0.4) * S) });
        px = nx; py = ny;
      }
    }
    if (cracks.length > 240) cracks.splice(0, cracks.length - 240);
    flash = Math.min(1, flash + 0.16);
  }

  // A random impact point on the jar BODY, so cracks always sit on the glass — never
  // floating in the headroom above the mouth where overflow gifts settle.
  function jarCrackPoint() {
    return {
      x: IL + (IR - IL) * (0.18 + rng() * 0.64),
      y: CRACK_TOP + (CRACK_BOT - CRACK_TOP) * (0.06 + rng() * 0.72),
    };
  }

  // Accumulate crack damage; when it reaches 1 the jar shatters.
  function addDamage(d) {
    if (!cfg.jarBreaks || jarPhase !== 'live' || d <= 0) return;
    jarDamage += d;
    const p = jarCrackPoint();
    addCrack(p.x, p.y, L.crackStage(jarDamage) + 1);
    if (jarDamage >= 1) breakJar();
  }

  function setJarArtVisible(v) {
    [layerFront, layerBack, layerBottom].forEach(im => { if (im && im.style.display !== 'none') im.style.visibility = v ? '' : 'hidden'; });
  }

  function addTallyMark() {
    if (!cfg.showJarTally || !tallyEl) return;
    tallyEl.classList.remove('hidden');
    tallyEl.setAttribute('aria-hidden', 'false');
    const img = document.createElement('img');
    img.className = 'cjp-kill pop';
    img.src = 'assets/jar-kill.svg';
    img.alt = '';
    tallyEl.appendChild(img);
  }

  // Glass pieces that burst outward from the jar when it shatters.
  function spawnShards() {
    const color = cfg.jarColor || '#bfe9ff';
    const N = 18;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + (rng() - 0.5) * 0.5;
      const sp = 4 + rng() * 8;
      const sz = (9 + rng() * 20) * S;
      const pts = [];
      for (let k = 0; k < 3; k++) {
        const pa = k / 3 * Math.PI * 2 + rng();
        const pr = sz * (0.4 + rng() * 0.6);
        pts.push({ x: Math.cos(pa) * pr, y: Math.sin(pa) * pr });
      }
      shards.push({
        x: JC_X + Math.cos(a) * 24 * S, y: JC_Y + Math.sin(a) * 24 * S,
        vx: Math.cos(a) * sp + (rng() - 0.5) * 3, vy: Math.sin(a) * sp - 5 - rng() * 5,
        rot: rng() * 6.28, vrot: (rng() - 0.5) * 0.45, pts, color, life: 1,
      });
    }
  }

  // The jar shatters: flash, glass shards, turn every gift into a flyaway with a
  // precomputed explosion path, add a kill mark, then (after a beat) drop a fresh jar in.
  function breakJar() {
    if (jarPhase !== 'live') return;
    jarPhase = 'exploding';
    brokenCount++;
    addTallyMark();
    play(cfg.breakSound);
    flash = 1;
    removeWalls();
    spawnShards();
    setJarArtVisible(false);
    // Each gift becomes a lightweight "flyaway": its velocity is precomputed from where it
    // was resting (outward from the jar centre + a strong upward burst). No physics bodies —
    // it just follows a simple ballistic path off the screen.
    const toRemove = [];
    for (const bd of M.Composite.allBodies(world)) {
      const g = bd.plugin && bd.plugin.gift;
      if (!g) continue;
      const dx = bd.position.x - JC_X, dy = bd.position.y - JC_Y;
      const dist = Math.hypot(dx, dy) || 1;
      const power = (6 + rng() * 7) * Math.max(0.7, S);
      flyaways.push({
        x: bd.position.x, y: bd.position.y,
        vx: (dx / dist) * power + (rng() - 0.5) * 7 * S,
        vy: -(9 + rng() * 9) * Math.max(0.7, S) + (dy / dist) * power * 0.25,
        rot: bd.angle, vrot: (rng() - 0.5) * 0.5,
        r: g.radius, g,
      });
      toRemove.push(bd);
    }
    toRemove.forEach(bd => M.Composite.remove(world, bd));
    cracks.length = 0;
    pileDirty = true;
    clearTimeout(respawnTimer);
    respawnTimer = setTimeout(() => {
      respawnTimer = null;
      startDropIn();
    }, 1100);
  }

  // Reset damage, clear gifts, and start animating a fresh jar in from above.
  function startDropIn() {
    removeWalls();
    M.Composite.allBodies(world).forEach(b => { if (b.plugin && b.plugin.gift) M.Composite.remove(world, b); });
    pileDirty = true;
    jarDamage = 0; cracks.length = 0;
    setJarArtVisible(true);
    jarPhase = 'dropping';
    dropStart = performance.now();
  }

  function easeOutBack(t) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  // Drive the drop-in: the jar falls from above, overshoots, and sways to rest.
  function tickDropIn(now) {
    const t = Math.min(1, (now - dropStart) / DROP_MS);
    const dropY = -(CH + 40 * S) * (1 - easeOutBack(t));
    const decay = Math.pow(1 - t, 2);
    const sway = Math.sin(t * Math.PI * 6) * decay * 11 * S;
    const rot = Math.sin(t * Math.PI * 6) * decay * 3.6;
    const tf = 'translate(' + sway.toFixed(2) + 'px,' + dropY.toFixed(2) + 'px) rotate(' + rot.toFixed(2) + 'deg)';
    [layerFront, layerBack, layerBottom].forEach(im => { if (im && im.style.display !== 'none') im.style.transform = tf; });
    if (t >= 1) {
      [layerFront, layerBack, layerBottom].forEach(im => { if (im) im.style.transform = ''; });
      addWalls();
      jarPhase = 'live';
    }
  }

  function updateShards() {
    for (let i = shards.length - 1; i >= 0; i--) {
      const s = shards[i];
      s.vy += 0.4; s.x += s.vx; s.y += s.vy; s.rot += s.vrot; s.life -= 0.012;
      if (s.life <= 0 || s.y > CH + 80) shards.splice(i, 1);
    }
  }

  // Advance the exploding gifts along their precomputed ballistic path; drop when off-screen.
  function updateFlyaways() {
    for (let i = flyaways.length - 1; i >= 0; i--) {
      const f = flyaways[i];
      f.vy += 0.5; f.x += f.vx; f.y += f.vy; f.rot += f.vrot;
      if (f.y > CH + 130 || f.x < -130 || f.x > CW + 130) flyaways.splice(i, 1);
    }
  }

  // Draw cracks (while live), glass shards, and the shatter flash on the FX layer.
  function drawFx(dt) {
    fx.clearRect(0, 0, CW, CH);
    if (jarPhase === 'live' && cracks.length) {
      fx.save();
      fx.beginPath();
      fx.rect(IL - 12 * S, CRACK_TOP, (IR - IL) + 24 * S, (CRACK_BOT - CRACK_TOP) + 18 * S);
      fx.clip();                               // cracks on the jar BODY only (never over the rim)
      fx.lineCap = 'round';
      fx.lineJoin = 'round';
      // a subtle dark outline so the crack reads against the light glass...
      fx.strokeStyle = 'rgba(8,16,34,0.6)';
      for (const c of cracks) { fx.lineWidth = c.w + 1.3 * S; fx.beginPath(); fx.moveTo(c.x1, c.y1); fx.lineTo(c.x2, c.y2); fx.stroke(); }
      // ...then a bright, faintly glowing core
      fx.shadowColor = 'rgba(200,230,255,0.85)';
      fx.shadowBlur = 3 * S;
      fx.strokeStyle = 'rgba(255,255,255,0.95)';
      for (const c of cracks) { fx.lineWidth = c.w; fx.beginPath(); fx.moveTo(c.x1, c.y1); fx.lineTo(c.x2, c.y2); fx.stroke(); }
      fx.restore();
    }
    for (const s of shards) {
      fx.save();
      fx.globalAlpha = Math.max(0, Math.min(1, s.life)) * 0.85;
      fx.translate(s.x, s.y); fx.rotate(s.rot);
      fx.fillStyle = s.color; fx.strokeStyle = 'rgba(255,255,255,0.7)'; fx.lineWidth = 1;
      fx.beginPath(); fx.moveTo(s.pts[0].x, s.pts[0].y);
      for (let k = 1; k < s.pts.length; k++) fx.lineTo(s.pts[k].x, s.pts[k].y);
      fx.closePath(); fx.fill(); fx.stroke();
      fx.restore();
    }
    if (flash > 0.01) {
      const r = Math.max(CW, CH) * 0.62;
      const g = fx.createRadialGradient(JC_X, JC_Y, 0, JC_X, JC_Y, r);
      g.addColorStop(0, 'rgba(255,255,255,' + (flash * 0.8).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      fx.fillStyle = g; fx.fillRect(0, 0, CW, CH);
      flash = Math.max(0, flash - dt * 2.6);
    }
  }

  // Full reset (keyboard 'r' / configurator Reset): clears gifts, totals, leaderboard,
  // tally and damage, then drops a fresh jar in.
  function fullReset() {
    clearTimeout(respawnTimer);
    respawnTimer = null;
    clearTimeout(announceTimer);
    clearTimeout(boardTimer);
    const announce = el('announce'); if (announce) announce.classList.remove('show');
    Object.assign(state, { total: cfg.start || 0, goal: cfg.goal, cycles: 0 });
    leaders.clear(); leaderAvatars.clear();
    const bd = el('board'); if (bd) { bd.innerHTML = ''; bd.classList.add('hidden'); bd.setAttribute('aria-hidden', 'true'); }
    for (const body of M.Composite.allBodies(world)) {
      if (body.plugin && body.plugin.gift) M.Composite.remove(world, body);
    }
    brokenCount = 0; jarDamage = 0; skippedVisuals = 0;
    cracks.length = 0; shards.length = 0; flyaways.length = 0; spawnQ.length = 0;
    effects.length = 0; confetti.length = 0; flash = 0; pileDirty = true;
    if (tallyEl) { tallyEl.innerHTML = ''; tallyEl.classList.add('hidden'); tallyEl.setAttribute('aria-hidden', 'true'); }
    persist(); updateUI();
    if (cfg.jarBreaks) startDropIn();
    else {
      removeWalls();
      setJarArtVisible(true);
      jarPhase = 'live';
      addWalls();
    }
  }

  function spawnConfetti(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      confetti.push({
        x, y,
        vx: (Math.random() - 0.5) * 7,
        vy: -Math.random() * 8 - 2,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        size: 4 + Math.random() * 5,
        color: color || (Math.random() < 0.5 ? cfg.theme : cfg.accent),
        life: 1,
      });
    }
  }

  // ---- counting -----------------------------------------------------------
  function handleCoins(coins) {
    Object.assign(state, L.applyToGoal(state, coins, cfg));
    persist();
  }
  function updateUI() {
    if (cfg.showTotalCoins) {
      const t = el('totalNum'); if (t) t.textContent = L.formatNumber(state.total, cfg.compactNumbers);
      const box = el('total');
      if (box) {
        box.classList.remove('hidden', 'pop');
        box.setAttribute('aria-hidden', 'false');
        void box.offsetWidth;
        box.classList.add('pop');
      }
    }
    if (cfg.showProgress) {
      const fill = el('barFill'); if (fill) fill.style.width = L.fillPercent(state.total, state.goal) + '%';
      const p = el('progress'); if (p) p.classList.remove('hidden');
    }
  }

  // ---- HUD: leaderboard + gifter announcement ----------------------------
  const leaders = new Map();          // nickname -> total coins
  const leaderAvatars = new Map();    // nickname -> profile picture url
  let announceTimer = null;
  let boardTimer = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function bumpLeader(g, coins) {
    if (!cfg.displayLeaderboard) return;
    const name = g.nickname || g.uniqueId || 'someone';
    leaders.set(name, (leaders.get(name) || 0) + coins);
    if (g.profilePictureUrl) leaderAvatars.set(name, g.profilePictureUrl);
    const box = el('board'); if (!box) return;
    const fmt = cfg.leaderboardDisplayFormat || 'avatarNameCoins';
    const showAvatar = fmt === 'avatarNameCoins' || fmt === 'avatarCoins';
    const showName = fmt === 'avatarNameCoins' || fmt === 'nameCoins';
    const top = L.topLeaders(leaders, L.ranksCount(cfg.numberOfRanks));
    box.innerHTML = '<div class="cjp-board-title">Top Gifters</div>' + top.map((e, i) => {
      const badge = cfg.displayRankBadges
        ? '<span class="cjp-board-rank r' + (i + 1) + '">' + (i + 1) + '</span>' : '';
      const av = (showAvatar && leaderAvatars.get(e.name))
        ? '<img class="cjp-board-av" src="' + esc(leaderAvatars.get(e.name)) + '" alt="">' : '';
      const nm = '<span class="cjp-board-name">' + (showName ? esc(e.name) : '') + '</span>';
      return '<div class="cjp-board-row">' + badge + av + nm +
        '<span class="cjp-board-coins">' + L.formatNumber(e.coins, cfg.compactNumbers) + '</span></div>';
    }).join('');
    box.classList.toggle('hidden', top.length === 0);
    box.setAttribute('aria-hidden', String(top.length === 0));
    clearTimeout(boardTimer);
    boardTimer = setTimeout(() => {
      box.classList.add('hidden');
      box.setAttribute('aria-hidden', 'true');
    }, cfg.leaderboardDuration * 1000);
  }

  function showAnnounce(g) {
    if (!cfg.displayAlert) return;
    const a = el('announce'); if (!a) return;
    a.innerHTML = '<b>' + esc(g.nickname) + '</b> sent ' + esc(g.giftName) +
      (g.repeatCount > 1 ? ' &times;' + g.repeatCount : '');
    a.classList.add('show');
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => a.classList.remove('show'), cfg.alertDuration * 1000);
  }

  // ---- rendering: the jar is the user's layered PNGs (HTML); the canvas draws gifts ----

  // Pre-rendered emoji sprites — fillText is slow; blitting a cached bitmap is fast.
  const spriteCache = new Map();
  const emojiShapeCache = new Map();
  function emojiSprite(emoji, size) {
    size = Math.max(8, Math.round(size / 4) * 4);   // bucket sizes to limit cache entries
    const key = emoji + ':' + size;
    let cv = spriteCache.get(key);
    if (!cv) {
      cv = document.createElement('canvas');
      cv.width = cv.height = size;
      const c = cv.getContext('2d');
      c.font = Math.round(size * 0.92) + 'px serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(emoji, size / 2, size / 2 + 1);
      spriteCache.set(key, cv);
    }
    return cv;
  }

  function emojiShape(emoji) {
    if (emojiShapeCache.has(emoji)) return emojiShapeCache.get(emoji);
    const sprite = emojiSprite(emoji, 96);
    let shape = null;
    try {
      shape = L.silhouetteHull(sprite.getContext('2d').getImageData(0, 0, 96, 96), 96, 96);
    } catch (err) {
      debugLog('Emoji alpha unavailable: ' + String(err && err.message ? err.message : err));
    }
    emojiShapeCache.set(emoji, shape);
    return shape;
  }

  // Draw a gift as the actual TikTok gift icon (no sphere/medal). Falls back to an
  // emoji only when there is no image (e.g. offline demo). Merged gifts just grow bigger.
  function drawGiftAt(c, x, y, r, angle, g) {
    const d = r * 2;
    const centroid = g.hitboxShape && g.hitboxShape.centroid;
    const offsetX = centroid ? -centroid.x * r : 0;
    const offsetY = centroid ? -centroid.y * r : 0;
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    if (g.img && g.img.ok) {
      c.drawImage(g.img.img, -r + offsetX, -r + offsetY, d, d);
    } else if (g.emoji) {
      c.drawImage(emojiSprite(g.emoji, d), -r + offsetX, -r + offsetY, d, d);
    } else {
      c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2);
      c.fillStyle = g.color || '#ffcf5a'; c.fill();
      c.fillStyle = 'rgba(0,0,0,0.55)';
      c.font = '800 ' + (r * 0.8) + 'px ' + FONT_FAMILY;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(g.giftName).slice(0, 2).toUpperCase(), 0, 1);
    }
    c.restore();
  }
  function drawGift(bd, c) {
    const gift = bd.plugin.gift;
    drawGiftAt(c || ctx, bd.position.x, bd.position.y, gift.radius, bd.angle, gift);
  }

  function drawEffects(dt) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      e.life -= dt * 1.6;
      if (e.life <= 0) { effects.splice(i, 1); continue; }
      if (e.type === 'ring') {
        const r = e.r + (e.max - e.r) * (1 - e.life);
        ctx.save();
        ctx.globalAlpha = e.life;
        ctx.lineWidth = 3;
        ctx.strokeStyle = cfg.accent;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else if (e.type === 'text') {
        e.y += e.vy;
        ctx.save();
        ctx.globalAlpha = Math.max(0, e.life);
        ctx.fillStyle = e.color || '#fff';
        ctx.font = '800 18px ' + FONT_FAMILY;
        ctx.textAlign = 'center';
        ctx.fillText(e.text, e.x, e.y);
        ctx.restore();
      }
    }
  }

  function drawConfetti() {
    for (let i = confetti.length - 1; i >= 0; i--) {
      const p = confetti[i];
      p.vy += 0.35;
      p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 0.012;
      if (p.life <= 0 || p.y > CH + 40) { confetti.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
  }

  // Once a gift has rested briefly, make it static so Matter stops simulating it.
  // In normal use gifts arrive gradually, so only the few in-flight ones are ever active.
  function accountOverflowIfFinal(bd, g) {
    const imageResolved = !g.img || g.img.shapeState !== 'loading';
    if (jarPhase !== 'live' || !cfg.jarBreaks || !imageResolved ||
        g.pending || g.overflowCounted || bd.position.y >= ITOP) return;
    g.overflowCounted = true;
    addDamage(L.crackIncrement(0, true, cfg));
  }

  function freezeIfSettled(bd, g) {
    if (jarPhase !== 'live' || bd.isStatic) return;
    if (performance.now() - g.born < 1400) return;   // let it fall & actually settle first
    if (bd.speed < 0.15 && bd.angularSpeed < 0.05) {
      if ((g.rest = (g.rest || 0) + 1) > 18) {
        M.Body.setStatic(bd, true); pileDirty = true;
        // Only final collision geometry can decide whether this gift truly overflows.
        accountOverflowIfFinal(bd, g);
      }
    } else {
      g.rest = 0;
    }
  }

  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    if (jarPhase === 'dropping') tickDropIn(now);

    M.Engine.update(engine, 1000 / 60);
    processMerges();
    processSpawnQ(now);

    const bodies = M.Composite.allBodies(world);
    for (const bd of bodies) {
      const g = bd.plugin && bd.plugin.gift;
      if (g) freezeIfSettled(bd, g);
    }
    // perf safety: a runaway pile that somehow never overflowed still gets broken
    if (cfg.jarBreaks && jarPhase === 'live' && giftBodyCount() > Math.max(320, cfg.maxBodies * 2)) breakJar();
    if (pileDirty) { rebuildPile(); pileDirty = false; }

    ctx.clearRect(0, 0, CW, CH);
    ctx.drawImage(pileCanvas, 0, 0, CW, CH);     // the settled pile — drawn once, cached
    for (const bd of bodies) {                   // only the in-flight gifts are redrawn
      const g = bd.plugin && bd.plugin.gift;
      if (!g || bd.isStatic) continue;
      drawGift(bd, ctx);
    }
    updateFlyaways();                            // exploding gifts on their precomputed paths
    for (const f of flyaways) drawGiftAt(ctx, f.x, f.y, f.r, f.rot, f.g);
    drawEffects(dt);
    drawConfetti();
    updateShards();
    drawFx(dt);

    if (cfg.debug) updateDebug(bodies.length + flyaways.length);
    requestAnimationFrame(frame);
  }

  // ---- gift pipeline ------------------------------------------------------
  function onGift(raw) {
    const g = L.normalizeGift(raw);
    if (!g) return;
    debugLog('gift ' + g.giftName + ' x' + g.repeatCount + (g.repeatEnd ? ' (end)' : ' (streak)'));
    if (!L.shouldFinalizeGift(g)) return;   // ignore streak-in-progress (avoid double count)
    if (!L.passesFilter(g, cfg)) return;
    if (cfg.onGoal === 'stop' && state.total >= state.goal) return;   // stopped at goal: no more counting/spawning
    const coins = L.coinsForGift(g, cfg);
    handleCoins(coins);
    bumpLeader(g, coins);
    showAnnounce(g);
    updateUI();
    play(cfg.coinSound);
    spawnGift(g);
  }

  // ---- websocket ----------------------------------------------------------
  let ws = null, wsState = 'init', reconnectTimer = null, shuttingDown = false;
  let demoTimer = null;
  function setStatus(s, cls) {
    wsState = s;
    const dot = el('statusDot'), txt = el('statusText');
    if (dot) dot.className = 'dot ' + (cls || '');
    if (txt) txt.textContent = s;
  }
  function connect() {
    if (cfg.demo || shuttingDown) return;
    clearTimeout(reconnectTimer);
    const url = 'ws://127.0.0.1:' + cfg.port + '/';
    setStatus('connecting ' + url, 'warn');
    let socket;
    try { socket = new WebSocket(url); } catch (e) { scheduleReconnect(); return; }
    ws = socket;

    socket.onopen = () => { if (ws === socket) setStatus('connected ' + url, 'ok'); };
    socket.onclose = () => {
      if (ws !== socket) return;
      ws = null;
      setStatus('disconnected — retrying', 'bad');
      scheduleReconnect();
    };
    socket.onerror = () => {
      if (ws !== socket) return;
      const publicHosted = location.protocol === 'https:' &&
        !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
      setStatus(publicHosted
        ? 'local connection blocked or unavailable — use a local OBS URL'
        : 'error connecting (is Tikfinity running?)', 'bad');
      try { socket.close(); } catch (_) {}
      scheduleReconnect();
    };
    socket.onmessage = (ev) => {
      if (ws !== socket) return;
      let msg;
      try { msg = JSON.parse(ev.data); } catch (_) { return; }
      const type = L.getEventType(msg);
      if (type === 'gift') onGift(msg);
      else debugLog('· ' + (type || 'unknown'));
    };
  }
  function scheduleReconnect() {
    if (cfg.demo || shuttingDown) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, cfg.reconnect);
  }

  // ---- demo ---------------------------------------------------------------
  const DEMO_GIFTS = [
    { giftId: 'orange', giftName: 'Orange', diamondCount: 5, giftType: 1 },
    { giftId: 'rose', giftName: 'Rose', diamondCount: 1, giftType: 1 },
    { giftId: 'gg', giftName: 'GG', diamondCount: 1, giftType: 1 },
    { giftId: 'donut', giftName: 'Doughnut', diamondCount: 30, giftType: 1 },
    { giftId: 'heart', giftName: 'Finger Heart', diamondCount: 5, giftType: 1 },
    { giftId: 'star', giftName: 'Star', diamondCount: 99, giftType: 2 },
  ];
  function demoTick() {
    const base = DEMO_GIFTS[Math.floor(Math.random() * DEMO_GIFTS.length)];
    const streak = Math.random() < 0.6 ? (2 + Math.floor(Math.random() * 6)) : 1;
    onGift({ event: 'gift', data: Object.assign({}, base, { repeatCount: streak, repeatEnd: true, uniqueId: 'demo_user' }) });
  }

  // ---- debug --------------------------------------------------------------
  const logLines = [];
  function debugLog(line) {
    if (!cfg.debug) return;
    logLines.push(line);
    if (logLines.length > 8) logLines.shift();
    const lg = el('debugLog'); if (lg) lg.textContent = logLines.join('\n');
  }
  function updateDebug(bodyCount) {
    const s = el('debugStats');
    if (s) s.textContent = 'coins ' + Math.round(state.total) + '/' + state.goal +
      ' · bodies ' + bodyCount + ' · queued ' + spawnQ.length +
      (skippedVisuals ? ' · visual drops ' + skippedVisuals : '') +
      ' · combine ' + (combine ? 'ON' : 'off') + ' · port ' + cfg.port;
  }

  // ---- keyboard (handy while testing) ------------------------------------
  window.addEventListener('keydown', (e) => {
    if (e.key === 'd') { cfg.debug = !cfg.debug; el('debug').classList.toggle('hidden', !cfg.debug); }
    else if (e.key === 'c') { combine = !combine; }
    else if (e.key === 'g') { demoTick(); }
    else if (e.key === 'r') { fullReset(); }
    else if (e.key === 'b') { breakJar(); }
  });

  // ---- messages from the gallery / configurator (live preview control) ----
  window.addEventListener('message', (e) => {
    const sameWindow = e.source === window.parent || (window.opener && e.source === window.opener);
    const sameOrigin = location.protocol === 'file:' ? e.origin === 'null' : e.origin === location.origin;
    if (!sameWindow || !sameOrigin) return;
    const d = e.data || {};
    if (d.cjp === 'test') demoTick();
    else if (d.cjp === 'reset') { fullReset(); }
    else if (d.cjp === 'combine') combine = !!d.value;
    else if (d.cjp === 'gift' && d.data) onGift({ event: 'gift', data: d.data });
  });

  // ---- boot ---------------------------------------------------------------
  if (cfg.debug) el('debug').classList.remove('hidden');
  updateUI();
  if (cfg.jarBreaks) { jarPhase = 'dropping'; dropStart = performance.now(); }
  else { jarPhase = 'live'; }
  requestAnimationFrame(frame);
  if (cfg.demo) {
    setStatus('demo mode (not using WebSocket)', 'warn');
    demoTimer = setInterval(demoTick, 1500);
    setTimeout(demoTick, 400);
  } else {
    connect();
  }

  window.addEventListener('pagehide', () => {
    shuttingDown = true;
    clearTimeout(reconnectTimer);
    clearTimeout(respawnTimer);
    clearTimeout(announceTimer);
    clearTimeout(boardTimer);
    if (demoTimer) clearInterval(demoTimer);
    if (ws) {
      const socket = ws;
      ws = null;
      try { socket.close(); } catch (_) {}
    }
  }, { once: true });

  // expose for quick console testing
  window.CoinJar = {
    cfg, state, onGift, spawnConfetti, demoTick, breakJar,
    get combine() { return combine; },
    set combine(v) { combine = v; },
    get brokenCount() { return brokenCount; },
    get jarPhase() { return jarPhase; },
    get connectionStatus() { return wsState; },
    get queuedGifts() { return spawnQ.length; },
    get skippedVisuals() { return skippedVisuals; },
    reset: fullReset,
    getBodies() {
      return M.Composite.allBodies(world)
        .filter(b => b.plugin && b.plugin.gift)
        .map(b => {
          const gift = b.plugin.gift;
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const vertex of b.vertices) {
            minX = Math.min(minX, vertex.x);
            minY = Math.min(minY, vertex.y);
            maxX = Math.max(maxX, vertex.x);
            maxY = Math.max(maxY, vertex.y);
          }
          return {
            giftId: gift.giftId,
            count: gift.count,
            frozen: b.isStatic,
            hitbox: gift.hitbox,
            imageState: gift.img ? gift.img.shapeState : null,
            radius: gift.radius,
            vertices: b.vertices.length,
            width: maxX - minX,
            height: maxY - minY,
            x: b.position.x,
            y: b.position.y,
          };
        });
    },
  };
})();
