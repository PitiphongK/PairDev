'use client'
import { useEffect, useRef } from 'react'

import type * as monaco from 'monaco-editor'
import type { Awareness } from 'y-protocols/awareness'
import * as Y from 'yjs'

import type {
  AwarenessEditorCursor,
  AwarenessScroll,
  AwarenessState,
} from '@/interfaces/awareness'
import { YJS_KEYS } from '@/constants/editor'

/**
 * Hook to publish local editor cursor and snap to a followed user's cursor.
 *
 * `editorReady` MUST be a boolean state that flips to true once both the
 * Monaco editor and the Yjs awareness are available (e.g. `editorMounted`).
 * Without it the publish effects would run once with null refs and never
 * re-run because React refs are stable objects.
 */
export function useMonacoFollowScroll(params: {
  editorRef: React.RefObject<monaco.editor.IStandaloneCodeEditor | null>
  awarenessRef: React.RefObject<Awareness | null>
  ydocRef: React.RefObject<Y.Doc | null>
  /** Flip to true once editor + awareness are ready (triggers effect re-run) */
  editorReady: boolean
  followTargetClientId: number | null
  onTargetGone?: () => void
}) {
  const {
    editorRef,
    awarenessRef,
    ydocRef,
    editorReady,
    followTargetClientId,
    onTargetGone,
  } = params

  const lastAppliedLineRef = useRef(0)
  const lastAppliedColumnRef = useRef(0)

  // Reset applied tracking when follow target changes
  useEffect(() => {
    lastAppliedLineRef.current = 0
    lastAppliedColumnRef.current = 0
  }, [followTargetClientId])

  // ── Publish local scroll position ──────────────────────────────────
  useEffect(() => {
    if (!editorReady) return
    const editor = editorRef.current
    const awareness = awarenessRef.current
    if (!editor || !awareness) return

    const publish = () => {
      awareness.setLocalStateField('scroll', {
        top: editor.getScrollTop(),
        left: editor.getScrollLeft(),
        ts: Date.now(),
      } satisfies AwarenessScroll)
    }

    const disposable = editor.onDidScrollChange(publish)
    publish()
    return () => disposable.dispose()
  }, [editorReady, editorRef, awarenessRef])

  // ── Publish local editor cursor position ───────────────────────────
  useEffect(() => {
    if (!editorReady) return
    const editor = editorRef.current
    const awareness = awarenessRef.current
    if (!editor || !awareness) return

    const publish = (
      overridePos?: monaco.Position | monaco.IPosition | null,
    ) => {
      const pos =
        overridePos ??
        editor.getPosition() ??
        editor.getSelection()?.getStartPosition() ??
        { lineNumber: 1, column: 1 }
      awareness.setLocalStateField('editorCursor', {
        lineNumber: pos.lineNumber,
        column: pos.column,
        ts: Date.now(),
      } satisfies AwarenessEditorCursor)
    }

    // Use the event's position directly — avoids the one-step-behind stale read
    // from editor.getPosition(). Do NOT listen to onDidChangeCursorSelection:
    // that fires *inside* y-monaco's deltaDecorations call and causes a
    // "Invoking deltaDecorations recursively" crash.
    const posDisposable = editor.onDidChangeCursorPosition((event) => {
      publish(event.position)
    })
    publish() // publish once immediately
    return () => posDisposable.dispose()
  }, [editorReady, editorRef, awarenessRef])

  // ── Snap to target's cursor when following ─────────────────────────
  useEffect(() => {
    if (!editorReady) return
    if (followTargetClientId == null) return

    const editor = editorRef.current
    const awareness = awarenessRef.current
    const ydoc = ydocRef.current
    if (!editor || !awareness) return

    const snapToTarget = () => {
      const st = awareness.getStates().get(followTargetClientId) as
        | (AwarenessState & { selection?: { head?: unknown } })
        | undefined

      if (!st) {
        onTargetGone?.()
        return
      }

      let line: number | null = null
      let col: number | null = null

      // Primary: use editorCursor published by the driver
      const cur = st.editorCursor
      if (cur) {
        line = cur.lineNumber
        col = cur.column
      }

      // Fallback: derive from y-monaco selection awareness state
      if (line == null && ydoc && st.selection?.head) {
        const ytext = ydoc.getText(YJS_KEYS.MONACO_TEXT)
        const headAbs = Y.createAbsolutePositionFromRelativePosition(
          st.selection.head as Y.RelativePosition,
          ydoc,
        )
        if (headAbs && headAbs.type === ytext) {
          const model = editor.getModel()
          if (model) {
            const pos = model.getPositionAt(headAbs.index)
            line = pos.lineNumber
            col = pos.column
          }
        }
      }

      if (line == null || col == null) return

      // Skip if we already revealed this exact position
      if (
        line === lastAppliedLineRef.current &&
        col === lastAppliedColumnRef.current
      ) {
        return
      }
      lastAppliedLineRef.current = line
      lastAppliedColumnRef.current = col

      console.log('Snapping to target:', {
        followTargetClientId,
        targetState: st,
        line,
        col,
      })

      editor.revealPositionInCenter({ lineNumber: line, column: col }, 1)
    }

    // Snap immediately
    snapToTarget()

    // Poll every 100ms so we always catch position changes
    const pollId = window.setInterval(snapToTarget, 100)

    // Also react to awareness change events
    const handler = ({
      removed,
    }: {
      added: number[]
      updated: number[]
      removed: number[]
    }) => {
      if (removed.includes(followTargetClientId)) {
        onTargetGone?.()
        return
      }
      snapToTarget()
    }
    awareness.on('change', handler)

    return () => {
      window.clearInterval(pollId)
      awareness.off('change', handler)
    }
  }, [
    editorReady,
    editorRef,
    awarenessRef,
    ydocRef,
    followTargetClientId,
    onTargetGone,
  ])
}
