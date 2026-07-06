import { useEffect, useMemo, useState } from 'react'

export type HomeEmphasis = 'compute' | 'relationship'
export type ComputeBadges = 'always' | 'onDemand'

/**
 * Workspace preferences (ADR-260061 / EPIC-260066 T4).
 *
 * A localStorage-backed store modeled on `ThemeProvider`, exposed on the WorkspaceContext.
 * T4 ships the contract + defaults only — EPIC-260070 adds the toggle UI, and EPIC-260069
 * reads `homeEmphasis`/`computeBadges` to drive the compute emphasis (per the Q3 resolution:
 * compute-as-differentiator, so defaults lean `compute` / `always`).
 *
 * Literal semantics (the contract EPIC-260069 / EPIC-260070 consume):
 * - `homeEmphasis`: `compute` → Flow (compute/dependencies) is the prominent landing;
 *   `relationship` → Network (relationships) is prominent.
 * - `computeBadges`: `always` → status badges on every computed atom; `onDemand` → only when
 *   an atom actually has an operation.
 *
 * Persistence note: like `ThemeProvider`, the value is written to localStorage on first render,
 * so the current default is sticky for a user who never toggles it (a later DEFAULT_* change
 * won't reach them). Kept consistent with `ThemeProvider` deliberately.
 */
export interface WorkspacePreferences {
  homeEmphasis: HomeEmphasis
  computeBadges: ComputeBadges
  leftRailCollapsed: boolean
  rightRailCollapsed: boolean
  setHomeEmphasis: (value: HomeEmphasis) => void
  setComputeBadges: (value: ComputeBadges) => void
  setLeftRailCollapsed: (value: boolean) => void
  setRightRailCollapsed: (value: boolean) => void
}

export const DEFAULT_HOME_EMPHASIS: HomeEmphasis = 'compute'
export const DEFAULT_COMPUTE_BADGES: ComputeBadges = 'always'
export const DEFAULT_LEFT_RAIL_COLLAPSED = false
export const DEFAULT_RIGHT_RAIL_COLLAPSED = false

const HOME_EMPHASIS_KEY = 'crystord-home-emphasis'
const COMPUTE_BADGES_KEY = 'crystord-compute-badges'
const LEFT_RAIL_COLLAPSED_KEY = 'crystord-left-rail-collapsed'
const RIGHT_RAIL_COLLAPSED_KEY = 'crystord-right-rail-collapsed'

function readHomeEmphasis(): HomeEmphasis {
  try {
    const stored = localStorage.getItem(HOME_EMPHASIS_KEY)
    if (stored === 'compute' || stored === 'relationship') return stored
  } catch {
    // localStorage unavailable
  }
  return DEFAULT_HOME_EMPHASIS
}

function readComputeBadges(): ComputeBadges {
  try {
    const stored = localStorage.getItem(COMPUTE_BADGES_KEY)
    if (stored === 'always' || stored === 'onDemand') return stored
  } catch {
    // localStorage unavailable
  }
  return DEFAULT_COMPUTE_BADGES
}

function readLeftRailCollapsed(): boolean {
  try {
    return localStorage.getItem(LEFT_RAIL_COLLAPSED_KEY) === 'true'
  } catch {
    // localStorage unavailable
  }
  return DEFAULT_LEFT_RAIL_COLLAPSED
}

function readRightRailCollapsed(): boolean {
  try {
    return localStorage.getItem(RIGHT_RAIL_COLLAPSED_KEY) === 'true'
  } catch {
    // localStorage unavailable
  }
  return DEFAULT_RIGHT_RAIL_COLLAPSED
}

export function usePreferences(): WorkspacePreferences {
  const [homeEmphasis, setHomeEmphasis] = useState<HomeEmphasis>(readHomeEmphasis)
  const [computeBadges, setComputeBadges] = useState<ComputeBadges>(readComputeBadges)
  const [leftRailCollapsed, setLeftRailCollapsed] = useState<boolean>(readLeftRailCollapsed)
  const [rightRailCollapsed, setRightRailCollapsed] = useState<boolean>(readRightRailCollapsed)

  useEffect(() => {
    try {
      localStorage.setItem(HOME_EMPHASIS_KEY, homeEmphasis)
    } catch {
      // localStorage unavailable
    }
  }, [homeEmphasis])

  useEffect(() => {
    try {
      localStorage.setItem(COMPUTE_BADGES_KEY, computeBadges)
    } catch {
      // localStorage unavailable
    }
  }, [computeBadges])

  useEffect(() => {
    try {
      localStorage.setItem(LEFT_RAIL_COLLAPSED_KEY, String(leftRailCollapsed))
    } catch {
      // localStorage unavailable
    }
  }, [leftRailCollapsed])

  useEffect(() => {
    try {
      localStorage.setItem(RIGHT_RAIL_COLLAPSED_KEY, String(rightRailCollapsed))
    } catch {
      // localStorage unavailable
    }
  }, [rightRailCollapsed])

  return useMemo(
    () => ({ homeEmphasis, computeBadges, leftRailCollapsed, rightRailCollapsed, setHomeEmphasis, setComputeBadges, setLeftRailCollapsed, setRightRailCollapsed }),
    [homeEmphasis, computeBadges, leftRailCollapsed, rightRailCollapsed],
  )
}
