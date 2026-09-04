#!/usr/bin/env node
/**
 * Poster üretimi — models.json'daki her model için standart kadraj ve ışıkla
 * saydam zeminli önizleme görseli üretir.
 *
 * Neden tarayıcı? Blender/headless GL zinciri yerine sitenin KENDİ renderer'ı
 * (model-viewer + three.js) kullanılır: poster ile görüntüleyicideki görünüm
 * arasında ışık/ton/doku farkı oluşmaz ve yeni bir bağımlılık gerekmez.
 *
 * Çıktılar:
 *   assets/posters/<id>.webp   — 1600x1000, alfa kanallı (kart aspect'i 16/10)
 *   assets/posters/<id>.avif   — aynı görsel, AVIF
 *   assets/posters.lqip.css    — kartlar için gömülü bulanık önizleme (LQIP)
 *
 * Kullanım:
 *   node tools/build_posters.mjs                # tüm modeller
 *   node tools/build_posters.mjs kutuphane ...  # seçili modeller
 *   node tools/build_posters.mjs --tier=high    # kademe (varsayılan: medium)
 *   node tools/build_posters.mjs --keep-raw     # ham PNG'leri sakla (hata ayıklama)
 *
 * Gereksinimler: node >= 20, playwright (chromium), ImageMagick 7 (magick).
 */

import { spawn, execFileSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const POSTER_DIR = path.join(ROOT, 'assets', 'posters');

/** Kart medyası 16/10 olduğu için poster de 16/10 üretilir (letterbox olmaz). */
const HERO = { width: 1600, height: 1000, margin: 0.045 };
/** Ham render çözünürlüğü: kırpma sonrası küçültme yapıldığı için yüksek tutulur. */
const RAW = { width: 2400, height: 1500 };
/** Kadraj denemeleri: model kareye taşarsa bir sonraki (daha uzak) değere geçilir. */
const RADIUS_STEPS = ['68%', '80%', '92%', 'auto'];

const DEFAULTS = {
  tier: 'medium',
  exposure: '1',
  env: '/assets/env/campus-studio.hdr',
  orbitTheta: '40deg',
  orbitPhi: '62deg',
  webpQuality: '80',
  avifQuality: '48',
};

function parseArgs(argv) {
  const options = { ...DEFAULTS, ids: [], keepRaw: false };
  for (const arg of argv) {
    if (arg === '--keep-raw') options.keepRaw = true;
    else if (arg.startsWith('--')) {
      const [key, value = ''] = arg.slice(2).split('=');
      const camel = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      options[camel] = value;
    } else options.ids.push(arg);
  }
  return options;
}

function magick(args) {
  return execFileSync('magick', args, { encoding: 'buffer', maxBuffer: 1024 * 1024 * 256 });
}

function magickText(args) {
  return execFileSync('magick', args, { encoding: 'utf8' }).trim();
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

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    console.error(
      'HATA: playwright bulunamadı.\n' +
      '  cd tools && npm install\n' +
      '  npx playwright install chromium'
    );
    process.exit(1);
  }
}

/** geometry-lod manifestinden istenen kademenin yolunu çözer. */
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
  return path.posix.join(path.posix.dirname(rel.split(path.sep).join('/')), String(match.src));
}

/** Kırpılmış içerik kare kenarına dayanıyorsa model taşmış demektir. */
function touchesEdge(rawPath) {
  const info = magickText(['convert', rawPath, '-alpha', 'set', '-trim', '-format', '%w %h %X %Y', 'info:']);
  const [w, h, x, y] = info.split(/\s+/).map((v) => Number.parseInt(v.replace('+', ''), 10));
  if (![w, h, x, y].every(Number.isFinite)) return { clipped: false, box: null };
  const clipped = x <= 1 || y <= 1 || x + w >= RAW.width - 1 || y + h >= RAW.height - 1;
  return { clipped, box: { w, h, x, y } };
}

function buildHero(rawPath, outWebp, outAvif, options) {
  const boxWidth = Math.round(HERO.width * (1 - options.marginFactor));
  const boxHeight = Math.round(HERO.height * (1 - options.marginFactor));
  const common = [
    rawPath,
    '-alpha', 'set',
    '-trim', '+repage',
    '-resize', `${boxWidth}x${boxHeight}`,
    '-background', 'none',
    '-gravity', 'center',
    '-extent', `${HERO.width}x${HERO.height}`,
  ];
  magick([...common, '-quality', options.webpQuality, '-define', 'webp:method=6', outWebp]);
  magick([...common, '-quality', options.avifQuality, outAvif]);
}

