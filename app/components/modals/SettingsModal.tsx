'use client'

import React, { useState } from 'react'

import {
  Button,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  Tooltip,
} from '@heroui/react'
import { Crown, Settings, Users, X } from 'lucide-react'

import type { AwarenessState } from '@/interfaces/awareness'
import { ThemeSwitcher } from '../theme-switcher'

type Role = 'driver' | 'navigator'

type Props = {
  isOpen: boolean
  onClose: () => void
  isOwner?: boolean
  users?: Array<[number, AwarenessState]>
  getRole?: (clientId: number) => Role
  onSetRole?: (clientId: number, role: Role) => void
  currentOwnerId?: number | null
  currentUserId?: number
  initialSection?: 'general' | 'roles'
}

type NavKey = 'general' | 'roles'

const NAV_ITEMS: { key: NavKey; label: string; icon: React.ReactNode }[] = [
  { key: 'general', label: 'General', icon: <Settings size={15} /> },
  { key: 'roles', label: 'Manage Roles', icon: <Users size={15} /> },
]

export default function SettingsModal({
  isOpen,
  onClose,
  isOwner = false,
  users = [],
  getRole,
  onSetRole,
  currentOwnerId,
  currentUserId,
  initialSection = 'general',
}: Props) {
  const [activeSection, setActiveSection] = useState<NavKey>(initialSection)

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      placement="center"
      hideCloseButton
      classNames={{
        base: 'overflow-hidden p-0 rounded-2xl',
        wrapper: 'items-center',
      }}
    >
      <ModalContent className="p-0">
        {() => (
          <div className="flex h-135 overflow-hidden rounded-2xl">

            {/* ── Left sidebar ─────────────────────────────────── */}
            <div className="w-56 shrink-0 bg-surface-secondary border-r border-border-strong flex flex-col overflow-y-auto">
              <div className="px-5 pt-6 pb-4">
                <h1 className="text-xl font-bold text-text-primary">Settings</h1>
              </div>
              <nav className="flex flex-col gap-0.5 px-2 pb-4">
                {NAV_ITEMS.map(({ key, label, icon }) => (
                  <Button
                    key={key}
                    variant="light"
                    onPress={() => setActiveSection(key)}
                    className={`justify-start gap-2.5 w-full px-3 text-sm ${activeSection === key
                      ? 'bg-blue-500/10 text-blue-500 font-medium'
                      : 'text-text-secondary'
                      }`}
                  >
                    <span className={activeSection === key ? 'text-blue-500' : 'text-default-400'}>
                      {icon}
                    </span>
                    {label}
                  </Button>
                ))}
              </nav>
            </div>

            {/* ── Right content ────────────────────────────────── */}
            <div className="flex-1 flex flex-col overflow-hidden bg-surface-primary">

              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-5 pb-4 shrink-0">
                <div>
                  <h2 className="text-base font-semibold text-text-primary">
                    {activeSection === 'general' ? 'Themes' : 'Manage Roles'}
                  </h2>
                  <p className="text-xs text-default-500 mt-0.5">
                    {activeSection === 'general'
                      ? 'Choose your style or customize your theme.'
                      : 'Control permissions and roles for current members.'}
                  </p>
                </div>
                <Button
                  isIconOnly
                  variant="light"
                  size="sm"
                  onPress={onClose}
                  className="text-default-400 hover:text-text-primary"
                  aria-label="Close settings"
                >
                  <X size={16} />
                </Button>
              </div>

              <div className="w-full border-t border-border-strong" />

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-6 py-5">

                {/* General – Themes */}
                {activeSection === 'general' && (
                  <ThemeSwitcher />
                )}

                {/* Manage Roles */}
                {activeSection === 'roles' && (
                  <div className="space-y-1">
                    {users.length === 0 && (
                      <p className="text-sm text-default-500 text-center py-12">
                        No participants yet.
                      </p>
                    )}
                    {users.map(([clientId, state]) => {
                      const name = state.user?.name ?? `User ${clientId}`
                      const role = getRole ? getRole(clientId) : 'navigator'
                      const isCurrentOwner = clientId === currentOwnerId

                      return (
                        <div
                          key={clientId}
                          className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-surface-elevated/50 transition-colors"
                        >
                          {/* Avatar */}
                          <div
                            className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-semibold"
                            style={{ background: state.user?.color ?? '#888' }}
                          >
                            {name.charAt(0).toUpperCase()}
                          </div>

                          {/* Name + crown + you */}
                          <div className="flex-1 min-w-0 flex items-center gap-1.5">
                            <span className="text-sm font-medium text-text-primary truncate">
                              {name}
                            </span>
                            {isCurrentOwner && (
                              <Tooltip content="Owner" size="sm" placement="top">
                                <Crown
                                  size={13}
                                  className="text-yellow-400 shrink-0 cursor-default"
                                  fill="currentColor"
                                />
                              </Tooltip>
                            )}
                            {clientId === currentUserId && (
                              <span className="shrink-0 text-[9px] font-semibold px-1 py-0.5 rounded bg-default-200 text-default-500 leading-none">
                                You
                              </span>
                            )}
                          </div>

                          {/* Role — editable select or plain label */}
                          {isOwner ? (
                            <Select
                              size="sm"
                              className="w-32 shrink-0"
                              selectedKeys={new Set([role])}
                              aria-label={`Role for ${name}`}
                              classNames={{
                                trigger:
                                  'bg-transparent shadow-none border-0 min-h-8 h-8 px-2 data-[hover=true]:bg-surface-elevated data-[open=true]:bg-surface-elevated',
                                value: 'text-sm text-text-primary',
                              }}
                              onSelectionChange={(keys) => {
                                const sel = Array.from(keys)[0] as Role
                                if (onSetRole) onSetRole(clientId, sel)
                              }}
                            >
                              <SelectItem key="driver">Driver</SelectItem>
                              <SelectItem key="navigator">Navigator</SelectItem>
                            </Select>
                          ) : (
                            <span className="text-sm text-default-500 pr-2 capitalize">
                              {role}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

              </div>
            </div>
          </div>
        )}
      </ModalContent>
    </Modal>
  )
}
