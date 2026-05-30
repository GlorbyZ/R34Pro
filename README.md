# R34 Pro v1.7.0

A high-performance, keyboard-driven navigation engine for Rule34. This extension replaces the default site interface with a reframed, "Obsidian & Gold" design system focused on speed, efficiency, and archival integrity.

## 🚀 Core Features

### 🎮 High-Velocity Navigation
*   **WASD & Arrow Keys**: Navigate between posts with zero-latency photography robotics.
*   **Lightbox Toggle (F)**: Instantly enter/exit a high-fidelity fullscreen view with deep-zoom capabilities.
*   **Slideshow (Space / S)**: Automated post-to-post navigation with customizable intervals.

### 📦 Archival Gateway
*   **One-Click Download**: Integrated gateways in the sidebar and lightbox for single-click archival of high-resolution assets.
*   **Bulk Ready**: Designed to work alongside background collection engines for efficient gallery aggregation.

### 💎 Obsidian Design System
*   **Boutique Aesthetic**: A custom dark-mode interface built with premium glassmorphism and gold accents.
*   **Structural Hardening**: Enforced structural integrity to prevent site-level CSS interference.

## 🌐 Quick Start (Easy Installation)

If you aren't familiar with Git or coding, follow these steps to get R34 Pro running in seconds:

1.  **Download**: Click the green **Code** button at the top of this page and select **Download ZIP**.
2.  **Unzip**: Extract the downloaded folder to a location on your computer (like your Desktop).
3.  **Open Chrome**: Navigate to `chrome://extensions/` in your browser.
4.  **Developer Mode**: In the top-right corner, toggle the **Developer mode** switch to **ON**.
5.  **Load the App**: Click the **Load unpacked** button in the top-left.
6.  **Select Folder**: Navigate inside the unzipped folder and select the folder named:
    `r34pro/.output/chrome-mv3`
7.  **Done**: Go to Rule34.xxx and enjoy the high-performance navigation!

## 📱 Android App (APK)

R34 Pro can also run on Android as a standalone app. The Android build wraps the extension inside a WebView and injects the same R34 Pro UI on `rule34.xxx`.

### Install on your phone

**Direct download (always use `main`):** [`releases/r34pro-1.7.0.apk`](https://github.com/GlorbyZ/R34Pro/raw/main/releases/r34pro-1.7.0.apk)

1. Download the APK from the link above (or browse `releases/` on the **`main`** branch).
2. On Android, enable **Install unknown apps** for your file manager or browser.
3. Open the APK and install **R34 Pro**.
4. Launch the app. It opens Rule34 with the R34 Pro interface already active.

Or build it yourself:

```bash
npm install
npm run build:android
```

Output: `android/app/build/outputs/apk/release/app-release.apk`

Downloads from the app are saved to your phone's **Downloads** folder.

### Rebuild after code changes

```bash
npm run build:android
```

For a debug build:

```bash
npm run build:android:debug
```

## 🛠️ Developer Setup (Build from Source)

For those who want to modify the code:

1.  Clone this repository: `git clone https://github.com/GlorbyZ/R34Pro.git`
2.  Run `npm install` to get dependencies.
3.  Run `npm run build` to generate the production files.
4.  Load the extension from the `.output/chrome-mv3` directory.

## 🧪 Technical Context
*   **Framework**: [WXT](https://wxt.dev/) (Web Extension Toolbox)
*   **UI Library**: React 19 + TailwindCSS 4
*   **Methodology**: Built using "vibecoding" (agentic AI pairing) to ensure rapid deployment and robust site parsing.

---
**Disclaimer**: This is an independent project developed for personal UX enhancement. Only tested on Chrome.
