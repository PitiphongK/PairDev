/**
 * Utility functions for the collaborative editor
 */

import type {
  AnalyticsRoleTotals,
  RoleTrackingState,
  RoleTotals,
  SessionSummary,
} from '@/interfaces/editor'
import type { AwarenessRole } from '@/interfaces/awareness'

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is an array of numbers
 * Used for validating panel layout data from Yjs
 */
export function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((n) => typeof n === 'number')
}

/**
 * Type guard to check if a value is a valid analytics entry
 */
export function isAnalyticsEntry(
  value: unknown
): value is { driverMs: number; navigatorMs: number; noneMs: number } {
  if (!value || typeof value !== 'object') return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj.driverMs === 'number' &&
    typeof obj.navigatorMs === 'number' &&
    typeof obj.noneMs === 'number'
  )
}

// ============================================================================
// Random Generators
// ============================================================================

/**
 * Generate a random hex color for user cursor/presence
 * @returns Hex color string (e.g., "#a3f4c2")
 */
export function generateRandomColor(): string {
  return (
    '#' +
    Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padStart(6, '0')
  )
}

// ============================================================================
// Analytics Calculations
// ============================================================================

/**
 * Calculate role totals including current in-progress segment
 */
export function calculateRoleTotals(
  baseTotals: RoleTotals,
  currentTracking: RoleTrackingState | null,
  now: number
): RoleTotals {
  const totals = { ...baseTotals }

  if (currentTracking) {
    const delta = Math.max(0, now - currentTracking.startedAt)
    if (currentTracking.role === 'driver') {
      totals.driver += delta
    } else if (currentTracking.role === 'navigator') {
      totals.navigator += delta
    } else {
      totals.none += delta
    }
  }

  return totals
}

/**
 * Compute session summary from tracking data
 */
export function computeSessionSummary(
  sessionStart: number | null,
  baseTotals: RoleTotals,
  currentTracking: RoleTrackingState | null,
  now: number
): SessionSummary | null {
  if (sessionStart === null) return null

  const totals = calculateRoleTotals(baseTotals, currentTracking, now)

  return {
    sessionMs: Math.max(0, now - sessionStart),
    driverMs: totals.driver,
    navigatorMs: totals.navigator,
    noneMs: totals.none,
  }
}

/**
 * Update role totals when role changes
 */
export function updateRoleTotalsOnChange(
  currentTotals: RoleTotals,
  previousTracking: RoleTrackingState | null,
  now: number
): RoleTotals {
  if (!previousTracking) return currentTotals

  const delta = Math.max(0, now - previousTracking.startedAt)
  const updated = { ...currentTotals }

  if (previousTracking.role === 'driver') {
    updated.driver += delta
  } else if (previousTracking.role === 'navigator') {
    updated.navigator += delta
  } else {
    updated.none += delta
  }

  return updated
}

// ============================================================================
// Analytics Data Parsing
// ============================================================================

/**
 * Parse analytics entry from Yjs map value
 * Returns the format stored in Yjs (with Ms suffix)
 */
export function parseAnalyticsEntry(value: unknown): AnalyticsRoleTotals {
  if (!value || typeof value !== 'object') {
    return { driverMs: 0, navigatorMs: 0, noneMs: 0 }
  }

  const obj = value as Record<string, unknown>
  return {
    driverMs: typeof obj.driverMs === 'number' ? obj.driverMs : 0,
    navigatorMs: typeof obj.navigatorMs === 'number' ? obj.navigatorMs : 0,
    noneMs: typeof obj.noneMs === 'number' ? obj.noneMs : 0,
  }
}

// ============================================================================
// Time Formatting
// ============================================================================

/**
 * Format milliseconds as human-readable duration
 * @param ms - Duration in milliseconds
 * @returns Formatted string (e.g., "1h 23m 45s")
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}

/**
 * Format percentage for display
 * @param value - Decimal value (0-1)
 * @returns Formatted percentage string
 */
export function formatPercentage(value: number): string {
  return `${Math.round(value * 100)}%`
}

// ============================================================================
// Owner Election
// ============================================================================

/**
 * Determine the owner from a list of candidate client IDs
 * Uses deterministic arbitration (smallest ID wins)
 */
export function electOwner(candidates: number[], currentId: number): number {
  if (candidates.length === 0) return currentId
  return Math.min(...candidates)
}

/**
 * Pick a random next owner from available candidates
 */
export function pickRandomOwner(candidates: number[]): number | null {
  if (candidates.length === 0) return null
  const randomIdx = Math.floor(Math.random() * candidates.length)
  return candidates[randomIdx]
}

// ============================================================================
// Role Helpers
// ============================================================================

/**
 * Get default role based on ownership status
 */
export function getDefaultRole(isOwner: boolean): AwarenessRole {
  return isOwner ? 'driver' : 'navigator'
}
