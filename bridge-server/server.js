const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile, execSync } = require('child_process');
const { WebSocketServer, WebSocket } = require('ws');
const QRCode = require('qrcode');
let qrcodeTerminal = null;
try {
  qrcodeTerminal = require('qrcode-terminal');
} catch (e) {}

const PORT = process.env.PORT || 3890;
const MOBILE_CLIENT_DIR = path.resolve(__dirname, '../mobile-client');

// In-memory state
let currentDocument = {
  name: "No Document Opened",
  width: 0,
  height: 0,
  resolution: 72,
  colorMode: "RGB",
  lastUpdated: null,
  hasImage: false
};
let latestFrame = null; // Buffer or Base64 string of the last rendered document
let psSockets = new Set();
let mobileSockets = new Map(); // ws -> { id, deviceType, connectedAt }

// -------------------------------------------------------------
// ADB & Pure USB Tunnel Manager (Zero Wi-Fi Dependency)
// -------------------------------------------------------------
let adbPath = null;
let adbState = {
  available: false,
  connected: false,
  device: null,
  serial: null,
  url: null
};
let lastReversedSerial = null;

function initAdb() {
  if (process.env.ADB_PATH && fs.existsSync(process.env.ADB_PATH)) {
    adbPath = process.env.ADB_PATH;
    return adbPath;
  }
  const home = os.homedir();
  const candidates = [
    path.join(home, 'Library/Android/sdk/platform-tools/adb'),
    path.join(home, 'Library/Android/sdk/platform-tools/adb.exe'),
    '/opt/homebrew/bin/adb',
    '/usr/local/bin/adb',
    path.join(process.env.LOCALAPPDATA || '', 'Android/Sdk/platform-tools/adb.exe'),
    path.join(process.env.PROGRAMFILES || '', 'Android/android-sdk/platform-tools/adb.exe')
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) {
      adbPath = c;
      return adbPath;
    }
  }
  try {
    const whichCmd = process.platform === 'win32' ? 'where adb' : 'which adb';
    const out = execSync(whichCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    if (out) {
      const first = out.split(/\r?\n/)[0].trim();
      if (fs.existsSync(first)) {
        adbPath = first;
        return adbPath;
      }
    }
  } catch (e) {}
  return null;
}

function checkAdbDevices() {
  if (!adbPath) {
    adbPath = initAdb();
    if (!adbPath) return;
  }
  adbState.available = true;

  execFile(adbPath, ['devices', '-l'], { timeout: 2000 }, (err, stdout) => {
    if (err || !stdout) {
      if (adbState.connected) {
        adbState.connected = false;
        adbState.device = null;
        adbState.serial = null;
        adbState.url = null;
        lastReversedSerial = null;
        broadcastUsbStatusToPhotoshop();
      }
      return;
    }

    const lines = stdout.split(/\r?\n/);
    let activeDev = null;
    let unauthorizedDev = false;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(/\s+/);
      const serial = parts[0];
      const status = parts[1];

      if (status === 'device') {
        const modelMatch = line.match(/model:([^\s]+)/i);
        const model = modelMatch ? modelMatch[1].replace(/_/g, ' ') : serial;
        activeDev = { serial, model };
        break;
      } else if (status === 'unauthorized') {
        unauthorizedDev = true;
      }
    }

    adbState.unauthorized = unauthorizedDev;

    if (activeDev) {
      const isNew = !adbState.connected || adbState.serial !== activeDev.serial;
      adbState.connected = true;
      adbState.device = activeDev.model;
      adbState.serial = activeDev.serial;
      adbState.url = `http://localhost:${PORT}`;

      if (isNew || lastReversedSerial !== activeDev.serial) {
        lastReversedSerial = activeDev.serial;
        console.log(`[ADB USB] Android device detected: ${activeDev.model} (${activeDev.serial}). Reversing port ${PORT}...`);
        execFile(adbPath, ['-s', activeDev.serial, 'reverse', `tcp:${PORT}`, `tcp:${PORT}`], { timeout: 3000 }, (revErr) => {
          if (revErr) {
            console.warn(`[ADB USB] Reverse error: ${revErr.message}`);
          } else {
            console.log(`[ADB USB] ✓ Port ${PORT} successfully reversed to Android device over physical USB cable!`);
            console.log(`[ADB USB] Pure USB preview active at: http://localhost:${PORT} (Zero Wi-Fi needed!)`);
          }
          broadcastUsbStatusToPhotoshop();
        });
      }
    } else {
      if (adbState.connected) {
        console.log(`[ADB USB] Android device disconnected.`);
        adbState.connected = false;
        adbState.device = null;
        adbState.serial = null;
        adbState.url = null;
        lastReversedSerial = null;
        broadcastUsbStatusToPhotoshop();
      } else if (unauthorizedDev) {
        broadcastUsbStatusToPhotoshop();
      }
    }
  });
}

