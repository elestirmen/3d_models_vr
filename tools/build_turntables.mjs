#!/usr/bin/env node
/**
 * Kart üzerine gelindiğinde oynayan kısa turntable döngüsü üretir.
 *
 * Posterlerle aynı koşumu (tools/poster-render.html) kullanır: aynı ışık,
 * aynı kadraj, yalnızca yatay açı adım adım döner. Çıktı alfa kanallı
 * VP9/WebM'dir; böylece kart arka planı temaya uyar.
 *
 * Çıktı: assets/posters/<id>.turntable.webm
 *
 * Kullanım:
 *   node tools/build_turntables.mjs                 # tüm modeller
 *   node tools/build_turntables.mjs kutuphane       # seçili modeller
 *   node tools/build_turntables.mjs --frames=36     # kare sayısı (varsayılan 40)
 *   node tools/build_turntables.mjs --crf=42        # kalite/boyut dengesi
 *
 * Gereksinimler: node >= 20, playwright (chromium), ffmpeg (libvpx-vp9).
 */

import { spawn, execFileSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const POSTER_DIR = path.join(ROOT, 'assets', 'posters');

/** Ham render: kırpma sonrası küçültüldüğü için çıktıdan büyük tutulur. */
const RENDER = { width: 900, height: 562 };
/** Çıktı: kart ~380 px genişlikte gösteriliyor, 512 px fazlasıyla yeterli (16/10). */
const OUTPUT = { width: 512, height: 320, margin: 0.045 };

const DEFAULTS = {
  tier: 'low',            // döngü küçük oynatıldığı için hafif kademe yeterli
  frames: '28',
  fps: '14',              // 28 kare / 14 fps = 2 sn döngü
  // Fotogrametri dokuları çok detaylı olduğu için alfa kanallı VP9 pahalı;
  // kart boyutunda (~380 px) crf 52 gözle ayırt edilmiyor ve dosyayı
  // ~210 KB'ta tutuyor (hover'da indirilir, ilk yüke girmez).
  crf: '52',
  exposure: '1',
  env: '/assets/env/campus-studio.hdr',
  orbitPhi: '62deg',
  radius: '80%',
  // Poster de 40deg açıdan üretiliyor; döngü aynı yerden başlayınca
  // kart üzerine gelindiğinde görüntü zıplamaz.
  startTheta: '40',
};

function parseArgs(argv) {
  const options = { ...DEFAULTS, ids: [] };
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const [key, value = ''] = arg.slice(2).split('=');
      options[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
    } else options.ids.push(arg);
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
  let document;
  try {
    document = JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));
  } catch {
    return String(model.model || '');
  }
  const tiers = Array.isArray(document.tiers) ? document.tiers : [];
  const match = tiers.find((t) => String(t?.id) === tier) || tiers[0];
  if (!match?.src) return String(model.model || '');
  return path.posix.join(path.posix.dirname(rel), String(match.src));
}

/**
 * Örnek karelerin BİRLEŞİK sınır kutusunu hesaplar.
 *
 * Model 360° dönerken izdüşüm genişliği değişir; tek kareye göre kırpmak
 * diğer açılarda modeli keser. Birleşik kutu, hiçbir açıda kırpılmayan en
 * küçük çerçeveyi verir ve posterdeki sıkı kadraja yaklaşır.
 */
function unionBoundingBox(framePaths) {
  const output = execFileSync(
    'magick',
    [...framePaths, '-alpha', 'set', '-trim', '-format', '%w %h %X %Y\n', 'info:'],
    { encoding: 'utf8' }
  ).trim().split('\n');

  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const line of output) {
    const [w, h, x, y] = line.trim().split(/\s+/).map((v) => Number.parseInt(v.replace('+', ''), 10));
    if (![w, h, x, y].every(Number.isFinite)) continue;
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + w);
    bottom = Math.max(bottom, y + h);
  }
  if (!Number.isFinite(left) || right <= left) return null;
  return { left, top, right, bottom };
}

