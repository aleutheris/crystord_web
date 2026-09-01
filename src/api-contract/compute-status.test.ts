import { describe, it, expect } from 'vitest'
import { computeStatusFor } from './compute-status'
import type { Atom } from './graph-queries'

function atom(overrides: Partial<Atom> = {}, operation: string | null = '{"name":"SUM","args":["a-2"]}'): Atom {
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

describe('computeStatusFor', () => {
  it('maps success with an operation to an ok badge', () => {
    expect(computeStatusFor(atom({ evaluationStatus: 'success' }))).toEqual({
      kind: 'ok',
      summary: 'Up to date',
    })
  })

  it('gives no badge for success on a manual atom (empty operation)', () => {
    expect(computeStatusFor(atom({ evaluationStatus: 'success' }, ''))).toBeUndefined()
  })

  it('gives no badge for success with a null operation', () => {
    expect(computeStatusFor(atom({ evaluationStatus: 'success' }, null))).toBeUndefined()
  })

  it('gives no badge when evaluationStatus is absent', () => {
    expect(computeStatusFor(atom())).toBeUndefined()
    expect(computeStatusFor(atom({ evaluationStatus: null }))).toBeUndefined()
  })

  it('gives no badge for unknown evaluationStatus values (never guess)', () => {
    expect(computeStatusFor(atom({ evaluationStatus: 'half-done' }))).toBeUndefined()
  })

  // Documented errorCode table (ADR-260065).
  it.each([
    ['AU-CYCLE-DETECTED', 'Dependency cycle'],
    ['OP-DIVISION-BY-ZERO', 'Division by zero'],
    ['AU-DEPENDENCY-MISSING', 'Missing dependency'],
    ['OP-SIG-SHAPE-MISMATCH', 'Shape mismatch'],
    // Codes 9.3.0 documented: the COLLECT trio (user-guide.md:1305) plus
    // OP-OPERAND-TYPE-MISMATCH (user-guide.md:1150), which a sweep scoped to "what 9.3.0 added"
    // missed — that one predates 9.3.0 and was never mapped at all. Unmapped, a code is not
    // shown at all here: the badge falls back to 'Computation failed' (pinned below), so the
    // user gets no clue what went wrong. QUERY-UNKNOWN is reachable from the UI's ungated
    // free-text query name.
    ['OP-COLLECT-CONSTANTS-MISSING', 'Collect setting missing'],
    ['OP-COLLECT-CONSTANTS-INVALID', 'Collect setting invalid'],
    ['OP-COLLECT-QUERY-UNKNOWN', 'Unknown collect query'],
    ['OP-OPERAND-TYPE-MISMATCH', 'Input type mismatch'],
  ])('maps failed-origin with %s to an error badge', (errorCode, summary) => {
    expect(computeStatusFor(atom({ evaluationStatus: 'failed-origin', errorCode }))).toEqual({
      kind: 'error',
      summary,
    })
  })

  it('maps failed-origin with an unknown code to a generic error badge', () => {
    expect(computeStatusFor(atom({ evaluationStatus: 'failed-origin', errorCode: 'OP-NEW-CODE' }))).toEqual({
      kind: 'error',
      summary: 'Computation failed',
    })
  })

  it('maps failed-origin without a code to a generic error badge', () => {
    expect(computeStatusFor(atom({ evaluationStatus: 'failed-origin' }))).toEqual({
      kind: 'error',
      summary: 'Computation failed',
    })
  })

  it('maps failed-propagated to "An input failed"', () => {
    expect(computeStatusFor(atom({ evaluationStatus: 'failed-propagated', errorCode: null }))).toEqual({
      kind: 'error',
      summary: 'An input failed',
    })
  })

  it('prefers a recognized errorCode summary on failed-propagated', () => {
    expect(
      computeStatusFor(atom({ evaluationStatus: 'failed-propagated', errorCode: 'AU-CYCLE-DETECTED' })),
    ).toEqual({ kind: 'error', summary: 'Dependency cycle' })
  })

  it('reports errors even on atoms without an operation (stale failure surfaces)', () => {
    expect(computeStatusFor(atom({ evaluationStatus: 'failed-origin', errorCode: 'OP-DIVISION-BY-ZERO' }, ''))).toEqual({
      kind: 'error',
      summary: 'Division by zero',
    })
  })

  it('maps skipped-optional to a skipped badge', () => {
    expect(computeStatusFor(atom({ evaluationStatus: 'skipped-optional' }))).toEqual({
      kind: 'skipped',
      summary: 'Skipped — optional input absent',
    })
  })
})
