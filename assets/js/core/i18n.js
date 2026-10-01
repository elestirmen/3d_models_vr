/* Arayüz metinleri ve yerel biçimlendirme.
   Metinler sayfaya build sırasında <script type="application/json" id="oku-i18n">
   olarak gömülür (src/locales/*.json); ayrı bir istek yoktur. */

const node = document.getElementById('oku-i18n');
let strings = {};
try {
  strings = node ? JSON.parse(node.textContent) : {};
} catch {
  strings = {};
}

export const lang = document.documentElement.lang || 'tr';
export const numberLocale = strings.meta?.numberLocale || (lang === 'tr' ? 'tr-TR' : 'en-GB');

function lookup(key) {
  let value = strings;
  for (const part of key.split('.')) {
    if (value == null || typeof value !== 'object') return undefined;
    value = value[part];
  }
  return value;
}

/** `t('viewer.loading', { name })` — eksik anahtar anahtarın kendisini döndürür. */
export function t(key, vars) {
  const value = lookup(key);
  if (typeof value !== 'string') {
    if (value !== undefined) return value;
    console.warn(`[i18n] eksik metin: ${key}`);
    return key;
  }
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (match, name) => (vars[name] ?? match));
}

/** Katalog kaydının bu dildeki alanı (çeviri yoksa Türkçe asıl). */
export function localized(entry, key) {
  if (!entry) return '';
  const translated = lang !== 'tr' ? entry.i18n?.[lang]?.[key] : undefined;
  if (translated !== undefined && translated !== '' && !(Array.isArray(translated) && !translated.length)) return translated;
  return entry[key] ?? '';
}

/** Birim/kaynak listelerinde yalnızca ad/etiket çevrilir; sıra korunur. */
export function localizedList(entry, key, field) {
  const items = Array.isArray(entry?.[key]) ? entry[key].map(item => ({ ...item })) : [];
  const names = lang !== 'tr' ? entry?.i18n?.[lang]?.[key] : null;
  if (Array.isArray(names)) items.forEach((item, i) => { if (names[i]) item[field] = names[i]; });
  return items;
}

const numberFormat = new Intl.NumberFormat(numberLocale);

export const fmt = {
  number(value, digits = 0) {
    if (!Number.isFinite(Number(value))) return '';
    return Number(value).toLocaleString(numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  },
  integer(value) {
    return Number.isFinite(Number(value)) ? numberFormat.format(Math.round(Number(value))) : '';
  },
  bytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    const digits = unit === 0 || value >= 100 ? 0 : 1;
    return `${fmt.number(value, digits)} ${units[unit]}`;
  },
  triangles(count) {
    const n = Number(count);
    if (!Number.isFinite(n) || n <= 0) return '';
    if (n >= 1e6) return t('format.trianglesM', { n: fmt.number(n / 1e6, 1) });
    if (n >= 1e3) return t('format.trianglesK', { n: Math.round(n / 1e3) });
    return t('format.triangles', { n });
  },
  date(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!match) return '';
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return date.toLocaleDateString(numberLocale, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  },
  duration(ms) {
    const seconds = Math.max(0, Math.round(ms / 1000));
    if (seconds < 60) return t('format.seconds', { n: seconds });
    return t('format.minutes', { m: Math.floor(seconds / 60), s: seconds % 60 });
  },
};

const collator = new Intl.Collator(numberLocale, { numeric: true, sensitivity: 'base' });
export const compare = (a, b) => collator.compare(String(a), String(b));

/** Türkçe/İngilizce aramada aksan ve büyük-küçük harf farkını yok sayar. */
export function normalizeSearch(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