// -------------------------------------------------------------
// Pure USB Network Interface Detection (Excludes Wi-Fi)
// -------------------------------------------------------------
let cachedWifiDevices = new Set();
let lastWifiCheck = 0;

function getWifiDevices() {
  const now = Date.now();
  if (now - lastWifiCheck < 10000 && cachedWifiDevices.size > 0) {
    return cachedWifiDevices;
  }
  cachedWifiDevices.clear();
  if (process.platform === 'darwin') {
    try {
      const out = execSync('networksetup -listallhardwareports', { encoding: 'utf8', timeout: 2000, stdio: ['pipe', 'pipe', 'ignore'] });
      const blocks = out.split(/\n\s*\n/);
      for (const block of blocks) {
        const portMatch = block.match(/Hardware Port:\s*(.+)/i);
        const devMatch = block.match(/Device:\s*([^\s]+)/i);
        if (portMatch && devMatch) {
          const port = portMatch[1].trim();
          const dev = devMatch[1].trim();
          if (/wi-fi|airport|wireless/i.test(port)) {
            cachedWifiDevices.add(dev);
          }
        }
      }
    } catch (e) {}
  }
  lastWifiCheck = now;
  return cachedWifiDevices;
}

function detectPhysicalUsbDevices() {
  if (process.platform !== 'darwin') return null;
  try {
    const out = execSync('ioreg -p IOUSB -w0 -l', { encoding: 'utf8', timeout: 1500, stdio: ['pipe', 'pipe', 'ignore'] });
    if (/samsung/i.test(out)) return 'Samsung Android';
    if (/google|pixel/i.test(out)) return 'Google Pixel';
    if (/oneplus|xiaomi|oppo|vivo|motorola|huawei|sony/i.test(out)) return 'Android Device';
    if (/iphone|ipad|ipod/i.test(out)) return 'iPhone / iPad';
    if (/android/i.test(out)) return 'Android Device';
  } catch (e) {}
  return null;
}

