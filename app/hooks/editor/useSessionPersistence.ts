/*

Create a session (Session, UserSession) once, when the Yjs provider
has synced and the user is authenticated. Then enable auto-save
for the session.

The hasCalled ref enforces the "once" — even if providerSynced flips back and forth, 
the session is only created on the first time all conditions are met.

*/
import { useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import type * as Y from 'yjs'

import { YJS_KEYS } from '@/constants/editor'
import type { Session as PrismaSession } from '@/generated/prisma'

const AUTO_SAVE_DEBOUNCE_MS = 3000

interface UseSessionPersistenceOptions {
  roomId: string
  providerSynced: boolean
  ydocRef: React.RefObject<Y.Doc | null>
  isOwner: boolean
}

export function useSessionPersistence({
  roomId,
  providerSynced,
  ydocRef,
  isOwner,
}: UseSessionPersistenceOptions) {
  const { data: authSession } = useSession()
  const sessionIdRef = useRef<string | null>(null)
  const hasCalled = useRef(false)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Create session once when provider syncs and user is authenticated
  useEffect(() => {
    if (!providerSynced) return
    if (!authSession?.user?.id) return
    if (hasCalled.current) return
    if (!ydocRef.current) return

    hasCalled.current = true

    const ydoc = ydocRef.current
    const code = ydoc.getText(YJS_KEYS.MONACO_TEXT).toString()
    const language = (ydoc.getMap(YJS_KEYS.ROOM).get('language') as string) ?? 'javascript'
    const strokes = ydoc.getArray(YJS_KEYS.STROKES).toArray()

    async function createSession() {
      try {
        const res = await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId, code, language, strokes, isOwner }),
        })
        if (!res.ok) throw new Error(`Failed to create session: ${res.status}`)
        const data: { session: PrismaSession } = await res.json()
        sessionIdRef.current = data.session.id

        // Restore saved content into Y.Doc if the doc is currently empty.
        // Only applies when refreshing alone — if other users are active,
        // the Yjs server already has live content and Y.Text won't be empty.
        // Always restore from DB — DB is source of truth, Yjs server is ephemeral.
        // Delete any stale Yjs server content and replace with the saved version.
        const doc = ydocRef.current
        if (!doc) return
        doc.transact(() => {
          const liveText = doc.getText(YJS_KEYS.MONACO_TEXT)
          liveText.delete(0, liveText.length)
          if (data.session.code) liveText.insert(0, data.session.code)

          const liveStrokes = doc.getArray(YJS_KEYS.STROKES)
          liveStrokes.delete(0, liveStrokes.length)
          if (Array.isArray(data.session.strokes) && data.session.strokes.length > 0) {
            liveStrokes.push(data.session.strokes)
          }
        })
      } catch (e) {
        console.error('useSessionPersistence: failed to create session', e)
      }
    }

    createSession()
  }, [providerSynced, authSession?.user?.id, roomId, ydocRef, isOwner])

  // Auto-save on code or stroke changes, debounced by 3s
  useEffect(() => {
    if (!providerSynced) return
    if (!authSession?.user?.id) return
    if (!ydocRef.current) return

    const ydoc = ydocRef.current
    const monacoText = ydoc.getText(YJS_KEYS.MONACO_TEXT)
    const strokesArray = ydoc.getArray(YJS_KEYS.STROKES)

    function scheduleAutoSave() {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)

      debounceTimerRef.current = setTimeout(async () => {
        const id = sessionIdRef.current
        if (!id || !ydocRef.current) return

        const doc = ydocRef.current
        const code = doc.getText(YJS_KEYS.MONACO_TEXT).toString()
        const language = (doc.getMap(YJS_KEYS.ROOM).get('language') as string) ?? 'javascript'
        const strokes = doc.getArray(YJS_KEYS.STROKES).toArray()

        try {
          const res = await fetch(`/api/session/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, language, strokes }),
          })
          if (!res.ok) console.error('[AutoSave] PATCH failed:', res.status)
        } catch (e) {
          console.error('[AutoSave] fetch error:', e)
        }
      }, AUTO_SAVE_DEBOUNCE_MS)
    }

    monacoText.observe(scheduleAutoSave)
    strokesArray.observe(scheduleAutoSave)

    return () => {
      monacoText.unobserve(scheduleAutoSave)
      strokesArray.unobserve(scheduleAutoSave)
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [providerSynced, authSession?.user?.id, ydocRef])

  return { sessionIdRef }
}
