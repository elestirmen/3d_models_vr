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

  img.addEventListener('error', () => {
    if (img.dataset.fallbackApplied === '1') return;
    img.dataset.fallbackApplied = '1';
    const title = card.querySelector('.label')?.textContent?.trim() || card.dataset.title || '3D Model';
    const emoji = card.querySelector('.emoji')?.textContent?.trim() || '🏢';
    img.src = posterDataUri({ title, emoji });
  }, { once: true });
}

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
