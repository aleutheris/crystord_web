import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UserEvent } from '@testing-library/user-event'
import { BoardView } from './BoardView'
import type { Atom, AtomCategoryAssignment, EffectiveAccessLevel } from '../../api-contract'
import { RETRIEVE_CATEGORY_DIMENSIONS_QUERY } from '../../api-contract/category-operations'

const mockQuery = vi.fn()
const mockClient = { query: mockQuery }

vi.mock('@apollo/client/react', () => ({
  useApolloClient: () => mockClient,
}))

const DIMENSIONS = [
  { key: 'region', displayName: 'Region', description: null, parentDimensionKeys: [], accessLevel: 'OWNER', ownerUsername: 'demo' },
]
// Region: Europe (root) ▸ Belgium; Asia (root) — rollup places Belgium cards under Europe.
const REGION_VALUES = [
  { key: 'europe', displayName: 'Europe', description: null, dimensionKey: 'region', parentValueKeys: [], accessLevel: 'OWNER', ownerUsername: 'demo' },
  { key: 'belgium', displayName: 'Belgium', description: null, dimensionKey: 'region', parentValueKeys: ['europe'], accessLevel: 'OWNER', ownerUsername: 'demo' },
  { key: 'asia', displayName: 'Asia', description: null, dimensionKey: 'region', parentValueKeys: [], accessLevel: 'OWNER', ownerUsername: 'demo' },
]

function mockTaxonomyBackend() {
  mockQuery.mockImplementation(({ query }: { query: unknown }) => {
    if (query === RETRIEVE_CATEGORY_DIMENSIONS_QUERY) {
      return Promise.resolve({ data: { retrieveCategoryDimensions: DIMENSIONS } })
    }
    return Promise.resolve({ data: { retrieveCategoryValues: REGION_VALUES } })
  })
}

beforeEach(() => {
  mockQuery.mockReset()
  mockTaxonomyBackend()
})

interface AtomOptions {
  categories?: AtomCategoryAssignment[]
  accessLevel?: EffectiveAccessLevel | null
  labels?: string[]
}

function makeAtom(uuid: string, title: string, opts: AtomOptions = {}): Atom {
  return {
    labels: opts.labels ?? ['Project'],
    bonds: [],
    accessLevel: opts.accessLevel !== undefined ? opts.accessLevel : 'OWNER',
    ...(opts.categories !== undefined ? { categories: opts.categories } : {}),
    properties: {
      shellies: { uuid },
      nuclearies: { title, description: 'desc', content: `${title} body`, operation: '', constants: {} },
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
    <BoardView
      data={{ atoms, loading: opts.loading ?? false, error: opts.error ?? null, updateAtom }}
      selectedAtomId={opts.selectedAtomId ?? null}
      onSelectAtom={onSelectAtom}
      onCreateAtom={onCreateAtom}
      renderMode="full"
    />,
  )
  return { updateAtom, onSelectAtom, onCreateAtom }
}

async function chooseRegion(user: UserEvent) {
  await screen.findByRole('option', { name: 'Region' })
  await user.selectOptions(screen.getByRole('combobox', { name: 'Board dimension' }), 'region')
  await screen.findByRole('region', { name: 'Unassigned column' })
}

function column(name: string): HTMLElement {
  return screen.getByRole('region', { name: `${name} column` })
}

const dropPayload = (uuid: string) => ({ dataTransfer: { getData: () => uuid } })

describe('BoardView — dimension picker and prompt state (EPIC-260075 T2)', () => {
  it('prompts for a dimension before one is chosen — no columns yet', async () => {
    renderView([makeAtom('u1', 'Alpha')])
    expect(screen.getByText('Choose a dimension to lay out the board.')).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: 'Region' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /column$/ })).not.toBeInTheDocument()
  })

  it('shows a values-loading state between choosing and the value list arriving', async () => {
    const user = userEvent.setup()
    let resolve!: (v: unknown) => void
    mockQuery.mockImplementation(({ query }: { query: unknown }) => {
      if (query === RETRIEVE_CATEGORY_DIMENSIONS_QUERY) {
        return Promise.resolve({ data: { retrieveCategoryDimensions: DIMENSIONS } })
      }
      return new Promise((res) => { resolve = res })
    })
    renderView([makeAtom('u1', 'Alpha')])

    await screen.findByRole('option', { name: 'Region' })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Board dimension' }), 'region')
    expect(screen.getByText('Loading dimension values…')).toBeInTheDocument()

    resolve({ data: { retrieveCategoryValues: REGION_VALUES } })
    expect(await screen.findByRole('region', { name: 'Unassigned column' })).toBeInTheDocument()
  })

  it('re-choosing the placeholder returns to the prompt state', async () => {
    const user = userEvent.setup()
    renderView([makeAtom('u1', 'Alpha')])
    await chooseRegion(user)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Board dimension' }), '')

    expect(screen.getByText('Choose a dimension to lay out the board.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /column$/ })).not.toBeInTheDocument()
  })

  it('calls onCreateAtom from the toolbar Create Atom button', async () => {
    const user = userEvent.setup()
    const { onCreateAtom } = renderView([makeAtom('u1', 'Alpha')])
    await user.click(screen.getByRole('button', { name: 'Create atom' }))
    expect(onCreateAtom).toHaveBeenCalledOnce()
  })
})

