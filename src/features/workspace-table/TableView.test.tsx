import { describe, it, expect, vi } from 'vitest'
import type { Mock } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TableView } from './TableView'
import type { Atom, EffectiveAccessLevel } from '../../api-contract'

interface AtomOptions {
  operation?: string | null
  accessLevel?: EffectiveAccessLevel | null
  labels?: string[]
  content?: string
}

function makeAtom(uuid: string, title: string, opts: AtomOptions = {}): Atom {
  return {
    labels: opts.labels ?? ['Project'],
    bonds: [{ uuid: 'bonded-uuid', name: 'DEPENDS_ON', direction: 'from' }],
    accessLevel: opts.accessLevel !== undefined ? opts.accessLevel : 'OWNER',
    properties: {
      shellies: { uuid },
      nuclearies: {
        title,
        description: 'desc',
        content: opts.content ?? `${title} body`,
        operation: opts.operation ?? '',
        constants: { seed: 1 },
      },
    },
  }
}

type UpdateAtomMock = Mock<(uuid: string, atom: Atom) => Promise<void>>

interface RenderOptions {
  loading?: boolean
  error?: string | null
  selectedAtomId?: string | null
  updateAtom?: UpdateAtomMock
}

function renderView(atoms: Atom[], opts: RenderOptions = {}) {
  const updateAtom: UpdateAtomMock = opts.updateAtom ?? vi.fn<(uuid: string, atom: Atom) => Promise<void>>().mockResolvedValue(undefined)
  const onSelectAtom = vi.fn()
  const onCreateAtom = vi.fn()
  render(
    <TableView
      data={{ atoms, loading: opts.loading ?? false, error: opts.error ?? null, updateAtom }}
      selectedAtomId={opts.selectedAtomId ?? null}
      onSelectAtom={onSelectAtom}
      onCreateAtom={onCreateAtom}
      renderMode="full"
    />,
  )
  return { updateAtom, onSelectAtom, onCreateAtom }
}

function dataRows(): HTMLElement[] {
  // Rows minus the header row.
  return screen.getAllByRole('row').slice(1)
}

describe('TableView — structure and sorting (EPIC-260071 T2/T5)', () => {
  it('renders the labelled table with the four MVP column headers', () => {
    renderView([makeAtom('u1', 'Alpha')])
    expect(screen.getByRole('table', { name: 'Atoms table' })).toBeInTheDocument()
    for (const header of ['Title', 'Labels', 'Content', 'Computed']) {
      expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument()
    }
  })

  it('renders one row per atom, sorted by title A–Z case-insensitively', () => {
    renderView([makeAtom('u1', 'banana'), makeAtom('u2', 'Apple'), makeAtom('u3', 'cherry')])
    const titles = dataRows().map((row) => within(row).getAllByRole('cell')[0]!.textContent)
    expect(titles).toEqual(['Apple', 'banana', 'cherry'])
  })

  it('calls onCreateAtom from the toolbar Create Atom button', async () => {
    const user = userEvent.setup()
    const { onCreateAtom } = renderView([makeAtom('u1', 'Alpha')])
    await user.click(screen.getByRole('button', { name: 'Create atom' }))
    expect(onCreateAtom).toHaveBeenCalledOnce()
  })

  it('marks computed atoms with the ƒ indicator; plain atoms stay unmarked', () => {
    renderView([
      makeAtom('u1', 'Alpha'),
      makeAtom('u2', 'Sum', { operation: '{"name":"SUM","args":[]}' }),
    ])
    expect(screen.getAllByLabelText('Computed atom')).toHaveLength(1)
    const sumRow = dataRows()[1]!
    expect(within(sumRow).getByLabelText('Computed atom')).toHaveTextContent('ƒ')
  })
})

