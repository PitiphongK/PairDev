'use client'

import React from 'react'

import DrawingBoard from '@/components/DrawingBoard'
import type * as Y from 'yjs'

interface EditorOverlayDrawingProps {
  ydoc?: Y.Doc | null
  active: boolean
  tool: 'pen' | 'eraser'
  onToolChange: (tool: 'pen' | 'eraser') => void
}

export default function EditorOverlayDrawing({
  ydoc,
  active,
  tool,
  onToolChange,
}: EditorOverlayDrawingProps) {
  return (
    <div
      className={`absolute inset-0 z-30 ${active ? 'pointer-events-auto' : 'pointer-events-none'}`}
    >
      <DrawingBoard
        ydoc={ydoc ?? null}
        tool={tool}
        onToolChange={onToolChange}
        backgroundColor="transparent"
        className="h-full w-full bg-transparent"
        strokesArrayName="overlayStrokes"
        showToolbar={active}
      />
    </div>
  )
}
