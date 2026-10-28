import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Coord } from '../game/types'

export interface DragState {
  from: Coord
  x: number
  y: number
  /** True once the pointer has moved far enough to count as a drag, not a tap. */
  active: boolean
}

const DRAG_THRESHOLD_PX = 6

interface DragOptions {
  canDragFrom: (coord: Coord) => boolean
  onDrop: (from: Coord, to: Coord) => void
  onTap: (coord: Coord) => void
  disabled?: boolean
}

const coordUnderPointer = (x: number, y: number): Coord | null => {
  const cell = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-row][data-col]')
  if (!cell) return null
  const row = Number(cell.dataset.row)
  const col = Number(cell.dataset.col)
  return Number.isFinite(row) && Number.isFinite(col) ? { row, col } : null
}

/**
 * Pointer-events drag covering mouse, touch and pen with one code path. A
 * press that does not move past a small threshold counts as a tap, so tapping
 * a piece still selects it. The drop square is found by hit-testing the
 * element under the pointer (cells carry `data-row` / `data-col`).
 *
 * The window listeners are attached in the pointerdown handler itself, not in
 * an effect, so even the fastest tap cannot release before they exist.
 */
export function usePointerDrag(options: DragOptions) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const optionsRef = useRef(options)
  const detachRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    optionsRef.current = options
  })
  useEffect(() => () => detachRef.current?.(), [])

  const start = useCallback((event: ReactPointerEvent, coord: Coord) => {
    const opts = optionsRef.current
    if (opts.disabled || event.button !== 0 || !opts.canDragFrom(coord)) return
    detachRef.current?.()

    let current: DragState = { from: coord, x: event.clientX, y: event.clientY, active: false }
    const origin = { x: event.clientX, y: event.clientY }

    const handleMove = (e: PointerEvent) => {
      const moved = Math.abs(e.clientX - origin.x) > DRAG_THRESHOLD_PX || Math.abs(e.clientY - origin.y) > DRAG_THRESHOLD_PX
      current = { ...current, x: e.clientX, y: e.clientY, active: current.active || moved }
      if (current.active) {
        e.preventDefault()
        setDrag(current)
      }
    }

    const handleUp = (e: PointerEvent) => {
      detach()
      setDrag(null)
      if (!current.active) {
        optionsRef.current.onTap(coord)
        return
      }
      const target = coordUnderPointer(e.clientX, e.clientY)
      if (!target) return
      if (target.row === coord.row && target.col === coord.col) optionsRef.current.onTap(coord)
      else optionsRef.current.onDrop(coord, target)
    }

    const handleCancel = () => {
      detach()
      setDrag(null)
    }

    const detach = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleCancel)
      detachRef.current = null
    }

    window.addEventListener('pointermove', handleMove, { passive: false })
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleCancel)
    detachRef.current = detach
  }, [])

  return { drag, start }
}
