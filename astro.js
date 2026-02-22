// astro.js — Port of AstroDate.java
// All pure astronomical math, no dependencies.

const RADS = Math.PI / 180.0;
const TPI  = Math.PI * 2.0;
const SMALL_FLOAT = 1e-12;

const Astro = {

  // Returns timezone offset in minutes (positive = west of UTC, like Java's behavior)
  toUtcMinutes(date) {
    // JS getTimezoneOffset() returns minutes west of UTC (positive for west)
    // Java's getRawOffset() returns milliseconds east of UTC
    // We need to negate to match Java behavior: Java returns -offset/60000
    return date.getTimezoneOffset();
  },

  // J2000 epoch: days since Jan 1, 2000 noon UTC
  epoch2000Date(date) {
    const year   = date.getFullYear();
    const month  = date.getMonth() + 1;  // 1-indexed
    const day    = date.getDate();
    const hour   = date.getHours();
    const minute = date.getMinutes();

    const j_day = 367 * year -
      Math.trunc(7 * (year + Math.trunc((month + 9) / 12)) / 4) +
      Math.trunc(275 * month / 9) + day;

    let j2000 = j_day - 730531.5 + hour / 24.0 + minute / (24 * 60.0);
    j2000 += this.toUtcMinutes(date) / (24.0 * 60.0);
    return j2000;
  },

  // Normalize angle to [0, 2π)
  range(x) {
    const b    = x / TPI;
    const norm = Math.sign(b) * Math.abs(b);
    let a      = TPI * (b - Math.sign(b) * Math.floor(Math.abs(b)));
    if (a < 0) a = TPI + a;
    return a;
  },

  // Ecliptic longitude of the sun from J2000 day
  sun(day) {
    const longitude = this.range(280.461 * RADS + 0.9856474 * RADS * day);
    const g         = this.range(357.528 * RADS + 0.9856003 * RADS * day);
    return this.range(longitude + 1.915 * RADS * Math.sin(g) + 0.02 * RADS * Math.sin(2 * g));
  },

  // Sun angle for a JS Date
  sunAngle(date) {
    return this.sun(this.epoch2000Date(date));
  },

  // Season: 0=spring, 1=summer, 2=autumn, 3=winter
  season(date) {
    return Math.trunc(this.sunAngle(date) / TPI * 4.0);
  },

  // Zodiac sign: 0=Aries ... 11=Pisces
  sign(date) {
    return Math.trunc(this.sunAngle(date) / TPI * 12.0);
  },

  // Julian Day Number
  julian(y, m, day) {
    let year = y, month = m, b = 0;
    if (month < 3) { year--; month += 12; }
    if (year > 1582 || (year === 1582 && month > 10) ||
        (year === 1582 && month === 10 && day > 15)) {
      const a = Math.trunc(year / 100);
      b = 2 - a + Math.trunc(a / 4);
    }
    const c = Math.trunc(365.25 * year);
    const e = Math.trunc(30.6001 * (month + 1));
    return b + c + e + day + 1720994.5;
  },

  // Detailed sun position (degrees)
  sunPosition(j) {
    let n = 360 / 365.2422 * j;
    let i = Math.trunc(n / 360);
    n = n - i * 360.0;
    let x = n - 3.762863;
    if (x < 0) x += 360;
    x *= RADS;
    let e = x;
    let dl;
    do {
      dl = e - 0.016718 * Math.sin(e) - x;
      e  = e - dl / (1 - 0.016718 * Math.cos(e));
    } while (Math.abs(dl) >= SMALL_FLOAT);
    let v = 360 / Math.PI * Math.atan(1.01686011182 * Math.tan(e / 2));
    let l = v + 282.596403;
    i = Math.trunc(l / 360);
    l = l - i * 360.0;
    return l;
  },

  // Moon position (degrees)
  moonPosition(j, ls) {
    let ms = 0.985647332099 * j - 3.762863;
    if (ms < 0) ms += 360.0;
    let l = 13.176396 * j + 64.975464;
    let i = Math.trunc(l / 360);
    l = l - i * 360.0;
    if (l < 0) l += 360.0;
    let mm = l - 0.1114041 * j - 349.383063;
    i  = Math.trunc(mm / 360);
    mm -= i * 360.0;
    let n = 151.950429 - 0.0529539 * j;
    i  = Math.trunc(n / 360);
    n -= i * 360.0;
    const ev  = 1.2739 * Math.sin((2 * (l - ls) - mm) * RADS);
    const sms = Math.sin(ms * RADS);
    const ae  = 0.1858 * sms;
    mm += ev - ae - 0.37 * sms;
    const ec = 6.2886 * Math.sin(mm * RADS);
    l += ev + ec - ae + 0.214 * Math.sin(2 * mm * RADS);
    l  = 0.6583 * Math.sin(2 * (l - ls) * RADS) + l;
    return l;
  },

  // Internal: returns { p, phase, percent }
  // p = phase octant 0-7, phase = angle 0-360, percent = illumination 0-1
  moonPhase_(dt) {
    const year   = dt.getFullYear();
    const month  = dt.getMonth() + 1;
    const day    = dt.getDate();
    const hour   = dt.getHours();
    const minute = dt.getMinutes();

    const j = this.julian(year, month,
      day + (hour + minute / 60.0) / 24.0 - 2444238.5);
    const jUtc = j + this.toUtcMinutes(dt) / (60.0 * 24.0);

    const ls = this.sunPosition(jUtc);
    const lm = this.moonPosition(jUtc, ls);
    let t = lm - ls;
    if (t < 0) t += 360;

    const p       = Math.trunc((t + 22.5) / 45) & 0x7;
    const phase   = t;
    const percent = (1.0 - Math.cos((lm - ls) * RADS)) / 2;

    return { p, phase, percent };
  },

  // Phase angle 0–360
  phase(date) {
    return this.moonPhase_(date).phase % 360.0;
  },

  // Illumination fraction 0–1
  percent(date) {
    return this.moonPhase_(date).percent;
  },

  // Moon phase quarter: 0=new, 1=first quarter, 2=full, 3=last quarter
  moonPhase(date) {
    return Math.trunc(this.phase(date) / 90.0);
  },

  // Returns a new Date at midnight + 24h (end of given day)
  endOfDay(day) {
    const d = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    return new Date(d.getTime() + 86400000);
  },

};
