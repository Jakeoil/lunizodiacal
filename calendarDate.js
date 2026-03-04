// calendarDate.js — Port of CalendarDate.java
// Rendering via Canvas 2D API. Depends on astro.js (Astro object).
//
// ── How a day is constructed ─────────────────────────────────────────────────
//
// A CalendarDate represents one calendar day as a parallelogram cell.
// Construction happens in three phases:
//
// 1. ASTRONOMICAL VALUES
//    All sky observations are computed at "end of day" — exactly 86400 s
//    (24 × 60 × 60 × 1000 ms) after the DST-adjusted local midnight that
//    opens the calendar day. The timezone offset is DST-adjusted (matching
//    Java's toUtcMinutes, which adds getDSTSavings() when applicable).
//    This means the displayed values reflect what is true for the majority
//    of the calendar day, rather than snapping at the stroke of midnight.
//
//    mSignStart      (0–11)  Zodiac sign of the Sun at the START of the day
//                            (today's local midnight). Used as the left-half
//                            color when a sign transition splits the cell.
//
//    mTropicalPhase  (0–11)  Zodiac sign of the Sun at the END of the day.
//                            Determines the cell color (or right-half color
//                            when split). 0 = Aries (≈ Mar 21).
//
//    mLunarPhase     (0–3)   Lunar phase quarter at end of day.
//                              0 = new moon
//                              1 = first quarter (waxing)
//                              2 = full moon
//                              3 = last quarter (waning)
//                            Controls grid layout: same quarter → step right;
//                            new quarter → drop to next row.
//
//    mSeason         (0–3)   Astronomical season at end of day
//                            (0=spring, 1=summer, 2=autumn, 3=winter).
//                            Used to bound the season grid.
//
// 2. SIGN-TRANSITION SPLIT  (see also: splitDays flag below)
//    mSplitFraction  If the Sun crosses a zodiac sign boundary during the day,
//                    this holds the fraction (0–1) of the day at which that
//                    crossing occurs, found by binary search to ~1-second
//                    precision. null when no crossing occurs.
//                    When splitDays is enabled and mSplitFraction is set,
//                    render() draws two sub-parallelograms: the left one in
//                    mSignStart's color and the right in mTropicalPhase's.
//                    Season changes (equinoxes/solstices) are automatically
//                    covered because they always coincide with sign changes.
//
// 3. DISPLAY LABEL
//    mDate    String shown inside the cell.
//               - Day 1 of a month → abbreviated month name ("Jan", "Feb" …)
//               - All other days  → day-of-month number ("2" … "31")
//    mBold    true on the 1st; label renders in bold.
//    mIsSunday  true when the day is a Sunday; label renders in red.
//
// 4. NEW-MOON-WEEK MARKER
//    mNewMoonWeek  true when this day falls in the 7-day window containing a
//                  new moon. Renders as a thick line across the top of the cell.
//
// GRID PLACEMENT  (set by next(), not the constructor)
//    mPlace   { x, y } in world-space "pinch" units. The first day of a season
//             starts at { 0, 0 }. next() places each successor:
//               - Same mLunarPhase → x += 0.5        (step right, same row)
//               - New mLunarPhase  → x -= 19/6, y += 0.5  (new row, left)
//
// ── Configuration ────────────────────────────────────────────────────────────
//
// splitDays  (boolean, default true)
//    When true, days whose Sun sign changes between midnight and midnight are
//    drawn as two sub-parallelograms of different colors, split at the moment
//    of the sign crossing. Toggle at runtime via the settings overlay; no
//    season rebuild is needed — only a redraw.
//
// ─────────────────────────────────────────────────────────────────────────────

// Runtime toggle — read by render(), can be changed without rebuilding season.
let splitDays     = true;
let phaseTicks    = true;
let showMoonSymbols = true;
let showSignSymbols = true;

// ── Noto moon phase images (loaded once, drawn via drawImage) ─────────────────
// Index 0–7 matches MOON_SYMBOL order: new, wax-crescent, 1st-qtr, wax-gibbous,
// full, wan-gibbous, last-qtr, wan-crescent.
const MOON_IMAGES = [];
(function () {
  const codes = ['1f311','1f312','1f313','1f314','1f315','1f316','1f317','1f318'];
  codes.forEach((code, i) => {
    const img = new Image();
    img.src = `emoji/moon_${code}.svg`;
    MOON_IMAGES[i] = img;
  });
}());

