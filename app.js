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

  let scaling          = 1;
  let offsetX          = 0;
  let offsetY          = 0;
  let targetDate       = new Date();
  let seasonCalendar   = [];
  let seasonBoundaries = [];   // [{y, season, year}] dividers between seasons
  let viewSeasons      = 1;    // 1 = one season, 4 = full year
  let bounds           = { top: 0, left: 0, bottom: 0, right: 0 };

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
    seasonCalendar   = [];
    seasonBoundaries = [];

    const first = findFirstInSeason(date);
    let current  = new CalendarDate(first);
    current.mPlace = { x: 0, y: 0 };

    let trackSeason  = current.season;
    let seasonsBuilt = 1;

    bounds = { top: Infinity, left: Infinity, bottom: -Infinity, right: -Infinity };

    for (let i = 0; i < viewSeasons * 120; i++) {
      if (current.season !== trackSeason) {
        if (seasonsBuilt >= viewSeasons) break;
        seasonsBuilt++;
        seasonBoundaries.push({ y: current.mPlace.y, season: current.season, year: current.date.getFullYear() });
        trackSeason = current.season;
      }

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

    // Season boundary dividers (year view)
    if (seasonBoundaries.length > 0) {
      const x0 = bounds.left + ox - 0.3;
      const x1 = bounds.right + ox + 0.3;
      ctx.save();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.lineWidth   = 2 / scaling;
      ctx.setLineDash([8 / scaling, 6 / scaling]);
      ctx.font         = '0.28px Georgia, serif';
      ctx.fillStyle    = 'rgba(40, 40, 40, 0.7)';
      ctx.textBaseline = 'bottom';
      ctx.textAlign    = 'left';
      for (const sb of seasonBoundaries) {
        const ly = sb.y + oy;
        ctx.beginPath();
        ctx.moveTo(x0, ly);
        ctx.lineTo(x1, ly);
        ctx.stroke();
        ctx.fillText(`${SEASON_NAMES[sb.season]}  ${sb.year}`, x0 + 0.1, ly - 0.04);
      }
      ctx.restore();
    }

    for (const day of seasonCalendar) {
      day.render(ctx, ox, oy);
    }
  }

  // ── Season load ───────────────────────────────────────────────────────────

  // Scale and position so the full season fits in the canvas with small margins.
  function centreOnSeason() {
    const worldW = bounds.right - bounds.left;
    const worldH = (bounds.bottom - bounds.top) + 1.0;

    // Use whichever dimension is the tighter constraint, then pull back slightly.
    const scaleH = canvas.height / worldH;
    const scaleW = canvas.width  / (worldW + 0.5);  // 0.25 margin each side
    scaling = Math.min(scaleH, scaleW) * 0.93;

    // Centre horizontally, accounting for the 0.25-margin ox shift in draw().
    offsetX = canvas.width  / 2 - (0.25 + worldW / 2) * scaling;

    // Top of season at half a cell height (0.25 world units) from the top edge.
    // First cell's effective world y = oy(0.5) + bounds.top; pin that to 0.25*scaling px.
    offsetY = (-0.25 - bounds.top) * scaling;
  }

  function updateHeader() {
    if (seasonCalendar.length === 0) return;
    const first = seasonCalendar[0];
    const last  = seasonCalendar[seasonCalendar.length - 1];
    if (viewSeasons > 1) {
      const y1 = first.date.getFullYear();
      const y2 = last.date.getFullYear();
      document.getElementById('season-label').textContent =
        y1 === y2 ? String(y1) : `${y1}\u2009–\u2009${y2}`;
    } else {
      const season  = first.season;
      const year    = first.date.getFullYear();
      const yearStr = (season === 3) ? `${year}\u2009/\u2009${year + 1}` : String(year);
      document.getElementById('season-label').textContent = `${SEASON_NAMES[season]}  ${yearStr}`;
    }
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

  // ── Mouse wheel zoom ───────────────────────────────────────────────────────

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    // Zoom centred on cursor (offsetX/Y are canvas-relative; canvas left=0, top=HEADER_HEIGHT).
    const cx = e.clientX;
    const cy = e.clientY - HEADER_HEIGHT;
    offsetX = cx - (cx - offsetX) * factor;
    offsetY = cy - (cy - offsetY) * factor;
    scaling *= factor;
    markDirty();
  }, { passive: false });

  // ── Touch: single-finger pan + two-finger pinch-zoom ──────────────────────

  let touchStartTime = 0;
  let touchMoved     = 0;
  let touchDragX     = 0;
  let touchDragY     = 0;
  let isPinching     = false;
  let pinchDist      = 0;
  let pinchMidX      = 0;
  let pinchMidY      = 0;

  function getTouchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (e.touches.length === 2) {
      isPinching = true;
      pinchDist = getTouchDist(e.touches);
      pinchMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      pinchMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - HEADER_HEIGHT;
      return;
    }
    if (e.touches.length !== 1) return;
    isPinching     = false;
    touchStartTime = Date.now();
    touchMoved     = 0;
    touchDragX     = e.touches[0].clientX;
    touchDragY     = e.touches[0].clientY;
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 2) {
      const newDist = getTouchDist(e.touches);
      const newMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const newMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - HEADER_HEIGHT;
      if (!isPinching) {
        // Second finger arrived; initialise without applying to avoid a jump.
        isPinching = true;
        pinchDist  = newDist;
        pinchMidX  = newMidX;
        pinchMidY  = newMidY;
        return;
      }
      const factor = newDist / pinchDist;
      // Zoom centred on pinch midpoint, then translate by midpoint shift.
      offsetX = newMidX - (pinchMidX - offsetX) * factor;
      offsetY = newMidY - (pinchMidY - offsetY) * factor;
      scaling *= factor;
      pinchDist = newDist;
      pinchMidX = newMidX;
      pinchMidY = newMidY;
      markDirty();
      return;
    }
    if (e.touches.length !== 1 || isPinching) return;
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
    if (e.touches.length < 2) isPinching = false;
    if (e.touches.length === 0 && !isPinching &&
        Date.now() - touchStartTime < 200 && touchMoved < 5) {
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

  const overlay        = document.getElementById('picker-overlay');
  const dateInput      = document.getElementById('date-input');
  const todayBtn       = document.getElementById('today-btn');
  const goBtn          = document.getElementById('go-btn');
  const openBtn        = document.getElementById('open-picker');
  const closeBtn       = document.getElementById('close-picker');
  const splitDaysChk   = document.getElementById('split-days');
  const phaseTicksChk  = document.getElementById('phase-ticks');
  const moonSymbolsChk = document.getElementById('moon-symbols');
  const signSymbolsChk = document.getElementById('sign-symbols');
  const viewModeSelect = document.getElementById('view-mode');

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
  document.getElementById('app-title').addEventListener('click', () => window.location.reload());

  viewModeSelect.addEventListener('change', () => {
    viewSeasons = parseInt(viewModeSelect.value, 10);
    loadSeason(targetDate);
    hideOverlay();
  });

// splitDays and phaseTicks are declared in calendarDate.js; toggling only needs a redraw.
  splitDaysChk.addEventListener('change', () => {
    splitDays = splitDaysChk.checked;
    markDirty();
  });

  phaseTicksChk.addEventListener('change', () => {
    phaseTicks = phaseTicksChk.checked;
    markDirty();
  });

  moonSymbolsChk.addEventListener('change', () => {
    showMoonSymbols = moonSymbolsChk.checked;
    markDirty();
  });

  signSymbolsChk.addEventListener('change', () => {
    showSignSymbols = signSymbolsChk.checked;
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

  // Redraw once EB Garamond is loaded (month labels) and moon SVGs are ready.
  Promise.all([
    document.fonts.ready,
    ...MOON_IMAGES.map(img => new Promise(r => {
      if (img.complete && img.naturalWidth) r();
      else { img.addEventListener('load', r); img.addEventListener('error', r); }
    })),
  ]).then(() => markDirty());

}());
