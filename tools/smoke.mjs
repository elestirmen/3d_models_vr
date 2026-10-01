#!/usr/bin/env node
/**
 * Duman testi — kritik akışları gerçek Chromium'da doğrular.
 *
 * Testler rastgele seçilmedi; her biri bu projede yaşanmış bir hatayı ya da
 * kolayca bozulabilecek bir sözleşmeyi korur:
 *   - Kapalı <dialog>'lar gizli mi? (yazar stili UA'nın display:none'unu ezmişti)
 *   - "Diğer" menüsü tıklanabilir mi? (overflow menüyü kırpmıştı)
 *   - Sürüklemeden sonra harita işaretçisi tıklanıyor mu? (setPointerCapture)
 *   - Mobil araç çubuğu tek satır ve ekranda mı? (left:50% küçülerek-sığma
 *     hatası araç çubuğunu dar bir sütuna sıkıştırmıştı)
 *   - Her denetimin erişilebilir adı var mı? (mobilde etiketler gizlenince
 *     düğmeler adsız kalmıştı) — axe-core ile ciddi/kritik ihlal sıfır
 *   - Üçüncü taraf istek, CSP ihlali, başarısız istek, konsol hatası yok
 *
 * Kullanım:
 *   node tools/smoke.mjs                       # yerel sunucu başlatır
 *   node tools/smoke.mjs --base=https://vr.perinet.org
 *   node tools/smoke.mjs --skip-model          # 3B yükleme adımlarını atla
 *
 * Model dosyaları Git LFS'te tutulduğu için CI'da işaretçi (pointer) olarak
 * gelebilir; bu durumda 3B yükleme adımları kendiliğinden atlanır.
 */

import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { startServer } from './lib/serve.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);

/** Galeri ilk yükünde (load + 1,5 sn) aktarılan bayt bütçesi.
 *  Kahraman posteri ve ilk üç kart posteri hemen, diğerleri tembel yüklenir.
 *  Bütçe aşılırsa poster/yazı tipi/betik boyutlarında bir gerileme var demektir. */
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
  console.log(`  ${passed ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`);
}
const section = (title) => console.log(`\n${title}`);

function isLfsPointer(file) {
  if (!existsSync(file)) return true;
  try {
    return readFileSync(file, { encoding: 'utf8', flag: 'r' }).slice(0, 60).startsWith('version https://git-lfs');
  } catch {
    return false;
  }
}