describe('BoardView — columns, rollup, and cards (ADR-260070 D2)', () => {
  it('renders Unassigned first, then the root columns with counts; rollup places a Belgium card under Europe', async () => {
    const user = userEvent.setup()
    renderView([
      makeAtom('u1', 'Alpha', { categories: [{ dimensionKey: 'region', valueKey: 'belgium' }] }),
      makeAtom('u2', 'Beta', { categories: [] }),
    ])
    await chooseRegion(user)

    const names = screen.getAllByRole('region', { name: /column$/ }).map((c) => c.getAttribute('aria-label'))
    expect(names).toEqual(['Unassigned column', 'Europe column', 'Asia column'])

    expect(within(column('Europe')).getByRole('article', { name: 'Alpha' })).toBeInTheDocument()
    expect(within(column('Unassigned')).getByRole('article', { name: 'Beta' })).toBeInTheDocument()
    expect(within(column('Europe')).getByText('1')).toBeInTheDocument()
    expect(within(column('Asia')).getByText('0')).toBeInTheDocument()
  })

  it('shows the labels line on a card, omitting it for an unlabeled atom', async () => {
    const user = userEvent.setup()
    renderView([
      makeAtom('u1', 'Alpha', { labels: ['Project', 'Urgent'] }),
      makeAtom('u2', 'Beta', { labels: [] }),
    ])
    await chooseRegion(user)

    expect(within(screen.getByRole('article', { name: 'Alpha' })).getByText('Project, Urgent')).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: 'Beta' })).queryByText(/,/)).not.toBeInTheDocument()
  })

  it('renders a multi-assigned atom as a card in EACH matching column', async () => {
    const user = userEvent.setup()
    renderView([makeAtom('u1', 'Alpha', {
      categories: [
        { dimensionKey: 'region', valueKey: 'belgium' },
        { dimensionKey: 'region', valueKey: 'asia' },
      ],
    })])
    await chooseRegion(user)

    expect(within(column('Europe')).getByRole('article', { name: 'Alpha' })).toBeInTheDocument()
    expect(within(column('Asia')).getByRole('article', { name: 'Alpha' })).toBeInTheDocument()
  })
})

