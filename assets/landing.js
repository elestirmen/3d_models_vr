/* Tanıtım sayfası — galeride seçilen tema tercihini uygular.
   Sayfanın başka bir davranışı yoktur; içerik tamamen statiktir. */
(() => {
  'use strict';
  try {
    const stored = localStorage.getItem('gallery-theme');
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored);
    }
  } catch {
    /* localStorage kapalı olabilir */
  }
})();
