/* Apply the shared preference before styles paint; storage may be unavailable. */
(() => {
  try {
    const theme = localStorage.getItem('gallery-theme');
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  } catch { /* System preference remains the fallback. */ }
})();
