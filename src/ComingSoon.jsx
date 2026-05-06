import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { site, wedding } from './constants/wedding'
import RoadScene, { TEXT_REVEAL_DELAY } from './scenes/RoadScene'

const COUNTDOWN_REVEAL_DELAY_MS = TEXT_REVEAL_DELAY * 1000

function getTimeLeft(target) {
  const total = target.getTime() - Date.now()
  if (total <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, done: true }
  }
  const days = Math.floor(total / (1000 * 60 * 60 * 24))
  const hours = Math.floor((total / (1000 * 60 * 60)) % 24)
  const minutes = Math.floor((total / (1000 * 60)) % 60)
  const seconds = Math.floor((total / 1000) % 60)
  return { days, hours, minutes, seconds, done: false }
}

function pad(n) {
  return String(n).padStart(2, '0')
}

// Subtle text shadow keeps dark text legible on the spring-daylight sand —
// soft cool-cream glow above, gentle blue-grey drop shadow below.
const SAND_TEXT_SHADOW = {
  textShadow:
    '0 0 8px rgba(255,250,230,0.55), 0 1px 1px rgba(60,80,110,0.50)',
}

// Conch shell SVG ornament (stylized, matches the reference video's motif)
function ConchShell({ size = 36 }) {
  return (
    <svg
      width={size}
      height={size * 1.25}
      viewBox="0 0 24 30"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ filter: 'drop-shadow(0 1px 2px rgba(120,80,30,0.5))' }}
    >
      {/* Outer body */}
      <path
        d="M12 2 C7 4 4 9 4 16 C4 22 6 27 9 28 L12 28 L15 28 C18 27 20 22 20 16 C20 9 17 4 12 2 Z"
        fill="#fbf3e2"
        stroke="#5b4a2a"
        strokeWidth="0.8"
      />
      {/* Spiral ridges */}
      <path
        d="M12 5 C9 7 7.5 11 8 16 C8.3 19.5 9 22 10 25"
        fill="none"
        stroke="#a78a5a"
        strokeWidth="0.7"
        strokeLinecap="round"
      />
      <path
        d="M12 5 C15 7 16.5 11 16 16 C15.7 19.5 15 22 14 25"
        fill="none"
        stroke="#a78a5a"
        strokeWidth="0.7"
        strokeLinecap="round"
      />
      <path
        d="M12 8 C10.5 10 10 13 10.5 16"
        fill="none"
        stroke="#c4a878"
        strokeWidth="0.5"
      />
      <path
        d="M12 8 C13.5 10 14 13 13.5 16"
        fill="none"
        stroke="#c4a878"
        strokeWidth="0.5"
      />
      {/* Apex tip */}
      <path
        d="M11 2.5 L12 1 L13 2.5 Z"
        fill="#5b4a2a"
      />
      {/* Opening at base */}
      <path
        d="M9.5 27.5 L14.5 27.5 L13 29.2 L11 29.2 Z"
        fill="#d4b890"
        stroke="#5b4a2a"
        strokeWidth="0.4"
      />
    </svg>
  )
}

export default function ComingSoon() {
  const [showCountdown, setShowCountdown] = useState(false)
  const [time, setTime] = useState(() => getTimeLeft(site.launchDate))

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const delay = reduced ? 0 : COUNTDOWN_REVEAL_DELAY_MS
    const id = setTimeout(() => setShowCountdown(true), delay)
    return () => clearTimeout(id)
  }, [])

  useEffect(() => {
    if (!showCountdown) return
    const tick = () => setTime(getTimeLeft(site.launchDate))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [showCountdown])

  return (
    <main
      role="main"
      className="min-h-screen w-full overflow-hidden relative bg-[#b8dcec]"
    >
      <RoadScene />

      {/* Launch info painted on the sand after the camera settles on the beach */}
      <AnimatePresence>
        {showCountdown && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.4, ease: 'easeOut' }}
            className="absolute inset-0 z-10 flex items-center justify-center px-6 pointer-events-none"
          >
            {/* Centered column over the sand */}
            <div
              className="text-center mx-auto"
              style={{ maxWidth: 'min(420px, 84vw)', marginTop: '2vh' }}
            >
              {/* Conch shell ornament */}
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.9, delay: 0.1 }}
                className="flex justify-center mb-4"
              >
                <ConchShell size={42} />
              </motion.div>

              {/* Monogram */}
              <motion.p
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, delay: 0.3 }}
                className="font-display text-2xl md:text-3xl tracking-[0.45em] text-[#3a2a14]"
                style={SAND_TEXT_SHADOW}
              >
                {wedding.monogram}
              </motion.p>

              <motion.div
                initial={{ opacity: 0, scaleX: 0 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{ duration: 1.0, delay: 0.5 }}
                className="my-4 md:my-5 mx-auto"
                style={{
                  width: '60%',
                  height: '1px',
                  background:
                    'linear-gradient(90deg, transparent, rgba(91,74,42,0.6), transparent)',
                }}
              />

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.9, delay: 0.65 }}
                className="font-body tracking-[0.5em] text-[#5b4a2a] text-[10px] md:text-xs uppercase mb-3"
                style={SAND_TEXT_SHADOW}
              >
                Save the Date
              </motion.p>

              <motion.h1
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1.0, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
                className="font-display italic text-3xl md:text-5xl text-[#2d1f0c] mb-6 md:mb-8"
                style={SAND_TEXT_SHADOW}
              >
                {site.launchDateDisplay}
              </motion.h1>

              {time.done ? (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 1 }}
                  className="font-display italic text-2xl md:text-4xl text-[#2d1f0c]"
                  style={SAND_TEXT_SHADOW}
                >
                  The day is here
                </motion.p>
              ) : (
                <>
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.9, delay: 1.0 }}
                    className="flex items-baseline justify-center gap-1 md:gap-2 font-display tabular-nums text-[#2d1f0c]"
                    style={SAND_TEXT_SHADOW}
                  >
                    <span className="text-3xl md:text-5xl">{pad(time.days)}</span>
                    <span className="text-2xl md:text-4xl text-[#7a5a2a] px-1">:</span>
                    <span className="text-3xl md:text-5xl">{pad(time.hours)}</span>
                    <span className="text-2xl md:text-4xl text-[#7a5a2a] px-1">:</span>
                    <span className="text-3xl md:text-5xl">{pad(time.minutes)}</span>
                    <span className="text-2xl md:text-4xl text-[#7a5a2a] px-1">:</span>
                    <span className="text-3xl md:text-5xl">{pad(time.seconds)}</span>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.9, delay: 1.2 }}
                    className="flex items-baseline justify-center gap-1 md:gap-2 mt-1.5 md:mt-2 font-body uppercase text-[9px] md:text-[11px] tracking-[0.35em] text-[#5b4a2a]"
                    style={SAND_TEXT_SHADOW}
                  >
                    <span className="w-10 md:w-14 text-center">Days</span>
                    <span className="w-3 md:w-4" />
                    <span className="w-10 md:w-14 text-center">Hrs</span>
                    <span className="w-3 md:w-4" />
                    <span className="w-10 md:w-14 text-center">Min</span>
                    <span className="w-3 md:w-4" />
                    <span className="w-10 md:w-14 text-center">Sec</span>
                  </motion.div>
                </>
              )}

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1, delay: 1.6 }}
                className="font-body italic text-[#5b4a2a] text-xs md:text-sm mt-6 md:mt-10"
                style={SAND_TEXT_SHADOW}
              >
                Formal invitation to follow
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}
