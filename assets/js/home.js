/* Ana sayfa: arama, filtre, sıralama, görünüm (URL'de korunur), kart
   önizlemeleri, AR rozeti, "kaldığınız yerden" bağlantısı ve kurulum önerisi.
   İçerik JS olmadan da kullanılabilir; bu modül yalnızca davranış ekler. */

import { t, compare, normalizeSearch } from './core/i18n.js?v=425bd5c155';
import {
  $, $$, el, initPage, store, session, track, prefersReducedMotion, limitedConnection, announceUrlChange,
} from './core/site.js?v=18aec0c522';

initPage();

const grid = $('#grid');
const cards = $$('.card', grid);
const input = $('#searchInput');
const clearButton = $('#clearSearch');
const sortSelect = $('#sortOrder');
const filterButtons = $$('.filters [data-category]');
const layoutButtons = $$('button[data-layout]');
const countEl = $('#resultCount');
const emptyEl = $('#emptyState');
const state = { category: 'all', sort: 'default', layout: 'grid' };
const index = new Map(cards.map(card => [card, normalizeSearch(card.dataset.search || card.textContent)]));
const labelOf = card => card.querySelector('.card__link')?.textContent.trim() || '';

if (location.protocol === 'file:') {
  $('main')?.prepend(el('p', { class: 'container file-warning', role: 'alert' }, t('home.fileProtocol')));
}

