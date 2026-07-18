import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Atom } from '../../api-contract'
import { ComputeTab } from './ComputeTab'

vi.mock('./use-operations', () => ({
  useOperations: () => ({
    operations: [
      { name: 'SUM', description: 'Add the inputs together.' },
      { name: 'COLLECT', description: 'Collect atoms via a registered query.' },
    ],
    loading: false,
  }),
}))

function makeAtom(overrides: Partial<Atom> = {}, operation = '', constants: Record<string, unknown> | null = {}): Atom {
  return {
    labels: [],
    bonds: [],
    ownerUuid: 'owner-1',
    accessLevel: 'OWNER',
    properties: {
      shellies: { uuid: 'a-1' },
      nuclearies: { title: 'Alpha', description: '', content: '42', operation, constants },
    },
    ...overrides,
  }
}

function refAtom(uuid: string, title: string): Atom {
  return {
    labels: [],
    bonds: [],
    properties: {
      shellies: { uuid },
      nuclearies: { title, description: '', content: '', operation: '', constants: {} },
    },
  }
}

const WORKING_SET = [refAtom('a-2', 'Beta'), refAtom('a-3', 'Gamma')]
const SUM_OPERATION = '{"name":"SUM","args":["a-2","a-3"]}'

describe('ComputeTab — manual atom', () => {
  it('explains the manual state and offers Add computation to an editor', () => {
    render(<ComputeTab atom={makeAtom()} onUpdate={vi.fn()} atoms={WORKING_SET} />)
    expect(screen.getByText('This atom is manual — its content is entered by hand.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add computation' })).toBeInTheDocument()
  })

  it('Add computation opens the builder', async () => {
    render(<ComputeTab atom={makeAtom()} onUpdate={vi.fn()} atoms={WORKING_SET} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add computation' }))
    expect(screen.getByRole('form', { name: 'Formula builder' })).toBeInTheDocument()
  })

  it('the builder works without a working-set prop (empty picker set)', async () => {
    render(<ComputeTab atom={makeAtom()} onUpdate={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add computation' }))
    expect(screen.getByRole('form', { name: 'Formula builder' })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Find atom for argument 1'), 'any')
    expect(screen.getByText('No matching atoms.')).toBeInTheDocument()
  })

  it('a VIEWER manual atom gets the read-only notice and no authoring affordance', () => {
    render(<ComputeTab atom={makeAtom({ accessLevel: 'VIEWER' })} onUpdate={vi.fn()} atoms={WORKING_SET} />)
    expect(screen.getByText('You have view-only access to this atom.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add computation' })).not.toBeInTheDocument()
  })
})

describe('ComputeTab — computed atom', () => {
  it('shows the formula with resolved titles and the Explain section', () => {
    const atom = makeAtom({ evaluationStatus: 'success' }, SUM_OPERATION)
    render(<ComputeTab atom={atom} onUpdate={vi.fn()} atoms={WORKING_SET} />)
    expect(screen.getByText('SUM(Beta, Gamma)')).toBeInTheDocument()
    expect(screen.getByText('Up to date — computed from 2 inputs.')).toBeInTheDocument()
  })

  it('resolves args without a working set to shortened uuids (null constants tolerated)', () => {
    const atom = makeAtom({}, '{"name":"SUM","args":["1c7b2b3d-very-long-uuid"]}', null)
    render(<ComputeTab atom={atom} onUpdate={vi.fn()} />)
    expect(screen.getByText('SUM(1c7b2b3d…)')).toBeInTheDocument()
  })

  it('a VIEWER computed atom shows formula + explain only — no builder or convert', () => {
    const atom = makeAtom({ accessLevel: 'VIEWER', evaluationStatus: 'success' }, SUM_OPERATION)
    render(<ComputeTab atom={atom} onUpdate={vi.fn()} atoms={WORKING_SET} />)
    expect(screen.getByText('SUM(Beta, Gamma)')).toBeInTheDocument()
    expect(screen.getByText('You have view-only access to this atom.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit formula' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Convert to manual' })).not.toBeInTheDocument()
  })

  it('Edit formula reopens the builder pre-filled from the payload', async () => {
    const atom = makeAtom({}, SUM_OPERATION)
    render(<ComputeTab atom={atom} onUpdate={vi.fn()} atoms={WORKING_SET} />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit formula' }))
    expect(screen.getByLabelText('Operation')).toHaveValue('SUM')
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('Gamma')).toBeInTheDocument()
  })

  it('cancelling the builder returns to the summary without saving', async () => {
    const onUpdate = vi.fn()
    render(<ComputeTab atom={makeAtom({}, SUM_OPERATION)} onUpdate={onUpdate} atoms={WORKING_SET} />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit formula' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('SUM(Beta, Gamma)')).toBeInTheDocument()
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('saving from the builder writes the serialized payload + constants through onUpdate', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    render(<ComputeTab atom={makeAtom({}, SUM_OPERATION)} onUpdate={onUpdate} atoms={WORKING_SET} />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit formula' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save formula' }))

    await waitFor(() => expect(onUpdate).toHaveBeenCalledOnce())
    const [uuid, updated] = onUpdate.mock.calls[0]!
    expect(uuid).toBe('a-1')
    expect(updated.properties.nuclearies.operation).toBe(SUM_OPERATION)
    expect(updated.properties.nuclearies.constants).toEqual({})
    // Builder closes back to the summary after a successful save.
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Formula builder' })).not.toBeInTheDocument())
  })
})

describe('ComputeTab — convert to manual', () => {
  it('converts only after the two-step confirm, clearing operation and constants', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    const atom = makeAtom({}, SUM_OPERATION, { taxRate: 0.21 })
    render(<ComputeTab atom={atom} onUpdate={onUpdate} atoms={WORKING_SET} />)

    await userEvent.click(screen.getByRole('button', { name: 'Convert to manual' }))
    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.getByText('Remove the formula and enter content by hand?')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Convert' }))
    await waitFor(() => expect(onUpdate).toHaveBeenCalledOnce())
    const [, updated] = onUpdate.mock.calls[0]!
    expect(updated.properties.nuclearies.operation).toBe('')
    expect(updated.properties.nuclearies.constants).toEqual({})
  })

  it('Keep formula backs out of the confirm without saving', async () => {
    const onUpdate = vi.fn()
    render(<ComputeTab atom={makeAtom({}, SUM_OPERATION)} onUpdate={onUpdate} atoms={WORKING_SET} />)
    await userEvent.click(screen.getByRole('button', { name: 'Convert to manual' }))
    await userEvent.click(screen.getByRole('button', { name: 'Keep formula' }))
    expect(screen.queryByText('Remove the formula and enter content by hand?')).not.toBeInTheDocument()
    expect(onUpdate).not.toHaveBeenCalled()
  })
})

describe('ComputeTab — save errors', () => {
  it('surfaces an unrecognized failure with its raw message (use-category-browse precedent)', async () => {
    const onUpdate = vi.fn().mockRejectedValue(new Error('OP-ENGINE-BUSY: try later'))
    render(<ComputeTab atom={makeAtom({}, SUM_OPERATION)} onUpdate={onUpdate} atoms={WORKING_SET} />)
    await userEvent.click(screen.getByRole('button', { name: 'Convert to manual' }))
    await userEvent.click(screen.getByRole('button', { name: 'Convert' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('OP-ENGINE-BUSY: try later')
  })

  it('maps a recognized auth code to its friendly message', async () => {
    const onUpdate = vi.fn().mockRejectedValue(new Error('AU-UNAUTHORIZED: denied'))
    render(<ComputeTab atom={makeAtom({}, SUM_OPERATION)} onUpdate={onUpdate} atoms={WORKING_SET} />)
    await userEvent.click(screen.getByRole('button', { name: 'Convert to manual' }))
    await userEvent.click(screen.getByRole('button', { name: 'Convert' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("You don't have access to do that.")
    expect(alert).not.toHaveTextContent('AU-UNAUTHORIZED')
  })

  it('falls back to a generic message for an empty error message', async () => {
    const onUpdate = vi.fn().mockRejectedValue(new Error(''))
    render(<ComputeTab atom={makeAtom({}, SUM_OPERATION)} onUpdate={onUpdate} atoms={WORKING_SET} />)
    await userEvent.click(screen.getByRole('button', { name: 'Convert to manual' }))
    await userEvent.click(screen.getByRole('button', { name: 'Convert' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the computation.')
  })

  it('stays silent on session expiry (the error link signs out globally)', async () => {
    const onUpdate = vi.fn().mockRejectedValue(new Error('AUTHZ-AUTHENTICATION-REQUIRED'))
    render(<ComputeTab atom={makeAtom({}, SUM_OPERATION)} onUpdate={onUpdate} atoms={WORKING_SET} />)
    await userEvent.click(screen.getByRole('button', { name: 'Convert to manual' }))
    await userEvent.click(screen.getByRole('button', { name: 'Convert' }))
    await waitFor(() => expect(onUpdate).toHaveBeenCalledOnce())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('surfaces a non-Error rejection via String coercion', async () => {
    const onUpdate = vi.fn().mockRejectedValue('plain failure')
    render(<ComputeTab atom={makeAtom({}, SUM_OPERATION)} onUpdate={onUpdate} atoms={WORKING_SET} />)
    await userEvent.click(screen.getByRole('button', { name: 'Convert to manual' }))
    await userEvent.click(screen.getByRole('button', { name: 'Convert' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('plain failure')
  })
})
