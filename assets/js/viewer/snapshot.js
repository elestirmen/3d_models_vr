/* İmzalı ekran görüntüsü: model-viewer'ın kendi karesi alınır, alt köşeye
   yapı adı ve künye yazılır. İndirme aynı köken blob'u olduğu için CSP'ye
   takılmaz. */

import { t, lang } from '../core/i18n.js?v=425bd5c155';

export async function takeSnapshot({ mv, title, modelId }) {
  if (!mv.loaded || typeof mv.toBlob !== 'function') throw Object.assign(new Error('not-ready'), { code: 'not-ready' });
  const blob = await mv.toBlob({ mimeType: 'image/png', idealAspect: false });
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');

  // Saydam zemin yerine sahnenin tema rengi (PNG'de siyah/saydam kalmasın).
  const styles = getComputedStyle(document.documentElement);
  const top = styles.getPropertyValue('--stage-1').trim() || '#f4f2ed';
  const bottom = styles.getPropertyValue('--stage-2').trim() || '#e4e0d7';
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, bottom);
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);

  const scale = canvas.width / 1600;
  const pad = Math.round(28 * scale);
  const titleSize = Math.max(14, Math.round(30 * scale));
  const noteSize = Math.max(11, Math.round(18 * scale));
  const note = `${t('common.siteName')} · vr.perinet.org${lang === 'tr' ? '' : '/en/'}`;

  context.font = `700 ${titleSize}px Inter, system-ui, sans-serif`;
  const titleWidth = context.measureText(title).width;
  context.font = `500 ${noteSize}px Inter, system-ui, sans-serif`;
  const noteWidth = context.measureText(note).width;
  const boxWidth = Math.max(titleWidth, noteWidth) + pad * 2;
  const boxHeight = titleSize + noteSize + pad * 1.6;
  const boxX = pad;
  const boxY = canvas.height - boxHeight - pad;

  context.fillStyle = 'rgba(17, 17, 16, 0.66)';
  context.beginPath();
  if (context.roundRect) context.roundRect(boxX, boxY, boxWidth, boxHeight, Math.round(14 * scale));
  else context.rect(boxX, boxY, boxWidth, boxHeight);
  context.fill();
  context.fillStyle = '#ffffff';
  context.font = `700 ${titleSize}px Inter, system-ui, sans-serif`;
  context.fillText(title, boxX + pad, boxY + pad * 0.55 + titleSize);
  context.fillStyle = 'rgba(255, 255, 255, 0.78)';
  context.font = `500 ${noteSize}px Inter, system-ui, sans-serif`;
  context.fillText(note, boxX + pad, boxY + pad * 0.55 + titleSize + noteSize * 1.35);

  const stamped = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  const url = URL.createObjectURL(stamped || blob);
  const link = document.createElement('a');
  const slug = String(modelId || title).toLocaleLowerCase('tr-TR').replace(/[^a-z0-9]+/g, '-');
  link.href = url;
  link.download = `oku-${slug}-${new Date().toISOString().slice(0, 10)}.png`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
