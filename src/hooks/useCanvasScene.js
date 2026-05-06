import { useEffect, useRef } from 'react'

/**
 * Fills a <canvas> with a requestAnimationFrame loop.
 * - Scales for devicePixelRatio (capped at 2 for perf)
 * - Recomputes on resize
 * - Passes (ctx, width, height, time, dt, flags) to the draw callback
 * - Cleans up the RAF and resize listener on unmount
 *
 * Returns a ref to attach to the <canvas>.
 */
export default function useCanvasScene(drawFn) {
  const canvasRef = useRef(null)
  const drawRef = useRef(drawFn)
  drawRef.current = drawFn

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches

    let w = 0
    let h = 0
    let frame = 0

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      w = Math.max(1, Math.floor(rect.width))
      h = Math.max(1, Math.floor(rect.height))
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    window.addEventListener('resize', resize)

    const start = performance.now()
    let last = start
    const loop = (now) => {
      const t = (now - start) / 1000
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      ctx.clearRect(0, 0, w, h)
      drawRef.current(ctx, w, h, t, dt, { reducedMotion })
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)

    // Pause when tab is hidden to save battery
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame)
      } else {
        last = performance.now()
        frame = requestAnimationFrame(loop)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return canvasRef
}
