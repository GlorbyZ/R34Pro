(function () {
  if (window.__R34PRO_CONTENT_LOADED || document.getElementById('reframer-root')) return;
  if (window.__R34PRO_CONTENT_LOADING) return;
  window.__R34PRO_CONTENT_LOADING = true;

  var CONTENT_URL =
    'https://appassets.androidplatform.net/assets/extension/content-scripts/content.js';

  function markFailed() {
    window.__R34PRO_CONTENT_LOADING = false;
    window.__R34PRO_CONTENT_SCRIPT_TAG_FAILED = true;
  }

  function inject() {
    if (document.getElementById('r34pro-content-script')) return;
    var script = document.createElement('script');
    script.id = 'r34pro-content-script';
    script.src = CONTENT_URL;
    script.async = false;
    script.onload = function () {
      window.__R34PRO_CONTENT_LOADED = true;
      window.__R34PRO_CONTENT_LOADING = false;
    };
    script.onerror = function () {
      markFailed();
    };
    (document.head || document.documentElement).appendChild(script);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject, { once: true });
  } else {
    inject();
  }
})();
