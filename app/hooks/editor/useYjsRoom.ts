/**
 * Hook for the full Yjs room lifecycle.
 *
 * Owns: Y.Doc + WebsocketProvider setup, awareness/user-state tracking,
 * owner election, role assignment, language sync, panel-map reference,
 * cursor CSS injection, auto-assign roles, room destruction, and the
 * pagehide/beforeunload cleanup handler.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { addToast } from '@heroui/toast'
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'

import {
  LANGUAGE_STARTER_CODE,
  ROOM_MAP_KEYS,
  STORAGE_KEYS,
  YJS_KEYS,
  YJS_WEBSOCKET_URL,
} from '@/constants/editor'
import type { AwarenessRole } from '@/interfaces/awareness'
import type { AwarenessEntry, ProviderWithSyncedEvents } from '@/interfaces/editor'
import { Languages } from '@/interfaces/languages'
import { generateRandomColor } from '@/utils/editor'

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

const LANGUAGE_VALUES = new Set(Object.values(Languages))
const isValidLanguage = (value: unknown): value is Languages =>
  LANGUAGE_VALUES.has(value as Languages)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseYjsRoomOptions {
  roomId: string
  /** Shared editor ref — used to apply readOnly immediately on role changes. */
  editorRef: React.RefObject<import('monaco-editor').editor.IStandaloneCodeEditor | null>
  /**
   * Called once after ownership and role are resolved on the first sync.
   * Pass `startSession` from useSessionAnalytics here.
   *
   * Implemented via a stable internal ref so changing this callback never
   * causes the Yjs provider to reconnect.
   */
  onInitialRole: (role: AwarenessRole) => void
  /**
   * Called when the Yjs room tears down (room change / unmount).
   * Pass `resetAnalytics` from useSessionAnalytics here.
   */
  onSessionReset: () => void
}

