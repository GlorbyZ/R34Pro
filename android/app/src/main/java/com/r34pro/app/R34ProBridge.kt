package com.r34pro.app

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Environment
import android.webkit.JavascriptInterface
import android.webkit.URLUtil
import android.widget.Toast

class R34ProBridge(private val context: Context) {
    @JavascriptInterface
    fun setImmersive(enabled: Boolean) {
        val activity = context as? MainActivity ?: return
        activity.runOnUiThread { activity.applyImmersiveMode(enabled) }
    }

    @JavascriptInterface
    fun download(url: String, filename: String) {
        try {
            val request = DownloadManager.Request(Uri.parse(url)).apply {
                setTitle(filename)
                setDescription("R34 Pro download")
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename)
                setAllowedOverMetered(true)
                setAllowedOverRoaming(true)
                addRequestHeader("Referer", "https://rule34.xxx/")
                addRequestHeader("User-Agent", DESKTOP_USER_AGENT)
            }

            val manager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            manager.enqueue(request)
        } catch (error: Exception) {
            Toast.makeText(context, "Download failed: ${error.message}", Toast.LENGTH_SHORT).show()
        }
    }

    companion object {
        const val DESKTOP_USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    }
}