/* ---------- Keşif durumu: URL'nin kendisi ---------- */
function writeUrl(push = false) {
  const url = new URL(location.href);
  const values = {
    q: input.value.trim(),
    category: state.category === 'all' ? '' : state.category,
    sort: state.sort === 'default' ? '' : state.sort,
    view: state.layout === 'grid' ? '' : state.layout,
  };
  for (const [key, value] of Object.entries(values)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  if (url.href !== location.href) {
    history[push ? 'pushState' : 'replaceState'](null, '', url);
    announceUrlChange();
  }
}

function applyFilter() {
  const words = normalizeSearch(input.value).split(' ').filter(Boolean);
  const matches = cards.filter(card => words.every(word => index.get(card).includes(word)));
  const matchSet = new Set(matches);
  let visible = 0;
  for (const card of cards) {
    const show = matchSet.has(card) && (state.category === 'all' || card.dataset.category === state.category);
    card.hidden = !show;
    if (show) visible += 1;
    else card.querySelector('video')?.pause();
  }
  for (const button of filterButtons) {
    const category = button.dataset.category;
    button.setAttribute('aria-pressed', String(category === state.category));
    const count = category === 'all' ? matches.length : matches.filter(card => card.dataset.category === category).length;
    const badge = button.querySelector('.filter__count');
    if (badge) badge.textContent = String(count);
    button.classList.toggle('is-empty', count === 0 && category !== state.category);
  }
  clearButton.hidden = !input.value;
  input.closest('.field')?.classList.toggle('has-value', Boolean(input.value));
  emptyEl.hidden = visible !== 0;
  grid.dataset.filtered = String(visible !== cards.length);
  countEl.textContent = visible === cards.length
    ? t('home.countAll', { n: cards.length })
    : t('home.countFiltered', { n: visible, total: cards.length });
}

function applySort() {
  const ordered = [...cards];
  if (state.sort === 'az') ordered.sort((a, b) => compare(labelOf(a), labelOf(b)));
  else if (state.sort === 'size') ordered.sort((a, b) => Number(a.dataset.size) - Number(b.dataset.size));
  else ordered.sort((a, b) => Number(a.dataset.order) - Number(b.dataset.order));
  grid.append(...ordered);
  sortSelect.value = state.sort;
  grid.dataset.sort = state.sort;
}

function applyLayout() {
  grid.dataset.layout = state.layout;
  for (const button of layoutButtons) button.setAttribute('aria-pressed', String(button.dataset.layout === state.layout));
}

function readUrl() {
  const params = new URLSearchParams(location.search);
  input.value = params.get('q') || '';
  const category = params.get('category');
  state.category = filterButtons.some(button => button.dataset.category === category) ? category : 'all';
  state.sort = ['az', 'size'].includes(params.get('sort')) ? params.get('sort') : 'default';
  state.layout = params.get('view') === 'list' ? 'list' : 'grid';
  applySort();
  applyLayout();
  applyFilter();
}

let searchTracked = false;
input.addEventListener('input', () => {
  applyFilter();
  writeUrl();
  if (!searchTracked && input.value.trim().length > 2) {
    searchTracked = true;
    track('search');
  }
});
clearButton.addEventListener('click', () => {
  input.value = '';
  applyFilter();
  writeUrl();
  input.focus();
});
for (const button of filterButtons) {
  button.addEventListener('click', () => {
    state.category = button.dataset.category;
    applyFilter();
    writeUrl(true);
  });
}
sortSelect.addEventListener('change', () => {
  state.sort = sortSelect.value;
  applySort();
  writeUrl(true);
});
for (const button of layoutButtons) {
  button.addEventListener('click', () => {
    state.layout = button.dataset.layout;
    applyLayout();
    writeUrl(true);
  });
}
$('#resetFilters')?.addEventListener('click', () => {
  input.value = '';
  state.category = 'all';
  applyFilter();
  writeUrl(true);
  input.focus();
});
window.addEventListener('popstate', readUrl);
window.addEventListener('pageshow', (event) => { if (event.persisted) readUrl(); });

document.addEventListener('keydown', (event) => {
  const editing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
  if (event.key === '/' && !editing && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    input.focus();
    input.select();
  } else if (event.key === 'Escape' && document.activeElement === input && input.value) {
    input.value = '';
    applyFilter();
    writeUrl();
  }
});

readUrl();

/* ---------- Kart medyası ---------- */
function posterFallback(title) {
  const safe = String(title || '3D').slice(0, 60).replace(/[<>&"]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">`
    + `<rect width="1600" height="1000" fill="#efede7"/><text x="800" y="530" text-anchor="middle" font-size="72" `
    + `font-weight="700" fill="#545049" font-family="system-ui, sans-serif">${safe}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

for (const media of $$('[data-lqip]')) {
  const image = media.querySelector('img');
  if (!image) continue;
  const ready = () => media.classList.add('is-ready');
  if (image.complete && image.naturalWidth > 0) ready();
  else image.addEventListener('load', ready, { once: true });
  image.addEventListener('error', () => {
    if (image.dataset.fallback) return;
    image.dataset.fallback = '1';
    image.closest('picture')?.querySelectorAll('source').forEach(source => source.remove());
    image.src = posterFallback(media.closest('.card') ? labelOf(media.closest('.card')) : '');
  }, { once: true });
}

/* ---------- Görüntüleyiciye geçiş ----------
   Galeri durumu oturumda saklanır (görüntüleyicinin "geri" bağlantısı onu
   kullanır); tıklanan kartın posteri sahneye dönüşür (View Transitions). */
function clearTransitionNames() {
  for (const image of $$('.card__poster, .hero__poster')) image.style.removeProperty('view-transition-name');
}
document.addEventListener('click', (event) => {
  const link = event.target.closest?.('[data-model-link]');
  if (!link) return;
  session.set('oku-explore-url', `${location.pathname}${location.search}#explore`);
  clearTransitionNames();
  const media = link.closest('.card')?.querySelector('.card__poster') || (link.matches('.hero__stage') ? $('.hero__poster') : null);
  if (media) media.style.viewTransitionName = 'model-media';
  track('open_from_home', { id: link.closest('.card')?.dataset.id || link.dataset.id || '' });
});
window.addEventListener('pageshow', clearTransitionNames);

/* ---------- Kaldığınız yerden ---------- */
(() => {
  const lastId = store.get('oku-last-model');
  const card = cards.find(item => item.dataset.id === lastId);
  const link = $('#continueLink');
  if (!card || !link) return;
  link.href = card.querySelector('.card__link').href;
  link.querySelector('[data-continue-name]').textContent = labelOf(card);
  link.dataset.modelLink = '';
  link.hidden = false;
})();

/* ---------- AR rozeti: yalnızca cihaz gerçekten destekliyorsa ---------- */
(async () => {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let supported = ios && Boolean(document.createElement('a').relList?.supports?.('ar'));
  if (!supported && navigator.xr?.isSessionSupported && window.isSecureContext) {
    try { supported = await navigator.xr.isSessionSupported('immersive-ar'); } catch { supported = false; }
  }
  document.documentElement.dataset.ar = supported ? 'ready' : 'unavailable';
  if (!supported) return;
  for (const badge of $$('[data-ar-badge]')) {
    badge.hidden = false;
    badge.title = t('home.arBadgeReady');
  }
})();

/* ---------- Turntable döngüleri ----------
   Yalnızca fare/kalemle gezinilen, hareket azaltma istemeyen ve veri
   tasarrufunda olmayan cihazlarda. VP9 alfa desteği sorgulanamadığı için
   ilk karede ölçülür: köşe saydam değilse videolar kaldırılır. */
const turntables = $$('.card__turntable');
const canHover = () => window.matchMedia?.('(hover: hover) and (pointer: fine)').matches
  && !prefersReducedMotion() && !limitedConnection();
let alphaVerdict = null;

function hasAlpha(video) {
  try {
    const canvas = el('canvas', { width: 32, height: 20 });
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(video, 0, 0, 32, 20);
    return [[1, 1], [30, 1], [1, 18], [30, 18]].some(([x, y]) => context.getImageData(x, y, 1, 1).data[3] < 250);
  } catch {
    return false;
  }
}

if (turntables.length && canHover()) {
  for (const video of turntables) {
    const card = video.closest('.card');
    card.addEventListener('pointerenter', () => {
      if (alphaVerdict === false || document.hidden || !canHover()) return;
      video.play()?.catch?.(() => {});
    });
    card.addEventListener('pointerleave', () => {
      video.pause();
      video.currentTime = 0;
    });
    video.addEventListener('loadeddata', () => {
      if (alphaVerdict === null) alphaVerdict = hasAlpha(video);
      if (alphaVerdict) video.classList.add('is-ready');
      else turntables.forEach(item => item.remove());
    }, { once: true });
  }
} else {
  turntables.forEach(video => video.remove());
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) turntables.forEach(video => video.pause());
});

/* ---------- Kahraman sahnesi: hafif derinlik efekti ---------- */
const stage = $('[data-tilt]');
if (stage && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches && !prefersReducedMotion()) {
  let frame = 0;
  stage.addEventListener('pointermove', (event) => {
    const rect = stage.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      stage.style.setProperty('--tilt-x', `${(-y * 5).toFixed(2)}deg`);
      stage.style.setProperty('--tilt-y', `${(x * 7).toFixed(2)}deg`);
      stage.style.setProperty('--glow-x', `${((x + 0.5) * 100).toFixed(1)}%`);
      stage.style.setProperty('--glow-y', `${((y + 0.5) * 100).toFixed(1)}%`);
    });
  });
  stage.addEventListener('pointerleave', () => {
    cancelAnimationFrame(frame);
    for (const name of ['--tilt-x', '--tilt-y', '--glow-x', '--glow-y']) stage.style.removeProperty(name);
  });
}

