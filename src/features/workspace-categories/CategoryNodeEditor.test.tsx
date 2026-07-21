import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CategoryNodeEditor } from './CategoryNodeEditor'
import type { CategoryNodeMeta } from './category-tree'
import type { CategoryBrowse } from './use-category-browse'

function makeBrowse(overrides: Partial<CategoryBrowse> = {}): CategoryBrowse {
  return {
    dimensions: [],
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

const DIMENSION_META: CategoryNodeMeta = {
  kind: 'dimension', key: 'region', displayName: 'Region', dimensionKey: 'region', accessLevel: 'OWNER', parent: null, parentDimensionKey: null,
}

// A dimension already nested under another one — the move form must reflect its existing parent.
const NESTED_DIMENSION_META: CategoryNodeMeta = {
  kind: 'dimension', key: 'region', displayName: 'Region', dimensionKey: 'region', accessLevel: 'OWNER', parent: null, parentDimensionKey: 'geo',
}

const VALUE_META: CategoryNodeMeta = {
  kind: 'value', key: 'europe', displayName: 'Europe', dimensionKey: 'region', accessLevel: 'EDITOR',
  parent: { kind: 'dimension', key: 'region' }, parentDimensionKey: null,
}

const PARENT_OPTIONS = [
  { key: 'geo', displayName: 'Geography', depth: 0 },
  { key: 'org', displayName: 'Organisation', depth: 0 },
]

describe('CategoryNodeEditor rename', () => {
  it('renames the node with the trimmed display name and its parent ref', async () => {
    const browse = makeBrowse()
    render(<CategoryNodeEditor meta={VALUE_META} browse={browse} onClose={vi.fn()} />)
    await userEvent.clear(screen.getByLabelText('Display name'))
    await userEvent.type(screen.getByLabelText('Display name'), '  EU  ')
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }))
    expect(browse.renameNode).toHaveBeenCalledWith(
      { kind: 'value', key: 'europe' }, 'EU', { kind: 'dimension', key: 'region' },
    )
  })

  it('ignores a rename to an empty display name', async () => {
    const browse = makeBrowse()
    render(<CategoryNodeEditor meta={DIMENSION_META} browse={browse} onClose={vi.fn()} />)
    await userEvent.clear(screen.getByLabelText('Display name'))
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }))
    expect(browse.renameNode).not.toHaveBeenCalled()
  })
})

