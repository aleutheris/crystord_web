import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HelpPanel } from './HelpPanel'

/**
 * Help panel behaviour (ADR-260085 / EPIC-260080 T3).
 *
 * Both content sources are faked, with labels that exist nowhere in the app ('Renamed View').
 * That is the point: heading assertions are written against the *fake* label, so restating a real
 * label as a string literal in the panel fails these tests instead of drifting silently.
 *
 * Nothing here asserts on help prose. Prose accuracy is a human read (ADR-260085 §Verification),
 * not a coverage number.
 */

const fake = vi.hoisted(() => {
  const section = (text: string) => ({ summary: `${text} summary.`, body: [{ kind: 'paragraph' as const, text }] })
  const Component = () => null
  return {
    views: [
      { id: 'alpha', label: 'Renamed View', help: section('Alpha view.'), Component },
      { id: 'beta', label: 'Second View', help: section('Beta view.'), Component },
    ],
    tabs: [{ id: 'gamma', label: 'Renamed Tab', help: section('Gamma tab.'), Component }],
    lenses: [{ id: 'delta', label: 'Renamed Lens', help: section('Delta lens.'), Component }],
    concepts: [{ id: 'epsilon', title: 'Fake Concept', ...section('Epsilon concept.') }],
  }
})

vi.mock('../slots', () => ({
  enabledViews: fake.views,
  inspectorTabs: fake.tabs,
  navigators: fake.lenses,
}))

vi.mock('../../help', () => ({ helpConcepts: fake.concepts }))

function renderPanel(activeView = 'alpha', onClose = vi.fn()) {
  render(<HelpPanel activeView={activeView} onClose={onClose} />)
  return onClose
}

describe('HelpPanel dialog semantics', () => {
  it('renders an accessible modal named Help', () => {
    renderPanel()
    const dialog = screen.getByRole('dialog', { name: 'Help' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('closes via the close button, the backdrop, and Escape', async () => {
    const onClose = renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Close help' }))
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
    onClose.mockClear()

    // The backdrop is the aria-hidden sibling that sits behind the dialog.
    const { container } = render(<HelpPanel activeView="alpha" onClose={onClose} />)
    await userEvent.click(container.querySelector('[aria-hidden="true"]')!)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('moves focus into the dialog and restores it to the trigger on close', () => {
    function Harness({ open }: { open: boolean }) {
      return (
        <>
          <button type="button" aria-label="Help">?</button>
          {open && <HelpPanel activeView="alpha" onClose={vi.fn()} />}
        </>
      )
    }
    const { rerender } = render(<Harness open={false} />)
    const trigger = screen.getByRole('button', { name: 'Help' })
    trigger.focus()

    rerender(<Harness open />)
    expect(screen.getByRole('dialog', { name: 'Help' }).contains(document.activeElement)).toBe(true)

    rerender(<Harness open={false} />)
    expect(document.activeElement).toBe(trigger)
  })

  // The prose has no focusable children and the modal traps Tab, so without an explicit stop on
  // the scroller a keyboard-only reader cannot scroll past the fold of any section.
  it('exposes the scrolling body as a focusable, labelled region', () => {
    renderPanel()
    const body = screen.getByRole('region', { name: 'Help content' })
    expect(body).toHaveAttribute('tabindex', '0')
  })
})

describe('HelpPanel content', () => {
  it('heads each section with the descriptor label, never a literal of its own', () => {
    renderPanel()
    for (const label of ['Renamed View', 'Second View', 'Renamed Tab', 'Renamed Lens', 'Fake Concept']) {
      expect(screen.getByRole('heading', { level: 4, name: label })).toBeInTheDocument()
    }
    // Every surface here is faked, so a hard-coded real label anywhere in the panel would show up.
    const dialog = screen.getByRole('dialog', { name: 'Help' })
    for (const shipped of ['Network', 'Flow', 'Table', 'Board', 'Details', 'Classify', 'Compute']) {
      expect(dialog.textContent).not.toContain(shipped)
    }
  })

  it('skips a group heading entirely when nothing is registered for it', () => {
    // Restore in a `finally` rather than after the assertions: a failure above would otherwise
    // leave the shared fake registry empty and cascade into every later test in this file.
    const lenses = [...fake.lenses]
    try {
      fake.lenses.length = 0
      renderPanel()
      expect(screen.queryByText('Explorer lenses')).not.toBeInTheDocument()
    } finally {
      fake.lenses.splice(0, fake.lenses.length, ...lenses)
    }
  })
})

describe('HelpPanel contextual open (EPIC-260080 bullet 6)', () => {
  let scrollIntoView: ReturnType<typeof vi.fn>

  beforeEach(() => {
    scrollIntoView = vi.fn()
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: scrollIntoView, configurable: true, writable: true })
  })

  afterEach(() => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
  })

  it('opens on the active view’s section, and falls back to the first entry for an unknown view', () => {
    const { unmount } = render(<HelpPanel activeView="beta" onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Second View' })).toHaveAttribute('aria-current', 'true')
    expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById('help-views-beta'))
    unmount()

    render(<HelpPanel activeView="not-a-view" onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Fake Concept' })).toHaveAttribute('aria-current', 'true')
  })

  it('scrolls on every contents click, including back to the section already current', async () => {
    renderPanel('beta')
    const current = screen.getByRole('button', { name: 'Second View' })
    scrollIntoView.mockClear()

    // Re-selecting the current entry used to be a dead click: the scroll lived in an effect keyed
    // on state that did not change.
    await userEvent.click(current)
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(document.getElementById('help-views-beta'))

    await userEvent.click(screen.getByRole('button', { name: 'Renamed Lens' }))
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(document.getElementById('help-lenses-delta'))
    expect(screen.getByRole('button', { name: 'Renamed Lens' })).toHaveAttribute('aria-current', 'true')
  })
})
