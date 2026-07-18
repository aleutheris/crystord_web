import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { AccountInfo } from '../api-contract'
import { useTheme } from '../styles/ThemeProvider'
import { C_BORDER, C_BORDER_SUBTLE, C_CARD_SHADOW, C_SURFACE, C_TEXT, C_TEXT_MUTED } from '../styles/tokens'

type ThemeMode = 'system' | 'light' | 'dark'

// Mirrors ThemeToggle's cycle/label maps — the menu item replaces the header toggle (ADR-260066).
const THEME_CYCLE: Record<ThemeMode, ThemeMode> = { system: 'light', light: 'dark', dark: 'system' }
const THEME_LABELS: Record<ThemeMode, string> = { system: 'Auto', light: 'Light', dark: 'Dark' }

export interface AccountMenuProps {
  /** The signed-in user's account overview; null while loading or on error (generic header shown). */
  account: AccountInfo | null
  onOpenAccountSettings: () => void
  onOpenWorkspaces: () => void
  onOpenPreferences: () => void
  onSignOut: () => void
}

const menuStyle: CSSProperties = {
  position: 'absolute',
  right: 0,
  top: 'calc(100% + 4px)',
  minWidth: '14rem',
  background: C_SURFACE,
  border: `1px solid ${C_BORDER}`,
  borderRadius: '6px',
  boxShadow: `0 4px 16px ${C_CARD_SHADOW}`,
  padding: '0.25rem 0',
  zIndex: 1000,
}

const itemStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '0.4rem 0.75rem',
  border: 'none',
  background: 'transparent',
  color: C_TEXT,
  fontSize: '0.85rem',
  fontFamily: 'inherit',
  cursor: 'pointer',
}

/**
 * The top-right account menu (ADR-260066 / REQ-FR-260074): one avatar-button dropdown
 * consolidating the former ThemeToggle/Account/Sign-Out header controls. Identity header is
 * non-interactive; Sign Out is pinned last behind a separator. Keyboard follows the WAI-ARIA
 * menu-button pattern: first item focused on open, ArrowUp/Down wrap, Home/End jump, Escape
 * closes and refocuses the trigger; click-outside closes.
 */
export function AccountMenu({ account, onOpenAccountSettings, onOpenWorkspaces, onOpenPreferences, onSignOut }: AccountMenuProps) {
  const { mode, setMode } = useTheme()
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    // The menu renders in the same commit as open=true, so the first item ref is always set.
    if (open) itemsRef.current[0]!.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    function onDocMouseDown(event: MouseEvent) {
      if (!containerRef.current!.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [open])

  function toggleOpen() {
    setActiveIndex(0)
    setOpen((prev) => !prev)
  }

  /** Menu items close the menu before invoking their action (Theme stays open to allow cycling). */
  function closeAnd(action: () => void) {
    return () => {
      setOpen(false)
      action()
    }
  }

  function onMenuKeyDown(event: ReactKeyboardEvent) {
    // The open menu always renders its five items, so the filtered list is never empty.
    const items = itemsRef.current.filter((el): el is HTMLButtonElement => el !== null)
    const current = items.findIndex((el) => el === document.activeElement)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      items[(current + 1) % items.length]!.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      items[(current - 1 + items.length) % items.length]!.focus()
    } else if (event.key === 'Home') {
      event.preventDefault()
      items[0]!.focus()
    } else if (event.key === 'End') {
      event.preventDefault()
      items[items.length - 1]!.focus()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      triggerRef.current!.focus()
    }
  }

  function menuItem(index: number, label: string, onClick: () => void) {
    return (
      <button
        type="button"
        role="menuitem"
        ref={(el) => { itemsRef.current[index] = el }}
        tabIndex={index === activeIndex ? 0 : -1}
        onFocus={() => setActiveIndex(index)}
        style={itemStyle}
        onClick={onClick}
      >
        {label}
      </button>
    )
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        ref={triggerRef}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggleOpen}
        style={{ padding: '0.25rem 0.75rem' }}
      >
        {account ? account.username : 'Account'}
      </button>
      {open && (
        <div role="menu" aria-label="Account menu" style={menuStyle} onKeyDown={onMenuKeyDown}>
          <div style={{ padding: '0.4rem 0.75rem', borderBottom: `1px solid ${C_BORDER_SUBTLE}`, color: C_TEXT_MUTED, fontSize: '0.8rem' }}>
            {account ? `${account.username} · ${account.email}` : 'Account'}
          </div>
          {menuItem(0, `Theme: ${THEME_LABELS[mode]} — switch`, () => setMode(THEME_CYCLE[mode]))}
          {menuItem(1, 'Account settings…', closeAnd(onOpenAccountSettings))}
          {menuItem(2, 'Workspaces…', closeAnd(onOpenWorkspaces))}
          {menuItem(3, 'Preferences…', closeAnd(onOpenPreferences))}
          <div role="separator" style={{ borderTop: `1px solid ${C_BORDER_SUBTLE}`, margin: '0.25rem 0' }} />
          {menuItem(4, 'Sign Out', closeAnd(onSignOut))}
        </div>
      )}
    </div>
  )
}
