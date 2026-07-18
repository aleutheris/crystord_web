import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccountMenu } from './AccountMenu'
import type { AccountInfo } from '../api-contract'

const mockSetMode = vi.fn()
let themeMode = 'system'

vi.mock('../styles/ThemeProvider', () => ({
  useTheme: () => ({ mode: themeMode, setMode: mockSetMode }),
}))

const ACCOUNT: AccountInfo = {
  username: 'demo.user',
  email: 'demo@crystord.test',
  emailVerified: true,
  authMethods: ['password'],
}

function renderMenu(overrides: Partial<Parameters<typeof AccountMenu>[0]> = {}) {
  const props = {
    account: ACCOUNT,
    onOpenAccountSettings: vi.fn(),
    onOpenWorkspaces: vi.fn(),
    onOpenPreferences: vi.fn(),
    onSignOut: vi.fn(),
    ...overrides,
  }
  render(<AccountMenu {...props} />)
  return props
}

const trigger = () => screen.getByRole('button', { name: 'Account menu' })

beforeEach(() => {
  themeMode = 'system'
  mockSetMode.mockClear()
})

describe('AccountMenu trigger', () => {
  it('shows the username once the account is loaded', () => {
    renderMenu()
    expect(trigger()).toHaveTextContent('demo.user')
  })

  it('shows a generic label before the account loads', () => {
    renderMenu({ account: null })
    expect(trigger()).toHaveTextContent('Account')
  })

  it('is a collapsed menu button (aria-haspopup, aria-expanded=false, no menu)', () => {
    renderMenu()
    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('AccountMenu open/close', () => {
  it('opens the menu on click, expands the trigger, and focuses the first item', async () => {
    renderMenu()
    await userEvent.click(trigger())
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu', { name: 'Account menu' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /^theme:/i })).toHaveFocus()
  })

  it('closes on a second trigger click', async () => {
    renderMenu()
    await userEvent.click(trigger())
    await userEvent.click(trigger())
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes on a click outside the menu', async () => {
    renderMenu()
    await userEvent.click(trigger())
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('stays open on a mousedown inside the menu', async () => {
    renderMenu()
    await userEvent.click(trigger())
    fireEvent.mouseDown(screen.getByRole('menuitem', { name: 'Workspaces…' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })
})

describe('AccountMenu contents (ADR-260066)', () => {
  it('shows the non-interactive identity header (username · email) — not a menuitem', async () => {
    renderMenu()
    await userEvent.click(trigger())
    const header = screen.getByText('demo.user · demo@crystord.test')
    expect(header).not.toHaveAttribute('role')
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).not.toContain('demo.user · demo@crystord.test')
  })

  it('shows a generic identity header while the account is unavailable', async () => {
    renderMenu({ account: null })
    await userEvent.click(trigger())
    const menu = screen.getByRole('menu', { name: 'Account menu' })
    expect(menu).toHaveTextContent('Account')
  })

  it('pins Sign Out last, behind a separator', async () => {
    renderMenu()
    await userEvent.click(trigger())
    const labels = screen.getAllByRole('menuitem').map((el) => el.textContent)
    expect(labels).toEqual(['Theme: Auto — switch', 'Account settings…', 'Workspaces…', 'Preferences…', 'Sign Out'])
    expect(screen.getByRole('separator')).toBeInTheDocument()
  })
})

describe('AccountMenu actions', () => {
  it('Theme cycles the mode and keeps the menu open for further cycling', async () => {
    renderMenu()
    await userEvent.click(trigger())
    await userEvent.click(screen.getByRole('menuitem', { name: 'Theme: Auto — switch' }))
    expect(mockSetMode).toHaveBeenCalledWith('light')
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('Theme cycles dark back to system', async () => {
    themeMode = 'dark'
    renderMenu()
    await userEvent.click(trigger())
    await userEvent.click(screen.getByRole('menuitem', { name: 'Theme: Dark — switch' }))
    expect(mockSetMode).toHaveBeenCalledWith('system')
  })

  it.each([
    ['Account settings…', 'onOpenAccountSettings'],
    ['Workspaces…', 'onOpenWorkspaces'],
    ['Preferences…', 'onOpenPreferences'],
    ['Sign Out', 'onSignOut'],
  ] as const)('%s closes the menu and invokes %s', async (label, handler) => {
    const props = renderMenu()
    await userEvent.click(trigger())
    await userEvent.click(screen.getByRole('menuitem', { name: label }))
    expect(props[handler]).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('AccountMenu keyboard (WAI-ARIA menu pattern)', () => {
  it('ArrowDown moves focus forward and wraps from the last item', async () => {
    renderMenu()
    await userEvent.click(trigger())
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Account settings…' })).toHaveFocus()
    await userEvent.keyboard('{End}{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: /^theme:/i })).toHaveFocus()
  })

  it('ArrowUp moves focus backward and wraps from the first item', async () => {
    renderMenu()
    await userEvent.click(trigger())
    await userEvent.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: 'Sign Out' })).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: 'Preferences…' })).toHaveFocus()
  })

  it('Home and End jump to the first and last item', async () => {
    renderMenu()
    await userEvent.click(trigger())
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('menuitem', { name: 'Sign Out' })).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(screen.getByRole('menuitem', { name: /^theme:/i })).toHaveFocus()
  })

  it('the roving tabIndex keeps exactly one item tabbable', async () => {
    renderMenu()
    await userEvent.click(trigger())
    await userEvent.keyboard('{ArrowDown}')
    const items = screen.getAllByRole('menuitem')
    expect(items.map((el) => el.tabIndex)).toEqual([-1, 0, -1, -1, -1])
  })

  it('Escape closes the menu and refocuses the trigger', async () => {
    renderMenu()
    await userEvent.click(trigger())
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger()).toHaveFocus()
  })

  it('other keys neither move focus nor close the menu', async () => {
    renderMenu()
    await userEvent.click(trigger())
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'a' })
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /^theme:/i })).toHaveFocus()
  })
})