export interface UseYjsRoomReturn {
  ydocRef: React.RefObject<Y.Doc | null>
  providerRef: React.RefObject<WebsocketProvider | null>
  awarenessRef: React.RefObject<import('y-protocols/awareness').Awareness | null>
  rolesMapRef: React.RefObject<Y.Map<AwarenessRole> | null>
  roomMapRef: React.RefObject<Y.Map<unknown> | null>
  panelsMapRef: React.RefObject<Y.Map<unknown> | null>
  analyticsMapRef: React.RefObject<Y.Map<unknown> | null>
  userStates: AwarenessEntry[]
  providerSynced: boolean
  roomReady: boolean
  isOwner: boolean
  isOwnerRef: React.RefObject<boolean>
  ownerId: number | null
  myRole: AwarenessRole
  myRoleRef: React.RefObject<AwarenessRole>
  language: Languages
  languageRef: React.RefObject<Languages>
  handleLanguageChange: (next: Languages, skipContentReset?: boolean) => void
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useYjsRoom({
  roomId,
  editorRef,
  onInitialRole,
  onSessionReset,
}: UseYjsRoomOptions): UseYjsRoomReturn {
  // ── State ──────────────────────────────────────────────────────────────────
  const [userStates, setUserStates] = useState<AwarenessEntry[]>([])
  const [language, setLanguage] = useState<Languages>(Languages.JAVASCRIPT)
  const [providerSynced, setProviderSynced] = useState(false)
  const [roomReady, setRoomReady] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [ownerId, setOwnerId] = useState<number | null>(null)
  const [myRole, setMyRole] = useState<AwarenessRole>('navigator')

  // ── Yjs primitive refs ─────────────────────────────────────────────────────
  const ydocRef = useRef<Y.Doc | null>(null)
  const providerRef = useRef<WebsocketProvider | null>(null)
  const awarenessRef = useRef<import('y-protocols/awareness').Awareness | null>(null)
  const rolesMapRef = useRef<Y.Map<AwarenessRole> | null>(null)
  const roomMapRef = useRef<Y.Map<unknown> | null>(null)
  const panelsMapRef = useRef<Y.Map<unknown> | null>(null)
  const analyticsMapRef = useRef<Y.Map<unknown> | null>(null)

  // ── Internal refs ──────────────────────────────────────────────────────────
  const isOwnerRef = useRef(false)
  const myRoleRef = useRef<AwarenessRole>('navigator')
  const languageRef = useRef<Languages>(Languages.JAVASCRIPT)
  const ownerInitRef = useRef(false)
  const lastOwnerIdRef = useRef<number | null>(null)
  const updateUsersRef = useRef<(() => void) | undefined>(undefined)

  // Stable callback refs — updated every render, never trigger the Yjs effect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const onInitialRoleRef = useRef(onInitialRole)
  const onSessionResetRef = useRef(onSessionReset)
  onInitialRoleRef.current = onInitialRole
  onSessionResetRef.current = onSessionReset

  // ── Ref sync effects ───────────────────────────────────────────────────────
  useEffect(() => { isOwnerRef.current = isOwner }, [isOwner])
  useEffect(() => { myRoleRef.current = myRole }, [myRole])
  useEffect(() => { languageRef.current = language }, [language])

  // Persist owner status across refreshes
  useEffect(() => {
    sessionStorage.setItem(`codelink:isOwner:${roomId}`, isOwner ? '1' : '0')
  }, [isOwner, roomId])

  // ── Cursor color CSS injection ─────────────────────────────────────────────
  useEffect(() => {
    const styleId = 'yjs-cursor-colors'
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = styleId
      document.head.appendChild(styleEl)
    }
    const rules = userStates
      .map(([clientId, state]) => {
        const color = state.user?.color ?? '#888888'
        const name = (state.user?.name ?? `User ${clientId}`).replace(/"/g, '\\"')
        return [
          `.yRemoteSelection-${clientId} { background-color: ${color}40; }`,
          `.yRemoteSelectionHead-${clientId} { border-color: ${color}; }`,
          `.yRemoteSelectionHead-${clientId}::after { background-color: ${color}; content: "${name}"; }`,
        ].join('\n')
      })
      .join('\n')
    styleEl.textContent = rules
  }, [userStates])

  // ── Language change (driver only) ──────────────────────────────────────────
  /** Sync language to the shared room map and optionally seed starter code. */
  const handleLanguageChange = useCallback(
    (next: Languages, skipContentReset = false) => {
      if (next === languageRef.current) return
      if (myRoleRef.current === 'navigator') return
      languageRef.current = next
      setLanguage(next)
      roomMapRef.current?.set(ROOM_MAP_KEYS.LANGUAGE, next)
      if (skipContentReset) return
      const ydoc = ydocRef.current
      if (ydoc) {
        const ytext = ydoc.getText(YJS_KEYS.MONACO_TEXT)
        // Always normalise to LF so Windows and Mac stay in sync
        const starter = (LANGUAGE_STARTER_CODE[next] ?? '').replace(/\r\n/g, '\n')
        ydoc.transact(() => {
          ytext.delete(0, ytext.length)
          ytext.insert(0, starter)
        })
      }
    },
    [] // reads refs only — stable forever
  )

  // ── Main Yjs lifecycle ─────────────────────────────────────────────────────
  useEffect(() => {
    const ownerTokenKey = `codelink:ownerToken:${roomId}`

    const ydoc = new Y.Doc()
    const provider = new WebsocketProvider(YJS_WEBSOCKET_URL, roomId, ydoc)

    // Set user presence before first awareness broadcast so peers never see
    // a transient "User {clientId}" name.
    const userName = sessionStorage.getItem(STORAGE_KEYS.USER_NAME) || 'Anonymous'
    provider.awareness.setLocalStateField('user', {
      name: userName,
      color: generateRandomColor(),
    })

    const handleMouseMove = (event: MouseEvent) => {
      const normalizedX = window.innerWidth > 0 ? event.clientX / window.innerWidth : 0
      const normalizedY = window.innerHeight > 0 ? event.clientY / window.innerHeight : 0
      provider.awareness.setLocalStateField('cursor', {
        x: Math.max(0, Math.min(1, normalizedX)),
        y: Math.max(0, Math.min(1, normalizedY)),
      })
    }
    window.addEventListener('mousemove', handleMouseMove)

    const updateUsers = () => {
      const states = (
        Array.from(provider.awareness.getStates().entries()) as AwarenessEntry[]
      ).filter(([, state]) => state.user?.name != null)

      setUserStates((prev) => {
        const prevIds = prev.map(([id]) => id).sort((a, b) => a - b)
        const newIds = states.map(([id]) => id).sort((a, b) => a - b)
        if (
          prevIds.length === newIds.length &&
          prevIds.every((id, i) => id === newIds[i])
        ) {
          if (JSON.stringify(prev) === JSON.stringify(states)) return prev
        }
        return states
      })
    }
    updateUsersRef.current = updateUsers
    provider.awareness.on('change', updateUsers)
    updateUsers()

    // Shared maps
    const rolesMap = ydoc.getMap<AwarenessRole>(YJS_KEYS.ROLES)
    rolesMapRef.current = rolesMap

    const analyticsMap = ydoc.getMap<unknown>(YJS_KEYS.ANALYTICS)
    analyticsMapRef.current = analyticsMap

    const roomMap = ydoc.getMap<unknown>(YJS_KEYS.ROOM)
    roomMapRef.current = roomMap
    setRoomReady(true)

    const panelsMap = ydoc.getMap<unknown>(YJS_KEYS.PANELS)
    panelsMapRef.current = panelsMap

    const currentId = provider.awareness.clientID

    // ── Synced handler: owner election + role assignment ─────────────────────
    const syncedHandler = async (isSynced: boolean) => {
      if (!isSynced) return
      setProviderSynced(true)

      if (ownerInitRef.current) return
      ownerInitRef.current = true

      let owner = roomMap.get(ROOM_MAP_KEYS.OWNER)
      const candidates = Array.from(provider.awareness.getStates().keys()) as number[]
      const localOwnerToken = sessionStorage.getItem(ownerTokenKey)

      const claimOwnership = async () => {
        if (!localOwnerToken) return roomMap.get(ROOM_MAP_KEYS.OWNER)
        try {
          const res = await fetch(`/api/rooms/${roomId}/claim-ownership`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ownerToken: localOwnerToken }),
          })
          if (res.ok) {
            roomMap.set(ROOM_MAP_KEYS.OWNER, currentId)
            return currentId
          }
        } catch (err) {
          console.error('Failed to claim ownership', err)
        }
        return roomMap.get(ROOM_MAP_KEYS.OWNER)
      }

      if (owner == null) {
        // First client to connect claims the room
        const arbiter = candidates.length > 0 ? Math.min(...candidates) : currentId
        if (currentId === arbiter) {
          const newOwner = await claimOwnership()
          owner = typeof newOwner === 'number' ? newOwner : roomMap.get(ROOM_MAP_KEYS.OWNER)
        }
      } else if (owner !== currentId && localOwnerToken) {
        // Returning owner reclaims after a refresh
        const newOwner = await claimOwnership()
        owner = typeof newOwner === 'number' ? newOwner : roomMap.get(ROOM_MAP_KEYS.OWNER)
      }

      const isCurrentUserOwner = owner === currentId
      setOwnerId(typeof owner === 'number' ? owner : null)
      setIsOwner(isCurrentUserOwner)
      isOwnerRef.current = isCurrentUserOwner

      // Assign initial role
      const existingRole = rolesMap.get(currentId.toString())
      const myInitialRole: AwarenessRole = isCurrentUserOwner ? 'driver' : 'navigator'
      if (existingRole == null) {
        rolesMap.set(currentId.toString(), myInitialRole)
        setMyRole(myInitialRole)
        myRoleRef.current = myInitialRole
      } else {
        setMyRole(existingRole)
        myRoleRef.current = existingRole
        // Apply immediately — don't wait for a React render cycle
        editorRef.current?.updateOptions({ readOnly: existingRole === 'navigator' })
      }

      // Sync shared language
      const sharedLanguage = roomMap.get(ROOM_MAP_KEYS.LANGUAGE)
      if (!isValidLanguage(sharedLanguage)) {
        if (isCurrentUserOwner) roomMap.set(ROOM_MAP_KEYS.LANGUAGE, languageRef.current)
      } else if (sharedLanguage !== languageRef.current) {
        languageRef.current = sharedLanguage
        setLanguage(sharedLanguage)
      }

      // Seed starter code for brand-new rooms (owner only, Y.Text must be empty)
      if (isCurrentUserOwner) {
        const ytext = ydoc.getText(YJS_KEYS.MONACO_TEXT)
        if (ytext.length === 0) {
          const lang = isValidLanguage(sharedLanguage) ? sharedLanguage : languageRef.current
          const starter = (LANGUAGE_STARTER_CODE[lang] ?? '').replace(/\r\n/g, '\n')
          if (starter) ytext.insert(0, starter)
        }
      }

      // Notify the session analytics hook with the resolved initial role
      onInitialRoleRef.current(existingRole ?? myInitialRole)
    }

