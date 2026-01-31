const input = document.getElementById('searchInput');
const clearBtn = document.getElementById('clearSearch');
const cards = Array.from(document.querySelectorAll('.card'));
const countEl = document.getElementById('count');

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
    'Yerel sunucu ile açın: <code>python3 -m http.server 8000</code> ve sonra <code>http://localhost:8000/</code>.'
  );
}

function updateCount(visibleCount) {
  countEl.textContent = `${visibleCount}/${cards.length} model`;
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
  const q = normalize(input.value);
  let visible = 0;

  for (const card of cards) {
    const hay = normalize(card.dataset.title || card.textContent);
    const ok = !q || hay.includes(q);
    card.classList.toggle('is-hidden', !ok);
    if (ok) visible += 1;
  }

  updateCount(visible);
}

input.addEventListener('input', applyFilter);
clearBtn.addEventListener('click', () => {
  input.value = '';
  input.focus();
  applyFilter();
});

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== input) {
    e.preventDefault();
    input.focus();
  }
  if (e.key === 'Escape' && document.activeElement === input && input.value) {
    input.value = '';
    applyFilter();
  }
});

applyFilter();

function posterDataUri({ title = '3D Model', emoji = '🏢' } = {}) {
  const safeTitle = (title || '3D Model').toString().slice(0, 80);
  const safeEmoji = (emoji || '🏢').toString().slice(0, 4);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="#667eea"/><stop offset="1" stop-color="#764ba2"/>` +
    `</linearGradient></defs>` +
    `<rect width="1200" height="675" fill="url(#g)"/>` +
    `<text x="600" y="320" text-anchor="middle" font-size="96" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial">${safeEmoji}</text>` +
    `<text x="600" y="420" text-anchor="middle" font-size="44" font-weight="700" fill="#fff" ` +
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
