import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConstantsEditor } from './ConstantsEditor'

describe('ConstantsEditor', () => {
  it('shows an empty-state hint when there are no constants', () => {
    render(<ConstantsEditor entries={[]} onChange={vi.fn()} />)
    expect(screen.getByText('No constants defined.')).toBeInTheDocument()
  })

  it('renders a key and value input per entry', () => {
    render(<ConstantsEditor entries={[{ key: 'taxRate', value: '0.21' }]} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Constant 1 key')).toHaveValue('taxRate')
    expect(screen.getByLabelText('Constant 1 value')).toHaveValue('0.21')
    expect(screen.queryByText('No constants defined.')).not.toBeInTheDocument()
  })

  it('adding a row appends an empty entry', async () => {
    const onChange = vi.fn()
    render(<ConstantsEditor entries={[{ key: 'a', value: '1' }]} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add constant' }))
    expect(onChange).toHaveBeenCalledWith([{ key: 'a', value: '1' }, { key: '', value: '' }])
  })

  it('editing a key patches only that entry', async () => {
    const onChange = vi.fn()
    render(<ConstantsEditor entries={[{ key: '', value: '' }, { key: 'b', value: '2' }]} onChange={onChange} />)
    await userEvent.type(screen.getByLabelText('Constant 1 key'), 'x')
    expect(onChange).toHaveBeenLastCalledWith([{ key: 'x', value: '' }, { key: 'b', value: '2' }])
  })

  it('editing a value patches only that entry', async () => {
    const onChange = vi.fn()
    render(<ConstantsEditor entries={[{ key: 'a', value: '' }]} onChange={onChange} />)
    await userEvent.type(screen.getByLabelText('Constant 1 value'), '5')
    expect(onChange).toHaveBeenLastCalledWith([{ key: 'a', value: '5' }])
  })

  it('removing a row drops that entry', async () => {
    const onChange = vi.fn()
    render(<ConstantsEditor entries={[{ key: 'a', value: '1' }, { key: 'b', value: '2' }]} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove constant 1' }))
    expect(onChange).toHaveBeenCalledWith([{ key: 'b', value: '2' }])
  })
})
