import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormulaBuilder } from './FormulaBuilder'

/**
 * The `enabled` argument the draft hands the taxonomy hook, per render. Asserted on the ARGUMENT
 * rather than on a request count: `useCategoryOptions` dedupes per mount, so a wrongly-armed flag
 * issues no second read today and a count-based test would pass with or without the gate.
 */
const { categoryCalls } = vi.hoisted(() => ({ categoryCalls: [] as boolean[] }))

// Records the gate and always reports a loaded taxonomy — the point here is which argument the
// draft passes, not what the hook does with it (that is `use-category-options.test.ts`).
vi.mock('./use-category-options', () => ({
  useCategoryOptions: (dimensionKey: string, enabled: boolean) => {
    categoryCalls.push(enabled)
    return {
      dimensions: [
        { key: 'region', displayName: 'Region', description: null, parentDimensionKeys: [], accessLevel: 'OWNER', ownerUsername: 'me' },
      ],
      values: dimensionKey === 'region'
        ? [{ key: 'europe', displayName: 'Europe', description: null, dimensionKey: 'region', parentValueKeys: [], accessLevel: 'OWNER', ownerUsername: 'me' }]
        : [],
      dimensionsAuthoritative: true,
      valuesAuthoritative: dimensionKey === 'region',
      dimensionsTruncated: false,
      valuesTruncated: false,
      loading: false,
      error: null,
    }
  },
}))

vi.mock('./use-operations', () => ({
  useOperations: () => ({
    operations: [
      { name: 'SUM', description: 'Add the inputs together.' },
      { name: 'COLLECT', description: 'Collect atoms via a registered query.' },
    ],
    loading: false,
  }),
}))

beforeEach(() => {
  categoryCalls.length = 0
})

/** The gate as of the latest render — earlier renders may predate the change under test. */
function armed(): boolean {
  return categoryCalls[categoryCalls.length - 1]!
}

function renderBuilder(overrides: Partial<Parameters<typeof FormulaBuilder>[0]> = {}) {
  render(
    <FormulaBuilder
      initial={null}
      initialConstants={{}}
      atoms={[]}
      saving={false}
      onSave={vi.fn()}
      onCancel={vi.fn()}
      {...overrides}
    />,
  )
}

/**
 * The gate's full truth table. Only ONE of these is a guard — 'disarms the fetch when the
 * operation picker leaves COLLECT' is the sole case where `collectSelected` and
 * `editor === 'category'` disagree, so it is the only one that fails if the gate is reverted to
 * `editor === 'category'`. The other four pin the surrounding behaviour and pass either way; they
 * are kept as characterization, not counted as guards, because this project's standing bar is
 * that a guard test is one verified to fail without its fix.
 */
describe('useCollectDraft — the taxonomy fetch is gated on the selected OPERATION', () => {
  it('arms the fetch while a category COLLECT is the selected operation', () => {
    renderBuilder({ initial: { name: 'COLLECT', args: ['atoms_in_category_value'] } })
    expect(screen.getByLabelText('Category dimension')).toBeInTheDocument()
    expect(armed()).toBe(true)
  })

  it('disarms the fetch when the operation picker leaves COLLECT', async () => {
    // THE guard. The query name is state of the draft, not of the operation: it still reads
    // `atoms_in_category_value` long after the category editor stopped being rendered, so the old
    // `editor === 'category'` gate stayed armed here. No request is lost either way — the hook
    // dedupes per mount — but the flag then means "was on screen at some point", and the next
    // reader of `enabled` would be entitled to believe otherwise.
    renderBuilder({
      initial: { name: 'COLLECT', args: ['atoms_in_category_value'] },
      initialConstants: { dimension_key: 'region', value_key: 'europe' },
    })
    expect(armed()).toBe(true)

    await userEvent.selectOptions(screen.getByLabelText('Operation'), 'SUM')

    expect(screen.queryByLabelText('Category dimension')).not.toBeInTheDocument()
    expect(armed()).toBe(false)
  })

  it('re-arms the fetch when COLLECT is selected again — the gate is not a one-way latch', async () => {
    renderBuilder({
      initial: { name: 'COLLECT', args: ['atoms_in_category_subtree'] },
      initialConstants: { dimension_key: 'region', value_key: 'europe' },
    })
    await userEvent.selectOptions(screen.getByLabelText('Operation'), 'SUM')
    await userEvent.selectOptions(screen.getByLabelText('Operation'), 'COLLECT')

    expect(screen.getByLabelText('Category dimension')).toHaveValue('region')
    expect(armed()).toBe(true)
  })

  it('leaves the fetch disarmed for the labels editor under COLLECT', () => {
    renderBuilder({ initial: { name: 'COLLECT', args: ['atoms_with_labels'] } })
    expect(screen.getByLabelText('Add label')).toBeInTheDocument()
    expect(armed()).toBe(false)
  })

  it('leaves the fetch disarmed for a fresh non-COLLECT formula', () => {
    renderBuilder()
    expect(armed()).toBe(false)
  })
})
