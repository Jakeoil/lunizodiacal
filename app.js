// app.js — Port of TroLunViewer.java
// Orchestrates rendering, pan, season navigation, and date picker.
// Depends on astro.js and calendarDate.js.

(function () {
  'use strict';

  const HEADER_HEIGHT = 44;   // px; matches #header height in style.css

  const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'];

  // ── Canvas setup ──────────────────────────────────────────────────────────

  const canvas = document.getElementById('calendar');
  const ctx    = canvas.getContext('2d');

  function resizeCanvas() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight - HEADER_HEIGHT;
    // Re-fit after resize; centreOnSeason recomputes scaling from bounds.
    if (seasonCalendar.length > 0) centreOnSeason();
    markDirty();
  }

  window.addEventListener('resize', resizeCanvas);

  // ── State ─────────────────────────────────────────────────────────────────

  let scaling        = 1;
  let offsetX        = 0;
  let offsetY        = 0;
  let targetDate     = new Date();
  let seasonCalendar = [];
  let bounds         = { top: 0, left: 0, bottom: 0, right: 0 };

  // ── Season construction ───────────────────────────────────────────────────

  function findFirstInSeason(date) {
    let d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const targetSeason = Astro.season(Astro.endOfDay(d));
    for (let i = 0; i < 200; i++) {
      d = new Date(d.getTime() - 86400000);
      if (Astro.season(Astro.endOfDay(d)) !== targetSeason) {
        return new Date(d.getTime() + 86400000);
      }
    }
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function constructSeason(date) {
    seasonCalendar = [];

    const first = findFirstInSeason(date);
    let current  = new CalendarDate(first);
    current.mPlace = { x: 0, y: 0 };

    const targetSeason = current.season;

    bounds = { top: Infinity, left: Infinity, bottom: -Infinity, right: -Infinity };

    for (let i = 0; i < 200; i++) {
      if (current.season !== targetSeason) break;

      seasonCalendar.push(current);
      bounds.top    = Math.min(bounds.top,    current.topPoint);
      bounds.left   = Math.min(bounds.left,   current.leftPoint);
      bounds.bottom = Math.max(bounds.bottom, current.bottomPoint);
      bounds.right  = Math.max(bounds.right,  current.rightPoint);

      current = current.next();
    }
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  let dirty = false;

  function markDirty() {
    if (!dirty) {
      dirty = true;
      requestAnimationFrame(draw);
    }
  }

  function draw() {
    dirty = false;

    ctx.setTransform(scaling, 0, 0, scaling, offsetX, offsetY);

    const invScale = 1 / scaling;
    ctx.clearRect(
      -offsetX * invScale,
      -offsetY * invScale,
      canvas.width  * invScale,
      canvas.height * invScale
    );

    const margin = 0.25;
    const ox = margin - bounds.left;
    const oy = 0.5;

    for (const day of seasonCalendar) {
      day.render(ctx, ox, oy);
    }
  }

  // ── Season load ───────────────────────────────────────────────────────────

  // Scale and position so the full season fits in the canvas with small margins.
  function centreOnSeason() {
    // Vertical: fit the season height (plus 0.5 top + 0.5 bottom margin) to canvas.
    const worldH = (bounds.bottom - bounds.top) + 1.0;
    scaling = canvas.height / worldH;

    // Align top-left of season grid to the margin.
    offsetX = (0.25 - bounds.left) * scaling;
    offsetY = 0.5 * scaling;
  }

  function updateHeader() {
    if (seasonCalendar.length === 0) return;
    const first  = seasonCalendar[0];
    const season = first.season;
    const year   = first.date.getFullYear();
    // Winter spans two calendar years — show both with a slash.
    const yearStr = (season === 3) ? `${year}\u2009/\u2009${year + 1}` : String(year);
    document.getElementById('season-label').textContent =
      `${SEASON_NAMES[season]}  ${yearStr}`;
  }

  function loadSeason(date) {
    try {
      targetDate = date;
      constructSeason(targetDate);
      centreOnSeason();
      updateHeader();
      markDirty();
    } catch (err) {
      console.error('loadSeason failed:', err);
    }
  }

  // ── Mouse pan ─────────────────────────────────────────────────────────────

  let isDragging     = false;
  let dragStartX     = 0;
  let dragStartY     = 0;
  let dragTotalMoved = 0;
  let lastClickTime  = 0;

  canvas.addEventListener('mousedown', (e) => {
    if (!overlay.classList.contains('hidden')) { hideOverlay(); return; }
    isDragging     = true;
    dragStartX     = e.clientX;
    dragStartY     = e.clientY;
    dragTotalMoved = 0;
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    dragTotalMoved += Math.abs(dx) + Math.abs(dy);
    offsetX += dx;
    offsetY += dy;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    markDirty();
  });

  canvas.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    if (dragTotalMoved < 5) handleTap();
  });

  canvas.addEventListener('mouseleave', () => { isDragging = false; });

  // ── Touch: single-finger drag ─────────────────────────────────────────────

  let touchStartTime = 0;
  let touchMoved     = 0;
  let touchDragX     = 0;
  let touchDragY     = 0;

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (e.touches.length !== 1) return;
    touchStartTime = Date.now();
    touchMoved     = 0;
    touchDragX     = e.touches[0].clientX;
    touchDragY     = e.touches[0].clientY;
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - touchDragX;
    const dy = e.touches[0].clientY - touchDragY;
    touchMoved += Math.abs(dx) + Math.abs(dy);
    offsetX += dx;
    offsetY += dy;
    touchDragX = e.touches[0].clientX;
    touchDragY = e.touches[0].clientY;
    markDirty();
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (e.touches.length === 0 && Date.now() - touchStartTime < 200 && touchMoved < 5) {
      handleTap();
    }
  }, { passive: false });

  // ── Season navigation ─────────────────────────────────────────────────────

  function handleTap() {
    const now      = Date.now();
    const isDouble = (now - lastClickTime) < 300;
    lastClickTime  = now;

    if (isDouble) {
      const d = new Date(targetDate);
      d.setMonth(d.getMonth() - 3);
      loadSeason(d);
    } else {
      setTimeout(() => {
        if (Date.now() - lastClickTime >= 290) {
          const d = new Date(targetDate);
          d.setMonth(d.getMonth() + 3);
          loadSeason(d);
        }
      }, 310);
    }
  }

  // ── Date picker overlay ───────────────────────────────────────────────────

  const overlay      = document.getElementById('picker-overlay');
  const dateInput    = document.getElementById('date-input');
  const todayBtn     = document.getElementById('today-btn');
  const goBtn        = document.getElementById('go-btn');
  const openBtn      = document.getElementById('open-picker');
  const closeBtn     = document.getElementById('close-picker');
  const splitDaysChk = document.getElementById('split-days');

  function showOverlay() { overlay.classList.remove('hidden'); }
  function hideOverlay()  { overlay.classList.add('hidden');    }

  function formatDateValue(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function parseDateValue(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  todayBtn.addEventListener('click', () => {
    const today = new Date();
    dateInput.value = formatDateValue(today);
    loadSeason(today);
    hideOverlay();
  });

  goBtn.addEventListener('click', () => {
    if (dateInput.value) loadSeason(parseDateValue(dateInput.value));
    hideOverlay();
  });

  closeBtn.addEventListener('click', hideOverlay);
  openBtn.addEventListener('click', showOverlay);

  // splitDays is declared in calendarDate.js; toggling only needs a redraw.
  splitDaysChk.addEventListener('change', () => {
    splitDays = splitDaysChk.checked;
    markDirty();
  });

  dateInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') goBtn.click();
  });

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  resizeCanvas();
  dateInput.value = formatDateValue(targetDate);
  loadSeason(targetDate);
  showOverlay();

}());
