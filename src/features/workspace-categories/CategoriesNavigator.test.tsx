import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CategoriesNavigator } from './CategoriesNavigator'
import type { CategoryBrowse } from './use-category-browse'
import type { CategoryBrowseChild, CategoryDimension } from '../../api-contract'
import type { WorkspaceFilter } from '../../ui-primitives'

const mockBrowse = vi.hoisted(() => ({ current: {} as CategoryBrowse }))

vi.mock('./use-category-browse', () => ({
  useCategoryBrowse: () => mockBrowse.current,
}))

function dim(key: string, displayName: string, accessLevel: CategoryDimension['accessLevel'] = 'OWNER'): CategoryDimension {
  return { key, displayName, description: null, parentDimensionKeys: [], accessLevel, ownerUsername: 'demo' }
}

function childDim(key: string, displayName: string, parentDimensionKey: string): CategoryDimension {
  return { ...dim(key, displayName), parentDimensionKeys: [parentDimensionKey] }
}

function child(key: string, displayName: string, dimensionKey: string, atomCount: number, accessLevel: CategoryBrowseChild['value']['accessLevel'] = 'OWNER'): CategoryBrowseChild {
  return { value: { key, displayName, dimensionKey, parentValueKeys: [], accessLevel }, atomCount }
}

function makeBrowse(overrides: Partial<CategoryBrowse> = {}): CategoryBrowse {
  return {
    dimensions: [dim('region', 'Region')],
    childrenByNode: new Map(),
    loading: false,
    loadError: null,
    mutationError: null,
    loadChildren: vi.fn(),
    createDimension: vi.fn().mockResolvedValue(true),
    setDimensionParent: vi.fn().mockResolvedValue(true),
    createValue: vi.fn().mockResolvedValue(true),
    renameNode: vi.fn().mockResolvedValue(true),
    removeNode: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

beforeEach(() => {
  mockBrowse.current = makeBrowse()
})

describe('CategoriesNavigator browsing', () => {
  it('renders the dimensions as tree roots', () => {
    render(<CategoriesNavigator />)
    expect(screen.getByRole('tree', { name: 'Categories' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Region' })).toBeInTheDocument()
  })

  it('expanding a dimension lazy-loads its children', async () => {
    render(<CategoriesNavigator />)
    await userEvent.click(screen.getByRole('button', { name: 'Expand Region' }))
    expect(mockBrowse.current.loadChildren).toHaveBeenCalledWith({ kind: 'dimension', key: 'region' })
  })

  it('collapsing does not trigger another load', async () => {
    render(<CategoriesNavigator />)
    await userEvent.click(screen.getByRole('button', { name: 'Expand Region' }))
    await userEvent.click(screen.getByRole('button', { name: 'Collapse Region' }))
    expect(mockBrowse.current.loadChildren).toHaveBeenCalledTimes(1)
  })

  it('selecting a dimension node toggles its expansion (loads lazily too)', async () => {
    render(<CategoriesNavigator />)
    await userEvent.click(screen.getByRole('button', { name: 'Region' }))
    expect(mockBrowse.current.loadChildren).toHaveBeenCalledWith({ kind: 'dimension', key: 'region' })
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    // Selecting again collapses without a second load.
    await userEvent.click(screen.getByRole('button', { name: 'Region' }))
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
    expect(mockBrowse.current.loadChildren).toHaveBeenCalledTimes(1)
  })

  it('selecting the Loading… placeholder is a no-op', async () => {
    const onFilterChange = vi.fn()
    render(<CategoriesNavigator onFilterChange={onFilterChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Expand Region' }))
    await userEvent.click(screen.getByRole('button', { name: 'Loading…' }))
    expect(onFilterChange).not.toHaveBeenCalled()
  })

  it('shows loaded children with atom-count badges when expanded', async () => {
    mockBrowse.current = makeBrowse({
      childrenByNode: new Map([['region', [child('europe', 'Europe', 'region', 7)]]]),
    })
    render(<CategoriesNavigator />)
    await userEvent.click(screen.getByRole('button', { name: 'Expand Region' }))
    expect(screen.getByRole('button', { name: /^Europe/ })).toBeInTheDocument()
  })

  it('expanding a value node browses its subtree by valueKey', async () => {
    mockBrowse.current = makeBrowse({
      childrenByNode: new Map([['region', [child('europe', 'Europe', 'region', 7)]]]),
    })
    render(<CategoriesNavigator />)
    await userEvent.click(screen.getByRole('button', { name: 'Expand Region' }))
    await userEvent.click(screen.getByRole('button', { name: 'Expand Europe' }))
    expect(mockBrowse.current.loadChildren).toHaveBeenCalledWith({ kind: 'value', key: 'europe' })
  })

  it('shows the empty state when no dimensions exist and loading is done', () => {
    mockBrowse.current = makeBrowse({ dimensions: [] })
    render(<CategoriesNavigator />)
    expect(screen.getByText('No categories yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Add dimension' })).toBeInTheDocument()
  })

  it('hides the empty state while the initial load is in flight', () => {
    mockBrowse.current = makeBrowse({ dimensions: [], loading: true })
    render(<CategoriesNavigator />)
    expect(screen.queryByText('No categories yet.')).not.toBeInTheDocument()
  })

  it('announces load and mutation errors via role="alert"', () => {
    mockBrowse.current = makeBrowse({ loadError: 'Could not load categories.', mutationError: 'CAT-KEY-EXISTS' })
    render(<CategoriesNavigator />)
    const alerts = screen.getAllByRole('alert')
    expect(alerts.map((a) => a.textContent)).toEqual(['Could not load categories.', 'CAT-KEY-EXISTS'])
  })
})

describe('CategoriesNavigator facet selection (ADR-260064)', () => {
  function renderWithFilter(filter?: WorkspaceFilter) {
    const onFilterChange = vi.fn()
    mockBrowse.current = makeBrowse({
      childrenByNode: new Map([['region', [child('europe', 'Europe', 'region', 7)]]]),
    })
    render(<CategoriesNavigator filter={filter} onFilterChange={onFilterChange} />)
    return onFilterChange
  }

  it('selecting a value toggles it into the facet filter (includeDescendants on by default)', async () => {
    const onFilterChange = renderWithFilter({ labels: ['Project'], categories: [] })
    await userEvent.click(screen.getByRole('button', { name: 'Expand Region' }))
    await userEvent.click(screen.getByRole('button', { name: /^Europe/ }))
    expect(onFilterChange).toHaveBeenCalledWith({
      labels: ['Project'],
      categories: [{ dimensionKey: 'region', valueKeys: ['europe'], includeDescendants: true }],
    })
  })

  it('unchecking "Include subcategories" applies to newly created entries', async () => {
    const onFilterChange = renderWithFilter({ labels: [], categories: [] })
    await userEvent.click(screen.getByRole('checkbox', { name: 'Include subcategories' }))
    await userEvent.click(screen.getByRole('button', { name: 'Expand Region' }))
    await userEvent.click(screen.getByRole('button', { name: /^Europe/ }))
    expect(onFilterChange).toHaveBeenCalledWith({
      labels: [],
      categories: [{ dimensionKey: 'region', valueKeys: ['europe'], includeDescendants: false }],
    })
  })

  it('selecting an already-filtered value removes it (toggle semantics)', async () => {
    const onFilterChange = renderWithFilter({
      labels: [],
      categories: [{ dimensionKey: 'region', valueKeys: ['europe'], includeDescendants: true }],
    })
    await userEvent.click(screen.getByRole('button', { name: 'Expand Region' }))
    await userEvent.click(screen.getByRole('button', { name: /^Europe/ }))
    expect(onFilterChange).toHaveBeenCalledWith({ labels: [], categories: [] })
  })

  it('works without a filter prop (defaults to empty labels and categories)', async () => {
    const onFilterChange = renderWithFilter(undefined)
    await userEvent.click(screen.getByRole('button', { name: 'Expand Region' }))
    await userEvent.click(screen.getByRole('button', { name: /^Europe/ }))
    expect(onFilterChange).toHaveBeenCalledWith({
      labels: [],
      categories: [{ dimensionKey: 'region', valueKeys: ['europe'], includeDescendants: true }],
    })
  })

  it('value selection without an onFilterChange wiring is a safe no-op', async () => {
    mockBrowse.current = makeBrowse({
      childrenByNode: new Map([['region', [child('europe', 'Europe', 'region', 7)]]]),
    })
    render(<CategoriesNavigator />)
    await userEvent.click(screen.getByRole('button', { name: 'Expand Region' }))
    await userEvent.click(screen.getByRole('button', { name: /^Europe/ }))
    expect(screen.getByRole('button', { name: /^Europe/ })).toBeInTheDocument()
  })
})

describe('CategoriesNavigator authoring (Q2 gating + inline editor)', () => {
  it('gates the edit affordance on the real accessLevel — VIEWER nodes show no pencil', async () => {
    mockBrowse.current = makeBrowse({
      dimensions: [dim('region', 'Region', 'OWNER'), dim('period', 'Period', 'VIEWER')],
      childrenByNode: new Map([['region', [child('europe', 'Europe', 'region', 7, 'VIEWER')]]]),
    })
    render(<CategoriesNavigator />)
    expect(screen.getByRole('button', { name: 'Edit Region' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit Period' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Expand Region' }))
    expect(screen.queryByRole('button', { name: 'Edit Europe' })).not.toBeInTheDocument()
  })

  it('EDITOR access shows the edit affordance too', () => {
    mockBrowse.current = makeBrowse({ dimensions: [dim('region', 'Region', 'EDITOR')] })
    render(<CategoriesNavigator />)
    expect(screen.getByRole('button', { name: 'Edit Region' })).toBeInTheDocument()
  })

  it('the edit pencil opens the inline editor and toggles it closed on re-click', async () => {
    render(<CategoriesNavigator />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit Region' }))
    expect(screen.getByRole('region', { name: 'Edit Region' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Edit Region' }))
    expect(screen.queryByRole('region', { name: 'Edit Region' })).not.toBeInTheDocument()
  })

  it('the editor close control dismisses the editor', async () => {
    render(<CategoriesNavigator />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit Region' }))
    await userEvent.click(screen.getByRole('button', { name: 'Close editor' }))
    expect(screen.queryByRole('region', { name: 'Edit Region' })).not.toBeInTheDocument()
  })

  it('the + Add dimension button opens the inline form and creates the dimension', async () => {
    render(<CategoriesNavigator />)
    await userEvent.click(screen.getByRole('button', { name: '+ Add dimension' }))
    await userEvent.type(screen.getByLabelText('New dimension key'), 'period')
    await userEvent.type(screen.getByLabelText('New dimension name'), 'Period')
    await userEvent.click(screen.getByRole('button', { name: 'Create dimension' }))
    expect(mockBrowse.current.createDimension).toHaveBeenCalledWith('period', 'Period', null)
    // Success closes the form.
    expect(screen.queryByLabelText('New dimension key')).not.toBeInTheDocument()
  })

  it('a failed dimension create keeps the form open', async () => {
    mockBrowse.current = makeBrowse({ createDimension: vi.fn().mockResolvedValue(false) })
    render(<CategoriesNavigator />)
    await userEvent.click(screen.getByRole('button', { name: '+ Add dimension' }))
    await userEvent.type(screen.getByLabelText('New dimension key'), 'period')
    await userEvent.type(screen.getByLabelText('New dimension name'), 'Period')
    await userEvent.click(screen.getByRole('button', { name: 'Create dimension' }))
    expect(screen.getByLabelText('New dimension key')).toBeInTheDocument()
  })

  it('the add-dimension form ignores submits with a missing key or name', async () => {
    render(<CategoriesNavigator />)
    await userEvent.click(screen.getByRole('button', { name: '+ Add dimension' }))
    await userEvent.click(screen.getByRole('button', { name: 'Create dimension' }))
    await userEvent.type(screen.getByLabelText('New dimension key'), 'period')
    await userEvent.click(screen.getByRole('button', { name: 'Create dimension' }))
    expect(mockBrowse.current.createDimension).not.toHaveBeenCalled()
  })

  it('the + Add dimension button toggles the form closed on re-click', async () => {
    render(<CategoriesNavigator />)
    await userEvent.click(screen.getByRole('button', { name: '+ Add dimension' }))
    expect(screen.getByLabelText('New dimension key')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '+ Add dimension' }))
    expect(screen.queryByLabelText('New dimension key')).not.toBeInTheDocument()
  })
})

describe('CategoriesNavigator hierarchical dimensions (ADR-260071)', () => {
  // Alpha ▸ Beta ▸ Gamma, plus an unrelated root — enough depth to tell "excludes the subtree"
  // apart from "offers nothing at all".
  function nestedDimensions() {
    return [dim('a', 'Alpha'), childDim('b', 'Beta', 'a'), childDim('c', 'Gamma', 'b'), dim('z', 'Zeta')]
  }

  function parentOptionNames(label = 'Parent dimension') {
    return within(screen.getByLabelText(label))
      .getAllByRole('option')
      .map((option) => option.textContent)
  }

  it('offers every dimension as a parent when adding a new one', async () => {
    mockBrowse.current = makeBrowse({ dimensions: nestedDimensions() })
    render(<CategoriesNavigator />)
    await userEvent.click(screen.getByRole('button', { name: '+ Add dimension' }))
    // Nothing is excluded here: a brand-new dimension cannot be its own ancestor. Options carry
    // their depth as indentation and follow render order — a flat list of names would not say
    // which branch a candidate parent sits in.
    expect(parentOptionNames()).toEqual([
      'No parent (top level)',
      'Alpha',
      '\u00a0\u00a0\u00a0\u00a0Beta',
      '\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0Gamma',
      'Zeta',
    ])
  })

  it('creates the dimension under the selected parent', async () => {
    mockBrowse.current = makeBrowse({ dimensions: nestedDimensions() })
    render(<CategoriesNavigator />)
    await userEvent.click(screen.getByRole('button', { name: '+ Add dimension' }))
    await userEvent.type(screen.getByLabelText('New dimension key'), 'd')
    await userEvent.type(screen.getByLabelText('New dimension name'), 'Delta')
    await userEvent.selectOptions(screen.getByLabelText('Parent dimension'), 'b')
    await userEvent.click(screen.getByRole('button', { name: 'Create dimension' }))
    expect(mockBrowse.current.createDimension).toHaveBeenCalledWith('d', 'Delta', 'b')
  })

  it('reverting the parent selection to top level creates a root dimension', async () => {
    mockBrowse.current = makeBrowse({ dimensions: nestedDimensions() })
    render(<CategoriesNavigator />)
    await userEvent.click(screen.getByRole('button', { name: '+ Add dimension' }))
    await userEvent.type(screen.getByLabelText('New dimension key'), 'd')
    await userEvent.type(screen.getByLabelText('New dimension name'), 'Delta')
    await userEvent.selectOptions(screen.getByLabelText('Parent dimension'), 'b')
    await userEvent.selectOptions(screen.getByLabelText('Parent dimension'), '')
    await userEvent.click(screen.getByRole('button', { name: 'Create dimension' }))
    expect(mockBrowse.current.createDimension).toHaveBeenCalledWith('d', 'Delta', null)
  })

  it('excludes the edited dimension and its whole subtree from its own parent options', async () => {
    mockBrowse.current = makeBrowse({ dimensions: nestedDimensions() })
    render(<CategoriesNavigator />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }))
    // Selecting Alpha, Beta or Gamma would build a cycle the server rejects with
    // CAT-DIMENSION-CYCLE; Zeta proves the list is filtered rather than simply empty.
    expect(parentOptionNames('Parent dimension for Alpha')).toEqual(['No parent (top level)', 'Zeta'])
  })

  it('offers a mid-level dimension every parent except its own descendants', async () => {
    mockBrowse.current = makeBrowse({ dimensions: nestedDimensions() })
    render(<CategoriesNavigator />)
    await userEvent.click(screen.getByRole('button', { name: 'Expand Alpha' }))
    await userEvent.click(screen.getByRole('button', { name: 'Edit Beta' }))
    // Alpha is Beta's current parent and stays selectable — only Beta and Gamma are illegal.
    expect(parentOptionNames('Parent dimension for Beta')).toEqual(['No parent (top level)', 'Alpha', 'Zeta'])
  })

  it('preselects the current parent of the edited dimension', async () => {
    mockBrowse.current = makeBrowse({ dimensions: nestedDimensions() })
    render(<CategoriesNavigator />)
    await userEvent.click(screen.getByRole('button', { name: 'Expand Alpha' }))
    await userEvent.click(screen.getByRole('button', { name: 'Edit Beta' }))
    expect(screen.getByLabelText('Parent dimension for Beta')).toHaveValue('a')
  })

  it('keeps the two parent selectors distinguishable when both panels are open', async () => {
    // Regression: the add-dimension form and the node editor are independent state, so both can be
    // open at once. Both render a parent selector, and when they shared the accessible name
    // "Parent dimension" the two were indistinguishable to a screen reader (and to getByLabelText,
    // which threw on the ambiguity).
    mockBrowse.current = makeBrowse({ dimensions: nestedDimensions() })
    render(<CategoriesNavigator />)
    await userEvent.click(screen.getByRole('button', { name: '+ Add dimension' }))
    await userEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }))

    expect(screen.getByLabelText('Parent dimension')).toBeInTheDocument()
    expect(screen.getByLabelText('Parent dimension for Alpha')).toBeInTheDocument()
  })

  it('offers no parent options when editing a value node', async () => {
    mockBrowse.current = makeBrowse({
      dimensions: nestedDimensions(),
      childrenByNode: new Map([['a', [child('europe', 'Europe', 'a', 7)]]]),
    })
    render(<CategoriesNavigator />)
    await userEvent.click(screen.getByRole('button', { name: 'Expand Alpha' }))
    await userEvent.click(screen.getByRole('button', { name: 'Edit Europe' }))
    // Re-parenting is a dimension-only operation — UNDER_CATDIM has no value counterpart here.
    expect(screen.getByRole('region', { name: 'Edit Europe' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Parent dimension for Europe')).not.toBeInTheDocument()
  })

  it('renders nested dimensions beneath their parent as the tree is expanded', async () => {
    mockBrowse.current = makeBrowse({ dimensions: nestedDimensions() })
    render(<CategoriesNavigator />)
    // Only roots are on top: the hierarchy comes from parentDimensionKeys, not from browse.
    expect(screen.getByRole('button', { name: 'Alpha' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zeta' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Beta' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Expand Alpha' }))
    expect(screen.getByRole('button', { name: 'Beta' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gamma' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Expand Beta' }))
    expect(screen.getByRole('button', { name: 'Gamma' })).toBeInTheDocument()
  })

  it('expanding a nested dimension browses that dimension, not its parent', async () => {
    mockBrowse.current = makeBrowse({ dimensions: nestedDimensions() })
    render(<CategoriesNavigator />)
    await userEvent.click(screen.getByRole('button', { name: 'Expand Alpha' }))
    await userEvent.click(screen.getByRole('button', { name: 'Expand Beta' }))
    expect(mockBrowse.current.loadChildren).toHaveBeenCalledWith({ kind: 'dimension', key: 'b' })
  })
})