function getNetworkInfo() {
  const interfaces = os.networkInterfaces();
  const wifiDevs = getWifiDevices();
  const physicalDev = detectPhysicalUsbDevices();
  const results = {
    adb: { ...adbState },
    usbAndroid: [],
    usbIphone: [],
    usbLinkLocal: [],
    hasUsbConnection: false,
    physicalDevice: physicalDev,
    recommendedUrl: null,
    port: PORT
  };

  for (const [name, addrs] of Object.entries(interfaces)) {
    // Wi-Fi interfaces are strictly excluded for pure USB cable operation
    if (wifiDevs.has(name)) {
      continue;
    }

    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        const ip = addr.address;
        const entry = { interface: name, ip, url: `http://${ip}:${PORT}` };

        // iPhone USB Personal Hotspot (172.20.10.x or interface name includes iphone/appleusbncm)
        if (ip.startsWith('172.20.10.') || name.toLowerCase().includes('iphone')) {
          results.usbIphone.push(entry);
        }
        // Android USB Tethering subnets (192.168.42.x, 192.168.43.x, 192.168.44.x, or rndis/ncm/usb interface)
        else if (
          ip.startsWith('192.168.42.') ||
          ip.startsWith('192.168.43.') ||
          ip.startsWith('192.168.44.') ||
          ip.startsWith('192.168.45.') ||
          ip.startsWith('192.168.49.') ||
          ip.startsWith('192.168.50.') ||
          ip.startsWith('192.168.137.') ||
          name.toLowerCase().includes('rndis') ||
          name.toLowerCase().includes('ncm') ||
          name.toLowerCase().includes('usb')
        ) {
          results.usbAndroid.push(entry);
        }
        // Link-local direct USB cable connection
        else if (ip.startsWith('169.254.')) {
          results.usbLinkLocal.push(entry);
        }
        // Other non-Wi-Fi physical adapters (e.g. Ethernet adapter created by USB tethering)
        else if (!name.startsWith('utun') && !name.startsWith('bridge') && !name.startsWith('awdl') && !name.startsWith('llw') && !name.startsWith('anpi')) {
          results.usbAndroid.push(entry);
        }
      }
    }
  }

  results.hasUsbConnection = (
    results.adb.connected ||
    results.usbAndroid.length > 0 ||
    results.usbIphone.length > 0
  );

  if (results.adb.connected) {
    results.recommendedUrl = `http://localhost:${PORT}`;
  } else if (results.usbAndroid.length > 0) {
    results.recommendedUrl = results.usbAndroid[0].url;
  } else if (results.usbIphone.length > 0) {
    results.recommendedUrl = results.usbIphone[0].url;
  } else {
    // DO NOT set localhost:3890 if ADB is not connected! It causes ERR_CONNECTION_REFUSED on mobile devices.
    results.recommendedUrl = null;
  }

  return results;
}

// MIME types for static files
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
};

// HTTP Server
const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API Endpoints
  if (pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      photoshopConnected: psSockets.size > 0,
      mobileClientsCount: mobileSockets.size,
      mobileClients: Array.from(mobileSockets.values()),
      document: currentDocument,
      network: getNetworkInfo(),
      port: PORT
    }));
    return;
  }

  if (pathname === '/api/interfaces') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getNetworkInfo()));
    return;
  }

  // Launch on Android Chrome via ADB
  if (pathname === '/api/adb-launch') {
    if (!adbPath) adbPath = initAdb();
    if (!adbPath) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'ADB executable not found on this machine' }));
      return;
    }
    const targetUrl = parsedUrl.searchParams.get('url') || `http://localhost:${PORT}`;
    const cmdArgs = adbState.serial
      ? ['-s', adbState.serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', targetUrl]
      : ['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', targetUrl];

    execFile(adbPath, cmdArgs, { timeout: 4000 }, (err, stdout) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Launched in Android browser over USB', output: stdout }));
      }
    });
    return;
  }

  // Trigger manual ADB reverse
  if (pathname === '/api/adb-reverse') {
    if (!adbPath) adbPath = initAdb();
    if (!adbPath) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'ADB not found' }));
      return;
    }
    const cmdArgs = adbState.serial
      ? ['-s', adbState.serial, 'reverse', `tcp:${PORT}`, `tcp:${PORT}`]
      : ['reverse', `tcp:${PORT}`, `tcp:${PORT}`];

    execFile(adbPath, cmdArgs, { timeout: 3000 }, (err) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      } else {
        broadcastUsbStatusToPhotoshop();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, url: `http://localhost:${PORT}` }));
      }
    });
    return;
  }

  if (pathname === '/api/qr') {
    const net = getNetworkInfo();
    const text = parsedUrl.searchParams.get('text') || net.recommendedUrl || `http://localhost:${PORT}`;
    QRCode.toBuffer(text, { margin: 2, width: 260, errorCorrectionLevel: 'M' }, (err, buffer) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('QR Generation Error');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache'
      });
      res.end(buffer);
    });
    return;
  }

  // Static file serving from mobile-client
  if (pathname === '/' || pathname === '') {
    pathname = '/index.html';
  }

  const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(MOBILE_CLIENT_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const range = req.headers.range;
    if (range && (ext === '.mp4' || ext === '.webm')) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunkSize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType
      });
      file.pipe(res);
      return;
    }

    res.writeHead(200, {
      'Content-Length': stats.size,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes'
    });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

