/* Bina tanıtım sayfası: tema/dil davranışları ve önizleme görsellerinin
   yüklenme durumu. İçerik tamamen statiktir; JS yalnızca süsler. */

import { $$, initPage, session, track } from './core/site.js?v=18aec0c522';

initPage();

for (const media of $$('[data-lqip]')) {
  const image = media.querySelector('img');
  if (!image) continue;
  const ready = () => media.classList.add('is-ready');
  if (image.complete && image.naturalWidth > 0) ready();
  else image.addEventListener('load', ready, { once: true });
}

// Görüntüleyicinin "geri" bağlantısı bu sayfaya değil galeriye döner;
// tanıtım sayfasından gelindiğinde galerinin ana adresi kullanılır.
for (const link of $$('[data-model-link], .intro__media')) {
  link.addEventListener('click', () => session.set('oku-explore-url', new URL('../#explore', location.href).pathname + '#explore'));
}

track('landing_view', { id: location.pathname.split('/').filter(Boolean).pop() || '' });
