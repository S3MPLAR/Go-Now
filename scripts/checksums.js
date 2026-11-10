const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const target = process.argv[2];
const patterns = {
  win: [/^gonow-.*-setup\.exe$/, /^gonow-.*-portable\.exe$/],
  linux: [/^gonow-.*\.AppImage$/, /^gonow-.*\.deb$/],
  mac: [/^gonow-.*\.dmg$/, /^gonow-.*\.zip$/]
};

if (!patterns[target]) {
  console.error('usage: node checksums.js <win|linux|mac>');
  process.exit(1);
}

const dir = path.join(process.cwd(), 'dist');
const files = fs.readdirSync(dir)
  .filter((name) => patterns[target].some((re) => re.test(name)))
  .sort();

if (!files.length) {
  console.error(`no ${target} artifacts in ${dir}`);
  process.exit(1);
}

const lines = files.map((name) => {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, name))).digest('hex');
  return `${hash}  ${name}`;
});
fs.writeFileSync(path.join(dir, `SHA256SUMS-${target}.txt`), `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
