/* Boyamadan önce çalışan küçük önyükleme betiği (klasik, <head> içinde).
   - Kayıtlı tema tercihini uygular; depolama kapalıysa sistem teması kalır.
   - <html> öğesine `js` sınıfı ekler (JS gerektiren denetimler için).
   Sayfa kilidi (data-theme-lock) varsa temaya dokunulmaz. */
(() => {
  const root = document.documentElement;
  root.classList.add('js');
  if (root.hasAttribute('data-theme-lock')) return;
  let theme = null;
  try {
    theme = localStorage.getItem('gallery-theme');
  } catch { /* Gizli pencere / engellenmiş depolama: sistem tercihi geçerli. */ }
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  const dark = theme ? theme === 'dark' : window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#111110' : '#f6f5f1';
})();