    const providerEvents = provider as unknown as ProviderWithSyncedEvents
    providerEvents.on('synced', syncedHandler)

    // ── Room map observer: owner + language changes ──────────────────────────
    const roomObserver = () => {
      const owner = roomMap.get(ROOM_MAP_KEYS.OWNER)
      setOwnerId(typeof owner === 'number' ? owner : null)
      setIsOwner(owner === currentId)

      const sharedLanguage = roomMap.get(ROOM_MAP_KEYS.LANGUAGE)
      if (isValidLanguage(sharedLanguage) && sharedLanguage !== languageRef.current) {
        languageRef.current = sharedLanguage
        setLanguage(sharedLanguage)
      }
    }
    roomMap.observe(roomObserver)

    // ── Roles map observer: react to role changes from the owner ─────────────
    const rolesObserver = () => {
      const selfId = provider.awareness.clientID
      const fromMap = rolesMap.get(selfId.toString())
      if (fromMap != null && fromMap !== myRoleRef.current) {
        myRoleRef.current = fromMap
        setMyRole(fromMap)
        editorRef.current?.updateOptions({ readOnly: fromMap === 'navigator' })
        addToast({
          title: fromMap === 'driver' ? 'You are now the Driver' : 'You are now the Navigator',
          description:
            fromMap === 'driver'
              ? 'You have edit access to the code.'
              : 'You are in read-only mode.',
          color: fromMap === 'driver' ? 'success' : 'primary',
          timeout: 4000,
        })
      }
    }
    rolesMap.observe(rolesObserver)

