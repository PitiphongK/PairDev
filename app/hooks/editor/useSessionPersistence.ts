import { useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import type * as Y from 'yjs'

import { YJS_KEYS } from '@/constants/editor'
import type { Session as PrismaSession } from '@/generated/prisma'

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
      } catch (e) {
        console.error('useSessionPersistence: failed to create session', e)
      }
    }

    createSession()
  }, [providerSynced, authSession?.user?.id, roomId, ydocRef, isOwner])

  return { sessionIdRef }
}
