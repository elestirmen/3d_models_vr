#!/usr/bin/env node
/**
 * Duman testi — kritik akışları gerçek tarayıcıda doğrular.
 *
 * Bu testler rastgele seçilmedi: her biri bu projede CANLIYA ÇIKMIŞ bir
 * regresyonu yakalar.
 *   1. Kapalı `<dialog>`'lar gizli mi?  (yazar stili UA'nın display:none'unu
 *      ezmişti; paneller kapalıyken de görünüyordu)
 *   2. "Diğer" menüsü tıklanabilir mi? (kontrol çubuğuna eklenen overflow
 *      yukarı açılan menüyü kırpıyordu; menü görünüyor ama tıklanamıyordu)
 *   3. Sürükledikten sonra harita işaretçisi tıklanabilir mi? (pointerdown'da
 *      setPointerCapture tıklamayı viewport'a yönlendiriyordu)
 *   4. Üçüncü taraf istek var mı?     (self-host regresyonu)
 *   5. CSP ihlali / konsol hatası var mı?
 *
 * Kullanım:
 *   node tools/smoke.mjs                      # yerel sunucu başlatır
 *   node tools/smoke.mjs --base=https://vr.perinet.org
 *   node tools/smoke.mjs --skip-model         # 3B yükleme adımını atla
 *
 * Model dosyaları Git LFS'te tutulduğu için CI'da işaretçi (pointer) olarak
 * gelebilir; bu durumda 3B yükleme adımı otomatik atlanır ve test yine de
 * arayüz regresyonlarını yakalar.
 */

import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');

/** Galeri ilk yükünde aktarılan bayt bütçesi (plan §5.4).
 *  Ölçüm (5 Eylül 2026): masaüstü 354 KB (load) / 405 KB (2 sn), mobil 384 KB.
 *  responsive srcset öncesi 773 KB idi. 450 KB, bu değerlerin üstünde makul
 *  bir tavan: aşılırsa poster/font boyutlarında bir gerileme var demektir. */
const GALLERY_TRANSFER_BUDGET = 450 * 1024;

