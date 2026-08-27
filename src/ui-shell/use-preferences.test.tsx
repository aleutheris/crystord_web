import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePreferences, clampLeftRailWidth, getLeftRailEffectiveMaxWidth, DEFAULT_LEFT_RAIL_WIDTH, LEFT_RAIL_MIN_WIDTH, LEFT_RAIL_MAX_WIDTH } from './use-preferences'

describe('usePreferences', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to compute emphasis and always-on badges (Q3 lean)', () => {
    const { result } = renderHook(() => usePreferences())
    expect(result.current.homeEmphasis).toBe('compute')
    expect(result.current.computeBadges).toBe('always')
  })

  it('persists homeEmphasis to localStorage and reflects the new value', () => {
    const { result } = renderHook(() => usePreferences())
    act(() => result.current.setHomeEmphasis('relationship'))
    expect(result.current.homeEmphasis).toBe('relationship')
    expect(localStorage.getItem('crystord-home-emphasis')).toBe('relationship')
  })

  it('reads a previously stored preference on mount', () => {
    localStorage.setItem('crystord-compute-badges', 'onDemand')
    const { result } = renderHook(() => usePreferences())
    expect(result.current.computeBadges).toBe('onDemand')
  })

  it('falls back to the default for an invalid stored value', () => {
    localStorage.setItem('crystord-home-emphasis', 'bogus')
    const { result } = renderHook(() => usePreferences())
    expect(result.current.homeEmphasis).toBe('compute')
  })

  it('defaults leftRailCollapsed to false and persists toggles', () => {
    const { result } = renderHook(() => usePreferences())
    expect(result.current.leftRailCollapsed).toBe(false)
    act(() => result.current.setLeftRailCollapsed(true))
    expect(result.current.leftRailCollapsed).toBe(true)
    expect(localStorage.getItem('crystord-left-rail-collapsed')).toBe('true')
  })

  it('defaults rightRailCollapsed to false and persists toggles', () => {
    const { result } = renderHook(() => usePreferences())
    expect(result.current.rightRailCollapsed).toBe(false)
    act(() => result.current.setRightRailCollapsed(true))
    expect(result.current.rightRailCollapsed).toBe(true)
    expect(localStorage.getItem('crystord-right-rail-collapsed')).toBe('true')
  })

  it('falls back to defaults when localStorage is unavailable (reads throw)', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('localStorage unavailable')
    })
    const { result } = renderHook(() => usePreferences())
    expect(result.current.homeEmphasis).toBe('compute')
    expect(result.current.computeBadges).toBe('always')
    expect(result.current.leftRailCollapsed).toBe(false)
    expect(result.current.rightRailCollapsed).toBe(false)
    expect(result.current.leftRailWidth).toBe(DEFAULT_LEFT_RAIL_WIDTH)
    spy.mockRestore()
  })

  it('defaults leftRailWidth to 240 and persists a resize (EPIC-260077 / ADR-260073)', () => {
    const { result } = renderHook(() => usePreferences())
    expect(result.current.leftRailWidth).toBe(DEFAULT_LEFT_RAIL_WIDTH)
    act(() => result.current.setLeftRailWidth(300))
    expect(result.current.leftRailWidth).toBe(300)
    expect(localStorage.getItem('crystord-left-rail-width')).toBe('300')
  })

  it('clamps a stored width below the minimum on read', () => {
    localStorage.setItem('crystord-left-rail-width', '50')
    const { result } = renderHook(() => usePreferences())
    expect(result.current.leftRailWidth).toBe(LEFT_RAIL_MIN_WIDTH)
  })

  it('falls back to the default for a non-numeric stored width', () => {
    localStorage.setItem('crystord-left-rail-width', 'bogus')
    const { result } = renderHook(() => usePreferences())
    expect(result.current.leftRailWidth).toBe(DEFAULT_LEFT_RAIL_WIDTH)
  })

  it('falls back to the default for an empty-string stored width, not 0', () => {
    localStorage.setItem('crystord-left-rail-width', '')
    const { result } = renderHook(() => usePreferences())
    // Number('') is 0 — a finite, seemingly-valid number that must not sneak past the
    // non-numeric fallback and get silently floored to LEFT_RAIL_MIN_WIDTH instead.
    expect(result.current.leftRailWidth).toBe(DEFAULT_LEFT_RAIL_WIDTH)
  })

  it('clamps the default itself to the viewport when there is no stored value (narrow viewport)', () => {
    const originalInnerWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { value: 300, configurable: true })
    try {
      const { result } = renderHook(() => usePreferences())
      // 60% of 300 = 180, below LEFT_RAIL_MIN_WIDTH — the floor wins, same as clampLeftRailWidth.
      expect(result.current.leftRailWidth).toBe(LEFT_RAIL_MIN_WIDTH)
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true })
    }
  })

  it('clamps setLeftRailWidth to the bounds, not just the persisted read path', () => {
    const { result } = renderHook(() => usePreferences())
    act(() => result.current.setLeftRailWidth(9999))
    expect(result.current.leftRailWidth).toBeLessThanOrEqual(LEFT_RAIL_MAX_WIDTH)
    act(() => result.current.setLeftRailWidth(-100))
    expect(result.current.leftRailWidth).toBe(LEFT_RAIL_MIN_WIDTH)
  })
})

describe('clampLeftRailWidth (EPIC-260077 / ADR-260073)', () => {
  it('passes a valid width through unchanged', () => {
    expect(clampLeftRailWidth(300, 1920)).toBe(300)
  })

  it('raises a width below the minimum up to the minimum', () => {
    expect(clampLeftRailWidth(50, 1920)).toBe(LEFT_RAIL_MIN_WIDTH)
  })

  it('caps a width above the fixed maximum', () => {
    expect(clampLeftRailWidth(9999, 1920)).toBe(LEFT_RAIL_MAX_WIDTH)
  })

  it('caps at 60% of viewport width when that is tighter than the fixed maximum', () => {
    // 60% of 600 = 360, tighter than the 480 fixed max.
    expect(clampLeftRailWidth(450, 600)).toBe(360)
  })

  it('never returns below the minimum even on a very narrow viewport', () => {
    // 60% of 250 = 150, below LEFT_RAIL_MIN_WIDTH — the floor still wins.
    expect(clampLeftRailWidth(300, 250)).toBe(LEFT_RAIL_MIN_WIDTH)
  })
})

describe('getLeftRailEffectiveMaxWidth (EPIC-260077 / ADR-260073)', () => {
  it('returns the fixed maximum on a wide viewport', () => {
    expect(getLeftRailEffectiveMaxWidth(1920)).toBe(LEFT_RAIL_MAX_WIDTH)
  })

  it('returns 60% of viewport width when that is tighter than the fixed maximum', () => {
    expect(getLeftRailEffectiveMaxWidth(600)).toBe(360)
  })

  it('never returns below the minimum on a very narrow viewport', () => {
    expect(getLeftRailEffectiveMaxWidth(250)).toBe(LEFT_RAIL_MIN_WIDTH)
  })
})
