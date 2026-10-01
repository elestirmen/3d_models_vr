/* =========================================================
   3D Model Galerisi — etkileşim katmanı
   ========================================================= */

const root = document.documentElement;
const input = document.getElementById('searchInput');
const clearBtn = document.getElementById('clearSearch');
const searchWrap = input ? input.closest('.search') : null;
const cards = Array.from(document.querySelectorAll('.card'));
const countEl = document.getElementById('count');
const emptyEl = document.getElementById('empty');
const themeToggle = document.getElementById('themeToggle');

/* ---------- Tema (açık / koyu) ---------- */
const THEME_KEY = 'gallery-theme';

function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') {
    root.setAttribute('data-theme', theme);
  } else {
    root.removeAttribute('data-theme');
  }
  updateThemeControl();
}

function resolvedTheme() {
  const selected = root.getAttribute('data-theme');
  if (selected === 'light' || selected === 'dark') return selected;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function updateThemeControl() {
  if (!themeToggle) return;
  const current = resolvedTheme();
  const targetLabel = current === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç';
  themeToggle.setAttribute('aria-label', targetLabel);
  themeToggle.setAttribute('title', targetLabel);
  themeToggle.setAttribute('aria-pressed', current === 'dark' ? 'true' : 'false');
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.setAttribute('content', current === 'dark' ? '#14191f' : '#f9fafb');
}

try {
  applyTheme(localStorage.getItem(THEME_KEY));
} catch { /* localStorage kapalı olabilir */ }

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const prefersDark = window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    const current = root.getAttribute('data-theme') ||
      (prefersDark ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* yok say */ }
  });
}

try {
  const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
  colorScheme.addEventListener('change', updateThemeControl);
} catch { /* eski tarayıcılar */ }

/* ---------- file:// uyarısı ---------- */
function showBanner(html) {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const div = document.createElement('div');
  div.className = 'banner';
  div.innerHTML = html;
  hero.insertAdjacentElement('afterend', div);
}

if (location.protocol === 'file:') {
  showBanner(
    '<strong>Uyarı:</strong> 3D modeller tarayıcı güvenliği nedeniyle <code>file://</code> üzerinden yüklenemez. ' +
    'Yerel sunucu ile açın: <code>python3 -m http.server 8000</code> ardından <code>http://localhost:8000/</code> adresini açın.'
  );
}

/* ---------- Shareable discovery state ---------- */
const grid = document.getElementById('grid');
const sortOrder = document.getElementById('sortOrder');
const filterButtons = [...document.querySelectorAll('.filters [data-category]')];
const layoutButtons = [...document.querySelectorAll('[data-layout]')];
const collator = new Intl.Collator('tr', { numeric: true, sensitivity: 'base' });
const state = { category: 'all', sort: 'default', layout: 'grid' };

