import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GraphViewTabs } from './GraphViewTabs'
import type { ViewDescriptor } from './slots/slot-types'

// `help` is required on every descriptor since EPIC-260080 (C2) — the tab strip ignores it.
const stubHelp = { summary: 'Stub summary.', body: [{ kind: 'paragraph' as const, text: 'Stub body.' }] }

const tabViews: ViewDescriptor[] = [
  { id: 'network', label: 'Network', help: stubHelp, Component: () => null },
  { id: 'flow', label: 'Flow', help: stubHelp, Component: () => null },
]

describe('GraphViewTabs', () => {
  it('renders both Network and Flow tabs', () => {
    render(<GraphViewTabs views={tabViews} activeView="network" onViewChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: 'Network' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Flow' })).toBeInTheDocument()
  })

  it('marks Network tab as selected when Network is active', () => {
    render(<GraphViewTabs views={tabViews} activeView="network" onViewChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: 'Network' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Flow' })).toHaveAttribute('aria-selected', 'false')
  })

  it('marks Flow tab as selected when Flow is active', () => {
    render(<GraphViewTabs views={tabViews} activeView="flow" onViewChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: 'Flow' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Network' })).toHaveAttribute('aria-selected', 'false')
  })

  it('calls onViewChange with "flow" when Flow tab is clicked', async () => {
    const onViewChange = vi.fn()
    render(<GraphViewTabs views={tabViews} activeView="network" onViewChange={onViewChange} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Flow' }))
    expect(onViewChange).toHaveBeenCalledWith('flow')
  })

  it('calls onViewChange with "network" when Network tab is clicked', async () => {
    const onViewChange = vi.fn()
    render(<GraphViewTabs views={tabViews} activeView="flow" onViewChange={onViewChange} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Network' }))
    expect(onViewChange).toHaveBeenCalledWith('network')
  })

  it('tabs are rendered inside a tablist container', () => {
    render(<GraphViewTabs views={tabViews} activeView="network" onViewChange={vi.fn()} />)
    expect(screen.getByRole('tablist')).toBeInTheDocument()
  })

  it('active tab has tabIndex 0 and inactive tab has tabIndex -1', () => {
    render(<GraphViewTabs views={tabViews} activeView="network" onViewChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: 'Network' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'Flow' })).toHaveAttribute('tabindex', '-1')
  })

  it('each tab has aria-controls pointing to the tabpanel', () => {
    render(<GraphViewTabs views={tabViews} activeView="network" onViewChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: 'Network' })).toHaveAttribute('aria-controls', 'tabpanel-graph')
    expect(screen.getByRole('tab', { name: 'Flow' })).toHaveAttribute('aria-controls', 'tabpanel-graph')
  })

  it('tabs have stable IDs for panel linkage', () => {
    render(<GraphViewTabs views={tabViews} activeView="network" onViewChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: 'Network' })).toHaveAttribute('id', 'tab-network')
    expect(screen.getByRole('tab', { name: 'Flow' })).toHaveAttribute('id', 'tab-flow')
  })

  it('ArrowRight on tablist calls onViewChange with next view', () => {
    const onViewChange = vi.fn()
    render(<GraphViewTabs views={tabViews} activeView="network" onViewChange={onViewChange} />)
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' })
    expect(onViewChange).toHaveBeenCalledWith('flow')
  })

  it('ArrowLeft on tablist calls onViewChange with previous view', () => {
    const onViewChange = vi.fn()
    render(<GraphViewTabs views={tabViews} activeView="flow" onViewChange={onViewChange} />)
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowLeft' })
    expect(onViewChange).toHaveBeenCalledWith('network')
  })

  it('is driven by the views registry — only renders the views it is given', () => {
    render(<GraphViewTabs views={[{ id: 'flow', label: 'Flow', help: stubHelp, Component: () => null }]} activeView="flow" onViewChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: 'Flow' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Network' })).not.toBeInTheDocument()
  })

  it('ignores non-arrow keys on the tablist', () => {
    const onViewChange = vi.fn()
    render(<GraphViewTabs views={tabViews} activeView="network" onViewChange={onViewChange} />)
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowDown' })
    expect(onViewChange).not.toHaveBeenCalled()
  })
})
