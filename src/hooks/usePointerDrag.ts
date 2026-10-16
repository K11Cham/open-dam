import { useCallback, useEffect, useRef, useState } from 'react'
import type { Coord } from '../game/types'

export interface DragState {
  from: Coord
  x: number
  y: number
  /** True once the pointer has moved far enough to count as a drag, not a tap. */
  active: boolean
}

const DRAG_THRESHOLD_PX = 6

/**
 * Pointer-events drag, replacing the old HTML5 drag-and-drop.
 *
 * HTML5 `dragstart`/`drop` never fire on touch devices, so the previous
 * implementation was mouse-only. Pointer events cover mouse, touch and pen with
 * one code path, and the tap-vs-drag threshold means a short tap still falls
 * through to click-to-select instead of being swallowed as a zero-distance drag.
 *
 * Cells identify themselves with `data-row` / `data-col`, so the drop target is
 * resolved by hit-testing the element under the pointer rather than by relying
 * on per-cell drop handlers.
 */
export function usePointerDrag(options: {
  canDragFrom: (coord: Coord) => boolean
  onDrop: (from: Coord, to: Coord) => void
  onTap: (coord: Coord) => void
  disabled?: boolean
}) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const update = (next: DragState | null) => {
    dragRef.current = next
    setDrag(next)
  }

  const coordUnderPointer = (x: number, y: number): Coord | null => {
    const element = document.elementFromPoint(x, y)
    const cell = element?.closest<HTMLElement>('[data-row][data-col]')
    if (!cell) return null
    const row = Number(cell.dataset.row)
    const col = Number(cell.dataset.col)
    return Number.isFinite(row) && Number.isFinite(col) ? { row, col } : null
  }

  const start = useCallback((event: React.PointerEvent, coord: Coord) => {
    if (optionsRef.current.disabled) return
    if (event.button !== undefined && event.button !== 0) return
    if (!optionsRef.current.canDragFrom(coord)) return
    update({ from: coord, x: event.clientX, y: event.clientY, active: false })
  }, [])

  useEffect(() => {
    if (!drag) return

    const handleMove = (event: PointerEvent) => {
      const current = dragRef.current
      if (!current) return
      const moved =
        Math.abs(event.clientX - current.x) > DRAG_THRESHOLD_PX ||
        Math.abs(event.clientY - current.y) > DRAG_THRESHOLD_PX
      update({
        ...current,
        x: event.clientX,
        y: event.clientY,
        active: current.active || moved,
      })
      if (current.active || moved) event.preventDefault()
    }

    const handleUp = (event: PointerEvent) => {
      const current = dragRef.current
      update(null)
      if (!current) return

      if (!current.active) {
        // Never moved: treat as a tap on the origin square.
        optionsRef.current.onTap(current.from)
        return
      }
      const target = coordUnderPointer(event.clientX, event.clientY)
      if (!target) return
      if (target.row === current.from.row && target.col === current.from.col) {
        optionsRef.current.onTap(current.from)
        return
      }
      optionsRef.current.onDrop(current.from, target)
    }

    const handleCancel = () => update(null)

    window.addEventListener('pointermove', handleMove, { passive: false })
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleCancel)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleCancel)
    }
  }, [drag !== null])

  return { drag: drag?.active ? drag : null, rawDrag: drag, start }
}
