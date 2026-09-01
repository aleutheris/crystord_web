import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Atom } from '../../api-contract'
import { FormulaBuilder } from './FormulaBuilder'

/** Per-test overrides on the taxonomy hook (hoisted — `vi.mock` factories run before imports). */
const { categoryState } = vi.hoisted(() => ({ categoryState: { overrides: {} as Record<string, unknown> } }))

// `region` carries an owned value and a granted one; the granted value is offered by
// retrieveCategoryValues but cannot be resolved by the COLLECT queries (user-guide.md:1320).
vi.mock('./use-category-options', () => ({
  useCategoryOptions: (dimensionKey: string) => ({
    dimensions: [
      { key: 'region', displayName: 'Region', description: null, parentDimensionKeys: [], accessLevel: 'OWNER', ownerUsername: 'me' },
      { key: 'stage', displayName: 'Stage', description: null, parentDimensionKeys: [], accessLevel: 'OWNER', ownerUsername: 'me' },
    ],
    values: dimensionKey === 'region'
      ? [
        { key: 'europe', displayName: 'Europe', description: null, dimensionKey: 'region', parentValueKeys: [], accessLevel: 'OWNER', ownerUsername: 'me' },
        { key: 'benelux', displayName: 'Benelux', description: null, dimensionKey: 'region', parentValueKeys: [], accessLevel: 'VIEWER', ownerUsername: 'someone-else' },
      ]
      : [],
    dimensionsAuthoritative: true,
    valuesAuthoritative: dimensionKey === 'region',
    dimensionsTruncated: false,
    valuesTruncated: false,
    loading: false,
    error: null,
    ...categoryState.overrides,
  }),
}))

