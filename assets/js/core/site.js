/* Bütün sayfaların paylaştığı davranışlar: adresler, güvenli depolama,
   tema, dil, üst bilgi, bildirimler, kullanım ölçümü ve service worker. */

import { lang, t } from './i18n.js?v=425bd5c155';

/* ---------- Adresler ----------
   Bu modül assets/js/core/ altındadır; site kökü üç düzey yukarıdadır.
   Böylece /en/ altındaki sayfalar da model ve varlık yollarını kökten çözer. */
export const SITE_ROOT = new URL('../../../', import.meta.url);
export const LANG_ROOT = new URL(lang === 'tr' ? './' : `${lang}/`, SITE_ROOT);

/** Kökten göreli varlık/model yolu → mutlak adres. */
export const siteUrl = (path) => new URL(String(path || ''), SITE_ROOT).href;
/** Dil kökünden göreli sayfa yolu → mutlak adres (viewer.html, map.html…). */
export const pageUrl = (path) => new URL(String(path || ''), LANG_ROOT).href;
export const sameOrigin = (url) => {
  try { return new URL(url, location.href).origin === location.origin; } catch { return false; }
};

/* ---------- Güvenli depolama ----------
   Gizli pencere, engellenmiş site verisi ya da kota durumunda erişim
   istisna fırlatabilir; tercih kaybolur ama sayfa çalışmaya devam eder. */
