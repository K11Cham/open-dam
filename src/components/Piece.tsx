import { Star } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTheme } from '../context/ThemeContext'

type PieceProps = {
  player: 'player1' | 'player2'
  isKing: boolean
  isBeingDragged: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
}

export default function Piece({ player, isKing, isBeingDragged, onDragStart, onDragEnd }: PieceProps) {
  const { theme } = useTheme()
  const playerColor = player === 'player1' ? theme.p1 : theme.p2
  const playerBorder = player === 'player1' ? theme.p1Border : theme.p2Border

  return (
    <motion.div
      className={`piece w-[75%] h-[75%] rounded-full shadow-md cursor-grab border-[3px] ${isKing ? 'king flex items-center justify-center' : ''}`}
      draggable
      onDragStart={onDragStart as any}
      onDragEnd={onDragEnd as any}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.92 }}
      animate={{
        opacity: isBeingDragged ? 0 : 1,
        scale: isBeingDragged ? 0.95 : 1,
      }}
      transition={{ duration: 0.12, ease: [0.25, 0.46, 0.45, 0.94] }}
      style={{
        backgroundColor: playerColor,
        borderColor: playerBorder,
        ...(isKing && {
          boxShadow: `inset 0 0 0 3px ${theme.king}, 0 4px 6px rgba(0,0,0,0.3)`,
        }),
      }}
    >
      {isKing && (
        <Star
          className="w-[1.5rem] h-[1.5rem] drop-shadow-lg select-none pointer-events-none"
          style={{ color: theme.king, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}
        />
      )}
    </motion.div>
  )
}