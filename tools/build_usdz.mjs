#!/usr/bin/env node
/**
 * iPhone/iPad AR Quick Look dosyaları (USDZ) üretir.
 *
 * Neden önceden üretiliyor: model-viewer `ios-src` yoksa USDZ'yi telefonda
 * anında üretmeye çalışır; ama bütün kademelerimiz KTX2 (Basis) dokulu ve
 * model-viewer'ın dışa aktarıcısı sıkıştırılmış dokuyu çözemediği için
 * Quick Look hiç açılmıyordu. Burada her yapı bir kez, denetlenerek üretilir.
 *
 * Akış (yapı başına):
 *   1. Kademe seçimi: üçgen sayısı --budget'ı aşmayan en ayrıntılı kademe
 *      (orta, olmazsa hafif). Quick Look dosyası tek parça iner; ağır kademe
 *      telefonda hem indirme hem bellek sorunu olur.
 *   2. tools/usdz-export.html (başsız Chromium + three.js): GLB çözülür,
 *      maket boyutuna getirilir, UV dönüşümü gömülür, normaller hesaplanır,
 *      dokular kayıpsız çözülüp JPEG/PNG yazılır → ham USDZ.
 *   3. tools/usdz_finalize.py (Pixar OpenUSD): ikili .usdc, ARKit paketi,
 *      `usdchecker --arkit` kuralları + UsdValidation denetimi.
 *   4. Çıktı: <klasör>/<id>.usdz (Git LFS) ve kaynak bilgisini tutan
 *      <id>.usdz.json; models.json'da `ios` alanı doldurulur.
 *
 * Kullanım:
 *   python3 -m venv tools/.venv && tools/.venv/bin/pip install -r tools/requirements-usd.txt
 *   node tools/build_usdz.mjs                    # bütün yapılar
 *   node tools/build_usdz.mjs --models=kutuphane,fabrika --budget=350000
 *   node tools/build_usdz.mjs --preview          # + kaynak GLB ile yan yana görüntü
 * Sonra: python3 tools/build_site.py (katalog `ios` adresini damgalar).
 *
 * Çıktı belirlenimcidir (aynı girdi → aynı bayt): kimlikler sahne sırasıyla
 * verilir, zip tarihleri sabittir; Git LFS'te gereksiz yeni sürüm oluşmaz.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { startServer } from './lib/serve.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);

const options = {
  models: '',
  budget: '350000',
  target: '0.9',
  maxTexture: '1024',
  jpegQuality: '85',
  preview: '',
  python: process.env.USD_PYTHON || path.join(ROOT, 'tools/.venv/bin/python'),
};
for (const arg of process.argv.slice(2)) {
  const [key, value = ''] = arg.replace(/^--/, '').split('=');
  options[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
}
const budget = Number(options.budget);
const THREE_VERSION = JSON.parse(readFileSync(path.join(ROOT, 'tools/node_modules/three/package.json'), 'utf8')).version;

const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const isLfsPointer = file => readFileSync(file).subarray(0, 64).toString('latin1').startsWith('version https://git-lfs');
const mb = bytes => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Bütçeye sığan en ayrıntılı kademe (yüksek kademe Quick Look için asla seçilmez). */
function chooseTier(manifest) {
  const byId = Object.fromEntries((manifest.tiers || []).map(tier => [tier.id, tier]));
  for (const id of ['medium', 'low']) {
    if (byId[id] && Number(byId[id].triangles) <= budget) return byId[id];
  }
  return byId.low || manifest.tiers?.[0];
}

