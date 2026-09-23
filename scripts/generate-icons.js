const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 implementation for PNG chunks
function makeCrcTable() {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c;
  }
  return table;
}

const crcTable = makeCrcTable();
function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, 'ascii');
  const typeAndData = Buffer.concat([typeBuf, data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);

  return Buffer.concat([len, typeAndData, crc]);
}

function generatePng(size) {
  const width = size;
  const height = size;

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // RGBA
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  // Raw image data with scanline filter (filter 0)
  const raw = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;

  const center = size / 2;
  const radius = size * 0.44;
  const innerRadius = size * 0.40;

  for (let y = 0; y < height; y++) {
    raw[offset++] = 0; // Filter 0 (None)
    for (let x = 0; x < width; x++) {
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Photoshop dark blue theme
      if (dist <= innerRadius) {
        // Photoshop badge icon interior
        const cornerDist = Math.max(Math.abs(dx), Math.abs(dy));
        if (cornerDist < size * 0.36) {
          // Blue PS center
          raw[offset++] = 0;    // R
          raw[offset++] = 30;   // G
          raw[offset++] = 54;   // B
          raw[offset++] = 255;  // A
        } else {
          // Glow border
          raw[offset++] = 49;   // R
          raw[offset++] = 168;  // G
          raw[offset++] = 255;  // B
          raw[offset++] = 255;  // A
        }
      } else if (dist <= radius) {
        // Soft outer edge
        const alpha = Math.floor(255 * (1 - (dist - innerRadius) / (radius - innerRadius)));
        raw[offset++] = 49;
        raw[offset++] = 168;
        raw[offset++] = 255;
        raw[offset++] = alpha;
      } else {
        // Transparent
        raw[offset++] = 0;
        raw[offset++] = 0;
        raw[offset++] = 0;
        raw[offset++] = 0;
      }
    }
  }

  const compressed = zlib.deflateSync(raw);

  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([pngHeader, ihdrChunk, idatChunk, iendChunk]);
}

const iconsDir = path.resolve(__dirname, '../mobile-client/icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), generatePng(192));
fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), generatePng(512));
console.log('Successfully generated PWA icons: icon-192.png, icon-512.png');
