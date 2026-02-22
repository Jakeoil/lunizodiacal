// calendarDate.js — Port of CalendarDate.java
// Rendering via Canvas 2D API. Depends on astro.js (Astro object).

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

// Draw the parallelogram path at (x,y) in canvas coordinate space.
// Each cell is 0.5 wide, 0.5 tall, with 1/6 horizontal skew per row.
function pgram(ctx, x, y) {
  ctx.beginPath();
  ctx.moveTo(x,                 y);
  ctx.lineTo(x + 0.5,           y);
  ctx.lineTo(x + 0.5 - (1/6),  y + 0.5);
  ctx.lineTo(x       - (1/6),  y + 0.5);
  ctx.closePath();
}

class CalendarDate {
  constructor(date) {
    // date is a plain JS Date; normalise to midnight local
    this._today = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    // Compute astronomical values at end-of-day (tomorrow midnight)
    const tomorrow = Astro.endOfDay(this._today);

    this.mTropicalPhase = Astro.sign(tomorrow);
    this.mLunarPhase    = Astro.moonPhase(tomorrow);
    this.mSeason        = Astro.season(tomorrow);

    // Label: abbreviated month name on the 1st, day number otherwise
    const dom = this._today.getDate();
    if (dom === 1) {
      this.mDate  = MONTH_NAMES[this._today.getMonth()];
      this.mBold  = true;
    } else {
      this.mDate  = String(dom);
      this.mBold  = false;
    }

    this.mIsSunday    = this._today.getDay() === 0;
    this.mNewMoonWeek = this._newMoonWeek();

    // mPlace is set externally by next() or constructSeason
    this.mPlace = { x: 0, y: 0 };
  }

  // Getters matching the Java API
  get leftPoint()   { return this.mPlace.x - (1/6); }
  get rightPoint()  { return this.mPlace.x + 0.5; }
  get topPoint()    { return this.mPlace.y; }
  get bottomPoint() { return this.mPlace.y + 0.5; }
  get season()      { return this.mSeason; }
  get lunarPhase()  { return this.mLunarPhase; }

  // Returns the next CalendarDate with mPlace computed relative to this one
  next() {
    const tomorrow = new Date(this._today.getTime() + 86400000);
    const next = new CalendarDate(tomorrow);

    if (this.lunarPhase === next.lunarPhase) {
      // Same phase quarter: advance right on same row
      next.mPlace = { x: this.mPlace.x + 0.5, y: this.mPlace.y };
    } else {
      // New phase quarter: drop a row, move left
      next.mPlace = { x: this.mPlace.x - 19/6, y: this.mPlace.y + 0.5 };
    }
    return next;
  }

  // True if this day is in the week that contains a new moon
  _newMoonWeek() {
    const sixDaysAgo = new Date(this._today.getTime() - 6 * 86400000);
    if (this.mSeason === Astro.season(sixDaysAgo)) {
      if (this.mLunarPhase === 0) {
        if (Astro.moonPhase(sixDaysAgo) === 3) {
          return true;
        }
      }
    }
    return false;
  }

  // Draw this cell on ctx, offset by (ox, oy) in world-space units
  render(ctx, ox, oy) {
    const x = ox + this.mPlace.x;
    const y = oy + this.mPlace.y;

    ctx.save();

    // Fill
    pgram(ctx, x, y);
    ctx.fillStyle = SIGN_COLOR[this.mTropicalPhase];
    ctx.fill();

    // Outline
    pgram(ctx, x, y);
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 1 / 96;
    ctx.stroke();

    // New moon week marker — thick line across the top edge
    if (this.mNewMoonWeek) {
      ctx.beginPath();
      ctx.moveTo(x,       y);
      ctx.lineTo(x + 0.5, y);
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 1 / 18;
      ctx.stroke();
    }

    // Date label
    ctx.font = (this.mBold ? 'bold ' : '') + '0.25px Cambria, Georgia, serif';
    ctx.fillStyle = this.mIsSunday ? 'red' : 'black';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Centre of cell: x + 1/6 horizontally (centroid of parallelogram), y + 0.25 vertically
    ctx.fillText(this.mDate, x + (1/6), y + 0.25);

    ctx.restore();
  }
}