describe('TableView — shared selection (ADR-260062 D2)', () => {
  it('selects an atom on row click', async () => {
    const user = userEvent.setup()
    const { onSelectAtom } = renderView([makeAtom('u1', 'Alpha'), makeAtom('u2', 'Beta')])
    await user.click(within(dataRows()[1]!).getAllByRole('cell')[3]!)
    expect(onSelectAtom).toHaveBeenCalledWith('u2')
  })

  it('reflects selectedAtomId as aria-current on the matching row only', () => {
    // aria-current, not aria-selected: rows of a static table are not a selectable composite,
    // so aria-selected would be inert for assistive tech (SearchResultPanel precedent).
    renderView([makeAtom('u1', 'Alpha'), makeAtom('u2', 'Beta')], { selectedAtomId: 'u2' })
    const [alphaRow, betaRow] = dataRows()
    expect(alphaRow).not.toHaveAttribute('aria-current')
    expect(betaRow).toHaveAttribute('aria-current', 'true')
  })

  it('label gestures do not double as row selection', async () => {
    const user = userEvent.setup()
    const { onSelectAtom } = renderView([makeAtom('u1', 'Alpha', { labels: ['Project', 'Urgent'] })])
    await user.click(screen.getByRole('button', { name: 'Remove Urgent' }))
    await user.click(screen.getByLabelText('Add label'))
    expect(onSelectAtom).not.toHaveBeenCalled()
  })
})

describe('TableView — inline title/content edit (EPIC-260071 T3 / ADR-260062 D3)', () => {
  it('commits a title edit through updateAtom with only the title replaced', async () => {
    const user = userEvent.setup()
    const alpha = makeAtom('u1', 'Alpha')
    const { updateAtom } = renderView([alpha])

    await user.click(screen.getByRole('button', { name: 'Edit title of Alpha' }))
    const input = screen.getByLabelText('Edit title of Alpha')
    await user.clear(input)
    await user.type(input, 'Alpha II')
    await user.keyboard('{Enter}')

    expect(updateAtom).toHaveBeenCalledOnce()
    const [uuid, updated] = updateAtom.mock.calls[0]! as [string, Atom]
    expect(uuid).toBe('u1')
    // Deep-spread preserves labels, bonds, uuid, operation, and constants (single mutation path).
    expect(updated).toEqual({
      ...alpha,
      properties: {
        ...alpha.properties,
        nuclearies: { ...alpha.properties.nuclearies, title: 'Alpha II' },
      },
    })
  })

  it('commits a content edit through updateAtom with only the content replaced', async () => {
    const user = userEvent.setup()
    const alpha = makeAtom('u1', 'Alpha')
    const { updateAtom } = renderView([alpha])

    await user.click(screen.getByRole('button', { name: 'Edit content of Alpha' }))
    const textarea = screen.getByLabelText('Edit content of Alpha')
    await user.clear(textarea)
    await user.type(textarea, 'New body')
    await user.keyboard('{Control>}{Enter}{/Control}')

    const [, updated] = updateAtom.mock.calls[0]! as [string, Atom]
    expect(updated.properties.nuclearies.content).toBe('New body')
    expect(updated.properties.nuclearies.title).toBe('Alpha')
  })

  it('cancels a title edit on Escape without mutating', async () => {
    const user = userEvent.setup()
    const { updateAtom } = renderView([makeAtom('u1', 'Alpha')])

    await user.click(screen.getByRole('button', { name: 'Edit title of Alpha' }))
    await user.type(screen.getByLabelText('Edit title of Alpha'), ' draft')
    await user.keyboard('{Escape}')

    expect(updateAtom).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Edit title of Alpha' })).toBeInTheDocument()
  })

  it('starting an edit does not double as row selection', async () => {
    const user = userEvent.setup()
    const { onSelectAtom } = renderView([makeAtom('u1', 'Alpha')])
    await user.click(screen.getByRole('button', { name: 'Edit title of Alpha' }))
    expect(onSelectAtom).not.toHaveBeenCalled()
  })

  it('renders computed content read-only — Compute owns it (title stays editable)', () => {
    renderView([makeAtom('u1', 'Sum', { operation: '{"name":"SUM"}', content: '42' })])
    expect(screen.queryByRole('button', { name: 'Edit content of Sum' })).not.toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit title of Sum' })).toBeInTheDocument()
  })
})

