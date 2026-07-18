import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HistoryTab } from './HistoryTab'
import type { Atom, ChangeEvent } from '../../api-contract'
import type { AtomChangesState } from './use-atom-changes'

const mockUseAtomChanges = vi.fn()

vi.mock('./use-atom-changes', () => ({
  useAtomChanges: (uuid: string) => mockUseAtomChanges(uuid) as AtomChangesState,
}))

function makeAtom(): Atom {
  return {
    labels: ['Project'],
    bonds: [],
    accessLevel: 'OWNER',
    properties: {
      shellies: { uuid: 'atom-1' },
      nuclearies: { title: 'Alpha', description: '', content: '', operation: null, constants: null },
    },
  }
}

function makeEvent(overrides?: Partial<ChangeEvent>): ChangeEvent {
  return {
    timestamp: '2026-07-01T10:00:00Z',
    eventType: 'UPDATE',
    userId: 'user-1234-5678-abcd',
    remark: 'tightened the title',
    propertyChanges: [
      { field: 'title', oldValue: 'Alpha', newValue: 'Alpha v2', metrics: null },
    ],
    ...overrides,
  }
}

function state(overrides?: Partial<AtomChangesState>): AtomChangesState {
  return {
    events: [makeEvent()],
    loading: false,
    error: null,
    endReached: true,
    loadMore: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  mockUseAtomChanges.mockReset()
  mockUseAtomChanges.mockReturnValue(state())
})

describe('HistoryTab — event rendering (ADR-260068)', () => {
  it('fetches history for the selected atom and lists events in server order', () => {
    mockUseAtomChanges.mockReturnValue(state({
      events: [
        makeEvent({ timestamp: '2026-07-02T10:00:00Z', remark: 'newest' }),
        makeEvent({ timestamp: '2026-07-01T10:00:00Z', remark: 'older' }),
      ],
    }))
    render(<HistoryTab atom={makeAtom()} />)

    expect(mockUseAtomChanges).toHaveBeenCalledWith('atom-1')
    const items = screen.getByRole('list', { name: 'Change events' }).children
    // Newest-first server order rendered as-is — no client re-sort.
    expect(items[0]!.textContent).toContain('newest')
    expect(items[1]!.textContent).toContain('older')
  })

  it('renders the localized timestamp, the event-type chip, and the italic remark', () => {
    render(<HistoryTab atom={makeAtom()} />)

    expect(screen.getByRole('heading', { name: 'History' })).toBeInTheDocument()
    expect(screen.getByText(new Date('2026-07-01T10:00:00Z').toLocaleString())).toBeInTheDocument()
    expect(screen.getByText('UPDATE')).toBeInTheDocument()
    expect(screen.getByText('tightened the title')).toHaveStyle({ fontStyle: 'italic' })
  })

  it('omits the remark row when the event carries none', () => {
    mockUseAtomChanges.mockReturnValue(state({ events: [makeEvent({ remark: null })] }))
    render(<HistoryTab atom={makeAtom()} />)

    expect(screen.queryByText('tightened the title')).not.toBeInTheDocument()
  })

  it('shows the author id shortened in monospace, with the full id in the tooltip', () => {
    render(<HistoryTab atom={makeAtom()} />)

    const author = screen.getByLabelText('Author id user-1234-5678-abcd')
    expect(author).toHaveTextContent('user-123…')
    expect(author).toHaveAttribute('title', 'user-1234-5678-abcd')
    expect(author).toHaveStyle({ fontFamily: 'monospace' })
  })

  it('leaves a short author id untruncated', () => {
    mockUseAtomChanges.mockReturnValue(state({ events: [makeEvent({ userId: 'u-1' })] }))
    render(<HistoryTab atom={makeAtom()} />)

    expect(screen.getByLabelText('Author id u-1')).toHaveTextContent(/^u-1$/)
  })

  it('renders a property row as field: old → new', () => {
    render(<HistoryTab atom={makeAtom()} />)

    expect(screen.getByText('title')).toBeInTheDocument()
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Alpha v2')).toBeInTheDocument()
    expect(screen.queryByText(/removed/)).not.toBeInTheDocument()
  })

  it('JSON-stringifies non-string values and truncates long ones with a full-value tooltip', () => {
    const longList = ['label-one', 'label-two', 'label-three', 'label-four']
    mockUseAtomChanges.mockReturnValue(state({
      events: [makeEvent({
        propertyChanges: [{ field: 'labels', oldValue: null, newValue: longList, metrics: null }],
      })],
    }))
    render(<HistoryTab atom={makeAtom()} />)

    expect(screen.getByText('null')).toBeInTheDocument()
    const full = JSON.stringify(longList)
    const truncated = screen.getByTitle(full)
    expect(truncated).toHaveTextContent('…')
    expect(truncated.textContent!.length).toBeLessThan(full.length)
  })

  it('renders an absent value as a dash', () => {
    mockUseAtomChanges.mockReturnValue(state({
      events: [makeEvent({
        propertyChanges: [{ field: 'content', oldValue: undefined, newValue: 'fresh', metrics: null }],
      })],
    }))
    render(<HistoryTab atom={makeAtom()} />)

    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('shows the membership metrics line for list-type changes', () => {
    mockUseAtomChanges.mockReturnValue(state({
      events: [makeEvent({
        propertyChanges: [{
          field: 'labels',
          oldValue: ['a'],
          newValue: ['b', 'c'],
          metrics: { removedCount: 1, addedCount: 2, totalMembersAfter: 5 },
        }],
      })],
    }))
    render(<HistoryTab atom={makeAtom()} />)

    expect(screen.getByText('removed 1 · added 2 · 5 total')).toBeInTheDocument()
  })
})

describe('HistoryTab — states and pagination (ADR-260068)', () => {
  it('shows the loading state while a page is in flight', () => {
    mockUseAtomChanges.mockReturnValue(state({ events: [], loading: true }))
    render(<HistoryTab atom={makeAtom()} />)

    expect(screen.getByText('Loading history…')).toBeInTheDocument()
    expect(screen.queryByText('No recorded changes for this atom.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Refresh history')).toBeDisabled()
  })

  it('announces a load failure via role="alert"', () => {
    mockUseAtomChanges.mockReturnValue(state({ events: [], error: 'HISTORY-EXPLODED' }))
    render(<HistoryTab atom={makeAtom()} />)

    expect(screen.getByRole('alert')).toHaveTextContent('HISTORY-EXPLODED')
    expect(screen.queryByText('No recorded changes for this atom.')).not.toBeInTheDocument()
  })

  it('shows the empty state once an empty history has loaded', () => {
    mockUseAtomChanges.mockReturnValue(state({ events: [] }))
    render(<HistoryTab atom={makeAtom()} />)

    expect(screen.getByText('No recorded changes for this atom.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Change events' })).not.toBeInTheDocument()
  })

  it('offers Show more while the end is unproven, and loads the next page on click', async () => {
    const loadMore = vi.fn()
    mockUseAtomChanges.mockReturnValue(state({ endReached: false, loadMore }))
    render(<HistoryTab atom={makeAtom()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Show more' }))
    expect(loadMore).toHaveBeenCalledOnce()
  })

  it('hides Show more once the end is reached', () => {
    render(<HistoryTab atom={makeAtom()} />)

    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument()
  })

  it('the refresh affordance re-fetches from the top', async () => {
    const refresh = vi.fn()
    mockUseAtomChanges.mockReturnValue(state({ refresh }))
    render(<HistoryTab atom={makeAtom()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Refresh history' }))
    expect(refresh).toHaveBeenCalledOnce()
  })
})