describe('CategoryNodeEditor add child value', () => {
  it('adds a child value with the node as parent and clears the form on success', async () => {
    const browse = makeBrowse()
    render(<CategoryNodeEditor meta={DIMENSION_META} browse={browse} onClose={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('New value key'), 'europe')
    await userEvent.type(screen.getByLabelText('New value name'), 'Europe')
    await userEvent.click(screen.getByRole('button', { name: 'Add value' }))
    expect(browse.createValue).toHaveBeenCalledWith('europe', 'Europe', 'region', { kind: 'dimension', key: 'region' })
    expect(screen.getByLabelText('New value key')).toHaveValue('')
    expect(screen.getByLabelText('New value name')).toHaveValue('')
  })

  it('nests under a value node using its dimension', async () => {
    const browse = makeBrowse()
    render(<CategoryNodeEditor meta={VALUE_META} browse={browse} onClose={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('New value key'), 'belgium')
    await userEvent.type(screen.getByLabelText('New value name'), 'Belgium')
    await userEvent.click(screen.getByRole('button', { name: 'Add value' }))
    expect(browse.createValue).toHaveBeenCalledWith('belgium', 'Belgium', 'region', { kind: 'value', key: 'europe' })
  })

  it('keeps the entered values when the create fails', async () => {
    const browse = makeBrowse({ createValue: vi.fn().mockResolvedValue(false) })
    render(<CategoryNodeEditor meta={DIMENSION_META} browse={browse} onClose={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('New value key'), 'europe')
    await userEvent.type(screen.getByLabelText('New value name'), 'Europe')
    await userEvent.click(screen.getByRole('button', { name: 'Add value' }))
    expect(screen.getByLabelText('New value key')).toHaveValue('europe')
  })

  it('ignores submits with a missing key or name', async () => {
    const browse = makeBrowse()
    render(<CategoryNodeEditor meta={DIMENSION_META} browse={browse} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add value' }))
    await userEvent.type(screen.getByLabelText('New value key'), 'europe')
    await userEvent.click(screen.getByRole('button', { name: 'Add value' }))
    expect(browse.createValue).not.toHaveBeenCalled()
  })
})

describe('CategoryNodeEditor move gating (OWNER only)', () => {
  const EDITOR_DIMENSION_META: CategoryNodeMeta = {
    kind: 'dimension', key: 'region', displayName: 'Region', dimensionKey: 'region',
    accessLevel: 'EDITOR', parent: null, parentDimensionKey: null,
  }

  it('hides the move form from an EDITOR and says why', () => {
    // The server checks a bare OWNS edge to re-parent, so an EDITOR grant always fails — and the
    // failure is indistinguishable from "no such dimension", so it cannot be explained after the
    // fact. shareCategoryDimension already grants EDITOR, so this is reachable today.
    render(
      <CategoryNodeEditor meta={EDITOR_DIMENSION_META} browse={makeBrowse()} onClose={vi.fn()} parentOptions={PARENT_OPTIONS} />,
    )
    expect(screen.queryByLabelText('Parent dimension for Region')).not.toBeInTheDocument()
    expect(screen.getByText(/only this dimension's owner can move it/i)).toBeInTheDocument()
  })

  it('still lets an EDITOR rename and add values', () => {
    // EDITOR is sufficient for the other two actions — the stricter gate is scoped to the move.
    render(
      <CategoryNodeEditor meta={EDITOR_DIMENSION_META} browse={makeBrowse()} onClose={vi.fn()} parentOptions={PARENT_OPTIONS} />,
    )
    expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add value' })).toBeInTheDocument()
  })

  it('shows the move form to an OWNER with no owner-only notice', () => {
    render(
      <CategoryNodeEditor meta={DIMENSION_META} browse={makeBrowse()} onClose={vi.fn()} parentOptions={PARENT_OPTIONS} />,
    )
    expect(screen.getByLabelText('Parent dimension for Region')).toBeInTheDocument()
    expect(screen.queryByText(/only this dimension's owner can move it/i)).not.toBeInTheDocument()
  })

  it('shows no move affordance or notice on a value node', () => {
    // Values are not re-parented from this editor at all, so the owner note would be noise.
    render(
      <CategoryNodeEditor meta={VALUE_META} browse={makeBrowse()} onClose={vi.fn()} parentOptions={PARENT_OPTIONS} />,
    )
    expect(screen.queryByLabelText('Parent dimension for Europe')).not.toBeInTheDocument()
    expect(screen.queryByText(/owner can move it/i)).not.toBeInTheDocument()
  })
})

describe('CategoryNodeEditor move dimension', () => {
  it('offers the move form for a dimension but not for a value', () => {
    const browse = makeBrowse()
    const { unmount } = render(
      <CategoryNodeEditor meta={DIMENSION_META} browse={browse} onClose={vi.fn()} parentOptions={PARENT_OPTIONS} />,
    )
    expect(screen.getByLabelText('Parent dimension for Region')).toBeInTheDocument()
    unmount()

    // Values are re-parented through their own dimension's hierarchy, never from this editor —
    // offering the dimension selector here would suggest a value can be moved across dimensions.
    render(<CategoryNodeEditor meta={VALUE_META} browse={browse} onClose={vi.fn()} parentOptions={PARENT_OPTIONS} />)
    expect(screen.queryByLabelText('Parent dimension for Europe')).not.toBeInTheDocument()
  })

  it('pre-selects the dimension current parent', () => {
    render(
      <CategoryNodeEditor meta={NESTED_DIMENSION_META} browse={makeBrowse()} onClose={vi.fn()} parentOptions={PARENT_OPTIONS} />,
    )
    expect(screen.getByLabelText('Parent dimension for Region')).toHaveValue('geo')
  })

  it('pre-selects "No parent (top level)" for a root dimension', () => {
    render(
      <CategoryNodeEditor meta={DIMENSION_META} browse={makeBrowse()} onClose={vi.fn()} parentOptions={PARENT_OPTIONS} />,
    )
    expect(screen.getByLabelText('Parent dimension for Region')).toHaveValue('')
  })

  it('moves the dimension passing both the current and the chosen parent', async () => {
    const browse = makeBrowse()
    render(
      <CategoryNodeEditor meta={NESTED_DIMENSION_META} browse={browse} onClose={vi.fn()} parentOptions={PARENT_OPTIONS} />,
    )
    await userEvent.selectOptions(screen.getByLabelText('Parent dimension for Region'), 'org')
    await userEvent.click(screen.getByRole('button', { name: 'Set parent' }))
    // The current parent travels with the call because a move is disconnect-then-connect: the hook
    // cannot know which edge to drop without it.
    expect(browse.setDimensionParent).toHaveBeenCalledWith('region', 'geo', 'org')
  })

  it('detaches to a root by passing null as the next parent', async () => {
    const browse = makeBrowse()
    render(
      <CategoryNodeEditor meta={NESTED_DIMENSION_META} browse={browse} onClose={vi.fn()} parentOptions={PARENT_OPTIONS} />,
    )
    await userEvent.selectOptions(
      screen.getByLabelText('Parent dimension for Region'),
      screen.getByRole('option', { name: 'No parent (top level)' }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Set parent' }))
    expect(browse.setDimensionParent).toHaveBeenCalledWith('region', 'geo', null)
  })

  it('offers every dimension the caller allows as a parent', () => {
    render(
      <CategoryNodeEditor meta={DIMENSION_META} browse={makeBrowse()} onClose={vi.fn()} parentOptions={PARENT_OPTIONS} />,
    )
    expect(screen.getByRole('option', { name: 'Geography' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Organisation' })).toBeInTheDocument()
  })
})

describe('CategoryNodeEditor section legends', () => {
  // The defect that motivated ADR-260071's editor rework: the forms stacked unlabelled and two of
  // them carried a display-name field, so the add-child form read as "create a dimension here".
  it('names each dimension section so the add-value form cannot read as dimension creation', () => {
    render(
      <CategoryNodeEditor meta={DIMENSION_META} browse={makeBrowse()} onClose={vi.fn()} parentOptions={PARENT_OPTIONS} />,
    )
    expect(screen.getByText('Rename this dimension')).toBeInTheDocument()
    expect(screen.getByText('Move this dimension')).toBeInTheDocument()
    expect(screen.getByText('Add a value to Region')).toBeInTheDocument()
  })

  it('names the value sections after the value, and drops the move section', () => {
    render(<CategoryNodeEditor meta={VALUE_META} browse={makeBrowse()} onClose={vi.fn()} />)
    expect(screen.getByText('Rename this value')).toBeInTheDocument()
    expect(screen.getByText('Add a value under Europe')).toBeInTheDocument()
    expect(screen.queryByText('Move this dimension')).not.toBeInTheDocument()
  })
})

describe('CategoryNodeEditor delete (two-step confirm)', () => {
  it('requires a second confirming click before deleting, then closes', async () => {
    const browse = makeBrowse()
    const onClose = vi.fn()
    render(<CategoryNodeEditor meta={VALUE_META} browse={browse} onClose={onClose} />)

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(browse.removeNode).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))
    expect(browse.removeNode).toHaveBeenCalledWith(
      { kind: 'value', key: 'europe' }, { kind: 'dimension', key: 'region' },
    )
    expect(onClose).toHaveBeenCalled()
  })

  it('Cancel backs out of the confirm step', async () => {
    const browse = makeBrowse()
    render(<CategoryNodeEditor meta={VALUE_META} browse={browse} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(browse.removeNode).not.toHaveBeenCalled()
  })

  it('a failed delete (e.g. CAT-* guard) leaves the editor open', async () => {
    const browse = makeBrowse({ removeNode: vi.fn().mockResolvedValue(false) })
    const onClose = vi.fn()
    render(<CategoryNodeEditor meta={VALUE_META} browse={browse} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('the close control dismisses the editor', async () => {
    const onClose = vi.fn()
    render(<CategoryNodeEditor meta={VALUE_META} browse={makeBrowse()} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Close editor' }))
    expect(onClose).toHaveBeenCalled()
  })
})
