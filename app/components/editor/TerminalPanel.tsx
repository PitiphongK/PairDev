'use client'

import { forwardRef } from 'react'

import SharedTerminal, {
  type SharedTerminalHandle,
} from '@/components/SharedTerminal'

interface TerminalPanelProps {
  /** Room ID for the shared terminal */
  roomId: string
}

/**
 * Terminal panel component that wraps SharedTerminal with styling
 */
const TerminalPanel = forwardRef<SharedTerminalHandle, TerminalPanelProps>(
  function TerminalPanel({ roomId }, ref) {
    return (
      <div className="p-4 flex flex-col h-full">
        <h3 className="text-sm font-medium">Terminal</h3>
        <div className="mt-2 flex-1 min-h-0">
          <SharedTerminal ref={ref} roomId={roomId} />
        </div>
      </div>
    )
  }
)

export default TerminalPanel
