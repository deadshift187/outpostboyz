const { chromium } = require('./pw/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await p.goto('file:///' + process.argv[2] + '/og/launch.html');
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  console.log(await p.evaluate(() => [...document.fonts].map(f => f.family + ':' + f.status).join(',')));
  await p.screenshot({ path: process.argv[2] + '/og/launch.png' });
  await b.close();
})();