function buildLqip(sourceWebp) {
  const tmp = path.join(mkdtempSync(path.join(tmpdir(), 'lqip-')), 'lqip.webp');
  magick([sourceWebp, '-alpha', 'set', '-resize', '28x', '-blur', '0x1.2', '-quality', '42', tmp]);
  const base64 = readFileSync(tmp).toString('base64');
  rmSync(path.dirname(tmp), { recursive: true, force: true });
  return `data:image/webp;base64,${base64}`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'models.json'), 'utf8'));
  const models = (manifest.models || []).filter(
    (m) => options.ids.length === 0 || options.ids.includes(String(m.id))
  );
  if (!models.length) {
    console.error('Eşleşen model yok.');
    process.exit(2);
  }

  const { chromium } = await loadPlaywright();
  const port = 8000 + Math.floor(Math.random() * 900);
  const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  const rawDir = mkdtempSync(path.join(tmpdir(), 'poster-raw-'));
  const browser = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--no-sandbox', '--force-color-profile=srgb'],
  });

  const lqip = {};
  let failures = 0;

  try {
    await waitForPort(port);
    mkdirSync(POSTER_DIR, { recursive: true });

    for (const model of models) {
      const id = String(model.id);
      const src = tierSource(model, options.tier);
      const rawPath = path.join(rawDir, `${id}.png`);
      let rendered = false;

      for (const radius of RADIUS_STEPS) {
        const page = await browser.newPage({
          viewport: { width: RAW.width, height: RAW.height },
          deviceScaleFactor: 1,
        });
        const query = new URLSearchParams({
          // Koşum sayfası /tools/ altında olduğu için model yolu kök-göreli verilir.
          src: `/${src}`,
          orbit: `${options.orbitTheta} ${options.orbitPhi} ${radius}`,
          exposure: options.exposure,
          env: options.env,
          alt: `${model.title} poster`,
        });
        const pageErrors = [];
        page.on('console', (message) => {
          if (message.type() === 'error') pageErrors.push(message.text().slice(0, 160));
        });
        page.on('requestfailed', (request) => {
          pageErrors.push(`istek başarısız: ${request.url().slice(0, 120)}`);
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
          await page.close();
          console.error(`  ! ${id}: model yüklenemedi (${state}) — kaynak: /${src}`);
          for (const line of pageErrors.slice(0, 4)) console.error(`      ${line}`);
          break;
        }

        // Doku çözme ve ilk karelerin oturması için kısa bekleme.
        await page.waitForTimeout(1500);
        const buffer = await page.locator('#mv').screenshot({ omitBackground: true, timeout: 60000 });
        writeFileSync(rawPath, buffer);
        await page.close();

        const { clipped, box } = touchesEdge(rawPath);
        if (!box) {
          console.error(`  ! ${id}: boş render`);
          break;
        }
        if (clipped && radius !== RADIUS_STEPS[RADIUS_STEPS.length - 1]) {
          console.log(`  · ${id}: ${radius} kadrajında taşma, daha uzak deneniyor`);
          continue;
        }
        rendered = true;
        console.log(
          `  · ${id}: ${radius} kadraj, içerik ${box.w}x${box.h}px${clipped ? ' (kenara dayanıyor)' : ''}`
        );
        break;
      }

      if (!rendered) {
        failures += 1;
        continue;
      }

      const outWebp = path.join(POSTER_DIR, `${id}.webp`);
      const outAvif = path.join(POSTER_DIR, `${id}.avif`);
      buildHero(rawPath, outWebp, outAvif, {
        marginFactor: HERO.margin * 2,
        webpQuality: options.webpQuality,
        avifQuality: options.avifQuality,
      });
      lqip[id] = buildLqip(outWebp);

      const sizes = [outWebp, outAvif].map((file) => {
        const bytes = magickText(['identify', '-format', '%b', file]);
        return `${path.basename(file)} ${bytes}`;
      });
      console.log(`  ✓ ${id}: ${sizes.join(' · ')}`);

      if (options.keepRaw) {
        writeFileSync(path.join(POSTER_DIR, `${id}.raw.png`), readFileSync(rawPath));
      }
    }

    // LQIP: CSP 'style-src self' altında satır içi style özniteliği kullanılamaz,
    // bu yüzden aynı kökenli bir stil dosyası üretilir.
    const rules = Object.entries(lqip)
      .map(([id, uri]) => `.card[data-id="${id}"] .card-media { background-image: url("${uri}"); }`)
      .join('\n');
    if (rules) {
      writeFileSync(
        path.join(ROOT, 'assets', 'posters.lqip.css'),
        '/* Auto-generated by tools/build_posters.mjs. Do not edit by hand. */\n' +
        '/* Poster yüklenene kadar kart medyasında gösterilen bulanık önizleme. */\n' +
        rules + '\n',
        'utf8'
      );
      console.log(`\nassets/posters.lqip.css güncellendi (${Object.keys(lqip).length} model)`);
    }
  } finally {
    await browser.close();
    server.kill();
    if (!options.keepRaw) rmSync(rawDir, { recursive: true, force: true });
  }

  if (failures) {
    console.error(`\n${failures} model üretilemedi.`);
    process.exit(1);
  }
  console.log('\nTamamlandı. Sonraki adım: python3 tools/build_site.py');
}

await main();
