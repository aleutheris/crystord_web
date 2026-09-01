import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CategoryConstantSelects } from './CategoryConstantSelects'
import { isUnusableValue, markUnusableValues, optionsWithSelected } from './category-option-list'

const REGION = { key: 'region', displayName: 'Region' }
const EUROPE = { key: 'europe', displayName: 'Europe' }

function value(key: string, displayName: string, accessLevel: 'OWNER' | 'EDITOR' | 'VIEWER') {
  return { key, displayName, accessLevel }
}

function renderSelects(props = {}) {
  const onDimensionChange = vi.fn()
  const onValueChange = vi.fn()
  render(
    <CategoryConstantSelects
      dimensionOptions={[REGION]}
      valueOptions={[EUROPE]}
      dimensionKey="region"
      valueKey="europe"
      loading={false}
      error={null}
      dimensionsTruncated={false}
      valuesTruncated={false}
      onDimensionChange={onDimensionChange}
      onValueChange={onValueChange}
      {...props}
    />,
  )
  return { onDimensionChange, onValueChange }
}

describe('optionsWithSelected', () => {
  it('leaves the list alone when the selection is known or unset', () => {
    expect(optionsWithSelected([REGION], 'region', true)).toEqual([REGION])
    expect(optionsWithSelected([REGION], '', true)).toEqual([REGION])
  })

  it('appends a sticky option for a stored key the taxonomy no longer offers', () => {
    // Without this the select would render blank-or-first while state still holds `retired`,
    // so the user would see one value and save another.
    expect(optionsWithSelected([REGION], 'retired', true)).toEqual([
      REGION,
      { key: 'retired', displayName: 'retired (not in your taxonomy)' },
    ])
  })

  it('keeps the key visible but makes no claim when the list is not authoritative', () => {
    // An empty list also means "still loading" or "load failed" — annotating then would assert
    // something false about the user's own valid data on every open.
    expect(optionsWithSelected([], 'region', false)).toEqual([
      { key: 'region', displayName: 'region' },
    ])
  })
})

describe('markUnusableValues', () => {
  it('leaves owned values selectable and untouched', () => {
    expect(markUnusableValues([value('europe', 'Europe', 'OWNER')])).toEqual([EUROPE])
  })

  it.each([['EDITOR'], ['VIEWER']] as const)('marks a %s-granted value unusable', (level) => {
    // The COLLECT queries resolve owned values only (user-guide.md:1320), so a granted value
    // would save cleanly and then collect nothing.
    expect(markUnusableValues([value('benelux', 'Benelux', level)])).toEqual([
      { key: 'benelux', displayName: 'Benelux (shared with you — cannot be collected)', unusable: true },
    ])
  })
})

describe('isUnusableValue', () => {
  it('is true only when the selected key is a marked option', () => {
    const options = markUnusableValues([value('benelux', 'Benelux', 'VIEWER'), value('europe', 'Europe', 'OWNER')])
    expect(isUnusableValue(options, 'benelux')).toBe(true)
    expect(isUnusableValue(options, 'europe')).toBe(false)
    expect(isUnusableValue(options, '')).toBe(false)
    expect(isUnusableValue(options, 'unknown')).toBe(false)
  })
})

describe('CategoryConstantSelects', () => {
  it('renders dimension and value pickers by display name, not raw key', () => {
    renderSelects()
    expect(screen.getByLabelText('Category dimension')).toHaveValue('region')
    expect(screen.getByLabelText('Category value')).toHaveValue('europe')
    expect(screen.getByRole('option', { name: 'Region' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Europe' })).toBeInTheDocument()
  })

  it('disables the value picker until a dimension is chosen', () => {
    renderSelects({ dimensionKey: '', valueKey: '' })
    expect(screen.getByLabelText('Category value')).toBeDisabled()
    expect(screen.getByLabelText('Category dimension')).toHaveValue('')
  })

  it('renders a non-owned value visible but unselectable', () => {
    // Shown rather than hidden: Classify still offers it, so its absence here would be baffling.
    renderSelects({ valueOptions: markUnusableValues([value('benelux', 'Benelux', 'EDITOR')]), valueKey: '' })
    const option = screen.getByRole('option', { name: 'Benelux (shared with you — cannot be collected)' })
    expect(option).toBeInTheDocument()
    expect(option).toBeDisabled()
  })

  it('keeps an unresolvable stored key visible instead of silently showing another', () => {
    renderSelects({
      valueOptions: optionsWithSelected([EUROPE], 'retired-value', true),
      valueKey: 'retired-value',
    })
    expect(screen.getByLabelText('Category value')).toHaveValue('retired-value')
    expect(screen.getByRole('option', { name: 'retired-value (not in your taxonomy)' })).toBeInTheDocument()
  })

  it('reports the chosen keys upward', async () => {
    const { onDimensionChange, onValueChange } = renderSelects()
    await userEvent.selectOptions(screen.getByLabelText('Category dimension'), 'region')
    expect(onDimensionChange).toHaveBeenCalledWith('region')
    await userEvent.selectOptions(screen.getByLabelText('Category value'), 'europe')
    expect(onValueChange).toHaveBeenCalledWith('europe')
  })

  it('shows a loading note while the taxonomy is in flight', () => {
    renderSelects({ loading: true })
    expect(screen.getByText('Loading categories…')).toBeInTheDocument()
  })

  it('surfaces a load error rather than presenting an empty picker as complete', () => {
    renderSelects({ dimensionOptions: [], valueOptions: [], error: 'Could not load categories.' })
    expect(screen.getByText('Could not load categories.')).toBeInTheDocument()
  })

  it('says nothing about truncation when both lists are complete', () => {
    renderSelects()
    expect(screen.queryByText(/Showing the first/)).not.toBeInTheDocument()
  })

  it('says so when the value list was cut off at the page ceiling', () => {
    // The pickers do not page, so values past the limit cannot be chosen here at all. Staying
    // silent would present one page as the whole dimension.
    renderSelects({ valuesTruncated: true })
    expect(screen.getByText('Showing the first 100 values; there may be more.')).toBeInTheDocument()
    expect(screen.queryByText(/first 100 dimensions/)).not.toBeInTheDocument()
  })

  it('says so when the dimension list was cut off at the page ceiling', () => {
    renderSelects({ dimensionsTruncated: true })
    expect(screen.getByText('Showing the first 100 dimensions; there may be more.')).toBeInTheDocument()
    expect(screen.queryByText(/first 100 values/)).not.toBeInTheDocument()
  })

  it('reports each list independently when both were cut off', () => {
    renderSelects({ dimensionsTruncated: true, valuesTruncated: true })
    expect(screen.getByText('Showing the first 100 dimensions; there may be more.')).toBeInTheDocument()
    expect(screen.getByText('Showing the first 100 values; there may be more.')).toBeInTheDocument()
  })
})
