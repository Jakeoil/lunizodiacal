# Coylendar

A lunar-tropical calendar web app. Displays days as a grid of parallelograms colored by zodiac sign, arranged in rows by lunar phase quarter.

## What it shows

Each day is a parallelogram cell colored by the Sun's tropical zodiac sign (12 colors, Aries through Pisces). Days in the same lunar phase quarter (new / first quarter / full / last quarter) flow right across a row; when the phase changes, the row drops down and resets left. This geometry means each row is roughly one week long and the grid covers one astronomical season (~91 days).

Visual markers:
- **Color**: tropical zodiac sign of the Sun (12 hues)
- **Bold label**: first of the month shows abbreviated month name
- **Red text**: Sundays
- **Thick top line**: week containing a new moon

## Usage

Open `index.html` in any modern browser — no build step, no dependencies.

- **Pan**: drag to scroll
- **Next season**: single click/tap on the canvas
- **Previous season**: double click/double tap on the canvas
- **Jump to date**: use the date picker overlay (reopened via the 📅 button)

## Files

```
index.html        Full-screen canvas + date picker overlay
style.css         Minimal styling
astro.js          Astronomical math (sun angle, moon phase, zodiac sign)
calendarDate.js   Day cell data model and parallelogram rendering
app.js            Canvas orchestration, pan, season navigation
```

## Astronomical math

Ported from the CoylendarMax Android app. Key algorithms:

- **Sun position**: mean ecliptic longitude with elliptic correction (J2000 epoch)
- **Moon phase**: Julian Day → sun and moon ecliptic longitudes → phase angle
- **Zodiac sign**: sun longitude divided into 12 equal 30° sectors starting at Aries (vernal equinox)
- **Season**: sun longitude divided into 4 quadrants

All values are computed at the *end* of each calendar day (local midnight + 24 h) so the displayed sign/phase reflects what is true for most of that day.

## Origin

Web port of the CoylendarMax Android app (Java/Canvas), which itself implements a lunisolar calendar showing the interplay of the tropical solar year and the synodic lunar cycle.

## Wish list

- **Zoom** — scroll wheel (desktop) / pinch (mobile); infrastructure is straightforward, deferred for now
- **D3.js renderer** — replace the Canvas 2D renderer with D3/SVG to get free per-cell interactivity (hover, tooltips, click-to-expand) as more day-level detail is added; the astronomical math and cell geometry stay unchanged, only `app.js` rendering changes