export const store = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, String(value)); return true; } catch { return false; }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* yok say */ }
  },
};
export const session = {
  get(key) {
    try { return sessionStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { sessionStorage.setItem(key, String(value)); } catch { /* yok say */ }
  },
};

export const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Veri tasarrufu veya yavaş bağlantı: büyük isteğe bağlı indirmeler yapılmaz. */
export function limitedConnection() {
  const connection = navigator.connection;
  return Boolean(connection?.saveData) || ['slow-2g', '2g', '3g'].includes(connection?.effectiveType);
}

/* ---------- DOM yardımcıları ---------- */
export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
let spriteHref = '';
/** Sprite'taki ikonu döndürür; sprite adresi sayfadaki ilk ikondan okunur (damgalı). */
export function icon(name, className = '') {
  if (!spriteHref) {
    const sample = document.querySelector('svg.icon use');
    spriteHref = (sample?.getAttribute('href') || '').split('#')[0] || siteUrl('assets/icons.svg');
  }
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', `icon${className ? ` ${className}` : ''}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `${spriteHref}#i-${name}`);
  svg.append(use);
  return svg;
}

/* ---------- Bildirim (toast) ---------- */
let toastRegion = null;
export function toast(message, { timeout = 4200, iconName = 'info', tone = '' } = {}) {
  if (!toastRegion) {
    toastRegion = el('div', { class: 'toast-region', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastRegion);
  }
  const item = el('div', { class: `toast${tone ? ` toast--${tone}` : ''}` }, icon(iconName), el('div', {}, message));
  toastRegion.append(item);
  const remove = () => {
    item.classList.add('is-leaving');
    window.setTimeout(() => item.remove(), 240);
  };
  if (timeout > 0) window.setTimeout(remove, timeout);
  return remove;
}

/* ---------- Kullanım ölçümü ----------
   Çerezsiz, kimliksiz, aynı köken: olaylar /e ucuna sendBeacon ile gider;
   nginx yalnızca zaman damgası ile sorgu dizesini günlüğe yazar (IP,
   user-agent, referrer ve çerez yok). DNT veya opt-out varsa hiç gönderilmez. */
const analyticsEnabled = (() => {
  try {
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return false;
    return store.get('analytics-opt-out') !== '1' && typeof navigator.sendBeacon === 'function';
  } catch {
    return false;
  }
})();

export function track(event, params = {}) {
  // Çevrimdışıyken gönderilmez: istek zaten ulaşmaz ve konsolu kirletir.
  if (!analyticsEnabled || !navigator.onLine) return;
  try {
    const query = new URLSearchParams({ v: '2', e: String(event), l: lang });
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      query.set(key, String(value).slice(0, 64));
    }
    navigator.sendBeacon(new URL(`e?${query}`, SITE_ROOT).href);
  } catch { /* Ölçüm sayfayı asla bozmaz. */ }
}

/* ---------- Tema ---------- */
const THEME_KEY = 'gallery-theme';
const root = document.documentElement;

export function resolvedTheme() {
  const chosen = root.dataset.theme;
  if (chosen === 'light' || chosen === 'dark') return chosen;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function syncThemeControls() {
  const dark = resolvedTheme() === 'dark';
  const label = dark ? t('common.themeToLight') : t('common.themeToDark');
  for (const button of document.querySelectorAll('[data-theme-toggle]')) {
    button.setAttribute('aria-label', label);
    button.title = label;
    button.setAttribute('aria-pressed', String(dark));
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#111110' : '#f6f5f1';
  document.dispatchEvent(new CustomEvent('oku:theme', { detail: { theme: resolvedTheme() } }));
}

export function setTheme(theme) {
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
  store.set(THEME_KEY, theme || '');
  syncThemeControls();
}

function initTheme() {
  if (root.hasAttribute('data-theme-lock')) return;
  document.addEventListener('click', (event) => {
    if (!event.target.closest?.('[data-theme-toggle]')) return;
    setTheme(resolvedTheme() === 'dark' ? 'light' : 'dark');
  });
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', syncThemeControls);
  syncThemeControls();
}

/* ---------- Dil ----------
   Dil bağlantısı aynı sayfanın diğer dildeki karşılığını gösterir; sorgu ve
   parça (ör. ?id=kutuphane, ?q=…) korunur. Tercih yalnızca kullanıcı dil
   değiştirdiğinde kaydedilir; kendiliğinden yönlendirme yapılmaz. */
const LANG_KEY = 'oku-lang';
const LANG_HINT_KEY = 'oku-lang-hint-dismissed';

function refreshLangLinks() {
  for (const link of document.querySelectorAll('[data-lang-switch]')) {
    const target = new URL(link.getAttribute('href'), location.href);
    if (!link.dataset.base) link.dataset.base = target.pathname;
    target.pathname = link.dataset.base;
    target.search = location.search;
    target.hash = location.hash;
    link.href = target.href;
  }
}

function initLanguage() {
  refreshLangLinks();
  window.addEventListener('popstate', refreshLangLinks);
  document.addEventListener('oku:url', refreshLangLinks);
  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('[data-lang-switch]');
    if (link) store.set(LANG_KEY, link.getAttribute('hreflang') || '');
  });

  // Tarayıcı dili bu sayfanın dili değilse ve diğer dil tercih edilmişse
  // ya da tarayıcı o dili istiyorsa küçük bir öneri şeridi gösterilir.
  const hint = document.getElementById('langHint');
  if (!hint || store.get(LANG_HINT_KEY) === '1') return;
  const preferred = store.get(LANG_KEY) || (navigator.languages || [navigator.language]).map(code => String(code).slice(0, 2))
    .find(code => code === 'tr' || code === 'en');
  if (!preferred || preferred === lang) return;
  const link = document.querySelector('[data-lang-switch]');
  if (!link) return;
  hint.textContent = '';
  hint.lang = preferred;
  const anchor = el('a', { href: link.href, hreflang: preferred, 'data-lang-switch': '' }, t('common.langHintLink'));
  const dismiss = el('button', { type: 'button' }, t('common.langHintDismiss'));
  dismiss.addEventListener('click', () => {
    store.set(LANG_HINT_KEY, '1');
    hint.hidden = true;
  });
  hint.append(el('span', {}, t('common.langHint')), anchor, dismiss);
  hint.hidden = false;
  refreshLangLinks();
}

/** URL durumu değişince (arama/filtre) dil bağlantıları yeniden yazılır. */
export const announceUrlChange = () => document.dispatchEvent(new Event('oku:url'));

/* ---------- Üst bilgi: kaydırınca alt çizgi ---------- */
function initHeader() {
  const header = document.querySelector('[data-site-header]');
  if (!header) return;
  const sentinel = el('div', { class: 'scroll-sentinel', 'aria-hidden': 'true' });
  document.body.prepend(sentinel);
  new IntersectionObserver(([entry]) => header.classList.toggle('is-scrolled', !entry.isIntersecting))
    .observe(sentinel);
}

/* ---------- Service worker ---------- */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return null;
  try {
    // Sorgu dizesi yok: tarayıcı betiği bayt bazında karşılaştırıp günceller.
    return await navigator.serviceWorker.register(siteUrl('geometry-lod-sw.js'), { scope: SITE_ROOT.pathname });
  } catch (error) {
    console.warn('Service worker kaydedilemedi:', error);
    return null;
  }
}

export function initPage({ serviceWorker = true } = {}) {
  initTheme();
  initLanguage();
  initHeader();
  if (serviceWorker) {
    if (document.readyState === 'complete') void registerServiceWorker();
    else window.addEventListener('load', () => void registerServiceWorker(), { once: true });
  }
}
