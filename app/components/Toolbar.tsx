import React, { useState } from 'react'

import {
  addToast,
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Tooltip,
} from '@heroui/react'
import {
  Github,
  Share2,
  Menu,
  Navigation,
  BarChart2,
  Play,
  Settings,
  X,
} from 'lucide-react'
import Link from 'next/link'

import type { AwarenessState } from '@/interfaces/awareness'
import { LogoIcon } from '@/components/Logo'

interface Props {
  onImport?: (e: React.ChangeEvent<HTMLInputElement>) => void
  onExport?: () => void
  onInvite?: () => void
  onRun?: () => void
  running?: boolean
  users: Array<[number, AwarenessState]>
  onFollow: (clientId: string | null) => void
  following: string | null
  followingName?: string | null
  onManageRoles?: () => void
  onOpenSettings?: () => void
  onOpenAnalytics?: () => void
  onEndSession?: () => void
  onLeaveSession?: () => void
  isOwner?: boolean
  myRole?: 'driver' | 'navigator'
  followEnabled?: boolean
  onToggleFollow?: () => void
  onGitHubImport?: () => void
}

export default function Toolbar({
  onRun,
  running,
  onImport,
  onExport,
  onInvite,
  onManageRoles,
  onOpenSettings,
  onOpenAnalytics,
  onEndSession,
  onLeaveSession,
  isOwner,
  myRole,
  followEnabled = true,
  onToggleFollow,
  onGitHubImport,
}: Props) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const canToggleFollow = myRole === 'navigator'

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onImport) onImport(e)
  }

  return (
    <>
      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar (hidden on desktop) */}
      <div
        className={`fixed top-0 left-0 h-full w-64 bg-surface-primary border-r border-border-strong z-50 md:hidden transform transition-transform duration-300 ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
          <div className="flex items-center justify-between p-4 border-b border-border-strong">
            <h2 className="text-lg font-semibold">Menu</h2>
            <Button
              isIconOnly
              size="sm"
              className="bg-transparent hover:bg-surface-elevated"
              onPress={() => setMobileSidebarOpen(false)}
            >
              <X size={20} />
            </Button>
          </div>

          {/* Sidebar Content */}
          <div className="flex flex-col p-2 gap-1">
            <input
              id="mobile-file-importer"
              type="file"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              accept=".js,.ts,.tsx,.jsx,.html,.css,.json,.md,.txt,.py"
            />

            {/* File Section - Mobile only */}
            <div className="py-2">
              <p className="text-xs text-gray-500 px-3 mb-2">FILE</p>
              <Button
                className="w-full justify-start bg-transparent hover:bg-surface-elevated text-text-primary"
                size="sm"
                onPress={() => {
                  if (myRole !== 'navigator') {
                    document.getElementById('mobile-file-importer')?.click()
                  }
                }}
                isDisabled={myRole === 'navigator'}
              >
                <span className="text-sm">Import File</span>
              </Button>
              <Button
                className="w-full justify-start bg-transparent hover:bg-surface-elevated text-text-primary"
                size="sm"
                onPress={() => {
                  if (myRole !== 'navigator' && onGitHubImport) {
                    onGitHubImport()
                    setMobileSidebarOpen(false)
                  }
                }}
                isDisabled={myRole === 'navigator'}
              >
                <Github size={16} />
                <span className="text-sm">Import from GitHub</span>
              </Button>
              <Button
                className="w-full justify-start bg-transparent hover:bg-surface-elevated text-text-primary"
                size="sm"
                onPress={() => {
                  if (onExport) {
                    onExport()
                    setMobileSidebarOpen(false)
                  }
                }}
              >
                <span className="text-sm">Export File</span>
              </Button>
            </div>

            {/* Tools Section */}
            <div className="py-2">
              <p className="text-xs text-gray-500 px-3 mb-2">TOOLS</p>
              <Button
                className={`w-full justify-start bg-transparent hover:bg-surface-elevated text-text-primary ${followEnabled ? 'bg-blue-100 dark:bg-blue-900' : ''}`}
                size="sm"
                onPress={() => {
                  if (canToggleFollow) onToggleFollow?.()
                }}
                isDisabled={!canToggleFollow}
              >
                <Navigation size={16} />
                <span className="text-sm">
                  {followEnabled ? 'Unfollow Driver' : 'Follow Driver'}
                </span>
              </Button>
              <Button
                className="w-full justify-start bg-transparent hover:bg-surface-elevated text-text-primary"
                size="sm"
                onPress={() => {
                  onManageRoles?.()
                  setMobileSidebarOpen(false)
                }}
              >
                <Share2 size={16} />
                <span className="text-sm">Invite</span>
              </Button>
              <Button
                className="w-full justify-start bg-transparent hover:bg-surface-elevated text-text-primary"
                size="sm"
                onPress={() => {
                  onOpenAnalytics?.()
                  setMobileSidebarOpen(false)
                }}
              >
                <BarChart2 size={16} />
                <span className="text-sm">Analytics</span>
              </Button>
              <Button
                className="w-full justify-start bg-transparent hover:bg-surface-elevated text-text-primary"
                size="sm"
                onPress={() => {
                  onOpenSettings?.()
                  setMobileSidebarOpen(false)
                }}
              >
                <Settings size={16} />
                <span className="text-sm">Settings</span>
              </Button>
            </div>

            {/* Help Section */}
            {/* <div className="py-2">
              <p className="text-xs text-gray-500 px-3 mb-2">HELP</p>
              <Button
                className="w-full justify-start bg-transparent hover:bg-surface-elevated text-text-primary"
                size="sm"
              >
                <span className="text-sm">(To be implemented)</span>
              </Button>
            </div> */}

            {/* Session Actions */}
            <div className="py-2 mt-auto border-t border-border-strong">
              {isOwner ? (
                <Button
                  className="w-full justify-start bg-transparent hover:bg-red-500 dark:hover:bg-red-500 text-text-primary"
                  size="sm"
                  onPress={() => {
                    onEndSession?.()
                    setMobileSidebarOpen(false)
                  }}
                >
                  <span className="text-sm">End Session</span>
                </Button>
              ) : (
                <Button
                  className="w-full justify-start bg-transparent hover:bg-surface-elevated text-text-primary"
                  size="sm"
                  onPress={() => {
                    onLeaveSession?.()
                    setMobileSidebarOpen(false)
                  }}
                >
                  <span className="text-sm">Leave</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Top Bar ────────────────────────────────────────────── */}
      <div className="bg-surface-primary border-b border-border-strong shrink-0">
        <div className="relative flex items-center h-12 px-3 gap-2">

          {/* Left: mobile hamburger | desktop logo + file */}
          <div className="flex items-center gap-1">
            {/* Mobile hamburger */}
            <Button
              isIconOnly
              className="md:hidden bg-transparent hover:bg-surface-elevated text-text-primary"
              size="sm"
              onPress={() => setMobileSidebarOpen(true)}
            >
              <Menu size={20} />
            </Button>

            {/* Desktop: Logo */}
            <Link href="/" className="hidden md:flex items-center mr-1">
              <LogoIcon className="w-8 h-8 text-white" />
            </Link>

            {/* Desktop: File dropdown */}
            <div className="hidden md:block">
              <input
                id="toolbar-file-importer"
                type="file"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
                accept=".js,.ts,.tsx,.jsx,.html,.css,.json,.md,.txt,.py"
              />
              <Dropdown placement="bottom-start">
                <DropdownTrigger>
                  <Button
                    className="bg-transparent hover:bg-surface-elevated text-text-primary text-sm"
                    size="sm"
                    variant="flat"
                  >
                    File
                  </Button>
                </DropdownTrigger>
                <DropdownMenu
                  aria-label="File options"
                  selectionMode="none"
                  onAction={(key) => {
                    const k = key.toString()
                    if (k === 'import') {
                      document.getElementById('toolbar-file-importer')?.click()
                    } else if (k === 'github-import') {
                      onGitHubImport?.()
                    } else if (k === 'export') {
                      onExport?.()
                    }
                  }}
                >
                  <DropdownItem key="import" isDisabled={myRole === 'navigator'}>
                    Import File
                  </DropdownItem>
                  <DropdownItem
                    key="github-import"
                    endContent={<Github size={14} />}
                    isDisabled={myRole === 'navigator'}
                  >
                    Import from GitHub
                  </DropdownItem>
                  <DropdownItem key="export">Export</DropdownItem>
                </DropdownMenu>
              </Dropdown>
            </div>
          </div>

          {/* Center: Run button */}
          <div className="absolute left-1/2 -translate-x-1/2">
            <Button
              className="bg-green-100 hover:bg-green-200 text-green-700 dark:bg-green-900 dark:hover:bg-green-800 dark:text-green-300 border border-btn-border"
              size="sm"
              onPress={onRun}
              disabled={running}
            >
              <Play fill="currentColor" size={14} />
              <span className="text-sm">{running ? 'Running...' : 'Run'}</span>
            </Button>
          </div>

          {/* Right: Invite (desktop only) */}
          <div className="ml-auto hidden md:flex items-center gap-2">
            <Tooltip content="Invite">
              <Button
                isIconOnly
                className="bg-surface-secondary hover:bg-surface-elevated text-text-primary border border-btn-border"
                size="sm"
                onPress={onInvite}
                aria-label="Invite"
              >
                <Share2 size={16} />
              </Button>
            </Tooltip>
          </div>

        </div>
      </div>
    </>
  )
}