async function main() {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'models.json'), 'utf8'));
  const models = manifest.models || [];
  const target = models.find(m => String(m.id) === options.model) || models[0];
  const placed = models.filter(m => m?.map);
  const campus = models.find(m => m.id === 'oku_genel_plan');
  const campusSpots = existsSync(path.join(ROOT, 'assets/map/campus-hotspots.json'))
    ? JSON.parse(readFileSync(path.join(ROOT, 'assets/map/campus-hotspots.json'), 'utf8')).hotspots.length : 0;

  let server = null;
  let base = options.base;
  if (!base) {
    server = await startServer(ROOT);
    base = server.origin;
  }

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error('HATA: playwright bulunamadı. cd tools && npm ci && npx playwright install chromium');
    process.exit(1);
  }
  const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--no-sandbox'] });
  const origin = new URL(base).origin;

  const modelReady = !options.skipModel && !isLfsPointer(path.join(ROOT, String(target.model)));
  const campusReady = !options.skipModel && campus && !isLfsPointer(path.join(ROOT, String(campus.model)));
  const expectedModelError = (tag, text) => !modelReady && tag.startsWith('görüntüleyici')
    && /model-viewer|Failed to load resource|Unexpected token|Could not load|GLTF|glb/i.test(text);

  const problems = { errors: [], csp: [], thirdParty: new Set(), failed: [] };
  // Kullanım ölçümü ateşle-unut bir beacon'dır. Playwright'ın çevrimdışı
  // öykünmesinde service worker'ın açtığı sayfada navigator.onLine true kalıyor
  // (gerçek tarayıcıda false olur ve istek hiç gönderilmez); bu yüzden
  // yalnızca bu isteğin bağlantı hatası yok sayılır.
  const offlineBeacon = (url, text) => /\/e\?/.test(url) && /ERR_INTERNET_DISCONNECTED/.test(text);
  const watch = (page, tag) => {
    page.on('console', (message) => {
      const text = message.text();
      if (offlineBeacon(message.location?.()?.url || '', text)) return;
      if (message.type() === 'error' && !expectedModelError(tag, text)) problems.errors.push(`${tag}: ${text}`);
      if (/Content Security Policy|Refused to/i.test(text)) problems.csp.push(`${tag}: ${text}`);
    });
    page.on('pageerror', (error) => {
      if (!expectedModelError(tag, error.message)) problems.errors.push(`${tag}: ${error.message}`);
    });
    page.on('requestfailed', (request) => {
      const type = request.resourceType();
      // İptal edilen video/ön indirme ve gezinmeyle kesilen istekler gürültüdür.
      if (type === 'media' || type === 'other' || /ERR_ABORTED/.test(request.failure()?.errorText || '')) return;
      if (offlineBeacon(request.url(), request.failure()?.errorText || '')) return;
      problems.failed.push(`${tag}: ${request.url().slice(0, 100)} (${request.failure()?.errorText})`);
    });
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith(origin) && !/^(data|blob):/.test(url)) problems.thirdParty.add(new URL(url).origin);
    });
  };

  /** axe-core: ciddi ve kritik ihlaller (kontrast dahil). Betik bağlama
   *  başlangıç betiği olarak eklenir (CDP ile, CSP'ye tabi değildir); böylece
   *  sayfaların CSP'si testte de gerçekten uygulanır. */
  async function axe(page) {
    return page.evaluate(async () => {
      const result = await window.axe.run(document, { resultTypes: ['violations'] });
      return result.violations
        .filter(v => v.impact === 'serious' || v.impact === 'critical')
        .map(v => `${v.id}: ${v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(', ')}`);
    });
  }
  async function checkAxe(page, name) {
    const violations = await axe(page);
    check(name, violations.length === 0, violations[0] || '');
  }

  const newPage = async (tag, contextOptions = {}) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...contextOptions });
    await context.addInitScript({ content: axeSource });
    const page = await context.newPage();
    watch(page, tag);
    return page;
  };

  try {
    /* ================= Galeri ================= */
    section('Galeri');
    const gallery = await newPage('galeri');
    let transferred = 0;
    gallery.on('response', async (response) => {
      try {
        const length = Number((await response.allHeaders())['content-length']);
        if (Number.isFinite(length)) transferred += length;
      } catch { /* yanıt kapanmış olabilir */ }
    });
    await gallery.goto(`${base}/`, { waitUntil: 'load', timeout: 60000 });
    await gallery.waitForTimeout(1500);
    const g = await gallery.evaluate(() => {
      const card = document.querySelector('.card');
      const media = card.querySelector('.card__media');
      const image = card.querySelector('.card__poster');
      return {
        cards: document.querySelectorAll('.card').length,
        href: card.querySelector('.card__link')?.getAttribute('href'),
        posterLoaded: image.naturalWidth > 0,
        lqipDefined: getComputedStyle(media).getPropertyValue('--lqip').trim().startsWith('url('),
        lqipCleared: media.classList.contains('is-ready') && !getComputedStyle(media).backgroundImage.includes('data:'),
        font: getComputedStyle(document.body).fontFamily.split(',')[0].replace(/"/g, ''),
        arBadgesShown: [...document.querySelectorAll('[data-ar-badge]')].filter(b => !b.hidden).length,
        pins: document.querySelectorAll('.map-teaser__pins .pin').length,
        pinHref: document.querySelector('.map-teaser__pins .pin')?.getAttribute('href') || '',
        alternate: document.querySelector('link[hreflang="en"]')?.getAttribute('href'),
      };
    });
    check('kart sayısı manifestle uyuşuyor', g.cards === models.length, `${g.cards}/${models.length}`);
    check('kart kısa görüntüleyici adresine bağlanıyor', /viewer\.html\?id=/.test(g.href || ''), g.href);
    check('poster yüklendi', g.posterLoaded);
    check('bulanık önizleme (LQIP) tanımlı ve poster gelince kalkıyor', g.lqipDefined && g.lqipCleared);
    check('Inter yazı tipi uygulanmış', g.font === 'Inter', g.font);
    check('AR rozeti desteklemeyen cihazda vaat edilmiyor', g.arBadgesShown === 0, `${g.arBadgesShown} görünür`);
    check('harita önizlemesinde her yerleşik yapı işaretli', g.pins === placed.length && /map\.html\?focus=/.test(g.pinHref), `${g.pins}/${placed.length}`);
    check('hreflang alternatifi var', /\/en\/$/.test(g.alternate || ''), g.alternate);
    check(`galeri aktarımı bütçe içinde (${Math.round(GALLERY_TRANSFER_BUDGET / 1024)} KB)`, transferred <= GALLERY_TRANSFER_BUDGET, `${Math.round(transferred / 1024)} KB`);

    const visibleIds = () => gallery.locator('.card:not([hidden])').evaluateAll(cards => cards.map(c => c.dataset.id));
    await gallery.fill('#searchInput', 'KUTUPHANE');
    check('Türkçe karakter kullanmadan arama', JSON.stringify(await visibleIds()) === '["kutuphane"]');
    await gallery.fill('#searchInput', 'temel islam');
    check('birim adına göre çok sözcüklü arama', JSON.stringify(await visibleIds()) === '["ilahiyat"]');
    await gallery.fill('#searchInput', 'library');
    check('Türkçe sayfada İngilizce adla arama', JSON.stringify(await visibleIds()) === '["kutuphane"]');
    await gallery.fill('#searchInput', '');
    await gallery.click('.filters [data-category="egitim"]');
    check('kategori filtresi', (await visibleIds()).length === models.filter(m => m.category === 'egitim').length);
    await gallery.fill('#searchInput', 'kutuphane');
    check('arama ve kategori birlikte çalışıyor (boş sonuç)', await gallery.locator('#emptyState').isVisible());
    await gallery.click('#resetFilters');
    check('boş sonuçtan tek tıkla kurtarma', (await visibleIds()).length === models.length);
    await gallery.selectOption('#sortOrder', 'size');
    const sizes = await gallery.locator('.card').evaluateAll(cards => cards.map(card => Number(card.dataset.size)));
    check('indirme boyutuna göre sıralama', sizes.every((size, i) => !i || size >= sizes[i - 1]));
    await gallery.click('button[data-layout="list"]');
    await gallery.fill('#searchInput', 'rektorluk');
    await gallery.reload({ waitUntil: 'load' });
    check('arama, sıralama ve görünüm adreste korunuyor',
      await gallery.inputValue('#searchInput') === 'rektorluk' && await gallery.inputValue('#sortOrder') === 'size'
      && await gallery.locator('#grid').getAttribute('data-layout') === 'list' && (await visibleIds()).length === 1);
    const switchHref = await gallery.locator('[data-lang-switch]').first().getAttribute('href');
    const switched = new URL(switchHref, base);
    check('dil bağlantısı aynı arama durumunu taşıyor',
      switched.pathname === '/en/' && switched.searchParams.get('q') === 'rektorluk' && switched.searchParams.get('view') === 'list', switchHref);
    await gallery.click('button[data-layout="grid"]');
    await gallery.goBack();
    check('tarayıcı geri tuşu görünümü geri getiriyor', await gallery.locator('#grid').getAttribute('data-layout') === 'list');
    await gallery.goto(`${base}/`);
    await gallery.click('.site-header [data-theme-toggle]');
    const theme = await gallery.locator('html').getAttribute('data-theme');
    await gallery.reload({ waitUntil: 'load' });
    check('tema tercihi yeniden açılışta korunuyor', Boolean(theme) && await gallery.locator('html').getAttribute('data-theme') === theme, theme);
    await gallery.evaluate(() => localStorage.removeItem('gallery-theme'));
    for (const width of [320, 390, 768, 1280]) {
      await gallery.setViewportSize({ width, height: 900 });
      await gallery.evaluate(() => document.fonts.ready);
      // scrollWidth tek başına yetmez: overflow-x: clip taşan öğeyi ölçümden
      // gizler. Kaydırılabilir şeritler (.filters) dışında hiçbir öğe görünür
      // alanın dışına çıkmamalı.
      const d = await gallery.evaluate(() => ({
        viewport: innerWidth,
        content: document.documentElement.scrollWidth,
        outside: [...document.querySelectorAll('main *, header *')]
          .filter(el => !el.closest('.filters') && el.getClientRects().length && el.getBoundingClientRect().right > innerWidth + 1)
          .slice(0, 3).map(el => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`),
      }));
      check(`${width} px görünümde yatay taşma yok`, d.content <= d.viewport && !d.outside.length, `${d.content}/${d.viewport} ${d.outside.join(' ')}`);
    }
    await gallery.setViewportSize({ width: 1280, height: 900 });
    await gallery.reload({ waitUntil: 'load' });
    await checkAxe(gallery, 'galeri erişilebilirlik (axe: ciddi/kritik ihlal yok)');
    await gallery.emulateMedia({ colorScheme: 'dark' });
    await gallery.waitForTimeout(500); // renk geçişleri (120 ms) bitmeden kontrast ölçülmesin
    await checkAxe(gallery, 'koyu tema erişilebilirlik ve kontrast');
    await gallery.context().close();

    section('English home');
    const en = await newPage('galeri-en', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await en.goto(`${base}/en/`, { waitUntil: 'load' });
    const e = await en.evaluate(() => ({
      lang: document.documentElement.lang,
      title: document.title,
      library: document.querySelector('.card[data-id="kutuphane"] .card__link')?.textContent.trim(),
      viewerHref: document.querySelector('.card .card__link')?.getAttribute('href'),
      cssOk: getComputedStyle(document.querySelector('.site-header')).position === 'sticky',
    }));
    check('İngilizce ana sayfa dili ve başlığı', e.lang === 'en' && /Digital Campus/.test(e.title), e.title);
    check('model içeriği çevrilmiş', e.library === 'Library', e.library);
    check('İngilizce sayfalar varlıkları kökten yüklüyor', e.cssOk && /^viewer\.html\?id=/.test(e.viewerHref || ''), e.viewerHref);
    await en.fill('#searchInput', 'kütüphane');
    check('İngilizce sayfada Türkçe adla arama', await en.locator('.card:not([hidden])').count() === 1);
    await checkAxe(en, 'mobil İngilizce ana sayfa erişilebilirlik');
    await en.context().close();

    /* ================= Tanıtım sayfası ================= */
    section('Bina tanıtım sayfası');
    const landing = await newPage('tanıtım');
    const landingId = placed.find(m => m.id === 'kutuphane')?.id || target.id;
    await landing.goto(`${base}/${landingId}/`, { waitUntil: 'load' });
    const l = await landing.evaluate(() => {
      let graph = null;
      try { graph = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent); } catch { /* geçersiz */ }
      return {
        h1: document.querySelector('h1')?.textContent.trim(),
        og: document.querySelector('meta[property="og:image"]')?.content,
        canonical: document.querySelector('link[rel=canonical]')?.href,
        types: graph?.['@graph']?.map(node => node['@type']) || [],
        viewer: document.querySelector('.intro__actions .btn--primary')?.getAttribute('href'),
        hreflang: [...document.querySelectorAll('link[rel=alternate]')].map(link => link.hreflang).sort().join(','),
        crop: Boolean(document.querySelector('.crop img')),
      };
    });
    check('başlık var', Boolean(l.h1), l.h1);
    check('yapıya özel paylaşım görseli', /\/(og|posters)\//.test(l.og || ''), l.og);
    check('canonical ve hreflang (tr, en, x-default)', Boolean(l.canonical) && l.hreflang === 'en,tr,x-default', l.hreflang);
    check('JSON-LD geçerli (Place + BreadcrumbList)', l.types.includes('Place') && l.types.includes('BreadcrumbList'), l.types.join(', '));
    check('görüntüleyiciye bağlanıyor', /viewer\.html\?id=/.test(l.viewer || ''));
    check('konum kesiti gösteriliyor', l.crop);
    await checkAxe(landing, 'tanıtım sayfası erişilebilirlik');
    await landing.context().close();

    /* ================= Harita ================= */
    section('Kampüs haritası');
    const map = await newPage('harita');
    await map.goto(`${base}/map.html`, { waitUntil: 'load' });
    await map.waitForFunction(() => document.querySelectorAll('.marker').length > 0);
    check('işaretçi sayısı manifestle uyuşuyor', await map.locator('.marker').count() === placed.length);
    // REGRESYON: sürükleme sonrası işaretçi tıklanabilir kalmalı (boş alanda sürükle).
    const viewportBox = await map.locator('#mapViewport').boundingBox();
    await map.mouse.move(viewportBox.x + 40, viewportBox.y + 40);
    await map.mouse.down();
    await map.mouse.move(viewportBox.x + 100, viewportBox.y + 80, { steps: 6 });
    await map.mouse.up();
    await map.waitForTimeout(300);
    const firstMarker = await map.locator('.marker').first().getAttribute('data-id');
    let clickError = '';
    await map.click(`.marker[data-id="${firstMarker}"]`, { timeout: 15000 }).catch(error => { clickError = error.message.split('\n')[0]; });
    await map.waitForTimeout(300);
    check('REGRESYON: sürüklemeden sonra işaretçi tıklanıyor', await map.locator('#mapPanel').isVisible(), clickError);
    await map.click('#mapList [data-id="kutuphane"]');
    check('listeden seçim haritayı ve adresi güncelliyor',
      new URL(map.url()).searchParams.get('focus') === 'kutuphane' && /Kütüphane/.test(await map.locator('#mapPanelTitle').textContent()));
    await map.locator('#mapPanelClose').focus();
    await map.keyboard.press('Escape');
    check('Escape paneli kapatıp odağı işaretçiye veriyor',
      !await map.locator('#mapPanel').isVisible() && await map.evaluate(() => document.activeElement?.dataset.id) === 'kutuphane');
    await checkAxe(map, 'harita erişilebilirlik');
    await map.setViewportSize({ width: 390, height: 844 });
    await map.click('#zoomFit');
    const scale = () => map.locator('#mapCanvas').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a);
    const fitScale = await scale();
    await map.locator('#mapViewport').focus();
    await map.keyboard.press('+');
    check('klavyeyle yakınlaştırma', await scale() > fitScale);
    check('mobil harita koordinatları gerçek görsel boyutuyla eşleşiyor',
      await map.evaluate(() => Math.abs(document.querySelector('#mapCanvas').offsetWidth - document.querySelector('#mapImage').naturalWidth) <= 1));
    await map.click('#mapList [data-id="rektorluk"]');
    await map.waitForTimeout(600);
    const seen = await map.evaluate(() => {
      const marker = document.querySelector('.marker.is-active').getBoundingClientRect();
      const sheet = document.querySelector('#mapSide').getBoundingClientRect().top;
      const header = document.querySelector('.site-header').getBoundingClientRect().bottom;
      return marker.top >= header && marker.bottom <= sheet;
    });
    check('mobilde seçilen yapı alt sayfanın arkasında kalmıyor', seen);
    await map.context().close();

    /* ================= Görüntüleyici ================= */
    section('Görüntüleyici');
    const viewer = await newPage('görüntüleyici');
    // Veri tasarrufu: CI'nın büyük kademeleri indirmesini de önler.
    await viewer.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true, effectiveType: '4g', addEventListener() {} } });
    });
    const largeTiers = [];
    viewer.on('request', request => { if (/\.geometry-lod\/(medium|high)\.glb/.test(request.url())) largeTiers.push(request.url()); });
    await viewer.goto(`${base}/viewer.html?id=${target.id}`, { waitUntil: 'load' });
    await viewer.waitForTimeout(1000);
    if (!modelReady) {
      // Model yoksa (LFS işaretçisi) hata yolu sınanır, sonra kaplama kaldırılıp
      // arayüz regresyonlarına devam edilir.
      await viewer.locator('#errorWrap').waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
      check('model açılamayınca anlaşılır hata ve yeniden deneme', await viewer.locator('#errorWrap').isVisible()
        && await viewer.locator('#retryLoad').isVisible() && (await viewer.locator('#error').textContent()).length > 20);
      await viewer.evaluate(() => { document.querySelector('#errorWrap').hidden = true; });
    }
    const dialogs = await viewer.evaluate(() => ['#infoPanel', '#helpPanel', '#shareDialog'].map(id => getComputedStyle(document.querySelector(id)).display));
    check('REGRESYON: kapalı paneller gizli', dialogs.every(value => value === 'none'), dialogs.join(','));
    await viewer.click('#moreToggle');
    await viewer.waitForTimeout(250);
    const hit = await viewer.evaluate(() => {
      const button = document.querySelector('#measure');
      const rect = button.getBoundingClientRect();
      const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return { inside: button.contains(top), tag: top?.tagName ?? null };
    });
    check('REGRESYON: "Diğer" menüsü tıklanabilir', hit.inside, hit.tag);
    await viewer.keyboard.press('Escape');
    await viewer.waitForTimeout(150);
    check('"Diğer" menüsü Escape ile kapanıyor', !await viewer.locator('#moreMenu').isVisible());

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
        await viewer.waitForFunction(() => document.querySelector('#mv').dataset.geometryLod === 'ready', null, { timeout: 20000 });
        await viewer.waitForTimeout(500);
        check('veri tasarrufunda büyük kademeler kendiliğinden indirilmiyor', largeTiers.length === 0);
        check('son açılan yapı hatırlanıyor', await viewer.evaluate(() => localStorage.getItem('oku-last-model')) === target.id);
        const before = await viewer.evaluate(() => document.querySelector('#mv').getCameraOrbit().phi);
        await viewer.keyboard.press('3');
        await viewer.waitForTimeout(1600);
        const after = await viewer.evaluate(() => ({
          phi: document.querySelector('#mv').getCameraOrbit().phi,
          active: document.querySelector('#cameraPresets .preset.is-active')?.dataset.preset,
        }));
        check('kamera açısı uygulanıyor', Math.abs(after.phi - before) > 0.05 && after.active === 'aerial', `phi ${before.toFixed(2)} → ${after.phi.toFixed(2)}`);

        await viewer.click('#shareOpen');
        const share = await viewer.evaluate(() => ({
          qr: document.querySelector('#shareQr svg path')?.getAttribute('d')?.length || 0,
          url: document.querySelector('#shareUrl').value,
        }));
        check('paylaşım: QR kodu ve kadrajlı bağlantı', share.qr > 200 && /orbit=/.test(share.url), share.url.slice(0, 80));
        await viewer.click('#shareView');
        check('paylaşım: kadrajsız bağlantı seçeneği', !/orbit=/.test(await viewer.inputValue('#shareUrl')));
        await viewer.keyboard.press('Escape');

        await viewer.click('#tourToggle');
        await viewer.waitForTimeout(600);
        const tour = await viewer.evaluate(() => ({ visible: !document.querySelector('#tourCard').hidden, step: document.querySelector('#tourStep').textContent }));
        check('sinematik tur başlıyor', tour.visible && /1/.test(tour.step), tour.step);
        await viewer.click('#tourStop');
        check('tur kapatılıyor', await viewer.locator('#tourCard').isHidden());

        await viewer.click('#infoToggle');
        await viewer.waitForTimeout(200);
        const info = await viewer.evaluate(() => ({
          open: document.querySelector('#infoPanel').open,
          modal: document.querySelector('#infoPanel').matches(':modal'),
          rows: document.querySelectorAll('#infoPanel .info-table tbody tr').length,
        }));
        check('bilgi paneli masaüstünde kipsiz açılıyor (model döndürülebilir)', info.open && !info.modal && info.rows === 3, JSON.stringify(info));
        await checkAxe(viewer, 'görüntüleyici erişilebilirlik (masaüstü, panel açık)');

        const tierManifest = target.geometryLod && JSON.parse(readFileSync(path.join(ROOT, target.geometryLod), 'utf8'));
        const allTiersLocal = tierManifest?.tiers.every(tier => !isLfsPointer(path.resolve(ROOT, path.dirname(target.geometryLod), tier.src)));
        if (allTiersLocal) {
          // Önbellek kotası dolu senaryosu: kısmi indirme asla "kaydedildi" görünmemeli.
          await viewer.evaluate(() => {
            window.__put = Cache.prototype.put;
            Cache.prototype.put = function (request, ...rest) {
              if (String(request?.url || request).includes('/medium.glb')) return Promise.reject(new DOMException('Test quota exceeded', 'QuotaExceededError'));
              return window.__put.call(this, request, ...rest);
            };
          });
          await viewer.getByRole('button', { name: /^Çevrimdışı kaydet/ }).click();
          // İkinci tıklama ikinci bir eşzamanlı kayıt başlatmamalı (tek hata bildirimi).
          await viewer.evaluate(() => document.querySelector('#infoPanel [data-focus="offline-save"]')?.click());
          const retry = viewer.getByRole('button', { name: 'Kaydı tamamlamak için tekrar dene' });
          await retry.waitFor({ timeout: 30000 });
          check('depolama hatasında kayıt yeniden denenebiliyor',
            await retry.isEnabled() && await viewer.getByRole('button', { name: 'Kaydı sil', exact: true }).count() === 0);
          const afterFailure = await viewer.evaluate(() => ({
            toasts: [...document.querySelectorAll('.toast')].filter(node => /Kayıt tamamlanamadı/.test(node.textContent)).length,
            focus: document.activeElement?.dataset?.focus || document.activeElement?.tagName,
          }));
          check('REGRESYON: çift tıklama tek kayıt; bölüm yenilenince odak düğmede kalıyor',
            afterFailure.toasts === 1 && afterFailure.focus === 'offline-save', JSON.stringify(afterFailure));
          await viewer.evaluate(() => { Cache.prototype.put = window.__put; delete window.__put; });
          await retry.click();
          await viewer.getByRole('button', { name: 'Kaydı sil', exact: true }).waitFor({ timeout: 90000 });
          check('bütün dosyalar kaydedilince başarı gösteriliyor', true);
          const offlinePage = await viewer.context().newPage();
          await viewer.context().setOffline(true);
          try {
            await offlinePage.goto(`${base}/viewer.html?id=${target.id}`, { waitUntil: 'load', timeout: 60000 });
            await offlinePage.waitForFunction(() => document.querySelector('#mv')?.loaded, null, { timeout: 120000 });
            check('kaydedilen model internetsiz yeni sayfada açılıyor', true);
          } catch (error) {
            check('kaydedilen model internetsiz yeni sayfada açılıyor', false, error.message.split('\n')[0]);
          } finally {
            await offlinePage.close();
            await viewer.context().setOffline(false);
          }

          // Kademe geçişi sürerken seçilen kamera açısı, geçiş bitince geri alınmamalı.
          const planPhi = await viewer.evaluate(() => {
            const pin = document.querySelector('#infoPanel [data-focus="quality"]');
            pin.focus();
            pin.click();
            const switching = document.querySelector('#mv').dataset.geometryLod;
            document.querySelector('#cameraPresets [data-preset="plan"]').click();
            return switching;
          });
          await viewer.waitForFunction(() => {
            const mv = document.querySelector('#mv');
            return mv.dataset.geometryLod === 'ready' && mv.dataset.geometryLodTier === 'high';
          }, null, { timeout: 90000 });
          await viewer.waitForTimeout(2200);
          const settled = await viewer.evaluate(() => ({
            phi: document.querySelector('#mv').getCameraOrbit().phi,
            focus: document.activeElement?.dataset?.focus || document.activeElement?.tagName,
            label: document.activeElement?.textContent?.trim(),
          }));
          check('REGRESYON: geçiş sırasında seçilen açı geçiş bitince korunuyor',
            planPhi === 'switching' && settled.phi < 0.3, `${planPhi}, phi ${settled.phi.toFixed(2)}`);
          check('REGRESYON: kalite değişince bilgi panelinde odak yerinde',
            settled.focus === 'quality', `${settled.focus} "${settled.label}"`);
        } else {
          console.log('  · tam çevrimdışı model testi atlandı (üst kademeler Git LFS işaretçisi)');
        }
      }
    } else {
      console.log('  · 3B yükleme atlandı (model Git LFS işaretçisi veya --skip-model)');
    }
    await viewer.context().close();

    section('Görüntüleyici — mobil');
    for (const width of [320, 390]) {
      const phone = await newPage(`görüntüleyici-mobil-${width}`, { viewport: { width, height: 760 }, isMobile: true, hasTouch: true });
      await phone.goto(`${base}/en/viewer.html?id=${target.id}`, { waitUntil: 'load' });
      await phone.waitForTimeout(800);
      const dock = await phone.evaluate(() => {
        const tools = [...document.querySelectorAll('#toolbar .tool')].filter(tool => !tool.hidden);
        const tops = new Set(tools.map(tool => Math.round(tool.getBoundingClientRect().top)));
        const bar = document.querySelector('#toolbar').getBoundingClientRect();
        return {
          rows: tops.size,
          inside: bar.left >= 0 && bar.right <= innerWidth,
          named: tools.every(tool => (tool.getAttribute('aria-label') || tool.textContent).trim().length > 1),
          labels: tools.map(tool => tool.querySelector('.tool__label')?.textContent).join('|'),
        };
      });
      check(`${width} px: araç çubuğu tek satır, ekranın içinde`, dock.rows === 1 && dock.inside, JSON.stringify({ rows: dock.rows, inside: dock.inside }));
      check(`${width} px: her denetimin adı var (İngilizce)`, dock.named && /Info/.test(dock.labels), dock.labels);
      if (width === 390) await checkAxe(phone, 'mobil görüntüleyici erişilebilirlik');
      await phone.context().close();
    }

    if (campusReady && campusSpots) {
      section('Yerleşke modeli');
      const plan = await newPage('görüntüleyici-yerleşke');
      await plan.goto(`${base}/viewer.html?id=${campus.id}`, { waitUntil: 'load' });
      await plan.waitForFunction(() => document.querySelector('#mv')?.loaded, null, { timeout: 180000 });
      await plan.waitForTimeout(800);
      check('yapı etiketleri ölçülmüş konumlarda gösteriliyor', await plan.locator('[data-campus-spot]').count() === campusSpots, `${campusSpots}`);
      await plan.locator('[data-campus-spot="kutuphane"]').click({ force: true });
      await plan.waitForTimeout(400);
      check('etikete dokununca yapı kartı ve 3B bağlantısı açılıyor',
        await plan.locator('#spotCard').isVisible() && /viewer\.html\?id=kutuphane/.test(await plan.locator('#spotOpen').getAttribute('href')));
      await plan.context().close();
    }

    /* ================= Çevrimdışı uygulama kabuğu ================= */
    section('Çevrimdışı uygulama kabuğu');
    const offlineContext = await browser.newContext();
    const offline = await offlineContext.newPage();
    watch(offline, 'çevrimdışı');
    await offline.goto(`${base}/`, { waitUntil: 'load' });
    await offline.evaluate(() => navigator.serviceWorker.ready);
    await offline.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 20000 });
    await offlineContext.setOffline(true);
    await offline.goto(`${base}/?category=egitim`, { waitUntil: 'load' });
    check('ilk ziyaretten sonra galeri çevrimdışı ve etkileşimli',
      await offline.locator('.card:not([hidden])').count() === models.filter(m => m.category === 'egitim').length
      && await offline.evaluate(() => getComputedStyle(document.querySelector('#grid')).display) === 'grid');
    await offline.goto(`${base}/en/`, { waitUntil: 'load' });
    check('İngilizce kabuk da çevrimdışı açılıyor', await offline.evaluate(() => document.documentElement.lang) === 'en');
    await offline.goto(`${base}/kutuphane/`, { waitUntil: 'load' });
    check('REGRESYON: kaydedilmemiş sayfa çevrimdışı ana sayfaya yönleniyor (stiller yerinde)',
      offline.url() === `${base}/` && await offline.evaluate(() => getComputedStyle(document.querySelector('#grid')).display) === 'grid', offline.url());
    await offline.goto(`${base}/en/kutuphane/`, { waitUntil: 'load' });
    check('İngilizce kaydedilmemiş sayfa İngilizce ana sayfaya yönleniyor', offline.url() === `${base}/en/`, offline.url());
    await offline.goto(`${base}/map.html`, { waitUntil: 'load' });
    await offline.waitForFunction(() => document.querySelectorAll('.marker').length > 0);
    check('harita görseli ve işaretçiler çevrimdışı çalışıyor',
      await offline.locator('.marker').count() === placed.length && await offline.locator('#mapImage').evaluate(img => img.naturalWidth > 0));
    await offlineContext.setOffline(false);
    await offlineContext.close();

    /* ================= Genel ================= */
    section('Genel');
    check('üçüncü taraf istek yok', problems.thirdParty.size === 0, [...problems.thirdParty].join(', '));
    check('CSP ihlali yok', problems.csp.length === 0, problems.csp[0] || '');
    check('başarısız istek yok', problems.failed.length === 0, problems.failed[0] || '');
    check('konsol hatası yok', problems.errors.length === 0, problems.errors[0] || '');
  } finally {
    await browser.close();
    await server?.close();
  }

  console.log(`\n${results.length - failures}/${results.length} kontrol geçti.`);
  if (failures) {
    console.error(`\n${failures} kontrol BAŞARISIZ.`);
    process.exit(1);
  }
}

await main();
