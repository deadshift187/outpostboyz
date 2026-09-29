// LEVELS — 27 levels in 5 worlds, carved out of Saint's continuous city. Levels PARTITION the world
// (each ends where the next begins), so every district's buildings stay in their exact positions and the
// Full City Run is simply all levels back-to-back in one seamless world.
// A level ends in a BOSS arena or a GOAL flag. Ranges resolve from the live city, so map edits carry over.
(function () {
  'use strict';
  const LA = window.LA;

  LA.WORLDS = [
    { n: 1, name: 'THE COAST', tag: 'Marina del Rey to Malibu', col: '#4dc8ff' },
    { n: 2, name: 'THE VALLEY', tag: 'Calabasas to Pasadena', col: '#ffc23a' },
    { n: 3, name: 'DOWNTOWN', tag: 'Echo Park to Crank Park', col: '#ff6fae' },
    { n: 4, name: 'HOLLYWOOD & THE WESTSIDE', tag: 'Griffith to Culver City', col: '#b07cff' },
    { n: 5, name: 'THE RECKONING', tag: 'Playa Vista to San Francisco', col: '#57e08a' },
  ];

  // from/to: [districtIndex, fraction-of-district | 'ferry']. Districts = LA.city.zones order (Saint's 30).
  LA.LEVELS = [
    { id: '1-1', w: 1, name: 'VENICE BEACH', sub: 'Marina del Rey → Venice', from: [0, 0], boss: 'TOXIC BRUTE', sets: ['concert'] },
    { id: '1-2', w: 1, name: 'PALISADES', sub: 'Santa Monica → the burn zone', from: [2, 0], boss: 'THE DEVELOPER' },
    { id: '1-3', w: 1, name: 'MALIBU', sub: 'claim denied', from: [4, 0], boss: 'THE ADJUSTER' },
    { id: '2-1', w: 2, name: 'CALABASAS', sub: 'the Golden Cruiser', from: [5, 0], goal: true, sets: ['rv'] },
    { id: '2-2', w: 2, name: 'HIDDEN HILLS', sub: 'Hidden Hills → Encino', from: [6, 0], goal: true },
    { id: '2-3', w: 2, name: 'STUDIO CITY', sub: 'quiet on set', from: [8, 0], boss: 'THE PRODUCER' },
    { id: '2-4', w: 2, name: 'BURBANK AIRPORT', sub: 'Universal City → Burbank', from: [9, 0], boss: 'THE GATE AGENT' },
    { id: '2-5', w: 2, name: 'GLENDALE', sub: 'take a number', from: [11, 0], boss: 'OFFICER CHALKSTICK' },
    { id: '2-6', w: 2, name: 'PASADENA', sub: 'permit pending', from: [12, 0], boss: 'CODE ENFORCEMENT' },
    { id: '3-1', w: 3, name: 'ECHO PARK', sub: 'the flag waver', from: [13, 0], boss: 'FLAGO' },
    { id: '3-2', w: 3, name: 'DTLA', sub: 'Broadway', from: [14, 0], goal: true },
    { id: '3-3', w: 3, name: 'DTLA', sub: 'the Historic Core', from: [14, 0.34], goal: true },
    { id: '3-4', w: 3, name: 'DTLA', sub: 'the heist', from: [14, 0.63], boss: 'THE VVS CREW', sets: ['heist', 'kult'] },   // Hexandria/KULT sits one block past VVS
    { id: '3-5', w: 3, name: 'CRANK PARK', sub: 'the FBI is here to help', from: [15, 0], boss: 'CRANK QUEEN', sets: ['fbi'] },
    { id: '4-1', w: 4, name: 'HOLLYWOOD', sub: 'Griffith Observatory → Hollywood', from: [16, 0], boss: 'THE GRILL MARSHAL', sets: ['flood'] },
    { id: '4-2', w: 4, name: 'WEST HOLLYWOOD', sub: 'after dark', from: [18, 0], goal: true },
    { id: '4-3', w: 4, name: 'MELROSE', sub: 'the walk-off', from: [19, 0], boss: 'BRANDAN 69', sets: ['walkoff'] },
    { id: '4-4', w: 4, name: 'BEVERLY GROVE', sub: 'the $20 smoothie', from: [20, 0], boss: 'GURU KALE' },
    { id: '4-5', w: 4, name: 'BEVERLY HILLS', sub: 'representation', from: [21, 0], boss: 'THE AGENT' },
    { id: '4-6', w: 4, name: 'BEL AIR', sub: 'plough through', from: [22, 0], goal: true, sets: ['rv'] },
    { id: '4-7', w: 4, name: 'CULVER CITY', sub: 'rolling blackouts', from: [23, 0], boss: 'THE BROWNOUT BARON' },
    { id: '5-1', w: 5, name: 'PLAYA VISTA', sub: 'no photos', from: [24, 0], boss: 'TWZ HOSTS', sets: ['paparazzi'] },
    { id: '5-2', w: 5, name: 'LAX', sub: 'arrivals: eventually', from: [25, 0], goal: true },
    { id: '5-3', w: 5, name: 'SOUTH BAY', sub: 'Manhattan Beach → Redondo', from: [26, 0], goal: true },
    { id: '5-4', w: 5, name: 'LONG BEACH', sub: 'every vote counts (twice)', from: [28, 0], boss: 'MAYOR BASURA', sets: ['ballots'] },
    { id: '5-5', w: 5, name: 'SAN FRANCISCO', sub: 'fly north', from: [29, 0], goal: true, sets: ['flight'] },
    { id: '5-6', w: 5, name: 'ALCATRAZ', sub: 'the final spin', from: [29, 'ferry'], boss: 'GOV. NEWSCUM', sets: ['alcatraz'], final: true },
  ];

  const ARENA_W = 960, MIN_BOSS = 2700, MIN_GOAL = 3200, CHECK_EVERY = 7000;
  const levels = LA.levels = { ARENA_W, byId: {} };

  // world x where the SF bay water starts: just past the last building before Alcatraz (his azInit() wx0)
  function ferryX() {
    const C = LA.city, BG = LA.K.BG_PAR, t = C.tile('bAlcatrazed');
    if (!t) return C.seg[29][0] + (C.seg[29][1] - C.seg[29][0]) * 0.7;
    const island = t.x / BG; let m = 0;
    for (const tt of C.bgTiles) { if (tt.k === 'bAlcatrazed') continue; const e = C.edit(tt.k) || {}; if (e.del) continue; const b = (tt.x + (e.dx || 0) + tt.w * (e.sc || 1)) / BG; if (b < island && b > m) m = b; }
    return m + 150;                                                    // his AZ.wx0: the water starts here
  }
  levels.ferryX = ferryX;

  function startOf(spec) {
    const C = LA.city, d = spec[0], f = spec[1], s = C.seg[d];
    if (f === 'ferry') return ferryX() - 1900;
    return s[0] + (s[1] - s[0]) * f;
  }

  // Resolve every level's world range from the city (call after LA.city.build()).
  levels.resolve = function () {
    const C = LA.city, L = LA.LEVELS;
    let prevEnd = null;
    const starts = L.map((lv) => startOf(lv.from));
    starts[0] = Math.max(0, starts[0]);
    for (let i = 0; i < L.length; i++) {                              // enforce playable minimums (push later starts)
      if (i > 0 && starts[i] < prevEnd) starts[i] = prevEnd;
      const min = L[i].boss ? MIN_BOSS : MIN_GOAL;
      const nextStart = i < L.length - 1 ? startOf(L[i + 1].from) : C.worldW;
      prevEnd = Math.max(nextStart, starts[i] + min);
    }
    for (let i = 0; i < L.length; i++) {
      const lv = L[i];
      lv.x0 = starts[i];
      lv.x1 = i < L.length - 1 ? starts[i + 1] : C.worldW;
      lv.len = lv.x1 - lv.x0;
      lv.world = LA.WORLDS[lv.w - 1];
      lv.index = i;
      lv.arena = lv.boss ? { x: lv.x1 - ARENA_W, w: ARENA_W } : null;
      lv.goalX = lv.goal ? lv.x1 - 240 : null;
      const playEnd = lv.arena ? lv.arena.x - 200 : lv.goalX - 400;
      lv.checkpoints = [];
      for (let x = lv.x0 + CHECK_EVERY; x < playEnd - 1500; x += CHECK_EVERY) lv.checkpoints.push(Math.round(x));
      lv.districts = []; for (let d = C.zoneIndexAt(lv.x0 + 1); d <= C.zoneIndexAt(lv.x1 - 1); d++) lv.districts.push(d);
      levels.byId[lv.id] = lv;
    }
    levels.all = L;
    return L;
  };
  levels.next = (lv) => LA.LEVELS[lv.index + 1] || null;
  levels.inWorld = (n) => LA.LEVELS.filter((lv) => lv.w === n);
})();