beforeEach(() => {
  categoryState.overrides = {}
})

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

  it('blocks saving atoms_with_labels with no labels — the query would fail evaluation', async () => {
    const { onSave } = renderBuilder({ initial: { name: 'COLLECT', args: ['atoms_with_labels'] } })
    expect(
      screen.getByText('Add at least one label — this query cannot run with an empty filter.'),
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

describe('FormulaBuilder — category COLLECT (EPIC-260082)', () => {
  it('swaps the labels editor for dimension/value pickers on a category query', async () => {
    renderBuilder({ initial: { name: 'COLLECT', args: ['atoms_with_labels'] } })
    expect(screen.getByLabelText('Add label')).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Collect query'), 'atoms_in_category_value')

    expect(screen.getByLabelText('Category dimension')).toBeInTheDocument()
    expect(screen.getByLabelText('Category value')).toBeInTheDocument()
    expect(screen.queryByLabelText('Add label')).not.toBeInTheDocument()
  })

  it('blocks the save until both category constants are chosen', async () => {
    const { onSave } = renderBuilder({ initial: { name: 'COLLECT', args: ['atoms_in_category_value'] } })
    // Since 9.3.0 an empty required constant fails evaluation either way (user-guide.md:1305);
    // the message differs only in the action it asks for.
    expect(
      screen.getByText('Choose a category dimension and value — this query cannot run with an empty filter.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save formula' })).toBeDisabled()

    await userEvent.selectOptions(screen.getByLabelText('Category dimension'), 'region')
    // A dimension alone is still incomplete.
    expect(screen.getByRole('button', { name: 'Save formula' })).toBeDisabled()

    await userEvent.selectOptions(screen.getByLabelText('Category value'), 'europe')
    await userEvent.click(screen.getByRole('button', { name: 'Save formula' }))
    expect(onSave).toHaveBeenCalledWith(
      { name: 'COLLECT', args: ['atoms_in_category_value'] },
      { dimension_key: 'region', value_key: 'europe' },
    )
  })

  it('writes the category constants and no labels constant', async () => {
    const { onSave } = renderBuilder({
      initial: { name: 'COLLECT', args: ['atoms_in_category_subtree'] },
      initialConstants: { dimension_key: 'region', value_key: 'europe' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save formula' }))

    const constants = onSave.mock.calls[0]![1]
    expect(constants).toEqual({ dimension_key: 'region', value_key: 'europe' })
    expect(constants).not.toHaveProperty('labels')
  })

  it('pre-fills stored category constants into the pickers', () => {
    renderBuilder({
      initial: { name: 'COLLECT', args: ['atoms_in_category_subtree'] },
      initialConstants: { dimension_key: 'region', value_key: 'europe' },
    })
    expect(screen.getByLabelText('Collect query')).toHaveValue('atoms_in_category_subtree')
    expect(screen.getByLabelText('Category dimension')).toHaveValue('region')
    expect(screen.getByLabelText('Category value')).toHaveValue('europe')
  })

  it('clears the value when the dimension changes — a value never survives its dimension', async () => {
    renderBuilder({
      initial: { name: 'COLLECT', args: ['atoms_in_category_value'] },
      initialConstants: { dimension_key: 'region', value_key: 'europe' },
    })
    await userEvent.selectOptions(screen.getByLabelText('Category dimension'), 'stage')
    expect(screen.getByLabelText('Category value')).toHaveValue('')
  })

  it('drops an uncommitted label draft when the editor swaps away and back', async () => {
    const { onSave } = renderBuilder({ initial: { name: 'COLLECT', args: ['atoms_with_labels'] } })
    // Typed but never Entered, so no chip exists — only FormulaBuilder's draft holds it.
    await userEvent.type(screen.getByLabelText('Add label'), 'Invoice')
    await userEvent.selectOptions(screen.getByLabelText('Collect query'), 'atoms_in_category_value')
    await userEvent.selectOptions(screen.getByLabelText('Collect query'), 'atoms_with_labels')

    // The chip editor remounts empty; a draft surviving here would be saved invisibly, and would
    // also wrongly satisfy the empty-labels gate.
    expect(screen.getByLabelText('Add label')).toHaveValue('')
    expect(
      screen.getByText('Add at least one label — this query cannot run with an empty filter.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save formula' })).toBeDisabled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('drops an uncommitted label draft when the operation leaves COLLECT', async () => {
    renderBuilder({ initial: { name: 'COLLECT', args: ['atoms_with_labels'] } })
    await userEvent.type(screen.getByLabelText('Add label'), 'Invoice')
    await userEvent.selectOptions(screen.getByLabelText('Operation'), 'SUM')
    await userEvent.selectOptions(screen.getByLabelText('Operation'), 'COLLECT')

    expect(screen.getByLabelText('Add label')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Save formula' })).toBeDisabled()
  })

  it('keeps an uncommitted draft while the label editor stays on screen (ADR-260027 D2)', async () => {
    const { onSave } = renderBuilder({ initial: { name: 'COLLECT', args: ['atoms_with_labels'] } })
    await userEvent.selectOptions(screen.getByLabelText('Collect query'), '__other__')
    const custom = screen.getByLabelText('Custom collect query name')
    await userEvent.type(custom, 'atoms_by_owner')
    // The labels editor never unmounts across this edit, so the draft must survive it.
    await userEvent.type(screen.getByLabelText('Add label'), 'Invoice')
    await userEvent.type(custom, '_v2')
    await userEvent.click(screen.getByRole('button', { name: 'Save formula' }))

    expect(onSave).toHaveBeenCalledWith(
      { name: 'COLLECT', args: ['atoms_by_owner_v2'] },
      { labels: ['Invoice'] },
    )
  })

  it('offers a shared value but will not let it be chosen', async () => {
    renderBuilder({ initial: { name: 'COLLECT', args: ['atoms_in_category_value'] } })
    await userEvent.selectOptions(screen.getByLabelText('Category dimension'), 'region')

    expect(screen.getByRole('option', { name: 'Europe' })).toBeEnabled()
    expect(screen.getByRole('option', { name: 'Benelux (shared with you — cannot be collected)' })).toBeDisabled()
  })

  it('blocks the save on a stored value the caller does not own', async () => {
    // Reachable through normal use: assignments are limited to READABLE taxonomy
    // (user-guide.md:1102-1104), so a user can classify at a value they cannot collect.
    const { onSave } = renderBuilder({
      initial: { name: 'COLLECT', args: ['atoms_in_category_subtree'] },
      initialConstants: { dimension_key: 'region', value_key: 'benelux' },
    })

    // Both required constants are present, so the generic gate is satisfied — only the
    // ownership rule stands between this formula and a computed atom that collects nothing.
    expect(
      screen.getByText('Choose a category value you own — this query cannot resolve a value shared with you, so it would collect nothing.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save formula' })).toBeDisabled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('unblocks once an owned value replaces the shared one', async () => {
    const { onSave } = renderBuilder({
      initial: { name: 'COLLECT', args: ['atoms_in_category_subtree'] },
      initialConstants: { dimension_key: 'region', value_key: 'benelux' },
    })
    await userEvent.selectOptions(screen.getByLabelText('Category value'), 'europe')

    await userEvent.click(screen.getByRole('button', { name: 'Save formula' }))
    expect(onSave).toHaveBeenCalledWith(
      { name: 'COLLECT', args: ['atoms_in_category_subtree'] },
      { dimension_key: 'region', value_key: 'europe' },
    )
  })

  it('leaves the dimension picker unfiltered — a granted dimension is usable by key', async () => {
    renderBuilder({ initial: { name: 'COLLECT', args: ['atoms_in_category_value'] } })
    // user-guide.md:1320 — "the dimension is matched by key, so your own value under a shared
    // dimension works too". Filtering dimensions would hide working configurations.
    expect(screen.getByRole('option', { name: 'Region' })).toBeEnabled()
    expect(screen.getByRole('option', { name: 'Stage' })).toBeEnabled()
  })

  it('keeps the chosen dimension and value when swapping exact for subtree', async () => {
    const { onSave } = renderBuilder({
      initial: { name: 'COLLECT', args: ['atoms_in_category_value'] },
      initialConstants: { dimension_key: 'region', value_key: 'europe' },
    })
    // Both queries share the category editor, so the selection must survive the swap.
    await userEvent.selectOptions(screen.getByLabelText('Collect query'), 'atoms_in_category_subtree')
    expect(screen.getByLabelText('Category dimension')).toHaveValue('region')
    expect(screen.getByLabelText('Category value')).toHaveValue('europe')

    await userEvent.click(screen.getByRole('button', { name: 'Save formula' }))
    expect(onSave).toHaveBeenCalledWith(
      { name: 'COLLECT', args: ['atoms_in_category_subtree'] },
      { dimension_key: 'region', value_key: 'europe' },
    )
  })

  it('typing a registered category query into the free-text box swaps to its editor', async () => {
    renderBuilder({ initial: { name: 'COLLECT', args: ['atoms_with_labels'] } })
    await userEvent.selectOptions(screen.getByLabelText('Collect query'), '__other__')
    await userEvent.type(screen.getByLabelText('Custom collect query name'), 'atoms_in_category_value')

    // A name we recognise is treated as that query, however it was entered.
    expect(screen.getByLabelText('Category dimension')).toBeInTheDocument()
    expect(screen.queryByLabelText('Add label')).not.toBeInTheDocument()
    expect(
      screen.getByText('Choose a category dimension and value — this query cannot run with an empty filter.'),
    ).toBeInTheDocument()
  })

  it('does not leak the query’s own constants into the generic constants editor', async () => {
    const { onSave } = renderBuilder({
      initial: { name: 'COLLECT', args: ['atoms_in_category_value'] },
      initialConstants: { dimension_key: 'region', value_key: 'europe' },
    })
    await userEvent.selectOptions(screen.getByLabelText('Operation'), 'SUM')

    // The COLLECT editor owns these keys; they are not hand-edited rows (as `labels` never was).
    expect(screen.queryByLabelText('Constant 1 key')).not.toBeInTheDocument()
    expect(screen.getByText('No constants defined.')).toBeInTheDocument()

    await pickAtom(1, 'Alp', 'Alpha')
    await userEvent.click(screen.getByRole('button', { name: 'Save formula' }))
    expect(onSave).toHaveBeenCalledWith({ name: 'SUM', args: ['a-1'] }, {})
  })

  it('leaves a non-COLLECT atom’s own constants alone even when they share a reserved name', async () => {
    // `dimension_key`/`value_key` are plausible user-authored constant names in a taxonomy-heavy
    // product. Reserving them on an atom that was never a COLLECT blocks the user's own save.
    const { onSave } = renderBuilder({
      initial: { name: 'SUM', args: ['a-1', 'value_key'] },
      initialConstants: { value_key: 5 },
    })

    expect(screen.getByLabelText('Constant 1 key')).toHaveValue('value_key')
    expect(
      screen.queryByText('A constant argument references a key that no longer exists.'),
    ).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save formula' }))
    expect(onSave).toHaveBeenCalledWith({ name: 'SUM', args: ['a-1', 'value_key'] }, { value_key: 5 })
  })

  it('keeps a non-COLLECT atom’s `labels` constant too — the pre-epic reservation was global', async () => {
    // `labels` was filtered unconditionally before this epic, so a SUM carrying it had the same
    // bug. Scoping the reservation to COLLECT-initial atoms fixes that older case as well.
    const { onSave } = renderBuilder({
      initial: { name: 'SUM', args: ['a-1'] },
      initialConstants: { labels: 'annual' },
    })
    expect(screen.getByLabelText('Constant 1 key')).toHaveValue('labels')

    await userEvent.click(screen.getByRole('button', { name: 'Save formula' }))
    expect(onSave).toHaveBeenCalledWith({ name: 'SUM', args: ['a-1'] }, { labels: 'annual' })
  })

  it('does not silently drop a non-COLLECT atom’s reserved-name constant on save', async () => {
    const { onSave } = renderBuilder({
      initial: { name: 'SUM', args: ['a-1'] },
      initialConstants: { dimension_key: 'not-a-taxonomy-key' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save formula' }))

    expect(onSave).toHaveBeenCalledWith({ name: 'SUM', args: ['a-1'] }, { dimension_key: 'not-a-taxonomy-key' })
  })

  it('switching back to the label query writes labels again, not stale category keys', async () => {
    const { onSave } = renderBuilder({
      initial: { name: 'COLLECT', args: ['atoms_in_category_value'] },
      initialConstants: { dimension_key: 'region', value_key: 'europe' },
    })
    await userEvent.selectOptions(screen.getByLabelText('Collect query'), 'atoms_with_labels')
    await userEvent.type(screen.getByLabelText('Add label'), 'Invoice{Enter}')
    await userEvent.click(screen.getByRole('button', { name: 'Save formula' }))

    expect(onSave).toHaveBeenCalledWith(
      { name: 'COLLECT', args: ['atoms_with_labels'] },
      { labels: ['Invoice'] },
    )
  })
})

describe('FormulaBuilder — category COLLECT while the taxonomy is still loading', () => {
  /** Mid-flight the value list is empty, so a stored key has no access data attached to it. */
  const IN_FLIGHT = { values: [], valuesAuthoritative: false, loading: true }

  it('blocks the save until the stored value has been checked', () => {
    categoryState.overrides = IN_FLIGHT
    const { onSave } = renderBuilder({
      initial: { name: 'COLLECT', args: ['atoms_in_category_subtree'] },
      initialConstants: { dimension_key: 'region', value_key: 'benelux' },
    })

    // `benelux` is granted, not owned — but nothing on hand says so yet. Saving now would slip
    // it past the ownership gate, and re-opening a collects-nothing atom is exactly the case
    // that gate exists for.
    expect(screen.getByText('Checking the selected category value…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save formula' })).toBeDisabled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('blocks a stored value that turns out to be granted once the check completes', () => {
    renderBuilder({
      initial: { name: 'COLLECT', args: ['atoms_in_category_subtree'] },
      initialConstants: { dimension_key: 'region', value_key: 'benelux' },
    })
    expect(
      screen.getByText('Choose a category value you own — this query cannot resolve a value shared with you, so it would collect nothing.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save formula' })).toBeDisabled()
  })

  it('releases the save once an owned value has been checked', async () => {
    const { onSave } = renderBuilder({
      initial: { name: 'COLLECT', args: ['atoms_in_category_subtree'] },
      initialConstants: { dimension_key: 'region', value_key: 'europe' },
    })
    expect(screen.queryByText('Checking the selected category value…')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save formula' }))
    expect(onSave).toHaveBeenCalledWith(
      { name: 'COLLECT', args: ['atoms_in_category_subtree'] },
      { dimension_key: 'region', value_key: 'europe' },
    )
  })

  it('prefers the unset-constants message over the checking one for a fresh formula', () => {
    categoryState.overrides = IN_FLIGHT
    renderBuilder({ initial: { name: 'COLLECT', args: ['atoms_in_category_value'] } })

    // Nothing is selected yet, so "pick a dimension and value" is the useful instruction.
    expect(
      screen.getByText('Choose a category dimension and value — this query cannot run with an empty filter.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Checking the selected category value…')).not.toBeInTheDocument()
  })

  it('never blocks the labels editor on a category load', async () => {
    // The real hook is disabled for the labels editor, so this can only fire if the gate forgets
    // to check which editor is showing — the mock ignores `enabled` precisely to catch that.
    categoryState.overrides = IN_FLIGHT
    const { onSave } = renderBuilder({
      initial: { name: 'COLLECT', args: ['atoms_with_labels'] },
      initialConstants: { labels: ['Invoice'] },
    })

    expect(screen.queryByText('Checking the selected category value…')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save formula' }))
    expect(onSave).toHaveBeenCalledWith(
      { name: 'COLLECT', args: ['atoms_with_labels'] },
      { labels: ['Invoice'] },
    )
  })

  it('passes the page-ceiling notice through to the pickers', () => {
    categoryState.overrides = { valuesTruncated: true }
    renderBuilder({
      initial: { name: 'COLLECT', args: ['atoms_in_category_value'] },
      initialConstants: { dimension_key: 'region', value_key: 'europe' },
    })
    expect(screen.getByText('Showing the first 100 values; there may be more.')).toBeInTheDocument()
  })
})
