import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(__dirname, '../public/icons');
const svgPath = path.join(iconsDir, 'tpos.svg');

const svg = fs.readFileSync(svgPath);

await Promise.all([
  sharp(svg).resize(192, 192).png().toFile(path.join(iconsDir, 'tpos-192.png')),
  sharp(svg).resize(512, 512).png().toFile(path.join(iconsDir, 'tpos-512.png')),
]);

console.log('Icons generated: tpos-192.png, tpos-512.png');
