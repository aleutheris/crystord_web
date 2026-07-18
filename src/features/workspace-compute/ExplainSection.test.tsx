import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Atom } from '../../api-contract'
import { ExplainSection } from './ExplainSection'

function makeAtom(overrides: Partial<Atom> = {}, operation = '{"name":"SUM","args":["a-2","a-3"]}'): Atom {
  return {
    labels: [],
    bonds: [],
    properties: {
      shellies: { uuid: 'a-1' },
      nuclearies: { title: 'Alpha', description: '', content: '', operation, constants: {} },
    },
    ...overrides,
  }
}

function titled(uuid: string, title: string): Atom {
  return makeAtom({ properties: { shellies: { uuid }, nuclearies: { title, description: '', content: '', operation: '', constants: {} } } })
}

const WORKING_SET = [titled('a-2', 'Beta'), titled('a-3', 'Gamma')]
const PAYLOAD = { name: 'SUM', args: ['a-2', 'a-3'] }

describe('ExplainSection', () => {
  it('renders nothing when there is no evaluation status', () => {
    const { container } = render(<ExplainSection atom={makeAtom()} payload={PAYLOAD} atoms={WORKING_SET} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('explains success with the input count', () => {
    render(<ExplainSection atom={makeAtom({ evaluationStatus: 'success' })} payload={PAYLOAD} atoms={WORKING_SET} />)
    expect(screen.getByText('Up to date — computed from 2 inputs.')).toBeInTheDocument()
  })

  it('uses the singular for one input and excludes constant-key args', () => {
    const atom = makeAtom({ evaluationStatus: 'success' }, '{"name":"SUM","args":["a-2","taxRate"]}')
    atom.properties.nuclearies.constants = { taxRate: 0.21 }
    render(<ExplainSection atom={atom} payload={{ name: 'SUM', args: ['a-2', 'taxRate'] }} atoms={WORKING_SET} />)
    expect(screen.getByText('Up to date — computed from 1 input.')).toBeInTheDocument()
  })

  it('explains a skipped-optional evaluation', () => {
    render(<ExplainSection atom={makeAtom({ evaluationStatus: 'skipped-optional' })} payload={PAYLOAD} atoms={WORKING_SET} />)
    expect(screen.getByText(/an optional input is absent/)).toBeInTheDocument()
  })

  it('lists cycle members by title (fallback shortened uuid) for AU-CYCLE-DETECTED', () => {
    const atom = makeAtom({
      evaluationStatus: 'failed-origin',
      errorCode: 'AU-CYCLE-DETECTED',
      cycleNodes: ['a-2', '1c7b2b3d-out-of-set-uuid'],
    })
    render(<ExplainSection atom={atom} payload={PAYLOAD} atoms={WORKING_SET} />)
    expect(screen.getByText('These atoms form a dependency loop:')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('1c7b2b3d…')).toBeInTheDocument()
  })

  it('tolerates a cycle report without cycleNodes', () => {
    const atom = makeAtom({ evaluationStatus: 'failed-propagated', errorCode: 'AU-CYCLE-DETECTED' })
    render(<ExplainSection atom={atom} payload={PAYLOAD} atoms={WORKING_SET} />)
    expect(screen.getByText('These atoms form a dependency loop:')).toBeInTheDocument()
  })

  it('lists failing inputs by title on failed-propagated', () => {
    const atom = makeAtom({ evaluationStatus: 'failed-propagated', causes: ['a-3'] })
    render(<ExplainSection atom={atom} payload={PAYLOAD} atoms={WORKING_SET} />)
    expect(screen.getByText('An input this value depends on failed:')).toBeInTheDocument()
    expect(screen.getByText('Gamma')).toBeInTheDocument()
  })

  it('tolerates failed-propagated without causes', () => {
    const atom = makeAtom({ evaluationStatus: 'failed-propagated' })
    render(<ExplainSection atom={atom} payload={PAYLOAD} atoms={WORKING_SET} />)
    expect(screen.getByText('An input this value depends on failed:')).toBeInTheDocument()
  })

  it.each([
    ['OP-DIVISION-BY-ZERO', /division by zero/],
    ['AU-DEPENDENCY-MISSING', /dependency is missing/],
    ['OP-SIG-SHAPE-MISMATCH', /shape mismatch/],
  ])('explains failed-origin %s in plain language', (errorCode, sentence) => {
    render(
      <ExplainSection atom={makeAtom({ evaluationStatus: 'failed-origin', errorCode })} payload={PAYLOAD} atoms={WORKING_SET} />,
    )
    expect(screen.getByText(sentence)).toBeInTheDocument()
  })

  it('shows the raw code alongside the generic sentence for unknown codes', () => {
    render(
      <ExplainSection atom={makeAtom({ evaluationStatus: 'failed-origin', errorCode: 'OP-NEW-CODE' })} payload={PAYLOAD} atoms={WORKING_SET} />,
    )
    expect(screen.getByText('This value could not be computed.')).toBeInTheDocument()
    expect(screen.getByText('(OP-NEW-CODE)')).toBeInTheDocument()
  })

  it('handles a missing errorCode with the generic sentence alone', () => {
    render(<ExplainSection atom={makeAtom({ evaluationStatus: 'failed-origin' })} payload={PAYLOAD} atoms={WORKING_SET} />)
    expect(screen.getByText('This value could not be computed.')).toBeInTheDocument()
    expect(screen.queryByText(/^\(/)).not.toBeInTheDocument()
  })
})
