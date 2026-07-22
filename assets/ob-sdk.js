/* Outpost Boyz SDK — accounts, scores, subscribers.
   Requires supabase-js v2 loaded first:
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> */
(function () {
  'use strict';
  var OB_URL = 'https://duogqviqgmbaynfrhrmq.supabase.co';
  var OB_KEY = 'sb_publishable_2BlS9dXgQdHF04kUtp-b9A_FbfqTzyh';
  var OB_FN = OB_URL + '/functions/v1';

  // Kill stale caches forever: network-first service worker.
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('/sw.js').catch(function () { });
  }

  // Lightweight private analytics: one row per page view, no cookies, no trackers.
  try {
    if (location.hostname === 'outpostboyz.com') {
      var isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
      fetch(OB_URL + '/rest/v1/page_views', {
        method: 'POST',
        headers: { 'apikey': OB_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          path: location.pathname.slice(0, 200),
          referrer: (document.referrer || '').slice(0, 300) || null,
          device: isMobile ? 'mobile' : 'desktop'
        })
      }).catch(function () { });
    }
  } catch (e) { }

  if (!window.supabase || !window.supabase.createClient) {
    console.warn('OB SDK: supabase-js not loaded');
    window.OB = null;
    return;
  }
  var client = window.supabase.createClient(OB_URL, OB_KEY);

  window.OB = {
    client: client,

    async session() {
      var r = await client.auth.getSession();
      return (r.data && r.data.session) || null;
    },

    async signIn(email) {
      return client.auth.signInWithOtp({
        email: email,
        options: { emailRedirectTo: 'https://outpostboyz.com/account/' }
      });
    },

    async signOut() { return client.auth.signOut(); },

    async signInPassword(email, password) {
      return client.auth.signInWithPassword({ email: email, password: password });
    },

    async signUpPassword(email, password) {
      return client.auth.signUp({
        email: email,
        password: password,
        options: { emailRedirectTo: 'https://outpostboyz.com/account/' }
      });
    },

    async resetPassword(email) {
      return client.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://outpostboyz.com/account/'
      });
    },

    async setPassword(newPassword) {
      return client.auth.updateUser({ password: newPassword });
    },

    async profile() {
      var s = await this.session();
      if (!s) return null;
      var r = await client.from('profiles').select('gamertag').eq('id', s.user.id).maybeSingle();
      return r.data || null;
    },

    cleanTag(tag) {
      var norm = String(tag || '').toLowerCase();
      norm = norm.replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e')
                 .replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't')
                 .replace(/8/g, 'b').replace(/@/g, 'a').replace(/\$/g, 's');
      norm = norm.replace(/[^a-z]/g, '');
      var banned = ['nigger','nigga','niger','nigar','faggot','fagot','chink','spic','kike','wetback','coon','beaner','gook','tranny','dyke','retard','tard','fuck','fuk','fuq','phuck','shit','bitch','cunt','whore','slut','asshole','dumbass','jackass','bastard','pussy','cock','dick','dildo','boner','wank','jizz','cum','anus','clit','rape','rapist','molest','pedo','pedophile','kys','killyourself','suicide','nazi','hitler','kkk','klux','isis','terrorist','genocide','holocaust','admin','moderator','outpostofficial','staff','support'];
      for (var i = 0; i < banned.length; i++) { if (norm.indexOf(banned[i]) !== -1) return false; }
      return true;
    },

    async setGamertag(tag) {
      var s = await this.session();
      if (!s) return { error: { message: 'Not signed in' } };
      if (!this.cleanTag(tag)) return { error: { code: 'dirty', message: "That gamertag isn't allowed — keep it clean, champ." } };
      var r = await client.from('profiles').insert({ id: s.user.id, gamertag: tag });
      if (r.error && /gamertag_not_allowed/.test(r.error.message || '')) {
        return { error: { code: 'dirty', message: "That gamertag isn't allowed — keep it clean, champ." } };
      }
      return r;
    },

    async submitScore(slug, score) {
      try {
        var s = await this.session();
        if (!s) return { skipped: true };
        var n = Math.max(0, Math.floor(Number(score) || 0));
        if (n <= 0) return { skipped: true };
        return await client.from('scores').insert({ user_id: s.user.id, game_slug: slug, score: n });
      } catch (e) { return { error: e }; }
    },

    async subscribe(email) {
      return client.from('subscribers').insert({ email: String(email || '').trim().toLowerCase(), source: 'site-form' });
    },

    async leaderboard(slug, limit) {
      var r = await client.from('leaderboard')
        .select('gamertag,best_score,last_played')
        .eq('game_slug', slug)
        .order('best_score', { ascending: false })
        .limit(limit || 25);
      return { data: r.data || [], error: r.error };
    },

    async buy(slug) {
      var s = await this.session();
      if (!s) { window.location.href = 'account/'; return; }
      var r = await fetch(OB_FN + '/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + s.access_token
        },
        body: JSON.stringify({ slug: slug })
      });
      var d = await r.json();
      if (d.url) { window.location.href = d.url; }
      else { alert(d.error || 'Checkout unavailable right now'); }
    },

    async myGames() {
      var s = await this.session();
      if (!s) return [];
      var r = await client.from('purchases').select('game_slug,created_at').order('created_at', { ascending: false });
      return r.data || [];
    },

    tipUrl: '',
    _tipLoaded: false,

    async loadTipUrl() {
      if (this._tipLoaded) return this.tipUrl;
      this._tipLoaded = true;
      try {
        var r = await fetch('/games/store.json', { cache: 'no-cache' });
        var s = await r.json();
        this.tipUrl = s.tipUrl || '';
      } catch (e) { this.tipUrl = ''; }
      return this.tipUrl;
    },

    // Called by games when a run ends. Shows the $1 research-grant card
    // every 5th run-end; NOT NOW quiets it for 24h, funding for 7 days.
    async gameOver(slug) {
      try {
        var url = await this.loadTipUrl();
        if (!url) return;
        var n = (parseInt(localStorage.getItem('ob-runs') || '0', 10) || 0) + 1;
        localStorage.setItem('ob-runs', String(n));
        var snooze = parseInt(localStorage.getItem('ob-tip-snooze') || '0', 10) || 0;
        if (Date.now() < snooze) return;
        if (n % 5 !== 0) return;
        this._showTip(url);
      } catch (e) { }
    },

    _showTip(url) {
      if (document.getElementById('obTipCard')) return;
      var d = document.createElement('div');
      d.id = 'obTipCard';
      d.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:9999;background:#0d160f;border:2px solid #39ff14;border-radius:12px 12px 22px 22px;padding:16px 18px;max-width:340px;width:calc(100vw - 32px);font-family:system-ui,sans-serif;color:#e8e2d4;box-shadow:0 8px 40px rgba(0,0,0,.6);text-align:center;';
      d.innerHTML = '<div style="font-weight:800;letter-spacing:1px;font-size:14px;color:#39ff14;">ENJOYING THE EXPERIMENTS?</div>' +
        '<div style="font-size:12px;color:#9aa89b;margin:6px 0 12px;">The lab runs on $1 research grants. Every grant funds the next free game.</div>' +
        '<div style="display:flex;gap:8px;justify-content:center;">' +
        '<a href="' + url + '" target="_blank" rel="noopener" style="background:#39ff14;color:#04140a;font-weight:800;font-size:13px;padding:10px 14px;border-radius:6px 6px 14px 14px;text-decoration:none;letter-spacing:1px;">FUND THE LAB &#8212; $1</a>' +
        '<button id="obTipNo" style="background:transparent;color:#9aa89b;border:1px solid #2c3a2e;font-size:12px;padding:10px 12px;border-radius:6px;cursor:pointer;">NOT NOW</button></div>';
      document.body.appendChild(d);
      document.getElementById('obTipNo').addEventListener('click', function () {
        localStorage.setItem('ob-tip-snooze', String(Date.now() + 24 * 3600 * 1000));
        d.remove();
      });
      d.querySelector('a').addEventListener('click', function () {
        localStorage.setItem('ob-tip-snooze', String(Date.now() + 7 * 24 * 3600 * 1000));
        setTimeout(function () { d.remove(); }, 400);
      });
    },

    // Gauntlet games call this ONCE when the player actually beats the game.
    // Logs a bounty claim (first verified claim wins the $100).
    async claimBounty(slug) {
      try {
        var s = await this.session();
        if (!s) return { skipped: true };
        var r = await this.client.from('bounty_wins').insert({ user_id: s.user.id, game_slug: slug });
        var already = r.error && r.error.code === '23505';
        if (!r.error || already) this._showBountyClaim(already);
        return r;
      } catch (e) { return { error: e }; }
    },

    _showBountyClaim(already) {
      if (document.getElementById('obBountyCard')) return;
      var d = document.createElement('div');
      d.id = 'obBountyCard';
      d.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9999;background:#0d160f;border:3px solid #ffb454;border-radius:12px;padding:24px;max-width:360px;width:calc(100vw - 32px);font-family:system-ui,sans-serif;color:#e8e2d4;box-shadow:0 8px 60px rgba(0,0,0,.8);text-align:center;';
      d.innerHTML = '<div style="font-size:34px;">&#127942;</div>' +
        '<div style="font-weight:800;letter-spacing:1px;font-size:17px;color:#ffb454;margin-top:6px;">' +
        (already ? 'CLAIM ALREADY LOGGED' : 'VICTORY LOGGED') + '</div>' +
        '<div style="font-size:13px;color:#9aa89b;margin:10px 0 16px;">' +
        (already ? 'Your completion is already on file with the crew.'
          : 'Your run is on file, timestamped. If you are the FIRST verified victor, the crew contacts you at your account email and the $100 bounty is yours.') +
        '</div>' +
        '<button onclick="this.parentNode.remove()" style="background:#ffb454;color:#241701;font-weight:800;font-size:13px;padding:10px 18px;border:0;border-radius:8px;cursor:pointer;letter-spacing:1px;">RESPECT</button>';
      document.body.appendChild(d);
    },

    // ===== MULTIPLAYER =====
    // Live 2-player match rooms. state = your whole game object (JSON).
    // Flow: host create() -> shares code -> guest join(code) -> both subscribe()
    // -> on your turn, push() the new state+turn. Row persists = resume anytime.
    mp: {
      async create(gameSlug, initialState) {
        var s = await OB.session();
        if (!s) return { error: { message: 'Sign in first' } };
        var code = '';
        var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        for (var i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
        return client.from('matches').insert({
          game_slug: gameSlug, join_code: code, host_id: s.user.id,
          state: initialState || {}, status: 'waiting', turn: s.user.id
        }).select().single();
      },
      async join(code) {
        var r = await client.rpc('join_match', { p_code: String(code || '').toUpperCase() });
        if (r.error) return r;
        return { data: r.data, error: null };
      },
      async get(id) {
        return client.from('matches').select('*').eq('id', id).maybeSingle();
      },
      // push new game state (and whose turn is next; null when done)
      async push(id, state, nextTurn, status) {
        var patch = { state: state, updated_at: new Date().toISOString() };
        if (nextTurn !== undefined) patch.turn = nextTurn;
        if (status) patch.status = status;
        return client.from('matches').update(patch).eq('id', id);
      },
      // matches I'm currently in (waiting or active) — for a "resume" list
      async mine() {
        var r = await client.from('matches').select('*')
          .neq('status', 'done').order('updated_at', { ascending: false });
        return r.data || [];
      },
      // live updates: cb(matchRow) fires whenever the row changes
      subscribe(id, cb) {
        var ch = client.channel('match-' + id)
          .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'matches', filter: 'id=eq.' + id },
            function (p) { cb(p.new); })
          .subscribe();
        return ch;
      },
      unsubscribe(ch) { try { client.removeChannel(ch); } catch (e) {} },
      async me() { var s = await OB.session(); return s ? s.user.id : null; }
    },

    async playGame(slug) {
      var s = await this.session();
      if (!s) return;
      var r = await fetch(OB_FN + '/get-game?slug=' + encodeURIComponent(slug), {
        headers: { 'Authorization': 'Bearer ' + s.access_token }
      });
      var d = await r.json();
      if (d.url) { window.open(d.url, '_blank'); }
      else { alert(d.error || 'Unavailable'); }
    }
  };
})();