describe('TableView — access-level gating (ADR-260059 / REQ-FR-260069)', () => {
  it('a VIEWER atom exposes no edit affordances — plain text cells only', () => {
    renderView([makeAtom('u1', 'Alpha', { accessLevel: 'VIEWER', labels: ['A', 'B'] })])
    expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Add label')).not.toBeInTheDocument()
    expect(screen.getByText('A, B')).toBeInTheDocument()
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Alpha body')).toBeInTheDocument()
  })

  it('a missing access level defaults to read-only', () => {
    renderView([makeAtom('u1', 'Alpha', { accessLevel: null })])
    expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument()
  })

  it('an EDITOR atom is editable', () => {
    renderView([makeAtom('u1', 'Alpha', { accessLevel: 'EDITOR' })])
    expect(screen.getByRole('button', { name: 'Edit title of Alpha' })).toBeInTheDocument()
  })
})

describe('TableView — labels cell via shared LabelChipEditor (EPIC-260071 T4)', () => {
  it('adds a label through updateAtom, preserving the rest of the atom', async () => {
    const user = userEvent.setup()
    const alpha = makeAtom('u1', 'Alpha', { labels: ['Project'] })
    const { updateAtom, onSelectAtom } = renderView([alpha])

    // Focus without clicking so the row-click path stays out of the picture.
    screen.getByLabelText('Add label').focus()
    await user.keyboard('Urgent{Enter}')

    expect(updateAtom).toHaveBeenCalledOnce()
    const [uuid, updated] = updateAtom.mock.calls[0]! as [string, Atom]
    expect(uuid).toBe('u1')
    expect(updated).toEqual({ ...alpha, labels: ['Project', 'Urgent'] })
    // The Enter that committed the chip must not select the row (row keys only fire on the row).
    expect(onSelectAtom).not.toHaveBeenCalled()
  })

  it('removes a label through updateAtom', async () => {
    const user = userEvent.setup()
    const alpha = makeAtom('u1', 'Alpha', { labels: ['Project', 'Urgent'] })
    const { updateAtom } = renderView([alpha])

    await user.click(screen.getByRole('button', { name: 'Remove Urgent' }))

    const [, updated] = updateAtom.mock.calls[0]! as [string, Atom]
    expect(updated.labels).toEqual(['Project'])
  })

  it('surfaces a rejected label update via the inline save-error strip — the table survives', async () => {
    const user = userEvent.setup()
    const updateAtom: UpdateAtomMock = vi.fn<(uuid: string, atom: Atom) => Promise<void>>().mockRejectedValue(new Error('denied'))
    renderView([makeAtom('u1', 'Alpha')], { updateAtom })

    await user.type(screen.getByLabelText('Add label'), 'Urgent{Enter}')

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not save the change. Please try again.'))
    expect(screen.getByRole('table', { name: 'Atoms table' })).toBeInTheDocument()
  })

  it('clears the save-error strip on the next successful save', async () => {
    const user = userEvent.setup()
    const updateAtom: UpdateAtomMock = vi.fn<(uuid: string, atom: Atom) => Promise<void>>()
      .mockRejectedValueOnce(new Error('denied'))
      .mockResolvedValue(undefined)
    renderView([makeAtom('u1', 'Alpha')], { updateAtom })

    await user.type(screen.getByLabelText('Add label'), 'Urgent{Enter}')
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())

    await user.type(screen.getByLabelText('Add label'), 'Again{Enter}')
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('locks a row read-only while its save is in flight (full-document write guard)', async () => {
    let resolveSave!: () => void
    const updateAtom: UpdateAtomMock = vi.fn<(uuid: string, atom: Atom) => Promise<void>>(
      () => new Promise<void>((resolve) => { resolveSave = resolve }),
    )
    const user = userEvent.setup()
    renderView([makeAtom('u1', 'Alpha')], { updateAtom })

    screen.getByLabelText('Add label').focus()
    await user.keyboard('Urgent{Enter}')

    // While the save round-trips, no second edit may build a payload from the stale atom
    // (updateAtom is a full-document write — a stale snapshot would revert the first edit).
    expect(dataRows()[0]).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByLabelText('Add label')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument()

    resolveSave()
    await waitFor(() => expect(screen.getByLabelText('Add label')).toBeInTheDocument())
    expect(dataRows()[0]).not.toHaveAttribute('aria-busy')
  })
})

describe('TableView — keyboard row navigation (EPIC-260071 T5)', () => {
  it('moves focus between rows with ArrowDown/ArrowUp and stops at the edges', () => {
    renderView([makeAtom('u1', 'Alpha'), makeAtom('u2', 'Beta')])
    const [first, second] = dataRows() as [HTMLElement, HTMLElement]

    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    expect(second).toHaveFocus()

    fireEvent.keyDown(second, { key: 'ArrowDown' }) // last row — no next sibling
    expect(second).toHaveFocus()

    fireEvent.keyDown(second, { key: 'ArrowUp' })
    expect(first).toHaveFocus()

    fireEvent.keyDown(first, { key: 'ArrowUp' }) // first row — no previous sibling
    expect(first).toHaveFocus()
  })

  it('selects the focused row on Enter', () => {
    const { onSelectAtom } = renderView([makeAtom('u1', 'Alpha')])
    const row = dataRows()[0]!
    row.focus()
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(onSelectAtom).toHaveBeenCalledWith('u1')
  })

  it('leaves unrelated keys on a focused row alone', () => {
    const { onSelectAtom } = renderView([makeAtom('u1', 'Alpha'), makeAtom('u2', 'Beta')])
    const row = dataRows()[0]!
    row.focus()
    fireEvent.keyDown(row, { key: 'a' })
    expect(row).toHaveFocus()
    expect(onSelectAtom).not.toHaveBeenCalled()
  })

  it('ignores keys bubbling out of cell editors — arrows keep editing meaning', () => {
    const { onSelectAtom } = renderView([makeAtom('u1', 'Alpha'), makeAtom('u2', 'Beta')])
    const labelInput = within(dataRows()[0]!).getByLabelText('Add label')
    labelInput.focus()
    fireEvent.keyDown(labelInput, { key: 'ArrowDown' })
    fireEvent.keyDown(labelInput, { key: 'Enter' })
    expect(labelInput).toHaveFocus()
    expect(onSelectAtom).not.toHaveBeenCalled()
  })
})

describe('TableView — empty, loading, and error states (EPIC-260071 T5)', () => {
  it('replaces the table with a message when there are no atoms', () => {
    renderView([])
    expect(screen.getByText('No atoms in the current results. Run a search to populate the table.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    // Creating the first atom must remain possible.
    expect(screen.getByRole('button', { name: 'Create atom' })).toBeInTheDocument()
  })

  it('shows the loading state only before any rows exist', () => {
    renderView([], { loading: true })
    expect(screen.getByText('Loading atoms…')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('keeps the table mounted during a refetch — no full-screen loading swap', () => {
    // Every save triggers a refetch (loading=true); unmounting the table would reset scroll,
    // drop focus, and destroy in-progress cell drafts on every single commit.
    renderView([makeAtom('u1', 'Alpha')], { loading: true })
    expect(screen.getByRole('table', { name: 'Atoms table' })).toBeInTheDocument()
    expect(screen.queryByText('Loading atoms…')).not.toBeInTheDocument()
  })

  it('announces a load error via role="alert"', () => {
    renderView([], { error: 'Failed to load graph data' })
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load graph data')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows a data-layer error inline above the table once rows exist', () => {
    // Mutation failures land in GraphData.error (e.g. AU-UNAUTHORIZED) — they must not
    // replace the table with a dead-end full-screen alert.
    renderView([makeAtom('u1', 'Alpha')], { error: "You don't have access to do that." })
    expect(screen.getByRole('alert')).toHaveTextContent("You don't have access to do that.")
    expect(screen.getByRole('table', { name: 'Atoms table' })).toBeInTheDocument()
  })
})
