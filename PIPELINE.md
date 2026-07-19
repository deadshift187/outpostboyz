# Outpost Boyz — game posting pipeline

Site root: `C:\Users\Owner\Desktop\OUTPOSTBOYZ`
Live at: https://outpostboyz.com (GitHub Pages, repo `deadshift187/outpostboyz`)

## How to publish a new arcade game

Games are built in other chats and delivered as a single self-contained HTML file
(all CSS/JS inline, no external dependencies except Google Fonts).

1. Save the game as `games/<slug>/index.html` (slug = lowercase-kebab title).
2. Inject the standard home button right after `<body>` if the game doesn't have one:
   ```html
   <a class="home-btn" href="../../" style="position:fixed;top:10px;left:10px;z-index:10;font-family:'Press Start 2P',monospace;font-size:8px;color:#7d8da0;text-decoration:none;background:rgba(7,10,15,0.7);border:1px solid #1d2a3a;padding:8px 10px;">◂ OUTPOST BOYZ</a>
   ```
3. Add an entry to `games/games.json`:
   ```json
   {
     "slug": "my-game",
     "title": "MY GAME",
     "tagline": "One-line hook.",
     "icon": "🎯",
     "color": "#4dd8ff",
     "controls": "TAP / SPACE",
     "badge": "NEW",
     "added": "YYYY-MM-DD"
   }
   ```
   Move the `"badge": "NEW"` off the previous newest game. Card accent colors rotate
   through: `#41ff6b` green, `#ffb454` amber, `#ff4d9d` magenta, `#4dd8ff` cyan.
4. Test locally in the browser preview (game loads, plays on mobile width, back button works).
5. Commit and push — GitHub Pages redeploys automatically in ~1 minute:
   ```
   git add -A
   git commit -m "Add <title> to arcade"
   git push
   ```

## Game requirements (tell the game-building chat)

- Single `index.html`, everything inline
- Mobile-first: touch controls required, keyboard optional
- Portrait AND landscape friendly (use full viewport, `100dvh`)
- House style: bg `#070a0f`, neon green `#41ff6b`, amber `#ffb454`,
  magenta `#ff4d9d`, cyan `#4dd8ff`, font "Press Start 2P"
- High score in `localStorage` under key `ob-<slug>-best`
- No ads, no external network calls, no analytics
