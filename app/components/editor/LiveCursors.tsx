'use client'

import { useEffect, useState } from 'react'

import LiveCursor from '@/components/LiveCursor'
import type { AwarenessEntry } from '@/interfaces/editor'

interface LiveCursorsProps {
  /** List of user states with their awareness data */
  userStates: AwarenessEntry[]
  /** Current user's client ID to exclude from rendering */
  myClientId: number | undefined
}

/**
 * Converts normalized cursor position (0-1) to screen coordinates.
 * Does NOT clamp, allowing cursors to render outside viewport bounds.
 */
function denormalizeCursor(
  normalizedX: number,
  normalizedY: number,
  viewportWidth: number,
  viewportHeight: number
): { x: number; y: number } {
  // Convert normalized (0-1) to screen pixels
  // Allows cursor to go out of bounds - it will simply be off-screen
  return {
    x: normalizedX * viewportWidth,
    y: normalizedY * viewportHeight,
  }
}

/**
 * Renders live cursors for all connected users except the current user.
 * Cursors use normalized coordinates (0-1) for cross-screen compatibility.
 */
export default function LiveCursors({
  userStates,
  myClientId,
}: LiveCursorsProps) {
  const [viewport, setViewport] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const updateViewport = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    }
    updateViewport()
    window.addEventListener('resize', updateViewport)
    return () => window.removeEventListener('resize', updateViewport)
  }, [])

  // Don't render until we have viewport dimensions
  if (viewport.width === 0 || viewport.height === 0) return null

  return (
    <>
      {userStates
        .filter(([clientId]) => clientId !== myClientId)
        .map(([clientId, state]) => {
          if (state.cursor) {
            const { x, y } = denormalizeCursor(
              state.cursor.x,
              state.cursor.y,
              viewport.width,
              viewport.height
            )
            return (
              <LiveCursor
                key={clientId}
                x={x}
                y={y}
                color={state.user?.color ?? '#888'}
                name={state.user?.name ?? `User ${clientId}`}
              />
            )
          }
          return null
        })}
    </>
  )
}
