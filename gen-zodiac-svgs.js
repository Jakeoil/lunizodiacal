#!/usr/bin/env node
// Generate SVG files for zodiac glyphs from glyphs.js path data
const fs = require('fs');

// Load glyphs.js by evaluating it (it defines a global `Glyphs`)
const src = fs.readFileSync(__dirname + '/glyphs.js', 'utf8');
const fn = new Function(src + '; return Glyphs;');
const Glyphs = fn();

const names = [
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'
];

const outDir = __dirname + '/zodiac';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

// Parse path d-string to find bounding box
function pathBounds(d) {
  const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < nums.length; i += 2) {
    if (i + 1 >= nums.length) break;
    const x = nums[i], y = nums[i + 1];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

for (let i = 0; i < 12; i++) {
  const g = Glyphs.zodiac[String(i)];
  const b = pathBounds(g.d);
  const pad = 20;
  const vx = b.minX - pad, vy = b.minY - pad;
  const vw = b.maxX - b.minX + pad * 2;
  const vh = b.maxY - b.minY + pad * 2;
  const displayH = 20;
  const displayW = Math.round(displayH * vw / vh);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" width="${displayW}" height="${displayH}">
  <path d="${g.d}" fill="#222"/>
</svg>
`;
  fs.writeFileSync(`${outDir}/${names[i]}.svg`, svg);
  console.log(`wrote ${names[i]}.svg  viewBox="${vx} ${vy} ${vw} ${vh}"  ${displayW}x${displayH}`);
}
