/**
 * Üretim araçları için küçük glTF/GLB okuyucu (yalnızca geometri).
 *
 * - .gltf (dış .bin) ve .glb okur; EXT_meshopt_compression tamponlarını
 *   meshoptimizer çözücüsüyle açar (gltfpack çıktısı).
 * - Erişimciyi (accessor) bileşen türündeki tipli diziye okur; nicemlenmiş
 *   (normalized) değerler ham tamsayı olarak döner.
 * - Git LFS işaretçisi (modeller indirilmemiş kopya, CI) `LfsPointerError`
 *   fırlatır; çağıran atlayabilir.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MeshoptDecoder } from 'meshoptimizer/decoder';

const LFS_HEADER = 'version https://git-lfs.github.com/spec/';
const ARRAYS = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export class LfsPointerError extends Error {}

export async function readGltf(file) {
  const bytes = readFileSync(file);
  if (bytes.length < 512 && bytes.toString('latin1').startsWith(LFS_HEADER)) {
    throw new LfsPointerError(`${file}: Git LFS işaretçisi (git lfs pull)`);
  }
  const dir = path.dirname(file);
  let json;
  let glbBin = null;
  if (bytes.readUInt32LE(0) === 0x46546c67) {
    const jsonLength = bytes.readUInt32LE(12);
    json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
    const binHeader = 20 + jsonLength;
    if (binHeader + 8 <= bytes.length) glbBin = bytes.subarray(binHeader + 8, binHeader + 8 + bytes.readUInt32LE(binHeader));
  } else {
    json = JSON.parse(bytes.toString('utf8'));
  }

  // Sıkıştırılmış görünümlerin yedek tamponu (-cc) uri'siz ve boştur.
  const buffers = (json.buffers || []).map((buffer, index) => {
    if (buffer.uri) return readFileSync(path.join(dir, decodeURIComponent(buffer.uri)));
    return index === 0 ? glbBin : null;
  });

  if (json.bufferViews?.some(view => view.extensions?.EXT_meshopt_compression)) await MeshoptDecoder.ready;
  const views = new Map();
  function view(index) {
    if (views.has(index)) return views.get(index);
    const bufferView = json.bufferViews[index];
    const compressed = bufferView.extensions?.EXT_meshopt_compression;
    let result;
    if (compressed) {
      const source = buffers[compressed.buffer];
      const input = new Uint8Array(source.buffer, source.byteOffset + (compressed.byteOffset || 0), compressed.byteLength);
      const output = new Uint8Array(compressed.count * compressed.byteStride);
      MeshoptDecoder.decodeGltfBuffer(output, compressed.count, compressed.byteStride, input, compressed.mode, compressed.filter);
      result = { bytes: output, stride: compressed.byteStride };
    } else {
      const source = buffers[bufferView.buffer || 0];
      if (!source) throw new Error(`${file}: bufferView ${index} için tampon yok`);
      result = { bytes: new Uint8Array(source.buffer, source.byteOffset + (bufferView.byteOffset || 0), bufferView.byteLength), stride: bufferView.byteStride || 0 };
    }
    views.set(index, result);
    return result;
  }

  function accessor(index) {
    const info = json.accessors[index];
    if (info.sparse) throw new Error(`${file}: seyrek erişimci desteklenmiyor (#${index})`);
    const Type = ARRAYS[info.componentType];
    const components = COMPONENTS[info.type];
    const { bytes: data, stride: viewStride } = view(info.bufferView);
    const size = Type.BYTES_PER_ELEMENT;
    const stride = viewStride || size * components;
    const offset = info.byteOffset || 0;
    const array = new Type(info.count * components);
    const tight = stride === size * components && (data.byteOffset + offset) % size === 0;
    if (tight) {
      array.set(new Type(data.buffer, data.byteOffset + offset, info.count * components));
    } else {
      const source = new DataView(data.buffer, data.byteOffset + offset);
      const get = {
        5120: (o) => source.getInt8(o), 5121: (o) => source.getUint8(o),
        5122: (o) => source.getInt16(o, true), 5123: (o) => source.getUint16(o, true),
        5125: (o) => source.getUint32(o, true), 5126: (o) => source.getFloat32(o, true),
      }[info.componentType];
      for (let i = 0; i < info.count; i++) {
        for (let c = 0; c < components; c++) array[i * components + c] = get(i * stride + c * size);
      }
    }
    return { array, components, count: info.count, componentType: info.componentType, normalized: Boolean(info.normalized), type: info.type };
  }

  return { json, dir, accessor };
}

/**
 * Bir ağın açık kenarları: konumu aynı tepeler birleştirilir (malzeme ve UV
 * dikişleri sayılmaz), yalnızca tek üçgene ait kenar delik/sınır kenarıdır.
 * Sadeleştirmenin açtığı çatlak burada görünür; kaynağın dış sınırı da sayılır.
 */
export function meshTopology(gltf, meshIndex = 0) {
  const ids = new Map();
  const triangles = [];
  let degenerate = 0;
  for (const primitive of gltf.json.meshes[meshIndex].primitives) {
    if ((primitive.mode ?? 4) !== 4) throw new Error('yalnızca üçgen listesi destekleniyor');
    const position = gltf.accessor(primitive.attributes.POSITION);
    const local = new Uint32Array(position.count);
    const p = position.array;
    const integer = !(p instanceof Float32Array);
    for (let i = 0; i < position.count; i++) {
      const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
      // 16 bit nicemlenmiş konumlar tek sayıya sığar; float konumlar metin anahtar.
      const key = integer && Math.abs(x) < 65536 && Math.abs(y) < 65536 && Math.abs(z) < 65536
        ? ((x + 65536) * 131072 + (y + 65536)) * 131072 + (z + 65536)
        : `${x},${y},${z}`;
      let id = ids.get(key);
      if (id === undefined) { id = ids.size; ids.set(key, id); }
      local[i] = id;
    }
    const index = primitive.indices === undefined ? null : gltf.accessor(primitive.indices).array;
    const count = index ? index.length : position.count;
    for (let t = 0; t + 2 < count; t += 3) {
      const a = local[index ? index[t] : t], b = local[index ? index[t + 1] : t + 1], c = local[index ? index[t + 2] : t + 2];
      if (a === b || b === c || a === c) { degenerate++; continue; }
      triangles.push(a, b, c);
    }
  }
  const vertices = ids.size;
  const edges = new Float64Array(triangles.length);
  for (let t = 0; t < triangles.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const u = triangles[t + k], v = triangles[t + (k + 1) % 3];
      edges[t + k] = u < v ? u * vertices + v : v * vertices + u;
    }
  }
  edges.sort();
  let open = 0, nonManifold = 0;
  for (let i = 0; i < edges.length;) {
    let j = i + 1;
    while (j < edges.length && edges[j] === edges[i]) j++;
    if (j - i === 1) open++;
    else if (j - i > 2) nonManifold++;
    i = j;
  }
  return { triangles: triangles.length / 3 + degenerate, vertices, open, nonManifold, degenerate };
}
