#!/usr/bin/env node
/**
 * Kampüs haritası taban görselini üretir.
 *
 * Harita çizilmez: yerleşke genel planı modelinin TEPEDEN render'ı alınır,
 * yani taban görsel gerçek taramadan gelir. İşaretçiler bu görselin
 * normalize koordinatlarında (0–1) saklanır, böylece görsel yeniden
 * üretilse bile işaretçiler yerinde kalır (kadraj değişmediği sürece).
 *
 * Çıktı:
 *   assets/map/campus-plan.webp   — taban görsel (alfa kanallı)
 *   assets/map/campus-plan.avif
 *   assets/map/campus-plan.json   — kadraj künyesi (kaynak, açı, kırpma)
 *
 * Kullanım:
 *   node tools/build_map.mjs
 *   node tools/build_map.mjs --model=oku_genel_plan --tier=high --width=2800
 *   node tools/build_map.mjs --phi=8deg           # hafif eğik plan görünümü
 *
 * Gereksinimler: node >= 20, playwright (chromium), ImageMagick 7.
 */

import { spawn, execFileSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'map');

const DEFAULTS = {
  model: 'oku_genel_plan',
  tier: 'high',
  // Tam tepeden (0deg) bakışta çatılar düzleşip okunmaz oluyor; 6 derece
  // eğim binaların yüksekliğini hissettiriyor ama plan okunabilirliğini
  // bozmuyor.
  phi: '6deg',
  theta: '0deg',
  radius: '92%',
  exposure: '1.05',
  env: '/assets/env/campus-studio.hdr',
  width: '2600',
  quality: '82',
  avifQuality: '52',
  name: 'campus-plan',
};

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, value = ''] = arg.slice(2).split('=');
    options[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
  }
  return options;
}

async function waitForPort(port, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const ok = await new Promise((resolve) => {
      const socket = createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => { socket.destroy(); resolve(false); });
    });
    if (ok) return;
    if (Date.now() > deadline) throw new Error(`yerel sunucu ${port} portunda açılmadı`);
    await new Promise((r) => setTimeout(r, 120));
  }
}

function tierSource(model, tier) {
  const rel = String(model.geometryLod || '').trim();
  if (!rel) return String(model.model || '');
  const document = JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));
  const tiers = Array.isArray(document.tiers) ? document.tiers : [];
  const match = tiers.find((t) => String(t?.id) === tier) || tiers[tiers.length - 1];
  return path.posix.join(path.posix.dirname(rel), String(match.src));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'models.json'), 'utf8'));
  const model = (manifest.models || []).find((m) => String(m.id) === options.model);
  if (!model) {
    console.error(`Model bulunamadı: ${options.model}`);
    process.exit(2);
  }

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error('HATA: playwright bulunamadı. cd tools && npm install');
    process.exit(1);
  }

  const width = Math.max(800, Number.parseInt(options.width, 10) || 2600);
  const height = Math.round(width * 0.66);
  const src = tierSource(model, options.tier);
  const port = 8000 + Math.floor(Math.random() * 900);
  const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  const rawDir = mkdtempSync(path.join(tmpdir(), 'map-raw-'));
  const browser = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--no-sandbox', '--force-color-profile=srgb'],
  });

  try {
    await waitForPort(port);
    mkdirSync(OUT_DIR, { recursive: true });

    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const query = new URLSearchParams({
      src: `/${src}`,
      orbit: `${options.theta} ${options.phi} ${options.radius}`,
      exposure: options.exposure,
      env: options.env,
      alt: `${model.title} plan görünümü`,
    });
    console.log(`Render: ${model.title} · ${options.tier} kademe · ${width}x${height} · ${options.phi} eğim`);
    await page.goto(`http://127.0.0.1:${port}/tools/poster-render.html?${query}`, {
      waitUntil: 'load',
      timeout: 240000,
    });
    const state = await page
      .waitForFunction(() => (window.__posterState === 'loading' ? null : window.__posterState), null, { timeout: 600000 })
      .then((handle) => handle.jsonValue())
      .catch(() => 'timeout');
    if (state !== 'ready') {
      console.error(`Model yüklenemedi (${state}) — kaynak: /${src}`);
      process.exit(1);
    }
    await page.waitForTimeout(3000);
    const rawPath = path.join(rawDir, 'plan.png');
    writeFileSync(rawPath, await page.locator('#mv').screenshot({ omitBackground: true, timeout: 120000 }));
    await page.close();

    // Saydam kenarlar kırpılır: işaretçi koordinatları böylece doğrudan
    // planın kendisine göre normalize olur.
    const trimmed = path.join(rawDir, 'plan-trim.png');
    execFileSync('magick', [rawPath, '-alpha', 'set', '-trim', '+repage', trimmed]);
    const info = execFileSync('magick', ['identify', '-format', '%w %h', trimmed], { encoding: 'utf8' });
    const [trimWidth, trimHeight] = info.trim().split(/\s+/).map(Number);

    const webp = path.join(OUT_DIR, `${options.name}.webp`);
    const avif = path.join(OUT_DIR, `${options.name}.avif`);
    execFileSync('magick', [trimmed, '-quality', options.quality, '-define', 'webp:method=6', webp]);
    execFileSync('magick', [trimmed, '-quality', options.avifQuality, avif]);

    writeFileSync(
      path.join(OUT_DIR, `${options.name}.json`),
      JSON.stringify({
        generatedFrom: options.model,
        tier: options.tier,
        orbit: `${options.theta} ${options.phi} ${options.radius}`,
        exposure: options.exposure,
        renderSize: { width, height },
        imageSize: { width: trimWidth, height: trimHeight },
        note: 'İşaretçi koordinatları bu görselin 0–1 normalize uzayındadır. '
          + 'Kadraj (orbit/radius) değişirse işaretçiler yeniden yerleştirilmelidir.',
      }, null, 2) + '\n',
      'utf8'
    );

    for (const file of [webp, avif]) {
      console.log(`  ✓ ${path.relative(ROOT, file)} — ${trimWidth}x${trimHeight}, `
        + `${Math.round(statSync(file).size / 1024)} KB`);
    }
    console.log('\nSonraki adım: python3 tools/build_site.py');
  } finally {
    await browser.close();
    server.kill();
    rmSync(rawDir, { recursive: true, force: true });
  }
}

await main();
