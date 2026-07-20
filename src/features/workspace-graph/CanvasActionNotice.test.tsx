import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CanvasActionNotice } from './CanvasActionNotice'

describe('CanvasActionNotice', () => {
  it('announces the failure to assistive tech', () => {
    render(<CanvasActionNotice message="Could not delete the atom." onDismiss={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not delete the atom.')
  })

  it('dismisses on request', async () => {
    const onDismiss = vi.fn()
    const user = userEvent.setup()
    render(<CanvasActionNotice message="Could not undo that change." onDismiss={onDismiss} />)

    await user.click(screen.getByRole('button', { name: /dismiss error/i }))

    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