// WebSocket Server
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const parsedUrl = new URL(request.url, `http://${request.headers.host}`);
  const pathname = parsedUrl.pathname;

  if (pathname === '/ps' || pathname === '/mobile' || pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, pathname);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws, req, pathname) => {
  const isPhotoshop = (pathname === '/ps');
  const userAgent = req.headers['user-agent'] || '';

  if (isPhotoshop) {
    // Terminate any previous stale Photoshop connection to prevent duplicate loops
    for (const oldWs of psSockets) {
      try {
        oldWs.removeAllListeners();
        oldWs.terminate();
      } catch (e) {}
    }
    psSockets.clear();

    psSockets.add(ws);
    console.log(`[Photoshop] Plugin connected. Active PS clients: ${psSockets.size}`);

    // Notify Photoshop of current mobile client count and USB status
    broadcastMobileCountToPhotoshop();
    broadcastUsbStatusToPhotoshop();

    ws.on('message', (message, isBinary) => {
      handlePhotoshopMessage(message, isBinary, ws);
    });

    ws.on('close', (code) => {
      psSockets.delete(ws);
      console.log(`[Photoshop] Plugin disconnected (code: ${code}). Remaining PS clients: ${psSockets.size}`);
      if (psSockets.size === 0) {
        broadcastToMobiles({
          type: 'ps_status',
          connected: false
        });
      }
    });

    ws.on('error', (err) => {
      console.error('[Photoshop] WebSocket error:', err.message);
    });
  } else {
    // Mobile client
    const clientId = `mob_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    let deviceType = 'Mobile Browser (USB)';
    if (/iPhone|iPad|iPod/i.test(userAgent)) deviceType = 'iPhone / iOS (USB)';
    else if (/Android/i.test(userAgent)) deviceType = 'Android (USB)';

    const clientInfo = {
      id: clientId,
      deviceType,
      connectedAt: new Date().toISOString()
    };
    mobileSockets.set(ws, clientInfo);
    console.log(`[Mobile] ${deviceType} connected over USB (${clientId}). Total mobile clients: ${mobileSockets.size}`);

    // Send welcome payload with document metadata and latest cached frame
    ws.send(JSON.stringify({
      type: 'init',
      document: currentDocument,
      psConnected: psSockets.size > 0,
      hasFrame: !!latestFrame
    }));

    if (latestFrame) {
      if (typeof latestFrame === 'string') {
        ws.send(JSON.stringify({
          type: 'frame',
          format: 'jpeg',
          data: latestFrame,
          document: currentDocument
        }));
      } else {
        ws.send(latestFrame, { binary: true });
      }
    }

    broadcastMobileCountToPhotoshop();

    ws.on('message', (msg) => {
      try {
        const data = JSON.parse(msg.toString());
        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (e) {}
    });

    ws.on('close', () => {
      mobileSockets.delete(ws);
      console.log(`[Mobile] Client disconnected (${clientId}). Remaining: ${mobileSockets.size}`);
      broadcastMobileCountToPhotoshop();
    });

    ws.on('error', (err) => {
      console.error('[Mobile] WebSocket error:', err.message);
    });
  }
});

function handlePhotoshopMessage(message, isBinary, ws) {
  if (isBinary) {
    latestFrame = message;
    currentDocument.hasImage = true;
    currentDocument.lastUpdated = Date.now();

    for (const [clientWs] of mobileSockets.entries()) {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(message, { binary: true });
      }
    }
    return;
  }

  try {
    const payload = JSON.parse(message.toString());

    if (payload.type === 'ping') {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
      return;
    }

    if (payload.type === 'frame') {
      latestFrame = payload.data;
      if (payload.document) {
        currentDocument = {
          ...currentDocument,
          ...payload.document,
          lastUpdated: Date.now(),
          hasImage: true
        };
      }

      const outgoing = JSON.stringify({
        type: 'frame',
        format: payload.format || 'jpeg',
        data: payload.data,
        document: currentDocument
      });

      for (const [clientWs] of mobileSockets.entries()) {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(outgoing);
        }
      }
    } else if (payload.type === 'doc_change') {
      currentDocument = {
        ...currentDocument,
        ...payload.document,
        lastUpdated: Date.now()
      };
      broadcastToMobiles({
        type: 'doc_change',
        document: currentDocument
      });
    } else if (payload.type === 'doc_closed') {
      currentDocument = {
        name: "No Document Opened",
        width: 0,
        height: 0,
        resolution: 72,
        colorMode: "RGB",
        lastUpdated: Date.now(),
        hasImage: false
      };
      latestFrame = null;
      broadcastToMobiles({
        type: 'doc_closed'
      });
    }
  } catch (err) {
    console.error('[Photoshop] Failed to parse message:', err);
  }
}

function broadcastToMobiles(obj) {
  const jsonStr = JSON.stringify(obj);
  for (const [ws] of mobileSockets.entries()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(jsonStr);
    }
  }
}

function broadcastMobileCountToPhotoshop() {
  const msg = JSON.stringify({
    type: 'mobile_status',
    count: mobileSockets.size,
    devices: Array.from(mobileSockets.values())
  });
  for (const ws of psSockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

function broadcastUsbStatusToPhotoshop() {
  const net = getNetworkInfo();
  const msg = JSON.stringify({
    type: 'usb_status',
    network: net
  });
  for (const ws of psSockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

// Error Resilience & Port Protection
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[Server Error] Port ${PORT} is currently in use. Will retry in 3 seconds...`);
    setTimeout(() => {
      server.close();
      server.listen(PORT, '0.0.0.0');
    }, 3000);
  } else {
    console.error('[Server Error]', err);
  }
});

