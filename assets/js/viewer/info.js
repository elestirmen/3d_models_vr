/* Yapı bilgisi paneli.
   İçerik yalnızca manifeste yazılmış (yani kaynaklı) alanlardan üretilir;
   eksik alan uydurulmaz, ilgili bölüm hiç gösterilmez. Masaüstünde panel
   modeli kapatmadan yanda açılır (model çevrilebilir); dar ekranda alt
   sayfa olarak kip içinde açılır. */

import { t, fmt, localized, localizedList } from '../core/i18n.js?v=425bd5c155';
import { el, icon, pageUrl, toast } from '../core/site.js?v=18aec0c522';

export function createInfoPanel({ dialog, toggle, entry, modelId, lod, offline, ar, track }) {
  const body = dialog.querySelector('#infoPanelBody');
  const titleEl = dialog.querySelector('#infoPanelTitle');
  const wide = window.matchMedia('(min-width: 900px)');
  let returnFocus = null;

  const section = (heading, ...children) => el('section', { class: 'info-section' }, el('h3', {}, heading), ...children);

  function kv(rows) {
    const list = el('dl', { class: 'kv' });
    for (const [term, value] of rows) {
      if (value == null || value === '') continue;
      list.append(el('dt', {}, term), el('dd', { class: 'tabular' }, value));
    }
    return list.childElementCount ? list : null;
  }

  function linkList(items, field) {
    const list = el('ul', { class: 'info-list', role: 'list' });
    for (const item of items) {
      const label = String(item?.[field] || '').trim();
      if (!label) continue;
      const url = String(item?.url || '');
      list.append(el('li', {}, /^https?:\/\//.test(url)
        ? el('a', { class: 'info-link', href: url, target: '_blank', rel: 'noopener noreferrer' }, label, icon('external', 'icon-sm'))
        : label));
    }
    return list.childElementCount ? list : null;
  }

  function render() {
    body.textContent = '';
    titleEl.textContent = localized(entry, 'officialName') || localized(entry, 'title') || t('viewer.info');

    // 1) Kimlik
    const chips = el('div', { class: 'info-chips' });
    const category = entry?.category ? t(`categories.${entry.category}`) : '';
    if (category) chips.append(el('span', { class: 'chip chip--accent' }, category));
    const type = localized(entry, 'type');
    if (type) chips.append(el('span', { class: 'chip' }, type));
    const zone = localized(entry, 'campusZone');
    if (zone) chips.append(el('span', { class: 'chip' }, zone));
    const intro = el('section', { class: 'info-section info-section--intro' });
    if (chips.childElementCount) intro.append(chips);
    const description = localized(entry, 'description');
    if (description) intro.append(el('p', { class: 'info-text' }, description));
    body.append(intro);

    // 2) Yapı bilgileri (yalnızca kaynaklı alanlar)
    const facts = entry?.facts;
    if (facts) {
      const rows = kv([
        [t('viewer.floors'), facts.floors != null ? fmt.integer(facts.floors) : ''],
        [t('viewer.area'), facts.grossArea_m2 != null ? t('viewer.areaValue', { n: fmt.integer(facts.grossArea_m2) }) : ''],
        [t('viewer.built'), facts.builtYear != null ? String(facts.builtYear) : ''],
        [t('viewer.capacity'), facts.capacity != null ? t('viewer.capacityValue', { n: fmt.integer(facts.capacity) }) : ''],
      ]);
      if (rows) body.append(section(t('viewer.infoFacts'), rows));
    }

    // 3) Birimler
    const units = linkList(localizedList(entry, 'units', 'name'), 'name');
    if (units) body.append(section(t('viewer.units'), units));

    // 4) Erişilebilirlik
    const access = entry?.accessibility;
    if (access) {
      const yesNo = value => (value === true ? t('viewer.yes') : value === false ? t('viewer.no') : '');
      const rows = kv([
        [t('viewer.elevator'), yesNo(access.elevator)],
        [t('viewer.ramp'), yesNo(access.ramp)],
        [t('viewer.accessibleWc'), yesNo(access.accessibleWc)],
      ]);
      const parts = [rows, access.note ? el('p', { class: 'info-text' }, access.note) : null].filter(Boolean);
      if (parts.length) body.append(section(t('viewer.accessibility'), ...parts));
    }

    // 5) Konum, harita ve bina sayfası
    const lat = Number(entry?.geo?.lat);
    const lng = Number(entry?.geo?.lng);
    const actions = el('div', { class: 'info-actions' });
    if (entry?.map && Number.isFinite(Number(entry.map.x))) {
      actions.append(el('a', { class: 'btn btn--sm', href: pageUrl(`map.html?focus=${encodeURIComponent(modelId)}`) }, icon('pin', 'icon-sm'), t('viewer.showOnMap')));
    }
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      actions.append(el('a', {
        class: 'btn btn--sm', href: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, target: '_blank', rel: 'noopener noreferrer',
      }, icon('navigation', 'icon-sm'), t('viewer.directions')));
    }
    if (modelId) actions.append(el('a', { class: 'btn btn--sm', href: pageUrl(`${encodeURIComponent(modelId)}/`) }, icon('building', 'icon-sm'), t('viewer.buildingPage')));
    if (actions.childElementCount) {
      const location = section(t('viewer.location'));
      if (Number.isFinite(lat) && Number.isFinite(lng)) location.append(el('p', { class: 'info-text tabular' }, `${lat.toFixed(5)}, ${lng.toFixed(5)}`));
      location.append(actions);
      if (entry?.map?.confirmed === false) location.append(el('p', { class: 'note' }, t('viewer.mapUnconfirmed')));
      body.append(location);
    }

    // 6) Model künyesi — üçgen ve boyutlar üretim raporlarından gelir
    const tiers = Array.isArray(entry?.tiers) ? entry.tiers : [];
    const card = section(t('viewer.modelCard'));
    if (tiers.length) {
      const table = el('table', { class: 'info-table' },
        el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, t('viewer.tierCol')), el('th', { scope: 'col' }, t('viewer.sizeCol')), el('th', { scope: 'col' }, t('viewer.trianglesCol')))));
      const tbody = el('tbody');
      for (const tier of tiers) {
        const active = String(tier.id) === lod.current;
        const name = el('th', { scope: 'row' }, t(`tiers.${tier.id}`));
        if (active) name.append(el('span', { class: 'info-active' }, t('viewer.activeTier')));
        tbody.append(el('tr', { class: active ? 'is-active' : null }, name,
          el('td', { class: 'tabular' }, fmt.bytes(Number(tier.bytes)) || '—'),
          el('td', { class: 'tabular' }, Number(tier.triangles) > 0 ? fmt.integer(tier.triangles) : '—')));
      }
      table.append(tbody);
      card.append(table);
    }
    if (tiers.length > 1 && lod.manifest) {
      const tierActions = el('div', { class: 'info-actions' });
      const highest = tiers[tiers.length - 1];
      if (lod.pinned) {
        tierActions.append(el('button', { class: 'btn btn--sm', type: 'button', onclick: () => { lod.pin(''); render(); } }, t('viewer.autoQuality')));
      } else if (highest && String(highest.id) !== lod.current) {
        tierActions.append(el('button', {
          class: 'btn btn--soft btn--sm', type: 'button',
          onclick: () => { lod.pin(String(highest.id)); track('quality_pin', { id: modelId, t: highest.id }); render(); },
        }, icon('layers', 'icon-sm'), t('viewer.loadHighest', { size: fmt.bytes(Number(highest.bytes)) || '?' })));
      }
      if (tierActions.childElementCount) card.append(tierActions);
    }
    const scan = entry?.scan || {};
    const rows = kv([
      [t('viewer.scanDate'), scan.date ? fmt.date(scan.date) : ''],
      [t('viewer.scanMethod'), scan.method || ''],
      [t('viewer.scanSource'), scan.source || ''],
    ]);
    if (rows) card.append(rows);
    card.append(el('p', { class: 'note info-format' }, `${t('viewer.formatLabel')}: ${t('viewer.formatValue')}`));
    const connection = navigator.connection;
    if (connection?.saveData || ['slow-2g', '2g', '3g'].includes(connection?.effectiveType)) {
      card.append(el('p', { class: 'note' }, t('viewer.savingData')));
    }
    body.append(card);

    // 7) Çevrimdışı kullanım
    if (offline && 'caches' in window) {
      const note = el('p', { class: 'info-text' }, t('viewer.offlineChecking'));
      const offlineActions = el('div', { class: 'info-actions' });
      body.append(section(t('viewer.offline'), note, offlineActions));
      void offline.state().then(state => {
        offlineActions.textContent = '';
        if (state === 'unsupported') {
          note.textContent = t('viewer.offlineUnsupported');
          return;
        }
        if (state === 'saved') {
          note.textContent = t('viewer.offlineSaved');
          offlineActions.append(el('button', {
            class: 'btn btn--sm', type: 'button',
            onclick: async () => { await offline.remove(); toast(t('viewer.offlineRemoved'), { iconName: 'trash' }); render(); },
          }, icon('trash', 'icon-sm'), t('viewer.offlineRemove')));
          return;
        }
        note.textContent = state === 'partial' ? t('viewer.offlinePartial') : t('viewer.offlineNone');
        const size = fmt.bytes(offline.totalBytes);
        const save = el('button', { class: 'btn btn--soft btn--sm', type: 'button' }, icon('offline', 'icon-sm'),
          el('span', {}, size ? t('viewer.offlineSave', { size }) : t('viewer.offlineSaveUnknown')));
        save.addEventListener('click', async () => {
          save.disabled = true;
          const label = save.querySelector('span');
          try {
            const count = await offline.save((done, total) => { label.textContent = t('viewer.offlineSaving', { done, total }); });
            track('offline_saved', { id: modelId, n: count });
            toast(t('viewer.offlineDone'), { iconName: 'check' });
            render();
          } catch (error) {
            console.warn('Çevrimdışı kayıt tamamlanamadı:', error);
            toast(t('viewer.offlineFailed'), { timeout: 7000 });
            save.disabled = false;
            label.textContent = t('viewer.offlineRetry');
            save.setAttribute('aria-label', t('viewer.offlineRetry'));
          }
        });
        offlineActions.append(save);
      });
    }

    // 8) AR durumu
    body.append(section(t('viewer.arSection'), el('p', { class: 'info-text' }, ar.statusText())));

    // 9) Kaynaklar
    const sources = linkList(localizedList(entry, 'sources', 'label'), 'label');
    if (sources) body.append(section(t('viewer.sources'), sources, el('p', { class: 'note' }, t('viewer.sourcesNote'))));

    if (!entry?.facts && !entry?.units?.length && !entry?.geo && !entry?.accessibility) {
      body.append(el('p', { class: 'note note--box' }, t('viewer.noFacts')));
    }
  }

  function setOpen(open) {
    if (open === dialog.open) return;
    if (open) {
      returnFocus = document.activeElement;
      render();
      // Geniş ekranda kipsiz: panel açıkken model döndürülebilir.
      if (wide.matches) dialog.show();
      else dialog.showModal();
      dialog.querySelector('[data-close]')?.focus({ preventScroll: true });
      track('info_open', { id: modelId });
    } else {
      dialog.close();
    }
  }

  dialog.addEventListener('close', () => {
    toggle?.setAttribute('aria-expanded', 'false');
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true });
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !dialog.matches(':modal')) {
      event.preventDefault();
      setOpen(false);
    }
  });
  dialog.querySelector('[data-close]')?.addEventListener('click', () => setOpen(false));
  toggle?.addEventListener('click', () => {
    setOpen(!dialog.open);
    toggle.setAttribute('aria-expanded', String(dialog.open));
  });

  return {
    open: () => { setOpen(true); toggle?.setAttribute('aria-expanded', 'true'); },
    close: () => setOpen(false),
    toggle: () => { setOpen(!dialog.open); toggle?.setAttribute('aria-expanded', String(dialog.open)); },
    refresh: () => { if (dialog.open) render(); },
    get isOpen() { return dialog.open; },
  };
}
