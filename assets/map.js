/* =========================================================
   Kampüs haritası — etkileşim katmanı

   Taban görsel gerçek fotogrametri modelinin tepeden render'ıdır
   (tools/build_map.mjs). İşaretçi konumları models.json içindeki
   `map: { x, y }` alanından gelir ve görselin 0–1 normalize uzayındadır.
   Konum verisi olmayan yapı haritada gösterilmez; yerleştirme
   ?edit=map modunda tıklanarak yapılır.
   ========================================================= */

(() => {
  'use strict';

  const root = document.documentElement;
  const viewport = document.getElementById('mapViewport');
  const canvas = document.getElementById('mapCanvas');
  const image = document.getElementById('mapImage');
  const markerLayer = document.getElementById('mapMarkers');
  const panel = document.getElementById('mapPanel');
  const panelBody = document.getElementById('mapPanelBody');
  const panelClose = document.getElementById('mapPanelClose');
  const notice = document.getElementById('mapNotice');
  const subtitle = document.getElementById('mapSubtitle');
  const buildingSelect = document.getElementById('mapBuilding');

  const params = new URLSearchParams(location.search);
  const editMode = ['1', 'true', 'map', 'on'].includes((params.get('edit') || '').toLowerCase());
  const focusId = (params.get('focus') || '').trim();

  const models = Array.isArray(window.MODEL_GALLERY?.models) ? window.MODEL_GALLERY.models : [];
  const placed = models.filter((model) => model?.map
    && Number.isFinite(Number(model.map.x))
    && Number.isFinite(Number(model.map.y)));

  const track = (event, extra) => window.OKU_ANALYTICS?.send(event, extra);

  /* ---------- Tema: galeride seçilen tercih burada da uygulanır ---------- */
  try {
    const stored = localStorage.getItem('gallery-theme');
    if (stored === 'light' || stored === 'dark') root.setAttribute('data-theme', stored);
  } catch { /* localStorage kapalı olabilir */ }

  /* ---------- Zum / kaydırma ---------- */
  const view = { scale: 1, x: 0, y: 0, fitScale: 1 };
  const MAX_SCALE = 4;
  let viewWidth = 0;
  let viewHeight = 0;

  function imageSize() {
    return {
      width: image.naturalWidth || image.width || 1,
      height: image.naturalHeight || image.height || 1,
    };
  }

  function visibleBox() {
    const box = viewport.getBoundingClientRect();
    // A mobile detail sheet occupies part of the map; keep the selected
    // building in the remaining area instead of centering it behind the sheet.
    const height = innerWidth <= 768 && !panel.classList.contains('is-hidden')
      ? Math.max(120, Math.min(box.height, panel.offsetTop - box.top)) : box.height;
    return { left: box.left, top: box.top, width: box.width, height };
  }

  function applyTransform() {
    canvas.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    // İşaretçiler zumla birlikte büyümesin.
    const inverse = 1 / view.scale;
    for (const marker of markerLayer.children) {
      marker.style.transform = `translate(-50%, -50%) scale(${inverse})`;
    }
  }

  function clampPan() {
    const { width, height } = imageSize();
    const scaledWidth = width * view.scale;
    const scaledHeight = height * view.scale;
    const box = visibleBox();
    // Görsel görünümden küçükse ortalanır, büyükse kenarları içeride tutulur.
    view.x = scaledWidth <= box.width
      ? (box.width - scaledWidth) / 2
      : Math.min(0, Math.max(box.width - scaledWidth, view.x));
    view.y = scaledHeight <= box.height
      ? (box.height - scaledHeight) / 2
      : Math.min(0, Math.max(box.height - scaledHeight, view.y));
  }

  function fitToViewport() {
    const { width, height } = imageSize();
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const box = visibleBox();
    if (!box.width || !box.height) return;
    viewWidth = box.width;
    viewHeight = box.height;
    view.fitScale = Math.min(box.width / width, box.height / height) * 0.96;
    view.scale = view.fitScale;
    clampPan();
    applyTransform();
  }

  function zoomAt(factor, clientX, clientY) {
    const box = visibleBox();
    const px = (clientX ?? box.left + box.width / 2) - box.left;
    const py = (clientY ?? box.top + box.height / 2) - box.top;
    if (!Number.isFinite(factor) || factor <= 0) return;
    const next = Math.min(MAX_SCALE, Math.max(view.fitScale, view.scale * factor));
    if (next === view.scale) return;
    // İmlecin altındaki nokta sabit kalsın.
    view.x = px - ((px - view.x) * next) / view.scale;
    view.y = py - ((py - view.y) * next) / view.scale;
    view.scale = next;
    clampPan();
    applyTransform();
  }

  function centerOn(normalizedX, normalizedY, scale) {
    const { width, height } = imageSize();
    const box = visibleBox();
    view.scale = Math.min(MAX_SCALE, Math.max(view.fitScale, scale ?? view.fitScale * 2.2));
    view.x = box.width / 2 - normalizedX * width * view.scale;
    view.y = box.height / 2 - normalizedY * height * view.scale;
    clampPan();
    applyTransform();
  }

  document.getElementById('zoomIn')?.addEventListener('click', () => zoomAt(1.35));
  document.getElementById('zoomOut')?.addEventListener('click', () => zoomAt(1 / 1.35));
  document.getElementById('zoomFit')?.addEventListener('click', fitToViewport);

  viewport.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX, event.clientY);
  }, { passive: false });

  // Sürükleyerek kaydırma (tek parmak / fare) — tıklamadan ayırmak için
  // hareket eşiği kullanılır.
  const pointers = new Map();
  const captured = new Set();
  let dragged = false;
  let pinchStart = null;

  const DRAG_THRESHOLD = 4;

  viewport.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // DİKKAT: burada setPointerCapture ÇAĞRILMAZ. Yakalama, tarayıcının
    // click olayını yakalayan ögeye yönlendirmesine yol açar ve işaretçi
    // düğmeleri tıklanamaz hâle gelir. Yakalama ancak sürükleme eşiği
    // aşıldığında yapılır.
    pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
    });
    dragged = false;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: view.scale };
    }
  });

  viewport.addEventListener('pointermove', (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    const totalX = event.clientX - previous.startX;
    const totalY = event.clientY - previous.startY;
    pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      startX: previous.startX,
      startY: previous.startY,
    });

    if (!dragged && Math.hypot(totalX, totalY) < DRAG_THRESHOLD && pointers.size < 2) return;
    if (!dragged) {
      dragged = true;
      viewport.classList.add('is-panning');
      try {
        viewport.setPointerCapture(event.pointerId);
        captured.add(event.pointerId);
      } catch { /* yakalama desteklenmiyorsa sürükleme yine çalışır */ }
    }

    if (pointers.size === 2 && pinchStart) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const box = visibleBox();
      const factor = (distance / pinchStart.distance) * (pinchStart.scale / view.scale);
      zoomAt(factor, (a.x + b.x) / 2, (a.y + b.y) / 2);
      void box;
      return;
    }
    view.x += dx;
    view.y += dy;
    clampPan();
    applyTransform();
  });

  function endPointer(event) {
    pointers.delete(event.pointerId);
    if (captured.delete(event.pointerId)) {
      try { viewport.releasePointerCapture(event.pointerId); } catch { /* yok say */ }
    }
    if (pointers.size < 2) pinchStart = null;
    if (pointers.size === 0) {
      viewport.classList.remove('is-panning');
      // Tıklama işleyicileri `dragged` değerini okuduktan sonra sıfırlanır.
      window.setTimeout(() => { dragged = false; }, 0);
    }
  }
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);

  window.addEventListener('resize', () => {
    const zoomRatio = view.scale / view.fitScale;
    const { width, height } = imageSize();
    const centerX = (viewWidth / 2 - view.x) / (width * view.scale);
    const centerY = (viewHeight / 2 - view.y) / (height * view.scale);
    fitToViewport();
    if (zoomRatio > 1.001) centerOn(centerX, centerY, view.fitScale * zoomRatio);
  });

  viewport.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const delta = event.shiftKey ? 120 : 45;
    const pan = { ArrowLeft: [delta, 0], ArrowRight: [-delta, 0], ArrowUp: [0, delta], ArrowDown: [0, -delta] }[event.key];
    if (pan) {
      event.preventDefault(); view.x += pan[0]; view.y += pan[1]; clampPan(); applyTransform();
    } else if (['+', '=', '-', '0'].includes(event.key)) {
      event.preventDefault();
      if (event.key === '0') fitToViewport();
      else zoomAt(event.key === '-' ? 1 / 1.35 : 1.35);
    }
  });

  /* ---------- Panel ---------- */
  let activeId = '';

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function closePanel() {
    const previousMarker = [...markerLayer.children].find(marker => marker.dataset.id === activeId);
    const restoreFocus = panel.contains(document.activeElement);
    buildingSelect.value = '';
    const url = new URL(location.href);
    url.searchParams.delete('focus');
    history.replaceState(null, '', url);
    if (subtitle) subtitle.textContent = 'Yerleşke planı üzerinde bir yapı seçin.';
    panel.classList.add('is-hidden');
    document.body.classList.remove('has-selection');
    clampPan();
    applyTransform();
    panelBody.textContent = '';
    activeId = '';
    if (restoreFocus) previousMarker?.focus({ preventScroll: true });
    for (const marker of markerLayer.children) {
      marker.classList.remove('is-active');
      marker.setAttribute('aria-pressed', 'false');
    }
  }

  panelClose.addEventListener('click', closePanel);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.classList.contains('is-hidden')) closePanel();
  });

  function openPanel(model) {
    panelBody.textContent = '';
    activeId = String(model.id);
    buildingSelect.value = activeId;
    const url = new URL(location.href);
    url.searchParams.set('focus', activeId);
    history.replaceState(null, '', url);

    if (model.poster) {
      const poster = document.createElement('img');
      poster.className = 'map-panel-poster';
      poster.src = model.poster;
      poster.alt = '';
      poster.loading = 'lazy';
      poster.decoding = 'async';
      panelBody.appendChild(poster);
    }

    panelBody.appendChild(element('h2', null, model.label || model.title));
    if (model.type) panelBody.appendChild(element('p', 'map-panel-type', model.type));
    if (model.description) panelBody.appendChild(element('p', 'map-panel-text', model.description));

    const actions = element('div', 'map-panel-actions');
    const open = document.createElement('a');
    open.className = 'map-action map-action-primary';
    open.href = `viewer.html?id=${encodeURIComponent(model.id)}`;
    open.textContent = '3B görüntüle';
    actions.appendChild(open);

    const page = document.createElement('a');
    page.className = 'map-action map-action-secondary';
    page.href = `${encodeURIComponent(model.id)}/`;
    page.textContent = 'Bina sayfası';
    actions.appendChild(page);

    const latitude = Number(model.geo?.lat);
    const longitude = Number(model.geo?.lng);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      const directions = document.createElement('a');
      directions.className = 'map-action map-action-secondary';
      directions.href = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
      directions.target = '_blank';
      directions.rel = 'noopener noreferrer';
      directions.textContent = 'Yol tarifi al';
      actions.appendChild(directions);
    }
    panelBody.appendChild(actions);

    if (model.map?.confirmed === false) {
      panelBody.appendChild(element(
        'p',
        'map-panel-meta',
        'Bu yapının harita üzerindeki konumu görüntü eşleştirmesiyle bulundu, henüz teyit edilmedi.'
      ));
    }

    // Bilgi kaynağı varsa künye olarak gösterilir.
    const sources = Array.isArray(model.sources) ? model.sources : [];
    if (sources.length) {
      const meta = element('p', 'map-panel-meta');
      meta.append('Kaynak: ');
      sources.forEach((source, index) => {
        if (!source?.label || !/^https?:\/\//.test(String(source.url || ''))) return;
        if (index > 0) meta.append(' · ');
        const link = document.createElement('a');
        link.href = source.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = source.label;
        meta.appendChild(link);
      });
      panelBody.appendChild(meta);
    }

    panel.classList.remove('is-hidden');
    document.body.classList.add('has-selection');
    centerOn(Number(model.map.x), Number(model.map.y), Math.max(view.scale, view.fitScale * 1.5));
    panelClose.focus({ preventScroll: true });
    if (subtitle) subtitle.textContent = `${model.label || model.title} seçildi.`;
    track('map_select', { id: model.id });
  }

  /* ---------- İşaretçiler ---------- */
  function renderMarkers() {
    markerLayer.textContent = '';
    for (const model of placed) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'marker';
      if (model.map.confirmed === false) button.classList.add('is-unconfirmed');
      button.dataset.id = String(model.id);
      button.style.left = `${Number(model.map.x) * 100}%`;
      button.style.top = `${Number(model.map.y) * 100}%`;
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', `${model.label || model.title} — ayrıntıları aç`);

      button.appendChild(element('span', 'marker-dot'));
      button.appendChild(element('span', 'marker-label', model.label || model.title));

      button.addEventListener('click', (event) => {
        event.stopPropagation();
        if (dragged) return;
        for (const other of markerLayer.children) {
          other.classList.remove('is-active');
          other.setAttribute('aria-pressed', 'false');
        }
        button.classList.add('is-active');
        button.setAttribute('aria-pressed', 'true');
        openPanel(model);
      });

      markerLayer.appendChild(button);
    }
    applyTransform();
  }

  /* ---------- Yerleştirme modu (?edit=map) ---------- */
  function setupEditor() {
    const draft = new Map();
    const editor = element('div', 'map-editor');
    editor.innerHTML =
      '<h2>Yerleştirme modu</h2>' +
      '<p>Listeden bir yapı seçin, ardından plan üzerinde yapının bulunduğu noktaya tıklayın. ' +
      'Üretilen değerleri <code>models.json</code> içindeki modele <code>"map"</code> alanı olarak ekleyin.</p>' +
      '<select id="mapEditorSelect" aria-label="Yerleştirilecek yapı"></select>' +
      '<pre id="mapEditorOutput" tabindex="0">{}</pre>' +
      '<div class="map-editor-actions">' +
      '<button type="button" class="map-action map-action-primary" data-copy>JSON\'u kopyala</button>' +
      '<button type="button" class="map-action map-action-secondary" data-clear>Temizle</button>' +
      '</div>';
    document.getElementById('mapStage').appendChild(editor);

    const select = editor.querySelector('#mapEditorSelect');
    const output = editor.querySelector('#mapEditorOutput');
    for (const model of models) {
      const option = document.createElement('option');
      option.value = String(model.id);
      option.textContent = `${model.label || model.title} (${model.id})`;
      select.appendChild(option);
    }

    const refresh = () => {
      const payload = {};
      for (const [id, point] of draft) {
        payload[id] = { map: { x: point.x, y: point.y, confirmed: true } };
      }
      output.textContent = JSON.stringify(payload, null, 2);
    };
    refresh();

    viewport.addEventListener('click', (event) => {
      if (dragged) return;
      const rect = image.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      const id = select.value;
      draft.set(id, { x: Number(x.toFixed(4)), y: Number(y.toFixed(4)) });
      refresh();
      // Yerleştirilen noktayı hemen göster.
      const existing = markerLayer.querySelector(`[data-id="${id}"]`);
      if (existing) existing.remove();
      const model = models.find((item) => String(item.id) === id);
      if (model) {
        model.map = { x: draft.get(id).x, y: draft.get(id).y, confirmed: true };
        if (!placed.includes(model)) placed.push(model);
        renderMarkers();
      }
      // Sıradaki yapıya geç.
      if (select.selectedIndex < select.options.length - 1) select.selectedIndex += 1;
    });

    editor.querySelector('[data-copy]')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(output.textContent);
        if (subtitle) subtitle.textContent = 'JSON panoya kopyalandı.';
      } catch {
        output.focus();
      }
    });
    editor.querySelector('[data-clear]')?.addEventListener('click', () => {
      draft.clear();
      refresh();
    });
  }

  /* ---------- Başlat ---------- */
  function start() {
    fitToViewport();
    renderMarkers();
    for (const model of placed) {
      const option = document.createElement('option');
      option.value = String(model.id);
      option.textContent = model.label || model.title;
      buildingSelect.appendChild(option);
    }
    buildingSelect.addEventListener('change', () => {
      const model = placed.find(item => String(item.id) === buildingSelect.value);
      if (!model) { closePanel(); return; }
      centerOn(Number(model.map.x), Number(model.map.y));
      [...markerLayer.children].find(marker => marker.dataset.id === String(model.id))?.click();
    });

    // Plan yalnızca ana yerleşkeyi kapsar; dışında kalan modeller için
    // işaretçi uydurulmaz, bunun yerine durum açıkça yazılır.
    const missing = models.filter((model) => !model?.map && String(model.id) !== 'oku_genel_plan');

    if (!placed.length && !editMode) {
      notice.classList.remove('is-hidden');
      notice.innerHTML =
        '<strong>Yapı konumları henüz eklenmedi.</strong> Plan görseli gerçek yerleşke ' +
        'taramasından üretildi; işaretçiler <code>models.json</code> içindeki ' +
        '<code>map</code> alanından gelir. Yerleştirmek için ' +
        '<a href="?edit=map">yerleştirme modunu</a> açın.';
    } else if (missing.length && !editMode) {
      const names = missing.map((model) => model.label || model.title).join(', ');
      notice.classList.remove('is-hidden');
      notice.classList.add('is-subtle');
      notice.textContent = `Bu plan yerleşke genel planı taramasını kapsar; ${names} plan alanının dışında kaldığı için haritada gösterilmiyor.`;
      const dismiss = document.createElement('button');
      dismiss.type = 'button';
      dismiss.className = 'map-notice-close';
      dismiss.setAttribute('aria-label', 'Bildirimi kapat');
      dismiss.textContent = '×';
      dismiss.addEventListener('click', () => notice.classList.add('is-hidden'));
      notice.appendChild(dismiss);
    }

    if (editMode) setupEditor();

    if (focusId) {
      const model = placed.find((item) => String(item.id) === focusId);
      if (model) {
        centerOn(Number(model.map.x), Number(model.map.y));
        markerLayer.querySelector(`[data-id="${focusId}"]`)?.click();
      }
    }

    track('map_view', { n: placed.length });
  }

  image.addEventListener('error', () => {
    notice.classList.remove('is-hidden');
    notice.textContent = 'Harita görseli yüklenemedi. Bağlantınızı kontrol edip sayfayı yenileyin.';
  });
  if (image.complete && image.naturalWidth) start();
  else image.addEventListener('load', start, { once: true });
})();