// ── Glyph path rendering helpers ──────────────────────────────────────────────
// Paths from glyphs.js use 1000 font units per em; baseline at y=1000.
// Visual cap-height centre is at path y ≈ 675 (= 1 − capHeight/2 = 1 − 0.325).
const _GLYPH_UPM    = 1000;
const _EB_VCENTER   = 0.675;   // fraction of em from top to cap-height centre
const _EB_SC_VCENTER = 0.77;   // fraction of em from top to x-height centre (for small-cap glyphs)
const _NOTO_VCENTER = 0.5;     // zodiac symbols: centre at mid-em

// Draw a string of digits (e.g. "3", "11", "28") centred at (cx, cy).
// emSize is in world units.
function _drawDigits(ctx, numStr, isBold, cx, cy, emSize) {
  const table = isBold ? Glyphs.digitsBold : Glyphs.digitsReg;
  const scale = emSize / _GLYPH_UPM;
  const digits = String(numStr).split('').map(Number);
  const totalW = digits.reduce((w, d) => w + table[d].advanceWidth * emSize, 0);
  let x = cx - totalW / 2;
  const y = cy - _EB_VCENTER * emSize;
  for (const d of digits) {
    const g = table[d];
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fill(new Path2D(g.d));
    ctx.restore();
    x += g.advanceWidth * emSize;
  }
}

// Draw a bold small-cap month abbreviation (e.g. "jan") centred at (cx, cy).
// Uses true small-cap glyphs from EB Garamond Bold — guaranteed pixel-identical across browsers.
function _drawMonth(ctx, abbr, cx, cy, emSize) {
  const scale   = emSize / _GLYPH_UPM;
  const letters = abbr.toLowerCase().split('');
  const totalW  = letters.reduce((w, l) => w + (Glyphs.smallCaps[l]?.advanceWidth ?? 0) * emSize, 0);
  let x = cx - totalW / 2;
  const y = cy - _EB_SC_VCENTER * emSize;
  for (const l of letters) {
    const g = Glyphs.smallCaps[l];
    if (!g) { x += 0.2 * emSize; continue; }
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fill(new Path2D(g.d));
    ctx.restore();
    x += g.advanceWidth * emSize;
  }
}

// Draw a zodiac sign (0–11) centred at (cx, cy).
function _drawZodiacPath(ctx, sign, cx, cy, emSize) {
  const g = Glyphs.zodiac[sign];
  const scale = emSize / _GLYPH_UPM;
  const x = cx - g.advanceWidth * emSize / 2;
  const y = cy - _NOTO_VCENTER * emSize;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fill(new Path2D(g.d));
  ctx.restore();
}

// Draw a moon phase SVG image centred at (cx, cy), size in world units.
function _drawMoon(ctx, octant, cx, cy, size) {
  const img = MOON_IMAGES[octant];
  if (!img || !img.complete || !img.naturalWidth) return;
  ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
}

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

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun',
                     'Jul','Aug','Sep','Oct','Nov','Dec'];

// Zodiac sign symbols, indexed by mTropicalPhase (0–11).
// \uFE0E (text variation selector) forces monochrome text rendering on phones.
const SIGN_SYMBOL = ['♈\uFE0E','♉\uFE0E','♊\uFE0E','♋\uFE0E','♌\uFE0E','♍\uFE0E',
                     '♎\uFE0E','♏\uFE0E','♐\uFE0E','♑\uFE0E','♒\uFE0E','♓\uFE0E'];

// Moon phase symbols, indexed by octant 0–7 (Astro.moonPhase_().p).
// Note: mLunarPhase is quarter (0–3); use Astro.moonPhase_() for the full 8-value index.
const MOON_SYMBOL = ['🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘'];

// Moon Phases - Text (monochrome Unicode)
const moonPhasesText  = ['◯','◐','◑','●','◕','◔','◓','◒'];

// Moon Phases - Emoji (color)
const moonPhasesEmoji = ['🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘'];

// Zodiac Signs - Text (monochrome Unicode, \uFE0E forces text presentation)
const zodiacText  = ['♈\uFE0E','♉\uFE0E','♊\uFE0E','♋\uFE0E','♌\uFE0E','♍\uFE0E',
                     '♎\uFE0E','♏\uFE0E','♐\uFE0E','♑\uFE0E','♒\uFE0E','♓\uFE0E'];

// Zodiac Signs - Emoji (color)
const zodiacEmoji = ['♈️','♉️','♊️','♋️','♌️','♍️','♎️','♏️','♐️','♑️','♒️','♓️'];

