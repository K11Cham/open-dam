import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RotateCcw, Trophy, Scale, Plus } from 'lucide-react'
import { useGameContext } from '../context/GameContext'
import { useTheme } from '../context/ThemeContext'
import { useNavigate } from 'react-router-dom'
import Button from './Button'

function Particle({ delay, color, size, startX }: { delay: number; color: string; size: number; startX: number }) {
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{ width: size, height: size, backgroundColor: color, left: startX, bottom: 0 }}
      initial={{ y: 0, opacity: 0, scale: 0.4, rotate: 0 }}
      animate={{ y: -500, opacity: [0, 1, 0.6, 0], scale: [0.4, 1, 0.4], rotate: 360 }}
      transition={{
        duration: 2.2 + Math.random() * 1,
        delay,
        repeat: Infinity,
        ease: 'linear',
      }}
    />
  )
}

export default function GameEndModal() {
  const { winner, resetBoard } = useGameContext()
  const { theme } = useTheme()
  const navigate = useNavigate()

  const isDraw = winner === 'draw'
  const accentColor = isDraw ? theme.accent
    : winner === 'player1' ? theme.p1
    : winner === 'player2' ? theme.p2
    : theme.accent

  const title = isDraw ? 'DRAW!'
    : winner === 'player1' ? 'RED WINS!'
    : 'BLUE WINS!'
  const subtitle = isDraw ? 'Both pieces remain standing' : 'Well played!'

  const particleColors = isDraw
    ? [theme.accent, '#ffffff', theme.accent, '#ffffff']
    : winner === 'player1'
    ? [theme.p1, theme.king, theme.p1, '#fff']
    : [theme.p2, theme.king, theme.p2, '#fff']

  const vw = typeof window !== 'undefined' ? window.innerWidth : 800
  const particles = Array.from({ length: 40 }, (_, i) => ({
    delay: i * 0.12,
    color: particleColors[i % particleColors.length],
    size: 6 + (i % 4) * 3,
    startX: (i / 40) * vw,
  }))

  // Lock body scroll while modal is open
  useEffect(() => {
    if (!winner) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [winner])

  const stagger = (i: number) => ({ delay: 0.1 + i * 0.08 })

  const handleRematch = () => {
    resetBoard()
  }

  const handleNewGame = () => {
    navigate('/menu')
  }

  return (
    <AnimatePresence>
      {winner && (
        <motion.div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{
            backgroundColor: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(6px)',
            overflow: 'hidden',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* Particles spread across full viewport */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {particles.map((p, i) => <Particle key={i} {...p} />)}
          </div>

          {/* Card */}
          <motion.div
            className="relative flex flex-col items-center overflow-hidden"
            style={{
              backgroundColor: theme.surface,
              borderRadius: 28,
              width: 320,
              paddingBottom: 32,
              boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
              zIndex: 1,
            }}
            initial={{ scale: 0.75, y: 60, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.85, y: 30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.1 }}
          >
            {/* Shimmer */}
            <motion.div
              className="absolute top-0 bottom-0 pointer-events-none"
              style={{
                width: 80,
                background: 'rgba(255,255,255,0.06)',
                transform: 'skewX(-20deg)',
                zIndex: 10,
              }}
              animate={{ x: [-200, 500] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            />

            {/* Accent bar */}
            <div className="w-full mb-8" style={{ height: 5, backgroundColor: accentColor }} />

            {/* Icon ring */}
            <motion.div
              className="flex items-center justify-center mb-6"
              style={{
                width: 104,
                height: 104,
                borderRadius: 52,
                border: `3px solid ${accentColor}`,
              }}
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.25 }}
            >
              <motion.div
                className="flex items-center justify-center"
                style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: accentColor }}
                animate={{ scale: [1, 1.12, 1] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: 0.9 }}
              >
                {isDraw ? <Scale size={44} color="#fff" /> : <Trophy size={44} color="#fff" />}
              </motion.div>
            </motion.div>

            {/* Title */}
            <motion.span
              className="font-bold tracking-wider text-center px-4 max-w-[260px]"
              style={{ color: theme.text, fontSize: 22 }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={stagger(3)}
            >
              {title}
            </motion.span>

            {/* Underline */}
            <motion.div
              className="mt-2 mb-2 rounded-full"
              style={{ height: 3, width: 60, backgroundColor: accentColor }}
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={stagger(3)}
            />

            {/* Subtitle */}
            <motion.span
              className="text-sm text-center px-6 mb-8"
              style={{ color: theme.textMuted, letterSpacing: '0.5px' }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={stagger(4)}
            >
              {subtitle}
            </motion.span>

            {/* Buttons */}
            <div className="flex gap-3 px-7 w-full">
              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={stagger(5)}
                className="flex-1"
              >
                <Button
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-semibold"
                  style={{ backgroundColor: accentColor, color: '#ffffff', border: 'none' }}
                  onClick={handleRematch}
                >
                  <RotateCcw size={16} />
                  Rematch
                </Button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={stagger(6)}
                className="flex-1"
              >
                <Button
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-semibold"
                  style={{ backgroundColor: 'transparent', color: theme.text, border: `1px solid ${theme.border}` }}
                  onClick={handleNewGame}
                >
                  <Plus size={16} />
                  New Game
                </Button>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}