/**
 * Hook for managing synchronized panel layouts
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ImperativePanelGroupHandle } from 'react-resizable-panels'
import type * as Y from 'yjs'

import {
  DEFAULT_HORIZONTAL_LAYOUT,
  DEFAULT_VERTICAL_LAYOUT,
  LAYOUT_SYNC_DEBOUNCE_MS,
  PANELS_MAP_KEYS,
} from '@/constants/editor'
import type { AwarenessRole } from '@/interfaces/awareness'
import { isNumberArray } from '@/utils/editor'

interface UsePanelLayoutOptions {
  /** Reference to the panels Yjs map */
  panelsMapRef: React.RefObject<Y.Map<unknown> | null>
  /** Current user's role (only driver can sync layouts) */
  myRole: AwarenessRole
  /** Whether follow mode is enabled (for navigators) */
  followEnabled?: boolean
}

interface UsePanelLayoutReturn {
  /** Current horizontal layout */
  hLayout: number[] | null
  /** Current vertical layout */
  vLayout: number[] | null
  /** Setter for horizontal layout */
  setHLayout: React.Dispatch<React.SetStateAction<number[] | null>>
  /** Setter for vertical layout */
  setVLayout: React.Dispatch<React.SetStateAction<number[] | null>>
  /** Ref for horizontal panel group */
  hGroupRef: React.RefObject<ImperativePanelGroupHandle | null>
  /** Ref for vertical panel group */
  vGroupRef: React.RefObject<ImperativePanelGroupHandle | null>
  /** Handler for horizontal layout changes */
  handleHLayoutChange: (sizes: number[]) => void
  /** Handler for vertical layout changes */
  handleVLayoutChange: (sizes: number[]) => void
  /** Initialize panel defaults */
  initializePanelDefaults: () => void
  /** Set up panel observer */
  setupPanelObserver: () => (() => void) | undefined
}

/**
 * Manages panel layout state and synchronization via Yjs
 */
export function usePanelLayout({
  panelsMapRef,
  myRole,
  followEnabled = true,
}: UsePanelLayoutOptions): UsePanelLayoutReturn {
  const [hLayout, setHLayout] = useState<number[] | null>(null)
  const [vLayout, setVLayout] = useState<number[] | null>(null)
  const hGroupRef = useRef<ImperativePanelGroupHandle | null>(null)
  const vGroupRef = useRef<ImperativePanelGroupHandle | null>(null)
  const layoutDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const myRoleRef = useRef(myRole)
  const followEnabledRef = useRef(followEnabled)

  // Keep refs in sync
  useEffect(() => {
    myRoleRef.current = myRole
  }, [myRole])

  useEffect(() => {
    followEnabledRef.current = followEnabled
  }, [followEnabled])

  // Initialize panel defaults
  const initializePanelDefaults = useCallback(() => {
    const panelsMap = panelsMapRef.current
    if (!panelsMap) return

    const hasH = isNumberArray(panelsMap.get(PANELS_MAP_KEYS.HORIZONTAL))
    const hasV = isNumberArray(panelsMap.get(PANELS_MAP_KEYS.VERTICAL))
    const defaultH = [...DEFAULT_HORIZONTAL_LAYOUT]
    const defaultV = [...DEFAULT_VERTICAL_LAYOUT]

    if (!hasH) panelsMap.set(PANELS_MAP_KEYS.HORIZONTAL, defaultH)
    if (!hasV) panelsMap.set(PANELS_MAP_KEYS.VERTICAL, defaultV)

    const h = panelsMap.get(PANELS_MAP_KEYS.HORIZONTAL)
    const v = panelsMap.get(PANELS_MAP_KEYS.VERTICAL)
    setHLayout(isNumberArray(h) ? h : defaultH)
    setVLayout(isNumberArray(v) ? v : defaultV)
  }, [panelsMapRef])

  // Set up observer for panel changes
  const setupPanelObserver = useCallback(() => {
    const panelsMap = panelsMapRef.current
    if (!panelsMap) return undefined

    const panelsObserver = () => {
      const h = panelsMap.get(PANELS_MAP_KEYS.HORIZONTAL)
      const v = panelsMap.get(PANELS_MAP_KEYS.VERTICAL)
      if (isNumberArray(h)) setHLayout(h.slice())
      if (isNumberArray(v)) setVLayout(v.slice())
    }

    panelsMap.observe(panelsObserver)
    return () => panelsMap.unobserve(panelsObserver)
  }, [panelsMapRef])

  // Handle horizontal layout changes
  const handleHLayoutChange = useCallback(
    (sizes: number[]) => {
      setHLayout(sizes)
      if (myRole === 'driver') {
        if (layoutDebounceRef.current) clearTimeout(layoutDebounceRef.current)
        layoutDebounceRef.current = setTimeout(() => {
          panelsMapRef.current?.set(PANELS_MAP_KEYS.HORIZONTAL, sizes)
        }, LAYOUT_SYNC_DEBOUNCE_MS)
      }
    },
    [myRole, panelsMapRef]
  )

  // Handle vertical layout changes
  const handleVLayoutChange = useCallback(
    (sizes: number[]) => {
      setVLayout(sizes)
      if (myRole === 'driver') {
        if (layoutDebounceRef.current) clearTimeout(layoutDebounceRef.current)
        layoutDebounceRef.current = setTimeout(() => {
          panelsMapRef.current?.set(PANELS_MAP_KEYS.VERTICAL, sizes)
        }, LAYOUT_SYNC_DEBOUNCE_MS)
      }
    },
    [myRole, panelsMapRef]
  )

  // Apply layout updates to panel groups
  useEffect(() => {
    // Only apply layout changes if driver or following is enabled
    const shouldApply = myRoleRef.current === 'driver' || followEnabledRef.current
    if (hLayout && hGroupRef.current && shouldApply) {
      try {
        hGroupRef.current.setLayout(hLayout)
      } catch { }
    }
  }, [hLayout, followEnabled])

  useEffect(() => {
    // Only apply layout changes if driver or following is enabled
    const shouldApply = myRoleRef.current === 'driver' || followEnabledRef.current
    if (vLayout && vGroupRef.current && shouldApply) {
      try {
        vGroupRef.current.setLayout(vLayout)
      } catch { }
    }
  }, [vLayout, followEnabled])

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      if (layoutDebounceRef.current) clearTimeout(layoutDebounceRef.current)
    }
  }, [])

  return {
    hLayout,
    vLayout,
    setHLayout,
    setVLayout,
    hGroupRef,
    vGroupRef,
    handleHLayoutChange,
    handleVLayoutChange,
    initializePanelDefaults,
    setupPanelObserver,
  }
}
