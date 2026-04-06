/**
 * Type definitions for the collaborative editor
 */

import type { WebsocketProvider } from 'y-websocket'

import type { AwarenessRole, AwarenessState } from '@/interfaces/awareness'
import type { setupYjs } from '@/y'

// ============================================================================
// Yjs Related Types
// ============================================================================

/** Entry from awareness.getStates() - tuple of [clientId, state] */
export type AwarenessEntry = [number, AwarenessState]

/** Extended provider type that includes synced event handling */
export type ProviderWithSyncedEvents = {
  on: (event: 'synced', cb: (isSynced: boolean) => void) => void
  off?: (event: 'synced', cb: (isSynced: boolean) => void) => void
}

/** Return type of setupYjs function */
export type YjsInstance = ReturnType<typeof setupYjs>

// ============================================================================
// Session Analytics Types
// ============================================================================

/** Summary of time spent in a session */
export interface SessionSummary {
  /** Total session duration in milliseconds */
  sessionMs: number
  /** Time spent as driver in milliseconds */
  driverMs: number
  /** Time spent as navigator in milliseconds */
  navigatorMs: number
  /** Time spent with no role in milliseconds */
  noneMs: number
}

/** Per-user role contribution analytics */
export interface UserRoleContribution {
  /** Yjs client ID */
  clientId: number
  /** User display name */
  name: string
  /** Time spent as driver in milliseconds */
  driverMs: number
  /** Time spent as navigator in milliseconds */
  navigatorMs: number
  /** Time spent with no role in milliseconds */
  noneMs: number
}

/** Role timing totals for internal tracking (short names) */
export interface RoleTotals {
  driver: number
  navigator: number
  none: number
}

/** Role timing totals as stored in analytics (with Ms suffix) */
export interface AnalyticsRoleTotals {
  driverMs: number
  navigatorMs: number
  noneMs: number
}

/** Current role tracking state */
export interface RoleTrackingState {
  role: AwarenessRole
  startedAt: number
}

// ============================================================================
// Layout Types
// ============================================================================

/** Panel layout sizes as percentages */
export type PanelLayout = number[]

/** State for horizontal and vertical layouts */
export interface LayoutState {
  horizontal: PanelLayout | null
  vertical: PanelLayout | null
}

// ============================================================================
// Modal State Types
// ============================================================================

/** All modal visibility states */
export interface ModalStates {
  roles: boolean
  settings: boolean
  endConfirm: boolean
  summary: boolean
  analytics: boolean
  sessionEnded: boolean
  githubImport: boolean
  roleNotice: boolean
}

// ============================================================================
// Component Props Types
// ============================================================================

/** Props for EditorClient component */
export interface EditorClientProps {
  roomId: string
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export type { AwarenessRole, AwarenessState } from '@/interfaces/awareness'