/* ---------- Harita önizlemesi: liste ↔ işaretçi vurgusu ---------- */
for (const link of $$('[data-pin-link]')) {
  const pin = document.querySelector(`[data-pin="${CSS.escape(link.dataset.pinLink)}"]`);
  if (!pin) continue;
  const on = () => pin.classList.add('is-active');
  const off = () => pin.classList.remove('is-active');
  for (const [target, other] of [[link, pin], [pin, link]]) {
    target.addEventListener('pointerenter', () => { on(); other.classList.add('is-active'); });
    target.addEventListener('pointerleave', () => { off(); other.classList.remove('is-active'); });
    target.addEventListener('focus', () => { on(); other.classList.add('is-active'); });
    target.addEventListener('blur', () => { off(); other.classList.remove('is-active'); });
  }
}

/* ---------- Uygulama olarak yükleme önerisi ----------
   Yalnızca ikinci ziyaretten sonra ve bir kez; reddedilirse bir daha sorulmaz. */
const visits = (Number.parseInt(store.get('gallery-visits'), 10) || 0) + 1;
store.set('gallery-visits', visits);
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  if (visits < 2 || store.get('gallery-install-dismissed') === '1' || $('.install-bar')) return;
  const bar = el('div', { class: 'install-bar container', role: 'region', 'aria-label': t('home.installAccept') },
    el('p', {}, t('home.installText')));
  const accept = el('button', { class: 'btn btn--primary btn--sm', type: 'button' }, t('home.installAccept'));
  const dismiss = el('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, t('home.installDismiss'));
  accept.addEventListener('click', async () => {
    bar.remove();
    try { await event.prompt(); } catch { /* kullanıcı vazgeçti */ }
  });
  dismiss.addEventListener('click', () => {
    store.set('gallery-install-dismissed', '1');
    bar.remove();
  });
  bar.append(el('div', { class: 'install-bar__actions' }, accept, dismiss));
  $('.hero')?.after(bar);
});

track('home_view', { n: cards.length });