    ydocRef.current = ydoc
    providerRef.current = provider
    awarenessRef.current = provider.awareness

    // ── Cleanup ──────────────────────────────────────────────────────────────
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      provider.awareness.off('change', updateUsersRef.current ?? updateUsers)
      roomMapRef.current?.unobserve(roomObserver)
      rolesMapRef.current?.unobserve(rolesObserver)
      try {
        providerEvents.off?.('synced', syncedHandler)
      } catch {}

      provider.destroy()
      ydoc.destroy()

      ydocRef.current = null
      providerRef.current = null
      awarenessRef.current = null
      analyticsMapRef.current = null
      panelsMapRef.current = null
      updateUsersRef.current = undefined

      onSessionResetRef.current()
      setRoomReady(false)
      setProviderSynced(false)
      ownerInitRef.current = false
    }
  }, [roomId]) // eslint-disable-line react-hooks/exhaustive-deps
  // ^ Callbacks are accessed via stable refs; editorRef is a stable ref object.

  // ── Room destruction observer — kick non-owners when session ends ───────────
  useEffect(() => {
    if (!roomReady) return
    const roomMap = roomMapRef.current
    if (!roomMap) return

    const onRoomChange = () => {
      if (roomMap.get(ROOM_MAP_KEYS.DESTROYED) !== true) return
      if (isOwner) return
      sessionStorage.setItem(
        'codelink:pending-toast',
        JSON.stringify({
          title: 'Session ended',
          description: 'The owner has ended this session.',
          color: 'primary',
          variant: 'solid',
          timeout: 4000,
        })
      )
      window.location.href = '/'
    }

    roomMap.observe(onRoomChange)
    onRoomChange()
    return () => roomMap.unobserve(onRoomChange)
  }, [isOwner, roomReady])

  // ── Auto-assign roles to participants (owner only) ─────────────────────────
  useEffect(() => {
    if (!providerSynced) return
    const provider = providerRef.current
    const roomMap = roomMapRef.current
    const rolesMap = rolesMapRef.current
    if (!provider || !roomMap || !rolesMap) return
    if (roomMap.get(ROOM_MAP_KEYS.DESTROYED) === true) return

    if (ownerId == null) return
    const selfId = provider.awareness.clientID
    if (selfId !== ownerId) return

    const presentIds = Array.from(provider.awareness.getStates().keys()) as number[]

    // Demote previous owner if ownership transferred while they are still present
    const prevOwner = lastOwnerIdRef.current
    if (prevOwner != null && prevOwner !== ownerId && presentIds.includes(prevOwner)) {
      rolesMap.set(prevOwner.toString(), 'navigator')
    }

    // Assign navigator to any new participant without a role
    for (const cid of presentIds) {
      if (cid === ownerId) continue
      if (rolesMap.get(cid.toString()) == null) {
        rolesMap.set(cid.toString(), 'navigator')
      }
    }

    lastOwnerIdRef.current = ownerId
  }, [ownerId, providerSynced, userStates])

  // ── Destroy empty room ─────────────────────────────────────────────────────
  useEffect(() => {
    const provider = providerRef.current
    const roomMap = roomMapRef.current
    if (!provider || !roomMap || !providerSynced) return
    if (roomMap.get(ROOM_MAP_KEYS.DESTROYED) === true) return

    const presentIds = new Set<number>(
      Array.from(provider.awareness.getStates().keys()) as number[]
    )
    if (presentIds.size === 0) roomMap.set(ROOM_MAP_KEYS.DESTROYED, true)
  }, [providerSynced])

  // ── Cleanup on tab close — destroy room if owner is last user ──────────────
  useEffect(() => {
    const pagehideOptions: AddEventListenerOptions = { capture: true }

    const handleOwnerExit = () => {
      const provider = providerRef.current
      const rolesMap = rolesMapRef.current
      const roomMap = roomMapRef.current
      const panelsMap = panelsMapRef.current
      if (!provider || !roomMap || !isOwnerRef.current) return

      const selfId = provider.awareness.clientID
      const othersPresent = (
        Array.from(provider.awareness.getStates().keys()) as number[]
      ).filter((cid) => cid !== selfId).length

      if (othersPresent === 0) {
        try {
          roomMap.set(ROOM_MAP_KEYS.DESTROYED, true)
          if (rolesMap) {
            for (const k of Array.from(rolesMap.keys())) rolesMap.delete(k)
          }
          if (panelsMap) {
            for (const k of Array.from(panelsMap.keys())) panelsMap.delete(k)
          }
        } catch {}
      }
    }

    window.addEventListener('pagehide', handleOwnerExit, pagehideOptions)
    window.addEventListener('beforeunload', handleOwnerExit)
    return () => {
      window.removeEventListener('pagehide', handleOwnerExit, pagehideOptions)
      window.removeEventListener('beforeunload', handleOwnerExit)
    }
  }, [isOwner])

  return {
    ydocRef,
    providerRef,
    awarenessRef,
    rolesMapRef,
    roomMapRef,
    panelsMapRef,
    analyticsMapRef,
    userStates,
    providerSynced,
    roomReady,
    isOwner,
    isOwnerRef,
    ownerId,
    myRole,
    myRoleRef,
    language,
    languageRef,
    handleLanguageChange,
  }
}
