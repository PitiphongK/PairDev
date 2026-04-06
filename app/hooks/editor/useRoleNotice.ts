/**
 * Hook for managing role notice modal display
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { STORAGE_KEYS } from '@/constants/editor'
import type { AwarenessRole } from '@/interfaces/awareness'

interface UseRoleNoticeOptions {
  /** Current user's role */
  myRole: AwarenessRole
  /** Whether the provider has synced */
  providerSynced: boolean
}

interface UseRoleNoticeReturn {
  /** Whether the role notice modal is open */
  roleNoticeOpen: boolean
  /** Set role notice modal open state */
  setRoleNoticeOpen: (value: boolean) => void
  /** Whether to hide role notices permanently */
  hideRoleNotice: boolean
  /** Set hide role notice preference */
  setHideRoleNotice: (value: boolean) => void
  /** Whether "don't show again" is checked */
  roleNoticeDontShowAgain: boolean
  /** Set "don't show again" state */
  setRoleNoticeDontShowAgain: (value: boolean) => void
  /** Handle closing the role notice modal */
  handleRoleNoticeOk: () => void
}

/**
 * Manages the role notice modal that shows when user joins with a role
 */
export function useRoleNotice({
  myRole,
  providerSynced,
}: UseRoleNoticeOptions): UseRoleNoticeReturn {
  const [roleNoticeOpen, setRoleNoticeOpen] = useState(false)
  const [hideRoleNotice, setHideRoleNotice] = useState(false)
  const [roleNoticeDontShowAgain, setRoleNoticeDontShowAgain] = useState(false)
  const roleNoticeShownRef = useRef(false)

  // Load persisted preference for role notice
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.HIDE_ROLE_NOTICE)
      setHideRoleNotice(raw === '1')
    } catch {
      setHideRoleNotice(false)
    }
  }, [])

  // Show role notice once per session when the role is known
  useEffect(() => {
    if (!providerSynced) return
    if (hideRoleNotice) return
    if (roleNoticeShownRef.current) return

    if (myRole === 'driver' || myRole === 'navigator') {
      roleNoticeShownRef.current = true
      setRoleNoticeDontShowAgain(false)
      setRoleNoticeOpen(true)
    }
  }, [hideRoleNotice, myRole, providerSynced])

  // Handle closing the role notice modal
  const handleRoleNoticeOk = useCallback(() => {
    if (roleNoticeDontShowAgain) {
      try {
        localStorage.setItem(STORAGE_KEYS.HIDE_ROLE_NOTICE, '1')
      } catch { }
      setHideRoleNotice(true)
    }
    setRoleNoticeOpen(false)
  }, [roleNoticeDontShowAgain])

  return {
    roleNoticeOpen,
    setRoleNoticeOpen,
    hideRoleNotice,
    setHideRoleNotice,
    roleNoticeDontShowAgain,
    setRoleNoticeDontShowAgain,
    handleRoleNoticeOk,
  }
}
