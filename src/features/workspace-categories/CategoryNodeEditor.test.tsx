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
    createValue: vi.fn().mockResolvedValue(true),
    renameNode: vi.fn().mockResolvedValue(true),
    removeNode: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

const DIMENSION_META: CategoryNodeMeta = {
  kind: 'dimension', key: 'region', displayName: 'Region', dimensionKey: 'region', accessLevel: 'OWNER', parent: null,
}

const VALUE_META: CategoryNodeMeta = {
  kind: 'value', key: 'europe', displayName: 'Europe', dimensionKey: 'region', accessLevel: 'EDITOR',
  parent: { kind: 'dimension', key: 'region' },
}

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
