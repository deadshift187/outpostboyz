// Physics + collision helpers shared by every body. The street is a set of solid ground SPANS at GY
// (gaps between spans are real pits) with POTHOLES punched into it (no floor over the opening, exactly
// like his overPit()). Extra collision comes from S.solids: {x,y,w,h, oneway?, kind?, moving?}.
(function () {
  'use strict';
  const LA = window.LA, K = LA.K, GY = K.GY;
  const phys = LA.phys = {};

  phys.overPit = function (S, cx) {
    for (const ph of S.potholes) if (cx > ph + K.PIT_X && cx < ph + K.PIT_X + K.PIT_W) return true;
    return false;
  };
  phys.overGap = function (S, cx) {                                  // true if no ground span under cx
    for (const g of S.ground) if (cx >= g.x && cx <= g.x + g.w) return false;
    return true;
  };
  phys.floorAt = function (S, cx) { return !phys.overPit(S, cx) && !phys.overGap(S, cx) && !(S.water && S.water(cx)); };

  // Move a body {x,y,w,h,vx,vy} one tick with Saint's collision rules. Returns flags.
  // opts: { grav, maxFall, cut (bool: apply variable-jump cut), cutv, noFloor(cx)->bool }
  phys.move = function (S, b, opts) {
    opts = opts || {};
    const res = { landed: false, hitHead: false, hitWall: 0, onGround: false, ground: null };
    const cxOf = () => b.x + b.w / 2;
    // horizontal
    b.x += b.vx;
    const noFloor = !phys.floorAt(S, cxOf());
    for (const s of S.solids) {
      if (s.oneway || s.deck) continue;                              // one-way platforms and decks never block sideways
      if (LA.aabb(b, s)) { if (b.vx > 0) b.x = s.x - b.w; else if (b.vx < 0) b.x = s.x + s.w; res.hitWall = LA.sign(b.vx); b.vx = 0; }
    }
    // the ground block beside a pit is a wall once you're below street level
    if (b.y + b.h > GY + 2 && noFloor) {
      const cx = cxOf();
      const ph = S.potholes.find((p) => cx > p + K.PIT_X && cx < p + K.PIT_X + K.PIT_W);
      if (ph != null) {                                              // inside a pothole: its lips are the walls (potholes don't split spans)
        const a = ph + K.PIT_X, z = a + K.PIT_W;
        if (b.x < a) { b.x = a; res.hitWall = -1; b.vx = 0; }
        if (b.x + b.w > z) { b.x = z - b.w; res.hitWall = 1; b.vx = 0; }
      } else for (const g of S.ground) {
        const gb = { x: g.x, y: GY, w: g.w, h: 400 };
        if (LA.aabb(b, gb)) { if (b.vx > 0) b.x = g.x - b.w; else if (b.vx < 0) b.x = g.x + g.w; res.hitWall = LA.sign(b.vx); b.vx = 0; }
      }
    }
    // vertical
    b.vy += (opts.grav != null ? opts.grav : K.GRAV) * (opts.gravScale || 1);
    const mf = opts.maxFall != null ? opts.maxFall : 16; if (b.vy > mf) b.vy = mf;
    if (opts.cut && b.vy < (opts.cutv != null ? opts.cutv : K.CUTV)) b.vy = (opts.cutv != null ? opts.cutv : K.CUTV);
    const prevBottom = b.y + b.h;
    b.y += b.vy;
    // street floor
    if (b.vy >= 0 && prevBottom <= GY + 0.01 && b.y + b.h >= GY && phys.floorAt(S, cxOf())) {
      b.y = GY - b.h; b.vy = 0; res.landed = true; res.onGround = true; res.ground = 'street';
    }
    for (const s of S.solids) {
      if (!LA.aabb(b, s)) continue;
      if (b.vy >= 0 && prevBottom <= s.y + 0.01 + Math.max(0, (s.dy || 0))) { b.y = s.y - b.h; b.vy = 0; res.landed = true; res.onGround = true; res.ground = s; }
      else if (!s.oneway && !s.deck && b.vy < 0 && b.y < s.y + s.h && b.y - b.vy >= s.y + s.h - 0.01) { b.y = s.y + s.h; b.vy = 0; res.hitHead = true; }
    }
    // resting exactly on the street (no vertical motion this tick)
    if (!res.onGround && Math.abs(b.y + b.h - GY) < 0.5 && b.vy >= 0 && phys.floorAt(S, cxOf())) { res.onGround = true; res.ground = 'street'; }
    return res;
  };

  // generic walker (enemies): gravity + floor, turns at walls; patrol bounds optional
  phys.walk = function (S, e) {
    const r = phys.move(S, e, { grav: K.GRAV, maxFall: 14 });
    if (r.hitWall) e.vx = -r.hitWall * Math.abs(e.speed || 1);
    return r;
  };

  phys.rect = (x, y, w, h) => ({ x, y, w, h });
  phys.stompedFrom = function (p, e) {                                // his forgiving stomp test (1302)
    return p.vy > -3 && (p.y + p.h - e.y) < e.h * 0.6 + Math.abs(p.vy) * 1.2;
  };
})();
