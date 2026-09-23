const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
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

// Helper to find relevant network interfaces (USB Tethering, Hotspot, Local)
function getNetworkInfo() {
  const interfaces = os.networkInterfaces();
  const results = {
    usbAndroid: [],
    usbIphone: [],
    localIps: [],
    hostname: `${os.hostname().replace(/\.local$/, '')}.local`
  };

  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        const ip = addr.address;
        const entry = { interface: name, ip, url: `http://${ip}:${PORT}` };

        // Common Android USB Tethering subnets
        if (ip.startsWith('192.168.42.') || ip.startsWith('192.168.43.') || name.toLowerCase().includes('rndis') || name.toLowerCase().includes('ncm')) {
          results.usbAndroid.push(entry);
        }
        // iPhone USB Personal Hotspot subnet
        else if (ip.startsWith('172.20.10.')) {
          results.usbIphone.push(entry);
        } else {
          results.localIps.push(entry);
        }
      }
    }
  }

  return results;
}

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

  if (pathname === '/api/qr') {
    const text = parsedUrl.searchParams.get('text') || `http://${getNetworkInfo().hostname}:${PORT}`;
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

    // Notify Photoshop of current mobile client count
    broadcastMobileCountToPhotoshop();

    ws.on('message', (message, isBinary) => {
      handlePhotoshopMessage(message, isBinary, ws);
    });

    ws.on('close', (code, reason) => {
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
    let deviceType = 'Mobile Browser';
    if (/iPhone|iPad|iPod/i.test(userAgent)) deviceType = 'iPhone / iOS';
    else if (/Android/i.test(userAgent)) deviceType = 'Android';

    const clientInfo = {
      id: clientId,
      deviceType,
      connectedAt: new Date().toISOString()
    };
    mobileSockets.set(ws, clientInfo);
    console.log(`[Mobile] ${deviceType} connected (${clientId}). Total mobile clients: ${mobileSockets.size}`);

    // Send welcome payload with document metadata and latest cached frame
    ws.send(JSON.stringify({
      type: 'init',
      document: currentDocument,
      psConnected: psSockets.size > 0,
      hasFrame: !!latestFrame
    }));

    if (latestFrame) {
      // Send latest image immediately so screen fills right away
      if (typeof latestFrame === 'string') {
        ws.send(JSON.stringify({
          type: 'frame',
          format: 'jpeg',
          data: latestFrame,
          document: currentDocument
        }));
      } else {
        // Binary buffer
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
    // Direct binary JPEG/PNG frame from Photoshop
    latestFrame = message;
    currentDocument.hasImage = true;
    currentDocument.lastUpdated = Date.now();

    // Broadcast binary to all mobile clients
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

      // Broadcast to all connected mobile clients
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

// Error Resilience & Forever Daemon Protection
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

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process Unhandled Rejection]', reason);
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  const netInfo = getNetworkInfo();
  console.log('\n================================================================');
  console.log('       PHOTOSHOP MOBILE PREVIEW - USB BRIDGE SERVER             ');
  console.log('================================================================');
  console.log(` Server running on port ${PORT}`);
  console.log('\n--- USB CONNECTION OPTIONS (No USB Debugging Needed!) ---');

  let primaryUrl = `http://${netInfo.hostname}:${PORT}`;

  if (netInfo.usbAndroid.length > 0) {
    console.log('\n[Android USB Tethering Detected]:');
    netInfo.usbAndroid.forEach(entry => {
      console.log(`  -> Open in Android Chrome: ${entry.url}`);
      primaryUrl = entry.url;
    });
  } else {
    console.log('\n[Android USB - How to Connect]:');
    console.log('  1. Connect USB cable from Android phone to Mac.');
    console.log('  2. On Android, go to Settings > Network & internet > Hotspot & tethering.');
    console.log('  3. Turn ON "USB tethering". (No USB debugging needed!)');
    console.log(`  4. Open: http://${netInfo.hostname}:${PORT} in Chrome.`);
  }

  if (netInfo.usbIphone.length > 0) {
    console.log('\n[iPhone USB Hotspot Detected]:');
    netInfo.usbIphone.forEach(entry => {
      console.log(`  -> Open in iPhone Safari: ${entry.url}`);
      primaryUrl = entry.url;
    });
  } else {
    console.log('\n[iPhone USB - How to Connect]:');
    console.log('  1. Connect USB cable from iPhone to Mac.');
    console.log('  2. On iPhone, go to Settings > Personal Hotspot and choose "USB Only".');
    console.log(`  3. Open: http://${netInfo.hostname}:${PORT} in Safari.`);
    console.log('  4. Tap Share > "Add to Home Screen" for true borderless fullscreen.');
  }

  if (netInfo.localIps.length > 0) {
    console.log('\n[Local / Wi-Fi Fallback URLs]:');
    netInfo.localIps.forEach(entry => {
      console.log(`  -> ${entry.interface}: ${entry.url}`);
    });
  }

  console.log(`\n[Direct URL]: ${primaryUrl}`);

  QRCode.toString(primaryUrl, { type: 'terminal', small: true }, (err, str) => {
    if (!err && str) {
      console.log('\n[Scan with Phone Camera to Open]:');
      console.log(str);
    }
  });

  console.log('================================================================\n');
});
