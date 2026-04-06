'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from 'react-resizable-panels'

import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Tooltip,
} from '@heroui/react'
import { addToast } from '@heroui/toast'
import Editor from '@monaco-editor/react'
import { useTheme } from 'next-themes'
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'

import DrawingBoard from '@/components/DrawingBoard'
import EditorOverlayDrawing from '@/components/EditorOverlayDrawing'
import {
  EditorModals,
  LanguageSelector,
  LiveCursors,
  TerminalPanel,
} from '@/components/editor/index'
import { type SharedTerminalHandle } from '@/components/SharedTerminal'
import Toolbar from '@/components/Toolbar'
import {
  DEFAULT_HORIZONTAL_LAYOUT,
  DEFAULT_VERTICAL_LAYOUT,
  LANGUAGE_STARTER_CODE,
  MONACO_EDITOR_OPTIONS,
  PANELS_MAP_KEYS,
  ROOM_MAP_KEYS,
  STORAGE_KEYS,
  YJS_KEYS,
  YJS_WEBSOCKET_URL,
} from '@/constants/editor'
import {
  useFileOperations,
  usePanelLayout,
  useRoleNotice,
  useSessionAnalytics,
} from '@/hooks/editor'
import { useMonacoFollowScroll } from '@/hooks/useMonacoFollowScroll'
import type { AwarenessRole } from '@/interfaces/awareness'
import type {
  AwarenessEntry,
  EditorClientProps,
  ProviderWithSyncedEvents,
  SessionSummary,
  UserRoleContribution,
} from '@/interfaces/editor'
import { Languages } from '@/interfaces/languages'
import {
  generateRandomColor,
  isNumberArray,
  parseAnalyticsEntry,
} from '@/utils/editor'
import { BarChart2, Crown, LogOut, MoreHorizontal, Pen, PenOff, Settings, Users, X } from 'lucide-react'
import { getLanguageIcon } from '@/components/editor/get-language-icon'

const LANGUAGE_VALUES = new Set(Object.values(Languages))
const isValidLanguage = (value: unknown): value is Languages =>
  LANGUAGE_VALUES.has(value as Languages)

// ============================================================================
// EditorClient Component
// ============================================================================

/**
 * Main collaborative code editor component.
 * 
 * Provides real-time collaboration features including:
 * - Synchronized code editing via Yjs/Monaco
 * - Role-based access control (driver/navigator)
 * - Live cursor tracking
 * - Shared terminal for code execution
 * - Drawing overlay for annotations
 * - Session analytics tracking
 * 
 * @param props.roomId - Unique identifier for the collaboration room
 */
