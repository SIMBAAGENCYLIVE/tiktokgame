/*
 * Shared Coin Jar configuration defaults.
 *
 * Both the overlay runtime and the gallery registry consume this file so a
 * configurator default cannot silently drift away from runtime behavior.
 */
(function (root, factory) {
  const config = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = config;
  else root.CoinJarConfig = config;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = Object.freeze({
    // Connection
    port: 21213,
    reconnect: 2000,

    // Counting and filtering
    goal: 1000,
    start: 0,
    countMode: 'coins',
    giftType: 'allGifts',
    gift: '',
    minimumValue: 0,
    excludeGifts: '',
    onGoal: 'celebrate',
    goalIncrement: 0,
    persist: true,
    persistKey: 'default',

    // Appearance
    title: 'Coin Goal',
    theme: '#ff2d55',
    accent: '#ffd54a',
    jarColor: '#bfe9ff',
    jarFrontImage: 'assets/jar-top.png',
    jarBackImage: 'assets/jar-top-bg-2.png',
    jarBottomImage: 'assets/jar-bottom.png',
    jarInsetX: 0.24,
    jarInsetTop: 0.13,
    jarInsetBottom: 0.14,
    bg: 'transparent',
    font: "'Inter', 'Segoe UI', system-ui, sans-serif",
    fontType: 'Exo 2',
    fontSize: 50,
    fontLineSpacing: 50,
    fontLetterSpacing: 50,
    xOffset: 0,
    yOffset: 0,
    width: 360,
    scale: 1,
    giftScale: 1,
    compactNumbers: false,

    // Sounds
    coinSound: '',
    mergeSound: '',
    volume: 0.7,

    // Combining and physics
    combine: false,
    combineGrowth: 0.5,
    baseRadius: 14,
    combineMaxScale: 4.5,
    gravity: 1,
    restitution: 0,
    maxBodies: 200,
    spawnCap: 20,

    // Jar breaking
    jarBreaks: true,
    crackBigGiftCoins: 100,
    bigGiftCrack: 0.22,
    overflowCrack: 0.05,
    showJarTally: true,
    breakSound: '',

    // Stream and trajectory
    stream: true,
    streamStagger: 0,
    spreadDeg: 30,
    launchSpeed: 8,

    // Optional effects
    sizeByValue: false,
    sizeMaxScale: 2.6,
    bigGiftCoins: 50,
    bigGiftSplash: false,

    // Coin Jar Pro HUD
    displayAlert: true,
    alertDuration: 5,
    displayLeaderboard: true,
    numberOfRanks: 'top5',
    leaderboardDisplayFormat: 'avatarNameCoins',
    leaderboardDuration: 5,
    displayRankBadges: true,
    showTotalCoins: true,
    showProgress: false,

    // Miscellaneous
    demo: false,
    debug: false,
  });

  return { DEFAULTS };
});
