/* Kampüs haritası.

   Taban görsel, yerleşke genel planı modelinin tepeden render'ıdır
   (tools/build_map.mjs). İşaretçi konumları models.json → map.x/y alanından
   gelir ve görselin 0–1 normalize uzayındadır; konumu olmayan yapı haritada
   gösterilmez (uydurulmaz). Yerleştirme ?edit=map modunda tıklanarak yapılır.

   Kaydırma/yakınlaştırma CSS dönüşümüyle yapılır. DİKKAT: pointerdown'da
   setPointerCapture ÇAĞRILMAZ — yakalama tarayıcının click olayını görüntü
   alanına yönlendirir ve işaretçi düğmeleri tıklanamaz hâle gelir (canlıya
   çıkmış bir regresyon). Yakalama yalnızca sürükleme eşiği aşılınca yapılır. */

import { CATALOG } from './catalog.js?v=21de442a47';
import { t, localized, localizedList } from './core/i18n.js?v=425bd5c155';
import { $, $$, el, icon, initPage, pageUrl, siteUrl, track } from './core/site.js?v=18aec0c522';

initPage();

const viewport = $('#mapViewport');
const canvas = $('#mapCanvas');
const image = $('#mapImage');
const markerLayer = $('#mapMarkers');
const panel = $('#mapPanel');
const list = $('#mapList');
const status = $('#mapStatus');
const params = new URLSearchParams(location.search);
const editMode = ['1', 'true', 'map', 'on'].includes((params.get('edit') || '').toLowerCase());
const models = Array.isArray(CATALOG?.models) ? CATALOG.models : [];
const placed = models.filter(m => m?.map && Number.isFinite(Number(m.map.x)) && Number.isFinite(Number(m.map.y)));
const byId = new Map(models.map(m => [String(m.id), m]));
const mobile = window.matchMedia('(max-width: 899px)');

/* ---------- Görünüm dönüşümü ---------- */
const view = { scale: 1, x: 0, y: 0, fit: 1 };
const MAX_SCALE = 5;
let box = { width: 0, height: 0 };

const size = () => ({ width: image.naturalWidth || image.width || 1, height: image.naturalHeight || image.height || 1 });

/** Mobilde alt sayfanın kapladığı alan dışında kalan görünür bölge. */
function visible() {
  const rect = viewport.getBoundingClientRect();
  let height = rect.height;
  if (mobile.matches) {
    const sheet = $('#mapSide').getBoundingClientRect();
    if (sheet.top < rect.bottom) height = Math.max(160, sheet.top - rect.top);
  }
  return { left: rect.left, top: rect.top, width: rect.width, height };
}

function apply() {
  canvas.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  canvas.style.setProperty('--inverse', String(1 / view.scale));
  viewport.dataset.zoomed = String(view.scale > view.fit * 1.6);
}

function clamp() {
  const { width, height } = size();
  const area = visible();
  const w = width * view.scale;
  const h = height * view.scale;
  view.x = w <= area.width ? (area.width - w) / 2 : Math.min(0, Math.max(area.width - w, view.x));
  view.y = h <= area.height ? (area.height - h) / 2 : Math.min(0, Math.max(area.height - h, view.y));
}

function fit() {
  canvas.classList.remove('is-animating');
  const { width, height } = size();
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const area = visible();
  if (!area.width || !area.height) return;
  box = area;
  view.fit = Math.min(area.width / width, area.height / height) * 0.94;
  view.scale = view.fit;
  clamp();
  apply();
}

function zoomAt(factor, clientX, clientY) {
  if (!Number.isFinite(factor) || factor <= 0) return;
  const area = visible();
  const px = (clientX ?? area.left + area.width / 2) - area.left;
  const py = (clientY ?? area.top + area.height / 2) - area.top;
  const next = Math.min(MAX_SCALE, Math.max(view.fit, view.scale * factor));
  if (next === view.scale) return;
  canvas.classList.remove('is-animating');
  view.x = px - ((px - view.x) * next) / view.scale;
  view.y = py - ((py - view.y) * next) / view.scale;
  view.scale = next;
  clamp();
  apply();
}

