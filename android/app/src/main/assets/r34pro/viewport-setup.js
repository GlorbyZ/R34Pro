(function () {
  if (window.__R34PRO_VIEWPORT__) return;
  window.__R34PRO_VIEWPORT__ = true;

  document.documentElement.classList.add('r34pro-android');

  var meta = document.querySelector('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'viewport');
    (document.head || document.documentElement).appendChild(meta);
  }

  meta.setAttribute(
    'content',
    'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=5.0, viewport-fit=cover'
  );

  document.documentElement.style.setProperty(
    '--r34-ui-scale',
    'clamp(1, calc(100vw / 360), 1.35)'
  );
})();
