(function () {
  var LOGO_URL = 'https://appassets.androidplatform.net/assets/extension/logo.webp';

  function pauseAllPageMedia() {
    try {
      document.querySelectorAll('video, audio').forEach(function (el) {
        try {
          el.pause();
          el.muted = true;
          el.autoplay = false;
          el.removeAttribute('autoplay');
        } catch (error) {
          /* ignore per-element failures */
        }
      });
    } catch (error) {
      /* ignore */
    }
  }

  function ensureStyles() {
    if (document.getElementById('r34pro-loading-style')) return;
    var style = document.createElement('style');
    style.id = 'r34pro-loading-style';
    style.textContent = [
      'html.r34pro-loading, html.r34pro-loading body {',
      '  background: #000 !important;',
      '  overflow: hidden !important;',
      '}',
      'html.r34pro-loading body > *:not(#r34pro-loading-shell) {',
      '  visibility: hidden !important;',
      '}',
      'html.r34pro-loading video,',
      'html.r34pro-loading audio {',
      '  visibility: hidden !important;',
      '  pointer-events: none !important;',
      '}',
      '#r34pro-loading-shell {',
      '  position: fixed;',
      '  inset: 0;',
      '  z-index: 2147483646;',
      '  display: flex;',
      '  flex-direction: column;',
      '  align-items: center;',
      '  justify-content: center;',
      '  gap: 1.25rem;',
      '  background: #000;',
      '  pointer-events: none;',
      '}',
      '#r34pro-loading-shell img {',
      '  width: 6.5rem;',
      '  height: 6.5rem;',
      '  border-radius: 1.5rem;',
      '  object-fit: contain;',
      '  box-shadow: 0 0 40px rgba(212, 175, 55, 0.35);',
      '}',
      '#r34pro-loading-shell .r34pro-loading-title {',
      '  color: #d4af37;',
      '  font: 700 0.85rem/1.2 Inter, system-ui, sans-serif;',
      '  letter-spacing: 0.35em;',
      '  text-transform: uppercase;',
      '}',
      '#r34pro-loading-shell .r34pro-loading-spinner {',
      '  width: 2rem;',
      '  height: 2rem;',
      '  border: 3px solid rgba(255,255,255,0.08);',
      '  border-top-color: #d4af37;',
      '  border-radius: 999px;',
      '  animation: r34pro-spin 0.9s linear infinite;',
      '}',
      '@keyframes r34pro-spin { to { transform: rotate(360deg); } }',
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureShell() {
    var shell = document.getElementById('r34pro-loading-shell');
    if (shell) return shell;

    shell = document.createElement('div');
    shell.id = 'r34pro-loading-shell';
    shell.innerHTML =
      '<img src="' + LOGO_URL + '" alt="R34 Pro" />' +
      '<div class="r34pro-loading-title">R34 Pro</div>' +
      '<div class="r34pro-loading-spinner"></div>';

    var mount = function () {
      if (!document.body) return false;
      if (!document.body.contains(shell)) document.body.appendChild(shell);
      return true;
    };

    if (!mount()) {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    }

    return shell;
  }

  window.__r34proPauseAllMedia = pauseAllPageMedia;

  var loadingMediaGuard = null;

  window.__r34proShowLoadingShell = function () {
    pauseAllPageMedia();
    ensureStyles();
    document.documentElement.classList.add('r34pro-loading');
    var shell = ensureShell();
    if (shell) shell.style.display = 'flex';
    pauseAllPageMedia();
    if (loadingMediaGuard) clearInterval(loadingMediaGuard);
    loadingMediaGuard = setInterval(pauseAllPageMedia, 250);
  };

  window.__r34proDismissLoadingShell = function () {
    document.documentElement.classList.remove('r34pro-loading');
    var shell = document.getElementById('r34pro-loading-shell');
    if (shell) shell.style.display = 'none';
    if (loadingMediaGuard) {
      clearInterval(loadingMediaGuard);
      loadingMediaGuard = null;
    }
  };

  window.addEventListener('pagehide', pauseAllPageMedia);
  window.addEventListener('beforeunload', pauseAllPageMedia);

  window.__r34proShowLoadingShell();
})();
