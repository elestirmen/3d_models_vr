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
  if (themeColor) themeColor.setAttribute('content', current === 'dark' ? '#0e0e10' : '#f6f6f7');
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

/* ---------- Giriş animasyonu için kademeli gecikme ---------- */
cards.forEach((card, i) => {
  card.style.setProperty('--i', String(i));
});

/* ---------- Arama / filtreleme ---------- */
function updateCount(visibleCount) {
  if (!countEl) return;
  countEl.textContent = visibleCount === cards.length
    ? `${cards.length} model`
    : `${visibleCount} / ${cards.length} model`;
}

function normalize(s) {
  return (s || '')
    .toString()
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function applyFilter() {
  const q = normalize(input ? input.value : '');
  let visible = 0;

  for (const card of cards) {
    const hay = normalize(card.dataset.title || card.textContent);
    const ok = !q || hay.includes(q);
    card.classList.toggle('is-hidden', !ok);
    if (ok) visible += 1;
  }

  if (searchWrap) searchWrap.classList.toggle('has-value', Boolean(q));
  if (emptyEl) emptyEl.classList.toggle('is-hidden', visible !== 0);
  updateCount(visible);
}

if (input) {
  input.addEventListener('input', applyFilter);
}

if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    input.value = '';
    input.focus();
    applyFilter();
  });
}

document.addEventListener('keydown', (e) => {
  if (!input) return;
  if (e.key === '/' && document.activeElement !== input) {
    e.preventDefault();
    input.focus();
    input.select();
  }
  if (e.key === 'Escape' && document.activeElement === input && input.value) {
    input.value = '';
    applyFilter();
  }
});

applyFilter();

/* ---------- Poster yüklenemezse SVG yedek ---------- */
function posterDataUri({ title = '3D Model', emoji = '🏢' } = {}) {
  const safeTitle = (title || '3D Model').toString().slice(0, 80);
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
    return window.matchMedia('(hover: hover)').matches &&
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
      if (video.dataset.failed === '1') return;
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
