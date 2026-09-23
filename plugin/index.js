// Photoshop Mobile Preview - UXP Plugin Panel Logic
(function() {
  'use strict';

  // Check Photoshop UXP Environment
  let photoshop = null;
  let uxp = null;
  try {
    if (typeof window.require === 'function') {
      photoshop = window.require('photoshop');
      uxp = window.require('uxp');
    }
  } catch (e) {
    console.log('Running outside Photoshop UXP environment');
  }

  // DOM Elements
  const bridgeStatusDot = document.getElementById('bridgeStatusDot');
  const bridgeStatusText = document.getElementById('bridgeStatusText');
  const docName = document.getElementById('docName');
  const docSpecs = document.getElementById('docSpecs');
  const syncIndicator = document.getElementById('syncIndicator');
  const deviceCountBadge = document.getElementById('deviceCountBadge');
  const deviceList = document.getElementById('deviceList');
  const noDevicesMsg = document.getElementById('noDevicesMsg');
  const autoSyncToggle = document.getElementById('autoSyncToggle');
  const qualitySelect = document.getElementById('qualitySelect');
  const syncNowBtn = document.getElementById('syncNowBtn');
  const connectUrlInput = document.getElementById('connectUrlInput');
  const copyUrlBtn = document.getElementById('copyUrlBtn');
  const qrCanvas = document.getElementById('qrCanvas');
  const reconnectBridgeBtn = document.getElementById('reconnectBridgeBtn');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  // State
  let ws = null;
  let isBridgeConnected = false;
  let autoSync = true;
  let isSyncing = false;
  let syncDebounceTimer = null;
  let networkInfo = null;
  let lastDocumentId = null;

  const BRIDGE_PORT = 3890;
  const WS_URL = `ws://127.0.0.1:${BRIDGE_PORT}/ps`;

  // --- Tab Switching ---
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      document.getElementById(targetId).classList.add('active');
      updateUrlForTab(targetId);
    });
  });

  function updateUrlForTab(tabId) {
    if (!networkInfo) return;
    let url = '';

    if (tabId === 'androidTab' && networkInfo.usbAndroid && networkInfo.usbAndroid.length > 0) {
      url = networkInfo.usbAndroid[0].url;
    } else if (tabId === 'iphoneTab' && networkInfo.usbIphone && networkInfo.usbIphone.length > 0) {
      url = networkInfo.usbIphone[0].url;
    }

    if (!url) {
      if (networkInfo.localIps && networkInfo.localIps.length > 0) {
        url = networkInfo.localIps[0].url;
      } else {
        url = `http://${networkInfo.hostname}:${BRIDGE_PORT}`;
      }
    }

    connectUrlInput.value = url;
    renderQrCode(url);
  }

  // --- Copy URL ---
  copyUrlBtn.addEventListener('click', () => {
    connectUrlInput.select();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(connectUrlInput.value);
    } else {
      document.execCommand('copy');
    }
    copyUrlBtn.innerHTML = '✓';
    setTimeout(() => {
      copyUrlBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    }, 1500);
  });

  let reconnectTimer = null;
  let heartbeatTimer = null;

  // --- WebSocket Bridge Connection ---
  function connectBridge() {
    clearTimeout(reconnectTimer);

    // If already connected or connecting, do not create duplicate sockets
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    // Clean up any stale socket cleanly without triggering onclose cascades
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      try { ws.close(); } catch (e) {}
      ws = null;
    }

    clearInterval(heartbeatTimer);
    bridgeStatusDot.className = 'status-indicator';
    bridgeStatusText.textContent = 'Connecting...';

    try {
      ws = new WebSocket(WS_URL);
    } catch (err) {
      console.warn('Failed to create WebSocket:', err);
      onBridgeDisconnected();
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      isBridgeConnected = true;
      bridgeStatusDot.className = 'status-indicator connected';
      bridgeStatusText.textContent = 'Bridge Online';
      fetchNetworkInterfaces();
      scheduleSync(100);

      // Start ping heartbeat every 10s to keep connection alive
      clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          try { ws.send(JSON.stringify({ type: 'ping' })); } catch (e) {}
        }
      }, 10000);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'mobile_status') {
          updateDeviceList(msg.count, msg.devices);
        }
      } catch (e) {}
    };

    ws.onclose = (e) => {
      onBridgeDisconnected();
      scheduleReconnect();
    };

    ws.onerror = () => {
      onBridgeDisconnected();
    };
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectBridge, 3000);
  }

  function onBridgeDisconnected() {
    isBridgeConnected = false;
    clearInterval(heartbeatTimer);
    bridgeStatusDot.className = 'status-indicator';
    bridgeStatusText.textContent = 'Bridge Offline';
    updateDeviceList(0, []);
  }

  reconnectBridgeBtn.addEventListener('click', connectBridge);

  // --- Query Bridge Server for USB Network Interfaces ---
  async function fetchNetworkInterfaces() {
    try {
      const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/api/interfaces`);
      if (res.ok) {
        networkInfo = await res.json();
        const activeTab = document.querySelector('.tab-btn.active').getAttribute('data-tab');
        updateUrlForTab(activeTab);
      }
    } catch (e) {
      // Bridge server might be starting
    }
  }

  // --- Device List UI Update ---
  function updateDeviceList(count, devices) {
    deviceCountBadge.textContent = `${count} ${count === 1 ? 'Device' : 'Devices'}`;

    if (!devices || devices.length === 0) {
      deviceList.innerHTML = `<div class="no-devices-msg">No phone connected. Connect phone via USB cable below.</div>`;
      return;
    }

    deviceList.innerHTML = '';
    devices.forEach((dev) => {
      const item = document.createElement('div');
      item.className = 'device-item';
      item.innerHTML = `
        <div class="device-info">
          <span class="device-name">${dev.deviceType || 'Mobile Device'}</span>
        </div>
        <span class="device-badge">USB Live</span>
      `;
      deviceList.appendChild(item);
    });
  }

  // --- Document Sync Engine ---
  let pendingSync = false;

  function scheduleSync(delay = 250) {
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(() => {
      syncCurrentDocument();
    }, delay);
  }

  async function syncCurrentDocument() {
    if (!photoshop) return;

    if (isSyncing) {
      pendingSync = true;
      return;
    }

    const doc = photoshop.app.activeDocument;
    if (!doc) {
      docName.textContent = 'No document opened';
      docSpecs.textContent = '- × - px | - ppi';
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'doc_closed' }));
      }
      return;
    }

    isSyncing = true;
    syncIndicator.className = 'sync-indicator syncing';
    syncIndicator.textContent = 'Syncing...';

    docName.textContent = doc.title || doc.name || 'Untitled';
    docSpecs.textContent = `${doc.width} × ${doc.height} px | ${Math.round(doc.resolution)} ppi`;

    try {
      await photoshop.core.executeAsModal(async () => {
        const quality = qualitySelect.value;
        let targetSize = undefined;

        if (quality === 'adaptive' && doc.width > 1920) {
          const w = 1920;
          const h = Math.round(w * (doc.height / doc.width));
          targetSize = { width: w, height: h };
        } else if (quality === 'high' && doc.width > 2560) {
          const w = 2560;
          const h = Math.round(w * (doc.height / doc.width));
          targetSize = { width: w, height: h };
        }
        // 'retina' uses undefined (full native resolution)

        const imgObj = await photoshop.imaging.getPixels({
          targetSize,
          applyAlpha: true,
          colorSpace: "RGB",
          componentSize: 8
        });

        const jpegBase64 = await photoshop.imaging.encodeImageData({
          imageData: imgObj.imageData,
          base64: true,
          colorSpace: "RGB"
        });

        imgObj.imageData.dispose();

        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'frame',
            format: 'jpeg',
            data: jpegBase64,
            document: {
              name: doc.title || doc.name,
              width: doc.width,
              height: doc.height,
              resolution: doc.resolution,
              colorMode: doc.mode
            }
          }));
        }
      }, { commandName: "Stream Mobile Preview" });

    } catch (err) {
      console.warn('Sync error:', err);
    } finally {
      isSyncing = false;
      syncIndicator.className = 'sync-indicator idle';
      syncIndicator.textContent = 'Synced';

      if (pendingSync) {
        pendingSync = false;
        scheduleSync(100);
      }
    }
  }

  // --- Auto-Sync and Listeners ---
  autoSyncToggle.addEventListener('change', (e) => {
    autoSync = e.target.checked;
    if (autoSync) scheduleSync(50);
  });

  syncNowBtn.addEventListener('click', () => {
    scheduleSync(0);
  });

  qualitySelect.addEventListener('change', () => {
    scheduleSync(50);
  });

  // Photoshop Event Notifications (Document Edits only)
  if (photoshop && photoshop.action) {
    try {
      photoshop.action.addNotificationListener([
        { event: "save" },
        { event: "historyStateChanged" },
        { event: "open" },
        { event: "close" }
      ], (event, descriptor) => {
        if (autoSync) {
          scheduleSync(250);
        }
      });
    } catch (err) {
      console.warn('Could not register notification listeners:', err);
    }
  }

  // --- Standards-Compliant Scannable QR Code Renderer ---
  function renderQrCode(text) {
    if (!text) return;
    const qrCanvas = document.getElementById('qrCanvas');
    const qrImg = document.getElementById('qrImg');

    const qrLib = (window.QRCodeBundle && window.QRCodeBundle.toCanvas)
      ? window.QRCodeBundle
      : (window.QRCodeBundle && window.QRCodeBundle.default ? window.QRCodeBundle.default : null);

    if (qrLib && qrCanvas) {
      try {
        qrLib.toCanvas(qrCanvas, text, {
          width: 150,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#ffffff'
          },
          errorCorrectionLevel: 'M'
        }, (err) => {
          if (err) {
            console.warn('Canvas QR render error, using fallback:', err);
            fallbackQrImg(text, qrCanvas, qrImg);
          } else {
            qrCanvas.style.display = 'block';
            if (qrImg) qrImg.style.display = 'none';
          }
        });
        return;
      } catch (e) {
        console.warn('QRCodeBundle exception:', e);
      }
    }

    fallbackQrImg(text, qrCanvas, qrImg);
  }

  function fallbackQrImg(text, qrCanvas, qrImg) {
    if (qrImg) {
      qrImg.src = `http://127.0.0.1:${BRIDGE_PORT}/api/qr?text=${encodeURIComponent(text)}`;
      qrImg.style.display = 'block';
      if (qrCanvas) qrCanvas.style.display = 'none';
    }
  }

  // Initial Boot
  connectBridge();
  fetchNetworkInterfaces();
  setInterval(fetchNetworkInterfaces, 5000);
})();