function centerOn(nx, ny, scale) {
  const { width, height } = size();
  const area = visible();
  view.scale = Math.min(MAX_SCALE, Math.max(view.fit, scale ?? view.fit * 2.2));
  view.x = area.width / 2 - nx * width * view.scale;
  view.y = area.height / 2 - ny * height * view.scale;
  clamp();
  canvas.classList.add('is-animating');
  apply();
  window.setTimeout(() => canvas.classList.remove('is-animating'), 450);
}

$('#zoomIn').addEventListener('click', () => zoomAt(1.4));
$('#zoomOut').addEventListener('click', () => zoomAt(1 / 1.4));
$('#zoomFit').addEventListener('click', fit);
viewport.addEventListener('wheel', (event) => {
  event.preventDefault();
  zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX, event.clientY);
}, { passive: false });

/* ---------- Sürükleme ve iki parmakla yakınlaştırma ---------- */
const pointers = new Map();
const captured = new Set();
let dragged = false;
let pinch = null;
const DRAG_THRESHOLD = 4;

viewport.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, sx: event.clientX, sy: event.clientY });
  dragged = false;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: view.scale };
  }
});

viewport.addEventListener('pointermove', (event) => {
  const previous = pointers.get(event.pointerId);
  if (!previous) return;
  const dx = event.clientX - previous.x;
  const dy = event.clientY - previous.y;
  pointers.set(event.pointerId, { ...previous, x: event.clientX, y: event.clientY });
  if (!dragged && Math.hypot(event.clientX - previous.sx, event.clientY - previous.sy) < DRAG_THRESHOLD && pointers.size < 2) return;
  if (!dragged) {
    dragged = true;
    viewport.classList.add('is-panning');
    try {
      viewport.setPointerCapture(event.pointerId);
      captured.add(event.pointerId);
    } catch { /* yakalama yoksa sürükleme yine çalışır */ }
  }
  if (pointers.size === 2 && pinch) {
    const [a, b] = [...pointers.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    zoomAt((distance / pinch.distance) * (pinch.scale / view.scale), (a.x + b.x) / 2, (a.y + b.y) / 2);
    return;
  }
  view.x += dx;
  view.y += dy;
  clamp();
  apply();
});

function endPointer(event) {
  pointers.delete(event.pointerId);
  if (captured.delete(event.pointerId)) {
    try { viewport.releasePointerCapture(event.pointerId); } catch { /* yok say */ }
  }
  if (pointers.size < 2) pinch = null;
  if (!pointers.size) {
    viewport.classList.remove('is-panning');
    // Tıklama işleyicileri `dragged` değerini okuduktan sonra sıfırlanır.
    window.setTimeout(() => { dragged = false; }, 0);
  }
}
window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);

window.addEventListener('resize', () => {
  const ratio = view.scale / view.fit;
  const { width, height } = size();
  const cx = (box.width / 2 - view.x) / (width * view.scale);
  const cy = (box.height / 2 - view.y) / (height * view.scale);
  fit();
  if (ratio > 1.001) centerOn(cx, cy, view.fit * ratio);
});

viewport.addEventListener('keydown', (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const step = event.shiftKey ? 140 : 50;
  const pan = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[event.key];
  if (pan) {
    event.preventDefault();
    view.x += pan[0];
    view.y += pan[1];
    clamp();
    apply();
  } else if (['+', '=', '-', '−', '0'].includes(event.key)) {
    event.preventDefault();
    if (event.key === '0') fit();
    else zoomAt(event.key === '+' || event.key === '=' ? 1.4 : 1 / 1.4);
  }
});

/* ---------- Seçim paneli ---------- */
let activeId = '';

