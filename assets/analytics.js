/* Kullanım ölçümü — çerezsiz, kimliksiz, üçüncü taraf yok.
 *
 * Olaylar aynı kökendeki /e uç noktasına `navigator.sendBeacon` ile
 * gönderilir. nginx bu adrese 204 döner ve yalnızca zaman damgası ile sorgu
 * dizesini günlüğe yazar: IP, user-agent, referrer ve çerez KAYDEDİLMEZ.
 * Bu yüzden kişisel veri işlenmez ve ayrı bir analitik servisi gerekmez.
 *
 * Umami/Plausible gibi bir servise geçilecekse yalnızca ENDPOINT değişir.
 *
 * Devre dışı bırakma:
 *   - Tarayıcı "Do Not Track" gönderiyorsa hiç ölçüm yapılmaz.
 *   - localStorage'da `analytics-opt-out=1` varsa hiç ölçüm yapılmaz.
 */

window.OKU_ANALYTICS = (() => {
  const ENDPOINT = '/e';
  const SCHEMA = '1';

  function optedOut() {
    try {
      if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return true;
      return localStorage.getItem('analytics-opt-out') === '1';
    } catch {
      return false;
    }
  }

  const enabled = !optedOut() && typeof navigator.sendBeacon === 'function';

  /** Ölçüm hiçbir zaman sayfayı bozmamalı; her şey sessizce yutulur. */
  function send(event, params = {}) {
    if (!enabled) return;
    try {
      const query = new URLSearchParams({ v: SCHEMA, e: String(event) });
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') continue;
        // Sorgu dizesi günlüğe yazıldığı için kısa ve ASCII tutulur.
        query.set(key, String(value).slice(0, 64));
      }
      navigator.sendBeacon(`${ENDPOINT}?${query.toString()}`);
    } catch {
      /* yok say */
    }
  }

  return { enabled, send };
})();
