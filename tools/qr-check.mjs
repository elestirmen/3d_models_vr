#!/usr/bin/env node
/**
 * QR üreticisinin bağımsız doğrulaması.
 *
 * assets/js/viewer/qr.js tarayıcı modülüdür; burada kaynak doğrudan içe
 * aktarılır, üretilen modül matrisi piksellere dökülür ve bağımsız bir
 * çözücüyle (jsQR) okunur. Farklı uzunluk, sürüm ve hata düzeltme
 * düzeylerinde metnin birebir geri okunması beklenir.
 *
 * Kullanım: node tools/qr-check.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import jsQR from 'jsqr';

const ROOT = path.resolve(import.meta.dirname, '..');
const source = readFileSync(path.join(ROOT, 'assets/js/viewer/qr.js'), 'utf8');
const { encodeQr } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function rasterize({ size, modules }, scale = 4, border = 4) {
  const width = (size + border * 2) * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!modules[y][x]) continue;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const offset = (((y + border) * scale + dy) * width + (x + border) * scale + dx) * 4;
          data[offset] = data[offset + 1] = data[offset + 2] = 0;
        }
      }
    }
  }
  return { data, width };
}

const samples = [
  'https://vr.perinet.org/',
  'https://vr.perinet.org/viewer.html?id=kutuphane',
  'https://vr.perinet.org/en/viewer.html?id=oku_genel_plan&orbit=0.9599310885968813rad+1.1344640137963142rad+87.3219m&target=-12.004m+3.551m+20.88m&quality=high',
  'Türkçe karakterler: çğıöşü ÇĞİÖŞÜ — 3B',
  'x'.repeat(300),
  'A',
];
let failures = 0;
for (const text of samples) {
  for (const ecc of ['L', 'M', 'Q', 'H']) {
    let encoded;
    try {
      encoded = encodeQr(text, { ecc });
    } catch (error) {
      console.log(`  ✗ ${ecc} ${text.slice(0, 40)} — ${error.message}`);
      failures += 1;
      continue;
    }
    const { data, width } = rasterize(encoded);
    const result = jsQR(data, width, width);
    const ok = result?.data === text;
    if (!ok) failures += 1;
    console.log(`  ${ok ? '✓' : '✗'} v${String(encoded.version).padStart(2)} ${encoded.ecc} mask ${encoded.mask}  ${text.length} kr  ${text.slice(0, 48)}`);
  }
}
// Sürüm 1–40 yapısal tarama: her sürümü zorlayan uzunlukta metin.
for (let version = 1; version <= 40; version += 3) {
  const text = 'q'.repeat(Math.max(1, Math.floor(version * version * 1.6)));
  try {
    const encoded = encodeQr(text, { ecc: 'L' });
    const { data, width } = rasterize(encoded, 3, 4);
    const ok = jsQR(data, width, width)?.data === text;
    if (!ok) failures += 1;
    console.log(`  ${ok ? '✓' : '✗'} yapısal v${encoded.version} (${text.length} bayt)`);
  } catch (error) {
    if (!/çok uzun/.test(error.message)) { failures += 1; console.log(`  ✗ yapısal ${version}: ${error.message}`); }
  }
}
console.log(failures ? `\n${failures} QR denetimi BAŞARISIZ` : '\nQR üreticisi: bütün örnekler bağımsız çözücüyle doğrulandı');
process.exit(failures ? 1 : 0);
