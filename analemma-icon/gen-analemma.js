#!/usr/bin/env node
// Generate an analemma SVG icon colored by zodiac sign with season symbols.
const fs = require('fs');

// Load Coylendar glyph paths
const glyphsSrc = fs.readFileSync(__dirname + '/../glyphs.js', 'utf8');
const Glyphs = new Function(glyphsSrc + '; return Glyphs;')();

const SIGN_COLOR = [
  '#99FFCC',  // 0  Aries
  '#99FF99',  // 1  Taurus
  '#CCFF99',  // 2  Gemini
  '#FFFF99',  // 3  Cancer
  '#FFCC99',  // 4  Leo
  '#FF9999',  // 5  Virgo
  '#FF99CC',  // 6  Libra
  '#FF99FF',  // 7  Scorpio
  '#CCCCFF',  // 8  Sagittarius
  '#99CCFF',  // 9  Capricorn
  '#66CCFF',  // 10 Aquarius
  '#66FFFF',  // 11 Pisces
];

const RADS = Math.PI / 180;

// ── Astronomical calculations ────────────────────────────────────────────

function dayOfYear(month, day) {
  // month 1-indexed
  const d = new Date(2026, month - 1, day);
  const jan1 = new Date(2026, 0, 1);
  return Math.floor((d - jan1) / 86400000) + 1;
}

// Compute sun declination and equation of time for day-of-year (1–365)
function analemmaPoint(doy) {
  // Fractional year in radians
  const B = (doy - 81) * 360 / 365 * RADS;

  // Equation of Time (minutes) — Spencer formula
  const EoT = 9.87 * Math.sin(2 * B)
            - 7.53 * Math.cos(B)
            - 1.5  * Math.sin(B);

  // Declination (degrees) — simple approximation
  const decl = 23.45 * Math.sin((360 / 365) * (doy - 81) * RADS);

  return { eot: EoT, decl };
}

// Zodiac sign for a day-of-year (approximate tropical)
function zodiacSign(doy) {
  // Aries starts ~March 21 = doy 80
  const angle = ((doy - 80 + 365) % 365) / 365 * 360;
  return Math.floor(angle / 30) % 12;
}

// ── Compute analemma path ────────────────────────────────────────────────

const points = [];
for (let doy = 1; doy <= 365; doy++) {
  const { eot, decl } = analemmaPoint(doy);
  const sign = zodiacSign(doy);
  points.push({ doy, eot, decl, sign });
}

// Find coordinate bounds
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (const p of points) {
  if (p.eot < minX) minX = p.eot;
  if (p.eot > maxX) maxX = p.eot;
  if (p.decl < minY) minY = p.decl;
  if (p.decl > maxY) maxY = p.decl;
}

// SVG dimensions and mapping — square
const svgW = 600, svgH = 600;
const padX = 60, padY = 60; // room for symbols

function mapX(eot) {
  return padX + (eot - minX) / (maxX - minX) * (svgW - 2 * padX);
}
function mapY(decl) {
  // Y axis inverted: positive declination (summer) at top
  return padY + (maxY - decl) / (maxY - minY) * (svgH - 2 * padY);
}

// ── Build SVG ────────────────────────────────────────────────────────────

let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}">\n`;

// Draw ribbon in two arcs so the crossing shows an outline.
// The figure-8 crosses around the equinoxes (~doy 110 and ~250).
// Draw first arc (bottom lobe: doy 250→365→1→110), then second arc
// (top lobe: doy 110→250) on top, so the crossing is visible.
const ribbonWidth = 48;
const crossA = 110, crossB = 250; // approximate crossing days

