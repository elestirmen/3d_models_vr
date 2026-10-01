/* Sinematik tur ve yerleşke etiketleri.

   Yapı modellerinde tur, hazır kamera açılarını (perspektif → cephe → kuş
   bakışı → plan) yavaş geçişlerle ve kısa açıklamalarla dolaşır.

   Yerleşke genel planında (catalog: campusHotspots) yapı etiketleri modelin
   üzerinde gösterilir. Etiket konumları uydurma değildir: kampüs haritasında
   teyitli işaretçi noktalarından, haritayı üreten kamera yeniden kurularak
   modele ışın atılıp ölçülmüştür (tools/build_campus_hotspots.mjs). Tur
   yapıları yakın komşu sırasıyla gezer; her durakta yapının kendi 3B modeli
   tek dokunuşla açılır.

   Kullanıcı sahneyi elle çevirirse tur duraklar; ?tour=1 açılışta başlatır,
   ?tour=loop sergi/kiosk kullanımı için sonsuz döngüde oynatır. */

import { t, localized } from '../core/i18n.js?v=425bd5c155';
import { $, el, pageUrl, prefersReducedMotion } from '../core/site.js?v=18aec0c522';

const DWELL_MS = 5200;
const CAMPUS_DWELL_MS = 6400;
const SLOW_DECAY = 140;