function setPressed(id) {
  for (const node of [...markerLayer.children, ...$$('[data-id]', list)]) {
    const on = node.dataset.id === id;
    node.classList.toggle('is-active', on);
    node.setAttribute('aria-pressed', String(on));
  }
}

function writeFocus(id) {
  const url = new URL(location.href);
  if (id) url.searchParams.set('focus', id);
  else url.searchParams.delete('focus');
  history.replaceState(null, '', url);
  document.dispatchEvent(new Event('oku:url'));
}

function closePanel({ restoreFocus = true } = {}) {
  if (!activeId) return;
  const previous = activeId;
  activeId = '';
  panel.hidden = true;
  document.body.classList.remove('has-selection');
  setPressed('');
  writeFocus('');
  status.textContent = t('map.cleared');
  clamp();
  apply();
  if (restoreFocus) markerLayer.querySelector(`[data-id="${CSS.escape(previous)}"]`)?.focus({ preventScroll: true });
}

function openPanel(model, { fromList = false } = {}) {
  activeId = String(model.id);
  setPressed(activeId);
  writeFocus(activeId);
  const label = localized(model, 'label');

  const media = $('#mapPanelMedia');
  media.textContent = '';
  if (model.poster) {
    media.dataset.lqip = model.id;
    const poster = el('img', { src: siteUrl(model.poster), alt: '', width: '1600', height: '1000', decoding: 'async' });
    poster.addEventListener('load', () => media.classList.add('is-ready'), { once: true });
    media.classList.remove('is-ready');
    media.append(poster);
  }
  $('#mapPanelEyebrow').textContent = model.category ? t(`categories.${model.category}`) : '';
  $('#mapPanelTitle').textContent = localized(model, 'officialName') || label;
  $('#mapPanelType').textContent = localized(model, 'type') || '';
  $('#mapPanelDesc').textContent = localized(model, 'description') || '';

  const actions = $('#mapPanelActions');
  actions.textContent = '';
  actions.append(el('a', { class: 'btn btn--primary btn--sm', href: pageUrl(`viewer.html?id=${encodeURIComponent(model.id)}`) }, icon('cube', 'icon-sm'), t('map.open3d')));
  actions.append(el('a', { class: 'btn btn--sm', href: pageUrl(`${encodeURIComponent(model.id)}/`) }, icon('building', 'icon-sm'), t('map.page')));
  const lat = Number(model.geo?.lat);
  const lng = Number(model.geo?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    actions.append(el('a', {
      class: 'btn btn--sm', href: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, target: '_blank', rel: 'noopener noreferrer',
    }, icon('navigation', 'icon-sm'), t('map.directions')));
  }

  const meta = $('#mapPanelMeta');
  meta.textContent = '';
  if (model.map?.confirmed === false) meta.append(el('span', { class: 'map-panel__warn' }, t('map.unconfirmed')));
  const sources = localizedList(model, 'sources', 'label').filter(s => s?.label && /^https?:\/\//.test(String(s.url || '')));
  if (sources.length) {
    meta.append(el('span', {}, `${t('map.sources')}: `));
    sources.forEach((source, index) => {
      if (index) meta.append(' · ');
      meta.append(el('a', { href: source.url, target: '_blank', rel: 'noopener noreferrer' }, source.label));
    });
  }

  panel.hidden = false;
  document.body.classList.add('has-selection');
  centerOn(Number(model.map.x), Number(model.map.y), Math.max(view.scale, view.fit * 1.8));
  status.textContent = t('map.selected', { name: label });
  if (!fromList) $('#mapPanelClose').focus({ preventScroll: true });
  if (fromList && mobile.matches) panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  track('map_select', { id: model.id });
}

$('#mapPanelClose').addEventListener('click', () => closePanel());
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && activeId) closePanel();
});

