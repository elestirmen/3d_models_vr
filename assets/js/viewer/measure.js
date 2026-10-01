/* Ölçüm aracı: model yüzeyindeki iki nokta arasındaki doğrusal mesafe.
   Fotogrametri çıktıları çoğunlukla ölçeksizdir; 1 model biriminin kaç metre
   olduğu bilinmeden metre göstermek yanıltıcı olur. Ölçek manifestten
   (scan.metersPerUnit) gelir; yoksa kullanıcı bir kez kalibre edebilir ve
   değer bu tarayıcıda saklanır. */

import { t, fmt } from '../core/i18n.js?v=425bd5c155';
import { el, store } from '../core/site.js?v=18aec0c522';

export function createMeasure({ mv, button, overlay, line, readout, entry, modelId, hint }) {
  let active = false;
  let points = [];
  let frame = 0;
  const scaleKey = `measure-scale:${modelId || 'legacy'}`;

  const storedScale = () => {
    const value = Number(store.get(scaleKey));
    return Number.isFinite(value) && value > 0 ? value : 0;
  };
  const metersPerUnit = () => {
    const declared = Number(entry?.scan?.metersPerUnit);
    return Number.isFinite(declared) && declared > 0 ? declared : storedScale();
  };
  const distance = () => {
    if (points.length < 2) return 0;
    const [a, b] = points;
    return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  };
  const formatMeters = (meters) => (meters < 1 ? `${fmt.number(meters * 100, 0)} cm` : `${fmt.number(meters, meters < 10 ? 2 : 1)} m`);

  function clear() {
    points = [];
    for (const node of mv.querySelectorAll('[data-measure]')) node.remove();
    overlay.hidden = true;
    readout.textContent = '';
  }

  function calibrate() {
    const units = distance();
    if (!units) return;
    const answer = window.prompt(t('viewer.measurePrompt'), '');
    const meters = Number(String(answer || '').replace(',', '.'));
    if (!Number.isFinite(meters) || meters <= 0) return;
    const scale = meters / units;
    store.set(scaleKey, scale);
    update();
    hint(t('viewer.measureSaved', { value: scale.toPrecision(6) }), 12000);
  }

  function update() {
    if (points.length < 2) {
      overlay.hidden = true;
      readout.textContent = points.length === 1 ? t('viewer.measureSecond') : '';
      return;
    }
    const first = mv.querySelector('[data-measure="0"]');
    const second = mv.querySelector('[data-measure="1"]');
    if (!first || !second) return;
    const stage = mv.getBoundingClientRect();
    const center = (node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.left + rect.width / 2 - stage.left, y: rect.top + rect.height / 2 - stage.top };
    };
    const a = center(first);
    const b = center(second);
    line.setAttribute('x1', String(a.x));
    line.setAttribute('y1', String(a.y));
    line.setAttribute('x2', String(b.x));
    line.setAttribute('y2', String(b.y));
    overlay.hidden = false;

    const units = distance();
    const scale = metersPerUnit();
    readout.textContent = '';
    if (scale) {
      readout.textContent = t('viewer.measureResult', { d: formatMeters(units * scale) });
    } else {
      readout.append(t('viewer.measureUnits', { u: fmt.number(units, 3) }));
      readout.append(el('button', { class: 'measure-calibrate', type: 'button', onclick: calibrate }, t('viewer.measureCalibrate')));
    }
  }

  function scheduleUpdate() {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      update();
    });
  }

  function addPoint(hit) {
    if (points.length >= 2) clear();
    const index = points.length;
    const marker = el('button', {
      class: 'hotspot hotspot--measure',
      type: 'button',
      slot: `hotspot-measure-${index}`,
      'data-measure': String(index),
      'data-position': hit.position.toString(),
      'data-normal': hit.normal.toString(),
      'aria-label': `${t('viewer.measure')} ${index + 1}`,
    }, el('span', { class: 'hotspot__dot', 'aria-hidden': 'true' }));
    mv.append(marker);
    points.push({ x: Number(hit.position.x), y: Number(hit.position.y), z: Number(hit.position.z) });
    // Hotspot'un konumlanması bir kare sürebilir.
    scheduleUpdate();
    window.setTimeout(scheduleUpdate, 120);
  }

  function setActive(value) {
    active = value;
    button?.classList.toggle('is-active', active);
    button?.setAttribute('aria-pressed', String(active));
    mv.classList.toggle('is-measuring', active);
    if (!active) {
      clear();
      return;
    }
    hint(metersPerUnit() ? t('viewer.measureHintScaled') : t('viewer.measureHintUnscaled'), 7000);
  }

  button?.addEventListener('click', () => setActive(!active));
  mv.addEventListener('click', (event) => {
    if (!active || event.target !== mv) return;
    const hit = mv.positionAndNormalFromPoint?.(event.clientX, event.clientY);
    if (!hit) {
      hint(t('viewer.measureMiss'), 3000);
      return;
    }
    addPoint(hit);
  });
  mv.addEventListener('camera-change', scheduleUpdate);
  window.addEventListener('resize', scheduleUpdate);

  return { toggle: () => setActive(!active), clear, get active() { return active; } };
}
