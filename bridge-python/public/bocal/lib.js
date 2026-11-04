/*
 * Coin Jar Pro (clone) — pure, DOM-free logic.
 * Loaded both in the browser (attaches window.CoinJarLib) and in Node tests
 * (module.exports). Keep this file free of any DOM / Matter.js references so it
 * stays unit-testable.
 */
(function (root, factory) {
  const shared = (typeof module !== 'undefined' && module.exports)
    ? require('./config.js')
    : root.CoinJarConfig;
  if (!shared || !shared.DEFAULTS) throw new Error('CoinJarConfig must load before CoinJarLib');
  const lib = factory(shared.DEFAULTS);
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
  else root.CoinJarLib = lib;
})(typeof self !== 'undefined' ? self : this, function (DEFAULTS) {
  'use strict';

  const BOOL_KEYS = ['persist', 'compactNumbers', 'combine', 'demo', 'debug',
    'stream', 'sizeByValue', 'bigGiftSplash', 'jarBreaks', 'showJarTally',
    'displayAlert', 'displayLeaderboard', 'displayRankBadges', 'showTotalCoins', 'showProgress'];
  const NUM_KEYS = ['port', 'reconnect', 'goal', 'start', 'minimumValue', 'goalIncrement',
    'width', 'scale', 'giftScale', 'volume', 'combineGrowth', 'baseRadius', 'combineMaxScale', 'gravity',
    'restitution', 'maxBodies', 'spawnCap', 'crackBigGiftCoins', 'bigGiftCrack', 'overflowCrack',
    'jarInsetX', 'jarInsetTop', 'jarInsetBottom',
    'streamStagger', 'spreadDeg', 'launchSpeed', 'sizeMaxScale', 'bigGiftCoins',
    'fontSize', 'fontLineSpacing', 'fontLetterSpacing', 'xOffset', 'yOffset',
    'alertDuration', 'leaderboardDuration'];

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function parseBool(v, dflt) {
    if (v === undefined || v === null || v === '') return dflt;
    const s = String(v).toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(s)) return true;
    if (['0', 'false', 'no', 'off'].includes(s)) return false;
    return dflt;
  }

  function num(v, dflt) {
    if (v === undefined || v === null || v === '') return dflt;
    const n = Number(v);
    return Number.isFinite(n) ? n : dflt;
  }

  /**
   * Parse config from a URLSearchParams-like object (anything with .get()).
   * Unknown keys are ignored; missing keys fall back to DEFAULTS.
   */
  function parseConfig(params) {
    const get = (k) => (params && typeof params.get === 'function') ? params.get(k) : undefined;
    const cfg = Object.assign({}, DEFAULTS);
    for (const key of Object.keys(DEFAULTS)) {
      const raw = get(key);
      if (raw === undefined || raw === null) continue;
      if (BOOL_KEYS.includes(key)) cfg[key] = parseBool(raw, DEFAULTS[key]);
      else if (NUM_KEYS.includes(key)) cfg[key] = num(raw, DEFAULTS[key]);
      else if (raw !== '') cfg[key] = raw;
    }
    // URL parameters are untrusted input. Keep every geometry/timing value in
    // the same usable range exposed by the configurator.
    cfg.port = clamp(Math.round(cfg.port), 1, 65535);
    cfg.reconnect = clamp(Math.round(cfg.reconnect), 250, 60000);
    cfg.goal = cfg.goal > 0 ? clamp(cfg.goal, 1, 1e12) : DEFAULTS.goal;
    cfg.start = clamp(cfg.start, 0, 1e12);
    cfg.goalIncrement = clamp(cfg.goalIncrement, 0, 1e12);
    cfg.volume = clamp(cfg.volume, 0, 1);
    cfg.width = clamp(Math.round(cfg.width), 220, 640);
    cfg.combineMaxScale = clamp(cfg.combineMaxScale, 1.5, 10);
    cfg.combineGrowth = clamp(cfg.combineGrowth, 0.1, 1);
    cfg.baseRadius = clamp(cfg.baseRadius, 8, 30);
    cfg.gravity = clamp(cfg.gravity, 0.2, 2);
    cfg.restitution = clamp(cfg.restitution, 0, 1);
    cfg.spawnCap = clamp(Math.round(cfg.spawnCap), 1, 50);
    cfg.maxBodies = clamp(Math.round(cfg.maxBodies), 30, 320);
    cfg.spreadDeg = clamp(cfg.spreadDeg, 0, 120);
    cfg.streamStagger = clamp(cfg.streamStagger, 0, 600);
    cfg.launchSpeed = clamp(cfg.launchSpeed, 0, 24);
    cfg.sizeMaxScale = clamp(cfg.sizeMaxScale, 1, 6);
    cfg.bigGiftCoins = clamp(Math.round(cfg.bigGiftCoins), 1, 1e9);
    cfg.scale = clamp(cfg.scale, 0.1, 2);
    cfg.giftScale = clamp(cfg.giftScale, 0.1, 2);
    cfg.fontSize = clamp(Math.round(cfg.fontSize), 5, 100);
    cfg.fontLineSpacing = clamp(Math.round(cfg.fontLineSpacing), 5, 100);
    cfg.fontLetterSpacing = clamp(Math.round(cfg.fontLetterSpacing), 5, 100);
    cfg.xOffset = clamp(Math.round(cfg.xOffset), -1000, 1000);
    cfg.yOffset = clamp(Math.round(cfg.yOffset), -1000, 1000);
    cfg.alertDuration = clamp(Math.round(cfg.alertDuration), 2, 10);
    cfg.leaderboardDuration = clamp(Math.round(cfg.leaderboardDuration), 2, 10);
    cfg.minimumValue = clamp(Math.round(cfg.minimumValue), 0, 1e9);
    cfg.crackBigGiftCoins = clamp(Math.round(cfg.crackBigGiftCoins), 1, 1e9);
    cfg.bigGiftCrack = clamp(cfg.bigGiftCrack, 0, 1);
    cfg.overflowCrack = clamp(cfg.overflowCrack, 0, 1);
    cfg.jarInsetX = clamp(cfg.jarInsetX, 0, 0.45);
    cfg.jarInsetTop = clamp(cfg.jarInsetTop, 0, 0.6);
    cfg.jarInsetBottom = clamp(cfg.jarInsetBottom, 0, 0.45);
    if (!['coins', 'gifts'].includes(cfg.countMode)) cfg.countMode = DEFAULTS.countMode;
    if (!['allGifts', 'selectedGifts'].includes(cfg.giftType)) cfg.giftType = DEFAULTS.giftType;
    if (!['celebrate', 'reset', 'loop', 'stop'].includes(cfg.onGoal)) cfg.onGoal = DEFAULTS.onGoal;
    if (!['top3', 'top5', 'top10'].includes(cfg.numberOfRanks)) cfg.numberOfRanks = DEFAULTS.numberOfRanks;
    if (!['avatarNameCoins', 'nameCoins', 'avatarCoins', 'coins'].includes(cfg.leaderboardDisplayFormat)) {
      cfg.leaderboardDisplayFormat = DEFAULTS.leaderboardDisplayFormat;
    }
    return cfg;
  }

  // ---------------------------------------------------------------------------
  // Event normalization — defensive across Tikfinity / TikTok-Live-Connector
  // wrapper and field-name variants. Returns a flat, predictable shape.
  // ---------------------------------------------------------------------------

  function getEventType(msg) {
    if (!msg || typeof msg !== 'object') return '';
    const t = msg.event || msg.type || (msg.data && (msg.data.event || msg.data.type)) || msg.eventType || '';
    return String(t).toLowerCase();
  }

  // first defined / non-empty value among candidates
  function pick() {
    for (let i = 0; i < arguments.length; i++) {
      const v = arguments[i];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return undefined;
  }

  function normalizeGift(msg) {
    if (!msg || typeof msg !== 'object') return null;
    // payload may be at .data or be the message itself
    const d = (msg.data && typeof msg.data === 'object') ? msg.data : msg;
    const details = d.giftDetails || d.gift || {};
    const ext = d.extendedGiftInfo || {};
    const user = d.user || {};

    const giftId = pick(d.giftId, details.giftId, d.gift_id, ext.id);
    const giftName = pick(d.giftName, details.giftName, d.gift_name, ext.name, 'Gift');
    const giftType = Math.max(0, Math.round(num(pick(d.giftType, details.giftType, ext.type), 0)));
    const diamondCount = Math.max(0, num(pick(d.diamondCount, details.diamondCount, d.diamond_count,
      ext.diamond_count, d.coins), 0));
    const repeatCount = Math.max(1, Math.floor(num(pick(d.repeatCount, d.repeat_count, d.comboCount), 1)));
    const repeatEnd = parseBool(pick(d.repeatEnd, d.repeat_end), false);
    const pictureUrl = pick(
      d.giftPictureUrl, d.giftImageUrl,
      details.giftPictureUrl,
      details.giftImage && (details.giftImage.giftPictureUrl || details.giftImage.url),
      ext.image && (ext.image.url_list && ext.image.url_list[0]),
      d.giftImage && (d.giftImage.url || (d.giftImage.url_list && d.giftImage.url_list[0]))
    );
    const uniqueId = pick(d.uniqueId, user.uniqueId, d.userId, user.userId, 'someone');
    const nickname = pick(d.nickname, user.nickname, uniqueId);
    const userId = String(pick(d.userId, user.userId, uniqueId, ''));
    const profilePictureUrl = pick(d.profilePictureUrl, user.profilePictureUrl,
      user.profilePicture && (user.profilePicture.url || (user.profilePicture.urls && user.profilePicture.urls[0])));
    const groupId = String(pick(d.groupId, d.group_id, userId + ':' + giftId));

    return {
      type: 'gift',
      giftId: giftId !== undefined ? String(giftId) : ('name:' + giftName),
      giftName: String(giftName),
      giftType, diamondCount, repeatCount, repeatEnd,
      pictureUrl, uniqueId, nickname, userId, profilePictureUrl, groupId,
    };
  }

  /**
   * A streakable gift (giftType===1) fires repeatedly during the streak with
   * repeatEnd:false, then once more with repeatEnd:true. Only the final event
   * should be counted, to avoid double counting. Non-streak gifts are always
   * final. (Authoritative: TikTok-Live-Connector docs.)
   */
  function shouldFinalizeGift(g) {
    if (!g) return false;
    return !(g.giftType === 1 && g.repeatEnd === false);
  }

  function inCsv(csv, giftId, giftName) {
    if (!csv) return false;
    const items = String(csv).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (!items.length) return false;
    const id = String(giftId).toLowerCase();
    const name = String(giftName).toLowerCase();
    return items.includes(id) || items.includes(name);
  }

  function passesFilter(g, cfg) {
    if (!g) return false;
    if (cfg.minimumValue > 0 && (g.diamondCount || 0) < cfg.minimumValue) return false;
    if (cfg.excludeGifts && inCsv(cfg.excludeGifts, g.giftId, g.giftName)) return false;
    if (cfg.giftType === 'selectedGifts' && !inCsv(cfg.gift, g.giftId, g.giftName)) return false;
    return true;
  }

  /** Coins (toward the goal) contributed by a finalized gift event. */
  function coinsForGift(g, cfg) {
    const count = Math.max(1, Math.floor(num(g.repeatCount, 1)));
    if (cfg && cfg.countMode === 'gifts') return count;
    return Math.max(0, num(g.diamondCount, 0)) * count;
  }

  /**
   * Apply a finalized, filtered gift to the running goal state.
   * state = { total, goal, cycles }. Returns a NEW state plus metadata.
   * Handles celebrate | stop | reset | loop, including gifts that overshoot
   * the goal multiple times in one send (e.g. a 1000-coin Rocket into a 100 goal).
   */
  function applyToGoal(state, coins, cfg) {
    coins = Math.max(0, num(coins, 0));
    const goal0 = Math.max(0, num(state.goal, 0));
    let total = Math.max(0, num(state.total, 0)) + coins;
    let goal = goal0;
    let cycles = Math.max(0, Math.floor(num(state.cycles, 0)));
    if (goal0 <= 0) return { total, goal, cycles, goalReached: false };

    // Only celebrate on the FIRST crossing of the threshold (not every later gift).
    const crossed = state.total < goal0 && total >= goal0;

    // STOP: once reached, freeze exactly at the goal and ignore further coins.
    if (cfg.onGoal === 'stop') {
      if (state.total >= goal0) return { total: state.total, goal, cycles, goalReached: false };
      if (total >= goal) return { total: goal, goal, cycles, goalReached: true };
      return { total, goal, cycles, goalReached: false };
    }

    // RESET: carry the remainder, same goal. O(1), exact even for huge gifts.
    if (cfg.onGoal === 'reset') {
      if (total >= goal) { cycles += Math.floor(total / goal); total = total % goal; }
      return { total, goal, cycles, goalReached: crossed };
    }

    // LOOP: raise the goal each cycle. Terminates because step > 0 (goal grows).
    if (cfg.onGoal === 'loop') {
      const step = (cfg.goalIncrement > 0) ? cfg.goalIncrement : goal0;
      while (total >= goal) { total -= goal; cycles += 1; goal += step; }
      return { total, goal, cycles, goalReached: crossed };
    }

    // CELEBRATE (default): keep counting; fire only on the first crossing.
    return { total, goal, cycles, goalReached: crossed };
  }

  function fillPercent(total, goal) {
    if (goal <= 0) return 0;
    return clamp((total / goal) * 100, 0, 100);
  }

  // ---------------------------------------------------------------------------
  // Combine merge math — same gift merges regardless of size; size tracks total count.
  // ---------------------------------------------------------------------------

  /** How much bigger a combined gift is, based on how many base gifts it represents. */
  function combineScale(count, cfg) {
    const growth = (cfg && cfg.combineGrowth > 0) ? cfg.combineGrowth : 0.5;
    const maxS = (cfg && cfg.combineMaxScale > 0) ? cfg.combineMaxScale : 4.5;
    return clamp(Math.pow(Math.max(1, count), growth), 1, maxS);
  }

  /** Two gifts combine iff they are the SAME gift (their sizes/counts need not match). */
  function canMerge(a, b) {
    return !!(a && b && a.giftId === b.giftId);
  }

  /** Collision outcome: 'merge' (same gift) or 'none'. Shared with the overlay. */
  function mergeAction(a, b) {
    return canMerge(a, b) ? 'merge' : 'none';
  }

  /** Combine two same-gift bodies: counts (and values) add up. */
  function mergeResult(a, b) {
    return {
      giftId: a.giftId,
      giftName: a.giftName,
      count: (a.count || 1) + (b.count || 1),
      value: (a.value || 0) + (b.value || 0),
    };
  }

  // ---------------------------------------------------------------------------
  // Jar breaking — the jar cracks from big gifts and overflow, then shatters.
  // ---------------------------------------------------------------------------

  /**
   * Crack damage (0..1) added when a gift lands. A "big" gift (value >= crackBigGiftCoins)
   * cracks the jar — scaling with value so a 5×+ gift shatters it outright — and every gift
   * that settles while the jar is overflowing adds a little more.
   */
  function crackIncrement(value, isOverflow, cfg) {
    let d = 0;
    const big = (cfg && cfg.crackBigGiftCoins > 0) ? cfg.crackBigGiftCoins : 100;
    const bigDmg = (cfg && cfg.bigGiftCrack != null) ? cfg.bigGiftCrack : 0.22;
    const ovDmg = (cfg && cfg.overflowCrack != null) ? cfg.overflowCrack : 0.05;
    if (value >= big) d += bigDmg * clamp(value / big, 1, 5);
    if (isOverflow) d += ovDmg;
    return d;
  }

  /** Visual crack stage from accumulated damage: 0 none, 1..3 cracking, 4 = broken. */
  function crackStage(damage) {
    if (damage <= 0) return 0;
    if (damage >= 1) return 4;
    if (damage < 0.34) return 1;
    if (damage < 0.67) return 2;
    return 3;
  }

  // ---------------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------------
  function formatNumber(n, compact) {
    n = Math.round(n);
    if (compact) {
      if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1) + 'M';
      if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(n % 1e3 === 0 ? 0 : 1) + 'K';
      return String(n);
    }
    return n.toLocaleString('en-US');
  }

  // ---------------------------------------------------------------------------
  // Stream / size / leaderboard helpers (pure)
  // ---------------------------------------------------------------------------

  /** Size multiplier for a gift based on its diamond value (worth more = bigger). */
  function sizeScale(value, cfg) {
    const max = (cfg && cfg.sizeMaxScale > 0) ? cfg.sizeMaxScale : 2.6;
    const v = Math.max(1, num(value, 1));
    return clamp(1 + 0.5 * Math.log10(v), 1, max);
  }

  /**
   * A launch velocity within a cone of `spreadDeg` around straight-DOWN (+y).
   * `rnd` (0..1) is optional for deterministic tests; defaults to Math.random().
   */
  function launchVelocity(spreadDeg, speed, rnd) {
    const r = (typeof rnd === 'number') ? rnd : Math.random();
    const half = (clamp(num(spreadDeg, 0), 0, 170) * Math.PI / 180) / 2;
    const theta = (r * 2 - 1) * half;             // -half..+half from vertical
    return { vx: Math.sin(theta) * speed, vy: Math.cos(theta) * speed, theta };
  }

  /** Top-N gifters from a Map or object of name->coins, sorted by coins desc. */
  function topLeaders(map, n) {
    const entries = (map instanceof Map) ? Array.from(map.entries())
      : Object.keys(map || {}).map(k => [k, map[k]]);
    entries.sort((a, b) => (b[1] - a[1]) || String(a[0]).localeCompare(String(b[0])));
    return entries.slice(0, Math.max(0, n | 0)).map(([name, coins]) => ({ name, coins }));
  }

  /** Parse a "topN" selection (e.g. 'top5') into a rank count. */
  function ranksCount(v) {
    const m = String(v == null ? '' : v).match(/\d+/);
    return m ? clamp(parseInt(m[0], 10), 1, 50) : 5;
  }

  // ---------------------------------------------------------------------------
  // Image silhouettes — compact convex collision hulls from an RGBA alpha mask.
  // ---------------------------------------------------------------------------

  function polygonCentroid(vertices) {
    let twiceArea = 0, x = 0, y = 0;
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i], b = vertices[(i + 1) % vertices.length];
      const cross = a.x * b.y - b.x * a.y;
      twiceArea += cross;
      x += (a.x + b.x) * cross;
      y += (a.y + b.y) * cross;
    }
    if (Math.abs(twiceArea) < 1e-9) {
      return vertices.reduce((sum, point) => ({
        x: sum.x + point.x / vertices.length,
        y: sum.y + point.y / vertices.length,
      }), { x: 0, y: 0 });
    }
    return { x: x / (3 * twiceArea), y: y / (3 * twiceArea) };
  }

  function convexHull(points) {
    const sorted = points.slice().sort((a, b) => (a.x - b.x) || (a.y - b.y));
    const unique = sorted.filter((point, index) =>
      index === 0 || point.x !== sorted[index - 1].x || point.y !== sorted[index - 1].y);
    if (unique.length < 3) return [];
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [];
    for (const point of unique) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
        lower.pop();
      }
      lower.push(point);
    }
    const upper = [];
    for (let i = unique.length - 1; i >= 0; i--) {
      const point = unique[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
        upper.pop();
      }
      upper.push(point);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  function simplifyConvex(vertices, maxVertices) {
    const result = vertices.slice();
    while (result.length > maxVertices) {
      let removeAt = 0, smallest = Infinity;
      for (let i = 0; i < result.length; i++) {
        const prev = result[(i + result.length - 1) % result.length];
        const cur = result[i];
        const next = result[(i + 1) % result.length];
        const area = Math.abs(
          (cur.x - prev.x) * (next.y - prev.y) -
          (cur.y - prev.y) * (next.x - prev.x)
        );
        if (area < smallest) { smallest = area; removeAt = i; }
      }
      result.splice(removeAt, 1);
    }
    return result;
  }

  /**
   * Returns a normalized convex hull for pixels whose alpha meets `threshold`.
   * Vertices are centered on the polygon's centroid and fit the image's -1..1
   * draw coordinates. `centroid` is retained so rendering can offset an
   * asymmetrical image around the body's centre of mass.
   */
  function silhouetteHull(rgba, width, height, threshold, maxVertices) {
    const data = rgba && rgba.data ? rgba.data : rgba;
    width = Math.floor(num(width, 0));
    height = Math.floor(num(height, 0));
    if (!data || width < 2 || height < 2 || data.length < width * height * 4) return null;
    threshold = clamp(Math.round(num(threshold, 24)), 1, 255);
    maxVertices = clamp(Math.round(num(maxVertices, 16)), 4, 32);
    const opaque = (x, y) => data[(y * width + x) * 4 + 3] >= threshold;
    const points = [];

    for (let y = 0; y < height; y++) {
      let left = -1, right = -1;
      for (let x = 0; x < width; x++) {
        if (!opaque(x, y)) continue;
        if (left < 0) left = x;
        right = x;
      }
      if (left >= 0) {
        points.push({ x: left, y: y + 0.5 });
        points.push({ x: right + 1, y: y + 0.5 });
      }
    }
    for (let x = 0; x < width; x++) {
      let top = -1, bottom = -1;
      for (let y = 0; y < height; y++) {
        if (!opaque(x, y)) continue;
        if (top < 0) top = y;
        bottom = y;
      }
      if (top >= 0) {
        points.push({ x: x + 0.5, y: top });
        points.push({ x: x + 0.5, y: bottom + 1 });
      }
    }

    let hull = convexHull(points);
    if (hull.length < 3) return null;
    hull = simplifyConvex(hull, maxVertices).map(point => ({
      x: (point.x / width - 0.5) * 2,
      y: (point.y / height - 0.5) * 2,
    }));
    const centroid = polygonCentroid(hull);
    const vertices = hull.map(point => ({
      x: (point.x - centroid.x) * 1.03,
      y: (point.y - centroid.y) * 1.03,
    }));
    return { vertices, centroid };
  }

  return {
    DEFAULTS,
    clamp, parseBool, num, parseConfig,
    getEventType, normalizeGift, shouldFinalizeGift,
    passesFilter, coinsForGift, applyToGoal, fillPercent,
    combineScale, canMerge, mergeResult, mergeAction,
    crackIncrement, crackStage,
    formatNumber, inCsv,
    sizeScale, launchVelocity, topLeaders, ranksCount,
    silhouetteHull,
  };
});
