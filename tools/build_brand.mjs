#!/usr/bin/env node
/**
 * Marka varlıkları: favicon, uygulama ikonları ve paylaşım (OG) kartları.
 *
 * Görseller sitenin kendi yazı tipi, renk token'ları ve gerçek model
 * posterleriyle Chromium'da render edilir (tools/brand-card.html):
 *   assets/favicon.svg
 *   assets/icons/icon-192.png          (tam dolu kare; iOS kendisi yuvarlar)
 *   assets/icons/icon-512.png          (yuvarlatılmış, saydam köşe)
 *   assets/icons/icon-maskable-512.png (tam dolu, içerik güvenli bölgede)
 *   assets/og/<model|home>.<tr|en>.jpg (1200×630, sosyal paylaşım önizlemesi)
 *   assets/social-card.webp            (eski bağlantılar için ana sayfa kartı)
 *
 * Kullanım: node tools/build_brand.mjs   (sonra: python3 tools/build_site.py)
 * Gereksinimler: playwright (chromium), ImageMagick 7.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startServer } from './lib/serve.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'models.json'), 'utf8'));
const locales = Object.fromEntries(['tr', 'en'].map(lang => [lang, JSON.parse(readFileSync(path.join(ROOT, `src/locales/${lang}.json`), 'utf8'))]));
const localized = (model, key, lang) => (lang !== 'tr' && model.i18n?.[lang]?.[key]) || model[key] || '';

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#c4532c"/>
      <stop offset="1" stop-color="#93351a"/>
    </linearGradient>
  </defs>
  <rect width="24" height="24" rx="6" fill="url(#g)"/>
  <g fill="none" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" transform="translate(3.6 3.6) scale(0.7)">
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
    <path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>
  </g>
</svg>
`;

const { chromium } = await import('playwright');
const server = await startServer(ROOT);
const browser = await chromium.launch({ args: ['--no-sandbox', '--force-color-profile=srgb'] });
const work = mkdtempSync(path.join(tmpdir(), 'brand-'));

async function render(params, { width, height, omitBackground = false }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(`${server.origin}/tools/brand-card.html?${new URLSearchParams(params)}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  const buffer = await page.screenshot({ omitBackground, clip: { x: 0, y: 0, width, height } });
  await page.close();
  return buffer;
}

try {
  writeFileSync(path.join(ROOT, 'assets/favicon.svg'), FAVICON);
  console.log('  ✓ assets/favicon.svg');

  for (const [file, size, maskable, transparent] of [
    ['icon-192.png', 192, true, false],
    ['icon-512.png', 512, false, true],
    ['icon-maskable-512.png', 512, true, false],
  ]) {
    const png = await render({ kind: 'icon', size, maskable: maskable ? '1' : '0' }, { width: size, height: size, omitBackground: transparent });
    const raw = path.join(work, file);
    writeFileSync(raw, png);
    execFileSync('magick', [raw, '-strip', '-define', 'png:compression-level=9', path.join(ROOT, 'assets/icons', file)]);
    console.log(`  ✓ assets/icons/${file}`);
  }

  mkdirSync(path.join(ROOT, 'assets/og'), { recursive: true });
  for (const lang of ['tr', 'en']) {
    const t = locales[lang];
    const common = { lang, brand: t.common.brandSuffix, org: t.common.university, cta: t.common.ogCta };
    const prefix = lang === 'tr' ? '' : 'en/';
    const cards = [{
      id: 'home',
      params: {
        ...common, eyebrow: t.home.heroEyebrow, title: `${t.home.heroTitleA} ${t.home.heroTitleB}`,
        poster: '/assets/posters/oku_genel_plan.webp', url: `vr.perinet.org/${prefix}`,
      },
    }];
    for (const model of manifest.models) {
      const title = localized(model, 'officialName', lang) || localized(model, 'label', lang);
      const type = localized(model, 'type', lang);
      cards.push({
        id: model.id,
        params: {
          ...common,
          eyebrow: t.categories[model.category] || '',
          title,
          // Tür başlıkta zaten geçiyorsa (Kütüphane Binası / Kütüphane) tekrar edilmez.
          type: title.toLocaleLowerCase(lang).includes(type.toLocaleLowerCase(lang)) ? localized(model, 'campusZone', lang) : type,
          poster: `/${model.poster.replace(/\.(webp|avif)$/, '.webp')}`,
          url: `vr.perinet.org/${prefix}${model.id}/`,
        },
      });
    }
    for (const card of cards) {
      const raw = path.join(work, `${card.id}.${lang}.png`);
      writeFileSync(raw, await render(card.params, { width: 1200, height: 630 }));
      const out = path.join(ROOT, `assets/og/${card.id}.${lang}.jpg`);
      execFileSync('magick', [raw, '-strip', '-interlace', 'Plane', '-sampling-factor', '4:2:0', '-quality', '84', out]);
      if (card.id === 'home' && lang === 'tr') {
        execFileSync('magick', [raw, '-quality', '82', '-define', 'webp:method=6', path.join(ROOT, 'assets/social-card.webp')]);
      }
      console.log(`  ✓ assets/og/${card.id}.${lang}.jpg`);
    }
  }
  console.log('\nSonraki adım: python3 tools/build_site.py');
} finally {
  await browser.close();
  await server.close();
  rmSync(work, { recursive: true, force: true });
}
