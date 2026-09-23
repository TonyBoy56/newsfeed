#!/usr/bin/env node
// Tiny zero-dependency static server for running the reader locally.
//
//   npm start            → http://localhost:4173
//   PORT=8080 npm start
//
// It only listens on 127.0.0.1, so nothing else on your network can reach it.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'site');
const PORT = Number(process.env.PORT) || 4173;
const HOST = '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

// The same protections the page declares in its <meta> CSP, sent as real
// headers here (GitHub Pages can't set custom headers, so there we rely on
// the <meta> tag).
const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
    "connect-src 'self' https://*.supabase.co https://api.pwnedpasswords.com; " +
    "manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; " +
    "require-trusted-types-for 'script'; trusted-types 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    const { pathname } = new URL(req.url, `http://${HOST}`);
    let rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
    let file = join(ROOT, rel);

    // Path traversal guard: the resolved path must stay inside site/.
    if (file !== ROOT && !file.startsWith(ROOT + sep)) {
      res.writeHead(403, SECURITY_HEADERS).end('Forbidden');
      return;
    }
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');

    const body = await readFile(file);
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain' }).end('Not found');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Newsfeed running at http://localhost:${PORT}  (Ctrl+C to stop)`);
});
