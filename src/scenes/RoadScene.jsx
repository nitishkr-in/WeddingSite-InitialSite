import { useMemo, useRef } from 'react'
import useCanvasScene from '../hooks/useCanvasScene'

/**
 * RoadScene — drone-style fly-through, lit at spring mid-morning.
 *
 * The sun sits high and forward-right (more overhead than golden hour), giving
 * the whole frame a high-key daylight feel:
 *   • soft cool-cream highlights on object tops,
 *   • gentle cool blue-grey shadows on the opposite side (never deep purple),
 *   • short, soft shadows pooled near each object's base.
 * The sky reads as a bright cyan-azure ceiling, the ocean reflects it, and the
 * forest is lush saturated emerald. Cherry blossom petals drift through the
 * frame on a soft breeze.
 *
 * Camera trajectory (10s intro):
 *   0–4s   Camera follows the wedding car through a tree-lined road
 *   4–6s   Camera accelerates forward, leaving the car behind
 *   6–8s   Forest gives way to a beach; sand grows from the top of frame
 *   8–10s  Camera settles over the beach where launch info will appear on sand
 *
 * The "world" is laid out vertically in viewport-height (h) units:
 *   worldY 0     → 2.2h   Forest floor + tarmac road + lush green canopy
 *   worldY 2.2h  → 2.7h   Transition: forest fringe + cool rocks + sand begins
 *   worldY 2.7h  → 3.6h   Beach (light cool sand) — text is painted here
 *   worldY 3.6h  → 4.6h   Ocean (sky-blue horizon → cool teal surf)
 *
 * worldY-to-screenY conversion: screenY = (cameraY + h) - worldY
 *   so higher worldY (deeper into journey) appears at TOP of the viewport.
 */

export const INTRO_DURATION = 10
export const TEXT_REVEAL_DELAY = INTRO_DURATION + 0.5

// World layout (multiples of viewport height)
const W = {
  forestStart: 0,
  forestEnd: 2.2,
  transitionStart: 2.2,
  transitionEnd: 2.7,
  sandStart: 2.7,
  sandEnd: 3.6,
  oceanStart: 3.6,
  oceanEnd: 4.6,
}

// Spring mid-morning lighting model. The sun is high and forward-right of the
// camera, so dirX > 0 and dirY ≈ -0.78 (more overhead than golden hour).
// Highlights are soft cool-cream (sky-fill), shadows are gentle blue-grey.
const LIGHT = {
  dirX: 0.55,   // sun direction, screen-space right (less raking)
  dirY: -0.78,  // sun direction, screen-space up (more overhead)
  warmRim: '#fff4d8',     // soft cream sun-fill (not amber)
  warmRimSoft: 'rgba(255, 244, 216, 0.45)',
  coolFill: '#a8c4e0',    // pale sky-blue ambient bounce
  coolFillSoft: 'rgba(168, 196, 224, 0.45)',
  shadow: 'rgba(70, 95, 130, 0.42)',  // soft cool blue-grey shadow
  shadowSoft: 'rgba(70, 95, 130, 0.22)',
}

// Lotus pink — used for cherry blossoms, dupatta, and floral accents.
const LOTUS = {
  pale: '#ffe4ef',
  light: '#ffc0d8',
  mid: '#ff90b8',
  deep: '#d04880',
}

/* ---------- Seeded RNG ---------- */

function srand(seed) {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

/* ---------- Pre-compute trees, rocks, and beach palms ---------- */

function buildWorld(seed) {
  const rand = srand(seed)

  // Forest trees lining the road, dense
  const forestTrees = []
  const forestCount = 110
  for (let i = 0; i < forestCount; i++) {
    forestTrees.push(makeTree(rand, W.forestStart, W.forestEnd, i % 2))
  }

  // Fringe trees right at the cliff (denser palms)
  const fringeTrees = []
  const fringeCount = 22
  for (let i = 0; i < fringeCount; i++) {
    const tree = makeTree(rand, W.transitionStart - 0.05, W.transitionEnd, i % 2)
    tree.type = rand() > 0.4 ? 'palm' : 'canopy'
    fringeTrees.push(tree)
  }

  // Beach palms — scattered, mostly along sand edges
  const beachPalms = []
  const beachCount = 9
  for (let i = 0; i < beachCount; i++) {
    const tree = makeTree(rand, W.sandStart + 0.1, W.sandEnd - 0.05, i % 2)
    tree.type = 'palm'
    tree.sizeFactor *= 1.1
    beachPalms.push(tree)
  }

  // Rocks at the cliff boundary
  const rocks = []
  for (let i = 0; i < 30; i++) {
    rocks.push({
      worldY: W.transitionStart + 0.05 + rand() * 0.35,
      xPct: rand(), // 0..1 across viewport
      r: 6 + rand() * 14,
      shade: rand(),
    })
  }

  // Wave foam patches in the ocean
  const waves = []
  for (let i = 0; i < 18; i++) {
    waves.push({
      worldY: W.oceanStart + rand() * 0.9,
      xPct: rand(),
      width: 0.2 + rand() * 0.6,
      thickness: 1 + rand() * 2.5,
      phase: rand() * Math.PI * 2,
      speed: 0.3 + rand() * 0.5,
    })
  }

  return { forestTrees, fringeTrees, beachPalms, rocks, waves }
}

function makeTree(rand, worldYMin, worldYMax, side) {
  const clumpCount = 5 + Math.floor(rand() * 4)
  const clumps = []
  for (let c = 0; c < clumpCount; c++) {
    clumps.push({
      a: rand() * Math.PI * 2,
      d: 0.15 + rand() * 0.55,
      s: 0.34 + rand() * 0.34,
    })
  }
  const speckCount = 12 + Math.floor(rand() * 16)
  const speckles = []
  for (let s = 0; s < speckCount; s++) {
    speckles.push({
      a: rand() * Math.PI * 2,
      d: rand(),
      s: 0.5 + rand() * 1.4,
      bright: rand(),
    })
  }
  return {
    worldY: worldYMin + rand() * (worldYMax - worldYMin),
    side,
    xJitter: rand(),
    sizeFactor: 0.85 + rand() * 0.7,
    shade: rand(),
    type: rand() > 0.45 ? 'palm' : 'canopy',
    rotation: rand() * Math.PI * 2,
    clumps,
    speckles,
  }
}

/* ---------- Camera + car timing ---------- */

function getCameraY(t, h) {
  if (t <= 4) {
    // Follow phase: linear forward
    return (t / 4) * 1.0 * h
  }
  if (t <= 6) {
    // Accelerate forward, easing in
    const u = (t - 4) / 2
    return h * (1.0 + 0.85 * u * u)
  }
  if (t <= 8) {
    // Beach reveal
    const u = (t - 6) / 2
    return h * (1.85 + 0.7 * u)
  }
  if (t <= INTRO_DURATION) {
    // Settle (ease-out)
    const u = (t - 8) / 2
    return h * (2.55 + 0.25 * (1 - (1 - u) * (1 - u)))
  }
  return h * 2.8
}

function getCarWorldY(t, h) {
  if (t < 4) return t * h * 0.25 + 0.3 * h
  if (t < 6) return 1.3 * h + (t - 4) * h * 0.1
  return 1.5 * h
}

const wToS = (worldY, cameraY, h) => cameraY + h - worldY

/* ---------- Component ---------- */

export default function RoadScene() {
  const world = useMemo(() => buildWorld(42), [])
  // Cherry blossom particles — refs so the array survives across frames
  const blossomsRef = useRef([])
  const blossomSpawnAccum = useRef(0)
  const blossomInitRef = useRef(false)

  const draw = (ctx, w, h, t, dt, { reducedMotion }) => {
    const introT = reducedMotion ? INTRO_DURATION : Math.min(t, INTRO_DURATION)
    const cameraY = getCameraY(introT, h)

    drawWorldStrata(ctx, w, h, cameraY, t, reducedMotion)
    drawRoad(ctx, w, h, cameraY, t, reducedMotion)
    drawCliffRocks(ctx, w, h, cameraY, world.rocks)
    drawWaveFoam(ctx, w, h, cameraY, t, world.waves, reducedMotion)
    drawAllTrees(ctx, w, h, cameraY, world)
    drawAtmospheric(ctx, w, h, cameraY)

    // Car (with dupatta)
    const carWorldY = getCarWorldY(introT, h)
    const carScreenY = wToS(carWorldY, cameraY, h)
    drawCarSequence(ctx, w, h, carScreenY, t, reducedMotion, introT)

    // Cherry blossom timeline:
    //   0.0–4.0 s   ON  (forest scene, full shower)
    //   4.0–5.5 s   FADE OUT (camera leaves trees, accelerates)
    //   5.5–8.0 s   OFF (transition + beach reveal — clean frame)
    //   8.0–9.5 s   FADE IN (camera settles on beach)
    //   9.5 s+      ON  (held throughout the save-the-date / countdown scene)
    if (!reducedMotion) {
      let blossomIntensity = 1
      if (introT > 4 && introT < 8) {
        blossomIntensity = Math.max(0, 1 - (introT - 4) / 1.5)
      } else if (introT >= 8) {
        blossomIntensity = Math.min(1, (introT - 8) / 1.5)
      }
      spawnAndDrawBlossoms(
        ctx, w, h, t, dt,
        blossomsRef.current, blossomSpawnAccum, blossomInitRef,
        blossomIntensity
      )
    }
  }

  const canvasRef = useCanvasScene(draw)
  return (
    <canvas
      ref={canvasRef}
      className="canvas-fullscreen"
      aria-hidden="true"
    />
  )
}

/* ---------- World strata (forest floor / sand / ocean bands) ---------- */

function drawWorldStrata(ctx, w, h, cameraY, t, reducedMotion) {
  // Pre-compute screen positions for each band boundary
  const sFloor = wToS(W.forestStart * h, cameraY, h) // bottom of forest floor (largest screenY)
  const sForestEnd = wToS(W.forestEnd * h, cameraY, h)
  const sSandStart = wToS(W.sandStart * h, cameraY, h)
  const sSandEnd = wToS(W.sandEnd * h, cameraY, h)
  const sOceanEnd = wToS(W.oceanEnd * h, cameraY, h)

  // Underlying base — soft cyan sky (in case any band leaves a gap)
  ctx.fillStyle = '#b8dcec'
  ctx.fillRect(0, 0, w, h)

  // Forest floor (worldY 0 to forestEnd) — lush green floor with dappled light
  if (sForestEnd < h && sFloor > 0) {
    const top = Math.max(0, sForestEnd)
    const bottom = Math.min(h, sFloor)
    const grad = ctx.createLinearGradient(0, top, 0, bottom)
    grad.addColorStop(0, '#3a6028')   // bright forest floor where canopy thins
    grad.addColorStop(0.5, '#244816')
    grad.addColorStop(1, '#16300e')   // deeper green-shadow
    ctx.fillStyle = grad
    ctx.fillRect(0, top, w, bottom - top)

    // Sun-dappled patches (faint cool-cream wash from the right edge)
    const sunWash = ctx.createLinearGradient(w * 0.55, 0, w, 0)
    sunWash.addColorStop(0, 'rgba(255, 250, 220, 0)')
    sunWash.addColorStop(1, 'rgba(255, 250, 220, 0.12)')
    ctx.fillStyle = sunWash
    ctx.fillRect(w * 0.55, top, w * 0.45, bottom - top)
  }

  // Transition zone (forestEnd to sandStart) — green-meets-sand fringe
  const sTransTop = wToS(W.transitionEnd * h, cameraY, h)
  const sTransBottom = wToS(W.transitionStart * h, cameraY, h)
  if (sTransTop < h && sTransBottom > 0) {
    const top = Math.max(0, sTransTop)
    const bottom = Math.min(h, sTransBottom)
    const grad = ctx.createLinearGradient(0, top, 0, bottom)
    grad.addColorStop(0, '#e8d8b0')   // light cool sand fringe
    grad.addColorStop(0.45, '#a89878')
    grad.addColorStop(1, '#3a6028')   // matches lush forest floor
    ctx.fillStyle = grad
    ctx.fillRect(0, top, w, bottom - top)
  }

  // Sand (sandStart to sandEnd) — light cool beach in spring daylight
  if (sSandEnd < h && sSandStart > 0) {
    const top = Math.max(0, sSandEnd)
    const bottom = Math.min(h, sSandStart)
    // Brighter and cooler than golden hour; wet near ocean, drier near cliff
    const grad = ctx.createLinearGradient(0, top, 0, bottom)
    grad.addColorStop(0, '#e8e0c8')   // wet sand catching sky-fill (cool)
    grad.addColorStop(0.45, '#dccaa0')
    grad.addColorStop(1, '#a89878')   // dry sand under cliff
    ctx.fillStyle = grad
    ctx.fillRect(0, top, w, bottom - top)

    // Cool blue-grey shadow band where the cliff casts on the sand
    const cliffShadow = ctx.createLinearGradient(0, bottom - 80, 0, bottom)
    cliffShadow.addColorStop(0, 'rgba(80, 100, 130, 0)')
    cliffShadow.addColorStop(1, 'rgba(80, 100, 130, 0.28)')
    ctx.fillStyle = cliffShadow
    ctx.fillRect(0, bottom - 80, w, 80)

    // Subtle cool-cream rim on the right side (sun direction)
    const sandRim = ctx.createLinearGradient(w * 0.6, 0, w, 0)
    sandRim.addColorStop(0, 'rgba(255, 250, 220, 0)')
    sandRim.addColorStop(1, 'rgba(255, 250, 220, 0.16)')
    ctx.fillStyle = sandRim
    ctx.fillRect(w * 0.6, top, w * 0.4, bottom - top)

    // Sand grain noise (stable pattern)
    drawSandGrain(ctx, w, top, bottom)
  }

  // Ocean (sandEnd to oceanEnd) — bright cyan-blue reflecting spring sky
  if (sOceanEnd < h && sSandEnd > 0) {
    const top = Math.max(0, sOceanEnd)
    const bottom = Math.min(h, sSandEnd)
    const oceanGrad = ctx.createLinearGradient(0, top, 0, bottom)
    oceanGrad.addColorStop(0, '#d8f0f8')   // pale horizon line
    oceanGrad.addColorStop(0.25, '#86c8e0')
    oceanGrad.addColorStop(0.6, '#3e8aaa')   // mid water cyan-blue
    oceanGrad.addColorStop(1, '#1f5878')   // deep teal near sand
    ctx.fillStyle = oceanGrad
    ctx.fillRect(0, top, w, bottom - top)

    // Sun reflection — soft white column from the sun's screen-x
    const sunX = w * 0.66
    const colW = w * 0.20
    const colGrad = ctx.createLinearGradient(sunX - colW / 2, 0, sunX + colW / 2, 0)
    colGrad.addColorStop(0, 'rgba(255, 255, 255, 0)')
    colGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.28)')
    colGrad.addColorStop(1, 'rgba(255, 255, 255, 0)')
    ctx.fillStyle = colGrad
    ctx.fillRect(sunX - colW / 2, top, colW, bottom - top)

    // Animated wave shimmer — bright white catch-light bands
    const drift = reducedMotion ? 0 : (t * 8) % 28
    ctx.fillStyle = 'rgba(255, 255, 255, 0.10)'
    for (let y = top; y < bottom; y += 28) {
      ctx.fillRect(0, y + drift, w, 1.2)
    }
  }
}