process.on('uncaughtException', (err) => {
  console.error('[Process Uncaught Exception]', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Process Unhandled Rejection]', reason);
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  initAdb();
  checkAdbDevices();
  // Poll ADB devices and USB interfaces every 2.5 seconds
  setInterval(checkAdbDevices, 2500);

  const netInfo = getNetworkInfo();
  console.log('\n================================================================');
  console.log('       PHOTOSHOP MOBILE PREVIEW - PURE USB CABLE MODE           ');
  console.log('================================================================');
  console.log(` Server running on port ${PORT} (0.0.0.0:${PORT})`);
  console.log(' [Network Independence] ZERO Wi-Fi or Internet required!\n');

  console.log('--- 🤖 ANDROID USB CONNECTION ---');
  if (adbState.connected) {
    console.log(`  [ADB Active] Connected to ${adbState.device} via physical USB!`);
    console.log(`  -> Open in Android Chrome: http://localhost:${PORT}`);
  } else {
    console.log('  Mode 1 (Instant): Connect USB with USB Debugging enabled.');
    console.log(`         Auto-reverses to: http://localhost:${PORT}`);
    console.log('  Mode 2 (No Developer Mode): Settings > Hotspot & tethering > USB Tethering.');
    if (netInfo.usbAndroid.length > 0) {
      netInfo.usbAndroid.forEach(entry => {
        console.log(`         Detected USB IP: ${entry.url}`);
      });
    }
  }

  console.log('\n--- 🍏 IPHONE USB CONNECTION ---');
  console.log('  1. Connect iPhone with USB cable. (Wi-Fi can be OFF)');
  console.log('  2. On iPhone: Settings > Personal Hotspot > Turn ON ("USB Only").');
  if (netInfo.usbIphone.length > 0) {
    netInfo.usbIphone.forEach(entry => {
      console.log(`  -> Detected iPhone USB: ${entry.url}`);
    });
  } else {
    console.log('  3. Open detected USB URL in Safari & tap "Add to Home Screen".');
  }

  const primaryUrl = netInfo.recommendedUrl || `http://localhost:${PORT}`;
  console.log(`\n[Active Direct USB URL]: ${primaryUrl}`);

  QRCode.toString(primaryUrl, { type: 'terminal', small: true }, (err, str) => {
    if (!err && str) {
      console.log('\n[Scan with Phone Camera to Open over USB]:');
      console.log(str);
    }
  });

  console.log('================================================================\n');
});
