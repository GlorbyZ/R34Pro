package com.r34pro.app

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.widget.GridLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat

class PinLockActivity : AppCompatActivity() {
    private val entered = StringBuilder()
    private lateinit var pinDots: TextView
    private lateinit var pinError: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, true)
        setContentView(R.layout.activity_pin_lock)

        pinDots = findViewById(R.id.pinDots)
        pinError = findViewById(R.id.pinError)
        val pinPad = findViewById<GridLayout>(R.id.pinPad)

        val keys = listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫")
        keys.forEach { key ->
            pinPad.addView(createKeyButton(key))
        }

        updateDots()
    }

    private fun createKeyButton(label: String): TextView {
        return TextView(this).apply {
            text = label
            gravity = Gravity.CENTER
            textSize = 24f
            setTextColor(Color.WHITE)
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
            startActivity(Intent(this, MainActivity::class.java))
            finish()
            return
        }

        pinError.text = getString(R.string.pin_error)
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
        return (value * resources.displayMetrics.density).toInt()
    }

    companion object {
        private const val PIN = "6969"
    }
}