function drawSandGrain(ctx, w, top, bottom) {
  // Cool blue-grey pebbles (set into sand)
  ctx.fillStyle = 'rgba(80, 95, 120, 0.20)'
  for (let i = 0; i < 240; i++) {
    const ix = (i * 73 + 17) % w
    const iy = top + ((i * 113 + 41) % Math.max(1, bottom - top))
    ctx.fillRect(ix, iy, 1.5, 1.5)
  }
  // Bright catch-light grains (cool-cream)
  ctx.fillStyle = 'rgba(255, 250, 230, 0.30)'
  for (let i = 0; i < 200; i++) {
    const ix = (i * 97 + 31) % w
    const iy = top + ((i * 151 + 13) % Math.max(1, bottom - top))
    ctx.fillRect(ix, iy, 1.2, 1.2)
  }
}

/* ---------- Road (only in forest zone) ---------- */

function drawRoad(ctx, w, h, cameraY, t, reducedMotion) {
  const roadStartScreen = wToS(W.forestEnd * h, cameraY, h) // where road ends (top)
  const roadEndScreen = wToS(W.forestStart * h, cameraY, h) // where road starts (bottom)
  if (roadStartScreen > h || roadEndScreen < 0) return

  const top = Math.max(0, roadStartScreen)
  const bottom = Math.min(h, roadEndScreen)

  const roadW = Math.min(Math.max(w * 0.34, 240), 420)
  const roadX = (w - roadW) / 2

  // Asphalt — neutral cool grey (daytime, no warm tint)
  const grad = ctx.createLinearGradient(roadX, 0, roadX + roadW, 0)
  grad.addColorStop(0, '#2a2e34')   // shadow side (left)
  grad.addColorStop(0.5, '#454a52')
  grad.addColorStop(1, '#3a3e44')   // sun side
  ctx.fillStyle = grad
  ctx.fillRect(roadX, top, roadW, bottom - top)

  // Soft cool-cream sky-fill rake from upper-right
  const sunRake = ctx.createLinearGradient(roadX, 0, roadX + roadW, 0)
  sunRake.addColorStop(0, 'rgba(255, 250, 220, 0)')
  sunRake.addColorStop(0.7, 'rgba(255, 250, 220, 0)')
  sunRake.addColorStop(1, 'rgba(255, 250, 220, 0.08)')
  ctx.fillStyle = sunRake
  ctx.fillRect(roadX, top, roadW, bottom - top)

  // Tapering: cool green-tinted fade where road dissolves into greenery
  if (roadStartScreen > 0 && roadStartScreen < h) {
    const fade = ctx.createLinearGradient(0, roadStartScreen, 0, roadStartScreen + 24)
    fade.addColorStop(0, '#a89878')
    fade.addColorStop(1, 'rgba(168, 152, 120, 0)')
    ctx.fillStyle = fade
    ctx.fillRect(roadX - 6, roadStartScreen, roadW + 12, 24)
  }

  // Edge curb shadows — soft cool blue-grey on both sides
  const leftCurb = ctx.createLinearGradient(roadX, 0, roadX + 14, 0)
  leftCurb.addColorStop(0, 'rgba(40, 55, 80, 0.50)')
  leftCurb.addColorStop(1, 'rgba(40, 55, 80, 0)')
  ctx.fillStyle = leftCurb
  ctx.fillRect(roadX, top, 14, bottom - top)

  const rightCurb = ctx.createLinearGradient(roadX + roadW - 14, 0, roadX + roadW, 0)
  rightCurb.addColorStop(0, 'rgba(40, 55, 80, 0)')
  rightCurb.addColorStop(1, 'rgba(40, 55, 80, 0.50)')
  ctx.fillStyle = rightCurb
  ctx.fillRect(roadX + roadW - 14, top, 14, bottom - top)

  // Asphalt grain (cool-white catch-light)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.025)'
  for (let i = 0; i < 200; i++) {
    const ix = roadX + ((i * 73 + 17) % roadW)
    const iy = top + ((i * 113 + 41) % Math.max(1, bottom - top))
    ctx.fillRect(ix, iy, 1.5, 1.5)
  }

  // Yellow dashed center line — scrolls with camera (NOT independent)
  const dashLen = 28
  const gapLen = 22
  const period = dashLen + gapLen
  const offset = reducedMotion ? 0 : ((cameraY + (t * 90)) % period)
  const dashW = 4.5
  const dashX = w / 2 - dashW / 2

  // Iterate worldY positions and skip those outside the forest band
  for (let wy = Math.floor(cameraY / period) * period - period; wy < cameraY + h + period; wy += period) {
    const dashStartScreen = wToS(wy + dashLen, cameraY, h)
    const dashEndScreen = wToS(wy, cameraY, h)
    // Skip if dash's worldY isn't in forest zone
    if (wy + dashLen < W.forestStart * h || wy > W.forestEnd * h) continue
    if (dashEndScreen < 0 || dashStartScreen > h) continue

    const paintGrad = ctx.createLinearGradient(0, dashStartScreen, 0, dashEndScreen)
    paintGrad.addColorStop(0, 'rgba(214, 188, 110, 0.92)')
    paintGrad.addColorStop(0.5, 'rgba(232, 208, 130, 0.96)')
    paintGrad.addColorStop(1, 'rgba(196, 170, 96, 0.88)')
    ctx.fillStyle = paintGrad
    ctx.fillRect(dashX, dashStartScreen, dashW, dashEndScreen - dashStartScreen)

    // Sheen + shadow
    ctx.fillStyle = 'rgba(255, 240, 200, 0.18)'
    ctx.fillRect(dashX + 0.5, dashStartScreen + 1, dashW - 1, 1)
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(dashX, dashEndScreen - 1, dashW, 1)
  }
}

