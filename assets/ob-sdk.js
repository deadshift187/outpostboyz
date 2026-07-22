/* Outpost Boyz SDK — accounts, scores, subscribers.
   Requires supabase-js v2 loaded first:
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> */
(function () {
  'use strict';
  var OB_URL = 'https://duogqviqgmbaynfrhrmq.supabase.co';
  var OB_KEY = 'sb_publishable_2BlS9dXgQdHF04kUtp-b9A_FbfqTzyh';
  var OB_FN = OB_URL + '/functions/v1';

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

    async setGamertag(tag) {
      var s = await this.session();
      if (!s) return { error: { message: 'Not signed in' } };
      return client.from('profiles').insert({ id: s.user.id, gamertag: tag });
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