describe('BoardView — shared selection (ADR-260070 D5)', () => {
  it('selects an atom on card click', async () => {
    const user = userEvent.setup()
    const { onSelectAtom } = renderView([makeAtom('u1', 'Alpha')])
    await chooseRegion(user)

    await user.click(screen.getByRole('article', { name: 'Alpha' }))
    expect(onSelectAtom).toHaveBeenCalledWith('u1')
  })

  it('reflects selectedAtomId as aria-current on the matching card only', async () => {
    const user = userEvent.setup()
    renderView([makeAtom('u1', 'Alpha'), makeAtom('u2', 'Beta')], { selectedAtomId: 'u2' })
    await chooseRegion(user)

    expect(screen.getByRole('article', { name: 'Beta' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('article', { name: 'Alpha' })).not.toHaveAttribute('aria-current')
  })

  it('move-menu gestures do not double as card selection', async () => {
    const user = userEvent.setup()
    const { onSelectAtom } = renderView([makeAtom('u1', 'Alpha')])
    await chooseRegion(user)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Move Alpha to' }), 'asia')
    expect(onSelectAtom).not.toHaveBeenCalled()
  })
})

describe('BoardView — recategorize via the move menu (ADR-260070 D3/D4)', () => {
  it('assigns the target root to an unassigned atom through updateAtom', async () => {
    const user = userEvent.setup()
    const alpha = makeAtom('u1', 'Alpha', { categories: [] })
    const { updateAtom } = renderView([alpha])
    await chooseRegion(user)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Move Alpha to' }), 'asia')

    expect(updateAtom).toHaveBeenCalledOnce()
    const [uuid, updated] = updateAtom.mock.calls[0]! as [string, Atom]
    expect(uuid).toBe('u1')
    expect(updated).toEqual({ ...alpha, categories: [{ dimensionKey: 'region', valueKey: 'asia' }] })
  })

  it('moving to Unassigned clears this dimension but preserves other dimensions', async () => {
    const user = userEvent.setup()
    const { updateAtom } = renderView([makeAtom('u1', 'Alpha', {
      categories: [
        { dimensionKey: 'region', valueKey: 'belgium' },
        { dimensionKey: 'period', valueKey: 'q1' },
      ],
    })])
    await chooseRegion(user)

    await user.selectOptions(within(column('Europe')).getByRole('combobox', { name: 'Move Alpha to' }), '__unassigned__')

    const [, updated] = updateAtom.mock.calls[0]! as [string, Atom]
    expect(updated.categories).toEqual([{ dimensionKey: 'period', valueKey: 'q1' }])
  })

  it('dropping a descendant-assigned card on its own root column coarsens to the root', async () => {
    const user = userEvent.setup()
    const { updateAtom } = renderView([makeAtom('u1', 'Alpha', { categories: [{ dimensionKey: 'region', valueKey: 'belgium' }] })])
    await chooseRegion(user)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Move Alpha to' }), 'europe')

    const [, updated] = updateAtom.mock.calls[0]! as [string, Atom]
    expect(updated.categories).toEqual([{ dimensionKey: 'region', valueKey: 'europe' }])
  })

  it('moving a card to the column it exactly occupies is a no-op', async () => {
    const user = userEvent.setup()
    const { updateAtom } = renderView([makeAtom('u1', 'Alpha', { categories: [{ dimensionKey: 'region', valueKey: 'europe' }] })])
    await chooseRegion(user)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Move Alpha to' }), 'europe')

    expect(updateAtom).not.toHaveBeenCalled()
  })
})

describe('BoardView — native HTML5 drag-and-drop (ADR-260070 D4)', () => {
  it('a movable card is draggable and stamps its uuid on dragstart', async () => {
    const user = userEvent.setup()
    renderView([makeAtom('u1', 'Alpha')])
    await chooseRegion(user)

    const card = screen.getByRole('article', { name: 'Alpha' })
    expect(card).toHaveAttribute('draggable', 'true')
    const setData = vi.fn()
    fireEvent.dragStart(card, { dataTransfer: { setData } })
    expect(setData).toHaveBeenCalledWith('text/plain', 'u1')
  })

  it('dropping a card uuid on a column recategorizes it there', async () => {
    const user = userEvent.setup()
    const { updateAtom } = renderView([makeAtom('u1', 'Alpha', { categories: [] })])
    await chooseRegion(user)

    fireEvent.dragOver(column('Asia'), dropPayload('u1'))
    fireEvent.drop(column('Asia'), dropPayload('u1'))

    await waitFor(() => expect(updateAtom).toHaveBeenCalledOnce())
    const [, updated] = updateAtom.mock.calls[0]! as [string, Atom]
    expect(updated.categories).toEqual([{ dimensionKey: 'region', valueKey: 'asia' }])
  })

  it('ignores drops without a uuid payload or with an unknown uuid', async () => {
    const user = userEvent.setup()
    const { updateAtom } = renderView([makeAtom('u1', 'Alpha')])
    await chooseRegion(user)

    fireEvent.drop(column('Asia'), dropPayload(''))
    fireEvent.drop(column('Asia'), dropPayload('nowhere'))

    expect(updateAtom).not.toHaveBeenCalled()
  })
})

describe('BoardView — access gating (ADR-260059 / ADR-260070 D4)', () => {
  it('a VIEWER card is not draggable and has no move menu', async () => {
    const user = userEvent.setup()
    renderView([
      makeAtom('u1', 'Alpha'),
      makeAtom('u2', 'Beta', { accessLevel: 'VIEWER' }),
    ])
    await chooseRegion(user)

    // The OWNER card proves the affordance exists…
    expect(screen.getByRole('combobox', { name: 'Move Alpha to' })).toBeInTheDocument()
    // …while the VIEWER card renders read-only.
    const beta = screen.getByRole('article', { name: 'Beta' })
    expect(beta).toHaveAttribute('draggable', 'false')
    expect(screen.queryByRole('combobox', { name: 'Move Beta to' })).not.toBeInTheDocument()
  })

  it('a crafted drop of a non-editable atom uuid is refused (drop payloads are untrusted)', async () => {
    const user = userEvent.setup()
    const { updateAtom } = renderView([makeAtom('u1', 'Alpha', { accessLevel: null })])
    await chooseRegion(user)

    fireEvent.drop(column('Asia'), dropPayload('u1'))

    expect(updateAtom).not.toHaveBeenCalled()
  })
})

describe('BoardView — in-flight guard and save errors (EPIC-260075 T3)', () => {
  it('locks a card read-only while its save is in flight (full-document write guard)', async () => {
    let resolveSave!: () => void
    const updateAtom: UpdateAtomMock = vi.fn<(uuid: string, atom: Atom) => Promise<void>>(
      () => new Promise<void>((resolve) => { resolveSave = resolve }),
    )
    const user = userEvent.setup()
    renderView([makeAtom('u1', 'Alpha', { categories: [] })], { updateAtom })
    await chooseRegion(user)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Move Alpha to' }), 'asia')

    // While the save round-trips, no second move may build a payload from the stale atom
    // (updateAtom is a full-document write — a stale snapshot would revert the first move).
    const card = screen.getByRole('article', { name: 'Alpha' })
    expect(card).toHaveAttribute('aria-busy', 'true')
    expect(card).toHaveAttribute('draggable', 'false')
    expect(screen.queryByRole('combobox', { name: 'Move Alpha to' })).not.toBeInTheDocument()
    fireEvent.drop(column('Europe'), dropPayload('u1'))
    expect(updateAtom).toHaveBeenCalledOnce()

    resolveSave()
    await waitFor(() => expect(screen.getByRole('article', { name: 'Alpha' })).not.toHaveAttribute('aria-busy'))
    expect(screen.getByRole('combobox', { name: 'Move Alpha to' })).toBeInTheDocument()
  })

  it('surfaces a rejected move via the inline save-error strip — the board survives', async () => {
    const updateAtom: UpdateAtomMock = vi.fn<(uuid: string, atom: Atom) => Promise<void>>().mockRejectedValue(new Error('denied'))
    const user = userEvent.setup()
    renderView([makeAtom('u1', 'Alpha', { categories: [] })], { updateAtom })
    await chooseRegion(user)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Move Alpha to' }), 'asia')

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not save the change. Please try again.'))
    expect(screen.getByRole('region', { name: 'Asia column' })).toBeInTheDocument()
  })

  it('clears the save-error strip on the next successful move', async () => {
    const updateAtom: UpdateAtomMock = vi.fn<(uuid: string, atom: Atom) => Promise<void>>()
      .mockRejectedValueOnce(new Error('denied'))
      .mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderView([makeAtom('u1', 'Alpha', { categories: [] })], { updateAtom })
    await chooseRegion(user)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Move Alpha to' }), 'asia')
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())

    await user.selectOptions(screen.getByRole('combobox', { name: 'Move Alpha to' }), 'europe')
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })
})

describe('BoardView — empty, loading, and error states (EPIC-260075 T2/T5)', () => {
  it('shows the full-screen loading state only before any atoms exist', () => {
    renderView([], { loading: true })
    expect(screen.getByText('Loading atoms…')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Board dimension' })).not.toBeInTheDocument()
  })

  it('keeps the board mounted during a refetch once atoms exist', async () => {
    const user = userEvent.setup()
    renderView([makeAtom('u1', 'Alpha')], { loading: true })
    await chooseRegion(user)
    expect(screen.queryByText('Loading atoms…')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Europe column' })).toBeInTheDocument()
  })

  it('announces a load error via role="alert" when no atoms exist', () => {
    renderView([], { error: 'Failed to load graph data' })
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load graph data')
    expect(screen.queryByRole('combobox', { name: 'Board dimension' })).not.toBeInTheDocument()
  })

  it('shows a data-layer error inline above the board once atoms exist', async () => {
    const user = userEvent.setup()
    renderView([makeAtom('u1', 'Alpha')], { error: "You don't have access to do that." })
    await chooseRegion(user)
    expect(screen.getByRole('alert')).toHaveTextContent("You don't have access to do that.")
    expect(screen.getByRole('region', { name: 'Europe column' })).toBeInTheDocument()
  })

  it('surfaces a taxonomy load failure in the inline strip', async () => {
    mockQuery.mockRejectedValue(new Error('taxonomy down'))
    renderView([makeAtom('u1', 'Alpha')])
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('taxonomy down'))
    expect(screen.getByText('Choose a dimension to lay out the board.')).toBeInTheDocument()
  })
})