/* ---------- Cliff rocks ---------- */

function drawCliffRocks(ctx, w, h, cameraY, rocks) {
  for (const r of rocks) {
    const sy = wToS(r.worldY * h, cameraY, h)
    if (sy < -20 || sy > h + 20) continue
    const x = r.xPct * w

    // Soft cool blue-grey drop shadow (short, sun is high)
    ctx.fillStyle = LIGHT.shadow
    ctx.beginPath()
    ctx.ellipse(x - r.r * 0.20, sy + r.r * 0.45, r.r * 1.0, r.r * 0.36, 0, 0, Math.PI * 2)
    ctx.fill()

    // Rock body — cool blue-grey stone, sun-lit highlight on top-right
    const hlX = x + r.r * 0.4 * LIGHT.dirX
    const hlY = sy + r.r * 0.4 * LIGHT.dirY
    const grad = ctx.createRadialGradient(hlX, hlY, 0, x, sy, r.r)
    grad.addColorStop(0, r.shade < 0.5 ? '#c8d0d8' : '#b0b8c0')   // bright sunlit
    grad.addColorStop(0.55, r.shade < 0.5 ? '#6a7884' : '#586878')
    grad.addColorStop(1, '#2a3848')   // deep cool blue-grey shadow
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(x, sy, r.r, 0, Math.PI * 2)
    ctx.fill()

    // Soft cool-cream rim along the sun-facing edge
    ctx.strokeStyle = 'rgba(255, 250, 230, 0.30)'
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.arc(x, sy, r.r - 0.5, Math.atan2(LIGHT.dirY, LIGHT.dirX) - 0.6, Math.atan2(LIGHT.dirY, LIGHT.dirX) + 0.6)
    ctx.stroke()
  }
}

/* ---------- Wave foam ---------- */

