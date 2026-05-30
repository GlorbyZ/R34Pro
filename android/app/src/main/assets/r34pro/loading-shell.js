(function () {
  var LOGO_URL = 'https://appassets.androidplatform.net/assets/extension/logo.webp';
  var autoDismissTimer = null;

  function pauseAllPageMedia() {
    try {
      document.querySelectorAll('video, audio').forEach(function (el) {
        try {
          el.pause();
          el.muted = true;
          el.autoplay = false;
          el.removeAttribute('autoplay');
        } catch (error) {
          /* ignore */
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
      'html.r34pro-loading #r34pro-loading-shell {',
      '  display: flex !important;',
      '}',
      '#r34pro-loading-shell {',
      '  position: fixed;',
      '  top: env(safe-area-inset-top, 0px);',
      '  left: 0;',
      '  right: 0;',
      '  height: 3px;',
      '  z-index: 2147483646;',
      '  display: none;',
      '  pointer-events: none;',
      '  overflow: hidden;',
      '  background: rgba(255,255,255,0.06);',
      '}',
      '#r34pro-loading-shell .r34pro-loading-bar {',
      '  width: 35%;',
      '  height: 100%;',
      '  background: linear-gradient(90deg, #996515, #d4af37, #f9d71c);',
      '  animation: r34pro-loading-slide 0.9s ease-in-out infinite;',
      '}',
      '@keyframes r34pro-loading-slide {',
      '  0% { transform: translateX(-120%); }',
      '  100% { transform: translateX(320%); }',
      '}',
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureShell() {
    var shell = document.getElementById('r34pro-loading-shell');
    if (shell) return shell;

    shell = document.createElement('div');
    shell.id = 'r34pro-loading-shell';
    shell.innerHTML = '<div class="r34pro-loading-bar"></div>';

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

  window.__r34proShowLoadingShell = function () {
    ensureStyles();
    ensureShell();
    document.documentElement.classList.add('r34pro-loading');
    var shell = document.getElementById('r34pro-loading-shell');
    if (shell) shell.style.display = 'block';
    if (autoDismissTimer) clearTimeout(autoDismissTimer);
    autoDismissTimer = setTimeout(function () {
      window.__r34proDismissLoadingShell && window.__r34proDismissLoadingShell();
    }, 1200);
  };

  window.__r34proDismissLoadingShell = function () {
    document.documentElement.classList.remove('r34pro-loading');
    var shell = document.getElementById('r34pro-loading-shell');
    if (shell) shell.style.display = 'none';
    if (autoDismissTimer) {
      clearTimeout(autoDismissTimer);
      autoDismissTimer = null;
    }
  };

  window.addEventListener('pagehide', pauseAllPageMedia);
})();
