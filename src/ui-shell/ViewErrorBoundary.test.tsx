import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ViewErrorBoundary } from './ViewErrorBoundary'

function Boom(): never {
  throw new Error('render exploded')
}

describe('ViewErrorBoundary', () => {
  beforeEach(() => {
    // React logs caught render errors to console.error; silence it for these expected throws.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders children when nothing throws', () => {
    render(<ViewErrorBoundary><span>healthy</span></ViewErrorBoundary>)
    expect(screen.getByText('healthy')).toBeInTheDocument()
  })

  it('shows the fallback and keeps the rest of the page mounted when a child throws', () => {
    render(
      <div>
        <span>shell stays</span>
        <ViewErrorBoundary><Boom /></ViewErrorBoundary>
      </div>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't be displayed/i)
    expect(screen.getByText('shell stays')).toBeInTheDocument()
  })

  it('reports the error to the onError callback', () => {
    const onError = vi.fn()
    render(<ViewErrorBoundary onError={onError}><Boom /></ViewErrorBoundary>)
    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0]![0]).toBeInstanceOf(Error)
  })

  it('recovers via Retry once the underlying condition is fixed', async () => {
    // Brokenness lives outside the component: on Retry the boundary remounts the subtree, so a
    // fresh child must read the healed state (component-local state would just reset and re-throw).
    let broken = true
    function Flaky() {
      if (broken) throw new Error('still broken')
      return <span>recovered</span>
    }

    const user = userEvent.setup()
    render(<ViewErrorBoundary><Flaky /></ViewErrorBoundary>)

    expect(screen.getByRole('alert')).toBeInTheDocument()

    broken = false
    await user.click(screen.getByRole('button', { name: /retry/i }))

    expect(screen.getByText('recovered')).toBeInTheDocument()
  })

  it('re-shows the fallback if Retry is used while the child still throws', async () => {
    const user = userEvent.setup()
    render(<ViewErrorBoundary><Boom /></ViewErrorBoundary>)

    await user.click(screen.getByRole('button', { name: /retry/i }))

    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
