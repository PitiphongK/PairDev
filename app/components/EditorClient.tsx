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
  MONACO_EDITOR_OPTIONS,
  ROOM_MAP_KEYS,
  YJS_KEYS,
  YJS_WEBSOCKET_URL,
} from '@/constants/editor'
import {
  useEditorMount,
  useFileOperations,
  usePanelLayout,
  useRoleNotice,
  useSessionAnalytics,
  useSessionPersistence,
  useYjsRoom,
} from '@/hooks/editor'
import { useMonacoFollowScroll } from '@/hooks/useMonacoFollowScroll'
import type { AwarenessRole } from '@/interfaces/awareness'
import type {
  EditorClientProps,
  SessionSummary,
  UserRoleContribution,
} from '@/interfaces/editor'
import { Languages } from '@/interfaces/languages'
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

  const editorTabs = [{ id: 'main', title: 'main', isActive: true }]

  // ── Shared editor ref (passed to both useYjsRoom and useEditorMount) ────────
  const editorRef = useRef<import('monaco-editor').editor.IStandaloneCodeEditor | null>(null)

  // ── Stable callback refs — break circular hook ordering dependency ──────────
  // useYjsRoom must come before useSessionAnalytics (it produces analyticsMapRef),
  // but useYjsRoom needs callbacks from useSessionAnalytics. Using stable refs
  // allows the callbacks to be wired up in the same render before effects run.
  const onInitialRoleRef = useRef<(role: AwarenessRole) => void>(() => {})
  const onSessionResetRef = useRef<() => void>(() => {})

  // ── Modal & UI state ────────────────────────────────────────────────────────
  const [rolesOpen, setRolesOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [endConfirmOpen, setEndConfirmOpen] = useState(false)
  const [endingSession, setEndingSession] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [analyticsOpen, setAnalyticsOpen] = useState(false)
  const [sessionEndedOpen] = useState(false)
  const [githubImportOpen, setGithubImportOpen] = useState(false)
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null)
  const [teamRoleContribution, setTeamRoleContribution] = useState<UserRoleContribution[]>([])

  // ── Drawing & layout UI state ────────────────────────────────────────────────
  const [overlayActive, setOverlayActive] = useState(false)
  const [drawingTool, setDrawingTool] = useState<'pen' | 'eraser'>('pen')
  const [sidebarExpanded, setSidebarExpanded] = useState(false)

  // ── Follow mode state ────────────────────────────────────────────────────────
  const [following, setFollowing] = useState<string | null>(null)
  const [followEnabled, setFollowEnabled] = useState(false)
  const handleTargetGone = useCallback(() => setFollowing(null), [])

  // ── Code execution state ─────────────────────────────────────────────────────
  const [running, setRunning] = useState(false)
  const desktopTerminalRef = useRef<SharedTerminalHandle | null>(null)
  const mobileTerminalRef = useRef<SharedTerminalHandle | null>(null)
  /** Always resolves to whichever terminal layout is currently visible. */
  const terminalRef = useMemo(
    () => ({
      get current(): SharedTerminalHandle | null {
        const isDesktop =
          typeof window !== 'undefined' &&
          window.matchMedia('(min-width: 768px)').matches
        return isDesktop ? desktopTerminalRef.current : mobileTerminalRef.current
      },
    }),
    []
  )

  // ============================================================================
  // Yjs room hook (must come first — produces refs used by subsequent hooks)
  // ============================================================================
  const {
    ydocRef,
    providerRef,
    awarenessRef,
    rolesMapRef,
    roomMapRef,
    panelsMapRef,
    analyticsMapRef,
    userStates,
    providerSynced,
    isOwner,
    ownerId,
    myRole,
    myRoleRef,
    language,
    handleLanguageChange,
  } = useYjsRoom({
    roomId,
    editorRef,
    onInitialRole: useCallback((role: AwarenessRole) => onInitialRoleRef.current(role), []),
    onSessionReset: useCallback(() => onSessionResetRef.current(), []),
  })

  // ============================================================================
  // Panel layout
  // ============================================================================
  const {
    hGroupRef,
    vGroupRef,
    handleHLayoutChange,
    handleVLayoutChange,
    initializePanelDefaults,
    setupPanelObserver,
  } = usePanelLayout({ panelsMapRef, myRole, followEnabled })

  // ============================================================================
  // Session analytics
  // ============================================================================
  const {
    startSession,
    resetAnalytics,
    publishMyRoleTotals,
    computeSessionSummaryNow,
    computeTeamContributionNow,
    finalizeRoleTotals,
  } = useSessionAnalytics({
    myRole,
    providerSynced,
    providerRef,
    analyticsMapRef,
    userStates,
  })

  // Wire up the stable callback refs now that both hooks have been called.
  // This assignment is synchronous and happens before any effects run.
  onInitialRoleRef.current = startSession
  onSessionResetRef.current = resetAnalytics

  // ============================================================================
  // Role notice modal
  // ============================================================================
  const {
    roleNoticeOpen,
    roleNoticeDontShowAgain,
    setRoleNoticeDontShowAgain,
    handleRoleNoticeOk,
  } = useRoleNotice({
    myRole,
    providerSynced,
  })

  const { sessionIdRef } = useSessionPersistence({
    roomId,
    providerSynced,
    ydocRef,
    isOwner,
  })

  // ============================================================================
  // Editor mounting
  // ============================================================================
  const { editorMounted, handleMount, handleMountMobile } = useEditorMount({
    editorRef,
    ydocRef,
    providerRef,
    myRoleRef,
    myRole,
  })

  // ============================================================================
  // File operations
  // ============================================================================
  const { handleExport, handleFileImport, handleGitHubImport } = useFileOperations({
    editorRef,
    ydocRef,
    ytextKey: YJS_KEYS.MONACO_TEXT,
    language,
    roomId,
    onLanguageChange: handleLanguageChange,
  })

  // ============================================================================
  // Follow scroll
  // ============================================================================
  useMonacoFollowScroll({
    editorRef,
    awarenessRef,
    ydocRef,
    editorReady: editorMounted,
    followTargetClientId: following ? Number(following) : null,
    onTargetGone: handleTargetGone,
  })

  // ============================================================================
  // Effect: initialise panel defaults once the provider syncs
  // ============================================================================
  useEffect(() => {
    if (!providerSynced) return
    initializePanelDefaults()
    return setupPanelObserver()
  }, [providerSynced, initializePanelDefaults, setupPanelObserver])

  // ============================================================================
  // Effect: stop following when promoted to driver
  // ============================================================================
  useEffect(() => {
    if (myRole !== 'navigator' && following) {
      setFollowing(null)
      setFollowEnabled(false)
    }
  }, [myRole, following])

  // ============================================================================
  // Effect: file operation event listeners
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

  // ============================================================================
  // Callbacks
  // ============================================================================

  const monacoOptions = { ...MONACO_EDITOR_OPTIONS, readOnly: myRole === 'navigator' }

  const handleToggleFollow = useCallback(() => {
    if (!following) return
    setFollowing(null)
    setFollowEnabled(false)
  }, [following])

  const handleToggleOverlay = useCallback(() => setOverlayActive((prev) => !prev), [])

  /** Copy room invite link to clipboard */
  const handleInvite = useCallback(() => {
    const url = window.location.href
    navigator.clipboard.writeText(url).then(
      () => addToast({ title: 'Invite link copied', color: 'success', timeout: 3000 }),
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
  }, [])

  /** Open analytics modal with current session data */
  const handleOpenAnalytics = useCallback(() => {
    const now = Date.now()
    publishMyRoleTotals(now)
    setSessionSummary(computeSessionSummaryNow(now))
    setTeamRoleContribution(computeTeamContributionNow())
    setAnalyticsOpen(true)
  }, [publishMyRoleTotals, computeSessionSummaryNow, computeTeamContributionNow])

  /** End the current session (owner only) */
  const handleEndSession = useCallback(async () => {
    if (!isOwner || endingSession) return
    setEndingSession(true)

    let endedAt: number | null = null
    try {
      const res = await fetch(`/api/rooms?id=${encodeURIComponent(roomId)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(`Request failed (${res.status})`)

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
    } catch (err) {
      addToast({
        title: 'Could not end session',
        description: err instanceof Error ? err.message : String(err),
        color: 'danger',
        variant: 'solid',
        timeout: 4000,
      })
      setEndingSession(false)
      return
    }

    if (endedAt === null) endedAt = Date.now()
    publishMyRoleTotals(endedAt)
    const summary = finalizeRoleTotals(endedAt)
    const users = computeTeamContributionNow()

    sessionStorage.setItem('codelink:session-summary', JSON.stringify({ summary, users }))
    setEndingSession(false)
    window.location.href = '/'
  }, [
    endingSession,
    isOwner,
    publishMyRoleTotals,
    finalizeRoleTotals,
    computeTeamContributionNow,
    roomId,
  ])

  /** Run code in the terminal */
  const handleRun = useCallback(async () => {
    if (!editorRef.current) return
    const code = editorRef.current.getValue()
    setRunning(true)
    try {
      await terminalRef.current?.run({ language, code })
    } catch (err) {
      terminalRef.current?.write(
        `\r\n[run error: ${err instanceof Error ? err.message : String(err)}]\r\n`
      )
    } finally {
      setRunning(false)
    }
  }, [language, terminalRef])

  // ============================================================================
  // Render helpers
  // ============================================================================

  const renderEditorTabBar = () => (
    <div className="flex items-center gap-2 h-10 min-h-10 bg-surface-primary">
      <div className="flex flex-1 items-center gap-2 overflow-hidden">
        {editorTabs.map((tab) => (
          <Button
            key={tab.id}
            variant="flat"
            size="sm"
            className={`h-10 px-3 rounded-none transition-colors ${
              tab.isActive
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
        onGoHome={() => { window.location.href = '/' }}
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
            // Atomically demote existing driver and promote the new one
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
            ? (userStates.find(([cid]) => cid.toString() === following)?.[1].user?.name ?? null)
            : null
        }
        onManageRoles={() => setRolesOpen(true)}
        onOpenAnalytics={handleOpenAnalytics}
        onOpenSettings={() => setSettingsOpen(true)}
        onEndSession={() => setEndConfirmOpen(true)}
        onLeaveSession={() => { window.location.href = '/' }}
        isOwner={isOwner}
        myRole={myRole}
        followEnabled={followEnabled}
        onToggleFollow={handleToggleFollow}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop: expandable icon sidebar */}
        <div
          className={`hidden md:flex flex-col shrink-0 bg-surface-primary border-r border-border-strong transition-all duration-200 ${
            sidebarExpanded ? 'w-52' : 'w-12'
          }`}
        >
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Users button with badge */}
            <div className="relative px-2 pt-2">
              <Tooltip
                content={
                  sidebarExpanded
                    ? undefined
                    : `${userStates.length} participant${userStates.length !== 1 ? 's' : ''}`
                }
                placement="right"
                isDisabled={sidebarExpanded}
              >
                <Button
                  isIconOnly={!sidebarExpanded}
                  size="sm"
                  className={`bg-transparent hover:bg-surface-elevated text-text-secondary w-full ${
                    sidebarExpanded ? 'justify-start gap-2 px-2' : ''
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
                  {sidebarExpanded && (
                    <span className="text-sm font-medium text-text-primary">People</span>
                  )}
                </Button>
              </Tooltip>
            </div>

            {/* Expanded: scrollable user list */}
            {sidebarExpanded && (
              <div className="flex-1 px-2 py-1 space-y-0.5 overflow-x-hidden">
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
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: state.user?.color ?? '#888' }}
                        />
                        <span className="flex-1 text-xs truncate text-text-primary flex items-center gap-1.5">
                          <span className="truncate">{name}</span>
                          {isUserOwner && (
                            <Tooltip content="Owner" placement="right" size="sm">
                              <Crown
                                size={10}
                                className="text-yellow-400 shrink-0"
                                fill="currentColor"
                              />
                            </Tooltip>
                          )}
                          {isMe && (
                            <span className="shrink-0 text-[9px] font-semibold px-1 py-0.5 rounded bg-default-200 text-default-500 leading-none">
                              You
                            </span>
                          )}
                        </span>
                        {canFollow && (
                          <Button
                            size="sm"
                            variant="flat"
                            className={`h-auto min-w-0 px-1.5 py-0.5 text-[10px] font-medium rounded shrink-0 ${
                              isFollowing
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
            <Tooltip
              content={sidebarExpanded ? undefined : 'Analytics'}
              placement="right"
              isDisabled={sidebarExpanded}
            >
              <Button
                isIconOnly={!sidebarExpanded}
                size="sm"
                className={`bg-transparent hover:bg-surface-elevated text-text-secondary w-full ${
                  sidebarExpanded ? 'justify-start gap-2 px-2' : ''
                }`}
                onPress={handleOpenAnalytics}
                aria-label="Analytics"
              >
                <BarChart2 size={16} className="shrink-0" />
                {sidebarExpanded && (
                  <span className="text-sm font-medium text-text-primary">Analytics</span>
                )}
              </Button>
            </Tooltip>
            <Tooltip
              content={sidebarExpanded ? undefined : 'Settings'}
              placement="right"
              isDisabled={sidebarExpanded}
            >
              <Button
                isIconOnly={!sidebarExpanded}
                size="sm"
                className={`bg-transparent hover:bg-surface-elevated text-text-secondary w-full ${
                  sidebarExpanded ? 'justify-start gap-2 px-2' : ''
                }`}
                onPress={() => setSettingsOpen(true)}
                aria-label="Settings"
              >
                <Settings size={16} className="shrink-0" />
                {sidebarExpanded && (
                  <span className="text-sm font-medium text-text-primary">Settings</span>
                )}
              </Button>
            </Tooltip>
            <Tooltip
              content={
                sidebarExpanded ? undefined : isOwner ? 'End Session' : 'Leave Session'
              }
              placement="right"
              isDisabled={sidebarExpanded}
            >
              <Button
                isIconOnly={!sidebarExpanded}
                size="sm"
                className={`bg-transparent w-full text-text-primary ${
                  sidebarExpanded
                    ? 'justify-start gap-2 px-2 hover:bg-red-500/10 hover:text-red-400'
                    : 'hover:bg-red-500'
                }`}
                onPress={() =>
                  isOwner ? setEndConfirmOpen(true) : (window.location.href = '/')
                }
                aria-label={isOwner ? 'End Session' : 'Leave Session'}
              >
                <LogOut size={16} className="shrink-0 text-text-secondary" />
                {sidebarExpanded && (
                  <span className="text-sm font-medium text-text-primary">
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
                <PanelResizeHandle className="border-b border-border-strong flex justify-center items-center transition-colors duration-[250ms] ease-linear hover:bg-blue-400 data-resize-handle-active:bg-blue-400" />
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
            <PanelResizeHandle className="w-0.75 bg-border-strong flex justify-center items-center transition-colors duration-[250ms] ease-linear hover:bg-blue-400 data-resize-handle-active:bg-blue-400" />
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