export default function EditorClient({ roomId }: EditorClientProps) {
  const { resolvedTheme } = useTheme()
  const monacoTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'vs'

  const editorTabs = [
    {
      id: 'main',
      title: 'main',
      isActive: true,
    },
  ]

  // ============================================================================
  // Refs - Yjs Integration
  // ============================================================================
  /** Points to whichever editor is currently visible (desktop or mobile). */
  const editorRef = useRef<
    import('monaco-editor').editor.IStandaloneCodeEditor | null
  >(null)
  /** Stable ref to the desktop-layout editor instance. */
  const desktopEditorRef = useRef<
    import('monaco-editor').editor.IStandaloneCodeEditor | null
  >(null)
  /** Stable ref to the mobile-layout editor instance. */
  const mobileEditorRef = useRef<
    import('monaco-editor').editor.IStandaloneCodeEditor | null
  >(null)
  const ydocRef = useRef<Y.Doc | null>(null)
  const providerRef = useRef<WebsocketProvider | null>(null)
  const awarenessRef = useRef<import('y-protocols/awareness').Awareness | null>(null)
  const rolesMapRef = useRef<Y.Map<AwarenessRole> | null>(null)
  const roomMapRef = useRef<Y.Map<unknown> | null>(null)
  const panelsMapRef = useRef<Y.Map<unknown> | null>(null)
  const analyticsMapRef = useRef<Y.Map<unknown> | null>(null)
  const updateUsersRef = useRef<(() => void) | undefined>(undefined)
  const leaveConfirmedRef = useRef(false)
  /** Holds the single active MonacoBinding — destroyed and recreated on layout switch. */
  const bindingRef = useRef<{ destroy(): void } | null>(null)

  // Keep editorRef.current pointing to whichever editor layout is visible.
  // There are two separate <Editor> instances (desktop + mobile) but only one
  // is actually rendered at a time due to CSS responsive classes.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const sync = () => {
      editorRef.current = mq.matches
        ? desktopEditorRef.current
        : mobileEditorRef.current
    }
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  // ============================================================================
  // State - User Presence & Editor
  // ============================================================================
  const [userStates, setUserStates] = useState<AwarenessEntry[]>([])
  const [language, setLanguage] = useState<Languages>(Languages.JAVASCRIPT)
  const languageRef = useRef<Languages>(Languages.JAVASCRIPT)
  const [following, setFollowing] = useState<string | null>(null)
  const [followEnabled, setFollowEnabled] = useState(false)
  const handleTargetGone = useCallback(() => setFollowing(null), [])
  const [running, setRunning] = useState(false)
  const desktopTerminalRef = useRef<SharedTerminalHandle | null>(null)
  const mobileTerminalRef = useRef<SharedTerminalHandle | null>(null)
  /** Always points to whichever terminal layout is currently visible. */
  const terminalRef = useMemo(() => ({
    get current(): SharedTerminalHandle | null {
      const isDesktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
      return isDesktop ? desktopTerminalRef.current : mobileTerminalRef.current
    },
  }), [])

  // ============================================================================
  // State - Modals
  // ============================================================================
  const [rolesOpen, setRolesOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [endConfirmOpen, setEndConfirmOpen] = useState(false)
  const [endingSession, setEndingSession] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [analyticsOpen, setAnalyticsOpen] = useState(false)
  const [sessionEndedOpen, setSessionEndedOpen] = useState(false)
  const [githubImportOpen, setGithubImportOpen] = useState(false)
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null)
  const [teamRoleContribution, setTeamRoleContribution] = useState<UserRoleContribution[]>([])

  // ============================================================================
  // State - Ownership & Sync
  // ============================================================================
  const [isOwner, setIsOwner] = useState(false)
  const isOwnerRef = useRef(false)
  const [ownerId, setOwnerId] = useState<number | null>(null)
  const ownerInitRef = useRef(false)
  const lastOwnerIdRef = useRef<number | null>(null)
  const [providerSynced, setProviderSynced] = useState(false)
  const [roomReady, setRoomReady] = useState(false)

  // ============================================================================
  // State - Role & Drawing
  // ============================================================================
  const [myRole, setMyRole] = useState<AwarenessRole>('navigator')
  const myRoleRef = useRef<AwarenessRole>('navigator')
  const [overlayActive, setOverlayActive] = useState(false)
  const handleToggleOverlay = useCallback(() => {
    setOverlayActive((prev) => !prev)
  }, [])
  const [drawingTool, setDrawingTool] = useState<'pen' | 'eraser'>('pen')
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [editorMounted, setEditorMounted] = useState(false)

  const getOwnerStorageKey = useCallback(
    () => `codelink:isOwner:${roomId}`,
    [roomId]
  )

  const getOwnerTokenStorageKey = useCallback(
    () => `codelink:ownerToken:${roomId}`,
    [roomId]
  )

  /** Sync language to room map (driver only).
   *  Pass skipContentReset=true when content has already been set (e.g. after
   *  a file/GitHub import) to avoid overwriting it with the starter code. */
  const handleLanguageChange = useCallback((next: Languages, skipContentReset = false) => {
    if (next === languageRef.current) return
    if (myRoleRef.current === 'navigator') return
    languageRef.current = next
    setLanguage(next)
    roomMapRef.current?.set(ROOM_MAP_KEYS.LANGUAGE, next)
    // Skip the Y.Text reset when the caller has already written content
    // (e.g. file import or GitHub import) — resetting here would overwrite it.
    if (skipContentReset) return
    // Write the starter code directly into Y.Text so the change propagates
    // to all peers via Yjs, rather than only updating the local Monaco model
    // with executeEdits (which the binding can't reliably broadcast).
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
  }, [])

  // ============================================================================
  // Custom Hooks - Extracted Business Logic
  // ============================================================================
  const {
    handleExport,
    handleFileImport,
    handleGitHubImport,
  } = useFileOperations({
    editorRef,
    ydocRef,
    ytextKey: YJS_KEYS.MONACO_TEXT,
    language,
    roomId,
    onLanguageChange: handleLanguageChange,
  })

  const {
    setHLayout,
    setVLayout,
    hGroupRef,
    vGroupRef,
    handleHLayoutChange,
    handleVLayoutChange,
  } = usePanelLayout({
    panelsMapRef,
    myRole,
    followEnabled,
  })

  const {
    publishMyRoleTotals,
    computeSessionSummaryNow,
    computeTeamContributionNow,
    sessionStartRef,
    roleSinceRef,
    roleTotalsRef,
  } = useSessionAnalytics({
    myRole,
    providerSynced,
    providerRef,
    analyticsMapRef,
    userStates,
  })

  const {
    roleNoticeOpen,
    roleNoticeDontShowAgain,
    setRoleNoticeDontShowAgain,
    handleRoleNoticeOk,
  } = useRoleNotice({
    myRole,
    providerSynced,
  })

  // ============================================================================
  // Effect - Yjs Document & Provider Lifecycle
  // ============================================================================
  useEffect(() => {
    const ydoc = new Y.Doc()
    const provider = new WebsocketProvider(
      YJS_WEBSOCKET_URL,
      roomId,
      ydoc
    )

    // Set user presence immediately so the very first awareness broadcast
    // already carries the user's name. Moving this before the awareness
    // listener subscription prevents the brief window where this client
    // appears as "User {clientId}" in all connected participants' sidebars.
    const userName = sessionStorage.getItem(STORAGE_KEYS.USER_NAME) || 'Anonymous'
    provider.awareness.setLocalStateField('user', {
      name: userName,
      color: generateRandomColor(),
    })

    const handleMouseMove = (event: MouseEvent) => {
      // Normalize cursor position to 0-1 range for cross-screen compatibility
      const normalizedX = window.innerWidth > 0 ? event.clientX / window.innerWidth : 0
      const normalizedY = window.innerHeight > 0 ? event.clientY / window.innerHeight : 0
      provider.awareness.setLocalStateField('cursor', {
        x: Math.max(0, Math.min(1, normalizedX)),
        y: Math.max(0, Math.min(1, normalizedY)),
      })
    }
    window.addEventListener('mousemove', handleMouseMove)

    const updateUsers = () => {
      // Filter out entries with no user.name – these are transient states that
      // arrive before the remote client has broadcast their identity, which
      // would otherwise render as "User {clientId}" in the sidebar.
      const states = (Array.from(
        provider.awareness.getStates().entries()
      ) as AwarenessEntry[]).filter(([, state]) => state.user?.name != null)

      // Only update if the client IDs have changed to prevent infinite loops
      setUserStates((prev) => {
        const prevIds = prev.map(([id]) => id).sort((a, b) => a - b)
        const newIds = states.map(([id]) => id).sort((a, b) => a - b)

        // Check if the set of client IDs is the same
        if (
          prevIds.length === newIds.length &&
          prevIds.every((id, i) => id === newIds[i])
        ) {
          // Client IDs haven't changed, but we still need to update for cursor/state changes
          // Use JSON comparison for the full state to detect actual changes
          const prevJson = JSON.stringify(prev)
          const newJson = JSON.stringify(states)
          if (prevJson === newJson) {
            return prev // No change, keep previous reference
          }
        }
        return states
      })
    }

    updateUsersRef.current = updateUsers

    provider.awareness.on('change', updateUsers)
    updateUsers() // Initial update

    // roles shared map
    const rolesMap = ydoc.getMap<AwarenessRole>(YJS_KEYS.ROLES)
    rolesMapRef.current = rolesMap

    // analytics shared map: each client writes their own timing totals
    const analyticsMap = ydoc.getMap<unknown>(YJS_KEYS.ANALYTICS)
    analyticsMapRef.current = analyticsMap

    // Determine and persist room owner (first starter becomes owner)
    const roomMap = ydoc.getMap<unknown>(YJS_KEYS.ROOM)
    roomMapRef.current = roomMap
    setRoomReady(true)
    const currentId = provider.awareness.clientID
    // Wait for initial sync before electing or reading owner
    const syncedHandler = async (isSynced: boolean) => {
      if (!isSynced) return
      setProviderSynced(true)

      if (ownerInitRef.current) return
      ownerInitRef.current = true

      // Determine owner - first client becomes owner if none exists
      let owner = roomMap.get(ROOM_MAP_KEYS.OWNER)
      const candidates = Array.from(
        provider.awareness.getStates().keys()
      ) as number[]
      const localOwnerToken = sessionStorage.getItem(getOwnerTokenStorageKey())

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
        const arbiter =
          candidates.length > 0 ? Math.min(...candidates) : currentId
        if (currentId === arbiter) {
          // This client is the first, claims ownership automatically.
          const newOwner = await claimOwnership()
          owner = typeof newOwner === 'number' ? newOwner : roomMap.get(ROOM_MAP_KEYS.OWNER)
        }
      } else if (owner !== currentId) {
        // If this client has the owner token, reclaim after refresh.
        if (localOwnerToken) {
          const newOwner = await claimOwnership()
          owner = typeof newOwner === 'number' ? newOwner : roomMap.get(ROOM_MAP_KEYS.OWNER)
        }
      }

      const isCurrentUserOwner = owner === currentId
      setOwnerId(typeof owner === 'number' ? owner : null)
      setIsOwner(isCurrentUserOwner)
      isOwnerRef.current = isCurrentUserOwner

      // Assign initial roles if not already set
      // Owner gets driver, others get navigator - but owner can change later
      const existingRole = rolesMap.get(currentId.toString())
      const myInitialRole: AwarenessRole = isCurrentUserOwner ? 'driver' : 'navigator'
      if (existingRole == null) {
        rolesMap.set(currentId.toString(), myInitialRole)
        setMyRole(myInitialRole)
        myRoleRef.current = myInitialRole
      } else {
        setMyRole(existingRole)
        myRoleRef.current = existingRole
        // Apply readOnly directly in case the editor is already mounted
        editorRef.current?.updateOptions({ readOnly: existingRole === 'navigator' })
      }

      // Initialize or read shared language
      const sharedLanguage = roomMap.get(ROOM_MAP_KEYS.LANGUAGE)
      if (!isValidLanguage(sharedLanguage)) {
        if (isCurrentUserOwner) {
          roomMap.set(ROOM_MAP_KEYS.LANGUAGE, languageRef.current)
        }
      } else if (sharedLanguage !== languageRef.current) {
        languageRef.current = sharedLanguage
        setLanguage(sharedLanguage)
      }

      // Seed starter code for new rooms (owner only, ytext must be empty).
      if (isCurrentUserOwner) {
        const ytext = ydoc.getText(YJS_KEYS.MONACO_TEXT)
        if (ytext.length === 0) {
          const lang = isValidLanguage(sharedLanguage) ? sharedLanguage : languageRef.current
          // Normalise to LF so Windows clients don't desync on first load
          const starter = (LANGUAGE_STARTER_CODE[lang] ?? '').replace(/\r\n/g, '\n')
          if (starter) ytext.insert(0, starter)
        }
      }

      // Start the local timer with the correct initial role
      if (sessionStartRef.current == null) {
        sessionStartRef.current = Date.now()
        roleSinceRef.current = {
          role: myInitialRole,
          startedAt: sessionStartRef.current,
        }
      }
    }
    // y-websocket emits 'synced' when initial doc sync completes
    const providerEvents = provider as unknown as ProviderWithSyncedEvents
    providerEvents.on('synced', syncedHandler)
    // keep owner state in sync if room owner changes
    const roomObserver = () => {
      const owner = roomMap.get(ROOM_MAP_KEYS.OWNER)
      setOwnerId(typeof owner === 'number' ? owner : null)
      setIsOwner(owner === currentId)

      const sharedLanguage = roomMap.get(ROOM_MAP_KEYS.LANGUAGE)
      if (
        isValidLanguage(sharedLanguage) &&
        sharedLanguage !== languageRef.current
      ) {
        languageRef.current = sharedLanguage
        setLanguage(sharedLanguage)
      }
    }
    roomMap.observe(roomObserver)

    // panels shared map for syncing layout across participants
    const panelsMap = ydoc.getMap<unknown>(YJS_KEYS.PANELS)
    panelsMapRef.current = panelsMap

    const ensurePanelDefaults = () => {
      // Initialize defaults if not present
      const hasH = isNumberArray(panelsMap.get(PANELS_MAP_KEYS.HORIZONTAL))
      const hasV = isNumberArray(panelsMap.get(PANELS_MAP_KEYS.VERTICAL))
      const defaultH = [...DEFAULT_HORIZONTAL_LAYOUT]
      const defaultV = [...DEFAULT_VERTICAL_LAYOUT]
      if (!hasH) panelsMap.set(PANELS_MAP_KEYS.HORIZONTAL, defaultH)
      if (!hasV) panelsMap.set(PANELS_MAP_KEYS.VERTICAL, defaultV)
      // Also seed local state so UI renders with values
      const h = panelsMap.get(PANELS_MAP_KEYS.HORIZONTAL)
      const v = panelsMap.get(PANELS_MAP_KEYS.VERTICAL)
      setHLayout(isNumberArray(h) ? h : defaultH)
      setVLayout(isNumberArray(v) ? v : defaultV)
    }

    const panelsObserver = () => {
      const h = panelsMap.get(PANELS_MAP_KEYS.HORIZONTAL)
      const v = panelsMap.get(PANELS_MAP_KEYS.VERTICAL)
      if (isNumberArray(h)) setHLayout(h.slice())
      if (isNumberArray(v)) setVLayout(v.slice())
    }
    panelsMap.observe(panelsObserver)

    // After initial sync, seed defaults if needed
    const panelsSyncedHandler = (isSynced: boolean) => {
      if (!isSynced) return
      ensurePanelDefaults()
    }
    providerEvents.on('synced', panelsSyncedHandler)

    // keep my role in sync
    const rolesObserver = () => {
      const selfId = provider.awareness.clientID
      const fromMap = rolesMap.get(selfId.toString())
      // Only update if we have an explicit role from the map
      // Initial role is set in syncedHandler
      if (fromMap != null && fromMap !== myRoleRef.current) {
        myRoleRef.current = fromMap
        setMyRole(fromMap)
        // Apply immediately — don't rely on the React render cycle
        editorRef.current?.updateOptions({ readOnly: fromMap === 'navigator' })
        // Notify the user their role has changed
        addToast({
          title: fromMap === 'driver' ? 'You are now the Driver' : 'You are now the Navigator',
          description: fromMap === 'driver'
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

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      if (editorRef.current) {
        // This is tricky because the editor instance might be gone.
        // A more robust solution would involve a cleanup function from the editor component itself.
      }
      provider.awareness.off('change', updateUsersRef.current || updateUsers)
      roomMapRef.current?.unobserve(roomObserver)
      panelsMapRef.current?.unobserve(panelsObserver)
      rolesMapRef.current?.unobserve(rolesObserver)
      try {
        providerEvents.off?.('synced', syncedHandler)
        providerEvents.off?.('synced', panelsSyncedHandler)
      } catch { }
      provider.destroy()
      ydoc.destroy()
      ydocRef.current = null
      providerRef.current = null
      awarenessRef.current = null

      // Reset local analytics.
      sessionStartRef.current = null
      roleSinceRef.current = null
      roleTotalsRef.current = { driver: 0, navigator: 0, none: 0 }
      analyticsMapRef.current = null
      updateUsersRef.current = undefined
      setRoomReady(false)
      setProviderSynced(false)
      ownerInitRef.current = false
    }
  }, [roomId, getOwnerStorageKey])

  // ============================================================================
  // Effects - Room State & Ownership
  // ============================================================================

  /** Handle room destruction - kick non-owners when room is ended */
  useEffect(() => {
    if (!roomReady) return
    const roomMap = roomMapRef.current
    if (!roomMap) return

    const onRoomChange = () => {
      const destroyed = roomMap.get(ROOM_MAP_KEYS.DESTROYED)
      if (destroyed !== true) return

      // Host stays to see analytics; everyone else leaves.
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
    return () => {
      roomMap.unobserve(onRoomChange)
    }
  }, [isOwner, roomReady])

  /** Keep isOwnerRef in sync for callbacks */
  useEffect(() => {
    isOwnerRef.current = isOwner
  }, [isOwner])

  /** Persist owner status per room across refresh */
  useEffect(() => {
    sessionStorage.setItem(getOwnerStorageKey(), isOwner ? '1' : '0')
  }, [isOwner, getOwnerStorageKey])

  /** Inject per-user cursor colors into Monaco based on awareness colors */
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

  /** Keep myRoleRef in sync for callbacks */
  useEffect(() => {
    myRoleRef.current = myRole
  }, [myRole])

  /** Keep languageRef in sync for callbacks */
  useEffect(() => {
    languageRef.current = language
  }, [language])

  // ============================================================================
  // Callbacks - User Actions
  // ============================================================================

  /** Open analytics modal with current session data */
  const handleOpenAnalytics = useCallback(() => {
    const now = Date.now()
    publishMyRoleTotals(now)
    const summary = computeSessionSummaryNow(now)
    setSessionSummary(summary)
    setTeamRoleContribution(computeTeamContributionNow())
    setAnalyticsOpen(true)
  }, [computeSessionSummaryNow, computeTeamContributionNow, publishMyRoleTotals])


  // ============================================================================
  // Effects - Role Enforcement & Follow Mode
  // ============================================================================

  /** Robust follow scroll via awareness client IDs */
  useMonacoFollowScroll({
    editorRef,
    awarenessRef,
    ydocRef,
    editorReady: editorMounted,
    followTargetClientId: following ? Number(following) : null,
    onTargetGone: handleTargetGone,
  })

  const getDriverIdStr = useCallback(() => {
    const rolesMap = rolesMapRef.current
    if (!rolesMap) return null
    const driverEntry = userStates.find(
      ([cid]) => rolesMap.get(cid.toString()) === 'driver'
    )
    return driverEntry ? driverEntry[0].toString() : null
  }, [userStates])

  const handleToggleFollow = useCallback(() => {
    if (!following) return
    setFollowing(null)
    setFollowEnabled(false)
  }, [following])

  const monacoOptions = {
    ...MONACO_EDITOR_OPTIONS,
    readOnly: myRole === 'navigator',
  }

  /**
   * Enforce roles: driver can edit, navigator is read-only.
   * Runs when myRole changes OR when the editor first mounts (editorMounted),
   * ensuring readOnly is always applied with the correct role regardless of
   * which happened first.
   */
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    editor.updateOptions({ readOnly: myRole === 'navigator' })
  }, [myRole, editorMounted])

  /** Stop following when promoted to driver */
  useEffect(() => {
    if (myRole !== 'navigator' && following) {
      setFollowing(null)
      setFollowEnabled(false)
    }
  }, [myRole, following])

  /**
   * Auto-assign roles: owner is driver, everyone else is navigator.
   * Only the current owner can write roles. Triggers on userStates change
   * to assign roles to new joiners.
   */
  useEffect(() => {
    if (!providerSynced) return

    const provider = providerRef.current
    const roomMap = roomMapRef.current
    const rolesMap = rolesMapRef.current
    if (!provider || !roomMap || !rolesMap) return

    if (roomMap.get(ROOM_MAP_KEYS.DESTROYED) === true) return

    const currentOwner = ownerId
    if (currentOwner == null) return

    const selfId = provider.awareness.clientID
    if (selfId !== currentOwner) return

    const presentIds = Array.from(
      provider.awareness.getStates().keys()
    ) as number[]

    // Demote previous owner if ownership changed and they are still present.
    const prevOwner = lastOwnerIdRef.current
    if (
      prevOwner != null &&
      prevOwner !== currentOwner &&
      presentIds.includes(prevOwner)
    ) {
      rolesMap.set(prevOwner.toString(), 'navigator')
    }

    // Don't force owner to be driver - let them choose their own role
    // (only assign driver role to new users without one)

    // Assign navigator role to any new users who don't have a role yet
    for (const cid of presentIds) {
      if (cid === currentOwner) continue
      const existingRole = rolesMap.get(cid.toString())
      if (existingRole == null) {
        rolesMap.set(cid.toString(), 'navigator')
      }
    }

    lastOwnerIdRef.current = currentOwner
  }, [ownerId, providerSynced, userStates])

  /**
   * Handle room destruction when no users are present.
   * Note: Ownership is NOT transferred when owner leaves (to allow owner to refresh/rejoin)
   */
  useEffect(() => {
    const provider = providerRef.current
    const roomMap = roomMapRef.current
    if (!provider || !roomMap) return
    if (!providerSynced) return

    const destroyed = roomMap.get(ROOM_MAP_KEYS.DESTROYED)
    if (destroyed === true) return

    const states = Array.from(provider.awareness.getStates().keys())
    const presentIds = new Set<number>(states as number[])

    if (presentIds.size === 0) {
      roomMap.set(ROOM_MAP_KEYS.DESTROYED, true)
    }
  }, [providerSynced])

  /**
   * Cleanup on tab close - only destroy room if owner is the last user.
   * Note: Ownership is NOT transferred when owner leaves (to allow owner to refresh/rejoin)
   */
  useEffect(() => {
    const pagehideOptions: AddEventListenerOptions = { capture: true }
    const handleOwnerExit = () => {
      const provider = providerRef.current
      const rolesMap = rolesMapRef.current
      const roomMap = roomMapRef.current
      const panelsMap = panelsMapRef.current
      if (!provider || !roomMap) return

      if (!isOwner) return

      const selfId = provider.awareness.clientID
      const states = Array.from(
        provider.awareness.getStates().keys()
      ) as number[]
      const presentIds = states.filter((cid) => cid !== selfId)
      const presentCountExcludingSelf = presentIds.length

      // Only destroy if owner is the last user
      // Do NOT transfer ownership - owner can refresh and rejoin
      if (presentCountExcludingSelf === 0) {
        try {
          roomMap.set(ROOM_MAP_KEYS.DESTROYED, true)
          if (rolesMap) {
            for (const k of Array.from(rolesMap.keys())) {
              rolesMap.delete(k)
            }
          }
          if (panelsMap) {
            for (const k of Array.from(panelsMap.keys())) {
              panelsMap.delete(k)
            }
          }
        } catch { }
      }
    }

    // Use both pagehide and beforeunload for broader browser coverage
    window.addEventListener('pagehide', handleOwnerExit, pagehideOptions)
    window.addEventListener('beforeunload', handleOwnerExit)
    return () => {
      window.removeEventListener('pagehide', handleOwnerExit, pagehideOptions)
      window.removeEventListener('beforeunload', handleOwnerExit)
    }
  }, [isOwner])

  // ============================================================================
  // Handlers - Editor & Session Management
  // ============================================================================

  /** Shared logic for both desktop and mobile editor mounts. */
  const mountEditor = async (
    editor: import('monaco-editor').editor.IStandaloneCodeEditor,
    isMobile: boolean
  ) => {
    // Store in the per-layout ref so we can always find each instance.
    if (isMobile) {
      mobileEditorRef.current = editor
    } else {
      desktopEditorRef.current = editor
    }

    // Only make this editor the "active" one if its layout is currently visible.
    const isDesktop = window.matchMedia('(min-width: 768px)').matches
    const isVisible = (isDesktop && !isMobile) || (!isDesktop && isMobile)

    if (!isVisible) {
      // This layout is hidden — don't bind Yjs to it. If it later becomes
      // visible the resize observer in useEffect will call mountEditor again.
      editor.updateOptions({ readOnly: myRoleRef.current === 'navigator' })
      return
    }

    editorRef.current = editor

    const ydoc = ydocRef.current!
    const provider = providerRef.current!
    const ytext = ydoc.getText(YJS_KEYS.MONACO_TEXT)

    // Normalise any CRLF already in the shared Y.Text before binding.
    // This handles the case where a Windows client seeded the document first.
    const raw = ytext.toString()
    if (raw.includes('\r\n')) {
      ydoc.transact(() => {
        ytext.delete(0, ytext.length)
        ytext.insert(0, raw.replace(/\r\n/g, '\n'))
      })
    }

    // Dynamically import y-monaco and create the binding.
    // Destroy any previous binding first so only one is ever active at a time.
    const { MonacoBinding } = await import('y-monaco')

    bindingRef.current?.destroy()
    bindingRef.current = null

    const model = editor.getModel()
    if (model) {
      // Force Monaco to use LF so it never writes \r\n into the Yjs doc.
      model.setEOL(0 /* EndOfLineSequence.LF */)

      bindingRef.current = new MonacoBinding(ytext, model, new Set([editor]), provider.awareness)

      // After binding, patch any CRLF Monaco may have re-introduced into the model.
      const content = model.getValue()
      if (content.includes('\r\n')) {
        model.setValue(content.replace(/\r\n/g, '\n'))
      }
    }

    // Apply read-only immediately based on current role.
    // The role-enforcement effect runs before editorRef is set (async mount),
    // so we must enforce it here as well.
    editor.updateOptions({ readOnly: myRoleRef.current === 'navigator' })
    // Signal that the editor is ready so the readOnly effect re-runs with
    // the current myRole state (handles cases where the role was set before mount).
    setEditorMounted(true)
  }

  /** onMount handler for the desktop-layout editor. */
  const handleMount = (
    editor: import('monaco-editor').editor.IStandaloneCodeEditor
  ) => mountEditor(editor, false)

  /** onMount handler for the mobile-layout editor. */
  const handleMountMobile = (
    editor: import('monaco-editor').editor.IStandaloneCodeEditor
  ) => mountEditor(editor, true)

  /** Copy room invite link to clipboard */
  const handleInvite = () => {
    const url = window.location.href
    navigator.clipboard.writeText(url).then(
      () => {
        addToast({
          title: 'Invite link copied',
          color: 'success',
          timeout: 3000,
        })
      },
      (err) => {
        console.error('Could not copy text: ', err)
        addToast({
          title: 'Copy failed',
          description: 'Could not copy invite link to clipboard.',
          color: 'danger',
          timeout: 4000,
        })
      }
    )
  }

  /** End the current session (owner only) - shows summary and destroys room */
  const handleEndSession = useCallback(async () => {
    if (!isOwner) return

    if (endingSession) return
    setEndingSession(true)

    let endedAt: number | null = null

    try {
      const res = await fetch(`/api/rooms?id=${encodeURIComponent(roomId)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`)
      }

      endedAt = Date.now()
      roomMapRef.current?.set(ROOM_MAP_KEYS.DESTROYED, true)
      roomMapRef.current?.set(ROOM_MAP_KEYS.DESTROYED_AT, endedAt)

      addToast({
        title: 'Session ended',
        description: 'Room has been closed.',
        color: 'success',
        variant: 'solid',
        timeout: 2500,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      addToast({
        title: 'Could not end session',
        description: message,
        color: 'danger',
        variant: 'solid',
        timeout: 4000,
      })
      setEndingSession(false)
      return
    }

    // Finalize local role totals.
    if (endedAt === null) endedAt = Date.now()
    publishMyRoleTotals(endedAt)
    const startedAt = sessionStartRef.current ?? endedAt
    const current = roleSinceRef.current
    if (current) {
      const delta = Math.max(0, endedAt - current.startedAt)
      if (current.role === 'driver') roleTotalsRef.current.driver += delta
      else if (current.role === 'navigator')
        roleTotalsRef.current.navigator += delta
      else roleTotalsRef.current.none += delta
      roleSinceRef.current = { role: current.role, startedAt: endedAt }
    }

    // Build per-user contribution list from shared analytics.
    const analyticsMap = analyticsMapRef.current
    const byId = new Map<
      string,
      { driverMs: number; navigatorMs: number; noneMs: number }
    >()
    if (analyticsMap) {
      for (const [k, v] of analyticsMap.entries()) {
        if (typeof k !== 'string') continue
        const parsed = parseAnalyticsEntry(v)
        byId.set(k, {
          driverMs: parsed.driverMs,
          navigatorMs: parsed.navigatorMs,
          noneMs: parsed.noneMs,
        })
      }
    }

    const users = userStates
      .map(([clientId, state]) => {
        const totals = byId.get(clientId.toString()) ?? {
          driverMs: 0,
          navigatorMs: 0,
          noneMs: 0,
        }
        return {
          clientId,
          name: state.user?.name ?? `User ${clientId}`,
          ...totals,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))

    // Persist summary across navigation so HomeClient can show it.
    sessionStorage.setItem(
      'codelink:session-summary',
      JSON.stringify({
        summary: {
          sessionMs: Math.max(0, endedAt - startedAt),
          driverMs: roleTotalsRef.current.driver,
          navigatorMs: roleTotalsRef.current.navigator,
          noneMs: roleTotalsRef.current.none,
        },
        users,
      })
    )
    setEndingSession(false)
    window.location.href = '/'
  }, [endingSession, isOwner, publishMyRoleTotals, roomId, userStates])

  /** Run code in the terminal */
  const handleRun = async () => {
    if (!editorRef.current) return
    const code = editorRef.current.getValue()
    setRunning(true)
    try {
      await terminalRef.current?.run({ language, code })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      terminalRef.current?.write(`\r\n[run error: ${message}]\r\n`)
    } finally {
      setRunning(false)
    }
  }

  // ============================================================================
  // Effect - Event Listeners for File Operations
  // ============================================================================
  useEffect(() => {
    const handleExportEvent = () => handleExport()
    window.addEventListener('toolbar:export', handleExportEvent)

    const fileInput = document.getElementById('toolbar-file-importer')
    const handleImportChange = (e: Event) =>
      handleFileImport(e as unknown as React.ChangeEvent<HTMLInputElement>)

    fileInput?.addEventListener('change', handleImportChange)

    return () => {
      window.removeEventListener('toolbar:export', handleExportEvent)
      fileInput?.removeEventListener('change', handleImportChange)
    }
  }, [handleExport, handleFileImport])

  const renderEditorTabBar = () => (
    <div className="flex items-center gap-2 h-10 min-h-10 bg-surface-primary">
      <div className="flex flex-1 items-center gap-2 overflow-hidden">
        {editorTabs.map((tab) => (
          <Button
            key={tab.id}
            variant="flat"
            size="sm"
            className={`h-10 px-3 rounded-none transition-colors ${tab.isActive
              ? 'bg-surface-secondary text-text-primary'
              : 'bg-transparent border-transparent text-text-secondary hover:bg-surface-elevated'
              }`}
            aria-current={tab.isActive ? 'page' : undefined}
            aria-label={`${tab.title} tab`}
          >
            <div className="flex items-center gap-3 h-full">
              {getLanguageIcon(language)}
              <span className="text-sm tracking-wide">{tab.title}</span>
              {tab.isActive && (
                <span className="text-default-500">
                  <X size={12} />
                </span>
              )}
            </div>
          </Button>
        ))}
      </div>
      <Dropdown>
        <DropdownTrigger>
          <Button
            isIconOnly
            variant="flat"
            size="sm"
            className="mx-1 rounded-2xl border border-transparent bg-transparent text-text-secondary transition-colors hover:bg-surface-elevated"
            aria-label="Drawing overlay options"
          >
            <MoreHorizontal size={16} />
          </Button>
        </DropdownTrigger>
        <DropdownMenu aria-label="Drawing overlay options" selectionMode="none">
          <DropdownItem
            key="toggle-overlay"
            onPress={handleToggleOverlay}
            startContent={overlayActive ? <Pen size={16} /> : <PenOff size={16} />}
            endContent={
              <span className="text-xs uppercase text-default-500">
                {overlayActive ? 'On' : 'Off'}
              </span>
            }
          >
            Drawing overlay
          </DropdownItem>
        </DropdownMenu>
      </Dropdown>
    </div>
  )

  // ============================================================================
  // Render
  // ============================================================================
  return (
    <div className="flex flex-col h-full">
      <EditorModals
        // Role notice
        roleNoticeOpen={roleNoticeOpen}
        myRole={myRole}
        roleNoticeDontShowAgain={roleNoticeDontShowAgain}
        onRoleNoticeDontShowAgainChange={setRoleNoticeDontShowAgain}
        onRoleNoticeOk={handleRoleNoticeOk}
        // GitHub import
        githubImportOpen={githubImportOpen}
        onGithubImportClose={() => setGithubImportOpen(false)}
        onGitHubImport={handleGitHubImport}
        // Session ended
        sessionEndedOpen={sessionEndedOpen}
        onGoHome={() => {
          window.location.href = '/'
        }}
        // Roles
        rolesOpen={rolesOpen}
        onRolesClose={() => setRolesOpen(false)}
        isOwner={isOwner}
        userStates={userStates}
        getRole={(clientId: number) =>
          rolesMapRef.current?.get(clientId.toString()) ?? 'navigator'
        }
        onSetRole={(clientId: number, role: AwarenessRole) => {
          if (!isOwner) return
          const rolesMap = rolesMapRef.current
          const ydoc = ydocRef.current
          if (!rolesMap || !ydoc) return
          if (role === 'driver') {
            // Atomically demote the existing driver and promote the new one
            Y.transact(ydoc, () => {
              for (const [key, val] of rolesMap.entries()) {
                if (val === 'driver' && key !== clientId.toString()) {
                  rolesMap.set(key, 'navigator')
                }
              }
              rolesMap.set(clientId.toString(), 'driver')
            })
          } else {
            rolesMap.set(clientId.toString(), role)
          }
        }}
        currentOwnerId={ownerId}
        onCopyLink={handleInvite}
        // Settings
        settingsOpen={settingsOpen}
        onSettingsClose={() => setSettingsOpen(false)}
        currentUserId={providerRef.current?.awareness.clientID}
        // End confirm
        endConfirmOpen={endConfirmOpen}
        endingSession={endingSession}
        onEndConfirmCancel={() => setEndConfirmOpen(false)}
        onEndConfirmConfirm={async () => {
          await handleEndSession()
          setEndConfirmOpen(false)
        }}
        // Summary
        summaryOpen={summaryOpen}
        sessionSummary={sessionSummary}
        teamRoleContribution={teamRoleContribution}
        onSummaryClose={() => {
          setSummaryOpen(false)
          window.location.href = '/'
        }}
        // Analytics
        analyticsOpen={analyticsOpen}
        onAnalyticsClose={() => setAnalyticsOpen(false)}
      />
      <LiveCursors
        userStates={userStates}
        myClientId={providerRef.current?.awareness.clientID}
      />
      <Toolbar
        onRun={handleRun}
        running={running}
        onInvite={handleInvite}
        onImport={handleFileImport}
        onExport={handleExport}
        onGitHubImport={() => setGithubImportOpen(true)}
        users={userStates.filter(
          ([clientId]) => clientId !== providerRef.current?.awareness.clientID
        )}
        onFollow={setFollowing}
        following={following}
        followingName={
          following
            ? (userStates.find(([cid]) => cid.toString() === following)?.[1]
              .user?.name ?? null)
            : null
        }
        onManageRoles={() => setRolesOpen(true)}
        onOpenAnalytics={handleOpenAnalytics}
        onOpenSettings={() => setSettingsOpen(true)}
        onEndSession={() => setEndConfirmOpen(true)}
        onLeaveSession={() => {
          window.location.href = '/'
        }}
        isOwner={isOwner}
        myRole={myRole}
        followEnabled={followEnabled}
        onToggleFollow={handleToggleFollow}
      />
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop: expandable icon sidebar */}
        <div
          className={`hidden md:flex flex-col shrink-0 bg-surface-primary border-r border-border-strong transition-all duration-200 ${sidebarExpanded ? 'w-52' : 'w-12'
            }`}
        >
          {/* Top: Users toggle button */}
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Users button with badge */}
            <div className="relative px-2 pt-2">
              <Tooltip content={sidebarExpanded ? undefined : `${userStates.length} participant${userStates.length !== 1 ? 's' : ''}`} placement="right" isDisabled={sidebarExpanded}>
                <Button
                  isIconOnly={!sidebarExpanded}
                  size="sm"
                  className={`bg-transparent hover:bg-surface-elevated text-text-secondary w-full ${sidebarExpanded ? 'justify-start gap-2 px-2' : ''
                    }`}
                  onPress={() => setSidebarExpanded((v) => !v)}
                  aria-label="Toggle people panel"
                >
                  <div className="relative shrink-0">
                    <Users size={16} />
                    {!sidebarExpanded && userStates.length > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-3.5 h-3.5 bg-blue-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                        {userStates.length}
                      </span>
                    )}
                  </div>
                  {sidebarExpanded && <span className="text-sm font-medium text-text-primary">People</span>}
                </Button>
              </Tooltip>
            </div>

            {/* Expanded: scrollable user list */}
            {sidebarExpanded && (
              <div className="flex-1 px-2 py-1 space-y-0.5 overflow-x-hidden">
                {/* Sort: drivers first */}
                {[...userStates]
                  .sort(([cidA], [cidB]) => {
                    const aRole = rolesMapRef.current?.get(cidA.toString()) ?? 'navigator'
                    const bRole = rolesMapRef.current?.get(cidB.toString()) ?? 'navigator'
                    if (aRole === bRole) return 0
                    return aRole === 'driver' ? -1 : 1
                  })
                  .map(([clientId, state]) => {
                    const name = state.user?.name ?? `User ${clientId}`
                    const isMe = clientId === providerRef.current?.awareness.clientID
                    const isUserOwner = clientId === ownerId
                    const role = rolesMapRef.current?.get(clientId.toString()) ?? 'navigator'
                    const isFollowing = following === clientId.toString()
                    const canFollow = myRole === 'navigator' && !isMe && role === 'driver'

                    return (
                      <div
                        key={clientId}
                        className="flex items-center gap-2 px-1 py-1.5 rounded-lg hover:bg-surface-elevated group"
                      >
                        {/* Color dot + name */}
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: state.user?.color ?? '#888' }}
                        />
                        <span className="flex-1 text-xs truncate text-text-primary flex items-center gap-1.5">
                          <span className="truncate">{name}</span>
                          {isUserOwner && (
                            <Tooltip content="Owner" placement="right" size="sm">
                              <Crown size={10} className="text-yellow-400 shrink-0" fill="currentColor" />
                            </Tooltip>
                          )}
                          {isMe && <span className="shrink-0 text-[9px] font-semibold px-1 py-0.5 rounded bg-default-200 text-default-500 leading-none">You</span>}
                        </span>
                        {/* Follow/unfollow button */}
                        {canFollow && (
                          <Button
                            size="sm"
                            variant="flat"
                            className={`h-auto min-w-0 px-1.5 py-0.5 text-[10px] font-medium rounded shrink-0 ${isFollowing
                              ? 'bg-blue-500/15 text-blue-400 hover:bg-red-500/10 hover:text-red-400'
                              : 'bg-surface-elevated text-text-secondary hover:bg-blue-500/15 hover:text-blue-400'
                              }`}
                            onPress={() => {
                              if (isFollowing) {
                                setFollowing(null)
                                setFollowEnabled(false)
                              } else {
                                setFollowing(clientId.toString())
                                setFollowEnabled(true)
                              }
                            }}
                          >
                            {isFollowing ? 'Unfollow' : 'Follow'}
                          </Button>
                        )}
                      </div>
                    )
                  })}
              </div>
            )}
          </div>

          {/* Bottom: Analytics + Settings + End/Leave */}
          <div className="flex flex-col gap-1 p-2 pb-4">
            <Tooltip content={sidebarExpanded ? undefined : 'Analytics'} placement="right" isDisabled={sidebarExpanded}>
              <Button
                isIconOnly={!sidebarExpanded}
                size="sm"
                className={`bg-transparent hover:bg-surface-elevated text-text-secondary w-full ${sidebarExpanded ? 'justify-start gap-2 px-2' : ''
                  }`}
                onPress={handleOpenAnalytics}
                aria-label="Analytics"
              >
                <BarChart2 size={16} className="shrink-0" />
                {sidebarExpanded && <span className="text-sm font-medium text-text-primary">Analytics</span>}
              </Button>
            </Tooltip>
            <Tooltip content={sidebarExpanded ? undefined : 'Settings'} placement="right" isDisabled={sidebarExpanded}>
              <Button
                isIconOnly={!sidebarExpanded}
                size="sm"
                className={`bg-transparent hover:bg-surface-elevated text-text-secondary w-full ${sidebarExpanded ? 'justify-start gap-2 px-2' : ''
                  }`}
                onPress={() => setSettingsOpen(true)}
                aria-label="Settings"
              >
                <Settings size={16} className="shrink-0" />
                {sidebarExpanded && <span className="text-sm font-medium text-text-primary">Settings</span>}
              </Button>
            </Tooltip>
            <Tooltip content={sidebarExpanded ? undefined : (isOwner ? 'End Session' : 'Leave Session')} placement="right" isDisabled={sidebarExpanded}>
              <Button
                isIconOnly={!sidebarExpanded}
                size="sm"
                className={`bg-transparent w-full text-text-primary ${sidebarExpanded ? 'justify-start gap-2 px-2 hover:bg-red-500/10 hover:text-red-400' : 'hover:bg-red-500'
                  }`}
                onPress={() => isOwner ? setEndConfirmOpen(true) : (window.location.href = '/')}
                aria-label={isOwner ? 'End Session' : 'Leave Session'}
              >
                <LogOut size={16} className="shrink-0 text-text-secondary" />
                {sidebarExpanded && (
                  <span className={`text-sm font-medium text-text-primary}`}>
                    {isOwner ? 'End Session' : 'Leave'}
                  </span>
                )}
              </Button>
            </Tooltip>
          </div>
        </div>

        {/* Desktop: horizontal layout (editor/terminal | drawing) */}
        <div className="hidden md:flex flex-1">
          <PanelGroup
            ref={hGroupRef}
            direction="horizontal"
            onLayout={handleHLayoutChange}
          >
            <Panel collapsible={true} collapsedSize={0} minSize={10}>
              <PanelGroup
                ref={vGroupRef}
                direction="vertical"
                onLayout={handleVLayoutChange}
              >
                <Panel>
                  <div className="flex flex-col h-full overflow-hidden">
                    {renderEditorTabBar()}
                    <div className="flex-1 relative overflow-hidden">
                      <Editor
                        height="100%"
                        language={language}
                        theme={monacoTheme}
                        options={monacoOptions}
                        onMount={handleMount}
                      />
                      <EditorOverlayDrawing
                        ydoc={ydocRef.current}
                        active={overlayActive}
                        tool={drawingTool}
                        onToolChange={setDrawingTool}
                      />
                      <LanguageSelector
                        language={language}
                        onLanguageChange={handleLanguageChange}
                        disabled={myRole === 'navigator'}
                      />
                    </div>
                  </div>
                </Panel>
                <PanelResizeHandle
                  className="border-b border-border-strong flex justify-center items-center transition-colors duration-[250ms] ease-linear hover:bg-blue-400 data-resize-handle-active:bg-blue-400"
                />
                <Panel
                  collapsible={true}
                  collapsedSize={0}
                  minSize={10}
                  className="bg-surface-primary flex flex-col"
                >
                  <TerminalPanel ref={desktopTerminalRef} roomId={roomId} />
                </Panel>
              </PanelGroup>
            </Panel>
            <PanelResizeHandle
              className="w-0.75 bg-border-strong flex justify-center items-center transition-colors duration-[250ms] ease-linear hover:bg-blue-400 data-resize-handle-active:bg-blue-400"
            />
            <Panel collapsible={true} collapsedSize={0} minSize={10}>
              <DrawingBoard
                ydoc={ydocRef.current}
                tool={drawingTool}
                onToolChange={setDrawingTool}
              />
            </Panel>
          </PanelGroup>
        </div>

        {/* Mobile: vertical layout (editor, terminal, drawing stacked) */}
        <div className="flex flex-col flex-1 md:hidden overflow-auto">
          <div className="flex flex-col h-full overflow-hidden">
            {renderEditorTabBar()}
            <div className="flex-1 relative">
              <Editor
                height="100%"
                language={language}
                theme={monacoTheme}
                options={monacoOptions}
                onMount={handleMountMobile}
              />
              <EditorOverlayDrawing
                ydoc={ydocRef.current}
                active={overlayActive}
                tool={drawingTool}
                onToolChange={setDrawingTool}
              />
              <LanguageSelector
                language={language}
                onLanguageChange={handleLanguageChange}
                disabled={myRole === 'navigator'}
              />
            </div>
          </div>
          <div className="h-48 bg-surface-primary border-t border-border-strong">
            <TerminalPanel ref={mobileTerminalRef} roomId={roomId} />
          </div>
          <div className="h-64 border-t border-border-strong">
            <DrawingBoard
              ydoc={ydocRef.current}
              tool={drawingTool}
              onToolChange={setDrawingTool}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
