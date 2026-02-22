// app.js — Port of TroLunViewer.java
// Orchestrates rendering, pan/zoom, season navigation, and date picker.
// Depends on astro.js and calendarDate.js.

(function () {
  'use strict';

  // ── Canvas setup ──────────────────────────────────────────────────────────

  const canvas = document.getElementById('calendar');
  const ctx    = canvas.getContext('2d');

  function resizeCanvas() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    // Re-establish default scale when window is resized
    scaling = canvas.width / 5;
    markDirty();
  }

  window.addEventListener('resize', resizeCanvas);

  // ── State ─────────────────────────────────────────────────────────────────

  let scaling  = 1;          // pixels per world-unit (initialised after resize)
  let offsetX  = 0;          // canvas-space translation X
  let offsetY  = 0;          // canvas-space translation Y

  let targetDate     = new Date();
  let seasonCalendar = [];   // CalendarDate[]
  let bounds         = { top: 0, left: 0, bottom: 0, right: 0 };

  // ── Season construction ───────────────────────────────────────────────────

  // Walk backward until the season changes; return the first day of this season.
  function findFirstInSeason(date) {
    let d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const seasonOfDay = Astro.season(Astro.endOfDay(d));
    while (Astro.season(Astro.endOfDay(d)) === seasonOfDay) {
      d = new Date(d.getTime() - 86400000);
    }
    // d is now one day before the season started; advance by one
    return new Date(d.getTime() + 86400000);
  }

  function constructSeason(date) {
    seasonCalendar = [];

    const first = findFirstInSeason(date);
    let current  = new CalendarDate(first);
    current.mPlace = { x: 0, y: 0 };

    const targetSeason = current.season;

    bounds.top    =  Infinity;
    bounds.left   =  Infinity;
    bounds.bottom = -Infinity;
    bounds.right  = -Infinity;

    while (current.season === targetSeason) {
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

    // Clear in world-space (inverse-transform the viewport rect)
    const invScale = 1 / scaling;
    ctx.clearRect(
      -offsetX * invScale,
      -offsetY * invScale,
      canvas.width  * invScale,
      canvas.height * invScale
    );

    // Small left margin so the leftmost column isn't clipped
    const margin = 0.25;
    const ox = margin - bounds.left;
    const oy = 0.5;

    for (const day of seasonCalendar) {
      day.render(ctx, ox, oy);
    }
  }

  // ── Initial layout ────────────────────────────────────────────────────────

  function centreOnSeason() {
    // Place the top-left of the grid near the top-left of the viewport
    const margin = 0.25;
    offsetX = margin * scaling;
    offsetY = 0.5  * scaling;
  }

  function loadSeason(date) {
    targetDate = date;
    constructSeason(targetDate);
    centreOnSeason();
    markDirty();
  }

  // ── Mouse pan & click ─────────────────────────────────────────────────────

  let isDragging     = false;
  let dragStartX     = 0;
  let dragStartY     = 0;
  let dragTotalMoved = 0;
  let lastClickTime  = 0;

  canvas.addEventListener('mousedown', (e) => {
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

  canvas.addEventListener('mouseup', (e) => {
    if (!isDragging) return;
    isDragging = false;

    if (dragTotalMoved < 5) {
      // Treat as a click
      handleTap();
    }
  });

  canvas.addEventListener('mouseleave', () => { isDragging = false; });

  // ── Mouse wheel zoom ──────────────────────────────────────────────────────

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const oldScale = scaling;
    const newScale = Math.max(20, Math.min(2000,
      scaling * (1 - e.deltaY * 0.001)
    ));
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    offsetX = mouseX - (mouseX - offsetX) * newScale / oldScale;
    offsetY = mouseY - (mouseY - offsetY) * newScale / oldScale;
    scaling = newScale;
    markDirty();
  }, { passive: false });

  // ── Touch: drag & pinch ───────────────────────────────────────────────────

  let touchStartX    = 0;
  let touchStartY    = 0;
  let touchMoved     = 0;
  let touchStartTime = 0;
  let lastTapTime    = 0;
  let pinchStartDist = 0;
  let pinchStartScale = 0;
  let pinchMidX      = 0;
  let pinchMidY      = 0;

  function touchDist(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      touchStartX    = e.touches[0].clientX;
      touchStartY    = e.touches[0].clientY;
      touchMoved     = 0;
      touchStartTime = Date.now();
      dragStartX     = touchStartX;
      dragStartY     = touchStartY;
    } else if (e.touches.length === 2) {
      pinchStartDist  = touchDist(e.touches[0], e.touches[1]);
      pinchStartScale = scaling;
      pinchMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      pinchMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      const dx = e.touches[0].clientX - dragStartX;
      const dy = e.touches[0].clientY - dragStartY;
      touchMoved += Math.abs(dx) + Math.abs(dy);
      offsetX += dx;
      offsetY += dy;
      dragStartX = e.touches[0].clientX;
      dragStartY = e.touches[0].clientY;
      markDirty();
    } else if (e.touches.length === 2) {
      const dist     = touchDist(e.touches[0], e.touches[1]);
      const newScale = Math.max(20, Math.min(2000,
        pinchStartScale * dist / pinchStartDist
      ));
      const oldScale = scaling;
      offsetX = pinchMidX - (pinchMidX - offsetX) * newScale / oldScale;
      offsetY = pinchMidY - (pinchMidY - offsetY) * newScale / oldScale;
      scaling = newScale;
      markDirty();
    }
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (e.changedTouches.length === 1 && e.touches.length === 0) {
      const elapsed = Date.now() - touchStartTime;
      if (elapsed < 200 && touchMoved < 5) {
        handleTap();
      }
    }
  }, { passive: false });

  // ── Season navigation (click / tap) ───────────────────────────────────────

  function handleTap() {
    const now = Date.now();
    const isDouble = (now - lastClickTime) < 300;
    lastClickTime = now;

    if (isDouble) {
      // Double tap: go back one season (~3 months)
      const d = new Date(targetDate.getTime());
      d.setMonth(d.getMonth() - 3);
      loadSeason(d);
    } else {
      // Single tap: advance one season (~3 months)
      setTimeout(() => {
        // Only fire if not superseded by a double-tap
        if (Date.now() - lastClickTime >= 290) {
          const d = new Date(targetDate.getTime());
          d.setMonth(d.getMonth() + 3);
          loadSeason(d);
        }
      }, 310);
    }
  }

  // ── Date picker overlay ───────────────────────────────────────────────────

  const overlay    = document.getElementById('picker-overlay');
  const dateInput  = document.getElementById('date-input');
  const todayBtn   = document.getElementById('today-btn');
  const goBtn      = document.getElementById('go-btn');
  const openBtn    = document.getElementById('open-picker');

  function showOverlay() {
    overlay.classList.remove('hidden');
  }

  function hideOverlay() {
    overlay.classList.add('hidden');
  }

  function formatDateInput(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function parseDateInput(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  todayBtn.addEventListener('click', () => {
    const today = new Date();
    dateInput.value = formatDateInput(today);
    loadSeason(today);
    hideOverlay();
  });

  goBtn.addEventListener('click', () => {
    if (dateInput.value) {
      loadSeason(parseDateInput(dateInput.value));
    }
    hideOverlay();
  });

  dateInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') goBtn.click();
  });

  openBtn.addEventListener('click', showOverlay);

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  resizeCanvas();                        // sets canvas size + initial scaling
  dateInput.value = formatDateInput(targetDate);
  loadSeason(targetDate);               // build first season
  showOverlay();                         // show picker on load

}());