const options = { base: '', skipModel: false, model: 'fabrika' };
for (const arg of process.argv.slice(2)) {
  if (arg === '--skip-model') options.skipModel = true;
  else if (arg.startsWith('--')) {
    const [key, value = ''] = arg.slice(2).split('=');
    options[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
  }
}

const results = [];
let failures = 0;

function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  if (!passed) failures += 1;
  const mark = passed ? '✓' : '✗';
  console.log(`  ${mark} ${name}${detail ? `  — ${detail}` : ''}`);
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

/** Git LFS işaretçi dosyası mı (CI'da modeller indirilmemiş olabilir). */
function isLfsPointer(file) {
  if (!existsSync(file)) return true;
  try {
    return readFileSync(file, { encoding: 'utf8', flag: 'r' })
      .slice(0, 60)
      .startsWith('version https://git-lfs');
  } catch {
    return false;
  }
}

async function main() {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'models.json'), 'utf8'));
  const models = manifest.models || [];
  const target = models.find((m) => String(m.id) === options.model) || models[0];
  const placedCount = models.filter((m) => m?.map).length;

  let server = null;
  let base = options.base;
  const port = 8000 + Math.floor(Math.random() * 900);
  if (!base) {
    server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'],
      { cwd: ROOT, stdio: 'ignore' });
    base = `http://127.0.0.1:${port}`;
  }

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error('HATA: playwright bulunamadı. cd tools && npm install && npx playwright install chromium');
    process.exit(1);
  }

  const browser = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--no-sandbox'],
  });

  try {
    if (server) await waitForPort(port);
    const origin = new URL(base).origin;

    // Model dosyası Git LFS işaretçisiyse (CI) sayfa yine açılır — kapalı
    // dialog ve menü tıklanabilirliği CSS/yerleşim kontrolleridir ve model
    // olmadan da geçerlidir. Bu durumda YALNIZCA model yükleme hataları
    // beklenen sayılır; diğer her hata yine testi kırar.
    const modelReady = !options.skipModel
      && !isLfsPointer(path.join(ROOT, String(target.model)));
    const expectedModelError = (tag, text) => !modelReady
      && tag === 'görüntüleyici'
      && /Model-Viewer error|Failed to load resource|Unexpected token|Could not load|GLTF|glb/i.test(text);

    const problems = { errors: [], csp: [], thirdParty: new Set(), failed: [] };
    const watch = (page, tag) => {
      page.on('console', (message) => {
        const text = message.text();
        // python -m http.server POST desteklemez; ölçüm beacon'u (sendBeacon
        // → POST /e) yerelde 501 döner. Üretimde nginx 204 döndürüyor ve bu
        // ayrıca tools/report_events.py ile doğrulanıyor.
        // Adres konsol metninde değil, message.location() içinde bulunur.
        const source = message.location?.()?.url ?? '';
        const localBeacon = /\/e\?/.test(source) && /501|Unsupported method/.test(text);
        if (message.type() === 'error' && !localBeacon && !expectedModelError(tag, text)) {
          problems.errors.push(`${tag}: ${text}`);
        }
        if (/Content Security Policy|Refused to/i.test(text)) problems.csp.push(`${tag}: ${text}`);
      });
      page.on('pageerror', (error) => {
        if (!expectedModelError(tag, error.message)) problems.errors.push(`${tag}: ${error.message}`);
      });
      page.on('requestfailed', (request) => {
        // İptal edilen video/prefetch istekleri gürültü sayılmaz.
        const type = request.resourceType();
        if (type === 'media' || type === 'other') return;
        problems.failed.push(`${tag}: ${request.url().slice(0, 90)} (${request.failure()?.errorText})`);
      });
      page.on('request', (request) => {
        const url = request.url();
        if (!url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:')) {
          problems.thirdParty.add(new URL(url).origin);
        }
      });
    };

    /* ---------------- Galeri ---------------- */
    console.log('\nGaleri');
    const gallery = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    watch(gallery, 'galeri');
    let transferred = 0;
    gallery.on('response', async (response) => {
      try {
        const length = Number((await response.allHeaders())['content-length']);
        if (Number.isFinite(length)) transferred += length;
      } catch { /* yanıt kapanmış olabilir */ }
    });
    await gallery.goto(`${base}/`, { waitUntil: 'load', timeout: 60000 });
    await gallery.waitForTimeout(1500);
    const galleryState = await gallery.evaluate(() => {
      const card = document.querySelector('.card');
      const image = card?.querySelector('.thumb');
      return {
        cards: document.querySelectorAll('.card').length,
        firstHref: card?.getAttribute('href'),
        posterLoaded: (image?.naturalWidth ?? 0) > 0,
        lqip: getComputedStyle(card?.querySelector('.card-media')).backgroundImage.startsWith('url("data:'),
        arBadge: card?.querySelector('[data-ar-badge]')?.dataset.arState ?? null,
        font: getComputedStyle(document.body).fontFamily.split(',')[0].replace(/"/g, ''),
      };
    });
    check('galeri kart sayısı manifestle uyuşuyor', galleryState.cards === models.length,
      `${galleryState.cards}/${models.length}`);
    check('kart kısa adrese bağlanıyor', /viewer\.html\?id=/.test(galleryState.firstHref || ''),
      galleryState.firstHref);
    check('poster yüklendi', galleryState.posterLoaded);
    check('LQIP arka planı var', galleryState.lqip);
    check('AR rozeti cihaz yeteneğine göre ayarlandı', Boolean(galleryState.arBadge),
      galleryState.arBadge || 'ayarlanmadı');
    check('Inter fontu uygulanmış', galleryState.font === 'Inter', galleryState.font);
    check(`galeri aktarımı bütçe içinde (${Math.round(GALLERY_TRANSFER_BUDGET / 1024)} KB)`,
      transferred <= GALLERY_TRANSFER_BUDGET, `${Math.round(transferred / 1024)} KB`);

    /* ---------------- Tanıtım sayfası ---------------- */
    console.log('\nBina tanıtım sayfası');
    const landing = await browser.newPage();
    watch(landing, 'tanıtım');
    await landing.goto(`${base}/${target.id}/`, { waitUntil: 'load', timeout: 60000 });
    const landingState = await landing.evaluate(() => {
      const raw = document.querySelector('script[type="application/ld+json"]')?.textContent || '';
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch { /* geçersiz */ }
      return {
        h1: document.querySelector('h1')?.textContent?.trim(),
        ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute('content'),
        canonical: document.querySelector('link[rel=canonical]')?.getAttribute('href'),
        types: parsed?.['@graph']?.map((node) => node['@type']) ?? null,
        viewerLink: document.querySelector('.action-primary')?.getAttribute('href'),
      };
    });
    check('tanıtım sayfası başlığı var', Boolean(landingState.h1), landingState.h1);
    check('modele özel og:image', /posters\//.test(landingState.ogImage || ''));
    check('canonical adres var', Boolean(landingState.canonical));
    check('JSON-LD geçerli (Place + BreadcrumbList)',
      Array.isArray(landingState.types) && landingState.types.includes('Place'),
      (landingState.types || []).join(', '));
    check('görüntüleyiciye bağlanıyor', /viewer\.html\?id=/.test(landingState.viewerLink || ''));

    /* ---------------- Harita ---------------- */
    console.log('\nKampüs haritası');
    const map = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    watch(map, 'harita');
    await map.goto(`${base}/map.html`, { waitUntil: 'load', timeout: 60000 });
    await map.waitForTimeout(1800);
    const markerCount = await map.evaluate(() => document.querySelectorAll('.marker').length);
    check('işaretçi sayısı manifestle uyuşuyor', markerCount === placedCount,
      `${markerCount}/${placedCount}`);

    // REGRESYON: sürükleme sonrası işaretçi tıklanabilir kalmalı.
    // Zum YAPILMAZ: işaretçi görünür alanda kalmalı ki tıklama denenebilsin.
    // Sürükleme boş bir alanda yapılır; amaç pointer olaylarını tetiklemek.
    await map.mouse.move(300, 300);
    await map.mouse.down();
    await map.mouse.move(360, 340, { steps: 6 });
    await map.mouse.up();
    await map.waitForTimeout(300);

    const firstMarker = await map.evaluate(() => document.querySelector('.marker')?.dataset.id);
    let clickError = '';
    await map.click(`.marker[data-id="${firstMarker}"]`, { timeout: 15000 })
      .catch((error) => { clickError = error.message.split('\n')[0]; });
    await map.waitForTimeout(400);
    const panelOpen = await map.evaluate(() =>
      !document.querySelector('#mapPanel').classList.contains('is-hidden'));
    check('REGRESYON: sürüklemeden sonra işaretçi tıklanıyor', panelOpen, clickError);

    /* ---------------- Görüntüleyici ---------------- */
    console.log('\nGörüntüleyici');
    const viewer = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    watch(viewer, 'görüntüleyici');
    await viewer.goto(`${base}/viewer.html?id=${target.id}`, { waitUntil: 'load', timeout: 60000 });
    await viewer.waitForTimeout(1200);

    // REGRESYON: kapalı dialog'lar gerçekten gizli olmalı
    const dialogs = await viewer.evaluate(() => ({
      info: getComputedStyle(document.querySelector('#infoPanel')).display,
      help: getComputedStyle(document.querySelector('#helpPanel')).display,
    }));
    check('REGRESYON: kapalı bilgi paneli gizli', dialogs.info === 'none', dialogs.info);
    check('REGRESYON: kapalı yardım paneli gizli', dialogs.help === 'none', dialogs.help);

    // REGRESYON: "Diğer" menüsündeki düğmeler tıklanabilir olmalı
    await viewer.evaluate(() => { document.querySelector('#moreControls').open = true; });
    await viewer.waitForTimeout(250);
    const hitTest = await viewer.evaluate(() => {
      const button = document.querySelector('#measure');
      const rect = button.getBoundingClientRect();
      const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return { inside: button.contains(top), tag: top?.tagName ?? null };
    });
    check('REGRESYON: "Diğer" menüsü tıklanabilir', hitTest.inside, hitTest.tag);

    if (modelReady) {
      const loaded = await viewer.evaluate(() => new Promise((resolve) => {
        const mv = document.querySelector('#mv');
        if (mv.loaded) return resolve(true);
        const timer = setTimeout(() => resolve(false), 120000);
        mv.addEventListener('load', () => { clearTimeout(timer); resolve(true); }, { once: true });
        mv.addEventListener('error', () => { clearTimeout(timer); resolve(false); }, { once: true });
      }));
      check('3B model yüklendi', loaded, target.id);

      if (loaded) {
        const before = await viewer.evaluate(() => document.querySelector('#mv').getCameraOrbit().phi);
        await viewer.keyboard.press('3');
        await viewer.waitForTimeout(1200);
        const after = await viewer.evaluate(() => ({
          phi: document.querySelector('#mv').getCameraOrbit().phi,
          active: document.querySelector('#cameraPresets .preset.is-active')?.dataset.preset,
        }));
        check('kamera preseti uygulanıyor', Math.abs(after.phi - before) > 0.05 && after.active === 'aerial',
          `phi ${before.toFixed(2)} → ${after.phi.toFixed(2)}`);
      }
    } else {
      console.log('  · 3B yükleme atlandı (model Git LFS işaretçisi veya --skip-model)');
    }

    /* ---------------- Genel sağlık ---------------- */
    console.log('\nGenel');
    check('üçüncü taraf istek yok', problems.thirdParty.size === 0,
      [...problems.thirdParty].join(', '));
    check('CSP ihlali yok', problems.csp.length === 0, problems.csp[0] || '');
    check('başarısız istek yok', problems.failed.length === 0, problems.failed[0] || '');
    check('konsol hatası yok', problems.errors.length === 0, problems.errors[0] || '');
  } finally {
    await browser.close();
    server?.kill();
  }

  console.log(`\n${results.length - failures}/${results.length} kontrol geçti.`);
  if (failures) {
    console.error(`\n${failures} kontrol BAŞARISIZ.`);
    process.exit(1);
  }
}

await main();
