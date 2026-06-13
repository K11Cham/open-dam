import { useState, useEffect } from 'react'
import type { Piece, BoardType } from '../utils/gameLogic'
import {
  makeInitialBoard,
  checkWinCondition,
  checkDrawCondition,
  checkKingPromotion,
  getCaptures,
  checkThreefoldRepetition,
  checkMovesWithoutCaptures,
  serializeBoard,
} from '../utils/gameLogic'
import { storage } from '../services/storage'

interface Move {
  from: string
  to: string
  player: 'player1' | 'player2'
  isCapture: boolean
}

interface GameState {
  board: Piece[][]
  currentPlayer: 'player1' | 'player2'
  selectedPiece: { row: number; col: number } | null
  offenders: string[]
  isInChainCapture: boolean
  winner: 'player1' | 'player2' | 'draw' | null
  lastMover: 'player1' | 'player2' | null
  chainStartIndex: number | null
  boardHistory: string[]
  moves: Move[]
}

interface AnimatingPiece {
  piece: Exclude<Piece, null>
  row: number
  col: number
  id: string
  type: 'capture' | 'call' | 'move'
  fromRow?: number
  fromCol?: number
}

export const useGameLogic = (gridSize: number = 5, boardType: BoardType = 'yinyang', playerSide: 'player1' | 'player2' = 'player1', isNewGame: boolean = false) => {
  // Store game configuration
  const gameConfig = { gridSize, boardType, playerSide }
  storage.set('openDamGameConfig', gameConfig)
  
  // Check if saved config matches current config
  const savedConfig = storage.get<{ gridSize: number; boardType: BoardType; playerSide: 'player1' | 'player2' }>('openDamGameConfig')
  const configMatches = !isNewGame && savedConfig && savedConfig.gridSize === gridSize && savedConfig.boardType === boardType && savedConfig.playerSide === playerSide
  
  const [isFirstMove, setIsFirstMove] = useState(true)
  const [currentPlayer, setCurrentPlayer] = useState<'player1' | 'player2'>(() => {
    if (configMatches) {
      const saved = storage.get<'player1' | 'player2'>('openDamCurrentPlayer')
      return saved || playerSide
    }
    return playerSide
  })
  const [selectedPiece, setSelectedPiece] = useState<{ row: number; col: number } | null>(null)
  const [isInChainCapture, setIsInChainCapture] = useState(() => {
    if (configMatches) {
      const saved = storage.get<boolean>('openDamIsInChainCapture')
      return saved || false
    }
    return false
  })
  const [winner, setWinner] = useState<'player1' | 'player2' | 'draw' | null>(() => {
    if (configMatches) {
      const saved = storage.get<'player1' | 'player2' | 'draw'>('openDamWinner')
      return saved || null
    }
    return null
  })
  const [draggedPiece, setDraggedPiece] = useState<{ row: number; col: number } | null>(null)
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)
  const [offenders, setOffenders] = useState<string[]>([])
  const [undoRequest, setUndoRequest] = useState<{ requester: 'player1' | 'player2' } | null>(null)
  const [drawRequest, setDrawRequest] = useState<{ requester: 'player1' | 'player2' } | null>(null)
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1)
  const [history, setHistory] = useState<GameState[]>(() => {
    if (configMatches) {
      const saved = storage.get<GameState[]>('openDamHistory')
      return saved || []
    }
    return []
  })
  const [chainStartIndex, setChainStartIndex] = useState<number | null>(() => {
    if (configMatches) {
      const saved = storage.get<number>('openDamChainStartIndex')
      return saved !== undefined ? saved : null
    }
    return null
  })
  const [undoUsedThisTurn, setUndoUsedThisTurn] = useState(() => {
    if (configMatches) {
      const saved = storage.get<boolean>('openDamUndoUsedThisTurn')
      return saved || false
    }
    return false
  })
  const [animatingPieces, setAnimatingPieces] = useState<AnimatingPiece[]>([])
  const [boardHistory, setBoardHistory] = useState<string[]>([])
  const [moves, setMoves] = useState<Move[]>([])
  const [board, setBoard] = useState<Piece[][]>(() => {
    const savedBoard = storage.get<Piece[][]>('openDamBoard')
    
    // Only load saved board if config matches
    if (savedBoard && configMatches) {
      try {
        const parsed: Piece[][] = savedBoard
        if (parsed.length === gridSize && parsed[0]?.length === gridSize) {
          let migrationId = 9000
          return parsed.map(row =>
            row.map(piece =>
              piece && !piece.id
                ? { ...piece, id: `migrated-${migrationId++}` }
                : piece
            )
          )
        }
      } catch {
        // fall through to default
      }
    }
    return makeInitialBoard(gridSize, boardType)
  })

  const saveBoard = (newBoard: Piece[][]) => {
    storage.set('openDamBoard', newBoard)
  }

  const resetBoard = () => {
    const initialBoard = makeInitialBoard(gridSize, boardType)
    setBoard(initialBoard)
    setCurrentPlayer('player1')
    setSelectedPiece(null)
    setIsInChainCapture(false)
    setWinner(null)
    setDraggedPiece(null)
    setDragPos(null)
    setOffenders([])
    setUndoRequest(null)
    setHistory([])
    setChainStartIndex(null)
    setUndoUsedThisTurn(false)
    setAnimatingPieces([])
    setBoardHistory([])
    setMoves([])
    setIsFirstMove(true)
    setCurrentMoveIndex(-1)
    storage.remove('openDamBoard')
    storage.remove('openDamCurrentPlayer')
    storage.remove('openDamWinner')
    storage.remove('openDamIsInChainCapture')
    storage.remove('openDamHistory')
    storage.remove('openDamChainStartIndex')
    storage.remove('openDamUndoUsedThisTurn')
    storage.set('openDamGameConfig', { gridSize, boardType })
  }

  const coordToNotation = (row: number, col: number): string => {
    const colLetter = String.fromCharCode(97 + col)
    const rowNum = gridSize - row
    return `${colLetter}${rowNum}`
  }

  const addMovementAnimation = (piece: Exclude<Piece, null>, fromRow: number, fromCol: number, toRow: number, toCol: number, isDrag: boolean) => {
    if (isDrag) return
    const animId = `move-${Date.now()}`
    setAnimatingPieces(prev => [
      ...prev,
      { piece, row: toRow, col: toCol, id: animId, type: 'move', fromRow, fromCol }
    ])
  }

  const checkGameEnd = (newBoard: Piece[][]) => {
    const win = checkWinCondition(newBoard)
    if (win) return win
    if (checkDrawCondition(newBoard)) return 'draw'
    if (checkThreefoldRepetition(boardHistory)) return 'draw'
    if (checkMovesWithoutCaptures(moves)) return 'draw'
    return null
  }

  const checkCenterPlacementValid = (fromRow: number, fromCol: number, toRow: number, toCol: number): boolean => {
    if (!isFirstMove || boardType !== 'yinyang' || currentPlayer !== 'player1') return false
    const center = Math.floor(gridSize / 2)
    if (toRow !== center || toCol !== center) return false
    if (board[fromRow][fromCol]?.player !== 'player1') return false
    const simulatedBoard = board.map(row => [...row])
    simulatedBoard[toRow][toCol] = { ...simulatedBoard[fromRow][fromCol]! }
    simulatedBoard[fromRow][fromCol] = null
    const player2Captures = getCaptures(simulatedBoard, 'player2')
    const player2Moves = getValidMovesForPlayer(simulatedBoard, 'player2')
    return player2Captures.length > 0 || player2Moves.length > 0
  }

  const getValidMovesForPlayer = (b: Piece[][], player: 'player1' | 'player2') => {
    const moves: { row: number; col: number }[] = []
    const gridSize = b.length
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        if (b[row][col]?.player === player) {
          const piece = b[row][col]
          const isKing = piece?.isKing || false
          
          // Regular pieces can only move forward (player1 at bottom moves up/dr=-1, player2 at top moves down/dr=1)
          // Kings can move in all directions
          let directions: number[][]
          if (isKing) {
            directions = [[-1, 0], [1, 0], [0, -1], [0, 1]]
          } else {
            directions = player === 'player1' ? [[-1, 0], [0, -1], [0, 1]] : [[1, 0], [0, -1], [0, 1]]
          }
          
          for (const [dr, dc] of directions) {
            const newRow = row + dr
            const newCol = col + dc
            if (newRow >= 0 && newRow < gridSize && newCol >= 0 && newCol < gridSize && !b[newRow][newCol]) {
              moves.push({ row: newRow, col: newCol })
            }
          }
        }
      }
    }
    return moves
  }

  const attemptMove = (fromRow: number, fromCol: number, toRow: number, toCol: number, isDrag = false) => {
    if (board[toRow][toCol] !== null) return

    if (checkCenterPlacementValid(fromRow, fromCol, toRow, toCol)) {
      const piece = board[fromRow][fromCol]
      const newBoard = board.map(r => [...r])
      newBoard[toRow][toCol] = { player: currentPlayer, isKing: piece?.isKing || false, id: piece!.id }
      newBoard[fromRow][fromCol] = null
      addMovementAnimation(piece!, fromRow, fromCol, toRow, toCol, isDrag)
      setMoves(prev => [...prev, {
        from: coordToNotation(fromRow, fromCol),
        to: coordToNotation(toRow, toCol),
        player: currentPlayer,
        isCapture: false
      }])
      setBoard(newBoard)
      saveBoard(newBoard)
      setIsFirstMove(false)
      setCurrentPlayer('player2')
      setCurrentMoveIndex(-1) // Auto-snap to latest move
      setWinner(checkGameEnd(newBoard))
      return
    }

    if (undoRequest) {
      handleDeclineUndo()
    }

    const rowDiff = toRow - fromRow
    const colDiff = toCol - fromCol
    const rowAbs = Math.abs(rowDiff)
    const colAbs = Math.abs(colDiff)
    const isCardinal = (rowAbs > 0 && colAbs === 0) || (rowAbs === 0 && colAbs > 0)
    if (!isCardinal) return

    const distance = rowAbs + colAbs
    const isBackwards = currentPlayer === 'player1' ? rowDiff > 0 : rowDiff < 0
    const isKing = board[fromRow][fromCol]?.isKing || false

    // Helper: snapshot current state including moves
    const snapshot = (): GameState => ({
      board: board.map(r => r.map(c => c ? { ...c } : null)),
      currentPlayer,
      selectedPiece,
      offenders: offenders.slice(),
      isInChainCapture,
      winner,
      lastMover: currentPlayer,
      chainStartIndex: chainStartIndex,
      boardHistory: boardHistory,
      moves: moves.slice(),
    })

    if (isKing && distance > 1) {
      const dr = rowDiff > 0 ? 1 : rowDiff < 0 ? -1 : 0
      const dc = colDiff > 0 ? 1 : colDiff < 0 ? -1 : 0
      let r = fromRow + dr
      let c = fromCol + dc
      let pathClear = true
      while (r !== toRow || c !== toCol) {
        if (board[r][c] !== null) { pathClear = false; break }
        r += dr
        c += dc
      }
      if (pathClear) {
        const piece = board[fromRow][fromCol]
        const newBoard = board.map(row => [...row])
        newBoard[toRow][toCol] = { player: currentPlayer, isKing: true, id: piece!.id }
        newBoard[fromRow][fromCol] = null
        const newOffenders = findOffendersFromPreviousBoard(board, currentPlayer)
        addMovementAnimation(piece!, fromRow, fromCol, toRow, toCol, isDrag)
        setHistory(prev => [...prev.slice(-9), snapshot()])
        setMoves(prev => {
          const updated = [...prev, {
            from: coordToNotation(fromRow, fromCol),
            to: coordToNotation(toRow, toCol),
            player: currentPlayer,
            isCapture: false
          }]
          return updated
        })
        setBoard(newBoard)
        saveBoard(newBoard)
        setSelectedPiece(null)
        setOffenders(newOffenders)
        setCurrentPlayer(currentPlayer === 'player1' ? 'player2' : 'player1')
        setCurrentMoveIndex(-1) // Auto-snap to latest move
        setWinner(checkGameEnd(newBoard))
        return
      }
    }

    if (distance === 2) {
      const midRow = fromRow + rowDiff / 2
      const midCol = fromCol + colDiff / 2
      const opponent = currentPlayer === 'player1' ? 'player2' : 'player1'
      if (board[midRow][midCol]?.player !== opponent) return
      if (!isKing && isBackwards) return

      setHistory(prev => [...prev.slice(-9), snapshot()])

      const capturedPiece = board[midRow][midCol]
      const piece = board[fromRow][fromCol]
      const newBoard = board.map(r => [...r])
      newBoard[toRow][toCol] = { player: currentPlayer, isKing: piece?.isKing || false, id: piece!.id }
      newBoard[fromRow][fromCol] = null
      newBoard[midRow][midCol] = null

      if (capturedPiece) {
        const animId = `capture-${Date.now()}`
        setAnimatingPieces(prev => [...prev, { piece: capturedPiece, row: midRow, col: midCol, id: animId, type: 'capture' }])
        setTimeout(() => { setAnimatingPieces(prev => prev.filter(p => p.id !== animId)) }, 500)
      }
      addMovementAnimation(piece!, fromRow, fromCol, toRow, toCol, isDrag)
      setMoves(prev => [...prev, {
        from: coordToNotation(fromRow, fromCol),
        to: coordToNotation(toRow, toCol),
        player: currentPlayer,
        isCapture: true
      }])

      const promoted = checkKingPromotion(newBoard, currentPlayer)
      setBoard(newBoard)
      saveBoard(newBoard)
      setBoardHistory(prev => [...prev, serializeBoard(newBoard)])
      setWinner(checkGameEnd(newBoard))

      if (promoted) {
        setSelectedPiece(null)
        setIsInChainCapture(false)
        setOffenders([])
        setCurrentPlayer(currentPlayer === 'player1' ? 'player2' : 'player1')
        setCurrentMoveIndex(-1) // Auto-snap to latest move
        return
      }

      const chainCaptures = getCaptures(newBoard, currentPlayer).filter(
        c => c.from.row === toRow && c.from.col === toCol
      )
      if (chainCaptures.length > 0) {
        setSelectedPiece({ row: toRow, col: toCol })
        setIsInChainCapture(true)
        if (chainStartIndex === null) setChainStartIndex(history.length)
      } else {
        setSelectedPiece(null)
        setIsInChainCapture(false)
        setOffenders([])
        setChainStartIndex(null)
        setCurrentPlayer(currentPlayer === 'player1' ? 'player2' : 'player1')
        setCurrentMoveIndex(-1) // Auto-snap to latest move
      }
      return
    }

    if (isKing && distance > 2) {
      const dr = rowDiff > 0 ? 1 : rowDiff < 0 ? -1 : 0
      const dc = colDiff > 0 ? 1 : colDiff < 0 ? -1 : 0
      const opponent = currentPlayer === 'player1' ? 'player2' : 'player1'
      let r = fromRow + dr
      let c = fromCol + dc
      let capturedRow = -1
      let capturedCol = -1

      while (r >= 0 && r < gridSize && c >= 0 && c < gridSize) {
        if (board[r][c] !== null) {
          if (board[r][c]?.player === opponent) { capturedRow = r; capturedCol = c }
          else return
          break
        }
        r += dr; c += dc
      }

      if (capturedRow === -1) return
      if (toRow === capturedRow && toCol === capturedCol) return

      r = capturedRow + dr; c = capturedCol + dc
      while (r !== toRow || c !== toCol) {
        if (board[r][c] !== null) return
        r += dr; c += dc
      }

      setHistory(prev => [...prev.slice(-9), snapshot()])

      const capturedPiece = board[capturedRow][capturedCol]
      const newBoard = board.map(row => [...row])
      const piece = board[fromRow][fromCol]
      newBoard[toRow][toCol] = { player: currentPlayer, isKing: true, id: piece!.id }
      newBoard[fromRow][fromCol] = null
      newBoard[capturedRow][capturedCol] = null

      if (capturedPiece) {
        const animId = `king-capture-${Date.now()}`
        setAnimatingPieces(prev => [...prev, { piece: capturedPiece, row: capturedRow, col: capturedCol, id: animId, type: 'capture' }])
        setTimeout(() => { setAnimatingPieces(prev => prev.filter(p => p.id !== animId)) }, 500)
      }
      addMovementAnimation(piece!, fromRow, fromCol, toRow, toCol, isDrag)
      setMoves(prev => [...prev, {
        from: coordToNotation(fromRow, fromCol),
        to: coordToNotation(toRow, toCol),
        player: currentPlayer,
        isCapture: true
      }])

      setBoard(newBoard)
      saveBoard(newBoard)
      setBoardHistory(prev => [...prev, serializeBoard(newBoard)])
      setWinner(checkGameEnd(newBoard))

      const chainCaptures = getCaptures(newBoard, currentPlayer).filter(
        c => c.from.row === toRow && c.from.col === toCol
      )
      if (chainCaptures.length > 0) {
        setSelectedPiece({ row: toRow, col: toCol })
        setIsInChainCapture(true)
        if (chainStartIndex === null) setChainStartIndex(history.length)
      } else {
        setSelectedPiece(null)
        setIsInChainCapture(false)
        setOffenders([])
        setChainStartIndex(null)
        setCurrentPlayer(currentPlayer === 'player1' ? 'player2' : 'player1')
        setCurrentMoveIndex(-1) // Auto-snap to latest move
      }
      return
    }

    if (distance === 1) {
      if (isInChainCapture) return
      if (!isKing && isBackwards) return

      setHistory(prev => [...prev.slice(-9), snapshot()])

      const piece = board[fromRow][fromCol]
      const newBoard = board.map(r => [...r])
      newBoard[toRow][toCol] = { player: currentPlayer, isKing: board[fromRow][fromCol]?.isKing || false, id: piece!.id }
      newBoard[fromRow][fromCol] = null
      const promoted = checkKingPromotion(newBoard, currentPlayer)
      const newOffenders = findOffendersFromPreviousBoard(board, currentPlayer)

      addMovementAnimation(piece!, fromRow, fromCol, toRow, toCol, isDrag)
      setMoves(prev => [...prev, {
        from: coordToNotation(fromRow, fromCol),
        to: coordToNotation(toRow, toCol),
        player: currentPlayer,
        isCapture: false
      }])

      setBoard(newBoard)
      saveBoard(newBoard)
      setBoardHistory(prev => [...prev, serializeBoard(newBoard)])

      if (promoted) {
        setSelectedPiece(null)
        setIsInChainCapture(false)
        setOffenders([])
        setCurrentPlayer(currentPlayer === 'player1' ? 'player2' : 'player1')
        setCurrentMoveIndex(-1) // Auto-snap to latest move
        setWinner(checkGameEnd(newBoard))
        return
      }

      setSelectedPiece(null)
      setOffenders(newOffenders)
      setCurrentPlayer(currentPlayer === 'player1' ? 'player2' : 'player1')
      setWinner(checkGameEnd(newBoard))
      return
    }
  }

  const handleCellClick = (row: number, col: number) => {
    if (winner) return
    const clickedPiece = board[row][col]
    if (clickedPiece?.player === currentPlayer) {
      setSelectedPiece({ row, col })
      return
    }
    if (selectedPiece && clickedPiece === null) {
      attemptMove(selectedPiece.row, selectedPiece.col, row, col)
    } else {
      setSelectedPiece(null)
    }
  }

  const handleBoardClick = () => { setSelectedPiece(null) }

  const checkAutoPromotion = () => {
    const newBoard = board.map(row => [...row])
    const promoted = checkKingPromotion(newBoard, currentPlayer)
    if (promoted) { setBoard(newBoard); saveBoard(newBoard) }
  }

  useEffect(() => { checkAutoPromotion() }, [currentPlayer])
  useEffect(() => { setUndoUsedThisTurn(false) }, [currentPlayer])
  useEffect(() => { storage.set('openDamCurrentPlayer', currentPlayer) }, [currentPlayer])
  useEffect(() => { storage.set('openDamIsInChainCapture', isInChainCapture) }, [isInChainCapture])
  useEffect(() => { storage.set('openDamWinner', winner) }, [winner])
  useEffect(() => { storage.set('openDamHistory', history) }, [history])
  useEffect(() => { storage.set('openDamChainStartIndex', chainStartIndex) }, [chainStartIndex])
  useEffect(() => { storage.set('openDamUndoUsedThisTurn', undoUsedThisTurn) }, [undoUsedThisTurn])

  const findOffendersFromPreviousBoard = (
    previousBoard: Piece[][],
    playerWhoJustMoved: 'player1' | 'player2'
  ): string[] => {
    const offenderList: string[] = []
    const captures = getCaptures(previousBoard, playerWhoJustMoved)
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const piece = previousBoard[r][c]
        if (piece && piece.player === playerWhoJustMoved) {
          const hasCapture = captures.some(capture => capture.from.row === r && capture.from.col === c)
          if (hasCapture) offenderList.push(piece.id ?? `pos:${r}:${c}`)
        }
      }
    }
    return offenderList
  }

  const handleCall = () => {
    if (undoRequest || isInChainCapture) return
    const newBoard = board.map(row => [...row])
    const piecesToAnimate: AnimatingPiece[] = []

    offenders.forEach(offenderId => {
      if (offenderId.startsWith('pos:')) {
        const [, rs, cs] = offenderId.split(':')
        const r = Number(rs); const c = Number(cs)
        if (board[r][c]) {
          piecesToAnimate.push({ piece: board[r][c]!, row: r, col: c, id: `call-${offenderId}-${Date.now()}`, type: 'call' })
        }
        newBoard[r][c] = null
      } else {
        for (let r = 0; r < gridSize; r++) {
          for (let c = 0; c < gridSize; c++) {
            if (newBoard[r][c]?.id === offenderId) {
              piecesToAnimate.push({ piece: board[r][c]!, row: r, col: c, id: `call-${offenderId}-${Date.now()}`, type: 'call' })
              newBoard[r][c] = null
              break
            }
          }
        }
      }
    })

    if (piecesToAnimate.length > 0) {
      setAnimatingPieces(prev => [...prev, ...piecesToAnimate])
      setTimeout(() => { setAnimatingPieces(prev => prev.filter(p => !p.id.startsWith('call-'))) }, 500)
    }

    checkKingPromotion(newBoard, currentPlayer)
    setBoard(newBoard)
    saveBoard(newBoard)
    setOffenders([])
    const gameEnd = checkGameEnd(newBoard)
    if (gameEnd) setWinner(gameEnd)
  }

  const canRequestUndo = (requester: 'player1' | 'player2') => {
    if (undoUsedThisTurn) return false
    if (history.length === 0) return false
    if (winner) return false
    if (isInChainCapture) return false
    return history.some(state => state.currentPlayer === requester)
  }

  const handleRequestUndo = (requester: 'player1' | 'player2') => {
    if (!canRequestUndo(requester)) return
    setUndoRequest({ requester })
    setUndoUsedThisTurn(true)
  }

  const handleAcceptUndo = () => {
    if (history.length === 0) return
    const requester = undoRequest!.requester
    let movesToUndo = 1
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].currentPlayer === requester) {
        movesToUndo = history.length - i
        if (history[i].chainStartIndex !== null) {
          movesToUndo = history.length - history[i].chainStartIndex!
        }
        break
      }
    }
    const targetIndex = history.length - movesToUndo
    if (targetIndex < 0) return
    const targetState = history[targetIndex]
    setBoard(targetState.board)
    setCurrentPlayer(targetState.currentPlayer)
    setOffenders(targetState.offenders)
    setIsInChainCapture(targetState.isInChainCapture)
    setWinner(targetState.winner)
    setSelectedPiece(targetState.selectedPiece)
    setChainStartIndex(targetState.chainStartIndex)
    // Restore moves from snapshot — this is the fix for undo not reflecting in history
    setMoves(targetState.moves ?? [])
    setHistory(prev => prev.slice(0, targetIndex))
    setUndoRequest(null)
  }

  const handleDeclineUndo = () => {
    setUndoRequest(null)
    setHistory([])
  }

  const handleDragStart = (e: React.DragEvent, row: number, col: number) => {
    if (winner) { e.preventDefault(); return }
    if (board[row][col]?.player !== currentPlayer) { e.preventDefault(); return }
    setDraggedPiece({ row, col })
    setSelectedPiece({ row, col })
    e.dataTransfer.effectAllowed = 'move'
    const empty = document.createElement('img')
    empty.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs='
    document.body.appendChild(empty)
    e.dataTransfer.setDragImage(empty, 0, 0)
    requestAnimationFrame(() => document.body.removeChild(empty))
    setDragPos({ x: e.clientX, y: e.clientY })
  }

  const handleRootDragOver = (e: React.DragEvent) => {
    if (draggedPiece) setDragPos({ x: e.clientX, y: e.clientY })
  }

  const handleDragEnd = () => { setDragPos(null); setDraggedPiece(null) }
  const handleCellDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }

  const handleDrop = (e: React.DragEvent, toRow: number, toCol: number) => {
    e.preventDefault()
    if (!draggedPiece) return
    attemptMove(draggedPiece.row, draggedPiece.col, toRow, toCol, true)
    setDraggedPiece(null)
    setDragPos(null)
  }

  const isOffender = (row: number, col: number): boolean => {
    const piece = board[row]?.[col]
    if (!piece) return false
    if (piece.id && offenders.includes(piece.id)) return true
    if (offenders.includes(`pos:${row}:${col}`)) return true
    return false
  }

  const removeAnimatingPiece = (id: string) => {
    setAnimatingPieces(prev => prev.filter(p => p.id !== id))
  }

  const loadGameState = (savedState: any) => {
    setBoard(savedState.board)
    setCurrentPlayer(savedState.currentPlayer)
    setSelectedPiece(savedState.selectedPiece)
    setIsInChainCapture(savedState.isInChainCapture)
    setWinner(savedState.winner)
    setOffenders(savedState.offenders)
    setUndoRequest(savedState.undoRequest)
    setHistory(savedState.history)
    setChainStartIndex(savedState.chainStartIndex)
    setUndoUsedThisTurn(savedState.undoUsedThisTurn)
    setMoves(savedState.moves)
    setBoardHistory(savedState.boardHistory)
    setAnimatingPieces(savedState.animatingPieces)
    setIsFirstMove(savedState.isFirstMove)
    setCurrentMoveIndex(-1)
    
    // Save to regular storage
    saveBoard(savedState.board)
    storage.set('openDamCurrentPlayer', savedState.currentPlayer)
    storage.set('openDamWinner', savedState.winner)
    storage.set('openDamIsInChainCapture', savedState.isInChainCapture)
    storage.set('openDamHistory', savedState.history)
    storage.set('openDamChainStartIndex', savedState.chainStartIndex)
    storage.set('openDamUndoUsedThisTurn', savedState.undoUsedThisTurn)
    storage.set('openDamGameConfig', { gridSize: savedState.gridSize, boardType: savedState.boardType })
  }

  const handleResign = () => {
    const winner = currentPlayer === 'player1' ? 'player2' : 'player1'
    setWinner(winner)
    setSelectedPiece(null)
    setIsInChainCapture(false)
    setOffenders([])
    setUndoRequest(null)
    setDrawRequest(null)
    storage.set('openDamWinner', winner)
  }

  const handleRequestDraw = (requester: 'player1' | 'player2') => {
    setDrawRequest({ requester })
  }

  const handleAcceptDraw = () => {
    setWinner('draw')
    setSelectedPiece(null)
    setIsInChainCapture(false)
    setOffenders([])
    setDrawRequest(null)
    storage.set('openDamWinner', 'draw')
  }

  const handleDeclineDraw = () => {
    setDrawRequest(null)
  }

  const navigateToMove = (index: number) => {
    const maxIndex = history.length - 1
    const clampedIndex = Math.max(-1, Math.min(index, maxIndex))
    setCurrentMoveIndex(clampedIndex)
    
    if (clampedIndex === -1) {
      // Show current board
      setBoard(board)
    } else if (history[clampedIndex]) {
      // Show board from history
      setBoard(history[clampedIndex].board)
    }
  }

  const goToPreviousMove = () => {
    navigateToMove(currentMoveIndex - 1)
  }

  const goToNextMove = () => {
    navigateToMove(currentMoveIndex + 1)
  }

  const goToLatestMove = () => {
    setCurrentMoveIndex(-1)
    if (history.length > 0) {
      setBoard(board)
    }
  }

  return {
    board,
    currentPlayer,
    selectedPiece,
    draggedPiece,
    dragPos,
    offenders,
    isOffender,
    handleBoardClick,
    handleCellClick,
    undoRequest,
    undoUsedThisTurn,
    canRequestUndo,
    isInChainCapture,
    winner,
    handleDragStart,
    handleDragEnd,
    handleRootDragOver,
    handleCellDragOver,
    handleDrop,
    resetBoard,
    handleCall,
    handleRequestUndo,
    handleAcceptUndo,
    handleDeclineUndo,
    handleResign,
    gridSize,
    animatingPieces,
    moves,
    removeAnimatingPiece,
    loadGameState,
    playerSide,
    drawRequest,
    handleRequestDraw,
    handleAcceptDraw,
    handleDeclineDraw,
    currentMoveIndex,
    goToPreviousMove,
    goToNextMove,
    goToLatestMove,
  }
}