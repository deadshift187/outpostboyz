/* Renders the free-arcade grid from games/games.json.
   To publish a new game: drop it in games/<slug>/index.html and add one entry to games.json. */
(async function () {
  const grid = document.getElementById('gameGrid');
  try {
    const res = await fetch('games/games.json', { cache: 'no-cache' });
    const data = await res.json();
    const games = data.games || [];
    if (!games.length) {
      grid.innerHTML = '<p class="loading">FIRST CARTRIDGE LOADING SOON…</p>';
      return;
    }
    grid.innerHTML = games.map(g => {
      const color = g.color || 'var(--green)';
      const badge = g.badge ? `<span class="game-badge">${g.badge}</span>` : '';
      if (g.comingSoon) {
        return `
          <article class="game-card coming" style="--card-color:${color}">
            ${badge}
            <div class="game-icon">${g.icon || '🕹️'}</div>
            <h3 class="game-title">${g.title}</h3>
            <p class="game-tagline">${g.tagline || ''}</p>
            <p class="game-meta">COMING SOON</p>
          </article>`;
      }
      return `
        <article class="game-card" style="--card-color:${color}">
          ${badge}
          <div class="game-icon">${g.icon || '🕹️'}</div>
          <h3 class="game-title">${g.title}</h3>
          <p class="game-tagline">${g.tagline || ''}</p>
          <p class="game-meta">${g.controls || 'TAP TO PLAY'}</p>
          <a class="game-play" href="games/${g.slug}/">▸ PLAY</a>
        </article>`;
    }).join('');
  } catch (err) {
    grid.innerHTML = '<p class="loading">ARCADE OFFLINE — TRY A REFRESH</p>';
  }
})();
