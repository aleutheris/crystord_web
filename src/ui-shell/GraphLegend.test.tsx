import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GraphLegend } from './GraphLegend'

describe('GraphLegend', () => {
  it('renders the legend toggle button', () => {
    render(<GraphLegend view="network" />)
    expect(screen.getByRole('button', { name: /legend/i })).toBeInTheDocument()
  })

  it('is expanded by default', () => {
    render(<GraphLegend view="network" />)
    expect(screen.getByRole('button', { name: /legend/i })).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows node, edge, and connector entries for Network view', () => {
    render(<GraphLegend view="network" />)
    expect(screen.getByText(/Circle = atom/)).toBeInTheDocument()
    expect(screen.getByText(/bond \(relationship\)/)).toBeInTheDocument()
    expect(screen.getByText(/Drag to create a relationship/)).toBeInTheDocument()
  })

  it('shows rectangle node entry for Flow view', () => {
    render(<GraphLegend view="flow" />)
    expect(screen.getByText(/Rectangle = atom/)).toBeInTheDocument()
  })

  it('does not show connector entry for Flow view', () => {
    render(<GraphLegend view="flow" />)
    expect(screen.queryByText(/Drag to create/)).not.toBeInTheDocument()
  })

  it('collapses the legend body when toggle is clicked', async () => {
    render(<GraphLegend view="network" />)
    await userEvent.click(screen.getByRole('button', { name: /legend/i }))
    expect(screen.getByRole('button', { name: /legend/i })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(/Circle = atom/)).not.toBeInTheDocument()
  })

  it('re-expands when toggle is clicked again', async () => {
    render(<GraphLegend view="network" />)
    await userEvent.click(screen.getByRole('button', { name: /legend/i }))
    await userEvent.click(screen.getByRole('button', { name: /legend/i }))
    expect(screen.getByText(/Circle = atom/)).toBeInTheDocument()
  })

  it('shows selected-state description', () => {
    render(<GraphLegend view="flow" />)
    expect(screen.getByText(/Bold outline/)).toBeInTheDocument()
  })

  it('falls back to a generic node label for an unknown view', () => {
    render(<GraphLegend view="table" />)
    expect(screen.getByText('Atom (data entity)')).toBeInTheDocument()
  })
})