function normalize(value) {
  return String(value || '').toLocaleLowerCase('tr-TR').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

// Normalize the catalogue once, not on every keystroke.
const searchIndex = new Map(cards.map(card => [card, normalize(card.dataset.title || card.textContent)]));

function saveUrl(push = false) {
  const url = new URL(location.href);
  const values = { q: input.value.trim(), category: state.category === 'all' ? '' : state.category,
    sort: state.sort === 'default' ? '' : state.sort, view: state.layout === 'grid' ? '' : state.layout };
  for (const [key, value] of Object.entries(values)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  if (url.href !== location.href) history[push ? 'pushState' : 'replaceState'](null, '', url);
}

function applyFilter() {
  const words = normalize(input.value).split(' ').filter(Boolean);
  const matches = cards.filter(card => words.every(word => searchIndex.get(card).includes(word)));
  const matchSet = new Set(matches);
  let visible = 0;
  for (const card of cards) {
    const show = matchSet.has(card) && (state.category === 'all' || card.dataset.category === state.category);
    card.classList.toggle('is-hidden', !show);
    if (show) visible++;
    else card.querySelector('video')?.pause();
  }
  for (const button of filterButtons) {
    const category = button.dataset.category;
    button.setAttribute('aria-pressed', String(category === state.category));
    button.querySelector('span').textContent = category === 'all' ? matches.length
      : matches.filter(card => card.dataset.category === category).length;
  }
  searchWrap?.classList.toggle('has-value', Boolean(input.value));
  clearBtn.hidden = !input.value;
  emptyEl?.classList.toggle('is-hidden', visible !== 0);
  if (countEl) countEl.textContent = visible === cards.length ? `${visible} yapı ve plan` : `${visible} / ${cards.length} sonuç`;
}

function applySort() {
  const ordered = [...cards];
  if (state.sort === 'az') ordered.sort((a, b) => collator.compare(a.querySelector('.label').textContent, b.querySelector('.label').textContent));
  if (state.sort === 'size') ordered.sort((a, b) => Number(a.dataset.size) - Number(b.dataset.size));
  grid.append(...ordered);
  sortOrder.value = state.sort;
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
input?.addEventListener('input', () => { applyFilter(); saveUrl(); });
clearBtn?.addEventListener('click', () => { input.value = ''; applyFilter(); saveUrl(); input.focus(); });
filterButtons.forEach(button => button.addEventListener('click', () => {
  state.category = button.dataset.category;
  applyFilter(); saveUrl(true);
}));
sortOrder?.addEventListener('change', () => { state.sort = sortOrder.value; applySort(); saveUrl(true); });
layoutButtons.forEach(button => button.addEventListener('click', () => {
  state.layout = button.dataset.layout;
  applyLayout(); saveUrl(true);
}));
document.getElementById('resetFilters')?.addEventListener('click', () => {
  input.value = ''; state.category = 'all'; applyFilter(); saveUrl(true); input.focus();
});
window.addEventListener('popstate', readUrl);
window.addEventListener('pageshow', readUrl);
document.addEventListener('keydown', event => {
  const editing = event.target.matches('input, textarea, select, [contenteditable="true"]');
  if (event.key === '/' && !editing && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault(); input.focus(); input.select();
  }
  if (event.key === 'Escape' && document.activeElement === input && input.value) {
    input.value = ''; applyFilter(); saveUrl();
  }
});
readUrl();

// A previous visit is only offered when it still exists in the current catalogue.
try {
  const lastId = localStorage.getItem('oku-last-model');
  const card = cards.find(item => item.dataset.id === lastId);
  const link = document.getElementById('continueExploring');
  if (card && link) {
    link.href = card.href;
    link.textContent = `Kaldığınız yerden devam edin: ${card.querySelector('.label').textContent} →`;
    link.hidden = false;
  }
} catch { /* Storage access is optional. */ }

/* ---------- Poster yüklenemezse SVG yedek ---------- */
function posterDataUri({ title = '3D Model', emoji = '🏢' } = {}) {
  const safeTitle = (title || '3D Model').toString().slice(0, 80).replace(/[<>&]/g, '');
  const safeEmoji = (emoji || '🏢').toString().slice(0, 4);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">` +
    `<rect width="1200" height="675" fill="#ececed"/>` +
    `<text x="600" y="322" text-anchor="middle" font-size="116" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial">${safeEmoji}</text>` +
    `<text x="600" y="432" text-anchor="middle" font-size="50" font-weight="700" fill="#27272a" ` +
    `font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial">${safeTitle}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

for (const card of cards) {
  const img = card.querySelector('.thumb');
  if (!img) continue;
  const media = img.closest('.card-media');

  const markReady = () => {
    img.dataset.loaded = '1';
    media?.classList.add('is-ready');
  };

  if (img.complete && img.naturalWidth > 0) markReady();
  else img.addEventListener('load', markReady, { once: true });

  img.addEventListener('error', () => {
    if (img.dataset.fallbackApplied === '1') return;
    img.dataset.fallbackApplied = '1';
    const title = card.querySelector('.label')?.textContent?.trim() || card.dataset.title || '3D Model';
    const emoji = card.querySelector('.emoji')?.textContent?.trim() || '🏢';
    img.closest('picture')?.querySelectorAll('source').forEach(source => source.remove());
    img.src = posterDataUri({ title, emoji });
    img.addEventListener('load', markReady, { once: true });
  }, { once: true });
}

/* ---------- Sayfa geçişi: kart posteri sahneye dönüşür ----------
   Cross-document View Transitions yalnızca destekleyen tarayıcılarda
   çalışır; adı vermek diğerlerinde etkisizdir. */
const VIEW_TRANSITION_NAME = 'model-media';

function clearTransitionNames() {
  for (const card of cards) {
    card.querySelector('.thumb')?.style.removeProperty('view-transition-name');
  }
}

for (const card of cards) {
  card.addEventListener('click', () => {
    try { sessionStorage.setItem('oku-explore-url', location.pathname + location.search + '#explore'); } catch { /* optional */ }
    clearTransitionNames();
    const img = card.querySelector('.thumb');
    if (img) img.style.viewTransitionName = VIEW_TRANSITION_NAME;
  });
}

// Geri dönüldüğünde ad kalmasın (aynı ad tek ögede bulunabilir).
window.addEventListener('pageshow', clearTransitionNames);

/* ---------- AR rozeti: gerçek cihaz yeteneği ----------
   Rozet, cihaz yeteneği ölçülene kadar "AR uyumlu" (nötr) kalır. Böylece
   AR desteklemeyen bir cihazda karşılanmayacak bir vaat gösterilmez. */

function isIOSLike() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

async function detectArSupport() {
  // iOS'ta WebXR yoktur; AR, Quick Look üzerinden çalışır.
  if (isIOSLike()) return true;
  try {
    if (navigator.xr && typeof navigator.xr.isSessionSupported === 'function') {
      return await navigator.xr.isSessionSupported('immersive-ar');
    }
  } catch { /* izin/güvenli bağlam yok */ }
  return false;
}

function applyArBadgeState(supported) {
  const badges = document.querySelectorAll('[data-ar-badge]');
  for (const badge of badges) {
    const text = badge.querySelector('.badge-ar-text');
    badge.dataset.arState = supported ? 'ready' : 'unavailable';
    if (text) text.textContent = supported ? 'AR hazır' : 'AR uyumlu';
    badge.title = supported
      ? 'Bu cihazda modeli kendi ortamınıza yerleştirebilirsiniz'
      : 'Model AR uyumlu, ancak bu cihaz veya tarayıcı AR desteklemiyor';
  }
}

void detectArSupport().then(applyArBadgeState).catch(() => applyArBadgeState(false));

/* ---------- Turntable döngüsü ----------
   Yalnızca fare ile gezinilen ve hareket azaltma istemeyen cihazlarda oynar.
   VP9 alfa desteği tarayıcıdan sorgulanamadığı için ilk karede ölçülür:
   köşe pikselleri saydam değilse alfa desteklenmiyor demektir ve videolar
   tamamen kaldırılıp poster korunur. */

const turntables = Array.from(document.querySelectorAll('.turntable'));

function canHover() {
  try {
    return !navigator.connection?.saveData && !['slow-2g', '2g', '3g'].includes(navigator.connection?.effectiveType) &&
      window.matchMedia('(hover: hover)').matches &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function hasTransparentCorner(video) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 20;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return false;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    for (const [x, y] of [[1, 1], [30, 1], [1, 18], [30, 18]]) {
      if (context.getImageData(x, y, 1, 1).data[3] < 250) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function dropTurntables() {
  for (const video of turntables) {
    video.pause();
    video.remove();
  }
  turntables.length = 0;
}

let alphaChecked = false;

if (turntables.length && canHover()) {
  for (const video of turntables) {
    const card = video.closest('.card');
    if (!card) continue;

    card.addEventListener('pointerenter', () => {
      if (video.dataset.failed === '1' || !canHover() || document.hidden) return;
      const playback = video.play();
      if (playback?.catch) playback.catch(() => { video.dataset.failed = '1'; });
    });

    card.addEventListener('pointerleave', () => {
      video.pause();
      video.currentTime = 0;
    });

    video.addEventListener('loadeddata', () => {
      if (!alphaChecked) {
        alphaChecked = true;
        if (!hasTransparentCorner(video)) {
          // Alfa yok: siyah zeminli bir döngü göstermek yerine posterde kalınır.
          dropTurntables();
          return;
        }
      }
      video.classList.add('is-ready');
    }, { once: true });
  }
} else {
  dropTurntables();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) turntables.forEach(video => video.pause());
});

/* ---------- Service worker ve kurulum önerisi ----------
   Galeri de service worker'a kaydolur; böylece ilk ziyaretten sonra
   uygulama kabuğu çevrimdışı açılır. Kurulum önerisi yalnızca ikinci
   ziyaretten sonra ve bir kez gösterilir. */

const VISITS_KEY = 'gallery-visits';
const INSTALL_DISMISSED_KEY = 'gallery-install-dismissed';

if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./geometry-lod-sw.js', { scope: './' })
      .catch((error) => console.warn('Service worker kaydedilemedi:', error));
  });
}

function bumpVisits() {
  try {
    const next = (Number.parseInt(localStorage.getItem(VISITS_KEY), 10) || 0) + 1;
    localStorage.setItem(VISITS_KEY, String(next));
    return next;
  } catch {
    return 1;
  }
}

function installDismissed() {
  try {
    return localStorage.getItem(INSTALL_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

const visits = bumpVisits();
let installEvent = null;

function showInstallBar() {
  if (!installEvent || visits < 2 || installDismissed()) return;
  if (document.querySelector('.install-bar')) return;

  const bar = document.createElement('div');
  bar.className = 'install-bar';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Uygulama olarak yükle');

  const text = document.createElement('p');
  text.textContent = 'Yerleşkeyi uygulama gibi açabilir, binaları çevrimdışı kaydedebilirsiniz.';
  bar.appendChild(text);

  const actions = document.createElement('div');
  actions.className = 'install-bar-actions';

  const install = document.createElement('button');
  install.type = 'button';
  install.className = 'install-accept';
  install.textContent = 'Yükle';
  install.addEventListener('click', async () => {
    const event = installEvent;
    installEvent = null;
    bar.remove();
    try {
      await event.prompt();
    } catch { /* kullanıcı vazgeçti */ }
  });

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'install-dismiss';
  dismiss.textContent = 'Şimdi değil';
  dismiss.addEventListener('click', () => {
    try { localStorage.setItem(INSTALL_DISMISSED_KEY, '1'); } catch { /* yok say */ }
    bar.remove();
  });

  actions.appendChild(install);
  actions.appendChild(dismiss);
  bar.appendChild(actions);
  document.querySelector('.hero')?.insertAdjacentElement('afterend', bar);
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installEvent = event;
  showInstallBar();
});
