import { BrowserRouter, Routes, Route, useNavigate, useParams } from 'react-router-dom'
import { useState } from 'react'
import Game from './components/Game'
import GameMenu from './components/GameMenu'
import GameLayout from './components/GameLayout'
import Home from './components/Home'
import { useGameLogic } from './hooks/useGameLogic'
import { useGameStorage } from './hooks/useGameStorage'
import { GameProvider } from './context/GameContext'
import { ThemeProvider } from './context/ThemeContext'
import type { BoardType } from './utils/gameLogic'

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/menu" element={<GameMenuWrapper />} />
          <Route path="/game/:size/:type/:playerSide/:slot" element={<GamePageWrapper />} />
          <Route path="/game/load/:slot" element={<LoadGameWrapper />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}

function GameMenuWrapper() {
  const navigate = useNavigate()
  const [, setPlayAs] = useState<'player1' | 'player2'>('player1')

  const handleStartGame = (
    size: 5 | 6 | 7 | 8 | 9,
    type: BoardType,
    playerSide: 'player1' | 'player2',
    slot: number,
  ) => {
    navigate(`/game/${size}/${type}/${playerSide}/${slot}`)
  }

  const handleLoadGame = (slot: number) => {
    navigate(`/game/load/${slot}`)
  }

  return <GameMenu onStartGame={handleStartGame} onLoadGame={handleLoadGame} onPlayAsChange={setPlayAs} />
}

function GamePageWrapper() {
  const { size: sizeParam, type: typeParam, playerSide: playerSideParam } = useParams()
  const size = parseInt(sizeParam || '5') as 5 | 6 | 7 | 8 | 9
  const type = (typeParam || 'yinyang') as BoardType
  const playerSide = (playerSideParam || 'player1') as 'player1' | 'player2'

  const gameLogic = useGameLogic(size, type, playerSide, true) // true = new game, don't load old state

  return (
    <GameLayout>
      <GameProvider value={gameLogic}>
        <Game gridSize={size} />
      </GameProvider>
    </GameLayout>
  )
}

function LoadGameWrapper() {
  const { slot: slotParam } = useParams()
  const slot = parseInt(slotParam || '1')
  const { loadGame } = useGameStorage()
  const savedState = loadGame(slot)

  if (!savedState) {
    return <div>No save found in slot {slot}</div>
  }

  const gameLogic = useGameLogic(savedState.gridSize, savedState.boardType, savedState.playerSide)
  gameLogic.loadGameState(savedState)

  return (
    <GameLayout>
      <GameProvider value={gameLogic}>
        {/* Pass the same slot so moves continue saving to it */}
        <Game gridSize={savedState.gridSize} />
      </GameProvider>
    </GameLayout>
  )
}

export default App