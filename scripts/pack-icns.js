const fs = require('node:fs');
const path = require('node:path');

const dir = process.argv[2];
const out = process.argv[3];
if (!dir || !out) {
  console.error('usage: node pack-icns.js <iconset-dir> <output.icns>');
  process.exit(1);
}

const TYPES = {
  16: 'icp4',
  32: 'icp5',
  64: 'icp6',
  128: 'ic07',
  256: 'ic08',
  512: 'ic09',
  1024: 'ic10'
};

const chunks = [];
for (const [size, type] of Object.entries(TYPES)) {
  const file = path.join(dir, `icon_${size}.png`);
  if (!fs.existsSync(file)) continue;
  const data = fs.readFileSync(file);
  const head = Buffer.alloc(8);
  head.write(type, 0, 4, 'ascii');
  head.writeUInt32BE(data.length + 8, 4);
  chunks.push(head, data);
}
if (!chunks.length) {
  console.error('no icon PNGs found');
  process.exit(1);
}
const total = 8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
const header = Buffer.alloc(8);
header.write('icns', 0, 4, 'ascii');
header.writeUInt32BE(total, 4);
fs.writeFileSync(out, Buffer.concat([header, ...chunks]));
console.log(`wrote ${out} (${total} bytes)`);
