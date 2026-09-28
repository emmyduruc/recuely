// Task 9 spike (throwaway): HTTPS static server for the capture lab, reachable from phones on the LAN.
// `node server.mjs` → https://<LAN IP>:8443/. Devices POST their results to /results (saved to results/).
// /ca.crt serves the local CA certificate so phones can trust the server (see README.md).
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'node:https';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('.', import.meta.url).pathname;
const PORT = 8443;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.wav': 'audio/wav', '.crt': 'application/x-x509-ca-cert', '.json': 'application/json' };
const PUBLIC = new Set(['/index.html', '/lab.js', '/assets/phrase.wav']);

function handle(req, res) {
  const url = new URL(req.url ?? '/', 'https://localhost');
  if (req.method === 'POST' && url.pathname === '/results') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 5_000_000) req.destroy();
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const name = String(data.device ?? 'unknown').replace(/[^a-z0-9-]+/gi, '-').slice(0, 60);
        mkdirSync(join(ROOT, 'results'), { recursive: true });
        const file = join(ROOT, 'results', `${name}-${Date.now()}.json`);
        writeFileSync(file, JSON.stringify(data, null, 1));
        console.log('saved', file);
        res.writeHead(200, { 'content-type': 'application/json' }).end('{"saved":true}');
      } catch {
        res.writeHead(400).end('bad json');
      }
    });
    return;
  }
  if (url.pathname === '/ca.crt') {
    res.writeHead(200, { 'content-type': TYPES['.crt'], 'content-disposition': 'attachment; filename="recuely-spike-ca.crt"' });
    res.end(readFileSync(join(ROOT, 'certs/ca.crt')));
    return;
  }
  const path = url.pathname === '/' ? '/index.html' : normalize(url.pathname);
  if (!PUBLIC.has(path)) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(readFileSync(join(ROOT, path.slice(1))));
}

const server = createServer({ key: readFileSync(join(ROOT, 'certs/server.key')), cert: readFileSync(join(ROOT, 'certs/server.crt')) }, handle);
// http://localhost is a secure context in every browser, so this Mac needs no certificate at all.
createHttpServer(handle).listen(8080, '127.0.0.1');

server.listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`Capture lab on this Mac: http://localhost:8080/   On phones: ${ips.map((ip) => `https://${ip}:${PORT}/`).join('  ')}`);
  console.log(`CA certificate for phones: ${ips.map((ip) => `http(s)://${ip}:${PORT}/ca.crt`).join('  ')}`);
});
