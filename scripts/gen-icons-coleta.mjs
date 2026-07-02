// Gera os ícones PNG do PWA de Coleta (alvo de GPS sobre fundo azul INVICTA).
// Sem dependências: PNG RGBA cru + deflate do zlib. Rodar: node scripts/gen-icons-coleta.mjs

import { deflateSync } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filtro none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function desenhar(size) {
  const px = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2;
  const BG = [10, 25, 41];      // #0a1929
  const VERDE = [74, 222, 128]; // #4ade80
  const r1 = size * 0.26, r2 = size * 0.34; // anel
  const rd = size * 0.10;                   // ponto central
  const tickIn = size * 0.38, tickOut = size * 0.47, tickW = size * 0.035;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      let cor = BG;
      if (d <= rd) cor = VERDE;
      else if (d >= r1 && d <= r2) cor = VERDE;
      else if (
        (Math.abs(dx) <= tickW && Math.abs(dy) >= tickIn && Math.abs(dy) <= tickOut) ||
        (Math.abs(dy) <= tickW && Math.abs(dx) >= tickIn && Math.abs(dx) <= tickOut)
      ) cor = VERDE;
      const i = (y * size + x) * 4;
      px[i] = cor[0]; px[i + 1] = cor[1]; px[i + 2] = cor[2]; px[i + 3] = 255;
    }
  }
  return px;
}

mkdirSync(new URL('../public/icons/', import.meta.url), { recursive: true });
for (const size of [192, 512]) {
  const buf = png(size, desenhar(size));
  writeFileSync(new URL(`../public/icons/coleta-${size}.png`, import.meta.url), buf);
  console.log(`coleta-${size}.png — ${buf.length} bytes`);
}
