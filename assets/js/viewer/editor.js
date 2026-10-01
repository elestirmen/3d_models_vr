/* Hotspot yazma modu (?edit=hotspot).
   Modele tıklanınca yüzey konumu ve normali okunur; models.json'a
   yapıştırılabilecek, şemaya uygun JSON üretilir. Hotspot içeriği tahminle
   değil, sahnede tıklanarak oluşur. */

import { t } from '../core/i18n.js?v=425bd5c155';
import { el } from '../core/site.js?v=18aec0c522';

export function setupHotspotEditor({ mv, stage, hint }) {
  const draft = [];
  const output = el('pre', { class: 'editor__output', tabindex: '0' }, '[]');
  const panel = el('aside', { class: 'editor', 'aria-label': t('viewer.editorTitle') },
    el('h2', { class: 'editor__title' }, t('viewer.editorTitle')),
    el('p', { class: 'editor__hint' }, t('viewer.editorHint')),
    output);
  const copy = el('button', { class: 'btn btn--primary btn--sm', type: 'button' }, t('viewer.editorCopy'));
  const undo = el('button', { class: 'btn btn--sm', type: 'button' }, t('viewer.editorUndo'));
  panel.append(el('div', { class: 'editor__actions' }, copy, undo));
  stage.append(panel);

  const slug = (text) => String(text || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || `nokta-${draft.length + 1}`;
  const refresh = () => { output.textContent = JSON.stringify(draft, null, 2); };
  // Şema `position` için metre ekini kabul eder, `normal` için etmez.
  const vector = (value, unit) => ['x', 'y', 'z'].map(axis => `${Number(value[axis]).toFixed(4)}${unit}`).join(' ');

  mv.addEventListener('click', (event) => {
    if (event.target !== mv) return;
    const hit = mv.positionAndNormalFromPoint?.(event.clientX, event.clientY);
    if (!hit) {
      hint(t('viewer.measureMiss'), 3000);
      return;
    }
    const label = window.prompt(t('viewer.editorPrompt'), '');
    if (!label) return;
    draft.push({ id: slug(label), label, position: vector(hit.position, 'm'), normal: vector(hit.normal, '') });
    refresh();
    hint(t('viewer.editorAdded', { n: draft.length }), 2000);
  });
  undo.addEventListener('click', () => { draft.pop(); refresh(); });
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(draft, null, 2));
      hint(t('viewer.editorCopied'), 2000);
    } catch {
      output.focus();
    }
  });
}
