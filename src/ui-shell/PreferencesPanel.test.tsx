import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PreferencesPanel } from './PreferencesPanel'
import { WorkspaceProvider, type WorkspaceContextValue } from './workspace-context'
import type { WorkspacePreferences } from './use-preferences'

const mockSetMode = vi.fn()
let themeMode = 'system'

vi.mock('../styles/ThemeProvider', () => ({
  useTheme: () => ({ mode: themeMode, setMode: mockSetMode }),
}))

function makePreferences(overrides: Partial<WorkspacePreferences> = {}): WorkspacePreferences {
  return {
    homeEmphasis: 'compute',
    computeBadges: 'always',
    leftRailCollapsed: false,
    rightRailCollapsed: false,
    setHomeEmphasis: vi.fn(),
    setComputeBadges: vi.fn(),
    setLeftRailCollapsed: vi.fn(),
    setRightRailCollapsed: vi.fn(),
    ...overrides,
  }
}

function renderPanel(preferences: WorkspacePreferences, onClose = vi.fn()) {
  const value: WorkspaceContextValue = {
    selection: { selectedAtomId: null, selectedAtom: null, select: vi.fn() },
    workingSet: { atoms: [], filter: { labels: [], categories: [] }, onFilterChange: vi.fn() },
    preferences,
  }
  render(
    <WorkspaceProvider value={value}>
      <PreferencesPanel onClose={onClose} />
    </WorkspaceProvider>,
  )
  return onClose
}

beforeEach(() => {
  themeMode = 'system'
  mockSetMode.mockClear()
})

describe('PreferencesPanel dialog', () => {
  it('renders an accessible modal titled Preferences', () => {
    renderPanel(makePreferences())
    const dialog = screen.getByRole('dialog', { name: 'Preferences' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('closes via the close button', async () => {
    const onClose = renderPanel(makePreferences())
    await userEvent.click(screen.getByRole('button', { name: 'Close preferences' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes via a backdrop click', async () => {
    const onClose = vi.fn()
    renderPanel(makePreferences(), onClose)
    await userEvent.click(document.querySelector('[aria-hidden="true"]') as HTMLElement)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes on Escape (shared modal focus management)', async () => {
    const onClose = renderPanel(makePreferences())
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('PreferencesPanel theme control', () => {
  it('checks the radio matching the current theme mode', () => {
    themeMode = 'dark'
    renderPanel(makePreferences())
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Auto' })).not.toBeChecked()
  })

  it('sets the theme mode when another radio is chosen', async () => {
    renderPanel(makePreferences())
    await userEvent.click(screen.getByRole('radio', { name: 'Light' }))
    expect(mockSetMode).toHaveBeenCalledWith('light')
  })
})

describe('PreferencesPanel workspace preferences (EPIC-260066 contract)', () => {
  it('reflects the current homeEmphasis and writes the other on change', async () => {
    const preferences = makePreferences({ homeEmphasis: 'compute' })
    renderPanel(preferences)
    expect(screen.getByRole('radio', { name: 'Compute (Flow first)' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: 'Relationships (Network first)' }))
    expect(preferences.setHomeEmphasis).toHaveBeenCalledWith('relationship')
  })

  it('explains that the emphasis takes effect on the next workspace load', () => {
    renderPanel(makePreferences())
    expect(screen.getByText('Takes effect the next time the workspace loads.')).toBeInTheDocument()
  })

  it('reflects the current computeBadges and writes the other on change', async () => {
    const preferences = makePreferences({ computeBadges: 'onDemand' })
    renderPanel(preferences)
    expect(screen.getByRole('radio', { name: 'Selected atom only' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: 'Always' }))
    expect(preferences.setComputeBadges).toHaveBeenCalledWith('always')
  })
})
