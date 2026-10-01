#!/usr/bin/env node
/**
 * Yerleşke genel planı modelindeki bina etiketlerinin 3B konumlarını ölçer.
 *
 * Etiket konumu tahmin edilmez. Kampüs haritasının taban görseli
 * (assets/map/campus-plan.*) genel plan modelinin belirli bir kameradan
 * alınmış render'ıdır ve binaların harita konumları (models.json → map.x/y)
 * bu görselde ölçülüp teyit edilmiştir. Bu araç:
 *
 *   1. haritayı üreten kamerayı aynı ayarlarla yeniden kurar
 *      (assets/map/campus-plan.json: kademe, orbit, pozlama, render boyutu),
 *   2. ekran görüntüsünün saydam kenarlarını ölçüp haritadaki kırpmayla
 *      eşleştiğini doğrular (boyut farkı ±2 px'i aşarsa durur),
 *   3. her binanın harita noktasını render koordinatına çevirip model-viewer'ın
 *      positionAndNormalFromPoint() ışın testiyle model yüzeyine indirir,
 *   4. sonucu assets/map/campus-hotspots.json olarak yazar.
 *
 * Sonuç build_site.py ile kataloğa (oku_genel_plan.campusHotspots) girer;
 * görüntüleyici etiketleri ve yerleşke turunu bundan üretir.
 *
 * Kullanım:
 *   node tools/build_campus_hotspots.mjs
 *   node tools/build_campus_hotspots.mjs --tier=medium   # daha hızlı, daha az kesin
 *
 * Gereksinimler: node >= 20, playwright (chromium), ImageMagick 7.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { startServer } from './lib/serve.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => {
  const [key, value = ''] = a.slice(2).split('=');
  return [key, value];
}));

const meta = JSON.parse(readFileSync(path.join(ROOT, 'assets/map/campus-plan.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'models.json'), 'utf8'));
const campus = manifest.models.find(m => m.id === meta.generatedFrom);
if (!campus) throw new Error(`Harita kaynağı modeli yok: ${meta.generatedFrom}`);
const tierId = args.tier || meta.tier || 'high';
const lod = JSON.parse(readFileSync(path.join(ROOT, campus.geometryLod), 'utf8'));
const tier = lod.tiers.find(t => t.id === tierId);
const src = '/' + path.posix.join(path.posix.dirname(campus.geometryLod), tier.src);
const placed = manifest.models.filter(m => m.map && Number.isFinite(m.map.x) && Number.isFinite(m.map.y));

const { chromium } = await import('playwright');
const server = await startServer(ROOT);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--no-sandbox', '--force-color-profile=srgb'] });
const work = mkdtempSync(path.join(tmpdir(), 'campus-spots-'));

try {
  const { width, height } = meta.renderSize;
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const query = new URLSearchParams({
    src,
    orbit: meta.orbit,
    exposure: meta.exposure || '1',
    env: '/assets/env/campus-studio.hdr',
    alt: 'campus hotspots',
  });
  console.log(`Render: ${campus.id} · ${tierId} · ${width}x${height} · ${meta.orbit}`);
  await page.goto(`${server.origin}/tools/poster-render.html?${query}`, { waitUntil: 'load', timeout: 240000 });
  const state = await page.waitForFunction(() => (window.__posterState === 'loading' ? null : window.__posterState), null, { timeout: 900000 })
    .then(handle => handle.jsonValue());
  if (state !== 'ready') throw new Error(`model yüklenemedi: ${state}`);
  await page.waitForTimeout(2500);

  // 2) Haritadaki kırpmanın aynısı mı? Saydam kenar sınırını ölç.
  const shot = path.join(work, 'plan.png');
  writeFileSync(shot, await page.locator('#mv').screenshot({ omitBackground: true, timeout: 180000 }));
  const geometry = execFileSync('magick', [shot, '-alpha', 'set', '-format', '%@', 'info:'], { encoding: 'utf8' }).trim();
  const match = /^(\d+)x(\d+)\+(\d+)\+(\d+)$/.exec(geometry);
  if (!match) throw new Error(`kırpma ölçülemedi: ${geometry}`);
  const [cropW, cropH, cropX, cropY] = match.slice(1).map(Number);
  const expected = meta.imageSize;
  console.log(`Kırpma: ${cropW}x${cropH}+${cropX}+${cropY} (harita ${expected.width}x${expected.height})`);
  if (Math.abs(cropW - expected.width) > 2 || Math.abs(cropH - expected.height) > 2) {
    throw new Error('Render kırpması harita görseliyle eşleşmiyor; harita yeniden üretilmiş olabilir (node tools/build_map.mjs).');
  }

  // 3) Harita noktası → render pikseli → model yüzeyi.
  const hotspots = [];
  for (const model of placed) {
    const px = cropX + model.map.x * cropW;
    const py = cropY + model.map.y * cropH;
    const hit = await page.evaluate(([x, y]) => {
      const mv = document.querySelector('#mv');
      // Nokta tam bir boşluğa denk gelirse küçük bir spiralde en yakın yüzey aranır.
      for (let r = 0; r <= 10; r += 2) {
        for (let a = 0; a < (r ? 12 : 1); a += 1) {
          const dx = r * Math.cos((a / 12) * Math.PI * 2);
          const dy = r * Math.sin((a / 12) * Math.PI * 2);
          const result = mv.positionAndNormalFromPoint(x + dx, y + dy);
          if (result) {
            return {
              position: [result.position.x, result.position.y, result.position.z],
              normal: [result.normal.x, result.normal.y, result.normal.z],
              offset: Math.hypot(dx, dy),
            };
          }
        }
      }
      return null;
    }, [px, py]);
    if (!hit) {
      console.log(`  ✗ ${model.id}: yüzey bulunamadı (${px.toFixed(0)}, ${py.toFixed(0)})`);
      continue;
    }
    const fmt = (v, unit = '') => v.map(n => `${n.toFixed(4)}${unit}`).join(' ');
    // Etiketin yukarı baksın: çatı eğimi yerine yukarı yönlü normal.
    const up = hit.normal[1] < 0.3 ? [0, 1, 0] : hit.normal;
    hotspots.push({ model: model.id, position: fmt(hit.position, 'm'), normal: fmt(up), map: { x: model.map.x, y: model.map.y } });
    console.log(`  ✓ ${model.id.padEnd(10)} ${fmt(hit.position, 'm')}${hit.offset ? `  (±${hit.offset.toFixed(0)} px)` : ''}`);
  }

  const out = {
    generatedBy: 'tools/build_campus_hotspots.mjs',
    generatedFrom: campus.id,
    tier: tierId,
    orbit: meta.orbit,
    crop: { x: cropX, y: cropY, width: cropW, height: cropH },
    note: 'Konumlar teyitli harita noktalarından ışın testiyle ölçüldü; elle düzenlemeyin, aracı yeniden çalıştırın.',
    hotspots,
  };
  writeFileSync(path.join(ROOT, 'assets/map/campus-hotspots.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(`\n${hotspots.length}/${placed.length} yapı yerleştirildi → assets/map/campus-hotspots.json`);
  console.log('Sonraki adım: python3 tools/build_site.py');
} finally {
  await browser.close();
  await server.close();
  rmSync(work, { recursive: true, force: true });
}
