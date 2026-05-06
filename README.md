# LoveSite — Save the Date landing

A cinematic, scroll-driven Save-the-Date landing page for an Indian wedding. A single
hand-painted 2D canvas scene drives the intro: a vintage wedding car follows a forest
road at spring mid-morning, the camera accelerates past it, the road gives way to a
beach, and the countdown reveals on the sand.

## What's in here

- **`src/scenes/RoadScene.jsx`** — the 10-second canvas intro: lush green forest, lotus-pink
  dupatta, painterly couple silhouette inside a vintage convertible, cherry-blossom
  particles drifting through the forest and over the final save-the-date scene.
- **`src/ComingSoon.jsx`** — countdown UI overlaid on the beach after the intro completes.
- **`src/hooks/useCanvasScene.js`** — generic rAF-driven canvas hook with HiDPI scaling
  and `prefers-reduced-motion` support.
- **`src/constants/wedding.js`** — single source of truth for the launch date and monogram.

## Stack

- **React + Vite** for the build
- **Tailwind v3** for styling (tokens in `tailwind.config.js`)
- **Framer Motion** for the countdown reveal/fade
- **Canvas API** for the scene — no Three.js, no GSAP, all hand-rolled 2D

## Run locally

```bash
npm install
npm run dev    # http://localhost:5173
```

## Build

```bash
npm run build
```

Output goes to `dist/`. Deploy that directory to Netlify (or any static host).

## Tweaks

- **Launch date** lives in `src/constants/wedding.js` — `site.launchDate` (date constructor)
  + `site.launchDateDisplay` (string shown on screen). Month is 0-indexed.
- **Monogram** — `wedding.monogram`.
- **Scene tuning** — colors, lighting direction, blossom density, dupatta length, etc. all
  live as named constants near the top of `src/scenes/RoadScene.jsx`.

## Reduced motion

The scene respects `prefers-reduced-motion` — animation pauses on the final settled
frame, embers/petals/wave-shimmer stop, and the countdown reveals immediately.