async function main() {
  if (!existsSync(options.python)) {
    console.error(`HATA: OpenUSD Python ortamı yok (${options.python}).\n  python3 -m venv tools/.venv && tools/.venv/bin/pip install -r tools/requirements-usd.txt`);
    process.exit(2);
  }
  const manifestPath = path.join(ROOT, 'models.json');
  const manifestText = readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestText);
  // models.json Python json.dumps(indent=2, ensure_ascii=False) biçiminde; aynı biçim korunmazsa dokunulmaz.
  const canWriteManifest = JSON.stringify(manifest, null, 2) + '\n' === manifestText;
  const wanted = new Set(options.models.split(',').map(s => s.trim()).filter(Boolean));
  const jobs = manifest.models.filter(m => m.geometryLod && (!wanted.size || wanted.has(m.id)));
  if (!jobs.length) {
    console.error('Üretilecek yapı yok (geometryLod alanı olan model bulunamadı).');
    process.exit(1);
  }

  const { chromium } = require('playwright');
  const server = await startServer(ROOT);
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ acceptDownloads: true });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') pageErrors.push(message.text()); });
  await page.goto(`${server.origin}/tools/usdz-export.html`);
  await page.waitForFunction(() => window.ready === true);

  const work = mkdtempSync(path.join(os.tmpdir(), 'oku-usdz-raw-'));
  const results = [];
  const previews = [];
  let failures = 0;
  try {
    for (const model of jobs) {
      const lodPath = path.join(ROOT, model.geometryLod);
      const lod = JSON.parse(readFileSync(lodPath, 'utf8'));
      const tier = chooseTier(lod);
      const sourceRel = path.posix.join(path.posix.dirname(model.geometryLod), tier.src);
      const source = path.join(ROOT, sourceRel);
      if (!existsSync(source) || isLfsPointer(source)) {
        console.log(`  · ${model.id}: ${sourceRel} yerelde yok (Git LFS işaretçisi) — atlandı`);
        continue;
      }
      const folder = String(model.model).split('/')[0];
      const outRel = `${folder}/${model.id}.usdz`;
      const raw = path.join(work, `${model.id}.raw.usdz`);
      const started = Date.now();
      pageErrors.length = 0;
      // Temiz sayfa: three.js nesne kimlikleri (malzeme/doku adları) sıfırdan
      // başlar; çıktı, önce hangi yapının üretildiğine bağlı olmaz.
      await page.reload();
      await page.waitForFunction(() => window.ready === true);
      let report;
      try {
        const [download, value] = await Promise.all([
          page.waitForEvent('download', { timeout: 600000 }),
          page.evaluate(options => window.exportUsdz(options), {
            url: `${server.origin}/${sourceRel.split('/').map(encodeURIComponent).join('/')}`,
            targetSize: Number(options.target),
            maxTextureSize: Number(options.maxTexture),
            fileName: `${model.id}.usdz`,
          }),
        ]);
        await download.saveAs(raw);
        report = value;
      } catch (error) {
        failures += 1;
        console.error(`  ✗ ${model.id}: dışa aktarma başarısız — ${error.message.split('\n')[0]} ${pageErrors.join(' | ')}`);
        continue;
      }

      let final;
      try {
        const stdout = execFileSync(options.python, [
          path.join(ROOT, 'tools/usdz_finalize.py'), '--in', raw, '--out', path.join(ROOT, outRel), '--jpeg-quality', options.jpegQuality,
        ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });
        final = JSON.parse(stdout.trim().split('\n').pop());
      } catch (error) {
        const out = String(error.stdout || '').trim().split('\n').pop();
        try { final = JSON.parse(out); } catch { final = { ok: false, errors: [String(error.stderr || error.message).split('\n').filter(line => !/^Warning:/.test(line)).slice(-3).join(' ')] }; }
      }
      if (!final?.ok) {
        failures += 1;
        console.error(`  ✗ ${model.id}: ARKit denetimi geçmedi\n      ${(final?.errors || []).slice(0, 5).join('\n      ')}`);
        continue;
      }

      const sidecar = {
        note: 'tools/build_usdz.mjs üretir; elle düzenlemeyin.',
        file: `${model.id}.usdz`,
        bytes: final.bytes,
        sha256: final.sha256,
        tier: tier.id,
        source: sourceRel,
        sourceSha256: sha256(source),
        triangles: final.triangles,
        points: final.points,
        meshes: final.meshes,
        textures: { jpeg: report.textures.jpeg, png: report.textures.png, maxSize: report.textures.maxSize },
        sizeMeters: report.size,
        metersPerUnit: final.metersPerUnit,
        upAxis: final.upAxis,
        checks: { arkitRules: 'OpenUSD v25.08 complianceChecker (usdchecker --arkit)', validators: 'UsdValidation 26.8', errors: 0, warnings: final.warnings.length },
        generator: { three: THREE_VERSION, usdzExporter: 'three/addons/exporters/USDZExporter.js' },
      };
      writeFileSync(path.join(ROOT, `${outRel}.json`), `${JSON.stringify(sidecar, null, 2)}\n`);
      if (options.preview !== '') previews.push({ id: model.id, glb: sourceRel, usdz: outRel });
      model.ios = outRel;
      results.push({ id: model.id, tier: tier.id, triangles: final.triangles, bytes: final.bytes, seconds: (Date.now() - started) / 1000, warnings: final.warnings.length });
      console.log(`  ✓ ${model.id.padEnd(15)} ${tier.id.padEnd(6)} ${String(final.triangles).padStart(7)} üçgen  ${mb(final.bytes).padStart(8)}  ${report.size.join(' × ')} m  ${((Date.now() - started) / 1000).toFixed(1)} sn${final.warnings.length ? `  (${final.warnings.length} uyarı)` : ''}`);
    }
    // Gözle denetim: three.js USDLoader üretilen dosyayı geri yükler, aynı açıdan
    // kaynak GLB'nin yanına çizer (sol GLB, sağ USDZ). Quick Look'u taklit etmez.
    if (previews.length) {
      const dir = options.preview && options.preview !== 'true' ? path.resolve(options.preview) : path.join(os.tmpdir(), 'oku-usdz-preview');
      mkdirSync(dir, { recursive: true });
      const sheet = await browser.newPage({ viewport: { width: 1280, height: 480 } });
      await sheet.goto(`${server.origin}/tools/usdz-preview.html`);
      await sheet.waitForFunction(() => window.ready === true);
      const url = rel => `${server.origin}/${rel.split('/').map(encodeURIComponent).join('/')}`;
      for (const item of previews) {
        const counts = await sheet.evaluate(o => window.preview(o), { glb: url(item.glb), usdz: url(item.usdz) });
        const file = path.join(dir, `${item.id}.png`);
        await sheet.screenshot({ path: file });
        console.log(`  önizleme: ${file} (${counts.meshes} parça, ${counts.textured} dokulu)`);
      }
      await sheet.close();
    }
  } finally {
    await browser.close();
    await server.close();
    rmSync(work, { recursive: true, force: true });
  }

  if (results.length) {
    if (canWriteManifest) {
      const next = JSON.stringify(manifest, null, 2) + '\n';
      if (next !== manifestText) {
        writeFileSync(manifestPath, next);
        console.log('models.json: `ios` alanları güncellendi.');
      }
    } else {
      console.log('UYARI: models.json biçimi farklı; `ios` alanlarını elle ekleyin:');
      for (const r of results) console.log(`  ${r.id}: "ios": "${manifest.models.find(m => m.id === r.id).ios}"`);
    }
    const total = results.reduce((sum, r) => sum + r.bytes, 0);
    console.log(`${results.length} USDZ hazır, toplam ${mb(total)}. Sonra: python3 tools/build_site.py`);
  }
  if (failures) process.exit(1);
}

await main();
