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
      const media = card?.querySelector('.card-media');
      const ready = media.classList.contains('is-ready');
      const posterBackgroundCleared = getComputedStyle(media).backgroundImage === 'none';
      media.classList.remove('is-ready');
      const lqip = getComputedStyle(media).backgroundImage.startsWith('url("data:');
      if (ready) media.classList.add('is-ready');
      return {
        cards: document.querySelectorAll('.card').length,
        firstHref: card?.getAttribute('href'),
        posterLoaded: (image?.naturalWidth ?? 0) > 0,
        lqip, posterBackgroundCleared,
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
    check('poster yüklendiğinde bulanık önizleme kaldırılıyor', galleryState.posterBackgroundCleared);
    check('AR rozeti cihaz yeteneğine göre ayarlandı', Boolean(galleryState.arBadge),
      galleryState.arBadge || 'ayarlanmadı');
    check('Inter fontu uygulanmış', galleryState.font === 'Inter', galleryState.font);
    check(`galeri aktarımı bütçe içinde (${Math.round(GALLERY_TRANSFER_BUDGET / 1024)} KB)`,
      transferred <= GALLERY_TRANSFER_BUDGET, `${Math.round(transferred / 1024)} KB`);

    /* Discovery state is real navigation state, including browser Back. */
    await gallery.fill('#searchInput', 'KUTUPHANE');
    check('Türkçe karakter kullanmadan arama', await gallery.locator('.card:not(.is-hidden)').count() === 1
      && await gallery.locator('.card:not(.is-hidden)').getAttribute('data-id') === 'kutuphane');
    await gallery.fill('#searchInput', 'temel islam');
    check('birim adına göre çok sözcüklü arama', await gallery.locator('.card:not(.is-hidden)').count() === 1
      && await gallery.locator('.card:not(.is-hidden)').getAttribute('data-id') === 'ilahiyat');
    await gallery.fill('#searchInput', '');
    await gallery.click('.filters [data-category="egitim"]');
    check('kategori filtresi', await gallery.locator('.card:not(.is-hidden)').count() === models.filter(m => m.category === 'egitim').length);
    await gallery.fill('#searchInput', 'kutuphane');
    check('arama ve kategori birlikte çalışıyor', await gallery.locator('#empty').isVisible());
    await gallery.click('#resetFilters');
    check('boş sonuçtan tek tıkla kurtarma', await gallery.locator('.card:not(.is-hidden)').count() === models.length);
    await gallery.selectOption('#sortOrder', 'size');
    const sizes = await gallery.locator('.card').evaluateAll(cards => cards.map(card => Number(card.dataset.size)));
    check('indirme boyutuna göre sıralama', sizes.every((size, i) => !i || size >= sizes[i - 1]));
    await gallery.click('button[data-layout="list"]');
    await gallery.fill('#searchInput', 'rektorluk');
    await gallery.reload({ waitUntil: 'load' });
    check('paylaşılan bağlantıda arama, sıralama ve görünüm korunuyor',
      await gallery.inputValue('#searchInput') === 'rektorluk' && await gallery.inputValue('#sortOrder') === 'size'
      && await gallery.locator('#grid').getAttribute('data-layout') === 'list'
      && await gallery.locator('.card:not(.is-hidden)').count() === 1);
    await gallery.click('button[data-layout="grid"]');
    await gallery.goBack();
    check('tarayıcı geri tuşu görünümü geri getiriyor', await gallery.locator('#grid').getAttribute('data-layout') === 'list');
    await gallery.goto(`${base}/`);
    await gallery.click('#themeToggle');
    const chosenTheme = await gallery.locator('html').getAttribute('data-theme');
    await gallery.reload({ waitUntil: 'load' });
    check('tema tercihi yeniden açılışta korunuyor', await gallery.locator('html').getAttribute('data-theme') === chosenTheme);
    for (const width of [320, 390, 768, 1280]) {
      await gallery.setViewportSize({ width, height: 900 });
      await gallery.evaluate(() => document.fonts.ready);
      const dimensions = await gallery.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth,
        wide: [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 5).map(el => el.className) }));
      check(`${width}px görünümde yatay taşma yok`, dimensions.content <= dimensions.viewport, JSON.stringify(dimensions));
    }

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

    await map.selectOption('#mapBuilding', 'kutuphane');
    check('listeden bina seçimi haritayı ve bağlantıyı güncelliyor',
      new URL(map.url()).searchParams.get('focus') === 'kutuphane'
      && await map.locator('#mapPanel h2').textContent() === 'Kütüphane');
    await map.keyboard.press('Escape');
    check('harita paneli Escape ile kapanıp odağı işaretçiye döndürüyor',
      !await map.locator('#mapPanel').isVisible()
      && await map.evaluate(() => document.activeElement?.dataset.id) === 'kutuphane');
    await map.setViewportSize({ width: 390, height: 844 });
    await map.click('#zoomFit');
    const mapScale = () => map.locator('#mapCanvas').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a);
    const fitScale = await mapScale();
    await map.locator('#mapViewport').focus();
    await map.keyboard.press('+');
    check('haritada klavyeyle yakınlaştırma', await mapScale() > fitScale);
    const imageAligned = await map.evaluate(() => {
      const img = document.querySelector('#mapImage');
      const canvas = document.querySelector('#mapCanvas');
      return Math.abs(canvas.offsetWidth - img.naturalWidth) <= 1;
    });
    check('mobil harita koordinatları gerçek görsel boyutuyla eşleşiyor', imageAligned);
    await map.selectOption('#mapBuilding', 'kutuphane');
    const selectedVisible = await map.evaluate(() => {
      const marker = document.querySelector('.marker.is-active').getBoundingClientRect();
      const sheet = document.querySelector('#mapPanel').offsetTop;
      const header = document.querySelector('.map-header').getBoundingClientRect().bottom;
      return marker.top >= header && marker.bottom <= sheet;
    });
    check('mobilde seçilen bina bilgi panelinin arkasında kalmıyor', selectedVisible);

    /* ---------------- Görüntüleyici ---------------- */
    console.log('\nGörüntüleyici');
    const viewerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const viewer = await viewerContext.newPage();
    watch(viewer, 'görüntüleyici');
    // Deterministic data-saving policy also prevents CI from fetching huge tiers.
    await viewer.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', { configurable: true,
        value: { saveData: true, effectiveType: '4g', addEventListener() {} } });
    });
    const largeTierRequests = [];
    viewer.on('request', request => {
      if (/\.geometry-lod\/(medium|high)\.glb/.test(request.url())) largeTierRequests.push(request.url());
    });
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
        await viewer.waitForFunction(() => document.querySelector('#mv').dataset.geometryLod === 'ready');
        await viewer.waitForTimeout(500);
        check('veri tasarrufunda büyük kademeler kendiliğinden indirilmiyor', largeTierRequests.length === 0);
        check('yüklenen son yapı hatırlanıyor', await viewer.evaluate(() => localStorage.getItem('oku-last-model')) === target.id);
        const before = await viewer.evaluate(() => document.querySelector('#mv').getCameraOrbit().phi);
        await viewer.keyboard.press('3');
        await viewer.waitForTimeout(1200);
        const after = await viewer.evaluate(() => ({
          phi: document.querySelector('#mv').getCameraOrbit().phi,
          active: document.querySelector('#cameraPresets .preset.is-active')?.dataset.preset,
        }));
        check('kamera preseti uygulanıyor', Math.abs(after.phi - before) > 0.05 && after.active === 'aerial',
          `phi ${before.toFixed(2)} → ${after.phi.toFixed(2)}`);

        const tierManifest = target.geometryLod && JSON.parse(readFileSync(path.join(ROOT, target.geometryLod), 'utf8'));
        const allTiersLocal = tierManifest?.tiers.every(tier =>
          !isLfsPointer(path.resolve(ROOT, path.dirname(target.geometryLod), tier.src)));
        if (allTiersLocal) {
          await viewer.evaluate(() => { document.querySelector('#moreControls').open = false; });
          await viewer.click('#infoToggle');
          // Simulate a full disk in the page cache, then retry with real files.
          // This checks that partial downloads never get reported as saved.
          await viewer.evaluate(() => {
            window.__originalCachePut = Cache.prototype.put;
            Cache.prototype.put = function(request, ...args) {
              if (String(request?.url || request).includes('/medium.glb')) {
                return Promise.reject(new DOMException('Test quota exceeded', 'QuotaExceededError'));
              }
              return window.__originalCachePut.call(this, request, ...args);
            };
          });
          await viewer.getByRole('button', { name: /^Çevrimdışı kaydet/ }).click();
          await viewer.getByRole('button', { name: 'Kaydı tamamlamak için tekrar dene' }).waitFor({ timeout: 30000 });
          check('depolama hatasında çevrimdışı kayıt yeniden denenebiliyor',
            await viewer.getByRole('button', { name: 'Kaydı tamamlamak için tekrar dene' }).isEnabled()
            && await viewer.getByRole('button', { name: 'Kaydı sil', exact: true }).count() === 0);
          await viewer.evaluate(() => { Cache.prototype.put = window.__originalCachePut; delete window.__originalCachePut; });
          await viewer.getByRole('button', { name: 'Kaydı tamamlamak için tekrar dene' }).click();
          await viewer.getByRole('button', { name: 'Kaydı sil', exact: true }).waitFor({ timeout: 60000 });
          check('tüm model dosyaları kaydedildikten sonra başarı gösteriliyor', true);
          const savedViewer = await viewer.context().newPage();
          await viewer.context().setOffline(true);
          try {
            await savedViewer.goto(`${base}/viewer.html?id=${target.id}`, { waitUntil: 'load', timeout: 60000 });
            await savedViewer.waitForFunction(() => document.querySelector('#mv')?.loaded, null, { timeout: 120000 });
            check('kaydedilen 3B model internetsiz yeni sayfada açılıyor', true);
          } finally {
            await savedViewer.close();
            await viewer.context().setOffline(false);
          }
        } else {
          console.log('  · Tam çevrimdışı model testi atlandı (üst kademeler Git LFS işaretçisi)');
        }

      }
    } else {
      console.log('  · 3B yükleme atlandı (model Git LFS işaretçisi veya --skip-model)');
    }

    console.log('\nÇevrimdışı uygulama kabuğu');
    const offlineContext = await browser.newContext();
    const offline = await offlineContext.newPage();
    await offline.goto(`${base}/`, { waitUntil: 'load' });
    await offline.evaluate(() => navigator.serviceWorker.ready);
    await offline.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await offlineContext.setOffline(true);
    await offline.goto(`${base}/?category=egitim`, { waitUntil: 'load' });
    check('ilk ziyaretten sonra çevrimdışı galeri etkileşimli açılıyor',
      await offline.locator('.card:not(.is-hidden)').count() === models.filter(m => m.category === 'egitim').length
      && await offline.evaluate(() => getComputedStyle(document.querySelector('#grid')).display) === 'grid');
    await offline.goto(`${base}/map.html`, { waitUntil: 'load' });
    await offline.waitForFunction(() => document.querySelectorAll('.marker').length > 0);
    check('çevrimdışı harita görseli ve işaretçileri çalışıyor',
      await offline.locator('.marker').count() === placedCount
      && await offline.locator('#mapImage').evaluate(img => img.naturalWidth > 0));
    await offlineContext.close();

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