function drawArc(startDoy, endDoy) {
  // Collect indices for this arc
  const indices = [];
  if (startDoy <= endDoy) {
    for (let d = startDoy; d < endDoy; d++) indices.push(d - 1);
  } else {
    for (let d = startDoy; d <= 365; d++) indices.push(d - 1);
    for (let d = 1; d < endDoy; d++) indices.push(d - 1);
  }
  // Outline pass
  for (const i of indices) {
    const p0 = points[i];
    const p1 = points[(i + 1) % points.length];
    const x0 = mapX(p0.eot), y0 = mapY(p0.decl);
    const x1 = mapX(p1.eot), y1 = mapY(p1.decl);
    svg += `  <line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="rgba(0,0,0,0.3)" stroke-width="${ribbonWidth + 4}" stroke-linecap="round"/>\n`;
  }
  // Colored pass
  for (const i of indices) {
    const p0 = points[i];
    const p1 = points[(i + 1) % points.length];
    const x0 = mapX(p0.eot), y0 = mapY(p0.decl);
    const x1 = mapX(p1.eot), y1 = mapY(p1.decl);
    svg += `  <line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="${SIGN_COLOR[p0.sign]}" stroke-width="${ribbonWidth}" stroke-linecap="round"/>\n`;
  }
}

// Bottom lobe first (behind), then top lobe (in front at crossing)
drawArc(crossB, crossA);
drawArc(crossA, crossB);

// ── Season points with zodiac symbols ────────────────────────────────────
// Vernal equinox ~Mar 20 = doy 79,  sign 0 (Aries)
// Summer solstice ~Jun 21 = doy 172, sign 3 (Cancer)
// Autumnal equinox ~Sep 22 = doy 265, sign 6 (Libra)
// Winter solstice ~Dec 21 = doy 355, sign 9 (Capricorn)

const seasonPoints = [
  { doy: 79,  sign: 0, name: 'Aries' },
  { doy: 172, sign: 3, name: 'Cancer' },
  { doy: 265, sign: 6, name: 'Libra' },
  { doy: 355, sign: 9, name: 'Capricorn' },
];

const symbolSize = 80; // px

for (const sp of seasonPoints) {
  const { eot, decl } = analemmaPoint(sp.doy);
  const cx = mapX(eot);
  const cy = mapY(decl);
  const glyph = Glyphs.zodiac[String(sp.sign)];

  // Parse glyph bounding box for centering
  const nums = glyph.d.match(/-?\d+(\.\d+)?/g).map(Number);
  let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
  for (let i = 0; i < nums.length - 1; i += 2) {
    if (nums[i] < gMinX) gMinX = nums[i];
    if (nums[i] > gMaxX) gMaxX = nums[i];
    if (nums[i+1] < gMinY) gMinY = nums[i+1];
    if (nums[i+1] > gMaxY) gMaxY = nums[i+1];
  }
  const gW = gMaxX - gMinX;
  const gH = gMaxY - gMinY;
  const scale = symbolSize / Math.max(gW, gH);
  const tx = cx - (gMinX + gW / 2) * scale;
  const ty = cy - (gMinY + gH / 2) * scale;

  // Badge outline ring
  svg += `  <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(symbolSize * 0.7 + 3).toFixed(1)}" fill="none" stroke="rgba(0,0,0,0.3)" stroke-width="6"/>\n`;
  // Badge circle background
  svg += `  <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${symbolSize * 0.7}" fill="#222" stroke="${SIGN_COLOR[sp.sign]}" stroke-width="3"/>\n`;

  // Glyph
  svg += `  <g transform="translate(${tx.toFixed(1)},${ty.toFixed(1)}) scale(${scale.toFixed(4)})">\n`;
  svg += `    <path d="${glyph.d}" fill="${SIGN_COLOR[sp.sign]}"/>\n`;
  svg += `  </g>\n`;
}

svg += '</svg>\n';

const outPath = __dirname + '/analemma.svg';
fs.writeFileSync(outPath, svg);
console.log('wrote', outPath);
console.log('bounds: EoT', minX.toFixed(1), 'to', maxX.toFixed(1), 'min');
console.log('        decl', minY.toFixed(1), 'to', maxY.toFixed(1), '°');
for (const sp of seasonPoints) {
  const { eot, decl } = analemmaPoint(sp.doy);
  console.log(`  ${sp.name.padEnd(12)} doy ${sp.doy}  EoT ${eot.toFixed(1)}  decl ${decl.toFixed(1)}°  → (${mapX(eot).toFixed(0)}, ${mapY(decl).toFixed(0)})`);
}
