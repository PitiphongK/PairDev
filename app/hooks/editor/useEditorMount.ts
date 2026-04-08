/**
 * Hook for Monaco editor mounting and Yjs binding.
 *
 * Owns: desktop/mobile editor refs, MonacoBinding lifecycle, the
 * media-query listener that keeps editorRef pointing to the visible
 * layout's editor, and the readOnly enforcement effect.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { WebsocketProvider } from 'y-websocket'
import type * as Y from 'yjs'

import { YJS_KEYS } from '@/constants/editor'
import type { AwarenessRole } from '@/interfaces/awareness'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MonacoEditor = import('monaco-editor').editor.IStandaloneCodeEditor

interface UseEditorMountOptions {
  /** Shared editor ref — updated here to point at the visible layout's editor. */
  editorRef: React.RefObject<MonacoEditor | null>
  ydocRef: React.RefObject<Y.Doc | null>
  providerRef: React.RefObject<WebsocketProvider | null>
  myRoleRef: React.RefObject<AwarenessRole>
  /** Current role — used by the readOnly enforcement effect. */
  myRole: AwarenessRole
}

interface UseEditorMountReturn {
  desktopEditorRef: React.RefObject<MonacoEditor | null>
  mobileEditorRef: React.RefObject<MonacoEditor | null>
  bindingRef: React.RefObject<{ destroy(): void } | null>
  /** True once the active editor has been mounted and bound to Yjs. */
  editorMounted: boolean
  handleMount: (editor: MonacoEditor) => void
  handleMountMobile: (editor: MonacoEditor) => void
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEditorMount({
  editorRef,
  ydocRef,
  providerRef,
  myRoleRef,
  myRole,
}: UseEditorMountOptions): UseEditorMountReturn {
  const desktopEditorRef = useRef<MonacoEditor | null>(null)
  const mobileEditorRef = useRef<MonacoEditor | null>(null)
  const bindingRef = useRef<{ destroy(): void } | null>(null)
  const [editorMounted, setEditorMounted] = useState(false)

  // Keep editorRef pointing to whichever layout is currently visible.
  // Two separate <Editor> instances exist (desktop + mobile) but only one
  // is rendered at a time via CSS responsive classes.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const sync = () => {
      ;(editorRef as React.MutableRefObject<MonacoEditor | null>).current = mq.matches
        ? desktopEditorRef.current
        : mobileEditorRef.current
    }
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [editorRef])

  // Enforce readOnly based on role whenever role or mount state changes.
  // This handles cases where role is resolved before or after the editor mounts.
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    editor.updateOptions({ readOnly: myRole === 'navigator' })
  }, [myRole, editorMounted, editorRef])

  // Shared mount logic for both desktop and mobile editors.
  const mountEditor = useCallback(
    async (editor: MonacoEditor, isMobile: boolean) => {
      if (isMobile) {
        mobileEditorRef.current = editor
      } else {
        desktopEditorRef.current = editor
      }

      // Only bind Yjs to the currently visible layout.
      const isDesktop = window.matchMedia('(min-width: 768px)').matches
      const isVisible = (isDesktop && !isMobile) || (!isDesktop && isMobile)

      if (!isVisible) {
        editor.updateOptions({ readOnly: myRoleRef.current === 'navigator' })
        return
      }

      ;(editorRef as React.MutableRefObject<MonacoEditor | null>).current = editor

      const ydoc = ydocRef.current!
      const provider = providerRef.current!
      const ytext = ydoc.getText(YJS_KEYS.MONACO_TEXT)

      // Normalise any CRLF already in Y.Text before binding (handles the case
      // where a Windows client seeded the document first).
      const raw = ytext.toString()
      if (raw.includes('\r\n')) {
        ydoc.transact(() => {
          ytext.delete(0, ytext.length)
          ytext.insert(0, raw.replace(/\r\n/g, '\n'))
        })
      }

      // Destroy any previous binding so only one is ever active at a time.
      const { MonacoBinding } = await import('y-monaco')
      bindingRef.current?.destroy()
      bindingRef.current = null

      const model = editor.getModel()
      if (model) {
        // Force Monaco to use LF so it never writes \r\n into the Yjs doc.
        model.setEOL(0 /* EndOfLineSequence.LF */)
        bindingRef.current = new MonacoBinding(
          ytext,
          model,
          new Set([editor]),
          provider.awareness
        )
        // Patch any CRLF Monaco may have re-introduced into the model.
        const content = model.getValue()
        if (content.includes('\r\n')) model.setValue(content.replace(/\r\n/g, '\n'))
      }

      // Apply readOnly immediately — the role-enforcement effect may have run
      // before the editor was mounted (async), so we enforce it here too.
      editor.updateOptions({ readOnly: myRoleRef.current === 'navigator' })
      setEditorMounted(true)
    },
    [editorRef, ydocRef, providerRef, myRoleRef]
  )

  const handleMount = useCallback(
    (editor: MonacoEditor) => mountEditor(editor, false),
    [mountEditor]
  )

  const handleMountMobile = useCallback(
    (editor: MonacoEditor) => mountEditor(editor, true),
    [mountEditor]
  )

  return {
    desktopEditorRef,
    mobileEditorRef,
    bindingRef,
    editorMounted,
    handleMount,
    handleMountMobile,
  }
}
