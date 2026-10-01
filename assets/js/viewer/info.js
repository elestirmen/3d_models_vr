/* Yapı bilgisi paneli.
   İçerik yalnızca manifeste yazılmış (yani kaynaklı) alanlardan üretilir;
   eksik alan uydurulmaz, ilgili bölüm hiç gösterilmez. Masaüstünde panel
   modeli kapatmadan yanda açılır (model çevrilebilir); dar ekranda alt
   sayfa olarak kip içinde açılır.
   Panel açıkken kademe/kayıt/AR durumu değişirse yalnızca ilgili bölüm ve
   yalnızca içeriği gerçekten değiştiğinde yenilenir; odaktaki düğme yeni
   bölümde de odakta kalır (klavye kullanıcısı yerini kaybetmez). */

import { t, fmt, localized, localizedList } from '../core/i18n.js?v=425bd5c155';
import { el, icon, pageUrl, toast } from '../core/site.js?v=18aec0c522';

export function createInfoPanel({ dialog, toggle, entry, modelId, lod, offline, ar, track }) {
  const body = dialog.querySelector('#infoPanelBody');
  const titleEl = dialog.querySelector('#infoPanelTitle');
  const wide = window.matchMedia('(min-width: 900px)');
  let returnFocus = null;
  // Yeniden çizilebilen bölümler ve son çizildikleri durumun anahtarı.
  const parts = { card: null, offline: null, ar: null };
  const keys = { card: '', offline: '', ar: '' };
  let offlineToken = 0;

  const section = (heading, ...children) => el('section', { class: 'info-section' }, el('h3', {}, heading), ...children);
  // Yenilenen bölümün başlığı odak yedeğidir (odaktaki düğme yeni hâlde yoksa).
  const liveSection = (heading, ...children) => el('section', { class: 'info-section' }, el('h3', { tabindex: '-1' }, heading), ...children);

  /** Bölümü yerinde değiştirir; odak bölümün içindeyse aynı anahtarlı
   *  denetime (yoksa bölüm başlığına) taşınır. */
  function mount(name, next) {
    const current = parts[name];
    parts[name] = next;
    if (!current?.isConnected) return next;
    const active = document.activeElement;
    const focusKey = current.contains(active) ? active.dataset?.focus || '' : null;
    current.replaceWith(next);
    if (focusKey !== null) {
      const target = (focusKey && next.querySelector(`[data-focus="${focusKey}"]`)) || next.querySelector('h3');
      target?.focus({ preventScroll: true });
    }
    return next;
  }

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

  const cardKey = () => [lod.current, lod.pinned, lod.manifest ? 1 : 0].join('|');
  // Yeni kademe önbelleğe girince kayıt durumu "kısmi"ye dönebilir.
  const offlineKey = () => [lod.current, lod.manifest ? 1 : 0].join('|');

  function buildCard() {
    const tiers = Array.isArray(entry?.tiers) ? entry.tiers : [];
    const card = liveSection(t('viewer.modelCard'));
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
        tierActions.append(el('button', {
          class: 'btn btn--sm', type: 'button', 'data-focus': 'quality',
          onclick: () => { lod.pin(''); refreshCard(); },
        }, t('viewer.autoQuality')));
      } else if (highest && String(highest.id) !== lod.current) {
        tierActions.append(el('button', {
          class: 'btn btn--soft btn--sm', type: 'button', 'data-focus': 'quality',
          onclick: () => { lod.pin(String(highest.id)); track('quality_pin', { id: modelId, t: highest.id }); refreshCard(); },
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
    return card;
  }

  function refreshCard() {
    const key = cardKey();
    if (key === keys.card || !parts.card) return;
    keys.card = key;
    mount('card', buildCard());
  }

  function buildOffline(state) {
    const note = el('p', { class: 'info-text' });
    const actions = el('div', { class: 'info-actions' });
    const part = liveSection(t('viewer.offline'), note, actions);
    if (state === 'unsupported') {
      note.textContent = t('viewer.offlineUnsupported');
      return part;
    }
    if (state === 'saved') {
      note.textContent = t('viewer.offlineSaved');
      actions.append(el('button', {
        class: 'btn btn--sm', type: 'button', 'data-focus': 'offline-remove',
        onclick: async () => {
          await offline.remove();
          toast(t('viewer.offlineRemoved'), { iconName: 'trash' });
          void renderOffline();
        },
      }, icon('trash', 'icon-sm'), t('viewer.offlineRemove')));
      return part;
    }
    note.textContent = state === 'partial' ? t('viewer.offlinePartial') : t('viewer.offlineNone');
    const size = fmt.bytes(offline.totalBytes);
    const label = el('span', {}, saveLabel(size));
    const save = el('button', { class: 'btn btn--soft btn--sm', type: 'button', 'data-focus': 'offline-save' }, icon('offline', 'icon-sm'), label);
    syncSaveButton(save, label, size);
    save.addEventListener('click', async () => {
      if (offline.busy) return;
      try {
        const count = await offline.save();
        track('offline_saved', { id: modelId, n: count });
        toast(t('viewer.offlineDone'), { iconName: 'check' });
      } catch (error) {
        console.warn('Çevrimdışı kayıt tamamlanamadı:', error);
        toast(t('viewer.offlineFailed'), { timeout: 7000 });
      }
    });
    actions.append(save);
    return part;
  }

  function saveLabel(size) {
    if (offline.busy) {
      const { done = 0, total = 0 } = offline.progress || {};
      return total ? t('viewer.offlineSaving', { done, total }) : t('viewer.offlinePreparing');
    }
    if (offline.failed) return t('viewer.offlineRetry');
    return size ? t('viewer.offlineSave', { size }) : t('viewer.offlineSaveUnknown');
  }

  // Kayıt sürerken düğme yerinde güncellenir. `disabled` yerine aria-disabled:
  // devre dışı kalan düğme odağı düşürür, klavye kullanıcısı yerini kaybederdi.
  function syncSaveButton(button, label, size) {
    label.textContent = saveLabel(size);
    button.setAttribute('aria-disabled', String(offline.busy));
    button.setAttribute('aria-busy', String(offline.busy));
  }

  async function renderOffline() {
    if (!parts.offline) return;
    const token = ++offlineToken;
    // Her zaman beklenir: panel açılırken bölüm, dialog görünür olduktan sonra yerleşir.
    const state = await (offline.busy ? 'none' : offline.state());
    if (token !== offlineToken || !parts.offline) return;
    keys.offline = offlineKey();
    mount('offline', buildOffline(state));
  }

  offline?.subscribe?.(() => {
    if (!dialog.open || !parts.offline) return;
    const button = parts.offline.querySelector('[data-focus="offline-save"]');
    if (offline.busy && button) syncSaveButton(button, button.querySelector('span'), fmt.bytes(offline.totalBytes));
    else void renderOffline();
  });

  const buildAr = text => liveSection(t('viewer.arSection'), el('p', { class: 'info-text' }, text));
  ar?.subscribe?.(() => refresh());

  /** Durum değişiminde çağrılır: yalnızca değişen bölüm yeniden çizilir. */
  function refresh() {
    if (!dialog.open) return;
    refreshCard();
    if (parts.offline && !offline.busy && offlineKey() !== keys.offline) {
      keys.offline = offlineKey();
      void renderOffline();
    }
    const arText = ar.statusText();
    if (parts.ar && arText !== keys.ar) {
      keys.ar = arText;
      mount('ar', buildAr(arText));
    }
  }

  function render() {
    body.textContent = '';
    parts.card = parts.offline = parts.ar = null;
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

    // 6) Model künyesi (kademe değişince yenilenir)
    keys.card = cardKey();
    body.append(mount('card', buildCard()));

    // 7) Çevrimdışı kullanım (önce "denetleniyor", durum gelince yerine konur)
    if (offline && 'caches' in window) {
      parts.offline = null;
      keys.offline = offlineKey();
      body.append(mount('offline', liveSection(t('viewer.offline'), el('p', { class: 'info-text' }, t('viewer.offlineChecking')))));
      void renderOffline();
    }

    // 8) AR durumu (destek denetimi sonradan bitebilir)
    keys.ar = ar.statusText();
    body.append(mount('ar', buildAr(keys.ar)));

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
    refresh,
    get isOpen() { return dialog.open; },
  };
}
