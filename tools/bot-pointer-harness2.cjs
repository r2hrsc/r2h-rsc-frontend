// Throwaway harness v2: serves the REAL public/game/index.html at /game/
// with the arena hash, mock /v1/arena/bots + areas.json, so the exact deployed
// wiring can be debugged locally. The game client (classes.js) is NOT served —
// we stub __r2h_mc after load. The page's own script tags for teavm will 404
// harmlessly (we log but continue).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const GAME = path.join(__dirname, '..', 'public', 'game');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json' };

const BOTS = { ts: Date.now(), count: 2, bots: [
  { n: 'emberveil', x: 172, y: 274, cb: 40 },
  { n: 'dunraven', x: 205, y: 415, cb: 13 }
]};

http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/api/bots') { // CORS-enabled mock for api.r2hrsc.xyz is impossible locally; the page fetch will fail → tests fail-soft path
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(BOTS));
  }
  if (url === '/game/' || url === '/game/index.html' || url === '/game/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return fs.createReadStream(path.join(GAME, 'index.html')).pipe(res);
  }
  // serve game assets (r2h-*.js, areas.json); 404 for teavm (client absent)
  const p = path.join(GAME, url.replace(/^\/game\//, ''));
  if (p.startsWith(GAME) && fs.existsSync(p) && fs.statSync(p).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'text/plain' });
    return fs.createReadStream(p).pipe(res);
  }
  res.writeHead(404); res.end('nf:' + url);
}).listen(4200, () => console.log('real-page harness on :4200 — open http://127.0.0.1:4200/game/#,43595,'));
