#!/usr/bin/env node
/**
 * Fotogrametri ağını bütün malzeme parçalarıyla BİRLİKTE sadeleştirir.
 *
 * Neden: kaynak ağlar doku atlası başına bir primitive'e bölünmüş (8–68
 * parça) ve parçalar binanın her yüzünde iç içe geçiyor. gltfpack -si her
 * parçayı ayrı sadeleştirdiği için iki parçanın ortak kenarı iki tarafta
 * farklı kayıyor; hafif ve orta kademelerde on binlerce çatlak açılıyordu
 * (arka plan üçgen üçgen görünüyordu). -slb kenarları kilitleyince çatlak
 * kapanıyor ama ağ hedefin üç katında kalıyor.
 *
 * Burada bütün parçalar tek tepe/indis dizisinde birleştirilir; parça sınırı
 * meshoptimizer için sıradan bir öznitelik dikişi olur ve dikiş iki tarafta
 * birlikte sadeleşir (çatlak açılmaz). Sonra her üçgen kendi parçasına geri
 * dağıtılır; dokular ve malzemeler aynen kalır. Çıktı sıkıştırılmamış bir
 * glTF'tir: nicemleme, Meshopt ve KTX2 için gltfpack'e verilir
 * (tools/build_geometry_lods.py).
 *
 * Kullanım:
 *   node tools/simplify_lod.mjs <kaynak.gltf> <çıktı.gltf> --ratio=0.08 --error=0.025
 * Çıktıya özet JSON satırı yazar (üçgen, hata, açık kenar).
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import { readGltf, meshTopology } from './lib/gltf-read.mjs';

const positional = [];
const options = { ratio: '', error: '0.01' };
for (const arg of process.argv.slice(2)) {
  if (!arg.startsWith('--')) { positional.push(arg); continue; }
  const [key, value = ''] = arg.slice(2).split('=');
  options[key] = value;
}
const [input, output] = positional;
const ratio = Number(options.ratio);
const targetError = Number(options.error);
if (!input || !output || !(ratio > 0 && ratio <= 1) || !(targetError > 0)) {
  console.error('Kullanım: node tools/simplify_lod.mjs <kaynak.gltf> <çıktı.gltf> --ratio=0.08 --error=0.025');
  process.exit(2);
}

const source = await readGltf(input);
const { json } = source;
await MeshoptSimplifier.ready;

const chunks = [];
let byteLength = 0;
const out = {
  ...json,
  buffers: [],
  bufferViews: [],
  accessors: [],
  meshes: [],
  // Doku yolları çıktının klasörüne göre yeniden yazılır (gltfpack oradan okur).
  images: json.images?.map(image => (image.uri && !image.uri.startsWith('data:')
    ? { ...image, uri: path.relative(path.dirname(output), path.join(source.dir, decodeURIComponent(image.uri))).split(path.sep).map(encodeURIComponent).join('/') }
    : image)),
};
for (const key of Object.keys(out)) if (out[key] === undefined) delete out[key];

function pushView(array, target) {
  const padding = (4 - (byteLength % 4)) % 4;
  if (padding) { chunks.push(Buffer.alloc(padding)); byteLength += padding; }
  out.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: array.byteLength, target });
  chunks.push(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
  byteLength += array.byteLength;
  return out.bufferViews.length - 1;
}

const summary = { sourceTriangles: 0, triangles: 0, error: 0 };
for (const mesh of json.meshes) {
  // 1. Parçaları birleştir: tepe dizileri art arda, indisler kaydırılmış.
  const parts = mesh.primitives.map((primitive) => {
    if ((primitive.mode ?? 4) !== 4 || primitive.indices === undefined) throw new Error('yalnızca indisli üçgen listesi destekleniyor');
    if (primitive.targets) throw new Error('morph hedefleri desteklenmiyor');
    const attributes = Object.fromEntries(Object.entries(primitive.attributes).map(([name, index]) => [name, source.accessor(index)]));
    if (attributes.POSITION.componentType !== 5126) throw new Error('kaynak konumları float olmalı (sıkıştırılmamış glTF)');
    return { primitive, attributes, indices: source.accessor(primitive.indices).array, count: attributes.POSITION.count };
  });
  const vertexCount = parts.reduce((sum, part) => sum + part.count, 0);
  const indexCount = parts.reduce((sum, part) => sum + part.indices.length, 0);
  const positions = new Float32Array(vertexCount * 3);
  const owner = new Uint16Array(vertexCount);
  const indices = new Uint32Array(indexCount);
  let base = 0;
  let cursor = 0;
  for (const [partIndex, part] of parts.entries()) {
    part.base = base;
    positions.set(part.attributes.POSITION.array, base * 3);
    owner.fill(partIndex, base, base + part.count);
    for (const index of part.indices) indices[cursor++] = index + base;
    base += part.count;
  }

  // 2. Tek ağ olarak sadeleştir. Bayrak yok: kenar kilidi gereksiz (parça
  //    sınırları artık iç dikiş), "permissive" ise dikişte çatlak açar.
  const target = Math.floor((indexCount / 3) * ratio) * 3;
  const [simplified, error] = MeshoptSimplifier.simplify(indices, positions, 3, target, targetError, []);
  summary.sourceTriangles += indexCount / 3;
  summary.triangles += simplified.length / 3;
  summary.error = Math.max(summary.error, error);

  // 3. Üçgenleri parçalarına geri dağıt. Dikiş daraltması her köşeyi kendi
  //    tarafındaki eşine taşır; üç köşesi farklı parçadan gelen üçgen
  //    oluşursa malzemesi belirsizdir — sessizce düzeltmek yerine dur.
  const perPart = parts.map(() => []);
  for (let t = 0; t < simplified.length; t += 3) {
    const a = simplified[t], b = simplified[t + 1], c = simplified[t + 2];
    if (owner[a] !== owner[b] || owner[a] !== owner[c]) throw new Error(`üçgen ${t / 3} iki parçaya yayılıyor; malzeme belirsiz`);
    perPart[owner[a]].push(a, b, c);
  }

  // 4. Her parça için kullanılan tepeleri sıkıştırıp yaz.
  const primitives = [];
  for (const [partIndex, part] of parts.entries()) {
    const triangles = perPart[partIndex];
    if (!triangles.length) continue;
    const remap = new Map();
    const order = [];
    const partIndices = new Uint32Array(triangles.length);
    for (let k = 0; k < triangles.length; k++) {
      const local = triangles[k] - part.base;
      let next = remap.get(local);
      if (next === undefined) { next = order.length; remap.set(local, next); order.push(local); }
      partIndices[k] = next;
    }
    const attributes = {};
    for (const [name, attribute] of Object.entries(part.attributes)) {
      const { array, components } = attribute;
      const values = new array.constructor(order.length * components);
      for (let v = 0; v < order.length; v++) {
        for (let c = 0; c < components; c++) values[v * components + c] = array[order[v] * components + c];
      }
      const accessor = { bufferView: pushView(values, 34962), componentType: attribute.componentType, count: order.length, type: attribute.type };
      if (attribute.normalized) accessor.normalized = true;
      if (name === 'POSITION') {
        accessor.min = [Infinity, Infinity, Infinity];
        accessor.max = [-Infinity, -Infinity, -Infinity];
        for (let k = 0; k < values.length; k++) {
          accessor.min[k % 3] = Math.min(accessor.min[k % 3], values[k]);
          accessor.max[k % 3] = Math.max(accessor.max[k % 3], values[k]);
        }
      }
      out.accessors.push(accessor);
      attributes[name] = out.accessors.length - 1;
    }
    out.accessors.push({ bufferView: pushView(partIndices, 34963), componentType: 5125, count: partIndices.length, type: 'SCALAR' });
    primitives.push({ ...part.primitive, attributes, indices: out.accessors.length - 1 });
  }
  out.meshes.push({ ...mesh, primitives });
}

const binName = `${path.basename(output, path.extname(output))}.bin`;
out.buffers.push({ uri: encodeURIComponent(binName), byteLength });
writeFileSync(path.join(path.dirname(output), binName), Buffer.concat(chunks));
writeFileSync(output, JSON.stringify(out));

const written = await readGltf(output);
const topology = json.meshes.map((_, index) => meshTopology(written, index));
console.log(JSON.stringify({
  ...summary,
  error: Number(summary.error.toFixed(5)),
  open: topology.reduce((sum, item) => sum + item.open, 0),
}));
