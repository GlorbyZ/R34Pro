package com.r34pro.app

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.os.Bundle
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
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
    private lateinit var pinOverlay: View
    private lateinit var pinLock: PinLockController
    private var extensionInjectedForUrl: String? = null
    private var pendingShowPinOnResume = false

    private val assetLoader: WebViewAssetLoader by lazy {
        WebViewAssetLoader.Builder()
            .setDomain(ASSET_DOMAIN)
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    private val assetCache = mutableMapOf<String, String>()

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        WindowCompat.setDecorFitsSystemWindows(window, true)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        pinOverlay = findViewById(R.id.pinOverlay)
        pinLock = PinLockController(this, pinOverlay) {
            pendingShowPinOnResume = false
        }

        webView.settings.apply {
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

        webView.addJavascriptInterface(R34ProBridge(this), "R34ProAndroid")
        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                Log.d(
                    TAG,
                    "JS ${message.messageLevel()}: ${message.message()} (${message.sourceId()}:${message.lineNumber()})"
                )
                return super.onConsoleMessage(message)
            }
        }
        webView.webViewClient = object : WebViewClient() {
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
                    showLoadingShell(view)
                    return false
                }
                return true
            }

            override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                extensionInjectedForUrl = null
                showLoadingShell(view)
                injectEarlyBootstrap(view)
                super.onPageStarted(view, url, favicon)
            }

            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                injectEarlyBootstrap(view)
                if (isRule34Url(url)) {
                    injectExtension(view)
                } else {
                    dismissLoadingShell(view)
                }
            }
        }

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (pinOverlay.visibility == View.VISIBLE) {
                        moveTaskToBack(true)
                        return
                    }
                    webView.evaluateJavascript(
                        "(function(){return !!(window.__r34proHandleBack&&window.__r34proHandleBack());})();"
                    ) { result ->
                        if (result == "true") return@evaluateJavascript
                        if (webView.canGoBack()) {
                            webView.goBack()
                        } else {
                            isEnabled = false
                            onBackPressedDispatcher.onBackPressed()
                        }
                    }
                }
            }
        )

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(HOME_URL)
        }

        if (!sessionUnlocked) {
            pinLock.show()
        }
    }

    override fun onResume() {
        super.onResume()
        if (!sessionUnlocked || pendingShowPinOnResume) {
            pinLock.show()
        }
    }

    override fun onPause() {
        super.onPause()
        sessionUnlocked = false
        pendingShowPinOnResume = true
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
            return super.onKeyDown(keyCode, event)
        }
        return super.onKeyDown(keyCode, event)
    }

    private fun injectEarlyBootstrap(view: WebView) {
        injectScript(view, "r34pro/loading-shell.js")
        injectScript(view, "r34pro/viewport-setup.js")
    }

    private fun injectExtension(view: WebView) {
        val currentUrl = view.url ?: return
        if (extensionInjectedForUrl == currentUrl) {
            verifyInjection(view)
            return
        }
        extensionInjectedForUrl = currentUrl

        injectScript(view, "r34pro/chrome-polyfill.js") {
            injectScript(view, "extension/background.js") {
                injectAssetCss(view, "extension/content-scripts/content.css") {
                    injectScript(view, "extension/content-scripts/content.js") {
                        verifyInjection(view)
                    }
                }
            }
        }
    }

    private fun injectScript(view: WebView, assetPath: String, onDone: (() -> Unit)? = null) {
        try {
            val source = readAsset(assetPath)
            view.evaluateJavascript(source) {
                onDone?.invoke()
            }
        } catch (error: Exception) {
            Log.e(TAG, "Failed to inject script: $assetPath", error)
            onDone?.invoke()
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
            view.evaluateJavascript(js) { onDone() }
        } catch (error: Exception) {
            Log.e(TAG, "Failed to inject css: $assetPath", error)
            onDone()
        }
    }

    private fun verifyInjection(view: WebView) {
        view.evaluateJavascript(
            """
            (function() {
              var hasRoot = !!document.getElementById('reframer-root');
              var hasVoid = !!document.querySelector('.void-navigator-root');
              if (hasRoot || hasVoid) {
                window.__r34proDismissLoadingShell && window.__r34proDismissLoadingShell();
              }
              return JSON.stringify({ hasRoot: hasRoot, hasVoid: hasVoid, href: location.href });
            })();
            """.trimIndent()
        ) { result ->
            Log.d(TAG, "Injection check: $result")
            if (result == null || result.contains("\"hasRoot\":false")) {
                view.postDelayed({ reinjectIfNeeded(view) }, 500)
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

    private fun showLoadingShell(view: WebView) {
        injectScript(view, "r34pro/loading-shell.js")
    }

    private fun dismissLoadingShell(view: WebView) {
        view.evaluateJavascript(
            "window.__r34proDismissLoadingShell && window.__r34proDismissLoadingShell();",
            null
        )
    }

    private fun readAsset(path: String): String {
        return assetCache.getOrPut(path) {
            assets.open(path).bufferedReader().use { it.readText() }
        }
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
