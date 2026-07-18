import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Atom } from '../../api-contract'
import { ArgSlots } from './ArgSlots'
import type { ArgSlotRow } from './ArgSlots'

function makeAtom(uuid: string, title: string): Atom {
  return {
    labels: [],
    bonds: [],
    properties: {
      shellies: { uuid },
      nuclearies: { title, description: '', content: '', operation: '', constants: {} },
    },
  }
}

const ATOMS = [makeAtom('a-1', 'Alpha'), makeAtom('a-2', 'Alps'), makeAtom('a-3', 'Beta')]
const EMPTY_ATOM_ROW: ArgSlotRow = { source: 'atom', value: '' }

describe('ArgSlots', () => {
  it('filters atoms by title and picking one stores the uuid', async () => {
    const onChange = vi.fn()
    render(<ArgSlots rows={[EMPTY_ATOM_ROW]} bounds={{ min: 1 }} atoms={ATOMS} constantKeys={[]} onChange={onChange} />)

    await userEvent.type(screen.getByLabelText('Find atom for argument 1'), 'alp')
    const listbox = screen.getByRole('listbox', { name: 'Atom matches for argument 1' })
    expect(listbox).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Alpha' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Alps' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Beta' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('option', { name: 'Alpha' }))
    expect(onChange).toHaveBeenCalledWith([{ source: 'atom', value: 'a-1' }])
  })

  it('shows a no-match hint for a query with no results', async () => {
    render(<ArgSlots rows={[EMPTY_ATOM_ROW]} bounds={{ min: 1 }} atoms={ATOMS} constantKeys={[]} onChange={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Find atom for argument 1'), 'zzz')
    expect(screen.getByText('No matching atoms.')).toBeInTheDocument()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('a filled slot shows the resolved title with a clear affordance', async () => {
    const onChange = vi.fn()
    render(
      <ArgSlots rows={[{ source: 'atom', value: 'a-3' }]} bounds={{ min: 1 }} atoms={ATOMS} constantKeys={[]} onChange={onChange} />,
    )
    expect(screen.getByText('Beta')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear argument 1' }))
    expect(onChange).toHaveBeenCalledWith([EMPTY_ATOM_ROW])
  })

  it('a filled slot outside the working set falls back to a shortened uuid', () => {
    render(
      <ArgSlots
        rows={[{ source: 'atom', value: '1c7b2b3d-out-of-set' }]}
        bounds={{ min: 1 }}
        atoms={ATOMS}
        constantKeys={[]}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByText('1c7b2b3d…')).toBeInTheDocument()
  })

  it('switching a row to Constant resets its value and offers the constant keys', async () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <ArgSlots rows={[{ source: 'atom', value: 'a-1' }]} bounds={{ min: 1 }} atoms={ATOMS} constantKeys={['taxRate']} onChange={onChange} />,
    )
    await userEvent.selectOptions(screen.getByLabelText('Argument 1 source'), 'constant')
    expect(onChange).toHaveBeenCalledWith([{ source: 'constant', value: '' }])

    rerender(
      <ArgSlots rows={[{ source: 'constant', value: '' }]} bounds={{ min: 1 }} atoms={ATOMS} constantKeys={['taxRate']} onChange={onChange} />,
    )
    await userEvent.selectOptions(screen.getByLabelText('Argument 1 constant'), 'taxRate')
    expect(onChange).toHaveBeenLastCalledWith([{ source: 'constant', value: 'taxRate' }])
  })

  it('adds rows below max and hides the add affordance at max', async () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <ArgSlots rows={[EMPTY_ATOM_ROW]} bounds={{ min: 1, max: 2 }} atoms={ATOMS} constantKeys={[]} onChange={onChange} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add argument' }))
    expect(onChange).toHaveBeenCalledWith([EMPTY_ATOM_ROW, EMPTY_ATOM_ROW])

    rerender(
      <ArgSlots rows={[EMPTY_ATOM_ROW, EMPTY_ATOM_ROW]} bounds={{ min: 1, max: 2 }} atoms={ATOMS} constantKeys={[]} onChange={onChange} />,
    )
    expect(screen.queryByRole('button', { name: 'Add argument' })).not.toBeInTheDocument()
  })

  it('removes rows above min and hides the remove affordance at min', async () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <ArgSlots
        rows={[{ source: 'atom', value: 'a-1' }, EMPTY_ATOM_ROW]}
        bounds={{ min: 1 }}
        atoms={ATOMS}
        constantKeys={[]}
        onChange={onChange}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Remove argument 2' }))
    expect(onChange).toHaveBeenCalledWith([{ source: 'atom', value: 'a-1' }])

    rerender(<ArgSlots rows={[EMPTY_ATOM_ROW]} bounds={{ min: 1 }} atoms={ATOMS} constantKeys={[]} onChange={onChange} />)
    expect(screen.queryByRole('button', { name: /Remove argument/ })).not.toBeInTheDocument()
  })
})
