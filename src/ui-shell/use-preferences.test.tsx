import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePreferences } from './use-preferences'

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
    spy.mockRestore()
  })
})
