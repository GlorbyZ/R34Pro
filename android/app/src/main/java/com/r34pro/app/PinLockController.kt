package com.r34pro.app

import android.view.View
import android.widget.GridLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class PinLockController(
    private val activity: AppCompatActivity,
    private val overlay: View,
    private val onUnlocked: () -> Unit,
) {
    private val entered = StringBuilder()
    private val pinDots: TextView = overlay.findViewById(R.id.pinDots)
    private val pinError: TextView = overlay.findViewById(R.id.pinError)
    private val pinPad: GridLayout = overlay.findViewById(R.id.pinPad)

    init {
        if (pinPad.childCount == 0) {
            listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫").forEach { key ->
                pinPad.addView(createKeyButton(key))
            }
        }
        updateDots()
    }

    fun show() {
        entered.clear()
        pinError.visibility = TextView.INVISIBLE
        updateDots()
        overlay.visibility = View.VISIBLE
        overlay.bringToFront()
    }

    fun hide() {
        overlay.visibility = View.GONE
    }

    private fun createKeyButton(label: String): TextView {
        return TextView(activity).apply {
            text = label
            gravity = android.view.Gravity.CENTER
            textSize = 24f
            setTextColor(android.graphics.Color.WHITE)
            setBackgroundResource(R.drawable.pin_key_background)
            layoutParams = GridLayout.LayoutParams().apply {
                width = dp(92)
                height = dp(72)
                setMargins(dp(8), dp(8), dp(8), dp(8))
            }
            setOnClickListener { onKeyPress(label) }
        }
    }

    private fun onKeyPress(label: String) {
        pinError.visibility = TextView.INVISIBLE
        when (label) {
            "C" -> {
                entered.clear()
                updateDots()
            }
            "⌫" -> {
                if (entered.isNotEmpty()) {
                    entered.deleteCharAt(entered.length - 1)
                    updateDots()
                }
            }
            else -> {
                if (entered.length >= PIN.length) return
                entered.append(label)
                updateDots()
                if (entered.length == PIN.length) {
                    verifyPin()
                }
            }
        }
    }

    private fun verifyPin() {
        if (entered.toString() == PIN) {
            MainActivity.markUnlocked()
            hide()
            onUnlocked()
            return
        }

        pinError.text = activity.getString(R.string.pin_error)
        pinError.visibility = TextView.VISIBLE
        entered.clear()
        updateDots()
    }

    private fun updateDots() {
        val filled = "● ".repeat(entered.length).trimEnd()
        val empty = "○ ".repeat(PIN.length - entered.length).trimEnd()
        pinDots.text = listOf(filled, empty).filter { it.isNotEmpty() }.joinToString(" ")
    }

    private fun dp(value: Int): Int {
        return (value * activity.resources.displayMetrics.density).toInt()
    }

    companion object {
        private const val PIN = "6969"
    }
}
