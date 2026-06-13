import { useState, useEffect } from 'react'
import type { Piece } from '../utils/gameLogic'
import type { BoardType } from '../utils/gameLogic'

interface GameState {
  board: Piece[][]
  currentPlayer: 'player1' | 'player2'
  selectedPiece: { row: number; col: number } | null
  isInChainCapture: boolean
  winner: 'player1' | 'player2' | 'draw' | null
  lastMover: 'player1' | 'player2' | null
  offenders: string[]
  undoRequest: { requester: 'player1' | 'player2' } | null
  history: any[]
  chainStartIndex: number | null
  undoUsedThisTurn: boolean
  gridSize: number
  boardType: BoardType
  playerSide: 'player1' | 'player2'
  moves: any[]
  boardHistory: string[]
  animatingPieces: any[]
  isFirstMove: boolean
}

interface SavedGame {
  size: number
  type: BoardType
  timestamp: number
}

export function useGameStorage() {
  const [savedGames, setSavedGames] = useState<SavedGame[]>([])

  useEffect(() => {
    loadSavedGames()
  }, [])

  const loadSavedGames = () => {
    const saves: SavedGame[] = []
    for (let i = 1; i <= 3; i++) {
      const saved = localStorage.getItem(`openDamSave${i}`)
      const gameState = localStorage.getItem(`openDamGameState${i}`)
      
      if (saved && gameState) {
        try {
          saves.push(JSON.parse(saved))
        } catch {
          saves.push({ size: 5, type: 'yinyang' as BoardType, timestamp: 0 })
          // Clean up corrupted data
          localStorage.removeItem(`openDamSave${i}`)
          localStorage.removeItem(`openDamGameState${i}`)
        }
      } else {
        saves.push({ size: 5, type: 'yinyang' as BoardType, timestamp: 0 })
        // Ensure no gameState exists for empty slot
        localStorage.removeItem(`openDamSave${i}`)
        localStorage.removeItem(`openDamGameState${i}`)
      }
    }
    setSavedGames(saves)
  }

  const saveGame = (slot: number, gameState: GameState) => {
    const saveInfo: SavedGame = {
      size: gameState.gridSize,
      type: gameState.boardType,
      timestamp: Date.now(),
    }
    
    localStorage.setItem(`openDamSave${slot}`, JSON.stringify(saveInfo))
    localStorage.setItem(`openDamGameState${slot}`, JSON.stringify(gameState))
    
    loadSavedGames()
  }

  const loadGame = (slot: number): GameState | null => {
    const savedState = localStorage.getItem(`openDamGameState${slot}`)
    if (!savedState) return null

    try {
      return JSON.parse(savedState)
    } catch (e) {
      console.error('Failed to load game:', e)
      return null
    }
  }

  const deleteSave = (slot: number) => {
    localStorage.removeItem(`openDamSave${slot}`)
    localStorage.removeItem(`openDamGameState${slot}`)
    loadSavedGames()
  }

  const clearAllSaves = () => {
    for (let i = 1; i <= 3; i++) {
      localStorage.removeItem(`openDamSave${i}`)
      localStorage.removeItem(`openDamGameState${i}`)
    }
    loadSavedGames()
  }

  return {
    savedGames,
    saveGame,
    loadGame,
    deleteSave,
    clearAllSaves,
    loadSavedGames,
  }
}
