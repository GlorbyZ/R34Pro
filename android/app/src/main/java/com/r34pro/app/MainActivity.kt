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
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var pinOverlay: View
    private lateinit var pinLock: PinLockController
    private var extensionInjectedForUrl: String? = null
    private var injectAttempts = 0
    private var pendingShowPinOnResume = false
    private var immersiveRequested = false

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
            cacheMode = WebSettings.LOAD_DEFAULT
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
                return !isRule34Url(request.url.toString())
            }

            override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                extensionInjectedForUrl = null
                injectEarlyBootstrap(view)
                super.onPageStarted(view, url, favicon)
            }

            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                injectEarlyBootstrap(view)
                if (isRule34Url(url)) {
                    view.postDelayed({ injectExtension(view) }, 150)
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

    override fun onPause() {
        webView.onPause()
        super.onPause()
        sessionUnlocked = false
        pendingShowPinOnResume = true
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        if (!sessionUnlocked || pendingShowPinOnResume) {
            pinLock.show()
        }
        if (immersiveRequested) {
            applyImmersiveMode(true)
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus && immersiveRequested) {
            applyImmersiveMode(true)
        }
    }

    fun applyImmersiveMode(enabled: Boolean) {
        immersiveRequested = enabled
        WindowCompat.setDecorFitsSystemWindows(window, !enabled)
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        if (enabled) {
            controller.hide(WindowInsetsCompat.Type.systemBars())
            controller.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        } else {
            controller.show(WindowInsetsCompat.Type.systemBars())
        }
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
        injectScript(view, "r34pro/viewport-setup.js")
        injectScript(view, "r34pro/loading-shell.js")
    }

    private fun injectExtension(view: WebView) {
        val currentUrl = view.url ?: return
        if (extensionInjectedForUrl == currentUrl) {
            pollForUiMount(view, 0)
            return
        }
        extensionInjectedForUrl = currentUrl
        injectAttempts = 0

        injectScript(view, "r34pro/chrome-polyfill.js") {
            injectScript(view, "extension/background.js") {
                injectAssetCss(view, "extension/content-scripts/content.css") {
                    injectContentBundle(view) {
                        pollForUiMount(view, 0)
                    }
                }
            }
        }
    }

    private fun injectContentBundle(view: WebView, onDone: () -> Unit) {
        injectScript(view, "r34pro/load-content.js") {
            view.postDelayed({
                view.evaluateJavascript(
                    "(function(){ return !!window.__R34PRO_CONTENT_SCRIPT_TAG_FAILED; })();"
                ) { failed ->
                    if (failed == "true") {
                        Log.w(TAG, "Script tag load failed, falling back to direct injection")
                        injectLargeScriptEval(view, "extension/content-scripts/content.js", onDone)
                    } else {
                        onDone()
                    }
                }
            }, 400)
        }
    }

    private fun injectLargeScriptEval(
        view: WebView,
        assetPath: String,
        onDone: (() -> Unit)? = null
    ) {
        try {
            val source = readAsset(assetPath)
            if (source.length <= 120_000) {
                injectScript(view, assetPath, onDone)
                return
            }

            val chunks = source.chunked(28_000)
            fun injectChunk(index: Int) {
                if (index >= chunks.size) {
                    onDone?.invoke()
                    return
                }
                val chunk = JSONObject.quote(chunks[index])
                val js = when (index) {
                    0 -> "window.__r34pro_eval_buf = $chunk;"
                    chunks.lastIndex -> """
                        window.__r34pro_eval_buf += $chunk;
                        try { (0, eval)(window.__r34pro_eval_buf); } finally { delete window.__r34pro_eval_buf; }
                    """.trimIndent()
                    else -> "window.__r34pro_eval_buf += $chunk;"
                }
                view.evaluateJavascript(js) { injectChunk(index + 1) }
            }
            injectChunk(0)
        } catch (error: Exception) {
            Log.e(TAG, "Failed chunked script injection: $assetPath", error)
            onDone?.invoke()
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

    private fun pollForUiMount(view: WebView, attempt: Int) {
        view.evaluateJavascript(
            """
            (function() {
              var hasRoot = !!document.getElementById('reframer-root');
              var hasVoid = !!document.querySelector('.void-navigator-root');
              if (hasRoot || hasVoid) {
                window.__r34proDismissLoadingShell && window.__r34proDismissLoadingShell();
              }
              return JSON.stringify({
                hasRoot: hasRoot,
                hasVoid: hasVoid,
                loading: !!window.__R34PRO_CONTENT_LOADING,
                loaded: !!window.__R34PRO_CONTENT_LOADED,
                href: location.href
              });
            })();
            """.trimIndent()
        ) { result ->
            Log.d(TAG, "UI poll ($attempt): $result")
            if (result != null && result.contains("\"hasRoot\":true")) {
                injectAttempts = 0
                dismissLoadingShell(view)
                return@evaluateJavascript
            }

            if (attempt >= 30) {
                if (injectAttempts < 3) {
                    injectAttempts++
                    Log.w(TAG, "R34 Pro UI missing after polling, reinject attempt $injectAttempts")
                    extensionInjectedForUrl = null
                    view.postDelayed({ injectExtension(view) }, 800)
                } else {
                    Log.e(TAG, "R34 Pro UI failed to mount after $injectAttempts reinject attempts")
                    dismissLoadingShell(view)
                }
                return@evaluateJavascript
            }

            view.postDelayed({ pollForUiMount(view, attempt + 1) }, 400)
        }
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
        private const val HOME_URL =
            "https://rule34.xxx/index.php?page=post&s=list&tags=all&r34_browse=1"
        private const val ASSET_DOMAIN = "appassets.androidplatform.net"

        @Volatile
        private var sessionUnlocked = false

        fun markUnlocked() {
            sessionUnlocked = true
        }
    }
}
