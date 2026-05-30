package com.r34pro.app

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.os.Bundle
import android.util.Log
import android.view.KeyEvent
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private var extensionInjectedForUrl: String? = null

    private val assetLoader: WebViewAssetLoader by lazy {
        WebViewAssetLoader.Builder()
            .setDomain(ASSET_DOMAIN)
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (!sessionUnlocked) {
            redirectToPinLock()
            return
        }

        WindowCompat.setDecorFitsSystemWindows(window, true)

        webView = WebView(this).apply {
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                loadsImagesAutomatically = true
                mediaPlaybackRequiresUserGesture = false
                useWideViewPort = true
                loadWithOverviewMode = false
                builtInZoomControls = false
                displayZoomControls = false
                mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                userAgentString = R34ProBridge.DESKTOP_USER_AGENT
                allowFileAccess = true
                allowContentAccess = true
                textZoom = 100
            }

            addJavascriptInterface(R34ProBridge(this@MainActivity), "R34ProAndroid")
            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                    Log.d(
                        TAG,
                        "JS ${message.messageLevel()}: ${message.message()} (${message.sourceId()}:${message.lineNumber()})"
                    )
                    return super.onConsoleMessage(message)
                }
            }
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest
                ): WebResourceResponse? {
                    return assetLoader.shouldInterceptRequest(request.url)
                        ?: super.shouldInterceptRequest(view, request)
                }

                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val url = request.url.toString()
                    if (isRule34Url(url)) {
                        return false
                    }
                    return true
                }

                override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                    extensionInjectedForUrl = null
                    injectViewportSetup(view)
                    super.onPageStarted(view, url, favicon)
                }

                override fun onPageFinished(view: WebView, url: String) {
                    super.onPageFinished(view, url)
                    injectViewportSetup(view)
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

    override fun onResume() {
        super.onResume()
        if (!sessionUnlocked) {
            redirectToPinLock()
        }
    }

    override fun onPause() {
        super.onPause()
        sessionUnlocked = false
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (::webView.isInitialized) {
            webView.saveState(outState)
        }
    }

    override fun onRestoreInstanceState(savedInstanceState: Bundle) {
        super.onRestoreInstanceState(savedInstanceState)
        if (::webView.isInitialized) {
            webView.restoreState(savedInstanceState)
        }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
            return super.onKeyDown(keyCode, event)
        }
        return super.onKeyDown(keyCode, event)
    }

    private fun redirectToPinLock() {
        startActivity(Intent(this, PinLockActivity::class.java))
        finish()
    }

    private fun injectViewportSetup(view: WebView) {
        try {
            val source = readAsset("r34pro/viewport-setup.js")
            view.evaluateJavascript(source, null)
        } catch (error: Exception) {
            Log.e(TAG, "Failed to inject viewport setup", error)
        }
    }

    private fun injectExtension(view: WebView) {
        val currentUrl = view.url ?: return
        if (extensionInjectedForUrl == currentUrl) return
        extensionInjectedForUrl = currentUrl

        injectViewportSetup(view)
        injectAssetScript(view, "r34pro/chrome-polyfill.js") {
            injectAssetScript(view, "extension/background.js") {
                injectAssetCss(view, "extension/content-scripts/content.css") {
                    injectAssetScript(view, "extension/content-scripts/content.js") {
                        verifyInjection(view)
                    }
                }
            }
        }
    }

    private fun injectAssetScript(view: WebView, assetPath: String, onDone: () -> Unit) {
        try {
            val source = readAsset(assetPath)
            view.evaluateJavascript(source) {
                Log.d(TAG, "Injected script: $assetPath")
                onDone()
            }
        } catch (error: Exception) {
            Log.e(TAG, "Failed to inject script: $assetPath", error)
        }
    }

    private fun injectAssetCss(view: WebView, assetPath: String, onDone: () -> Unit) {
        try {
            val css = readAsset(assetPath)
            val js = """
                (function() {
                  if (document.getElementById('r34pro-content-css')) return;
                  var style = document.createElement('style');
                  style.id = 'r34pro-content-css';
                  style.textContent = ${JSONObject.quote(css)};
                  document.head.appendChild(style);
                })();
            """.trimIndent()
            view.evaluateJavascript(js) {
                Log.d(TAG, "Injected css: $assetPath")
                onDone()
            }
        } catch (error: Exception) {
            Log.e(TAG, "Failed to inject css: $assetPath", error)
        }
    }

    private fun verifyInjection(view: WebView) {
        view.evaluateJavascript(
            """
            (function() {
              var hasRoot = !!document.getElementById('reframer-root');
              var hasVoid = !!document.querySelector('.void-navigator-root');
              return JSON.stringify({ hasRoot: hasRoot, hasVoid: hasVoid, href: location.href });
            })();
            """.trimIndent()
        ) { result ->
            Log.d(TAG, "Injection check: $result")
            if (result == null || result.contains("\"hasRoot\":false")) {
                view.postDelayed({ reinjectIfNeeded(view) }, 750)
            }
        }
    }

    private fun reinjectIfNeeded(view: WebView) {
        view.evaluateJavascript(
            "(function(){ return !!document.getElementById('reframer-root'); })();"
        ) { result ->
            if (result == "false") {
                Log.w(TAG, "R34 Pro UI missing, retrying injection")
                extensionInjectedForUrl = null
                injectExtension(view)
            }
        }
    }

    private fun readAsset(path: String): String {
        return assets.open(path).bufferedReader().use { it.readText() }
    }

    private fun isRule34Url(url: String): Boolean {
        return url.contains("rule34.xxx")
    }

    companion object {
        private const val TAG = "R34Pro"
        private const val HOME_URL = "https://rule34.xxx/index.php?page=post&s=list&tags=all"
        private const val ASSET_DOMAIN = "appassets.androidplatform.net"

        @Volatile
        private var sessionUnlocked = false

        fun markUnlocked() {
            sessionUnlocked = true
        }
    }
}
