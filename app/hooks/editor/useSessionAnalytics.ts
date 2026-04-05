/**
 * Hook for tracking session analytics (time spent in each role)
 */

import { useCallback, useEffect, useRef } from 'react'
import type { WebsocketProvider } from 'y-websocket'
import type * as Y from 'yjs'

import { ANALYTICS_PUBLISH_INTERVAL_MS } from '@/app/constants/editor'
import type { AwarenessRole } from '@/app/interfaces/awareness'
import type {
  AwarenessEntry,
  RoleTrackingState,
  RoleTotals,
  SessionSummary,
  UserRoleContribution,
} from '@/app/interfaces/editor'
import { parseAnalyticsEntry } from '@/app/utils/editor'

interface UseSessionAnalyticsOptions {
  /** Current user's role */
  myRole: AwarenessRole
  /** Whether the provider has synced */
  providerSynced: boolean
  /** Reference to the Yjs provider */
  providerRef: React.RefObject<WebsocketProvider | null>
  /** Reference to the analytics Yjs map */
  analyticsMapRef: React.RefObject<Y.Map<unknown> | null>
  /** Current list of user states */
  userStates: AwarenessEntry[]
}

interface UseSessionAnalyticsReturn {
  /**
   * Start the session timer.
   * @param initialRole - The role to record as the starting role. When called
   *   from useYjsRoom's onInitialRole callback the role is known before React
   *   re-renders, so pass it explicitly to avoid using a stale closure value.
   */
  startSession: (initialRole?: AwarenessRole) => void
  /** Reset all session tracking refs (called by useYjsRoom on cleanup). */
  resetAnalytics: () => void
  /** Publish current user's role totals to the shared map */
  publishMyRoleTotals: (now: number) => void
  /** Compute session summary at a given time */
  computeSessionSummaryNow: (now: number) => SessionSummary | null
  /** Compute team contribution at current time */
  computeTeamContributionNow: () => UserRoleContribution[]
  /** Finalize totals when session ends */
  finalizeRoleTotals: (endedAt: number) => SessionSummary
  /** Reference to session start time */
  sessionStartRef: React.RefObject<number | null>
  /** Reference to current role tracking state */
  roleSinceRef: React.RefObject<RoleTrackingState | null>
  /** Reference to accumulated role totals */
  roleTotalsRef: React.RefObject<RoleTotals>
}

/**
 * Manages session analytics including time tracking per role
 */
export function useSessionAnalytics({
  myRole,
  providerSynced,
  providerRef,
  analyticsMapRef,
  userStates,
}: UseSessionAnalyticsOptions): UseSessionAnalyticsReturn {
  const sessionStartRef = useRef<number | null>(null)
  const roleSinceRef = useRef<RoleTrackingState | null>(null)
  const roleTotalsRef = useRef<RoleTotals>({
    driver: 0,
    navigator: 0,
    none: 0,
  })

  // Start session timer
  const startSession = useCallback(
    (initialRole?: AwarenessRole) => {
      if (sessionStartRef.current == null) {
        sessionStartRef.current = Date.now()
        roleSinceRef.current = {
          role: initialRole ?? myRole,
          startedAt: sessionStartRef.current,
        }
      }
    },
    [myRole]
  )

  // Reset all tracking state — called by useYjsRoom when the room tears down
  const resetAnalytics = useCallback(() => {
    sessionStartRef.current = null
    roleSinceRef.current = null
    roleTotalsRef.current = { driver: 0, navigator: 0, none: 0 }
  }, [])

  // Track time spent in each role when role changes
  useEffect(() => {
    const now = Date.now()
    const start = sessionStartRef.current

    if (start == null) {
      return
    }

    const current = roleSinceRef.current
    if (!current) {
      roleSinceRef.current = { role: myRole, startedAt: now }
      return
    }

    if (current.role === myRole) return

    const delta = Math.max(0, now - current.startedAt)
    if (current.role === 'driver') roleTotalsRef.current.driver += delta
    else if (current.role === 'navigator')
      roleTotalsRef.current.navigator += delta
    else roleTotalsRef.current.none += delta

    roleSinceRef.current = { role: myRole, startedAt: now }
  }, [myRole])

  // Publish role totals to shared analytics map
  const publishMyRoleTotals = useCallback((now: number) => {
    const provider = providerRef.current
    const analyticsMap = analyticsMapRef.current
    if (!provider || !analyticsMap) return

    const startedAt = sessionStartRef.current
    if (startedAt == null) return

    const current = roleSinceRef.current
    const base = roleTotalsRef.current
    const totals = {
      driver: base.driver,
      navigator: base.navigator,
      none: base.none,
    }

    if (current) {
      const delta = Math.max(0, now - current.startedAt)
      if (current.role === 'driver') totals.driver += delta
      else if (current.role === 'navigator') totals.navigator += delta
      else totals.none += delta
    }

    const selfIdStr = provider.awareness.clientID.toString()
    analyticsMap.set(selfIdStr, {
      driverMs: totals.driver,
      navigatorMs: totals.navigator,
      noneMs: totals.none,
    })
  }, [providerRef, analyticsMapRef])

  // Compute session summary at a given point in time
  const computeSessionSummaryNow = useCallback((now: number): SessionSummary | null => {
    const startedAt = sessionStartRef.current
    if (startedAt == null) return null

    const base = roleTotalsRef.current
    const totals = {
      driver: base.driver,
      navigator: base.navigator,
      none: base.none,
    }

    const current = roleSinceRef.current
    if (current) {
      const delta = Math.max(0, now - current.startedAt)
      if (current.role === 'driver') totals.driver += delta
      else if (current.role === 'navigator') totals.navigator += delta
      else totals.none += delta
    }

    return {
      sessionMs: Math.max(0, now - startedAt),
      driverMs: totals.driver,
      navigatorMs: totals.navigator,
      noneMs: totals.none,
    }
  }, [])

  // Compute team contribution from analytics map
  const computeTeamContributionNow = useCallback((): UserRoleContribution[] => {
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

    return userStates
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
  }, [analyticsMapRef, userStates])

  // Finalize role totals when session ends
  const finalizeRoleTotals = useCallback((endedAt: number): SessionSummary => {
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

    return {
      sessionMs: Math.max(0, endedAt - startedAt),
      driverMs: roleTotalsRef.current.driver,
      navigatorMs: roleTotalsRef.current.navigator,
      noneMs: roleTotalsRef.current.none,
    }
  }, [])

  // Periodically publish analytics
  useEffect(() => {
    if (!providerSynced) return

    const interval = window.setInterval(() => {
      const now = Date.now()
      publishMyRoleTotals(now)
    }, ANALYTICS_PUBLISH_INTERVAL_MS)

    return () => {
      window.clearInterval(interval)
    }
  }, [providerSynced, publishMyRoleTotals])

  return {
    startSession,
    resetAnalytics,
    publishMyRoleTotals,
    computeSessionSummaryNow,
    computeTeamContributionNow,
    finalizeRoleTotals,
    sessionStartRef,
    roleSinceRef,
    roleTotalsRef,
  }
}
