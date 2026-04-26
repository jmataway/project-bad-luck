const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM(`<!DOCTYPE html><html><body>
<canvas id="game"></canvas>
<div id="username"></div>
</body></html>`, { runScripts: "dangerously", resources: "usable" });
dom.window.fetch = async (url) => {
  return { ok: true, json: async () => JSON.parse(fs.readFileSync(url, 'utf8')) };
};
dom.window.Portal = {
  readPortalParams: () => ({ speed: 5, username: 'test', color: 'fff' }),
  pickPortalTarget: async () => null,
  sendPlayerThroughPortal: () => {}
};
dom.window.confirm = () => true;
dom.window.alert = console.log;
dom.window.performance = require('perf_hooks').performance;
dom.window.requestAnimationFrame = (cb) => setTimeout(cb, 16);
dom.window.eval(fs.readFileSync('game.js', 'utf8'));
