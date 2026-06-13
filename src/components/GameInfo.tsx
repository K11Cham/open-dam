import { useGameContext } from '../context/GameContext'
import { useTheme } from '../context/ThemeContext'
import ThemeSelector from './ThemeSelector'

export default function GameInfo() {
  const { currentPlayer, winner, isInChainCapture } = useGameContext()
  const { theme } = useTheme()
  const playerName = currentPlayer === 'player1' ? 'Red' : 'Blue'
  const playerColor = currentPlayer === 'player1' ? theme.p1 : theme.p2
  
  return (
    <>
      <div className="flex items-center gap-4">
        <h1 className="text-[3rem] font-bold" style={{ color: theme.text + '90' }}>Open Dam</h1>
        <ThemeSelector />
      </div>

      {winner ? (
        <div className="win-message text-[1.5rem] font-bold" style={{ color: theme.text + '90' }}>
          {winner === 'draw' ? (
            <span style={{ color: theme.textMuted + '70' }}>Draw!</span>
          ) : (
            <span style={{ color: winner === 'player1' ? theme.p1 + '90' : theme.p2 + '90' }}>
              {winner === 'player1' ? 'Red' : 'Blue'} wins!
            </span>
          )}
        </div>
      ) : (
        <div className="turn-indicator text-[1.25rem]" style={{ color: theme.textMuted + '70' }}>
          Current turn:{' '}
          <span className="font-semibold" style={{ color: playerColor + '90' }}>
            {playerName}
          </span>
          {isInChainCapture && <span className="font-semibold animate-pulse-custom ml-2" style={{ color: theme.accent + '90' }}>- Chain capture required!</span>}
        </div>
      )}
    </>
  )
}
