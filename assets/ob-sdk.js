/* Outpost Boyz SDK — accounts, scores, subscribers.
   Requires supabase-js v2 loaded first:
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> */
(function () {
  'use strict';
  var OB_URL = 'https://duogqviqgmbaynfrhrmq.supabase.co';
  var OB_KEY = 'sb_publishable_2BlS9dXgQdHF04kUtp-b9A_FbfqTzyh';

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
    }
  };
})();
