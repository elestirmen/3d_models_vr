#!/usr/bin/env node
/**
 * Geometri kademesi denetimi: sadeleştirilmiş kademelerde delik var mı?
 *
 * Hafif ve orta kademe kaynak ağın sadeleştirilmesidir; sadeleştirme yeni
 * açık kenar (tek üçgene ait kenar = çatlak) açmamalı. Eski gltfpack -si
 * hattı parça sınırlarında on binlerce çatlak açıyordu: model arka planı
 * üçgen üçgen gösteriyordu (açık temada beyaz lekeler).
 *
 * Ölçüt: kademenin açık kenarı, sadeleştirilmemiş yüksek kademenin (kaynak
 * topolojisi) açık kenarını %10'dan fazla aşmamalı. Yüksek kademe yoksa
 * (CI yalnızca tek hafif kademe indirir) üçgen başına sınır uygulanır.
 * Git LFS işaretçisi olan dosyalar atlanır.
 *
 * Kullanım: node tools/check_lods.mjs [--models=e_blok,fabrika]
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { LfsPointerError, meshTopology, readGltf } from './lib/gltf-read.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SIMPLIFIED = ['low', 'medium'];
const RELATIVE_LIMIT = 1.1;
// Referanssız sınır: düzgün kademeler 1000 üçgende ~1–8, çatlaklı hat 460–820.
const PER_TRIANGLE_LIMIT = 0.02;

const options = { models: '' };
for (const arg of process.argv.slice(2)) {
  const [key, value = ''] = arg.replace(/^--/, '').split('=');
  options[key] = value;
}
const only = new Set(options.models.split(',').filter(Boolean));
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'models.json'), 'utf8'));

async function topology(file) {
  try {
    const gltf = await readGltf(file);
    return gltf.json.meshes.map((_, index) => meshTopology(gltf, index)).reduce((sum, item) => ({
      triangles: sum.triangles + item.triangles,
      open: sum.open + item.open,
    }), { triangles: 0, open: 0 });
  } catch (error) {
    if (error instanceof LfsPointerError) return null;
    throw error;
  }
}

let checked = 0;
let skipped = 0;
const failures = [];
for (const model of manifest.models) {
  if (!model.geometryLod || (only.size && !only.has(model.id))) continue;
  const sidecarPath = path.join(ROOT, model.geometryLod);
  const sidecar = JSON.parse(readFileSync(sidecarPath, 'utf8'));
  const file = (id) => path.join(path.dirname(sidecarPath), sidecar.tiers.find(tier => tier.id === id).src);
  const reference = await topology(file('high'));
  for (const id of SIMPLIFIED) {
    const result = await topology(file(id));
    if (!result) { skipped++; continue; }
    checked++;
    const limit = reference ? Math.ceil(reference.open * RELATIVE_LIMIT) : Math.ceil(result.triangles * PER_TRIANGLE_LIMIT);
    const line = `${model.id.padEnd(15)} ${id.padEnd(6)} ${String(result.triangles).padStart(8)} üçgen  açık kenar ${String(result.open).padStart(7)}  (sınır ${limit}${reference ? `, kaynak ${reference.open}` : ', kaynak yok'})`;
    if (result.open > limit) {
      failures.push(line);
      console.log(`✗ ${line}`);
    } else {
      console.log(`✓ ${line}`);
    }
  }
}

if (failures.length) {
  console.error(`\nHATA: ${failures.length} kademede sadeleştirme çatlağı var — python3 tools/build_geometry_lods.py --overwrite --tiers low medium`);
  process.exit(1);
}
console.log(`Kademe denetimi: ${checked} kademe temiz${skipped ? `, ${skipped} LFS işaretçisi atlandı` : ''}.`);
