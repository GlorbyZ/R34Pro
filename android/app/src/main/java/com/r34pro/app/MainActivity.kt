package com.r34pro.app

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.os.Bundle
import android.view.KeyEvent
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private var extensionInjectedForUrl: String? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        WindowCompat.setDecorFitsSystemWindows(window, true)

        webView = WebView(this).apply {
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                loadsImagesAutomatically = true
                mediaPlaybackRequiresUserGesture = false
                useWideViewPort = true
                loadWithOverviewMode = true
                builtInZoomControls = true
                displayZoomControls = false
                mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                userAgentString = R34ProBridge.DESKTOP_USER_AGENT
                allowFileAccess = true
                allowContentAccess = true
            }

            addJavascriptInterface(R34ProBridge(this@MainActivity), "R34ProAndroid")
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val url = request.url.toString()
                    if (isRule34Url(url)) {
                        return false
                    }
                    return true
                }

                override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                    extensionInjectedForUrl = null
                    super.onPageStarted(view, url, favicon)
                }

                override fun onPageFinished(view: WebView, url: String) {
                    super.onPageFinished(view, url)
                    if (isRule34Url(url)) {
                        injectExtension(view)
                    }
                }
            }
        }

        setContentView(webView)

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (webView.canGoBack()) {
                        webView.goBack()
                    } else {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                    }
                }
            }
        )

        if (savedInstanceState == null) {
            webView.loadUrl(HOME_URL)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onRestoreInstanceState(savedInstanceState: Bundle) {
        super.onRestoreInstanceState(savedInstanceState)
        webView.restoreState(savedInstanceState)
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
            return super.onKeyDown(keyCode, event)
        }
        return super.onKeyDown(keyCode, event)
    }

    private fun injectExtension(view: WebView) {
        val currentUrl = view.url ?: return
        if (extensionInjectedForUrl == currentUrl) return
        extensionInjectedForUrl = currentUrl

        val bootstrap = """
            (function() {
              if (window.__R34PRO_BOOTSTRAPPED__) return;
              window.__R34PRO_BOOTSTRAPPED__ = true;

              function loadScript(src) {
                return new Promise(function(resolve, reject) {
                  var script = document.createElement('script');
                  script.src = src;
                  script.onload = resolve;
                  script.onerror = reject;
                  document.head.appendChild(script);
                });
              }

              function loadCss(href) {
                if (document.querySelector('link[data-r34pro-css="content"]')) return;
                var link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = href;
                link.setAttribute('data-r34pro-css', 'content');
                document.head.appendChild(link);
              }

              function injectMobileCss() {
                if (document.getElementById('r34pro-mobile-css')) return;
                var style = document.createElement('style');
                style.id = 'r34pro-mobile-css';
                style.textContent = '@media (max-width: 900px) { .void-navigator-root .w-\\[380px\\] { width: min(100vw, 320px) !important; } }';
                document.head.appendChild(style);
              }

              loadScript('file:///android_asset/r34pro/chrome-polyfill.js')
                .then(function() { return loadScript('file:///android_asset/extension/background.js'); })
                .then(function() {
                  loadCss('file:///android_asset/extension/content-scripts/content.css');
                  injectMobileCss();
                  return loadScript('file:///android_asset/extension/content-scripts/content.js');
                })
                .catch(function(error) {
                  console.error('[R34Pro] Android bootstrap failed', error);
                });
            })();
        """.trimIndent()

        view.evaluateJavascript(bootstrap, null)
    }

    private fun readAsset(path: String): String {
        return assets.open(path).bufferedReader().use { it.readText() }
    }

    private fun isRule34Url(url: String): Boolean {
        return url.contains("rule34.xxx")
    }

    companion object {
        private const val HOME_URL = "https://rule34.xxx/"
    }
}
