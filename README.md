# Photoshop Mobile Preview (USB & True Fullscreen)

Real-time canvas preview plugin for **Adobe Photoshop 2026 / 2025 / 2024** that streams your active document directly to **Android and iPhone** devices through a **physical USB cable** in **true borderless fullscreen** (zero status bar, zero navigation buttons, zero browser chrome).

---

## Key Features

- 🔌 **100% Pure Physical USB Connection (Zero Wi-Fi or Internet Needed!)**:
  - **Android (Instant ADB Tunnel)**: Plug in USB cable with USB Debugging enabled. The bridge automatically port-forwards to `http://localhost:3890` with zero network setup. Click **"Launch on Phone"** in the Photoshop panel to open Chrome instantly!
  - **Android (USB Tethering - Zero Developer Mode)**: Settings > Hotspot & tethering > Toggle ON "USB tethering". Creates a direct peer-to-peer USB Ethernet link. Wi-Fi can be completely turned OFF!
  - **iPhone (Personal Hotspot USB Only)**: Turn Wi-Fi OFF. Connect USB cable. Settings > Personal Hotspot > Turn ON ("USB Only"). Direct point-to-point USB cable link.
  - Ultra-fast, zero-latency physical cable transmission with 0 network dependency.
- 📱 **True Edge-to-Edge Borderless Fullscreen**:
  - **Android**: Fullscreen API (`navigationUI: "hide"`) completely eliminates the Android status bar and navigation bar (home/back buttons).
  - **iPhone**: PWA Standalone configuration (`apple-mobile-web-app-capable`) removes the Safari URL bar and bottom toolbar.
  - AMOLED `#000000` canvas backdrop.
- ⚡ **Real-Time Live Canvas Sync**:
  - Automatically captures document changes (`historyStateChanged`, `save`, layer tweaks, brush strokes) using Photoshop's native GPU-accelerated Imaging API (`photoshop.imaging.getPixels`).
  - Debounced rendering ensures smooth performance even during continuous painting.
- 🖐️ **Fluid Mobile Gestures**:
  - Multi-touch pinch-to-zoom (up to 600%).
  - Double-tap toggle: Switch between **Fit to Screen** and **100% Actual Pixel Size**.
  - Smooth 1-finger pan.
  - **Screen Wake Lock**: Prevents your phone screen from dimming or sleeping while designing.
  - **Auto-Hiding HUD**: Floating status pill disappears after 2 seconds of inactivity, leaving 100% pure artwork on screen.

---

## Project Structure

```
psd_preview/
├── psd-mobile-preview.ccx     # 1-Click Installable Photoshop Plugin Package
├── plugin/                    # Adobe Photoshop UXP Plugin source
│   ├── manifest.json          # UXP Manifest v5
│   ├── index.html             # Photoshop panel UI
│   ├── index.js               # Event listeners & Imaging API stream
│   ├── styles.css             # Adobe Spectrum dark theme
│   └── icons/                 # Plugin toolbar icons
├── bridge-server/             # Desktop USB Bridge & Streaming Server
│   ├── server.js              # WebSocket + HTTP streaming hub
│   └── package.json           # Node.js dependencies (ws, qrcode-terminal)
├── mobile-client/             # Zero-UI Immersive Mobile Client
│   ├── index.html             # Fullscreen PWA layout
│   ├── style.css              # Borderless AMOLED darkroom styling
│   ├── app.js                 # Touch gesture engine & Wake Lock
│   ├── manifest.webmanifest   # PWA manifest (display: fullscreen)
│   ├── sw.js                  # Service worker for offline shell
│   └── icons/                 # PWA icons (192px, 512px)
├── scripts/
│   ├── package-plugin.js      # Packages plugin into .ccx
│   └── generate-icons.js      # Generates PWA PNG icons
├── start.sh                   # 1-Click startup script
└── package.json               # Root scripts
```

---

## Getting Started

### Step 1: Start the USB Bridge Server

In your terminal:

```bash
./start.sh
```

Or:

```bash
npm start
```

The bridge server will launch, auto-detect all USB network interfaces, and display the direct URLs and a **terminal QR code**.

---

### Step 2: Install the Plugin in Photoshop 2026

#### Option A: 1-Click `.ccx` Package (Recommended)
Double-click the generated package file in Finder:
```bash
open psd-mobile-preview.ccx
```
Photoshop / Adobe Creative Cloud will prompt you to install the plugin.

#### Option B: Via Adobe UXP Developer Tools
1. Open **Adobe UXP Developer Tools** (located in `/Applications/Adobe UXP Developer Tools`).
2. Click **Add Plugin** and select `psd_preview/plugin/manifest.json`.
3. Click the **Actions (•••)** menu next to "Mobile USB Preview" and select **Load**.
4. In Photoshop, open **Plugins > Mobile USB Preview**.

---

## Connecting Your Mobile Device Over USB

### 🤖 Android Setup (Zero Wi-Fi Required!)

#### Option 1: Instant ADB Tunnel (Recommended)
1. Turn ON **USB Debugging** on your phone (Settings > Developer options > USB Debugging).
2. Connect your phone to your computer with a **USB cable**.
3. In Photoshop, open **Plugins > Mobile USB Preview**. The panel will show **"Android USB Active (ADB Tunnel)"**.
4. Click **"⚡ Launch on Phone"** (or open `http://localhost:3890` in Chrome on your phone, or scan the QR code).
5. Chrome opens directly over the USB cable! Tap **"Enter Fullscreen Mode"** for borderless preview.

#### Option 2: USB Tethering (Zero Developer Mode Needed)
1. Connect your Android phone to your computer with a **USB cable**. (Wi-Fi can be completely OFF!)
2. On your phone: **Settings > Hotspot & tethering > Turn ON "USB tethering"**.
3. Open the detected direct USB address shown in the panel (e.g. `http://192.168.42.x:3890`) or scan the QR code.
4. Tap **"Enter Fullscreen Mode"**.

---

### 🍏 iPhone / iOS Setup (Zero Wi-Fi Required!)

1. Turn **OFF Wi-Fi** in iPhone Control Center.
2. Connect your iPhone to your Mac using a **USB cable**.
3. On your iPhone:
   - **Settings > Personal Hotspot > Turn ON** (choose **"USB Only"**).
4. In Photoshop, the panel detects the iPhone USB link and displays the direct USB URL (e.g. `http://172.20.10.x:3890`).
5. Open that URL in **Safari** (or scan the QR code).
6. To enable true borderless edge-to-edge fullscreen:
   - Tap the Safari **Share** icon at the bottom.
   - Tap **"Add to Home Screen"**.
   - Open the **PS Preview** app from your iPhone Home Screen.

---

## Mobile Touch Gestures

| Gesture | Action |
|---|---|
| **Pinch In / Out** | Zoom into canvas details up to 600% |
| **1-Finger Drag** | Pan around the document canvas |
| **Double Tap** | Instantly toggle between **Fit to Screen** and **100% Actual Pixel Size** |
| **Single Tap** | Momentarily shows the minimal HUD (Document name, zoom %, fullscreen toggle) |

---

## Troubleshooting & Tips

- **Canvas not updating?** Check the top right of the Photoshop panel. The dot should be green ("Bridge Online"). If gray, click **Reconnect**.
- **Phone cannot load the page?** Ensure **USB Tethering** (Android) or **Personal Hotspot USB Only** (iPhone) is switched on, or verify both devices are on the same local subnet.
- **Screen keeps sleeping?** The client automatically requests Screen Wake Lock upon entering fullscreen. If supported by your mobile browser, the screen will stay on continuously.