// Zodiac Sign Names
const zodiacNames = [
  'Aries', 'Taurus', 'Gemini', 'Cancer',
  'Leo', 'Virgo', 'Libra', 'Scorpio',
  'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

// Moon Phase Names
const moonPhaseNames = [
  'New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous',
  'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent',
];

// Full parallelogram path at (x, y).
// Width 0.5, height 0.5, left edge slants 1/6 leftward per row.
function pgram(ctx, x, y) {
  ctx.beginPath();
  ctx.moveTo(x,                y);
  ctx.lineTo(x + 0.5,          y);
  ctx.lineTo(x + 0.5 - (1/6), y + 0.5);
  ctx.lineTo(x       - (1/6), y + 0.5);
  ctx.closePath();
}

class CalendarDate {
  constructor(date) {
    // Normalise to local midnight.
    this._today = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    const tomorrow = Astro.endOfDay(this._today);

    // End-of-day astronomical values (drive color, layout, season boundary).
    this.mTropicalPhase = Astro.sign(tomorrow);
    this.mLunarPhase    = Astro.moonPhase(tomorrow);
    this.mSeason        = Astro.season(tomorrow);

    // Start-of-day sign — used as the left color when a split occurs.
    this.mSignStart = Astro.sign(this._today);

    // If the sign changes during the day, find exactly when (fraction 0–1).
    this.mSplitFraction = (this.mSignStart !== this.mTropicalPhase)
      ? this._findSplitFraction()
      : null;

    // Display label.
    const dom = this._today.getDate();
    if (dom === 1) {
      this.mDate = MONTH_NAMES[this._today.getMonth()];
      this.mBold = true;
    } else {
      this.mDate = String(dom);
      this.mBold = false;
    }

    this.mIsSunday    = this._today.getDay() === 0;
    this.mNewMoonWeek = this._newMoonWeek();

    // Placed by next() or constructSeason.
    this.mPlace = { x: 0, y: 0 };
    // Set by next() when this day starts or ends a lunar phase.
    this.mIsPhaseStart  = false;
    this.mIsPhaseEnd    = false;
    this.mPhaseFraction = null;
  }

  // Binary search: find the fraction (0–1) of the day when the lunar phase changes.
  // 20 iterations → precision of 86400 / 2^20 ≈ 0.08 s.
  _findPhaseFraction() {
    const startMs  = this._today.getTime();
    const oldPhase = (this.mLunarPhase + 3) % 4;
    let lo = 0, hi = 1;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (Astro.moonPhase(new Date(startMs + mid * 86400000)) === oldPhase) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return (lo + hi) / 2;
  }

  // Binary search: find the fraction (0–1) of the day when the sign changes.
  // 20 iterations → precision of 86400 / 2^20 ≈ 0.08 s.
  _findSplitFraction() {
    const startMs = this._today.getTime();
    let lo = 0, hi = 1;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (Astro.sign(new Date(startMs + mid * 86400000)) === this.mSignStart) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return (lo + hi) / 2;
  }

  get date()        { return this._today; }
  get leftPoint()   { return this.mPlace.x - (1/6); }
  get rightPoint()  { return this.mPlace.x + 0.5; }
  get topPoint()    { return this.mPlace.y; }
  get bottomPoint() { return this.mPlace.y + 0.5; }
  get season()      { return this.mSeason; }
  get lunarPhase()  { return this.mLunarPhase; }

  next() {
    const next = new CalendarDate(new Date(this._today.getFullYear(), this._today.getMonth(), this._today.getDate() + 1));
    if (this.lunarPhase === next.lunarPhase) {
      next.mPlace = { x: this.mPlace.x + 0.5,   y: this.mPlace.y };
    } else {
      this.mIsPhaseEnd    = true;
      next.mIsPhaseStart  = true;
      next.mPhaseFraction = next._findPhaseFraction();
      next.mPlace = { x: this.mPlace.x - 19/6,  y: this.mPlace.y + 0.5 };
    }
    return next;
  }

  _newMoonWeek() {
    const sixDaysAgo = new Date(this._today.getTime() - 6 * 86400000);
    if (this.mSeason === Astro.season(sixDaysAgo)) {
      if (this.mLunarPhase === 0 && Astro.moonPhase(sixDaysAgo) === 3) {
        return true;
      }
    }
    return false;
  }

  render(ctx, ox, oy) {
    const x = ox + this.mPlace.x;
    const y = oy + this.mPlace.y;

    ctx.save();

    // ── Fill ────────────────────────────────────────────────────────────────
    if (splitDays && this.mSplitFraction !== null) {
      // Split the parallelogram along a line parallel to its left/right edges.
      // At fraction t, the split line runs from (x + 0.5t, y) top to
      // (x - 1/6 + 0.5t, y + 0.5) bottom — preserving the 1/6 slant.
      const t  = this.mSplitFraction;
      const tx = x + 0.5 * t;          // split x on top edge
      const bx = x - (1/6) + 0.5 * t; // split x on bottom edge

      // Left piece — sign before the transition.
      ctx.beginPath();
      ctx.moveTo(x,       y);
      ctx.lineTo(tx,      y);
      ctx.lineTo(bx,      y + 0.5);
      ctx.lineTo(x-(1/6), y + 0.5);
      ctx.closePath();
      ctx.fillStyle = SIGN_COLOR[this.mSignStart];
      ctx.fill();

      // Right piece — sign after the transition.
      ctx.beginPath();
      ctx.moveTo(tx,           y);
      ctx.lineTo(x + 0.5,      y);
      ctx.lineTo(x+0.5-(1/6),  y + 0.5);
      ctx.lineTo(bx,           y + 0.5);
      ctx.closePath();
      ctx.fillStyle = SIGN_COLOR[this.mTropicalPhase];
      ctx.fill();
    } else {
      pgram(ctx, x, y);
      ctx.fillStyle = SIGN_COLOR[this.mTropicalPhase];
      ctx.fill();
    }

    // ── Outline (always the full parallelogram) ──────────────────────────────
    pgram(ctx, x, y);
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 1 / 96;
    ctx.stroke();

    // ── New moon week marker ─────────────────────────────────────────────────
    if (this.mNewMoonWeek) {
      ctx.beginPath();
      ctx.moveTo(x,       y);
      ctx.lineTo(x + 0.5, y);
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 1 / 18;
      ctx.stroke();
    }

    // ── Phase-start triangle (new moon, first quarter, last quarter) ─────────
    if (phaseTicks && this.mIsPhaseStart) {
      const base = 1 / 18;
      const h    = 2 / 18;
      const cx   = x + 0.5 * this.mPhaseFraction;
      ctx.beginPath();
      ctx.moveTo(cx - base / 2, y);
      ctx.lineTo(cx + base / 2, y);
      ctx.lineTo(cx,            y + h);
      ctx.closePath();
      ctx.fillStyle = 'black';
      ctx.fill();
    }

    // ── Date label / sign symbol ─────────────────────────────────────────────
    const cx = x + 1/6;   // horizontal centre of cell
    const cy = y + 0.25;  // vertical centre of cell
    ctx.fillStyle = this.mIsSunday ? 'red' : 'black';

    if (showSignSymbols && this.mSplitFraction !== null) {
      // Zodiac sign symbol via Path2D (replaces date number on sign-change days).
      _drawZodiacPath(ctx, this.mTropicalPhase, cx, cy - 0.05, 0.42);
    } else if (this.mBold) {
      // First of month: bold all-small-caps month abbreviation via Path2D (browser-consistent).
      _drawMonth(ctx, this.mDate, cx, cy, 0.24);
    } else {
      // Date number via EB Garamond old-style Path2D.
      _drawDigits(ctx, this.mDate, false, cx, cy - 0.03, 0.36);
    }

    // ── Moon phase symbols (Noto emoji SVGs, left/right of cell) ────────────
    // Phase start: opening octant at left edge; phase end: closing octant at right.
    if (showMoonSymbols) {
      const moonSize = 0.15;
      // Tangent to the diagonal edge of the parallelogram cell.
      // The left edge goes from (x, y) to (x-1/6, y+0.5); its line equation is
      // 3px + py = 3x + y.  Distance from centre to line = moonSize/2 gives:
      //   left tangent:  cx = x - 1/12 - moonSize * sqrt(10)/6
      //   right tangent: cx = x + 5/12 + moonSize * sqrt(10)/6
      const S10_6 = Math.sqrt(10) / 6;  // ≈ 0.527
      if (this.mIsPhaseStart) {
        _drawMoon(ctx, this.mLunarPhase * 2,     x - 1/12 - moonSize * S10_6, cy, moonSize);
      } else if (this.mIsPhaseEnd) {
        _drawMoon(ctx, this.mLunarPhase * 2 + 1, x + 5/12 + moonSize * S10_6, cy, moonSize);
      }
    }

    ctx.restore();
  }
}
