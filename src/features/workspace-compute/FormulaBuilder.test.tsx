import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Atom } from '../../api-contract'
import { FormulaBuilder } from './FormulaBuilder'

vi.mock('./use-operations', () => ({
  useOperations: () => ({
    operations: [
      { name: 'SUM', description: 'Add the inputs together.' },
      { name: 'MINUS', description: 'Subtract the second input from the first.' },
      { name: 'PRODUCT', description: 'Multiply the inputs.' },
      { name: 'DIVIDE', description: 'Divide the first input by the second.' },
      { name: 'COLLECT', description: 'Collect atoms via a registered query.' },
    ],
    loading: false,
  }),
}))

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

const ATOMS = [makeAtom('a-1', 'Alpha'), makeAtom('a-2', 'Beta')]

function renderBuilder(overrides: Partial<Parameters<typeof FormulaBuilder>[0]> = {}) {
  const onSave = vi.fn()
  const onCancel = vi.fn()
  render(
    <FormulaBuilder
      initial={null}
      initialConstants={{}}
      atoms={ATOMS}
      saving={false}
      onSave={onSave}
      onCancel={onCancel}
      {...overrides}
    />,
  )
  return { onSave, onCancel }
}

async function pickAtom(argIndex: number, query: string, title: string) {
  await userEvent.type(screen.getByLabelText(`Find atom for argument ${argIndex}`), query)
  await userEvent.click(screen.getByRole('option', { name: title }))
}

