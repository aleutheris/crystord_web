import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClassifyTab } from './ClassifyTab'
import type { Atom, CategoryDimension, CategoryValue } from '../../api-contract'
import type { Taxonomy } from './use-taxonomy'
import { labelColorToken } from '../../styles/label-colors'

const mockUseTaxonomy = vi.fn()
const mockUseLabelSuggestions = vi.fn()

vi.mock('./use-taxonomy', () => ({
  useTaxonomy: (keys: readonly string[]) => mockUseTaxonomy(keys) as Taxonomy,
}))
vi.mock('./use-label-suggestions', () => ({
  useLabelSuggestions: () => mockUseLabelSuggestions() as string[],
}))

function dimension(key: string, displayName: string): CategoryDimension {
  return { key, displayName, description: null, parentDimensionKeys: [], accessLevel: 'OWNER', ownerUsername: 'demo' }
}

function categoryValue(key: string, displayName: string, parentValueKeys: string[] = []): CategoryValue {
  return { key, displayName, description: null, dimensionKey: 'region', parentValueKeys, accessLevel: 'OWNER', ownerUsername: 'demo' }
}

const REGION_VALUES = [
  categoryValue('europe', 'Europe'),
  categoryValue('belgium', 'Belgium', ['europe']),
  categoryValue('germany', 'Germany', ['europe']),
]

function taxonomy(overrides?: Partial<Taxonomy>): Taxonomy {
  return {
    dimensions: [dimension('region', 'Region'), dimension('period', 'Period')],
    valuesByDimension: new Map([['region', REGION_VALUES]]),
    loading: false,
    error: null,
    loadValues: vi.fn(),
    ...overrides,
  }
}

function makeAtom(overrides?: Partial<Atom>): Atom {
  return {
    labels: ['Project'],
    bonds: [],
    accessLevel: 'OWNER',
    categories: [{ dimensionKey: 'region', valueKey: 'belgium' }],
    properties: {
      shellies: { uuid: 'atom-1' },
      nuclearies: { title: 'Alpha', description: '', content: '', operation: null, constants: null },
    },
    ...overrides,
  }
}

beforeEach(() => {
  mockUseTaxonomy.mockReset()
  mockUseTaxonomy.mockReturnValue(taxonomy())
  mockUseLabelSuggestions.mockReset()
  mockUseLabelSuggestions.mockReturnValue(['Project', 'Task'])
})

describe('ClassifyTab — labels (ADR-260063)', () => {
  it('renders label pills tinted from the deterministic palette, with suggestions', () => {
    render(<ClassifyTab atom={makeAtom()} onUpdate={vi.fn()} />)
    expect(screen.getByText('Project')).toHaveStyle({ background: labelColorToken('Project') })
    // Suggestions feed the editor's datalist.
    expect(document.querySelector('datalist option[value="Task"]')).not.toBeNull()
  })

  it('adding a label persists immediately with the appended labels array', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    render(<ClassifyTab atom={makeAtom()} onUpdate={onUpdate} />)

    await userEvent.type(screen.getByRole('combobox', { name: 'Add label' }), 'Urgent{Enter}')

    expect(onUpdate).toHaveBeenCalledOnce()
    const [uuid, atom] = onUpdate.mock.calls[0]!
    expect(uuid).toBe('atom-1')
    expect(atom.labels).toEqual(['Project', 'Urgent'])
    expect(atom.categories).toEqual([{ dimensionKey: 'region', valueKey: 'belgium' }])
  })

  it('removing a label persists immediately with the filtered labels array', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    render(<ClassifyTab atom={makeAtom({ labels: ['Project', 'Task'] })} onUpdate={onUpdate} />)

    await userEvent.click(screen.getByRole('button', { name: 'Remove Task' }))

    expect(onUpdate).toHaveBeenCalledOnce()
    expect(onUpdate.mock.calls[0]![1].labels).toEqual(['Project'])
  })

  it('renders plain (non-editable) pills while a save is in flight', async () => {
    let resolveSave!: () => void
    const onUpdate = vi.fn().mockImplementation(() => new Promise<void>((res) => { resolveSave = res }))
    render(<ClassifyTab atom={makeAtom()} onUpdate={onUpdate} />)

    await userEvent.type(screen.getByRole('combobox', { name: 'Add label' }), 'Urgent{Enter}')

    // In-flight: the editor is gone (no second overlapping full-document write possible).
    expect(screen.queryByRole('combobox', { name: 'Add label' })).not.toBeInTheDocument()
    expect(screen.getByText('Project')).toBeInTheDocument()

    resolveSave()
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Add label' })).toBeInTheDocument())
  })

  it('shows the save-error strip on failure and clears it on the next success', async () => {
    const onUpdate = vi.fn().mockRejectedValueOnce(new Error('kaboom')).mockResolvedValue(undefined)
    render(<ClassifyTab atom={makeAtom()} onUpdate={onUpdate} />)

    await userEvent.type(screen.getByRole('combobox', { name: 'Add label' }), 'Urgent{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the change. Please try again.')

    await userEvent.type(screen.getByRole('combobox', { name: 'Add label' }), 'Later{Enter}')
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })
})

