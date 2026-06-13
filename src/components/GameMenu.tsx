import { useState } from 'react'
import { motion } from 'framer-motion'
import { useTheme } from '../context/ThemeContext'
import { Play, Grid3x3, Square, FolderOpen, FolderX, Save, Gamepad2 } from 'lucide-react'
import Navbar from './Navbar'
import Button from './Button'
import { useGameStorage } from '../hooks/useGameStorage'

type BoardType = 'yinyang' | 'even'
type BoardSize = 5 | 6 | 7 | 8 | 9

interface GameMenuProps {
  onStartGame: (size: BoardSize, type: BoardType, playerSide: 'player1' | 'player2', slot: number) => void
  onLoadGame?: (slot: number) => void
  onPlayAsChange?: (playAs: 'player1' | 'player2') => void
}

const NUM_SLOTS = 3

export default function GameMenu({ onStartGame, onLoadGame, onPlayAsChange }: GameMenuProps) {
  const { theme } = useTheme()
  const [selectedSize, setSelectedSize] = useState<BoardSize>(5)
  const [playAs, setPlayAs] = useState<'red' | 'blue'>('red')
  const [timeControl, setTimeControl] = useState<string>('10+1')
  const [selectedSlot, setSelectedSlot] = useState<number>(0) // always one slot selected
  const { savedGames } = useGameStorage()

  const sizes: BoardSize[] = [5, 6, 7, 8, 9]
  const timeControls = ['No time control', '10+1', '5+0', '3+0', '1+0']

  const getBoardType = (size: BoardSize): BoardType =>
    size % 2 === 0 ? 'even' : 'yinyang'

  const handleStart = () => {
    const type = getBoardType(selectedSize)
    const playerSide = playAs === 'red' ? 'player1' : 'player2'
    onStartGame(selectedSize, type, playerSide, selectedSlot + 1) // 1-based slot
  }

  const handlePlayAsChange = (newPlayAs: 'red' | 'blue') => {
    setPlayAs(newPlayAs)
    onPlayAsChange?.(newPlayAs === 'red' ? 'player1' : 'player2')
  }

  const handleSlotClick = (index: number) => {
    const hasData = savedGames[index]?.timestamp !== 0
    if (selectedSlot === index && hasData && onLoadGame) {
      // Second click on a filled selected slot = load it
      onLoadGame(index + 1)
    } else {
      setSelectedSlot(index)
    }
  }

  const { deleteSave } = useGameStorage()

  const handleDeleteSlot = (index: number, e: React.MouseEvent) => {
    e.stopPropagation()
    deleteSave(index + 1)
  }

  const formatTimestamp = (timestamp: number) => {
    if (timestamp === 0) return null
    const date = new Date(timestamp)
    return date.toLocaleDateString() + ' · ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const slots = Array.from({ length: NUM_SLOTS }, (_, i) => ({
    index: i,
    save: savedGames[i] ?? { timestamp: 0 },
    isEmpty: !savedGames[i] || savedGames[i].timestamp === 0,
  }))

  return (
    <div className="flex flex-col min-h-screen w-full" style={{ background: 'transparent' }}>
      <Navbar />
      <motion.div
        className="flex flex-col items-center justify-center flex-1 w-full p-8"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div className="flex flex-col items-center gap-7 max-w-md w-full">

          {/* Title */}
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-2" style={{ 
              background: `linear-gradient(135deg, ${theme.accent}, ${theme.text})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              Open Dam
            </h1>
            <p className="text-sm" style={{ color: theme.textMuted }}>
              A modern twist on the classic strategy game
            </p>
          </div>

          <div className="flex flex-col gap-4 w-full">

            {/* ── Save Slots ─────────────────────────────────── */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between px-1">
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.textMuted + '80' }}>
                  Save Slot
                </label>
                <span className="text-xs" style={{ color: theme.textMuted + '60' }}>
                  {slots[selectedSlot]?.isEmpty
                    ? 'New game will save to slot ' + (selectedSlot + 1)
                    : 'Tap again to load · or start to overwrite'}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {slots.map(({ index, save, isEmpty }) => {
                  const isSelected = selectedSlot === index
                  const timestamp = formatTimestamp(save.timestamp)

                  return (
                    <motion.button
                      key={index}
                      onClick={() => handleSlotClick(index)}
                      whileTap={{ scale: 0.985 }}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl w-full text-left transition-all cursor-pointer"
                      style={{
                        backgroundColor: isSelected
                          ? theme.accent + '20'
                          : theme.surface + '50',
                        border: isSelected
                          ? `1.5px solid ${theme.accent}70`
                          : `1px solid ${theme.border}40`,
                      }}
                    >
                      {/* Icon */}
                      <div
                        className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
                        style={{
                          backgroundColor: isSelected
                            ? theme.accent + '30'
                            : theme.surface + '80',
                          border: `1px solid ${theme.border}30`,
                        }}
                      >
                        {isEmpty
                          ? <FolderX size={14} style={{ color: isSelected ? theme.accent + 'aa' : theme.textMuted + '50' }} />
                          : <FolderOpen size={14} style={{ color: isSelected ? theme.accent : theme.accent + 'aa' }} />
                        }
                      </div>

                      {/* Text */}
                      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                        <span
                          className="text-sm font-semibold"
                          style={{ color: isSelected ? theme.accent : theme.text + '90' }}
                        >
                          Slot {index + 1}
                        </span>
                        <span
                          className="text-xs truncate"
                          style={{ color: isEmpty ? theme.textMuted + '45' : theme.textMuted + '80' }}
                        >
                          {isEmpty ? 'Empty' : timestamp}
                        </span>
                      </div>

                      {/* Right badge */}
                      {isSelected && (
                        <motion.span
                          initial={{ opacity: 0, x: 6 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1"
                          style={{ backgroundColor: theme.accent + '25', color: theme.accent }}
                        >
                          {isEmpty ? (
                            <><Save size={10} /> New</>
                          ) : (
                            'Tap to load'
                          )}
                        </motion.span>
                      )}
                    </motion.button>
                  )
                })}
              </div>
            </div>

            {/* ── Board Size ─────────────────────────────────── */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: theme.textMuted + '80' }}>
                New Game · Board Size
              </label>
              <div className="flex gap-2">
                {sizes.map((size) => {
                  const isActive = selectedSize === size
                  return (
                    <Button
                      key={size}
                      className="flex-1 rounded-full py-2"
                      onClick={() => setSelectedSize(size)}
                      style={{
                        backgroundColor: isActive ? theme.accent + '90' : 'transparent',
                        color: isActive ? '#ffffff' : theme.text + '90',
                        border: `1px solid ${theme.border}30`,
                        fontWeight: isActive ? '700' : '500',
                      }}
                    >
                      {size}×{size}
                    </Button>
                  )
                })}
              </div>

              <div
                className="flex items-center gap-2.5 px-4 py-3 rounded-2xl"
                style={{
                  backgroundColor: theme.surface + '30',
                  border: `1px solid ${theme.border}20`,
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                }}
              >
                {getBoardType(selectedSize) === 'even'
                  ? <Square size={13} style={{ color: theme.textMuted + '70', flexShrink: 0 }} />
                  : <Grid3x3 size={13} style={{ color: theme.textMuted + '70', flexShrink: 0 }} />
                }
                <p className="text-xs leading-relaxed" style={{ color: theme.textMuted + '70' }}>
                  {getBoardType(selectedSize) === 'even'
                    ? 'Even board: Outer rows filled, middle rows open'
                    : 'Yin-Yang board: Center empty, first move can place in center'}
                </p>
              </div>
            </div>

            {/* ── Play As ────────────────────────────────────── */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: theme.textMuted + '80' }}>
                Play As
              </label>
              <div className="flex gap-2">
                {(['red', 'blue'] as const).map((color) => {
                  const isActive = playAs === color
                  const bgColor = color === 'red' ? theme.p1 : theme.p2
                  return (
                    <button
                      key={color}
                      className="flex-1 rounded-full py-2 text-sm font-medium cursor-pointer transition-all active:scale-95"
                      onClick={() => handlePlayAsChange(color)}
                      style={{
                        backgroundColor: isActive ? bgColor + 'cc' : 'transparent',
                        color: isActive ? '#ffffff' : theme.text + '90',
                        border: `1px solid ${isActive ? bgColor + '80' : theme.border + '30'}`,
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = bgColor + '40'
                          e.currentTarget.style.borderColor = bgColor + '60'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = 'transparent'
                          e.currentTarget.style.borderColor = theme.border + '30'
                        }
                      }}
                    >
                      {color === 'red' ? 'Red · First' : 'Blue · Second'}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Time Control ───────────────────────────────── */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: theme.textMuted + '80' }}>
                Time Control
              </label>
              <div className="flex flex-wrap gap-2">
                {timeControls.map((tc) => {
                  const isActive = timeControl === tc
                  return (
                    <button
                      key={tc}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all active:scale-95"
                      onClick={() => setTimeControl(tc)}
                      style={{
                        backgroundColor: isActive ? theme.accent + '90' : 'transparent',
                        color: isActive ? '#ffffff' : theme.text + '90',
                        border: `1px solid ${isActive ? theme.accent : theme.border + '30'}`,
                        fontWeight: isActive ? '600' : '400',
                      }}
                    >
                      {tc}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Start ──────────────────────────────────────── */}
            <Button
              className="w-full flex items-center justify-center gap-2 px-6 py-3 font-bold rounded-full text-base"
              style={{
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
                backgroundColor: theme.accent,
                color: '#ffffff',
                border: `1px solid ${theme.accent}`,
              }}
              onClick={handleStart}
            >
              <Play size={16} />
              Start New Game
            </Button>

          </div>
        </div>
      </motion.div>
    </div>
  )
}