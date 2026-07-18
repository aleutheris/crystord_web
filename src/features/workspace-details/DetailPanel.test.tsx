import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DetailPanel } from './DetailPanel'
import type { Atom } from '../../api-contract/graph-queries'

function makeAtom(overrides?: Partial<Atom>): Atom {
  return {
    labels: ['Project'],
    bonds: [],
    accessLevel: 'OWNER',
    properties: {
      shellies: { uuid: 'test-uuid-1' },
      nuclearies: {
        title: 'Test Atom',
        description: 'A test description',
        content: 'Some content',
        operation: null,
        constants: null,
      },
    },
    ...overrides,
  }
}

describe('DetailPanel — manual-vs-computed hard fork (ADR-260065)', () => {
  function computedAtom(): Atom {
    const atom = makeAtom()
    atom.properties.nuclearies.operation = '{"name":"SUM","args":["a-2"]}'
    return atom
  }

  it('renders content read-only with the computed-result notice for a computed atom', () => {
    render(<DetailPanel atom={computedAtom()} onUpdate={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByLabelText(/content/i)).toHaveAttribute('readonly')
    expect(screen.getByText(/Computed result/)).toBeInTheDocument()
    // Title/description stay editable — the Compute tab owns only the computed value.
    expect(screen.getByLabelText(/title/i)).not.toHaveAttribute('readonly')
  })

  it('keeps content editable with no notice for a manual atom', () => {
    render(<DetailPanel atom={makeAtom()} onUpdate={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByLabelText(/content/i)).not.toHaveAttribute('readonly')
    expect(screen.queryByText(/Computed result/)).not.toBeInTheDocument()
  })
})

describe('DetailPanel — edit mode', () => {
  it('renders atom details in editable form', () => {
    render(
      <DetailPanel
        atom={makeAtom()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByLabelText(/title/i)).toHaveValue('Test Atom')
    expect(screen.getByLabelText(/description/i)).toHaveValue('A test description')
    expect(screen.getByLabelText(/content/i)).toHaveValue('Some content')
    // No labels field in edit mode — the Classify tab owns labels (ADR-260063 / EPIC-260067).
    expect(screen.queryByLabelText(/labels/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Add label')).not.toBeInTheDocument()
  })

  it('calls onUpdate with modified data on save', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(
      <DetailPanel atom={makeAtom()} onUpdate={onUpdate} onDelete={vi.fn()} onClose={vi.fn()} />,
    )

    const titleInput = screen.getByLabelText(/title/i)
    await user.clear(titleInput)
    await user.type(titleInput, 'Updated Title')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(onUpdate).toHaveBeenCalledOnce()
    const [uuid, atom] = onUpdate.mock.calls[0]!
    expect(uuid).toBe('test-uuid-1')
    expect(atom.properties.nuclearies.title).toBe('Updated Title')
    // The saved atom keeps its labels untouched — Classify owns label edits (ADR-260063).
    expect(atom.labels).toEqual(['Project'])
  })

  it('calls onDelete when delete button is clicked', async () => {
    const onDelete = vi.fn()
    const user = userEvent.setup()
    render(
      <DetailPanel atom={makeAtom()} onUpdate={vi.fn()} onDelete={onDelete} onClose={vi.fn()} />,
    )
    await user.click(screen.getByRole('button', { name: /delete/i }))
    expect(onDelete).toHaveBeenCalledWith('test-uuid-1')
  })

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <DetailPanel atom={makeAtom()} onUpdate={vi.fn()} onDelete={vi.fn()} onClose={onClose} />,
    )
    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('DetailPanel — access-level gating (BI-260061 / REQ-FR-260069)', () => {
  it('is read-only for a VIEWER atom: fields read-only, no Save, no Delete, view-only note', () => {
    render(
      <DetailPanel atom={makeAtom({ accessLevel: 'VIEWER' })} onUpdate={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.getByLabelText(/title/i)).toHaveAttribute('readonly')
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
    expect(screen.getByText(/view-only access/i)).toBeInTheDocument()
  })

  it('lets an EDITOR edit and save but not delete (destroy is owner-only)', () => {
    render(
      <DetailPanel atom={makeAtom({ accessLevel: 'EDITOR' })} onUpdate={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.getByLabelText(/title/i)).not.toHaveAttribute('readonly')
    expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
  })

  it('lets an OWNER edit, save, and delete', () => {
    render(
      <DetailPanel atom={makeAtom({ accessLevel: 'OWNER' })} onUpdate={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
  })

  it('defaults a missing access level to read-only', () => {
    render(
      <DetailPanel atom={makeAtom({ accessLevel: null })} onUpdate={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument()
    expect(screen.getByText(/view-only access/i)).toBeInTheDocument()
  })

  it('hides Delete for an owner when no delete handler is wired', () => {
    render(
      <DetailPanel atom={makeAtom({ accessLevel: 'OWNER' })} onUpdate={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
  })

  it('ignores a form submit on a read-only atom (no update dispatched)', () => {
    const onUpdate = vi.fn()
    const { container } = render(
      <DetailPanel atom={makeAtom({ accessLevel: 'VIEWER' })} onUpdate={onUpdate} onClose={vi.fn()} />,
    )
    fireEvent.submit(container.querySelector('form')!)
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('save is a no-op when an editable atom has no update handler', async () => {
    const user = userEvent.setup()
    render(<DetailPanel atom={makeAtom({ accessLevel: 'OWNER' })} onClose={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    expect(screen.getByLabelText(/title/i)).toHaveValue('Test Atom')
  })
})

describe('DetailPanel — creation mode', () => {
  it('shows "Create New Atom" heading when isCreationMode is true', () => {
    render(
      <DetailPanel isCreationMode={true} onCreate={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.getByRole('heading', { name: /create new atom/i })).toBeInTheDocument()
  })

  it('has accessible label "Create atom" in creation mode', () => {
    render(
      <DetailPanel isCreationMode={true} onCreate={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.getByRole('complementary', { name: /create atom/i })).toBeInTheDocument()
  })

  it('starts with empty form fields in creation mode', () => {
    render(
      <DetailPanel isCreationMode={true} onCreate={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.getByLabelText(/title/i)).toHaveValue('')
    // Creation labels use the shared chip editor (ADR-260063): empty input, no chips yet.
    expect(screen.getByLabelText('Add label')).toHaveValue('')
    expect(screen.queryByRole('button', { name: /^remove /i })).not.toBeInTheDocument()
    expect(screen.getByLabelText(/description/i)).toHaveValue('')
    expect(screen.getByLabelText(/content/i)).toHaveValue('')
  })

  it('shows "Create" button instead of "Save" in creation mode', () => {
    render(
      <DetailPanel isCreationMode={true} onCreate={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: /^create$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument()
  })

  it('does not show Delete button in creation mode', () => {
    render(
      <DetailPanel isCreationMode={true} onCreate={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
  })

  it('calls onCreate with form values when Create is clicked', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(
      <DetailPanel isCreationMode={true} onCreate={onCreate} onClose={vi.fn()} />,
    )

    await user.type(screen.getByLabelText(/title/i), 'New Node')
    await user.type(screen.getByLabelText('Add label'), 'Tag1{Enter}Tag2{Enter}')
    await user.type(screen.getByLabelText(/description/i), 'My description')
    await user.type(screen.getByLabelText(/content/i), 'My content')
    await user.click(screen.getByRole('button', { name: /^create$/i }))

    expect(onCreate).toHaveBeenCalledOnce()
    const [title, labels, description, content] = onCreate.mock.calls[0]!
    expect(title).toBe('New Node')
    expect(labels).toEqual(['Tag1', 'Tag2'])
    expect(description).toBe('My description')
    expect(content).toBe('My content')
  })

  it('removing a chip in creation mode drops the label from the created atom', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(
      <DetailPanel isCreationMode={true} onCreate={onCreate} onClose={vi.fn()} />,
    )

    await user.type(screen.getByLabelText(/title/i), 'New Node')
    await user.type(screen.getByLabelText('Add label'), 'Tag1{Enter}Tag2{Enter}')
    await user.click(screen.getByRole('button', { name: 'Remove Tag1' }))
    await user.click(screen.getByRole('button', { name: /^create$/i }))

    expect(onCreate.mock.calls[0]![1]).toEqual(['Tag2'])
  })

  it('calls onClose when close button is clicked in creation mode', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <DetailPanel isCreationMode={true} onCreate={vi.fn()} onClose={onClose} />,
    )
    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows "Creating…" on submit button while saving', async () => {
    let resolveCreate!: () => void
    const onCreate = vi.fn().mockImplementation(
      () => new Promise<void>((res) => { resolveCreate = res }),
    )
    const user = userEvent.setup()

    render(
      <DetailPanel isCreationMode={true} onCreate={onCreate} onClose={vi.fn()} />,
    )

    await user.type(screen.getByLabelText(/title/i), 'Test')
    await user.click(screen.getByRole('button', { name: /^create$/i }))

    expect(screen.getByRole('button', { name: /creating/i })).toBeDisabled()
    resolveCreate()
  })
})
