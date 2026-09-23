# Photoshop Mobile USB Preview — User & Installation Guide

A complete step-by-step guide on how to install, use, and manage the **Photoshop Mobile Preview** plugin and its background streaming bridge.

---

## Table of Contents
1. [Overview](#1-overview)
2. [Quick Installation](#2-quick-installation)
3. [Using the Plugin in Photoshop](#3-using-the-plugin-in-photoshop)
4. [Connecting Your Phone (USB & Fullscreen)](#4-connecting-your-phone-usb--fullscreen)
5. [Managing the Bridge Server (Start, Stop, Restart)](#5-managing-the-bridge-server)
6. [Troubleshooting & FAQ](#6-troubleshooting--faq)

---

## 1. Overview

The **Photoshop Mobile Preview** suite connects Adobe Photoshop directly to your mobile phone (Android or iPhone) via a physical USB cable (or local Wi-Fi) with **zero latency** and **true borderless fullscreen**:

- **Photoshop UXP Plugin**: Captures your active canvas in real-time as you paint, move layers, or make edits.
- **Bridge Server (Port 3890)**: A lightweight desktop background daemon that streams canvas frames to connected devices.
- **Mobile Client Web App**: A zero-UI Progressive Web App that runs edge-to-edge on your phone with pinch-to-zoom and pan gestures.

---

## 2. Quick Installation

### On macOS

1. Make sure **Adobe Photoshop 2026 / 2025 / 2024** is installed.
2. In the `psd_preview` folder, double-click:
   ```bash
   Install Plugin (Mac).command
   ```
   *(Or in Terminal, run: `./install-plugin.sh`)*
3. The installer will automatically:
   - Package and register the plugin with Adobe Photoshop's UXP engine.
   - Start the background streaming server on port `3890` (configured with auto-restart on system boot).
4. **Important**: If Photoshop is currently open, press **`Cmd + Q`** to completely quit Photoshop, then reopen it.

---

### On Windows

1. In the `psd_preview` folder, double-click:
   ```bat
   Install-Plugin-Windows.bat
   ```
2. The batch script will automatically:
   - Copy plugin assets to your Adobe UXP plugin folder.
   - Register the plugin in Photoshop's `PS.json` registry.
   - Install required dependencies and launch the server in the background.
3. Completely quit and restart Photoshop.

---

## 3. Using the Plugin in Photoshop

### 1. Opening the Panel
In Photoshop's top menu bar, click:
```text
Plugins  >  Mobile USB Preview
```
A sleek panel titled **Mobile Preview** will open in your workspace. You can dock it alongside your Layers or History panels.

### 2. Panel Controls Explained
| Element | What It Does |
|---|---|
| **Bridge Status Indicator** | **Green dot ("Bridge Online")**: Server is healthy and listening.<br>**Red dot ("Bridge Offline")**: Server is stopped. Click **Reconnect** after restarting. |
| **Quality Preset** | Choose between **Adaptive** (ultra-fast for sketching), **High Quality** (balanced), or **Retina** (crispest resolution). |
| **Sync Now Button** | Instantly forces a refresh of the mobile screen with the current canvas state. |
| **Connection URL & Copy Button** | Shows the active preview address (e.g. `http://192.168.1.xxx:3890`). Click the copy button to copy it to clipboard. |
| **QR Code** | Scan directly using your mobile phone camera to instantly open the preview on your device. |

---

## 4. Connecting Your Phone (USB & Fullscreen)

### 🤖 Android Setup (Zero ADB / Developer Mode Required)

1. Connect your Android phone to your computer using a **USB cable**.
2. On your phone, open:
   - **Settings** > **Network & Internet** (or *Connections*) > **Hotspot & tethering**.
3. Toggle **ON "USB tethering"**.
4. Open **Google Chrome** on your phone.
5. Scan the **QR Code** from the Photoshop panel (or type the URL shown in the panel).
6. Tap the blue button: **"Enter Fullscreen Mode"**:
   - The Android status bar and navigation/home buttons will disappear completely!
   - You now have 100% pure canvas preview.

---

### 🍏 iPhone / iPad Setup (True Standalone Display)

1. Connect your iPhone to your Mac using a **Lightning / USB-C cable**.
2. On your iPhone, open:
   - **Settings** > **Personal Hotspot**.
3. Toggle Personal Hotspot **ON** (select **"USB Only"** if prompted).
4. Open **Safari** on your phone and open the URL or scan the QR Code.
5. **To remove Safari's URL bar and navigation bar**:
   - Tap the Safari **Share** icon (square with arrow) at the bottom.
   - Scroll down and tap **"Add to Home Screen"**.
   - Name it **"PS Preview"** and tap **Add**.
6. Open the new **PS Preview** icon from your home screen. It will open in true standalone fullscreen with zero browser borders!

---

### 🖐️ Mobile Touch Gestures
- **Pinch In / Out**: Zoom in up to 600% into details.
- **1-Finger Drag**: Pan smoothly across large canvases.
- **Double Tap**: Instantly toggle between **100% Actual Pixel Size** and **Fit to Screen**.
- **Single Tap**: Shows or hides the minimal status HUD (document title, zoom level).

---

## 5. Managing the Bridge Server

The desktop bridge server runs silently on **port 3890**. If you ever shut it down, restart your computer, or see **"Bridge Offline"**, use the following 1-click tools:

### On macOS

| Action | How to Do It |
|---|---|
| **Start Server** | Double-click **`Start PS Preview.app`** in the project folder<br>*(or run `./start.sh` in Terminal)* |
| **Stop Server** | Double-click **`Stop PS Preview.app`** in the project folder<br>*(or run `./stop.sh` in Terminal)* |
| **Check Status** | In Terminal, run: `./status.sh` |
| **Reconnect in Photoshop** | Click the **"Reconnect"** link at the bottom-right of the Photoshop panel. |

> **macOS Note**: When started via `start.sh` or `Install Plugin (Mac).command`, the server runs as a macOS LaunchAgent (`com.psdpreview.bridge`). It remains active in the background and automatically restarts on system reboot.

---

### On Windows

| Action | How to Do It |
|---|---|
| **Start Server** | Double-click **`Start-Server-Windows.bat`** |
| **Stop Server** | Double-click **`Stop-Server-Windows.bat`** |
| **Reconnect in Photoshop** | Click the **"Reconnect"** link in the Photoshop panel. |

---

## 6. Troubleshooting & FAQ

### Q1: The Photoshop panel says "Bridge Offline" (Red Dot).
1. Double click **`Start PS Preview.app`** (Mac) or **`Start-Server-Windows.bat`** (Windows).
2. Look at the bottom right of the Photoshop panel and click **"Reconnect"**.
3. The dot will turn green ("Bridge Online") immediately.

---

### Q2: I installed the plugin, but nothing appears under the "Plugins" menu.
1. Photoshop only loads newly installed UXP plugins on startup.
2. Completely Quit Photoshop (**`Cmd + Q`** on Mac / **`Alt + F4`** on Windows).
3. Reopen Photoshop. Go to: **Plugins > Mobile USB Preview**.

---

### Q3: My phone cannot load the link / QR Code page.
- Make sure **USB Tethering** (Android) or **Personal Hotspot USB Only** (iPhone) is switched **ON** on your phone.
- If using Wi-Fi instead of USB, make sure your computer and phone are connected to the same Wi-Fi network.

---

### Q4: My phone screen turns off while I'm designing.
- The web app automatically engages the **Screen Wake Lock API** when entering Fullscreen Mode on supported browsers (Chrome for Android and modern mobile browsers), keeping your display awake continuously.
