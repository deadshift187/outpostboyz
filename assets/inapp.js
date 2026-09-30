/* Outpost Boyz: gentle "open in your real browser" hint for in-app browsers
   (Instagram, Facebook, TikTok, Snapchat). Those webviews can't use Apple Pay / Google Pay,
   and sign-in emails open in Safari/Chrome, not back inside the app. Games still play fine
   in-app, so this is a dismissible bar, never a wall. Include on pages with sign-in or checkout:
   <script src="/assets/inapp.js" defer></script>   (styles live in /assets/style.css; inline fallback below) */
(function () {
  'use strict';
  try {
    var ua = navigator.userAgent || '';
    var app = /Instagram/i.test(ua) ? 'Instagram'
      : /FBAN|FBAV|FB_IAB|FBIOS/i.test(ua) ? 'Facebook'
      : /musical_ly|BytedanceWebview|TikTok|trill/i.test(ua) ? 'TikTok'
      : /Snapchat/i.test(ua) ? 'Snapchat' : '';
    if (!app) return;
    try { if (sessionStorage.getItem('ob-inapp-hint')) return; } catch (e) { }
    var android = /Android/i.test(ua);
    var bar = document.createElement('div');
    bar.id = 'obInApp';
    bar.setAttribute('role', 'note');
    // Fallback look for pages that don't load style.css.
    if (!document.querySelector('link[href*="style.css"]')) {
      bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9000;background:#000;color:#fff;border-top:3px solid #39ff14;' +
        'padding:10px 12px calc(10px + env(safe-area-inset-bottom));font:13px/1.35 system-ui,sans-serif;display:flex;align-items:center;gap:10px;';
    }
    var how = android ? 'tap <b>&#8942;</b> &rarr; <b>Open in Chrome</b>' : 'tap <b>&#8943;</b> &rarr; <b>Open in external browser</b>';
    var html = '<p style="flex:1;margin:0">In ' + app + '? Games play fine here. To <b>buy or sign in</b> (Apple Pay, stay signed in), ' + how + '.</p>';
    if (android) {
      var here = location.href.replace(/^https?:\/\//, '');
      html += '<a href="intent://' + here.replace(/"/g, '%22') + '#Intent;scheme=https;package=com.android.chrome;end" style="min-height:44px;display:inline-flex;align-items:center;background:#39ff14;color:#000;padding:0 12px;font-weight:900;text-decoration:none;border-radius:4px 4px 12px 12px">OPEN CHROME</a>';
    }
    html += '<button type="button" aria-label="Dismiss" style="min-height:44px;min-width:44px;background:transparent;color:#bbb;border:0;font-size:20px;cursor:pointer">&#10005;</button>';
    bar.innerHTML = html;
    bar.querySelector('button').addEventListener('click', function () {
      try { sessionStorage.setItem('ob-inapp-hint', '1'); } catch (e) { }
      bar.parentNode && bar.parentNode.removeChild(bar);
      document.body.style.paddingBottom = '';
    });
    var add = function () {
      document.body.appendChild(bar);
      // Keep the footer reachable under the fixed bar.
      document.body.style.paddingBottom = (bar.offsetHeight + 8) + 'px';
    };
    if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
  } catch (e) { }
})();
