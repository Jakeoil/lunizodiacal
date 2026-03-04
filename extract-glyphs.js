// extract-glyphs.js
// Extracts Path2D-compatible SVG path strings from:
//   - EB Garamond Regular/Bold: digits 0-9 (old-style .osf)
//   - Noto Sans Symbols: zodiac signs U+2648-U+2653
// Outputs glyphs.js for use in calendarDate.js

'use strict';

const opentype = require('opentype.js');
const fs       = require('fs');

// ── Load fonts ────────────────────────────────────────────────────────────────

const ebReg  = opentype.loadSync('fonts/EBGaramond-Regular.otf');
const ebBold = opentype.loadSync('fonts/EBGaramond-Bold.otf');
const noto   = opentype.loadSync('fonts/NotoSansSymbols-Regular.ttf');

// ── Helper: extract normalised SVG path string ────────────────────────────────
// Returns path scaled so that 1 unit = 1 em (i.e. coordinates in [0..1] roughly).
// Y is flipped (font coords go up, canvas goes down).

function glyphPath(font, glyph) {
  const upm   = font.unitsPerEm;
  const scale = 1 / upm;
  const path  = glyph.getPath(0, 0, upm);  // draw at font size = upm → 1px = 1 unit
  // Convert to SVG path string, then normalise
  const svgRaw = path.toSVG(4);
  // Extract just the d= attribute value
  const m = svgRaw.match(/d="([^"]+)"/);
  if (!m) return null;
  // Re-scale: divide all numeric tokens by upm, flip Y (subtract from 1 after scale)
  // Instead, use toPathData with a scaling transform via getPath with x=0,y=upm,size=upm
  // That puts origin at top-left in canvas coords.
  const path2 = glyph.getPath(0, upm, upm);
  const svg2  = path2.toSVG(4);
  const m2    = svg2.match(/d="([^"]+)"/);
  return m2 ? m2[1] : null;
}

// ── Extract: EB Garamond old-style digits ─────────────────────────────────────

const DIGIT_NAMES = ['zero','one','two','three','four','five','six','seven','eight','nine'];

function extractDigits(font, suffix) {
  // Build name→glyph map once
  const byName = {};
  for (let gi = 0; gi < font.numGlyphs; gi++) {
    const g = font.glyphs.get(gi);
    if (g.name) byName[g.name] = g;
  }
  const result = {};
  DIGIT_NAMES.forEach((name, i) => {
    const glyphName = suffix ? `${name}.${suffix}` : name;
    const found = byName[glyphName];
    if (!found) { console.warn('Missing:', glyphName); return; }
    const d = glyphPath(font, found);
    if (d) result[i] = { d, advanceWidth: found.advanceWidth / font.unitsPerEm };
  });
  return result;
}

// ── Extract: bold small-cap letters for month abbreviations ───────────────────
// Month abbreviations jan feb mar apr may jun jul aug sep oct nov dec use these letters:
const MONTH_LETTERS = [...new Set('janfebmaraprmayjunjulaugsepoctnovdec'.split(''))].sort();

function extractSmallCaps(font) {
  const byName = {};
  for (let gi = 0; gi < font.numGlyphs; gi++) {
    const g = font.glyphs.get(gi);
    if (g.name) byName[g.name] = g;
  }
  const result = {};
  for (const letter of MONTH_LETTERS) {
    const glyphName = `${letter}.sc`;
    const found = byName[glyphName];
    if (!found) { console.warn('Missing small-cap:', glyphName); continue; }
    const d = glyphPath(font, found);
    if (d) result[letter] = { d, advanceWidth: found.advanceWidth / font.unitsPerEm };
  }
  return result;
}

// ── Extract: zodiac symbols from Noto Sans Symbols ────────────────────────────

function extractZodiac(font) {
  const result = {};
  for (let cp = 0x2648; cp <= 0x2653; cp++) {
    const idx   = font.charToGlyphIndex(String.fromCodePoint(cp));
    const glyph = font.glyphs.get(idx);
    if (!glyph || idx === 0) { console.warn('Missing zodiac U+' + cp.toString(16)); continue; }
    const d = glyphPath(font, glyph);
    const sign = cp - 0x2648;  // 0=Aries ... 11=Pisces
    if (d) result[sign] = { d, advanceWidth: glyph.advanceWidth / font.unitsPerEm };
  }
  return result;
}

// ── Also grab metrics for vertical alignment ──────────────────────────────────

function metrics(font) {
  const upm = font.unitsPerEm;
  return {
    ascender:  font.ascender  / upm,
    descender: font.descender / upm,
    capHeight: (font.tables.os2 && font.tables.os2.sCapHeight) ? font.tables.os2.sCapHeight / upm : 0.7,
    xHeight:   (font.tables.os2 && font.tables.os2.sxHeight)   ? font.tables.os2.sxHeight   / upm : 0.5,
  };
}

// ── Run extraction ────────────────────────────────────────────────────────────

console.log('Extracting EB Garamond regular OSF digits...');
const digitsReg  = extractDigits(ebReg,  'osf');

console.log('Extracting EB Garamond bold OSF digits...');
const digitsBold = extractDigits(ebBold, 'osf');

console.log('Extracting bold small-cap letters for month labels...');
const smallCaps = extractSmallCaps(ebBold);

console.log('Extracting zodiac symbols from Noto Sans Symbols...');
const zodiac = extractZodiac(noto);

console.log(`  digits regular: ${Object.keys(digitsReg).length}/10`);
console.log(`  digits bold:    ${Object.keys(digitsBold).length}/10`);
console.log(`  small caps:     ${Object.keys(smallCaps).length}/${MONTH_LETTERS.length} (${MONTH_LETTERS.join('')})`);
console.log(`  zodiac signs:   ${Object.keys(zodiac).length}/12`);

// ── Emit glyphs.js ────────────────────────────────────────────────────────────

const metricsEB   = metrics(ebReg);
const metricsNoto = metrics(noto);

const out = `// glyphs.js — auto-generated by extract-glyphs.js
// Glyph outlines extracted from:
//   EB Garamond by Georg Duffner & Octavio Pardo (OFL 1.1)
//   https://github.com/octaviopardo/EBGaramond12
//   Noto Sans Symbols by Google (OFL 1.1)
//   https://github.com/googlefonts/noto-fonts
//
// Coordinate system: 1 unit = 1 em, Y increases downward (canvas-friendly).
// To draw at size S px: ctx.save(); ctx.scale(S, S); ctx.fill(new Path2D(d)); ctx.restore()

const Glyphs = {

  // EB Garamond metrics
  ebMetrics: ${JSON.stringify(metricsEB, null, 4)},

  // Noto Sans Symbols metrics
  notoMetrics: ${JSON.stringify(metricsNoto, null, 4)},

  // Old-style digits 0-9, regular weight
  // Key = digit value (0-9)
  digitsReg: ${JSON.stringify(digitsReg, null, 4)},

  // Old-style digits 0-9, bold weight
  digitsBold: ${JSON.stringify(digitsBold, null, 4)},

  // Bold small-cap letters for month abbreviations (jan feb mar apr may jun jul aug sep oct nov dec)
  // Key = lowercase letter.  Glyphs sit on the baseline; visual centre is at xHeight/2 above baseline.
  smallCaps: ${JSON.stringify(smallCaps, null, 4)},

  // Zodiac signs 0=Aries ... 11=Pisces
  zodiac: ${JSON.stringify(zodiac, null, 4)},

};
`;

fs.writeFileSync('glyphs.js', out);
console.log('Written glyphs.js');
