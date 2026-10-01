/**
 * Araçlar ve duman testi için küçük statik sunucu.
 *
 * - İşletim sisteminin verdiği boş bir portu kullanır (port 0). Eski araçlar
 *   8000–8899 arasında rastgele port seçiyordu; bu sunucuda 8096 (Jellyfin) ve
 *   8123 (Home Assistant) gibi canlı servislere denk gelebiliyordu.
 * - Üretimdeki nginx gibi `POST /e` (kullanım ölçümü) isteğine 204 döner.
 * - Dizin isteklerinde index.html verir; kök dışına çıkan yolları reddeder.
 */
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.ktx2': 'image/ktx2',
  '.usdz': 'model/vnd.usdz+zip',
  '.hdr': 'image/vnd.radiance',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

export async function startServer(root, { log = false } = {}) {
  const base = path.resolve(root);
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/e') {
      response.writeHead(204, { 'Cache-Control': 'no-store' });
      response.end();
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405).end();
      return;
    }
    let file = path.join(base, decodeURIComponent(url.pathname));
    if (!file.startsWith(base)) {
      response.writeHead(403).end();
      return;
    }
    try {
      let stat = statSync(file);
      if (stat.isDirectory()) {
        file = path.join(file, 'index.html');
        stat = statSync(file);
      }
      response.writeHead(200, {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': stat.size,
        'Cache-Control': 'no-cache',
      });
      if (request.method === 'HEAD') response.end();
      else createReadStream(file).pipe(response);
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
    }
    if (log) console.log(request.method, url.pathname);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    port,
    close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }),
  };
}
