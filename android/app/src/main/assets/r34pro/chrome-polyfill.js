(function () {
  if (window.__R34PRO_POLYFILL__) return;
  window.__R34PRO_POLYFILL__ = true;

  const STORAGE_PREFIX = 'r34pro:';
  const listeners = [];
  let lastError = null;

  function clearLastError() {
    lastError = null;
  }

  function setLastError(message) {
    lastError = { message };
  }

  const storageLocal = {
    get(keys, callback) {
      clearLastError();
      const result = {};
      const wanted = Array.isArray(keys)
        ? keys
        : typeof keys === 'string'
          ? [keys]
          : keys && typeof keys === 'object'
            ? Object.keys(keys)
            : null;

      try {
        if (!wanted) {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith(STORAGE_PREFIX)) {
              result[key.slice(STORAGE_PREFIX.length)] = JSON.parse(
                localStorage.getItem(key) || 'null'
              );
            }
          }
        } else {
          for (const key of wanted) {
            const raw = localStorage.getItem(STORAGE_PREFIX + key);
            if (raw != null) {
              result[key] = JSON.parse(raw);
            }
          }
        }
      } catch (error) {
        setLastError(String(error));
      }

      callback?.(result);
      return Promise.resolve(result);
    },
    set(items, callback) {
      clearLastError();
      try {
        for (const [key, value] of Object.entries(items || {})) {
          localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
        }
      } catch (error) {
        setLastError(String(error));
      }
      callback?.();
      return Promise.resolve();
    },
  };

  const runtime = {
    id: 'r34pro-android',
    lastError: null,
    getURL(path) {
      return `https://appassets.androidplatform.net/assets/extension/${String(path || '').replace(/^\//, '')}`;
    },
    onMessage: {
      addListener(listener) {
        listeners.push(listener);
      },
    },
    sendMessage(message, callback) {
      clearLastError();
      let response = undefined;
      let responded = false;

      const sendResponse = (payload) => {
        if (responded) return;
        responded = true;
        response = payload;
      };

      for (const listener of listeners) {
        try {
          const keepOpen = listener(message, { id: runtime.id, url: location.href }, sendResponse);
          if (keepOpen === true && !responded) {
            return;
          }
        } catch (error) {
          console.error('[R34Pro] Message listener failed', error);
        }
      }

      callback?.(response);
    },
  };

  Object.defineProperty(runtime, 'lastError', {
    get() {
      return lastError;
    },
  });

  const downloads = {
    download(options, callback) {
      clearLastError();
      try {
        const url = options?.url;
        const filename = options?.filename || 'download';
        if (!url) {
          setLastError('Missing download URL');
          callback?.(undefined);
          return;
        }

        if (window.R34ProAndroid?.download) {
          window.R34ProAndroid.download(url, filename);
          callback?.(Date.now());
          return;
        }

        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.rel = 'noopener';
        anchor.target = '_blank';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        callback?.(Date.now());
      } catch (error) {
        setLastError(String(error));
        callback?.(undefined);
      }
    },
  };

  const chromeApi = {
    storage: { local: storageLocal },
    runtime,
    downloads,
  };

  window.chrome = chromeApi;
  window.browser = chromeApi;
})();
