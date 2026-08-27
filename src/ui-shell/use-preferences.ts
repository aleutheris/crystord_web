import { useCallback, useEffect, useMemo, useState } from 'react'

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
 * - `computeBadges`: `always` → status badges on every computed atom; `onDemand` → only on
 *   the currently selected atom (semantics fixed by ADR-260065 / EPIC-260069).
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
  leftRailWidth: number
  setHomeEmphasis: (value: HomeEmphasis) => void
  setComputeBadges: (value: ComputeBadges) => void
  setLeftRailCollapsed: (value: boolean) => void
  setRightRailCollapsed: (value: boolean) => void
  setLeftRailWidth: (value: number) => void
}

export const DEFAULT_HOME_EMPHASIS: HomeEmphasis = 'compute'
export const DEFAULT_COMPUTE_BADGES: ComputeBadges = 'always'
export const DEFAULT_LEFT_RAIL_COLLAPSED = false
export const DEFAULT_RIGHT_RAIL_COLLAPSED = false
export const DEFAULT_LEFT_RAIL_WIDTH = 240
export const LEFT_RAIL_MIN_WIDTH = 200
export const LEFT_RAIL_MAX_WIDTH = 480

const HOME_EMPHASIS_KEY = 'crystord-home-emphasis'
const COMPUTE_BADGES_KEY = 'crystord-compute-badges'
const LEFT_RAIL_COLLAPSED_KEY = 'crystord-left-rail-collapsed'
const RIGHT_RAIL_COLLAPSED_KEY = 'crystord-right-rail-collapsed'
const LEFT_RAIL_WIDTH_KEY = 'crystord-left-rail-width'

/**
 * The viewport-capped effective maximum: 60% of the viewport, floored at LEFT_RAIL_MIN_WIDTH and
 * ceilinged at LEFT_RAIL_MAX_WIDTH (EPIC-260077 / ADR-260073). Exposed so callers that need
 * "what's the real max right now" (aria-valuemax, the End key) read the same number
 * `clampLeftRailWidth` enforces, instead of hand-duplicating the formula against the fixed
 * `LEFT_RAIL_MAX_WIDTH` constant.
 */
export function getLeftRailEffectiveMaxWidth(viewportWidth: number): number {
  return Math.max(LEFT_RAIL_MIN_WIDTH, Math.min(LEFT_RAIL_MAX_WIDTH, viewportWidth * 0.6))
}

/**
 * Bounds a candidate rail width to [MIN, effective max] (EPIC-260077 / ADR-260073). The single
 * source of truth for validity — read, drag, keyboard-step, and reset all funnel through this so
 * they cannot disagree on what width is allowed.
 */
export function clampLeftRailWidth(width: number, viewportWidth: number): number {
  return Math.min(Math.max(width, LEFT_RAIL_MIN_WIDTH), getLeftRailEffectiveMaxWidth(viewportWidth))
}

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

function readLeftRailWidth(): number {
  try {
    const stored = localStorage.getItem(LEFT_RAIL_WIDTH_KEY)
    const parsed = stored === null || stored.trim() === '' ? NaN : Number(stored)
    if (Number.isFinite(parsed)) return clampLeftRailWidth(parsed, window.innerWidth)
  } catch {
    // localStorage unavailable
  }
  return clampLeftRailWidth(DEFAULT_LEFT_RAIL_WIDTH, window.innerWidth)
}

export function usePreferences(): WorkspacePreferences {
  const [homeEmphasis, setHomeEmphasis] = useState<HomeEmphasis>(readHomeEmphasis)
  const [computeBadges, setComputeBadges] = useState<ComputeBadges>(readComputeBadges)
  const [leftRailCollapsed, setLeftRailCollapsed] = useState<boolean>(readLeftRailCollapsed)
  const [rightRailCollapsed, setRightRailCollapsed] = useState<boolean>(readRightRailCollapsed)
  const [leftRailWidth, setLeftRailWidthRaw] = useState<number>(readLeftRailWidth)
  const setLeftRailWidth = useCallback(
    (value: number) => setLeftRailWidthRaw(clampLeftRailWidth(value, window.innerWidth)),
    [],
  )

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

  useEffect(() => {
    try {
      localStorage.setItem(LEFT_RAIL_WIDTH_KEY, String(leftRailWidth))
    } catch {
      // localStorage unavailable
    }
  }, [leftRailWidth])

  return useMemo(
    () => ({
      homeEmphasis,
      computeBadges,
      leftRailCollapsed,
      rightRailCollapsed,
      leftRailWidth,
      setHomeEmphasis,
      setComputeBadges,
      setLeftRailCollapsed,
      setRightRailCollapsed,
      setLeftRailWidth,
    }),
    [homeEmphasis, computeBadges, leftRailCollapsed, rightRailCollapsed, leftRailWidth, setLeftRailWidth],
  )
}