describe('ClassifyTab — categories (ADR-260063 / REQ-FR-260071)', () => {
  it('groups category chips by dimension with resolved display names and ancestor-path tooltip', () => {
    render(<ClassifyTab atom={makeAtom()} onUpdate={vi.fn()} />)

    const group = screen.getByRole('group', { name: 'Category dimension Region' })
    expect(group).toHaveTextContent('Region ▸')
    const chip = screen.getByTitle('Region ▸ Europe ▸ Belgium')
    expect(chip).toHaveTextContent('Belgium')
  })

  it('falls back to raw keys while taxonomy metadata is missing', () => {
    mockUseTaxonomy.mockReturnValue(taxonomy({ dimensions: [], valuesByDimension: new Map() }))
    render(<ClassifyTab atom={makeAtom()} onUpdate={vi.fn()} />)

    expect(screen.getByRole('group', { name: 'Category dimension region' })).toBeInTheDocument()
    expect(screen.getByTitle('region ▸ belgium')).toHaveTextContent('belgium')
  })

  it('auto-loads values for the dimensions assigned on the atom', () => {
    render(<ClassifyTab atom={makeAtom()} onUpdate={vi.fn()} />)
    expect(mockUseTaxonomy).toHaveBeenCalledWith(['region'])
  })

  it('shows the empty state and passes no dimension keys when the atom has no categories', () => {
    const atom = makeAtom()
    delete atom.categories
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    render(<ClassifyTab atom={atom} onUpdate={onUpdate} />)

    expect(screen.getByText('No categories assigned.')).toBeInTheDocument()
    expect(mockUseTaxonomy).toHaveBeenCalledWith([])
  })

  it('a label edit on an atom without categories keeps the categories field absent (no wipe)', async () => {
    const atom = makeAtom()
    delete atom.categories
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    render(<ClassifyTab atom={atom} onUpdate={onUpdate} />)

    await userEvent.type(screen.getByRole('combobox', { name: 'Add label' }), 'Urgent{Enter}')

    expect(onUpdate.mock.calls[0]![1]).not.toHaveProperty('categories')
  })

  it('clearing a chip persists the full remaining array (replace-all)', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    const atom = makeAtom({
      categories: [
        { dimensionKey: 'region', valueKey: 'belgium' },
        { dimensionKey: 'region', valueKey: 'germany' },
      ],
    })
    render(<ClassifyTab atom={atom} onUpdate={onUpdate} />)

    await userEvent.click(screen.getByRole('button', { name: 'Remove category Belgium' }))

    expect(onUpdate).toHaveBeenCalledOnce()
    expect(onUpdate.mock.calls[0]![1].categories).toEqual([{ dimensionKey: 'region', valueKey: 'germany' }])
  })

  it('surfaces a taxonomy load error in the categories section', () => {
    mockUseTaxonomy.mockReturnValue(taxonomy({ error: 'Could not load categories.' }))
    render(<ClassifyTab atom={makeAtom()} onUpdate={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load categories.')
  })
})

describe('ClassifyTab — assign picker (ADR-260063)', () => {
  it('assigns a picked value: dimension select → tree expand → value click → append + close', async () => {
    const tax = taxonomy()
    mockUseTaxonomy.mockReturnValue(tax)
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    render(<ClassifyTab atom={makeAtom()} onUpdate={onUpdate} />)

    await userEvent.click(screen.getByRole('button', { name: 'Assign category' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Dimension' }), 'region')
    expect(tax.loadValues).toHaveBeenCalledWith('region')

    await userEvent.click(screen.getByRole('button', { name: 'Expand Europe' }))
    await userEvent.click(screen.getByRole('button', { name: 'Germany' }))

    expect(onUpdate).toHaveBeenCalledOnce()
    expect(onUpdate.mock.calls[0]![1].categories).toEqual([
      { dimensionKey: 'region', valueKey: 'belgium' },
      { dimensionKey: 'region', valueKey: 'germany' },
    ])
    // The picker closes after assigning.
    expect(screen.queryByRole('combobox', { name: 'Dimension' })).not.toBeInTheDocument()
  })

  it('collapses an expanded tree node on a second toggle', async () => {
    render(<ClassifyTab atom={makeAtom()} onUpdate={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Assign category' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Dimension' }), 'region')
    await userEvent.click(screen.getByRole('button', { name: 'Expand Europe' }))
    expect(screen.getByRole('button', { name: 'Germany' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Collapse Europe' }))
    expect(screen.queryByRole('button', { name: 'Germany' })).not.toBeInTheDocument()
  })

  it('dedupes an already-assigned value: no update, picker still closes', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    render(<ClassifyTab atom={makeAtom()} onUpdate={onUpdate} />)

    await userEvent.click(screen.getByRole('button', { name: 'Assign category' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Dimension' }), 'region')
    await userEvent.click(screen.getByRole('button', { name: 'Expand Europe' }))
    await userEvent.click(screen.getByRole('button', { name: 'Belgium' }))

    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.queryByRole('combobox', { name: 'Dimension' })).not.toBeInTheDocument()
  })

  it('toggles the picker closed again from the Assign category button', async () => {
    render(<ClassifyTab atom={makeAtom()} onUpdate={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Assign category' }))
    expect(screen.getByRole('combobox', { name: 'Dimension' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Assign category' }))
    expect(screen.queryByRole('combobox', { name: 'Dimension' })).not.toBeInTheDocument()
  })

  it('shows a loading state until the chosen dimension has values, and none without a choice', async () => {
    mockUseTaxonomy.mockReturnValue(taxonomy({ valuesByDimension: new Map() }))
    render(<ClassifyTab atom={makeAtom()} onUpdate={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Assign category' }))
    // No dimension chosen yet — neither loading text nor tree.
    expect(screen.queryByText('Loading values…')).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Dimension' }), 'period')
    expect(screen.getByText('Loading values…')).toBeInTheDocument()

    // Returning to the placeholder clears the pending load view without re-fetching.
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Dimension' }), '')
    expect(screen.queryByText('Loading values…')).not.toBeInTheDocument()
  })
})

describe('ClassifyTab — access gating (REQ-FR-260069)', () => {
  it('renders everything read-only for a VIEWER atom', () => {
    render(<ClassifyTab atom={makeAtom({ accessLevel: 'VIEWER' })} onUpdate={vi.fn()} />)

    expect(screen.getByRole('status')).toHaveTextContent('You have view-only access to this atom.')
    // Colored pills and category chips render as text — no editor, no buttons.
    expect(screen.getByText('Project')).toHaveStyle({ background: labelColorToken('Project') })
    expect(screen.getByTitle('Region ▸ Europe ▸ Belgium')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('defaults a missing access level to read-only', () => {
    render(<ClassifyTab atom={makeAtom({ accessLevel: null })} onUpdate={vi.fn()} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
