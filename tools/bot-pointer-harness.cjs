// Throwaway E2E harness for the bot pointer wiring (no game server needed).
// Serves public/game/ files with a mock /v1/arena/bots endpoint.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const GAME = path.join(__dirname, '..', 'public', 'game');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json' };

const BOTS = [
  { n: 'plagueknight', x: 132, y: 150, cb: 65 },
  { n: 'irondemon', x: 164, y: 214, cb: 71 },
  { n: 'emberveil', x: 172, y: 274, cb: 40 },
  { n: 'dunraven', x: 205, y: 415, cb: 13 }
];

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/v1/arena/bots')) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ts: Date.now(), count: BOTS.length, bots: BOTS }));
    return;
  }
  let file = req.url.split('?')[0];
  if (file === '/') file = '/harness.html';
  const p = path.join(GAME, file);
  if (!fs.existsSync(p)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'text/plain' });
  fs.createReadStream(p).pipe(res);
});
server.listen(4199, () => console.log('harness on :4199'));
