import { useTheme } from '../context/ThemeContext'
import Navbar from './Navbar'
import { useNavigate } from 'react-router-dom'
import { useGameStorage } from '../hooks/useGameStorage'
import { motion } from 'framer-motion'
import { Play, Grid3x3, Zap, Shield, Clock, FolderOpen, FolderX, Trash2 } from 'lucide-react'

export default function Home() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const { savedGames, deleteSave } = useGameStorage()

  const formatTimestamp = (timestamp: number) => {
    if (timestamp === 0) return null
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  const slots = Array.from({ length: 3 }, (_, i) => ({
    index: i,
    save: savedGames[i] ?? { timestamp: 0, size: 5, type: 'yinyang' as const },
    isEmpty: !savedGames[i] || savedGames[i].timestamp === 0,
  }))

  const handleSlotClick = (index: number) => {
    const hasData = savedGames[index]?.timestamp !== 0
    if (hasData) {
      navigate(`/game/load/${index + 1}`)
    } else {
      navigate('/menu')
    }
  }

  const handleDeleteSlot = (index: number, e: React.MouseEvent) => {
    e.stopPropagation()
    deleteSave(index + 1)
  }

  return (
    <div className="flex flex-col min-h-screen w-full" style={{ background: 'transparent' }}>
      <Navbar />

      {/* Hero Section */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-16" style={{ background: 'transparent' }}>
        <motion.div
          className="text-center max-w-4xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center justify-center gap-3 mb-6">
            <h1 className="text-6xl font-bold" style={{ color: theme.text }}>
              Open Dam
            </h1>
          </div>
          <p className="text-2xl mb-4" style={{ color: theme.textMuted }}>
            A modern twist on the classic strategy game
          </p>
          <p className="text-lg mb-12 max-w-2xl mx-auto" style={{ color: theme.textMuted + '80' }}>
            Experience the timeless game of Dam with beautiful visuals, smooth animations, and powerful features.
          </p>

          <div className="flex gap-4 justify-center mb-16">
            <button
              onClick={() => navigate('/menu')}
              className="flex items-center gap-2 px-8 py-4 rounded-xl text-lg font-semibold text-white cursor-pointer transition-all hover:scale-105 active:scale-95"
              style={{ backgroundColor: theme.accent, border: 'none', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)' }}
            >
              <Play size={20} />
              Start New Game
            </button>
          </div>
        </motion.div>

        {/* Saved Games Section */}
        <motion.div
          className="w-full max-w-4xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold" style={{ color: theme.text }}>
              Continue Playing
            </h2>
            <button
              onClick={() => navigate('/menu')}
              className="text-sm font-semibold px-4 py-2 rounded-lg cursor-pointer transition-all"
              style={{ color: theme.accent, backgroundColor: theme.accent + '15' }}
            >
              View All
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {slots.map(({ index, save, isEmpty }) => (
              <motion.button
                key={index}
                onClick={() => handleSlotClick(index)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="p-6 rounded-xl text-left cursor-pointer transition-all"
                style={{
                  backgroundColor: isEmpty ? theme.surface + '40' : theme.surface + '60',
                  border: `1px solid ${theme.border}40`,
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    {isEmpty ? (
                      <FolderX size={20} style={{ color: theme.textMuted + '60' }} />
                    ) : (
                      <FolderOpen size={20} style={{ color: theme.accent }} />
                    )}
                    <span className="font-semibold" style={{ color: theme.text }}>
                      Slot {index + 1}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isEmpty && (
                      <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: theme.accent + '20', color: theme.accent }}>
                        {save.size}×{save.size}
                      </span>
                    )}
                    {!isEmpty && (
                      <button
                        onClick={(e) => handleDeleteSlot(index, e)}
                        className="flex items-center justify-center w-7 h-7 rounded-lg cursor-pointer transition-all hover:scale-110 active:scale-95"
                        style={{ backgroundColor: theme.surface + '50', border: `1px solid ${theme.border}30` }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = theme.border + '40'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = theme.surface + '50'
                        }}
                      >
                        <Trash2 size={12} style={{ color: theme.textMuted + '70' }} />
                      </button>
                    )}
                  </div>
                </div>

                {!isEmpty ? (
                  <>
                    <div className="flex items-center gap-2 mb-3">
                      <Grid3x3 size={16} style={{ color: theme.textMuted + '70' }} />
                      <span className="text-sm" style={{ color: theme.textMuted }}>
                        {save.type === 'yinyang' ? 'Yin-Yang Board' : 'Even Board'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock size={14} style={{ color: theme.textMuted + '60' }} />
                      <span className="text-xs" style={{ color: theme.textMuted + '80' }}>
                        {formatTimestamp(save.timestamp)}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm" style={{ color: theme.textMuted + '60' }}>
                    Empty slot - start a new game
                  </p>
                )}
              </motion.button>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Features Section */}
      <section className="px-6 py-16" style={{ background: 'transparent' }}>
        <motion.div
          className="max-w-4xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <h2 className="text-3xl font-bold text-center mb-12" style={{ color: theme.text }}>
            Why Open Dam?
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-xl text-center" style={{ backgroundColor: theme.surface + '30', border: `1px solid ${theme.border}30`, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)' }}>
              <div className="flex items-center justify-center w-12 h-12 rounded-full mx-auto mb-4" style={{ backgroundColor: theme.accent + '20' }}>
                <Zap size={24} style={{ color: theme.accent }} />
              </div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: theme.text }}>Fast & Responsive</h3>
              <p className="text-sm" style={{ color: theme.textMuted }}>Smooth animations and instant moves for a seamless experience</p>
            </div>

            <div className="p-6 rounded-xl text-center" style={{ backgroundColor: theme.surface + '30', border: `1px solid ${theme.border}30`, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)' }}>
              <div className="flex items-center justify-center w-12 h-12 rounded-full mx-auto mb-4" style={{ backgroundColor: theme.accent + '20' }}>
                <Shield size={24} style={{ color: theme.accent }} />
              </div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: theme.text }}>Save & Resume</h3>
              <p className="text-sm" style={{ color: theme.textMuted }}>Three save slots to keep your games safe and pick up where you left off</p>
            </div>

            <div className="p-6 rounded-xl text-center" style={{ backgroundColor: theme.surface + '30', border: `1px solid ${theme.border}30`, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)' }}>
              <div className="flex items-center justify-center w-12 h-12 rounded-full mx-auto mb-4" style={{ backgroundColor: theme.accent + '20' }}>
                <Grid3x3 size={24} style={{ color: theme.accent }} />
              </div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: theme.text }}>Multiple Boards</h3>
              <p className="text-sm" style={{ color: theme.textMuted }}>Choose from 5x5 to 9x9 boards with different layouts</p>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 text-center" style={{ borderTop: `1px solid ${theme.border}20` }}>
        <p className="text-sm" style={{ color: theme.textMuted + '60' }}>
          © 2026 Open Dam. All rights reserved.
        </p>
      </footer>
    </div>
  )
}