function drawWaveFoam(ctx, w, h, cameraY, t, waves, reducedMotion) {
  // Static foam line right at the sand-ocean boundary
  const foamY = wToS(W.oceanStart * h, cameraY, h)
  if (foamY > 0 && foamY < h + 20) {
    ctx.save()
    const fGrad = ctx.createLinearGradient(0, foamY - 8, 0, foamY + 6)
    fGrad.addColorStop(0, 'rgba(255,255,255,0)')
    fGrad.addColorStop(0.4, 'rgba(255,255,255,0.65)')
    fGrad.addColorStop(0.6, 'rgba(255,255,255,0.55)')
    fGrad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = fGrad
    // Wavy edge
    const wobble = reducedMotion ? 0 : Math.sin(t * 1.4) * 3
    ctx.beginPath()
    ctx.moveTo(0, foamY)
    for (let x = 0; x <= w; x += 18) {
      const yJ = Math.sin(x * 0.04 + t * 0.8) * 4 + wobble
      ctx.lineTo(x, foamY + yJ)
    }
    ctx.lineTo(w, foamY + 14)
    ctx.lineTo(0, foamY + 14)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  // Animated wave streaks in the ocean
  for (const wv of waves) {
    const sy = wToS(wv.worldY * h, cameraY, h)
    if (sy < -10 || sy > h + 10) continue
    const t1 = reducedMotion ? wv.phase : t * wv.speed + wv.phase
    const offset = Math.sin(t1) * 30
    const wWidth = wv.width * w
    const x = wv.xPct * w + offset - wWidth / 2

    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.fillRect(x, sy, wWidth, wv.thickness)
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.fillRect(x - 4, sy + wv.thickness, wWidth + 8, 1)
  }
}

/* ---------- Trees rendering ---------- */

function drawAllTrees(ctx, w, h, cameraY, world) {
  // Combine all trees, sort by worldY descending so closer trees draw on top
  const all = []
  for (const tg of [world.forestTrees, world.fringeTrees, world.beachPalms]) {
    for (const tr of tg) all.push(tr)
  }
  all.sort((a, b) => b.worldY - a.worldY) // higher worldY (further) first → drawn first

  for (const tree of all) {
    const sy = wToS(tree.worldY * h, cameraY, h)
    if (sy < -260 || sy > h + 260) continue

    // X position based on side and jitter
    const onBeach = tree.worldY >= W.sandStart && tree.worldY <= W.sandEnd
    let x
    if (onBeach) {
      // Scattered, mostly on edges of sand
      const edge = tree.side === 0 ? 0 : w
      const inset = w * (0.05 + tree.xJitter * 0.25)
      x = tree.side === 0 ? edge + inset : edge - inset
    } else {
      const roadW = Math.min(Math.max(w * 0.34, 240), 420)
      const roadX = (w - roadW) / 2
      const innerEdgeX = tree.side === 0 ? roadX - 12 : roadX + roadW + 12
      const outerEdgeX = tree.side === 0 ? -10 : w + 10
      x = innerEdgeX + (outerEdgeX - innerEdgeX) * (0.04 + tree.xJitter * 0.96)
    }

    const sideW = (w - Math.min(Math.max(w * 0.34, 240), 420)) / 2
    const r = Math.min(sideW * 0.55 * tree.sizeFactor, 110)

    if (tree.type === 'palm') {
      drawPalm(ctx, x, sy, r, tree.rotation, tree.shade)
    } else {
      drawCanopy(ctx, x, sy, r, tree.shade, tree.clumps, tree.speckles)
    }
  }
}

function drawCanopy(ctx, x, y, r, shade, clumps, speckles) {
  // Soft cool blue-grey drop shadow (short, daytime sun is high)
  ctx.fillStyle = LIGHT.shadow
  ctx.beginPath()
  ctx.ellipse(x - r * 0.20, y + r * 0.55, r * 0.95, r * 0.25, 0, 0, Math.PI * 2)
  ctx.fill()

  // Dark sub-canopy — deep emerald, sits inside the foliage as core shadow
  ctx.fillStyle = shade < 0.5 ? '#1c3818' : '#162e14'
  ctx.beginPath()
  ctx.ellipse(x - r * 0.05, y + r * 0.05, r * 0.88, r * 0.86, 0, 0, Math.PI * 2)
  ctx.fill()

  // Lush spring-foliage palette
  //   hi   — bright yellow-green sun-tip on the upper-right
  //   mid  — saturated emerald body
  //   shadow — cool teal-shaded green (still green, never blue-violet)
  const palette = shade < 0.5
    ? { hi: '#a8d860', mid: '#48902a', shadow: '#1e4220' }
    : { hi: '#94c850', mid: '#3d8024', shadow: '#1a3a1c' }

  const sorted = [...clumps].sort((a, b) => {
    const da = (Math.cos(a.a) * a.d + 1) + (Math.sin(a.a) * a.d + 1)
    const db = (Math.cos(b.a) * b.d + 1) + (Math.sin(b.a) * b.d + 1)
    return db - da
  })

  for (const clump of sorted) {
    const cx = x + Math.cos(clump.a) * clump.d * r
    const cy = y + Math.sin(clump.a) * clump.d * r
    const cr = clump.s * r
    // Dot product against sun direction (LIGHT.dirX, LIGHT.dirY)
    const dot = (Math.cos(clump.a) * LIGHT.dirX + Math.sin(clump.a) * LIGHT.dirY)
    const lit = dot * 0.5 + 0.5

    // Highlight origin pulled toward the sun direction
    const hlX = cx + cr * 0.45 * LIGHT.dirX
    const hlY = cy + cr * 0.45 * LIGHT.dirY
    const grad = ctx.createRadialGradient(hlX, hlY, 0, cx, cy, cr)
    if (lit > 0.6) {
      grad.addColorStop(0, palette.hi)
      grad.addColorStop(0.4, palette.mid)
      grad.addColorStop(0.85, palette.shadow)
      grad.addColorStop(1, 'rgba(28, 56, 28, 0)')
    } else if (lit > 0.4) {
      grad.addColorStop(0, palette.mid)
      grad.addColorStop(0.5, palette.shadow)
      grad.addColorStop(0.9, '#162e14')
      grad.addColorStop(1, 'rgba(20, 40, 20, 0)')
    } else {
      // Fully shadow-side: cooler emerald, no warm rim
      grad.addColorStop(0, palette.shadow)
      grad.addColorStop(0.6, '#162e14')
      grad.addColorStop(1, 'rgba(14, 28, 16, 0)')
    }
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(cx, cy, cr, 0, Math.PI * 2)
    ctx.fill()
  }

  // Speckles — sun-side ones catch bright cool-cream, shadow-side stay deep green
  for (const s of speckles) {
    const sx = x + Math.cos(s.a) * s.d * r * 0.85
    const sy = y + Math.sin(s.a) * s.d * r * 0.85
    const dot = (Math.cos(s.a) * LIGHT.dirX + Math.sin(s.a) * LIGHT.dirY)
    const onSun = dot > 0.15
    const bright = s.bright > 0.6
    if (onSun && bright) {
      ctx.fillStyle = 'rgba(220, 240, 160, 0.70)'   // bright lime catch
    } else if (onSun) {
      ctx.fillStyle = 'rgba(150, 200, 100, 0.55)'   // mid sunlit green
    } else if (bright) {
      ctx.fillStyle = 'rgba(90, 130, 70, 0.45)'
    } else {
      ctx.fillStyle = 'rgba(20, 50, 22, 0.75)'   // deep shadow leaf
    }
    ctx.beginPath()
    ctx.arc(sx, sy, s.s, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawPalm(ctx, cx, cy, r, rot, shade) {
  const fronds = 11
  // Lush emerald body → bright lime sun-tip rim
  const dark = shade < 0.5 ? '#1c3a1a' : '#172f17'
  const mid = shade < 0.5 ? '#3d8024' : '#357020'
  const warmRim = shade < 0.5 ? '#a8d860' : '#94c850'

  // Soft cool blue-grey drop shadow (short — sun is high)
  ctx.fillStyle = LIGHT.shadow
  ctx.beginPath()
  ctx.ellipse(cx - r * 0.18, cy + r * 0.50, r * 0.95, r * 0.24, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(rot)

  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2
    ctx.save()
    ctx.rotate(a)

    // Whether this frond points toward the sun (in world frame, before rotation)
    const frondDirX = Math.cos(a + rot)
    const frondDirY = Math.sin(a + rot)
    const dot = frondDirX * LIGHT.dirX + frondDirY * LIGHT.dirY
    const sunlit = dot > 0.1

    const frondGrad = ctx.createLinearGradient(0, 0, r * 0.95, 0)
    frondGrad.addColorStop(0, dark)
    frondGrad.addColorStop(0.4, mid)
    frondGrad.addColorStop(1, dark)
    ctx.fillStyle = frondGrad
    ctx.beginPath()
    ctx.ellipse(r * 0.5, 0, r * 0.55, r * 0.14, 0, 0, Math.PI * 2)
    ctx.fill()

    // Bright lime sun-rim on fronds pointing toward sun, deeper green on shadow
    if (sunlit) {
      ctx.fillStyle = warmRim
      ctx.beginPath()
      ctx.ellipse(r * 0.55, -r * 0.03, r * 0.40, r * 0.05, 0, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.fillStyle = 'rgba(50, 80, 110, 0.45)'
      ctx.beginPath()
      ctx.ellipse(r * 0.45, r * 0.04, r * 0.35, r * 0.06, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    // Spine — green on sun-side, deeper green on shadow-side
    ctx.strokeStyle = sunlit
      ? 'rgba(60, 90, 30, 0.55)'
      : 'rgba(20, 40, 20, 0.60)'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(r * 0.05, 0)
    ctx.lineTo(r * 1.0, 0)
    ctx.stroke()

    ctx.restore()
  }

  // Trunk — soft cool-cream sun-rim, warm brown body
  const trunkGrad = ctx.createRadialGradient(
    r * 0.08 * LIGHT.dirX, r * 0.08 * LIGHT.dirY, 0,
    0, 0, r * 0.22
  )
  trunkGrad.addColorStop(0, '#a87a4a')
  trunkGrad.addColorStop(0.55, '#5a3820')
  trunkGrad.addColorStop(1, '#2a1a1a')
  ctx.fillStyle = trunkGrad
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2)
  ctx.fill()

  // Frond cluster knots (bright where lit)
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2
    const kx = Math.cos(ang) * r * 0.12
    const ky = Math.sin(ang) * r * 0.12
    const sunlit = (Math.cos(ang) * LIGHT.dirX + Math.sin(ang) * LIGHT.dirY) > 0
    ctx.fillStyle = sunlit ? 'rgba(150, 110, 70, 0.7)' : 'rgba(40, 35, 30, 0.7)'
    ctx.beginPath()
    ctx.arc(kx, ky, r * 0.045, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

/* ---------- Atmospheric haze ---------- */

function drawAtmospheric(ctx, w, h, cameraY) {
  // Soft white sun bloom (high-key daylight, smaller and softer than golden hour)
  const sunX = w * 0.66
  const sunY = wToS(W.oceanEnd * h, cameraY, h) - 30
  if (sunY < h + 150) {
    const bloom = ctx.createRadialGradient(
      sunX, sunY, 0,
      sunX, sunY, Math.max(w, h) * 0.40
    )
    bloom.addColorStop(0, 'rgba(255, 255, 240, 0.35)')
    bloom.addColorStop(0.25, 'rgba(255, 252, 230, 0.15)')
    bloom.addColorStop(1, 'rgba(255, 250, 220, 0)')
    ctx.fillStyle = bloom
    ctx.fillRect(0, 0, w, h)
  }

  // Cool cyan haze layered across the ocean horizon (atmospheric perspective)
  const horizonY = wToS(W.oceanEnd * h, cameraY, h)
  if (horizonY > -60 && horizonY < h + 60) {
    const haze = ctx.createLinearGradient(0, horizonY - 110, 0, horizonY + 40)
    haze.addColorStop(0, 'rgba(220, 240, 250, 0.55)')
    haze.addColorStop(0.5, 'rgba(200, 225, 240, 0.30)')
    haze.addColorStop(1, 'rgba(200, 225, 240, 0)')
    ctx.fillStyle = haze
    ctx.fillRect(0, horizonY - 110, w, 150)
  }

  // Soft cool vignette (subtle — daylight scenes don't need much edge darkening)
  const vCool = ctx.createRadialGradient(
    w / 2, h / 2, Math.min(w, h) * 0.45,
    w / 2, h / 2, Math.max(w, h) * 0.85
  )
  vCool.addColorStop(0, 'rgba(60, 90, 130, 0)')
  vCool.addColorStop(1, 'rgba(60, 90, 130, 0.22)')
  ctx.fillStyle = vCool
  ctx.fillRect(0, 0, w, h)

  // Faint cool-cream overlay across the whole frame (atmospheric tint)
  ctx.fillStyle = 'rgba(220, 235, 245, 0.04)'
  ctx.fillRect(0, 0, w, h)
}

/* ---------- Car + dupatta sequence ---------- */

function drawCarSequence(ctx, w, h, carScreenY, t, reducedMotion, introT) {
  // Slightly larger, wider proportions for visible detail
  const carW = Math.min(Math.max(w * 0.11, 78), 144)
  const carL = carW * 2.35
  const cx = w / 2

  // Skip if car is comfortably off-screen
  if (carScreenY - carL * 0.5 > h + 40) return
  if (carScreenY + carL * 0.5 < -40) return

  // Dupatta — long flowing train trailing behind the car (a wedding red-veil
  // motif). Scaled to ~55% of viewport height so it feels dramatic from above.
  const dupattaLen = Math.min(Math.max(h * 0.55, 420), 720)
  const attachY = carScreenY + carL * 0.5 - 4
  const dupattaEndY = attachY + dupattaLen
  if (dupattaEndY > 0 && attachY < h) {
    drawDupatta(ctx, cx, attachY, dupattaEndY, w, t, reducedMotion)
  }

  if (carScreenY + carL * 0.5 > -10 && carScreenY - carL * 0.5 < h + 10) {
    drawCar(ctx, cx, carScreenY, carW, carL, t, reducedMotion, introT)
  }
}

function drawCar(ctx, cx, cy, cw, cl, t, reducedMotion, introT) {
  const bob = reducedMotion ? 0 : Math.sin(t * 9) * 0.35
  const yaw = reducedMotion ? 0 : Math.sin(t * 1.2) * 0.0035
  const speed = introT > 4 && introT < 7 ? Math.min((introT - 4) / 2, 1) : 0

  ctx.save()
  ctx.translate(cx, cy + bob)
  ctx.rotate(yaw)

  /* ====== Shadows beneath the car ====== */

  // Soft cool blue-grey cast shadow (sun is high — short shadow, lower-left)
  const longShadow = ctx.createRadialGradient(0, 0, 0, 0, 0, cl * 0.6)
  longShadow.addColorStop(0, 'rgba(70, 90, 120, 0.50)')
  longShadow.addColorStop(0.6, 'rgba(70, 90, 120, 0.20)')
  longShadow.addColorStop(1, 'rgba(70, 90, 120, 0)')
  ctx.fillStyle = longShadow
  ctx.save()
  ctx.translate(-cw * 0.08, cl * 0.10)
  ctx.rotate(-0.06)
  ctx.beginPath()
  ctx.ellipse(0, 0, cw * 0.85, cl * 0.56, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // Tighter contact shadow (cool blue-grey, deeper near body)
  ctx.fillStyle = 'rgba(40, 60, 90, 0.55)'
  ctx.beginPath()
  ctx.ellipse(-cw * 0.04, cl * 0.04, cw * 0.50, cl * 0.45, 0, 0, Math.PI * 2)
  ctx.fill()

  // Motion blur ghost — pale sky-blue tint matching new body
  if (speed > 0.2) {
    ctx.save()
    ctx.globalAlpha = 0.16 * speed
    ctx.fillStyle = '#c8dce8'
    roundRect(ctx, -cw * 0.42, -cl / 2 + 7 * speed, cw * 0.84, cl, cw * 0.10)
    ctx.fill()
    ctx.restore()
  }

  /* ====== Fender bulges (drawn before body so they protrude past it) ====== */
  // Each fender hosts one wheel. Fender positions are at the cabin's outer
  // edge (±0.42 cw); the bulge extends ~0.18 cw past the body line.
  const fenderShape = (fx, fy) => {
    ctx.beginPath()
    ctx.ellipse(fx, fy, cw * 0.18, cl * 0.135, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  for (const f of [
    { x: -cw * 0.42, y: -cl * 0.32, sun: false },
    { x: cw * 0.42, y: -cl * 0.32, sun: true },
    { x: -cw * 0.42, y: cl * 0.30, sun: false },
    { x: cw * 0.42, y: cl * 0.30, sun: true },
  ]) {
    // Highlight origin pulled toward the sun
    const hlX = f.x + cw * 0.10 * LIGHT.dirX
    const hlY = f.y + cw * 0.10 * LIGHT.dirY
    const grad = ctx.createRadialGradient(hlX, hlY, 0, f.x, f.y, cw * 0.20)
    if (f.sun) {
      grad.addColorStop(0, '#e8f0f8')   // bright sky-fill rim
      grad.addColorStop(0.45, '#90a8c0')
      grad.addColorStop(1, '#3a4858')   // deep cool shadow under fender
    } else {
      grad.addColorStop(0, '#7a8aa0')   // cool grey upper edge
      grad.addColorStop(0.5, '#3a4858')
      grad.addColorStop(1, '#1c2838')   // deepest cool shadow under fender
    }
    ctx.fillStyle = grad
    fenderShape(f.x, f.y)
  }

  /* ====== Main body — vintage convertible, pale sky-blue with bright rim ====== */

  // Cool shadow on the left, pale sky-blue mid, bright sun-fill on the right.
  const bodyGrad = ctx.createLinearGradient(-cw * 0.42, 0, cw * 0.42, 0)
  bodyGrad.addColorStop(0, '#3a4858')   // deep cool shadow edge
  bodyGrad.addColorStop(0.12, '#6a7a90')
  bodyGrad.addColorStop(0.32, '#a8c0d0')
  bodyGrad.addColorStop(0.5, '#d8e8f0')   // pale sky-blue mid
  bodyGrad.addColorStop(0.7, '#e4f0f6')
  bodyGrad.addColorStop(0.88, '#f4f8fc')   // bright cool-cream rim
  bodyGrad.addColorStop(1, '#dceaf4')
  ctx.fillStyle = bodyGrad
  roundRect(ctx, -cw * 0.42, -cl / 2, cw * 0.84, cl, cw * 0.10)
  ctx.fill()

  // Length-direction shading: bright hood front, soft cool shadow rear
  const lengthGrad = ctx.createLinearGradient(0, -cl / 2, 0, cl / 2)
  lengthGrad.addColorStop(0, 'rgba(255, 252, 240, 0.18)')   // sky-bright on hood
  lengthGrad.addColorStop(0.10, 'rgba(0, 0, 0, 0)')
  lengthGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.05)')
  lengthGrad.addColorStop(0.90, 'rgba(40, 60, 90, 0)')
  lengthGrad.addColorStop(1, 'rgba(40, 60, 90, 0.28)')   // soft cool shadow at rear
  ctx.fillStyle = lengthGrad
  roundRect(ctx, -cw * 0.42, -cl / 2, cw * 0.84, cl, cw * 0.10)
  ctx.fill()

  // Bright cool-white specular on hood (sun reflection)
  ctx.save()
  const hoodHi = ctx.createRadialGradient(
    cw * 0.10, -cl * 0.36, 0,
    cw * 0.10, -cl * 0.36, cw * 0.42
  )
  hoodHi.addColorStop(0, 'rgba(255, 255, 250, 0.60)')
  hoodHi.addColorStop(0.4, 'rgba(240, 250, 255, 0.20)')
  hoodHi.addColorStop(1, 'rgba(240, 250, 255, 0)')
  ctx.fillStyle = hoodHi
  roundRect(ctx, -cw * 0.42, -cl / 2, cw * 0.84, cl, cw * 0.10)
  ctx.fill()
  ctx.restore()

  /* ====== Front section ====== */

  // Front bumper (chrome — bright on right, cool on left)
  const bumperFrontGrad = ctx.createLinearGradient(-cw * 0.42, 0, cw * 0.42, 0)
  bumperFrontGrad.addColorStop(0, '#5a6878')   // cool shadow side
  bumperFrontGrad.addColorStop(0.5, '#c0c8d0')   // chrome mid
  bumperFrontGrad.addColorStop(1, '#f4f8fc')   // bright sun-fill rim
  ctx.fillStyle = bumperFrontGrad
  roundRect(ctx, -cw * 0.42, -cl * 0.5, cw * 0.84, 5, 2)
  ctx.fill()

  // Front grille (recessed deep)
  ctx.fillStyle = '#1a1c22'
  roundRect(ctx, -cw * 0.28, -cl * 0.5 + 6, cw * 0.56, cl * 0.06, 2)
  ctx.fill()
  // Grille slats — bright cool-cream catch
  ctx.strokeStyle = 'rgba(220, 230, 240, 0.55)'
  ctx.lineWidth = 0.6
  for (let i = -3; i <= 3; i++) {
    const gy = -cl * 0.5 + 7 + i * 1.4
    ctx.beginPath()
    ctx.moveTo(-cw * 0.26, gy)
    ctx.lineTo(cw * 0.26, gy)
    ctx.stroke()
  }
  // Grille top highlight
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)'
  ctx.fillRect(-cw * 0.28, -cl * 0.5 + 6, cw * 0.56, 0.6)

  // Headlights — sun is up; glass reflects the cool sky
  for (const sign of [-1, 1]) {
    const hx = sign * cw * 0.30
    const hy = -cl * 0.5 + 11
    const hr = cw * 0.055
    // Subtle cool-cream halo (sun reflection, lamps off)
    const halo = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr * 2.0)
    halo.addColorStop(0, 'rgba(240, 250, 255, 0.30)')
    halo.addColorStop(1, 'rgba(240, 250, 255, 0)')
    ctx.fillStyle = halo
    ctx.fillRect(hx - hr * 2.5, hy - hr * 2.5, hr * 5, hr * 5)
    // Chrome rim
    ctx.fillStyle = sign > 0 ? '#c8d0d8' : '#7a8a98'
    ctx.beginPath()
    ctx.arc(hx, hy, hr, 0, Math.PI * 2)
    ctx.fill()
    // Glass — pale cool catching sky
    const glass = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr * 0.85)
    glass.addColorStop(0, '#e8f0f8')
    glass.addColorStop(0.6, '#a8b8c8')
    glass.addColorStop(1, '#586878')
    ctx.fillStyle = glass
    ctx.beginPath()
    ctx.arc(hx, hy, hr * 0.8, 0, Math.PI * 2)
    ctx.fill()
    // Bright specular dot (sun side)
    ctx.fillStyle = 'rgba(255, 255, 250, 0.85)'
    ctx.beginPath()
    ctx.arc(hx + hr * 0.25, hy - hr * 0.25, hr * 0.30, 0, Math.PI * 2)
    ctx.fill()
  }

  // Hood ornament — cool chrome figurine
  ctx.fillStyle = '#e0e6ec'
  ctx.beginPath()
  ctx.ellipse(0, -cl * 0.40, 1.7, 4.2, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#6a7888'
  ctx.beginPath()
  ctx.ellipse(0, -cl * 0.40, 1.0, 3.4, 0, 0, Math.PI * 2)
  ctx.fill()
  // Bright specular catch
  ctx.fillStyle = 'rgba(255, 255, 250, 0.85)'
  ctx.beginPath()
  ctx.arc(0.5, -cl * 0.41, 0.6, 0, Math.PI * 2)
  ctx.fill()

  // Hood crease lines — cool shadow on left, bright catch on right
  ctx.strokeStyle = 'rgba(40, 60, 90, 0.32)'
  ctx.lineWidth = 0.7
  ctx.beginPath()
  ctx.moveTo(-cw * 0.18, -cl * 0.39)
  ctx.lineTo(-cw * 0.10, -cl * 0.20)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cw * 0.18, -cl * 0.39)
  ctx.lineTo(cw * 0.10, -cl * 0.20)
  ctx.stroke()
  // Bright catch alongside right crease (sun side)
  ctx.strokeStyle = 'rgba(255, 255, 240, 0.32)'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(cw * 0.19, -cl * 0.38)
  ctx.lineTo(cw * 0.11, -cl * 0.20)
  ctx.stroke()

  // Hood/cabin panel divider
  ctx.strokeStyle = 'rgba(40, 60, 90, 0.50)'
  ctx.lineWidth = 1.0
  ctx.beginPath()
  ctx.moveTo(-cw * 0.41, -cl * 0.18)
  ctx.lineTo(cw * 0.41, -cl * 0.18)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255, 255, 250, 0.22)'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(-cw * 0.41, -cl * 0.18 + 1)
  ctx.lineTo(cw * 0.41, -cl * 0.18 + 1)
  ctx.stroke()

  /* ====== Windshield — reflects the spring sky (cyan + soft white) ====== */

  const wsGrad = ctx.createLinearGradient(0, -cl * 0.18, 0, -cl * 0.06)
  wsGrad.addColorStop(0, 'rgba(150, 200, 230, 0.88)')   // pale cyan sky reflection top
  wsGrad.addColorStop(0.5, 'rgba(60, 100, 140, 0.92)')   // mid sky-blue
  wsGrad.addColorStop(1, 'rgba(20, 35, 55, 0.95)')   // deep glass bottom
  ctx.fillStyle = wsGrad
  ctx.beginPath()
  ctx.moveTo(-cw * 0.40, -cl * 0.18)
  ctx.lineTo(-cw * 0.34, -cl * 0.07)
  ctx.lineTo(cw * 0.34, -cl * 0.07)
  ctx.lineTo(cw * 0.40, -cl * 0.18)
  ctx.closePath()
  ctx.fill()
  // Cool sky reflection band on the shadow side
  ctx.fillStyle = 'rgba(220, 240, 250, 0.55)'
  ctx.beginPath()
  ctx.moveTo(-cw * 0.32, -cl * 0.165)
  ctx.lineTo(-cw * 0.10, -cl * 0.105)
  ctx.lineTo(-cw * 0.04, -cl * 0.105)
  ctx.lineTo(-cw * 0.28, -cl * 0.17)
  ctx.closePath()
  ctx.fill()
  // Bright sun-disc reflection on right (sun side)
  ctx.fillStyle = 'rgba(255, 255, 250, 0.60)'
  ctx.beginPath()
  ctx.moveTo(cw * 0.18, -cl * 0.165)
  ctx.lineTo(cw * 0.30, -cl * 0.13)
  ctx.lineTo(cw * 0.24, -cl * 0.13)
  ctx.lineTo(cw * 0.14, -cl * 0.17)
  ctx.closePath()
  ctx.fill()
  // Chrome windshield trim — cool-tinted
  ctx.strokeStyle = 'rgba(200, 215, 230, 0.85)'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(-cw * 0.40, -cl * 0.18)
  ctx.lineTo(-cw * 0.34, -cl * 0.07)
  ctx.lineTo(cw * 0.34, -cl * 0.07)
  ctx.lineTo(cw * 0.40, -cl * 0.18)
  ctx.stroke()

  /* ====== Open cabin (interior) — pale cream leather lit by daylight ====== */

  // Diagonal gradient: cool shadow on left, bright cream on right
  const cabinGrad = ctx.createLinearGradient(-cw * 0.40, 0, cw * 0.40, 0)
  cabinGrad.addColorStop(0, '#48505c')
  cabinGrad.addColorStop(0.4, '#7a8090')
  cabinGrad.addColorStop(0.75, '#b8b8b0')
  cabinGrad.addColorStop(1, '#dcd8c4')   // pale cream leather catching sun
  ctx.fillStyle = cabinGrad
  roundRect(ctx, -cw * 0.40, -cl * 0.07, cw * 0.80, cl * 0.38, 5)
  ctx.fill()

  // Leather seat texture — cool blue-grey flecks
  ctx.fillStyle = 'rgba(60, 75, 95, 0.45)'
  for (let i = 0; i < 30; i++) {
    const sx = -cw * 0.38 + (i * 11) % (cw * 0.76)
    const sy = -cl * 0.05 + ((i * 19) % (cl * 0.34))
    ctx.fillRect(sx, sy, 1, 1)
  }
  // Bright catch-light flecks (sun side only)
  ctx.fillStyle = 'rgba(255, 250, 230, 0.45)'
  for (let i = 0; i < 14; i++) {
    const sx = (i * 13) % (cw * 0.36)
    const sy = -cl * 0.05 + ((i * 17) % (cl * 0.34))
    ctx.fillRect(sx, sy, 1, 1)
  }

  // Side panel gold trim — kept gold (jewel accent against the cool cabin)
  ctx.strokeStyle = 'rgba(220, 165, 95, 0.65)'
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.moveTo(-cw * 0.38, -cl * 0.05)
  ctx.lineTo(-cw * 0.38, cl * 0.28)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cw * 0.38, -cl * 0.05)
  ctx.lineTo(cw * 0.38, cl * 0.28)
  ctx.stroke()

  /* ====== Couple (painterly aerial silhouette) ====== */
  // One unified bilobed shape (not two separate figures) — the bride and
  // groom merge into a single painted mass with a horizontal red-to-cream
  // color blend, two dark hair patches on top, and gold zari accents.
  const seatY = cl * 0.13
  const headY = -cl * 0.005
  const offX = cw * 0.080

  drawCouple(ctx, headY, seatY, cw, cl, offX)

  /* ====== Rear section ====== */

  // Trunk panel divider
  ctx.strokeStyle = 'rgba(40, 60, 90, 0.50)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(-cw * 0.41, cl * 0.30)
  ctx.lineTo(cw * 0.41, cl * 0.30)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255, 255, 250, 0.20)'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(-cw * 0.41, cl * 0.30 + 1)
  ctx.lineTo(cw * 0.41, cl * 0.30 + 1)
  ctx.stroke()

  // Trunk lid — cool shadow at the very back
  const trunkGrad = ctx.createLinearGradient(0, cl * 0.30, 0, cl * 0.46)
  trunkGrad.addColorStop(0, 'rgba(40, 60, 90, 0)')
  trunkGrad.addColorStop(1, 'rgba(40, 60, 90, 0.28)')
  ctx.fillStyle = trunkGrad
  roundRect(ctx, -cw * 0.41, cl * 0.30, cw * 0.82, cl * 0.16, 3)
  ctx.fill()

  // Brake light strips
  for (const sign of [-1, 1]) {
    const bx = sign * (cw * 0.30) - cw * 0.10
    ctx.fillStyle = '#3a0808'
    roundRect(ctx, bx, cl * 0.43, cw * 0.20, 4, 1.5)
    ctx.fill()
    const lampGrad = ctx.createLinearGradient(0, cl * 0.43, 0, cl * 0.43 + 4)
    lampGrad.addColorStop(0, '#d04030')
    lampGrad.addColorStop(0.5, '#8a1a1f')
    lampGrad.addColorStop(1, '#4a0e12')
    ctx.fillStyle = lampGrad
    roundRect(ctx, bx + 0.6, cl * 0.43 + 0.6, cw * 0.20 - 1.2, 2.8, 1)
    ctx.fill()
  }

  // License plate — pale cream
  ctx.fillStyle = '#f0ecd8'
  roundRect(ctx, -cw * 0.10, cl * 0.43, cw * 0.20, 4.5, 0.8)
  ctx.fill()
  ctx.strokeStyle = 'rgba(50, 60, 80, 0.55)'
  ctx.lineWidth = 0.6
  ctx.strokeRect(-cw * 0.10, cl * 0.43, cw * 0.20, 4.5)

  // Rear bumper (chrome — cool shadow on left, bright on right)
  const bumperRearGrad = ctx.createLinearGradient(-cw * 0.42, 0, cw * 0.42, 0)
  bumperRearGrad.addColorStop(0, '#5a6878')
  bumperRearGrad.addColorStop(0.5, '#a8b4c0')
  bumperRearGrad.addColorStop(1, '#f4f8fc')
  ctx.fillStyle = bumperRearGrad
  roundRect(ctx, -cw * 0.42, cl * 0.5 - 5, cw * 0.84, 5, 2)
  ctx.fill()

  // Exhaust pipes
  ctx.fillStyle = '#1a1c22'
  ctx.beginPath()
  ctx.arc(-cw * 0.28, cl * 0.5 - 0.5, 1.6, 0, Math.PI * 2)
  ctx.arc(cw * 0.28, cl * 0.5 - 0.5, 1.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#a8b4c0'
  ctx.beginPath()
  ctx.arc(-cw * 0.28, cl * 0.5 - 0.5, 0.9, 0, Math.PI * 2)
  ctx.arc(cw * 0.28, cl * 0.5 - 0.5, 0.9, 0, Math.PI * 2)
  ctx.fill()

  /* ====== Side details ====== */

  // Side mirrors — cool chrome both sides, brighter on sun side
  ctx.fillStyle = '#7a8a98'
  ctx.beginPath()
  ctx.ellipse(-cw * 0.42 - 2, -cl * 0.10, 3.5, 5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#dce4ec'
  ctx.beginPath()
  ctx.ellipse(cw * 0.42 + 2, -cl * 0.10, 3.5, 5, 0, 0, Math.PI * 2)
  ctx.fill()
  // Mirror glass (cool reflection of sky)
  ctx.fillStyle = '#2a3848'
  ctx.beginPath()
  ctx.ellipse(-cw * 0.42 - 2, -cl * 0.10, 2.2, 3.5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(cw * 0.42 + 2, -cl * 0.10, 2.2, 3.5, 0, 0, Math.PI * 2)
  ctx.fill()

  // Door handles — cool on shadow side, bright chrome on sun side
  ctx.fillStyle = '#7a8a98'
  ctx.fillRect(-cw * 0.42 + 4, cl * 0.06, 5, 1.5)
  ctx.fillStyle = '#dce4ec'
  ctx.fillRect(cw * 0.42 - 9, cl * 0.06, 5, 1.5)

  /* ====== Wheels (drawn last so they sit inside the fender bulges) ====== */

  for (const corner of [
    { x: -cw * 0.42, y: -cl * 0.32 },
    { x: cw * 0.42, y: -cl * 0.32 },
    { x: -cw * 0.42, y: cl * 0.30 },
    { x: cw * 0.42, y: cl * 0.30 },
  ]) {
    drawWheel(ctx, corner.x, corner.y, cw, cl)
  }

  /* ====== Outer body trim (chrome edge) ====== */

  // Cool shadow inner edge
  ctx.strokeStyle = 'rgba(60, 80, 110, 0.50)'
  ctx.lineWidth = 0.8
  roundRect(ctx, -cw * 0.42 + 0.5, -cl / 2 + 0.5, cw * 0.84 - 1, cl - 1, cw * 0.10)
  ctx.stroke()
  // Bright sun-rim catch on the right edge only
  ctx.strokeStyle = 'rgba(255, 255, 250, 0.50)'
  ctx.lineWidth = 0.6
  ctx.beginPath()
  ctx.moveTo(cw * 0.42, -cl / 2 + cw * 0.10)
  ctx.lineTo(cw * 0.42, cl / 2 - cw * 0.10)
  ctx.stroke()

  ctx.restore()
}

/* ---------- Wheel ---------- */

function drawWheel(ctx, x, y, cw, cl) {
  const wW = 8.5  // width (across the car)
  const wL = cl * 0.13 // length (along travel)

  // Outer tire (deep cool black)
  ctx.fillStyle = '#0c0a14'
  roundRect(ctx, x - wW / 2 - 1, y - wL / 2, wW + 2, wL, 1)
  ctx.fill()

  // Whitewall band — characteristic of vintage convertibles
  const wallGrad = ctx.createLinearGradient(x - wW / 2, 0, x + wW / 2, 0)
  wallGrad.addColorStop(0, '#9aa4b0')   // cool shadow side
  wallGrad.addColorStop(0.5, '#e8eef2')   // bright cream mid
  wallGrad.addColorStop(1, '#f8fafc')   // bright sun rim
  ctx.fillStyle = wallGrad
  roundRect(ctx, x - wW / 2 + 0.4, y - wL / 2 + 0.5, wW - 0.8, wL - 1, 0.8)
  ctx.fill()

  // Hub cap (chrome with bright catch)
  const hubGrad = ctx.createRadialGradient(
    x + wW * 0.15, y - wL * 0.15, 0,
    x, y, wW * 0.45
  )
  hubGrad.addColorStop(0, '#f0f4f8')   // bright specular
  hubGrad.addColorStop(0.5, '#a8b4c0')
  hubGrad.addColorStop(1, '#3a4858')   // cool deep edge
  ctx.fillStyle = hubGrad
  roundRect(ctx, x - wW / 2 + 1.5, y - wL / 2 + 2, wW - 3, wL - 4, 0.6)
  ctx.fill()

  // Center hub (small dark circle with cool ring)
  ctx.fillStyle = '#2a3848'
  ctx.beginPath()
  ctx.arc(x, y, 1.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(220, 230, 240, 0.65)'
  ctx.lineWidth = 0.4
  ctx.beginPath()
  ctx.arc(x, y, 1.6, 0, Math.PI * 2)
  ctx.stroke()

  // 4 spoke hints (vintage detail)
  ctx.strokeStyle = 'rgba(255, 255, 250, 0.32)'
  ctx.lineWidth = 0.4
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    ctx.beginPath()
    ctx.moveTo(x + Math.cos(a) * 1.6, y + Math.sin(a) * 1.6)
    ctx.lineTo(x + Math.cos(a) * (wW * 0.35), y + Math.sin(a) * (wL * 0.35))
    ctx.stroke()
  }

  // Top sheen (bright cool catch)
  ctx.fillStyle = 'rgba(255, 255, 250, 0.22)'
  ctx.fillRect(x - wW / 2, y - wL / 2 + 0.5, wW, 1)
}

/* ---------- Couple (painterly aerial silhouette) ---------- */

// Option A: a single unified painted shape representing both figures embracing.
// The body is a bilobed silhouette (slight inward dip at the top centerline so
// the two heads can sit on the lobes) filled with a horizontal red→cream
// gradient. Soft feathered edges and broken gold zari accents along the rim
// give it a watercolor / hand-painted feel. Two small head patches on top
// (bride dark hair, groom red turban with pearl) give the figurative reading.

// Bilobed silhouette path — wider than tall, with a subtle inward curve at the
// top center between where the two heads sit.
function drawCoupleBodyPath(ctx, cy, halfW, halfH, dipDepth) {
  ctx.beginPath()
  // Left edge → up to left lobe top
  ctx.moveTo(-halfW, cy)
  ctx.bezierCurveTo(
    -halfW, cy - halfH * 1.05,
    -halfW * 0.55, cy - halfH * 1.02,
    -halfW * 0.32, cy - halfH * 0.88
  )
  // Top dip in the middle (the seam where the two heads sit)
  ctx.quadraticCurveTo(0, cy - halfH * (0.88 - dipDepth), halfW * 0.32, cy - halfH * 0.88)
  // Right lobe top → right edge
  ctx.bezierCurveTo(
    halfW * 0.55, cy - halfH * 1.02,
    halfW, cy - halfH * 1.05,
    halfW, cy
  )
  // Smooth bottom (no dip — lap is one continuous curve)
  ctx.bezierCurveTo(
    halfW, cy + halfH * 1.05,
    halfW * 0.5, cy + halfH * 1.02,
    0, cy + halfH * 0.98
  )
  ctx.bezierCurveTo(
    -halfW * 0.5, cy + halfH * 1.02,
    -halfW, cy + halfH * 1.05,
    -halfW, cy
  )
  ctx.closePath()
}

function drawCouple(ctx, headY, seatY, cw, cl, offX) {
  const cy = (headY + seatY) * 0.5
  const lobeR = cw * 0.078
  const halfW = offX + lobeR        // span from outer-bride edge to outer-groom edge
  const halfH = lobeR * 1.05        // slightly taller than each lobe radius

  // ===== 1. Cool drop shadow under the whole couple =====
  ctx.fillStyle = 'rgba(40, 60, 90, 0.50)'
  ctx.beginPath()
  ctx.ellipse(-halfW * 0.10, cy + halfH * 0.32, halfW * 1.05, halfH * 0.40, 0, 0, Math.PI * 2)
  ctx.fill()

  // ===== 2. Soft feathered edge — three passes of expanding low-alpha shape =====
  // Each pass paints a slightly larger version of the silhouette at low opacity,
  // giving the rim a watercolor "bloom" instead of a crisp circle outline.
  for (const pass of [
    { scale: 1.18, alpha: 0.10 },
    { scale: 1.10, alpha: 0.16 },
    { scale: 1.04, alpha: 0.24 },
  ]) {
    const fGrad = ctx.createLinearGradient(-halfW * pass.scale, 0, halfW * pass.scale, 0)
    fGrad.addColorStop(0, `rgba(180, 30, 40, ${pass.alpha})`)
    fGrad.addColorStop(0.5, `rgba(220, 130, 90, ${pass.alpha})`)
    fGrad.addColorStop(1, `rgba(245, 215, 160, ${pass.alpha})`)
    ctx.fillStyle = fGrad
    drawCoupleBodyPath(ctx, cy, halfW * pass.scale, halfH * pass.scale, 0.18)
    ctx.fill()
  }

  // ===== 3. Main body — bilobed silhouette with horizontal red→cream gradient =====
  // The blend zone (around 0.5) shifts through warm coral/rust so the colors
  // don't hard-cut from red to cream — they bleed like watercolor.
  const bodyGrad = ctx.createLinearGradient(-halfW, 0, halfW, 0)
  bodyGrad.addColorStop(0, '#a8181f')      // deep red on the bride's outer edge
  bodyGrad.addColorStop(0.20, '#e84450')   // bright bridal red
  bodyGrad.addColorStop(0.42, '#c8504a')   // transitional coral
  bodyGrad.addColorStop(0.55, '#d49060')   // blend zone (warm rust)
  bodyGrad.addColorStop(0.72, '#dcc488')   // begin cream
  bodyGrad.addColorStop(0.90, '#f0d8a0')   // brighter cream
  bodyGrad.addColorStop(1, '#a08858')      // deeper cream on the groom's outer edge
  ctx.fillStyle = bodyGrad
  drawCoupleBodyPath(ctx, cy, halfW, halfH, 0.18)
  ctx.fill()

  // ===== 4. Vertical light wash (sun on top, shadow at the bottom) =====
  const vertGrad = ctx.createLinearGradient(0, cy - halfH, 0, cy + halfH)
  vertGrad.addColorStop(0, 'rgba(255, 255, 240, 0.20)')
  vertGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0)')
  vertGrad.addColorStop(1, 'rgba(40, 60, 90, 0.20)')
  ctx.fillStyle = vertGrad
  drawCoupleBodyPath(ctx, cy, halfW, halfH, 0.18)
  ctx.fill()

  // ===== 5. Two head patches (one per lobe, slightly forward) =====
  const headR = lobeR * 0.48
  const headOffsetY = -halfH * 0.18   // heads sit forward of body center
  for (const sign of [-1, 1]) {
    const hx = sign * offX
    const hy = cy + headOffsetY
    const isBride = sign < 0

    // Soft halo under the head so it sits on the body, not floats on top
    ctx.fillStyle = 'rgba(20, 10, 30, 0.18)'
    ctx.beginPath()
    ctx.arc(hx, hy + 1, headR * 1.05, 0, Math.PI * 2)
    ctx.fill()

    // Head body — directional radial gradient
    const headGrad = ctx.createRadialGradient(
      hx + headR * 0.4 * LIGHT.dirX, hy + headR * 0.4 * LIGHT.dirY, 0,
      hx, hy, headR
    )
    if (isBride) {
      // Dark hair under the open part of the veil
      headGrad.addColorStop(0, '#5a3220')
      headGrad.addColorStop(0.6, '#2c160a')
      headGrad.addColorStop(1, '#08040a')
    } else {
      // Red turban (safa)
      headGrad.addColorStop(0, '#ff5860')
      headGrad.addColorStop(0.55, '#a8181f')
      headGrad.addColorStop(1, '#3a0810')
    }
    ctx.fillStyle = headGrad
    ctx.beginPath()
    ctx.arc(hx, hy, headR, 0, Math.PI * 2)
    ctx.fill()

    // Specular highlight on the sun-facing side
    ctx.fillStyle = isBride
      ? 'rgba(180, 130, 90, 0.55)'
      : 'rgba(255, 220, 200, 0.65)'
    ctx.beginPath()
    ctx.arc(hx + headR * 0.30, hy - headR * 0.30, headR * 0.22, 0, Math.PI * 2)
    ctx.fill()

    // Groom: gold front band on turban + tiny kalgi pearl
    if (!isBride) {
      ctx.strokeStyle = 'rgba(245, 195, 95, 0.85)'
      ctx.lineWidth = 0.7
      ctx.beginPath()
      ctx.arc(hx, hy, headR * 0.85, Math.PI * 1.20, Math.PI * 1.80)
      ctx.stroke()
      ctx.fillStyle = '#fff8e0'
      ctx.beginPath()
      ctx.arc(hx, hy - headR * 0.55, 1.0, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // ===== 6. Broken gold zari accents along the rim (painterly dotted trim) =====
  // 32 candidate positions around the rim, but we skip a deterministic subset
  // (every 5th and a couple of clustered gaps) so the trim looks hand-applied
  // rather than mechanical.
  for (let i = 0; i < 32; i++) {
    if ((i * 13) % 5 === 0) continue
    if (i >= 13 && i <= 15) continue   // small gap on the front-right
    if (i >= 26 && i <= 27) continue   // small gap on the rear-left
    const u = i / 32
    const ang = u * Math.PI * 2
    // Approximate the bilobed perimeter with an ellipse — close enough for
    // dot placement since we're well inside the painted silhouette.
    const px = Math.cos(ang) * halfW * 0.97
    const py = cy + Math.sin(ang) * halfH * 0.97
    ctx.fillStyle = 'rgba(245, 195, 95, 0.82)'
    ctx.beginPath()
    ctx.arc(px, py, 0.6 + (i % 3) * 0.18, 0, Math.PI * 2)
    ctx.fill()
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

/* ---------- Dupatta ---------- */

function drawDupatta(ctx, cx, attachY, endY, w, t, reducedMotion) {
  const length = endY - attachY
  if (length < 12) return
  if (attachY > endY) return

  // Wider, longer dupatta to match the cinematic reference. Width tapers only
  // mildly (tip is ~75% of base) so the train reads as a flowing rectangle
  // rather than a narrow ribbon.
  const baseHalf = Math.min(Math.max(w * 0.085, 50), 110)
  const tipHalf = Math.min(Math.max(w * 0.065, 36), 84)

  const wave = reducedMotion ? 0 : 14
  const phase = t * 1.3

  ctx.save()

  // Soft cool drop shadow on the ground (sun is high — short shadow)
  ctx.fillStyle = 'rgba(70, 95, 130, 0.38)'
  drawDupattaShape(ctx, cx + 1, attachY + 3, endY + 3, baseHalf + 2, tipHalf + 2, wave, phase)

  // Lotus pink dupatta — paler near the bride, deeper rose at the tip
  const grad = ctx.createLinearGradient(cx, attachY, cx, endY)
  grad.addColorStop(0, LOTUS.light)   // #ffc0d8
  grad.addColorStop(0.4, LOTUS.mid)
  grad.addColorStop(1, LOTUS.deep)    // #d04880
  ctx.fillStyle = grad
  drawDupattaShape(ctx, cx, attachY, endY, baseHalf, tipHalf, wave, phase)

  // Pale pink sheen along the centerline (silk catching daylight)
  const sheen = ctx.createLinearGradient(cx - baseHalf, 0, cx + baseHalf, 0)
  sheen.addColorStop(0, 'rgba(255,255,255,0)')
  sheen.addColorStop(0.45, 'rgba(255,228,239,0.40)')
  sheen.addColorStop(0.55, 'rgba(255,228,239,0.45)')
  sheen.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = sheen
  drawDupattaShape(ctx, cx, attachY, endY, baseHalf * 0.85, tipHalf * 0.7, wave, phase)

  // Embroidery dots scattered across the train (more dots for the larger size)
  ctx.fillStyle = 'rgba(255, 248, 232, 0.55)'
  const dots = 38
  for (let i = 0; i < dots; i++) {
    const u = i / dots
    const half = baseHalf + (tipHalf - baseHalf) * u
    const localPhase = phase + u * 4
    const sway = Math.sin(localPhase) * wave * (0.4 + u * 0.4)
    const xJitter = ((i * 137) % 100) / 100 - 0.5
    const dotX = cx + sway + xJitter * half * 1.4
    const dotY = attachY + length * u
    ctx.beginPath()
    ctx.arc(dotX, dotY, 1.8, 0, Math.PI * 2)
    ctx.fill()
  }

  // Gold zari edge stitching along both sides
  ctx.strokeStyle = 'rgba(212, 160, 64, 0.7)'
  ctx.lineWidth = 1.6
  drawDupattaEdges(ctx, cx, attachY, endY, baseHalf, tipHalf, wave, phase)

  // Tassels at the OUTER CORNERS of the tip — gold cord + tassel head + strands
  const sway1 = Math.sin(phase) * wave
  const sway2 = Math.sin(phase + 1.0) * wave
  for (const sign of [-1, 1]) {
    // The tip corners have already been swayed in drawDupattaShape — we mirror
    // that motion here so the tassels stay anchored to the corners.
    const cornerX = cx + sign * tipHalf - sway2 * sign
    const cornerY = endY
    // Connecting cord
    ctx.strokeStyle = '#d4a040'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(cornerX, cornerY)
    ctx.lineTo(cornerX, cornerY + 12)
    ctx.stroke()
    // Tassel head (round gold bead)
    const headY = cornerY + 14
    ctx.fillStyle = '#d4a040'
    ctx.beginPath()
    ctx.arc(cornerX, headY, 3.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 230, 170, 0.8)'
    ctx.beginPath()
    ctx.arc(cornerX - 0.8, headY - 0.8, 1.2, 0, Math.PI * 2)
    ctx.fill()
    // Hanging strands fanning from the tassel head
    ctx.strokeStyle = '#a87a30'
    ctx.lineWidth = 0.8
    for (let s = -3; s <= 3; s++) {
      ctx.beginPath()
      ctx.moveTo(cornerX + s * 0.3, headY + 2)
      ctx.lineTo(cornerX + s * 1.0, headY + 11)
      ctx.stroke()
    }
  }
  // Suppress unused-var lint
  void sway1

  ctx.restore()
}

function drawDupattaShape(ctx, cx, startY, endY, baseHalf, tipHalf, wave, phase) {
  const length = endY - startY
  const sway1 = Math.sin(phase) * wave
  const sway2 = Math.sin(phase + 1.0) * wave
  ctx.beginPath()
  ctx.moveTo(cx - baseHalf, startY)
  ctx.bezierCurveTo(
    cx - baseHalf + sway1, startY + length * 0.4,
    cx - tipHalf - sway2, startY + length * 0.72,
    cx - tipHalf, endY
  )
  ctx.lineTo(cx + tipHalf, endY)
  ctx.bezierCurveTo(
    cx + tipHalf - sway2, startY + length * 0.72,
    cx + baseHalf + sway1, startY + length * 0.4,
    cx + baseHalf, startY
  )
  ctx.closePath()
  ctx.fill()
}

function drawDupattaEdges(ctx, cx, startY, endY, baseHalf, tipHalf, wave, phase) {
  const length = endY - startY
  const sway1 = Math.sin(phase) * wave
  const sway2 = Math.sin(phase + 1.0) * wave

  ctx.beginPath()
  ctx.moveTo(cx - baseHalf, startY)
  ctx.bezierCurveTo(
    cx - baseHalf + sway1, startY + length * 0.4,
    cx - tipHalf - sway2, startY + length * 0.72,
    cx - tipHalf, endY
  )
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(cx + baseHalf, startY)
  ctx.bezierCurveTo(
    cx + baseHalf + sway1, startY + length * 0.4,
    cx + tipHalf - sway2, startY + length * 0.72,
    cx + tipHalf, endY
  )
  ctx.stroke()
}

/* ---------- Cherry blossom particles ---------- */

// Each petal drifts down from above the viewport, tumbling on rotation and
// swaying on a sine wave for a wind-blown feel. Petals are spawned every frame
// by the main draw loop and recycled when they leave the viewport.
//
// On the very first frame we PRE-POPULATE the array with petals at random Y
// positions across the viewport — so the scene already looks like it's mid-
// blossom-fall when the intro begins, rather than starting empty and slowly
// filling up.
function spawnAndDrawBlossoms(ctx, w, h, t, dt, blossoms, spawnAccum, initRef, intensity = 1) {
  if (!initRef.current) {
    initRef.current = true
    // Pre-populate ~55 petals scattered across the whole viewport so the scene
    // begins mid-shower instead of slowly filling up.
    for (let i = 0; i < 55; i++) {
      const p = newBlossom(w)
      p.y = Math.random() * (h + 60) - 30
      blossoms.push(p)
    }
  }

  // Spawn rate scales with intensity — no new petals during fade-outs.
  if (intensity > 0.05) {
    spawnAccum.current += dt * 12 * intensity
    while (spawnAccum.current >= 1 && blossoms.length < 80) {
      spawnAccum.current -= 1
      blossoms.push(newBlossom(w))
    }
  }

  // Fully faded — clear so memory doesn't grow during long off periods
  if (intensity <= 0) {
    blossoms.length = 0
    return
  }

  // Global wind gust — a slow, layered sine that pushes ALL petals together,
  // creating natural "swarm" motion (groups of petals drift one way, then
  // reverse together a few seconds later).
  const windGust = Math.sin(t * 0.25) * 18 + Math.sin(t * 0.55 + 1.5) * 10

  for (let i = blossoms.length - 1; i >= 0; i--) {
    const p = blossoms[i]

    // Flutter — modulates the fall speed. Real petals catch air when broadside
    // (slow fall) and slice through when edge-on (faster fall). We fake this in
    // 2D with a per-petal sine so each petal's fall pulses between ~55%–100%
    // of its base speed.
    const flutter = 0.55 + 0.45 * Math.sin(t * p.flutterFreq + p.flutterPhase)
    p.y += p.vy * flutter * dt

    // Horizontal: base velocity + global wind gust + per-petal sway
    p.x += (p.vx + windGust) * dt
         + Math.sin(t * p.swayFreq + p.seed) * p.swayAmp

    // Rotation: base spin rate + sinusoidal wobble. The wobble can briefly
    // flip the spin direction so petals look like they're tumbling in 3D.
    const angularVel = p.rotSpeed + Math.sin(t * p.rotWobbleFreq + p.seed) * p.rotWobbleAmp
    p.rot += angularVel * dt

    if (p.y > h + 30 || p.x < -60 || p.x > w + 60) {
      blossoms.splice(i, 1)
      continue
    }

    drawBlossomPetal(ctx, p, intensity)
  }
}

function newBlossom(w) {
  // Pinks ranging from pale rose to deeper lotus, plus a soft white for variety
  const colors = ['#ffe4ef', '#ffc0d8', '#ffaec8', '#fff0f4', '#ff96ba']
  // Size class doubles as a depth proxy: bigger petals (closer) fall faster
  const sizeClass = Math.random()
  const size = 4 + sizeClass * 5
  return {
    x: Math.random() * w,
    y: -30,
    vx: (Math.random() - 0.5) * 22,                  // calmer base — wind adds the gust
    vy: 22 + sizeClass * 32 + Math.random() * 14,    // 22-68 px/s base, modulated by flutter
    size,
    rot: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 2.2,           // base spin rate
    rotWobbleFreq: 1.2 + Math.random() * 2.5,        // per-petal flutter rotation freq
    rotWobbleAmp: 1.0 + Math.random() * 1.8,         // amplitude of rotation wobble
    flutterPhase: Math.random() * Math.PI * 2,       // offset so petals don't pulse in unison
    flutterFreq: 1.0 + Math.random() * 2.0,          // how fast fall speed pulses
    alpha: 0.70 + Math.random() * 0.28,
    color: colors[Math.floor(Math.random() * colors.length)],
    seed: Math.random() * 100,
    swayFreq: 0.4 + Math.random() * 0.6,
    swayAmp: 0.4 + Math.random() * 1.0,
  }
}

function drawBlossomPetal(ctx, p, intensityMultiplier = 1) {
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.rotate(p.rot)
  ctx.globalAlpha = p.alpha * intensityMultiplier

  // Cherry petal — heart-shaped (pinched at base, slightly notched at tip)
  ctx.fillStyle = p.color
  ctx.beginPath()
  ctx.moveTo(0, -p.size * 0.85)
  ctx.bezierCurveTo(
    p.size * 0.5, -p.size * 0.55,
    p.size * 0.85, p.size * 0.15,
    0, p.size
  )
  ctx.bezierCurveTo(
    -p.size * 0.85, p.size * 0.15,
    -p.size * 0.5, -p.size * 0.55,
    0, -p.size * 0.85
  )
  ctx.closePath()
  ctx.fill()

  // Tip notch (tiny darker triangle at the top — characteristic of sakura)
  ctx.fillStyle = 'rgba(208, 72, 128, 0.35)'
  ctx.beginPath()
  ctx.moveTo(0, -p.size * 0.85)
  ctx.lineTo(p.size * 0.15, -p.size * 0.65)
  ctx.lineTo(-p.size * 0.15, -p.size * 0.65)
  ctx.closePath()
  ctx.fill()

  // Center vein — slightly darker pink for definition
  ctx.strokeStyle = 'rgba(180, 80, 110, 0.40)'
  ctx.lineWidth = 0.4
  ctx.beginPath()
  ctx.moveTo(0, -p.size * 0.7)
  ctx.lineTo(0, p.size * 0.85)
  ctx.stroke()

  ctx.restore()
}
