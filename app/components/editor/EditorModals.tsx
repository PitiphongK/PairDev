'use client'

import type { AwarenessRole } from '@/interfaces/awareness'
import type {
  AwarenessEntry,
  SessionSummary,
  UserRoleContribution,
} from '@/interfaces/editor'

import EndSessionConfirmModal from '@/components/modals/EndSessionConfirmModal'
import GitHubImportModal from '@/components/modals/GitHubImportModal'
import RoleNoticeModal from '@/components/modals/RoleNoticeModal'
import SessionEndedModal from '@/components/modals/SessionEndedModal'
import SessionSummaryModal from '@/components/modals/SessionSummaryModal'
import SettingsModal from '@/components/modals/SettingsModal'

interface EditorModalsProps {
  // Role notice modal
  roleNoticeOpen: boolean
  myRole: AwarenessRole
  roleNoticeDontShowAgain: boolean
  onRoleNoticeDontShowAgainChange: (value: boolean) => void
  onRoleNoticeOk: () => void

  // GitHub import modal
  githubImportOpen: boolean
  onGithubImportClose: () => void
  onGitHubImport: (repoUrl: string, filePath?: string) => Promise<void>

  // Session ended modal
  sessionEndedOpen: boolean
  onGoHome: () => void

  // Roles modal
  rolesOpen: boolean
  onRolesClose: () => void
  isOwner: boolean
  userStates: AwarenessEntry[]
  getRole: (clientId: number) => AwarenessRole
  onSetRole: (clientId: number, role: AwarenessRole) => void
  currentOwnerId: number | null
  onCopyLink: () => void

  // Settings modal
  settingsOpen: boolean
  onSettingsClose: () => void
  settingsInitialSection?: 'general' | 'roles'
  currentUserId?: number

  // End session confirm modal
  endConfirmOpen: boolean
  endingSession: boolean
  onEndConfirmCancel: () => void
  onEndConfirmConfirm: () => Promise<void>

  // Session summary modal (end session)
  summaryOpen: boolean
  sessionSummary: SessionSummary | null
  teamRoleContribution: UserRoleContribution[]
  onSummaryClose: () => void

  // Analytics modal (view during session)
  analyticsOpen: boolean
  onAnalyticsClose: () => void
}

/**
 * Container component for all editor-related modal dialogs
 */
export default function EditorModals({
  // Role notice
  roleNoticeOpen,
  myRole,
  roleNoticeDontShowAgain,
  onRoleNoticeDontShowAgainChange,
  onRoleNoticeOk,
  // GitHub import
  githubImportOpen,
  onGithubImportClose,
  onGitHubImport,
  // Session ended
  sessionEndedOpen,
  onGoHome,
  // Roles
  rolesOpen,
  onRolesClose,
  isOwner,
  userStates,
  getRole,
  onSetRole,
  currentOwnerId,
  // Settings
  settingsOpen,
  onSettingsClose,
  settingsInitialSection,
  currentUserId,
  // End confirm
  endConfirmOpen,
  endingSession,
  onEndConfirmCancel,
  onEndConfirmConfirm,
  // Summary
  summaryOpen,
  sessionSummary,
  teamRoleContribution,
  onSummaryClose,
  // Analytics
  analyticsOpen,
  onAnalyticsClose,
}: EditorModalsProps) {
  return (
    <>
      <RoleNoticeModal
        isOpen={roleNoticeOpen}
        role={myRole === 'driver' ? 'driver' : 'navigator'}
        dontShowAgain={roleNoticeDontShowAgain}
        onChangeDontShowAgain={onRoleNoticeDontShowAgainChange}
        onOk={onRoleNoticeOk}
      />
      <GitHubImportModal
        isOpen={githubImportOpen}
        onClose={onGithubImportClose}
        onImport={onGitHubImport}
      />
      <SessionEndedModal isOpen={sessionEndedOpen} onGoHome={onGoHome} />
      <SettingsModal
        isOpen={settingsOpen}
        onClose={onSettingsClose}
        isOwner={isOwner}
        users={userStates}
        getRole={getRole}
        onSetRole={onSetRole}
        currentOwnerId={currentOwnerId}
        currentUserId={currentUserId}
        initialSection={settingsInitialSection}
      />
      <EndSessionConfirmModal
        isOpen={endConfirmOpen}
        pending={endingSession}
        onCancel={onEndConfirmCancel}
        onConfirm={onEndConfirmConfirm}
      />
      <SessionSummaryModal
        isOpen={summaryOpen}
        summary={sessionSummary}
        users={teamRoleContribution}
        onClose={onSummaryClose}
      />
      <SessionSummaryModal
        isOpen={analyticsOpen}
        summary={sessionSummary}
        users={teamRoleContribution}
        primaryActionLabel="Close"
        onClose={onAnalyticsClose}
      />
    </>
  )
}