/* ---------- İşaretçiler ---------- */
function renderMarkers() {
  markerLayer.textContent = '';
  for (const model of placed) {
    const label = localized(model, 'label');
    const button = el('button', {
      type: 'button',
      class: `marker${model.map.confirmed === false ? ' is-unconfirmed' : ''}`,
      'data-id': String(model.id),
      'aria-pressed': 'false',
      'aria-label': t('map.markerAria', { name: label }),
    }, el('span', { class: 'marker__dot', 'aria-hidden': 'true' }), el('span', { class: 'marker__label' }, label));
    button.style.left = `${Number(model.map.x) * 100}%`;
    button.style.top = `${Number(model.map.y) * 100}%`;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (dragged) return;
      openPanel(model);
    });
    markerLayer.append(button);
  }
}

for (const item of $$('[data-id]', list)) {
  item.addEventListener('click', () => {
    const model = byId.get(item.dataset.id);
    if (model?.map) openPanel(model, { fromList: true });
  });
  item.addEventListener('pointerenter', () => markerLayer.querySelector(`[data-id="${CSS.escape(item.dataset.id)}"]`)?.classList.add('is-hover'));
  item.addEventListener('pointerleave', () => markerLayer.querySelector(`[data-id="${CSS.escape(item.dataset.id)}"]`)?.classList.remove('is-hover'));
}
for (const thumb of $$('[data-lqip] img', list)) {
  const ready = () => thumb.parentElement.classList.add('is-ready');
  if (thumb.complete && thumb.naturalWidth) ready();
  else thumb.addEventListener('load', ready, { once: true });
}

/* ---------- Yerleştirme modu (?edit=map) ---------- */
function setupEditor() {
  const draft = new Map();
  const select = el('select', { class: 'select', 'aria-label': t('map.editorTitle') },
    ...models.map(m => el('option', { value: String(m.id) }, `${localized(m, 'label')} (${m.id})`)));
  const output = el('pre', { class: 'map-editor__output', tabindex: '0' }, '{}');
  const copy = el('button', { class: 'btn btn--primary btn--sm', type: 'button' }, t('map.editorCopy'));
  const clear = el('button', { class: 'btn btn--sm', type: 'button' }, t('map.editorClear'));
  const editor = el('section', { class: 'map-editor', 'aria-label': t('map.editorTitle') },
    el('h2', {}, t('map.editorTitle')), el('p', {}, t('map.editorHint')), select, output, el('div', { class: 'map-editor__actions' }, copy, clear));
  $('#mapStage').append(editor);
  const refresh = () => {
    const payload = {};
    for (const [id, point] of draft) payload[id] = { map: { x: point.x, y: point.y, confirmed: true } };
    output.textContent = JSON.stringify(payload, null, 2);
  };
  viewport.addEventListener('click', (event) => {
    if (dragged) return;
    const rect = image.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    const id = select.value;
    draft.set(id, { x: Number(x.toFixed(4)), y: Number(y.toFixed(4)) });
    const model = byId.get(id);
    if (model) {
      model.map = { ...draft.get(id), confirmed: true };
      if (!placed.includes(model)) placed.push(model);
      renderMarkers();
      apply();
    }
    refresh();
    if (select.selectedIndex < select.options.length - 1) select.selectedIndex += 1;
  });
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(output.textContent);
      status.textContent = t('map.editorCopied');
    } catch { output.focus(); }
  });
  clear.addEventListener('click', () => { draft.clear(); refresh(); });
}

/* ---------- Başlat ---------- */
function start() {
  fit();
  renderMarkers();
  apply();
  if (editMode) setupEditor();
  const focus = (params.get('focus') || '').trim();
  const model = placed.find(item => String(item.id) === focus);
  if (model) openPanel(model, { fromList: true });
  track('map_view', { n: placed.length });
}

image.addEventListener('error', () => {
  $('#mapStage').append(el('p', { class: 'map-error', role: 'alert' }, t('map.imageError')));
});
if (image.complete && image.naturalWidth) start();
else image.addEventListener('load', start, { once: true });
