import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useWorkspace } from './workspace-context'

describe('useWorkspace', () => {
  it('throws when used outside a WorkspaceProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useWorkspace())).toThrow(/within a WorkspaceProvider/)
    spy.mockRestore()
  })
})