/** Sınır kutusunu paylı ve 16/10 oranlı, kare içinde kalan bir kırpmaya çevirir. */
function cropRegion(box) {
  const aspect = OUTPUT.width / OUTPUT.height;
  const centerX = (box.left + box.right) / 2;
  const centerY = (box.top + box.bottom) / 2;
  const scale = 1 + OUTPUT.margin * 2;
  let width = (box.right - box.left) * scale;
  let height = (box.bottom - box.top) * scale;

  if (width / height < aspect) width = height * aspect;
  else height = width / aspect;

  width = Math.min(width, RENDER.width);
  height = Math.min(height, RENDER.height);
  if (width / height < aspect) width = height * aspect;
  else height = width / aspect;

  const even = (value) => Math.max(2, Math.round(value / 2) * 2);
  width = even(width);
  height = even(height);
  const x = even(Math.min(Math.max(0, centerX - width / 2), RENDER.width - width));
  const y = even(Math.min(Math.max(0, centerY - height / 2), RENDER.height - height));
  return { width, height, x, y };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const frameCount = Math.max(8, Number.parseInt(options.frames, 10) || 40);
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'models.json'), 'utf8'));
  const models = (manifest.models || []).filter(
    (m) => options.ids.length === 0 || options.ids.includes(String(m.id))
  );
  if (!models.length) {
    console.error('Eşleşen model yok.');
    process.exit(2);
  }

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error('HATA: playwright bulunamadı. cd tools && npm install');
    process.exit(1);
  }

  const port = 8000 + Math.floor(Math.random() * 900);
  const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  const browser = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--no-sandbox', '--force-color-profile=srgb'],
  });
  let failures = 0;

  try {
    await waitForPort(port);

    for (const model of models) {
      const id = String(model.id);
      const src = tierSource(model, options.tier);
      const framesDir = mkdtempSync(path.join(tmpdir(), `turntable-${id}-`));

      const page = await browser.newPage({
        viewport: { width: RENDER.width, height: RENDER.height },
        deviceScaleFactor: 1,
      });
      const query = new URLSearchParams({
        src: `/${src}`,
        orbit: `0deg ${options.orbitPhi} ${options.radius}`,
        exposure: options.exposure,
        env: options.env,
        alt: `${model.title} turntable`,
      });
      await page.goto(`http://127.0.0.1:${port}/tools/poster-render.html?${query}`, {
        waitUntil: 'load',
        timeout: 120000,
      });
      const state = await page
        .waitForFunction(() => (window.__posterState === 'loading' ? null : window.__posterState), null, { timeout: 180000 })
        .then((handle) => handle.jsonValue())
        .catch(() => 'timeout');

      if (state !== 'ready') {
        console.error(`  ! ${id}: model yüklenemedi (${state})`);
        await page.close();
        rmSync(framesDir, { recursive: true, force: true });
        failures += 1;
        continue;
      }
      await page.waitForTimeout(1200);

      for (let index = 0; index < frameCount; index += 1) {
        const theta = (Number(options.startTheta) || 0) + (360 / frameCount) * index;
        await page.evaluate(({ theta, phi, radius }) => {
          const mv = document.getElementById('mv');
          mv.setAttribute('camera-orbit', `${theta}deg ${phi} ${radius}`);
          if (typeof mv.jumpCameraToGoal === 'function') mv.jumpCameraToGoal();
        }, { theta, phi: options.orbitPhi, radius: options.radius });
        // Kameranın hedefe oturması ve karenin çizilmesi beklenir.
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const buffer = await page.locator('#mv').screenshot({ omitBackground: true, timeout: 30000 });
        writeFileSync(path.join(framesDir, `f${String(index).padStart(3, '0')}.png`), buffer);
      }
      await page.close();

      // Kadraj: posterdeki sıkı çerçeveye yaklaşmak için birleşik sınır
      // kutusundan kırpılır (her 4. kare örneklenir).
      const samples = [];
      for (let index = 0; index < frameCount; index += 4) {
        samples.push(path.join(framesDir, `f${String(index).padStart(3, '0')}.png`));
      }
      const box = unionBoundingBox(samples);
      if (!box) {
        console.error(`  ! ${id}: boş kareler`);
        rmSync(framesDir, { recursive: true, force: true });
        failures += 1;
        continue;
      }
      const crop = cropRegion(box);

      const output = path.join(POSTER_DIR, `${id}.turntable.webm`);
      execFileSync('ffmpeg', [
        '-y', '-loglevel', 'error',
        '-framerate', options.fps,
        '-i', path.join(framesDir, 'f%03d.png'),
        '-vf', `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},` +
               `scale=${OUTPUT.width}:${OUTPUT.height}:flags=lanczos`,
        '-c:v', 'libvpx-vp9',
        '-pix_fmt', 'yuva420p',   // alfa kanalı korunur
        '-b:v', '0', '-crf', options.crf,
        '-row-mt', '1', '-cpu-used', '2',
        '-an', output,
      ]);
      rmSync(framesDir, { recursive: true, force: true });

      const kilobytes = Math.round(statSync(output).size / 1024);
      console.log(
        `  ✓ ${id}: ${path.basename(output)} ${kilobytes} KB ` +
        `(${frameCount} kare, kırpma ${crop.width}x${crop.height})`
      );
      if (kilobytes > 260) {
        console.log(`      ! hedef 260 KB üstünde: --crf değerini artırmayı deneyin`);
      }
    }
  } finally {
    await browser.close();
    server.kill();
  }

  if (failures) {
    console.error(`\n${failures} model üretilemedi.`);
    process.exit(1);
  }
  console.log('\nTamamlandı. Sonraki adım: python3 tools/build_site.py');
}

await main();
