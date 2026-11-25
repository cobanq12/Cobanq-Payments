// Converts the Inter WOFF files shipped by @fontsource/inter into TTF files that
// jsPDF can embed in the payment confirmation PDF. Run: node scripts/woff-to-ttf.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const SRC = 'node_modules/@fontsource/inter/files';
const OUT = 'public/fonts';
const WEIGHTS = { 400: 'Regular', 600: 'SemiBold', 700: 'Bold' };

function woffToSfnt(buf) {
  if (buf.readUInt32BE(0) !== 0x774f4646) throw new Error('Not a WOFF file');
  const flavor = buf.readUInt32BE(4);
  const numTables = buf.readUInt16BE(12);
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const o = 44 + i * 20;
    const tag = buf.subarray(o, o + 4);
    const offset = buf.readUInt32BE(o + 4);
    const compLength = buf.readUInt32BE(o + 8);
    const origLength = buf.readUInt32BE(o + 12);
    const checksum = buf.readUInt32BE(o + 16);
    const raw = buf.subarray(offset, offset + compLength);
    const data = compLength < origLength ? inflateSync(raw) : raw;
    if (data.length !== origLength) throw new Error('Bad table length');
    tables.push({ tag, checksum, data });
  }
  const entrySelector = Math.floor(Math.log2(numTables));
  const searchRange = 2 ** entrySelector * 16;
  const header = Buffer.alloc(12 + numTables * 16);
  header.writeUInt32BE(flavor, 0);
  header.writeUInt16BE(numTables, 4);
  header.writeUInt16BE(searchRange, 6);
  header.writeUInt16BE(entrySelector, 8);
  header.writeUInt16BE(numTables * 16 - searchRange, 10);
  let offset = header.length;
  const chunks = [header];
  tables.forEach((t, i) => {
    const o = 12 + i * 16;
    t.tag.copy(header, o);
    header.writeUInt32BE(t.checksum, o + 4);
    header.writeUInt32BE(offset, o + 8);
    header.writeUInt32BE(t.data.length, o + 12);
    const padded = Buffer.alloc(Math.ceil(t.data.length / 4) * 4);
    t.data.copy(padded);
    chunks.push(padded);
    offset += padded.length;
  });
  return Buffer.concat(chunks);
}

mkdirSync(OUT, { recursive: true });
for (const [weight, name] of Object.entries(WEIGHTS)) {
  const ttf = woffToSfnt(readFileSync(`${SRC}/inter-latin-${weight}-normal.woff`));
  writeFileSync(`${OUT}/Inter-${name}.ttf`, ttf);
  console.log(`Inter-${name}.ttf ${ttf.length} bytes`);
}
