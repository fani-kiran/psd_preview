// Photoshop Mobile Preview - Immersive Fullscreen Mobile Client
(function() {
  'use strict';

  // DOM Elements
  const appContainer = document.getElementById('appContainer');
  const canvasViewport = document.getElementById('canvasViewport');
  const previewImage = document.getElementById('previewImage');
  const emptyState = document.getElementById('emptyState');
  const emptyTitle = document.getElementById('emptyTitle');
  const emptySubtext = document.getElementById('emptySubtext');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const enterFullscreenBtn = document.getElementById('enterFullscreenBtn');
  const iosInstallTip = document.getElementById('iosInstallTip');
  const hudOverlay = document.getElementById('hudOverlay');
  const hudDot = document.getElementById('hudDot');
  const hudDocName = document.getElementById('hudDocName');
  const hudZoomLabel = document.getElementById('hudZoomLabel');
  const zoomModeBtn = document.getElementById('zoomModeBtn');
  const lockOrientationBtn = document.getElementById('lockOrientationBtn');
  const lockIconUnlocked = document.getElementById('lockIconUnlocked');
  const lockIconLocked = document.getElementById('lockIconLocked');
  const hudFullscreenBtn = document.getElementById('hudFullscreenBtn');
  const toast = document.getElementById('toast');

  // App State
  let ws = null;
  let isConnected = false;
  let isPhotoshopConnected = false;
  let documentMeta = { width: 0, height: 0, name: '' };
  let hasImage = false;
  let isOrientationLocked = false;
  let lockedOrientation = null;
  let lockedAngle = 0;
  let lockedVpWidth = 0;
  let lockedVpHeight = 0;

  function getOrientationAngle() {
    if (window.screen && window.screen.orientation && window.screen.orientation.angle !== undefined) {
      return window.screen.orientation.angle;
    }
    if (typeof window.orientation === 'number') {
      return window.orientation;
    }
    return (window.innerWidth > window.innerHeight) ? 90 : 0;
  }

  // Transform / Gesture State
  let scale = 1;
  let fitScale = 1;
  let translateX = 0;
  let translateY = 0;
  let zoomMode = 'fit'; // 'fit' | 'fill' | '100%' | 'custom'

  // Gesture Tracking
  let isDragging = false;
  let startX = 0, startY = 0;
  let initialTranslateX = 0, initialTranslateY = 0;
  let initialPinchDistance = 0;
  let initialPinchScale = 1;
  let pinchMidpoint = { x: 0, y: 0 };
  let lastTapTime = 0;
  let hudHideTimeout = null;

  // Platform Detection
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

  // Show iOS install tip if not running in standalone PWA mode
  if (isIOS && !isStandalone) {
    iosInstallTip.classList.remove('hidden');
  }

  // --- Permanent No-Sleep / Keep-Awake Engine ---
  // 1. Silent looping video background keep-awake (works 100% on iOS & Android even in battery-saver)
  const noSleepVideo = document.createElement('video');
  noSleepVideo.setAttribute('playsinline', '');
  noSleepVideo.setAttribute('webkit-playsinline', '');
  noSleepVideo.setAttribute('muted', '');
  noSleepVideo.setAttribute('loop', '');
  noSleepVideo.muted = true;
  noSleepVideo.loop = true;
  noSleepVideo.style.position = 'absolute';
  noSleepVideo.style.top = '0';
  noSleepVideo.style.left = '0';
  noSleepVideo.style.opacity = '0.0001';
  noSleepVideo.style.pointerEvents = 'none';
  noSleepVideo.style.width = '1px';
  noSleepVideo.style.height = '1px';
  noSleepVideo.src = '/keepalive.mp4';
  document.body.appendChild(noSleepVideo);

  noSleepVideo.addEventListener('timeupdate', () => {
    if (noSleepVideo.currentTime > 0.5) {
      noSleepVideo.currentTime = 0;
    }
  });

  // 2. Native Screen Wake Lock API
  async function requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
          wakeLock = null;
        });
      } catch (err) {
        // Silently handled
      }
    }
  }

  function activateKeepAwake() {
    requestWakeLock();
    if (noSleepVideo.paused) {
      noSleepVideo.play().catch(() => {});
    }
  }

  // Re-acquire keep-awake on visibility change, taps, and periodic heartbeat
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      activateKeepAwake();
    }
  });
  document.addEventListener('fullscreenchange', activateKeepAwake);
  document.addEventListener('webkitfullscreenchange', activateKeepAwake);
  setInterval(activateKeepAwake, 15000);

  // --- Immersive Fullscreen Mode ---
  function enterFullscreen() {
    activateKeepAwake();

    const docEl = document.documentElement;
    if (docEl.requestFullscreen) {
      // navigationUI: 'hide' hides Android navigation/home buttons
      docEl.requestFullscreen({ navigationUI: 'hide' }).catch(() => {
        // Fallback without parameter
        docEl.requestFullscreen().catch(() => {});
      });
    } else if (docEl.webkitRequestFullscreen) {
      docEl.webkitRequestFullscreen();
    } else if (isIOS && !isStandalone) {
      showToast('iPhone: Add to Home Screen for true borderless fullscreen');
    }
    showHudTemporarily();
  }

  enterFullscreenBtn.addEventListener('click', enterFullscreen);
  hudFullscreenBtn.addEventListener('click', enterFullscreen);

  // --- Toast Notification ---
  let toastTimer = null;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }

  // --- HUD Auto-Hide Management ---
  function showHudTemporarily() {
    hudOverlay.classList.add('visible');
    clearTimeout(hudHideTimeout);
    hudHideTimeout = setTimeout(() => {
      // Only auto-hide if image is active and user is previewing
      if (hasImage) {
        hudOverlay.classList.remove('visible');
      }
    }, 2000);
  }

  // --- Transform & Viewport Updates ---
  let lastOrientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';

  function applyTransform() {
    previewImage.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    if (zoomMode === 'fit') hudZoomLabel.textContent = 'FIT';
    else if (zoomMode === 'fill') hudZoomLabel.textContent = 'FILL';
    else if (zoomMode === '100%') hudZoomLabel.textContent = '100%';
    else hudZoomLabel.textContent = `${Math.round(scale * 100)}%`;
  }

  function calculateFit() {
    if (!previewImage.naturalWidth || !previewImage.naturalHeight) return;

    // Use documentElement client dimensions for maximum precision on mobile
    const viewportW = document.documentElement.clientWidth || window.innerWidth;
    const viewportH = document.documentElement.clientHeight || window.innerHeight;
    const imgW = previewImage.naturalWidth;
    const imgH = previewImage.naturalHeight;

    const scaleX = viewportW / imgW;
    const scaleY = viewportH / imgH;
    fitScale = Math.min(scaleX, scaleY);
    const fillScale = Math.max(scaleX, scaleY);

    if (zoomMode === 'fit') {
      scale = fitScale;
      // Center image in viewport
      translateX = (viewportW - imgW * scale) / 2;
      translateY = (viewportH - imgH * scale) / 2;
      applyTransform();
    } else if (zoomMode === 'fill') {
      scale = fillScale;
      translateX = (viewportW - imgW * scale) / 2;
      translateY = (viewportH - imgH * scale) / 2;
      applyTransform();
    } else if (zoomMode === '100%') {
      set100Percent();
    }
  }

  function setFitMode() {
    zoomMode = 'fit';
    calculateFit();
    showToast('Fit to Screen');
    showHudTemporarily();
  }

  function setFillMode() {
    zoomMode = 'fill';
    calculateFit();
    showToast('Fill Fullscreen');
    showHudTemporarily();
  }

  function set100Percent() {
    zoomMode = '100%';
    const viewportW = document.documentElement.clientWidth || window.innerWidth;
    const viewportH = document.documentElement.clientHeight || window.innerHeight;
    const imgW = previewImage.naturalWidth || documentMeta.width || viewportW;
    const imgH = previewImage.naturalHeight || documentMeta.height || viewportH;

    scale = 1;
    // Center initially
    translateX = (viewportW - imgW * scale) / 2;
    translateY = (viewportH - imgH * scale) / 2;
    applyTransform();
    showToast('100% Actual Size');
    showHudTemporarily();
  }

  function cycleZoomMode() {
    if (zoomMode === 'fit') {
      setFillMode();
    } else if (zoomMode === 'fill') {
      set100Percent();
    } else {
      setFitMode();
    }
  }

  zoomModeBtn.addEventListener('click', cycleZoomMode);

  // --- Lock Orientation Engine ---
  function toggleOrientationLock() {
    isOrientationLocked = !isOrientationLocked;

    if (isOrientationLocked) {
      lockedOrientation = window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
      lockedAngle = getOrientationAngle();
      lockedVpWidth = window.innerWidth;
      lockedVpHeight = window.innerHeight;

      // Hardware Screen Orientation Lock (Supported on Android Chrome in Fullscreen)
      if (window.screen && window.screen.orientation && window.screen.orientation.lock) {
        window.screen.orientation.lock(lockedOrientation).catch(() => {});
      }

      lockOrientationBtn.classList.add('locked');
      lockIconUnlocked.style.display = 'none';
      lockIconLocked.style.display = 'block';
      showToast(`Orientation Locked (${lockedOrientation.toUpperCase()})`);
    } else {
      // Unlock
      if (window.screen && window.screen.orientation && window.screen.orientation.unlock) {
        window.screen.orientation.unlock();
      }

      // Reset software rotation
      canvasViewport.style.width = '100%';
      canvasViewport.style.height = '100%';
      canvasViewport.style.position = 'absolute';
      canvasViewport.style.top = '0';
      canvasViewport.style.left = '0';
      canvasViewport.style.transform = '';

      lockOrientationBtn.classList.remove('locked');
      lockIconUnlocked.style.display = 'block';
      lockIconLocked.style.display = 'none';
      showToast('Orientation Unlocked');
      calculateFit();
    }
    showHudTemporarily();
  }

  lockOrientationBtn.addEventListener('click', toggleOrientationLock);

  // --- Multi-touch Gesture Engine ---
  function getDistance(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function getMidpoint(t1, t2) {
    return {
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2
    };
  }

  appContainer.addEventListener('touchstart', (e) => {
    activateKeepAwake();
    showHudTemporarily();

    if (e.touches.length === 1) {
      isDragging = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      initialTranslateX = translateX;
      initialTranslateY = translateY;

      // Check double-tap
      const now = Date.now();
      if (now - lastTapTime < 300) {
        // Double tap cycles: Fit -> Fill -> 100%
        cycleZoomMode();
        lastTapTime = 0;
        return;
      }
      lastTapTime = now;

    } else if (e.touches.length === 2) {
      isDragging = false;
      initialPinchDistance = getDistance(e.touches[0], e.touches[1]);
      initialPinchScale = scale;
      pinchMidpoint = getMidpoint(e.touches[0], e.touches[1]);
      initialTranslateX = translateX;
      initialTranslateY = translateY;
    }
  }, { passive: false });

  appContainer.addEventListener('touchmove', (e) => {
    e.preventDefault(); // Prevent browser pull-to-refresh or bounce

    if (e.touches.length === 1 && isDragging) {
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      translateX = initialTranslateX + dx;
      translateY = initialTranslateY + dy;
      if ((zoomMode === 'fit' || zoomMode === 'fill') && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
        zoomMode = 'custom';
      }
      applyTransform();

    } else if (e.touches.length === 2) {
      const currentDistance = getDistance(e.touches[0], e.touches[1]);
      if (initialPinchDistance > 0) {
        const pinchRatio = currentDistance / initialPinchDistance;
        const newScale = Math.max(0.1, Math.min(6.0, initialPinchScale * pinchRatio));

        // Zoom relative to pinch midpoint
        const factor = newScale / initialPinchScale;
        translateX = pinchMidpoint.x - factor * (pinchMidpoint.x - initialTranslateX);
        translateY = pinchMidpoint.y - factor * (pinchMidpoint.y - initialTranslateY);
        scale = newScale;
        zoomMode = 'custom';
        applyTransform();
      }
    }
  }, { passive: false });

  appContainer.addEventListener('touchend', (e) => {
    if (e.touches.length === 0) {
      isDragging = false;
      initialPinchDistance = 0;
    } else if (e.touches.length === 1) {
      // Transition from pinch to single-finger drag
      isDragging = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      initialTranslateX = translateX;
      initialTranslateY = translateY;
      initialPinchDistance = 0;
    }
  });

  // Handle Resize and Orientation Changes
  function handleScreenResize() {
    if (isOrientationLocked) {
      // Counter-rotate if OS/browser rotated the screen while locked
      const currentAngle = getOrientationAngle();
      let diff = (currentAngle - lockedAngle) % 360;
      if (diff < 0) diff += 360;

      if (diff === 90 || diff === 270) {
        const rot = (diff === 90) ? -90 : 90;
        canvasViewport.style.width = `${lockedVpWidth}px`;
        canvasViewport.style.height = `${lockedVpHeight}px`;
        canvasViewport.style.position = 'absolute';
        canvasViewport.style.top = '50%';
        canvasViewport.style.left = '50%';
        canvasViewport.style.transform = `translate(-50%, -50%) rotate(${rot}deg)`;
      } else if (diff === 180) {
        canvasViewport.style.width = `${lockedVpWidth}px`;
        canvasViewport.style.height = `${lockedVpHeight}px`;
        canvasViewport.style.position = 'absolute';
        canvasViewport.style.top = '50%';
        canvasViewport.style.left = '50%';
        canvasViewport.style.transform = `translate(-50%, -50%) rotate(180deg)`;
      } else {
        canvasViewport.style.width = '100%';
        canvasViewport.style.height = '100%';
        canvasViewport.style.position = 'absolute';
        canvasViewport.style.top = '0';
        canvasViewport.style.left = '0';
        canvasViewport.style.transform = '';
      }
      return;
    }

    // Normal unlocked resize
    canvasViewport.style.width = '100%';
    canvasViewport.style.height = '100%';
    canvasViewport.style.position = 'absolute';
    canvasViewport.style.top = '0';
    canvasViewport.style.left = '0';
    canvasViewport.style.transform = '';

    const currentOrientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
    if (currentOrientation !== lastOrientation) {
      lastOrientation = currentOrientation;
      // On rotation, automatically re-fit artwork
      zoomMode = 'fit';
    }

    requestAnimationFrame(calculateFit);
    setTimeout(calculateFit, 100);
    setTimeout(calculateFit, 350);
  }

  window.addEventListener('resize', handleScreenResize);
  if (window.screen && window.screen.orientation) {
    window.screen.orientation.addEventListener('change', handleScreenResize);
  }
  window.addEventListener('orientationchange', handleScreenResize);

  // --- WebSocket Connection & Real-Time Frame Streaming ---
  function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}/mobile`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      isConnected = true;
      statusDot.className = 'status-dot connected';
      hudDot.className = 'status-dot connected';
      statusText.textContent = 'USB Connected to Bridge';
      console.log('Connected to USB Bridge Server');
    };

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data);
          handleServerMessage(msg);
        } catch (e) {
          console.error('Failed to parse WS text message', e);
        }
      } else if (event.data instanceof Blob) {
        // Binary frame data
        const objectUrl = URL.createObjectURL(event.data);
        updatePreviewSrc(objectUrl, true);
      }
    };

    ws.onclose = () => {
      isConnected = false;
      statusDot.className = 'status-dot disconnected';
      hudDot.className = 'status-dot disconnected';
      statusText.textContent = 'Reconnecting...';
      emptyTitle.textContent = 'Bridge Disconnected';
      emptySubtext.textContent = 'Waiting for USB Bridge connection...';
      if (!hasImage) emptyState.classList.remove('hidden');

      // Exponential backoff reconnect
      setTimeout(connectWebSocket, 2000);
    };

    ws.onerror = (err) => {
      console.warn('WebSocket error:', err);
    };
  }

  function handleServerMessage(msg) {
    if (msg.type === 'init') {
      isPhotoshopConnected = msg.psConnected;
      updateDocumentInfo(msg.document);
      if (!msg.hasFrame) {
        emptyState.classList.remove('hidden');
      }
    } else if (msg.type === 'frame') {
      const src = msg.data.startsWith('data:') ? msg.data : `data:image/${msg.format || 'jpeg'};base64,${msg.data}`;
      updateDocumentInfo(msg.document);
      updatePreviewSrc(src, false);
    } else if (msg.type === 'doc_change') {
      updateDocumentInfo(msg.document);
    } else if (msg.type === 'doc_closed') {
      hasImage = false;
      previewImage.src = '';
      emptyState.classList.remove('hidden');
      emptyTitle.textContent = 'Document Closed';
      emptySubtext.textContent = 'Open or create a document in Photoshop to preview.';
      hudDocName.textContent = 'No Document';
    } else if (msg.type === 'ps_status') {
      isPhotoshopConnected = msg.connected;
      if (!isPhotoshopConnected && !hasImage) {
        emptyState.classList.remove('hidden');
        emptyTitle.textContent = 'Photoshop Disconnected';
        emptySubtext.textContent = 'Make sure Photoshop and the Mobile Preview plugin are open.';
      }
    }
  }

  function updateDocumentInfo(doc) {
    if (!doc) return;
    documentMeta = doc;
    hudDocName.textContent = doc.name || 'Untitled';
  }

  let currentBlobUrl = null;
  function updatePreviewSrc(src, isBlob) {
    const isFirstLoad = !hasImage;
    hasImage = true;
    emptyState.classList.add('hidden');

    previewImage.onload = () => {
      if (currentBlobUrl && isBlob) {
        URL.revokeObjectURL(currentBlobUrl);
      }
      if (isBlob) currentBlobUrl = src;

      if (isFirstLoad || zoomMode === 'fit' || zoomMode === 'fill') {
        calculateFit();
      }
      showHudTemporarily();
    };

    previewImage.src = src;
    if (previewImage.complete && previewImage.naturalWidth) {
      if (isFirstLoad || zoomMode === 'fit' || zoomMode === 'fill') {
        calculateFit();
      }
    }
  }

  // Auto-connect and register Service Worker
  connectWebSocket();
  requestWakeLock();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(console.warn);
  }
})();