export function createTour({ mv, entry, catalog, presets, track, modelId, lod, onStateChange }) {
  const card = $('#tourCard');
  const stepEl = $('#tourStep');
  const titleEl = $('#tourTitle');
  const descEl = $('#tourDesc');
  const openLink = $('#tourOpen');
  const pauseButton = $('#tourPause');
  const toggle = $('#tourToggle');
  const spotCard = $('#spotCard');
  const spots = Array.isArray(entry?.campusHotspots) ? entry.campusHotspots : [];
  const campus = spots.length > 0;
  const byId = new Map((catalog || []).map(item => [String(item.id), item]));

  let stops = [];
  let index = -1;
  let playing = false;
  let active = false;
  let timer = 0;
  let loop = false;
  let movingUntil = 0;
  let savedDecay = null;
  let savedRotate = false;
  let baseRadius = 0;

  /* ---------- Yerleşke etiketleri ---------- */
  function spotLabel(spot) {
    return localized(byId.get(spot.model), 'label') || spot.model;
  }

  function renderSpots() {
    if (!campus) return;
    for (const node of mv.querySelectorAll('[data-campus-spot]')) node.remove();
    for (const spot of spots) {
      const target = byId.get(spot.model);
      if (!target) continue;
      const button = el('button', {
        class: 'hotspot hotspot--campus',
        type: 'button',
        slot: `hotspot-campus-${spot.model}`,
        'data-campus-spot': spot.model,
        'data-position': spot.position,
        'data-normal': spot.normal || '0 1 0',
        'data-visibility-attribute': 'visible',
        'aria-label': `${spotLabel(spot)} — ${t('viewer.spotOpen')}`,
      }, el('span', { class: 'hotspot__dot', 'aria-hidden': 'true' }), el('span', { class: 'hotspot__label' }, spotLabel(spot)));
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        if (active) stop();
        focusSpot(spot);
        track('campus_spot', { id: spot.model });
      });
      mv.append(button);
    }
  }

  function campusRadius(spot) {
    const radius = Number(spot?.radius);
    if (Number.isFinite(radius) && radius > 0) return radius;
    return (baseRadius || mv.getCameraOrbit().radius) * 0.32;
  }

  function flyTo(spot, { theta } = {}) {
    const orbit = mv.getCameraOrbit();
    const nextTheta = Number.isFinite(theta) ? theta : orbit.theta;
    movingUntil = Date.now() + 2600;
    mv.cameraTarget = spot.position.split(/\s+/).map(v => (v.endsWith('m') ? v : `${v}m`)).join(' ');
    mv.cameraOrbit = `${nextTheta}rad 56deg ${campusRadius(spot)}m`;
    for (const node of mv.querySelectorAll('[data-campus-spot]')) {
      node.classList.toggle('is-active', node.dataset.campusSpot === spot.model);
    }
  }

  function showSpotCard(spot) {
    const target = byId.get(spot.model);
    if (!target || !spotCard) return;
    $('#spotEyebrow').textContent = target.category ? t(`categories.${target.category}`) : '';
    $('#spotTitle').textContent = localized(target, 'officialName') || localized(target, 'label');
    $('#spotType').textContent = localized(target, 'type') || '';
    $('#spotOpen').href = pageUrl(`viewer.html?id=${encodeURIComponent(spot.model)}`);
    $('#spotPage').href = pageUrl(`${encodeURIComponent(spot.model)}/`);
    spotCard.hidden = false;
  }

  function hideSpotCard() {
    if (spotCard) spotCard.hidden = true;
    for (const node of mv.querySelectorAll('[data-campus-spot].is-active')) node.classList.remove('is-active');
  }

  function focusSpot(spot) {
    flyTo(spot);
    showSpotCard(spot);
  }

  $('#spotClose')?.addEventListener('click', () => {
    hideSpotCard();
    presets.apply('perspective');
  });

  /* ---------- Tur ---------- */
  function orderSpots() {
    // Yakın komşu sırası: batıdaki yapıdan başlayıp en yakın ziyaret edilmemişe.
    const parse = spot => spot.position.split(/\s+/).map(v => Number.parseFloat(v));
    const remaining = spots.filter(spot => byId.has(spot.model)).map(spot => ({ spot, p: parse(spot) }));
    if (!remaining.length) return [];
    remaining.sort((a, b) => a.p[0] - b.p[0]);
    const ordered = [remaining.shift()];
    while (remaining.length) {
      const last = ordered[ordered.length - 1].p;
      let best = 0;
      let bestDistance = Infinity;
      remaining.forEach((item, i) => {
        const d = Math.hypot(item.p[0] - last[0], item.p[2] - last[2]);
        if (d < bestDistance) {
          bestDistance = d;
          best = i;
        }
      });
      ordered.push(remaining.splice(best, 1)[0]);
    }
    return ordered.map(item => item.spot);
  }

  function buildStops() {
    if (campus) return orderSpots().map(spot => ({ kind: 'spot', spot }));
    const list = t('viewer.tourStops');
    return Array.isArray(list) ? list.map(stop => ({ kind: 'preset', ...stop })) : [];
  }

  function renderCard(stop) {
    stepEl.textContent = t('viewer.tourStep', { n: index + 1, total: stops.length });
    if (stop.kind === 'spot') {
      const target = byId.get(stop.spot.model);
      titleEl.textContent = localized(target, 'officialName') || localized(target, 'label');
      descEl.textContent = localized(target, 'type') || '';
      openLink.hidden = false;
      openLink.href = pageUrl(`viewer.html?id=${encodeURIComponent(stop.spot.model)}`);
    } else {
      titleEl.textContent = stop.title;
      descEl.textContent = stop.text;
      openLink.hidden = true;
    }
  }

  let flight = 0;
  let resumeTimer = 0;

  async function go(next) {
    if (!stops.length) return;
    index = (next + stops.length) % stops.length;
    const stop = stops[index];
    const token = ++flight;
    window.clearTimeout(timer);
    window.clearTimeout(resumeTimer);
    renderCard(stop);
    // Kademe geçişi kamerayı geçiş başındaki konuma geri yükler; uçuş bir
    // geçişin ortasına denk gelirse kamera geri sıçrardı. Önce geçişin
    // bitmesi beklenir, uçuş boyunca kademe kararları duraklatılır ve kamera
    // durunca yeniden açılır (yakın görünümde ayrıntı o zaman yüklenir).
    await lod?.whenIdle();
    if (token !== flight || !active) return;
    lod?.setPaused(true);
    card.classList.remove('is-ticking');
    void card.offsetWidth; // ilerleme çizgisini yeniden başlat
    card.classList.add('is-ticking');
    if (stop.kind === 'spot') {
      flyTo(stop.spot);
    } else {
      movingUntil = Date.now() + 2600;
      presets.apply(stop.preset);
    }
    resumeTimer = window.setTimeout(() => { if (token === flight) lod?.setPaused(false); }, 2600);
    schedule();
  }

  function schedule() {
    window.clearTimeout(timer);
    if (!playing) return;
    const last = index === stops.length - 1;
    timer = window.setTimeout(() => {
      if (last && !loop) {
        stop({ reset: true });
        return;
      }
      go(index + 1);
    }, campus ? CAMPUS_DWELL_MS : DWELL_MS);
  }

  function setPlaying(value) {
    playing = value;
    card.classList.toggle('is-paused', !playing);
    pauseButton.setAttribute('aria-label', playing ? t('viewer.tourPause') : t('viewer.tourResume'));
    pauseButton.title = pauseButton.getAttribute('aria-label');
    if (playing) schedule();
    else window.clearTimeout(timer);
  }

  function start({ loop: loopMode = false } = {}) {
    if (!mv.loaded) return;
    stops = buildStops();
    if (!stops.length) return;
    active = true;
    loop = loopMode;
    hideSpotCard();
    savedDecay = mv.interpolationDecay;
    savedRotate = mv.hasAttribute('auto-rotate');
    mv.removeAttribute('auto-rotate');
    if (!prefersReducedMotion()) mv.interpolationDecay = SLOW_DECAY;
    baseRadius = baseRadius || mv.getCameraOrbit().radius;
    card.hidden = false;
    toggle?.setAttribute('aria-pressed', 'true');
    toggle?.classList.add('is-active');
    setPlaying(true);
    go(0);
    onStateChange?.(true);
    track('tour_start', { id: modelId, n: stops.length, k: campus ? 'campus' : 'presets' });
  }

  function stop({ reset = false } = {}) {
    if (!active) return;
    active = false;
    flight += 1;
    window.clearTimeout(timer);
    window.clearTimeout(resumeTimer);
    lod?.setPaused(false);
    playing = false;
    card.hidden = true;
    toggle?.setAttribute('aria-pressed', 'false');
    toggle?.classList.remove('is-active');
    if (savedDecay != null) mv.interpolationDecay = savedDecay;
    if (savedRotate && !prefersReducedMotion()) mv.setAttribute('auto-rotate', '');
    for (const node of mv.querySelectorAll('[data-campus-spot].is-active')) node.classList.remove('is-active');
    if (reset) presets.apply('perspective');
    onStateChange?.(false);
  }

  toggle?.addEventListener('click', () => (active ? stop({ reset: true }) : start()));
  $('#tourStop')?.addEventListener('click', () => stop({ reset: true }));
  $('#tourNext')?.addEventListener('click', () => go(index + 1));
  $('#tourPrev')?.addEventListener('click', () => go(index - 1));
  pauseButton?.addEventListener('click', () => setPlaying(!playing));

  // Elle müdahale turu duraklatır (kendi kamera hareketlerimiz hariç).
  mv.addEventListener('camera-change', (event) => {
    if (!active || !playing || event.detail?.source !== 'user-interaction' || Date.now() < movingUntil) return;
    setPlaying(false);
  });
  // Yerleşke modelinde boş alana tıklamak açık kartı kapatır.
  mv.addEventListener('click', (event) => {
    if (campus && event.target === mv && !active && spotCard && !spotCard.hidden) hideSpotCard();
  });

  if (toggle) toggle.title = campus ? t('viewer.tourCampusTip') : t('viewer.tourTip');

  return {
    campus,
    renderSpots,
    start,
    stop,
    toggle: () => (active ? stop({ reset: true }) : start()),
    autoStart(mode) {
      if (mode === '1' || mode === 'true' || mode === 'loop') start({ loop: mode === 'loop' });
    },
    get active() { return active; },
    hideSpotCard,
  };
}
