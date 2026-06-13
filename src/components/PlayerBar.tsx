import { RotateCcw, Megaphone, Check, X, Flag, Clock, Hand } from 'lucide-react'
import { useGameContext } from '../context/GameContext'
import { useTheme } from '../context/ThemeContext'

type PlayerBarProps = {
  player: 'player1' | 'player2'
  position: 'top' | 'bottom'
}

export default function PlayerBar({ player, position }: PlayerBarProps) {
  const {
    currentPlayer,
    offenders,
    undoRequest,
    undoUsedThisTurn,
    canRequestUndo,
    handleRequestUndo,
    handleAcceptUndo,
    handleDeclineUndo,
    handleCall,
    handleResign,
    drawRequest,
    handleRequestDraw,
    handleAcceptDraw,
    handleDeclineDraw,
  } = useGameContext()
  const { theme } = useTheme()

  const playerName = player === 'player1' ? 'Red' : 'Blue'
  const playerColor = player === 'player1' ? theme.p1 : theme.p2
  const isCurrentTurn = currentPlayer === player

  const isUndoRequester = undoRequest?.requester === player
  const isUndoOpponent = undoRequest && undoRequest.requester !== player
  const canRequestUndoForPlayer = !undoRequest && !undoUsedThisTurn && canRequestUndo(player)
  const canCall = isCurrentTurn && offenders.length > 0

  const isDrawRequester = drawRequest?.requester === player
  const isDrawOpponent = drawRequest && drawRequest.requester !== player

  return (
    <div
      className="player-bar flex items-center justify-between px-4 py-2 w-full"
      style={{
        backgroundColor: isCurrentTurn ? theme.surfaceHover + '70' : theme.surface + '60',
        border: `1px solid ${theme.border}40`,
        borderTopLeftRadius: position === 'top' ? '12px' : '0',
        borderTopRightRadius: position === 'top' ? '12px' : '0',
        borderBottomLeftRadius: position === 'bottom' ? '12px' : '0',
        borderBottomRightRadius: position === 'bottom' ? '12px' : '0',
        borderLeft: `1px solid ${theme.border}40`,
        borderRight: `1px solid ${theme.border}40`,
        backdropFilter: 'blur(8px)',
      }}
    >
      <div className="flex items-center gap-2 flex-1">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: playerColor + '90' }} />
        <span className="text-sm font-medium" style={{ color: isCurrentTurn ? theme.text + '90' : theme.textMuted + '70' }}>
          {playerName}
          {isCurrentTurn && <span style={{ color: theme.accent + '90', marginLeft: '4px' }}>'s turn</span>}
        </span>
      </div>

      <div className="flex items-center justify-center flex-1">
        {/* Timer in the middle - centered */}
        <div className="flex items-center gap-2 px-4 py-2 rounded-full" style={{ backgroundColor: theme.surface + '70', border: `1px solid ${theme.border}50` }}>
          <Clock size={16} style={{ color: theme.accent + '90' }} />
          <span className="text-sm font-bold font-mono" style={{ color: theme.text + '90' }}>10:00</span>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-1 justify-end">

        {isUndoRequester && (
          <span className="text-xs px-3 py-1 rounded-full" style={{ color: theme.text + '90', backgroundColor: theme.surfaceHover + '70' }}>Undo requested</span>
        )}

        {isDrawRequester && (
          <span className="text-xs px-3 py-1 rounded-full" style={{ color: theme.text + '90', backgroundColor: theme.surfaceHover + '70' }}>Draw requested</span>
        )}

        {isUndoOpponent && (
          <div className="flex gap-1">
            <button
              onClick={handleAcceptUndo}
              className="flex items-center justify-center px-2 py-1 text-xs font-medium cursor-pointer transition-all rounded-xl"
              style={{ backgroundColor: theme.surface + '70', color: theme.text + '90', border: `1px solid ${theme.border}40` }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#22c55e60'; e.currentTarget.style.color = '#22c55e'; e.currentTarget.style.borderColor = '#22c55e80' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = theme.surface + '70'; e.currentTarget.style.color = theme.text + '90'; e.currentTarget.style.borderColor = theme.border + '40' }}
              title="Accept undo request"
            >
              <Check size={14} />
            </button>
            <button
              onClick={handleDeclineUndo}
              className="flex items-center justify-center px-2 py-1 text-xs font-medium cursor-pointer transition-all rounded-xl"
              style={{ backgroundColor: theme.surface + '70', color: theme.text + '90', border: `1px solid ${theme.border}40` }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#ef444460'; e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#ef444480' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = theme.surface + '70'; e.currentTarget.style.color = theme.text + '90'; e.currentTarget.style.borderColor = theme.border + '40' }}
              title="Decline undo request"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {isDrawOpponent && (
          <div className="flex gap-1">
            <button
              onClick={handleAcceptDraw}
              className="flex items-center justify-center px-2 py-1 text-xs font-medium cursor-pointer transition-all rounded-xl"
              style={{ backgroundColor: theme.surface + '70', color: theme.text + '90', border: `1px solid ${theme.border}40` }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#22c55e60'; e.currentTarget.style.color = '#22c55e'; e.currentTarget.style.borderColor = '#22c55e80' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = theme.surface + '70'; e.currentTarget.style.color = theme.text + '90'; e.currentTarget.style.borderColor = theme.border + '40' }}
              title="Accept draw request"
            >
              <Check size={14} />
            </button>
            <button
              onClick={handleDeclineDraw}
              className="flex items-center justify-center px-2 py-1 text-xs font-medium cursor-pointer transition-all rounded-xl"
              style={{ backgroundColor: theme.surface + '70', color: theme.text + '90', border: `1px solid ${theme.border}40` }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#ef444460'; e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#ef444480' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = theme.surface + '70'; e.currentTarget.style.color = theme.text + '90'; e.currentTarget.style.borderColor = theme.border + '40' }}
              title="Decline draw request"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {!undoRequest && !drawRequest && (
          <div className="flex items-center gap-1">
            <div className="flex gap-1">
              <button
                onClick={() => handleRequestUndo(player)}
                disabled={!canRequestUndoForPlayer}
                className="flex items-center justify-center px-2 py-1 text-xs font-medium cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed rounded-xl"
                style={{ backgroundColor: canRequestUndoForPlayer ? theme.surface + '70' : theme.border + '40', color: canRequestUndoForPlayer ? theme.text + '90' : theme.textMuted + '60', border: `1px solid ${theme.border}40` }}
                onMouseEnter={(e) => { if (canRequestUndoForPlayer) { e.currentTarget.style.backgroundColor = theme.accent + '60'; e.currentTarget.style.color = theme.accent; e.currentTarget.style.borderColor = theme.accent + '80' } }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = canRequestUndoForPlayer ? theme.surface + '70' : theme.border + '40'; e.currentTarget.style.color = canRequestUndoForPlayer ? theme.text + '90' : theme.textMuted + '60'; e.currentTarget.style.borderColor = theme.border + '40' }}
                title="Request undo"
              >
                <RotateCcw size={14} />
              </button>

              <button
                onClick={handleCall}
                disabled={!canCall}
                className="flex items-center justify-center px-2 py-1 text-xs font-medium cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed rounded-xl"
                style={{ backgroundColor: canCall ? '#f9731660' : theme.border + '40', color: canCall ? '#f97316' : theme.textMuted + '60', border: `1px solid ${canCall ? '#f9731680' : theme.border + '40'}` }}
                onMouseEnter={(e) => { if (canCall) { e.currentTarget.style.backgroundColor = '#ea580c60'; e.currentTarget.style.borderColor = '#ea580c80' } }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = canCall ? '#f9731660' : theme.border + '40'; e.currentTarget.style.color = canCall ? '#f97316' : theme.textMuted + '60'; e.currentTarget.style.borderColor = canCall ? '#f9731680' : theme.border + '40' }}
                title="Call foul"
              >
                <Megaphone size={14} />
              </button>
            </div>

            <div className="w-px h-4" style={{ backgroundColor: theme.border + '40' }} />

            <div className="flex gap-1">
              <button
                onClick={() => handleRequestDraw(player)}
                className="flex items-center justify-center px-2 py-1 text-xs font-medium cursor-pointer transition-all rounded-xl"
                style={{ backgroundColor: theme.surface + '70', color: theme.text + '90', border: `1px solid ${theme.border}40` }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.accent + '60'; e.currentTarget.style.color = theme.accent; e.currentTarget.style.borderColor = theme.accent + '80' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = theme.surface + '70'; e.currentTarget.style.color = theme.text + '90'; e.currentTarget.style.borderColor = theme.border + '40' }}
                title="Request draw"
              >
                <Hand size={14} />
              </button>

              <button
                onClick={handleResign}
                className="flex items-center justify-center px-2 py-1 text-xs font-medium cursor-pointer transition-all rounded-xl"
                style={{ backgroundColor: theme.surface + '70', color: theme.text + '90', border: `1px solid ${theme.border}40` }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#ef444460'; e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#ef444480' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = theme.surface + '70'; e.currentTarget.style.color = theme.text + '90'; e.currentTarget.style.borderColor = theme.border + '40' }}
                title="Resign"
              >
                <Flag size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}