describe('FormulaBuilder — fresh formula', () => {
  it('defaults to SUM with one empty slot, its description, and a blocked save', () => {
    renderBuilder()
    expect(screen.getByLabelText('Operation')).toHaveValue('SUM')
    expect(screen.getByText('Add the inputs together.')).toBeInTheDocument()
    expect(screen.getByLabelText('Find atom for argument 1')).toBeInTheDocument()
    expect(screen.getByText('Fill every argument slot.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save formula' })).toBeDisabled()
  })

  it('builds and saves a SUM over two atoms without any JSON typing', async () => {
    const { onSave } = renderBuilder()
    await userEvent.click(screen.getByRole('button', { name: 'Add argument' }))
    await pickAtom(1, 'Alp', 'Alpha')
    await pickAtom(2, 'Bet', 'Beta')

    const save = screen.getByRole('button', { name: 'Save formula' })
    expect(save).toBeEnabled()
    await userEvent.click(save)
    expect(onSave).toHaveBeenCalledWith({ name: 'SUM', args: ['a-1', 'a-2'] }, {})
  })

  it('switching operations refits the slots to the new arity', async () => {
    renderBuilder()
    await userEvent.selectOptions(screen.getByLabelText('Operation'), 'MINUS')
    // MINUS is exactly-2: a second slot appears and no add affordance remains.
    expect(screen.getByLabelText('Find atom for argument 2')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add argument' })).not.toBeInTheDocument()
  })

  it('saves constants (numeric-looking values as numbers) and constant args', async () => {
    const { onSave } = renderBuilder()
    await pickAtom(1, 'Alp', 'Alpha')
    await userEvent.click(screen.getByRole('button', { name: 'Add argument' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add constant' }))
    await userEvent.type(screen.getByLabelText('Constant 1 key'), 'taxRate')
    await userEvent.type(screen.getByLabelText('Constant 1 value'), '0.21')
    await userEvent.selectOptions(screen.getByLabelText('Argument 2 source'), 'constant')
    await userEvent.selectOptions(screen.getByLabelText('Argument 2 constant'), 'taxRate')

    await userEvent.click(screen.getByRole('button', { name: 'Save formula' }))
    expect(onSave).toHaveBeenCalledWith({ name: 'SUM', args: ['a-1', 'taxRate'] }, { taxRate: 0.21 })
  })

  it('drops constants with empty keys and keeps non-numeric values as strings', async () => {
    const { onSave } = renderBuilder()
    await pickAtom(1, 'Alp', 'Alpha')
    await userEvent.click(screen.getByRole('button', { name: 'Add constant' }))
    await userEvent.type(screen.getByLabelText('Constant 1 value'), 'orphan')
    await userEvent.click(screen.getByRole('button', { name: 'Add constant' }))
    await userEvent.type(screen.getByLabelText('Constant 2 key'), 'region')
    await userEvent.type(screen.getByLabelText('Constant 2 value'), 'eu-west')

    await userEvent.click(screen.getByRole('button', { name: 'Save formula' }))
    expect(onSave).toHaveBeenCalledWith({ name: 'SUM', args: ['a-1'] }, { region: 'eu-west' })
  })

  it('blocks save when a constant arg references a key that was removed', async () => {
    renderBuilder()
    await userEvent.click(screen.getByRole('button', { name: 'Add constant' }))
    await userEvent.type(screen.getByLabelText('Constant 1 key'), 'k')
    await userEvent.selectOptions(screen.getByLabelText('Argument 1 source'), 'constant')
    await userEvent.selectOptions(screen.getByLabelText('Argument 1 constant'), 'k')
    await userEvent.click(screen.getByRole('button', { name: 'Remove constant 1' }))

    expect(screen.getByText('A constant argument references a key that no longer exists.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save formula' })).toBeDisabled()
  })

  it('cancel invokes onCancel and a saving flight disables save', async () => {
    const { onCancel } = renderBuilder({ saving: true, initial: { name: 'SUM', args: ['a-1'] } })
    expect(screen.getByRole('button', { name: 'Save formula' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })
})

describe('FormulaBuilder — pre-filled from an existing payload', () => {
  it('seeds the slots from the payload with constant args recognized', () => {
    renderBuilder({
      initial: { name: 'DIVIDE', args: ['a-1', 'divisor'] },
      initialConstants: { divisor: 4 },
    })
    expect(screen.getByLabelText('Operation')).toHaveValue('DIVIDE')
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByLabelText('Argument 2 constant')).toHaveValue('divisor')
    expect(screen.getByLabelText('Constant 1 value')).toHaveValue('4')
    expect(screen.getByRole('button', { name: 'Save formula' })).toBeEnabled()
  })

  it('keeps a previously saved unknown operation selectable (generic variadic editor)', () => {
    renderBuilder({ initial: { name: 'FUTURE_OP', args: [] } })
    expect(screen.getByLabelText('Operation')).toHaveValue('FUTURE_OP')
    // Unknown ops have no description and a min-0 arity: save is immediately possible.
    expect(screen.getByRole('button', { name: 'Save formula' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Add argument' })).toBeInTheDocument()
  })
})

describe('FormulaBuilder — COLLECT', () => {
  it('switching to COLLECT shows the query select and the labels chip editor', async () => {
    const { onSave } = renderBuilder()
    await userEvent.selectOptions(screen.getByLabelText('Operation'), 'COLLECT')
    expect(screen.getByLabelText('Collect query')).toHaveValue('atoms_with_labels')

    const labelInput = screen.getByLabelText('Add label')
    await userEvent.type(labelInput, 'Revenue{Enter}')
    await userEvent.type(labelInput, 'Q1{Enter}')
    await userEvent.click(screen.getByRole('button', { name: 'Remove Q1' }))

    await userEvent.click(screen.getByRole('button', { name: 'Save formula' }))
    expect(onSave).toHaveBeenCalledWith({ name: 'COLLECT', args: ['atoms_with_labels'] }, { labels: ['Revenue'] })
  })

  it('the other… option takes a free-text query name and blocks save until filled', async () => {
    const { onSave } = renderBuilder({ initial: { name: 'COLLECT', args: [] } })
    await userEvent.selectOptions(screen.getByLabelText('Collect query'), '__other__')
    expect(screen.getByText('Enter the collect query name.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save formula' })).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Custom collect query name'), 'atoms_by_owner')
    await userEvent.click(screen.getByRole('button', { name: 'Save formula' }))
    // An unregistered query has no known label requirement, so an empty list stays permitted.
    expect(onSave).toHaveBeenCalledWith({ name: 'COLLECT', args: ['atoms_by_owner'] }, { labels: [] })
  })

  it('blocks saving atoms_with_labels with no labels — it would collect every owned atom', async () => {
    const { onSave } = renderBuilder({ initial: { name: 'COLLECT', args: ['atoms_with_labels'] } })
    expect(
      screen.getByText('Add at least one label — this query would otherwise collect every atom you own.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save formula' })).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Add label'), 'Revenue{Enter}')
    await userEvent.click(screen.getByRole('button', { name: 'Save formula' }))
    expect(onSave).toHaveBeenCalledWith({ name: 'COLLECT', args: ['atoms_with_labels'] }, { labels: ['Revenue'] })
  })

  it('commits a typed-but-un-Entered label instead of dropping it (ADR-260027 D2)', async () => {
    const { onSave } = renderBuilder({ initial: { name: 'COLLECT', args: ['atoms_with_labels'] } })
    // No Enter: the chip never forms, but the draft is what the user meant to collect.
    await userEvent.type(screen.getByLabelText('Add label'), 'Invoice')
    expect(screen.getByRole('button', { name: 'Save formula' })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: 'Save formula' }))
    expect(onSave).toHaveBeenCalledWith({ name: 'COLLECT', args: ['atoms_with_labels'] }, { labels: ['Invoice'] })
  })

  it('does not double-add a draft that already exists as a chip', async () => {
    const { onSave } = renderBuilder({ initial: { name: 'COLLECT', args: ['atoms_with_labels'] } })
    const labelInput = screen.getByLabelText('Add label')
    await userEvent.type(labelInput, 'Invoice{Enter}')
    await userEvent.type(labelInput, 'Invoice')

    await userEvent.click(screen.getByRole('button', { name: 'Save formula' }))
    expect(onSave).toHaveBeenCalledWith({ name: 'COLLECT', args: ['atoms_with_labels'] }, { labels: ['Invoice'] })
  })

  it('pre-fills a known COLLECT payload with its labels constant', () => {
    renderBuilder({
      initial: { name: 'COLLECT', args: ['atoms_with_labels'] },
      initialConstants: { labels: ['Revenue', 7] },
    })
    expect(screen.getByLabelText('Collect query')).toHaveValue('atoms_with_labels')
    // Non-string entries in a hand-written labels constant are dropped, not crashed on.
    expect(screen.getByText('Revenue')).toBeInTheDocument()
    expect(screen.queryByText('7')).not.toBeInTheDocument()
  })

  it('pre-fills an unregistered COLLECT query through the other… path', () => {
    renderBuilder({ initial: { name: 'COLLECT', args: ['atoms_by_owner'] } })
    expect(screen.getByLabelText('Collect query')).toHaveValue('__other__')
    expect(screen.getByLabelText('Custom collect query name')).toHaveValue('atoms_by_owner')
  })
})
