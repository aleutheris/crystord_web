import { describe, it, expect } from 'vitest'
import { normalizeAtomContent, type Atom } from './graph-queries'

function makeAtom(content: unknown): Atom {
  return {
    labels: ['Math'],
    bonds: [],
    accessLevel: 'OWNER',
    properties: {
      shellies: { uuid: 'a1' },
      // Intentionally violating the declared type to model backend responses.
      nuclearies: {
        title: 'Sum', description: '', content: content as string,
        operation: '{"name":"SUM","args":["x","y"]}', constants: null,
      },
    },
  }
}

describe('normalizeAtomContent — enforce content:string at the boundary', () => {
  it('coerces a numeric computed result to its string form', () => {
    const out = normalizeAtomContent(makeAtom(42))
    expect(out.properties.nuclearies.content).toBe('42')
  })

  it('coerces zero to "0" rather than treating it as absent', () => {
    const out = normalizeAtomContent(makeAtom(0))
    expect(out.properties.nuclearies.content).toBe('0')
  })

  it('coerces a boolean result', () => {
    const out = normalizeAtomContent(makeAtom(false))
    expect(out.properties.nuclearies.content).toBe('false')
  })

  it('maps null/undefined content to an empty string', () => {
    expect(normalizeAtomContent(makeAtom(null)).properties.nuclearies.content).toBe('')
    expect(normalizeAtomContent(makeAtom(undefined)).properties.nuclearies.content).toBe('')
  })

  it('returns the same object reference when content is already a string', () => {
    const atom = makeAtom('already text')
    expect(normalizeAtomContent(atom)).toBe(atom)
  })

  it('preserves every other field when coercing', () => {
    const out = normalizeAtomContent(makeAtom(7))
    expect(out.labels).toEqual(['Math'])
    expect(out.properties.shellies.uuid).toBe('a1')
    expect(out.properties.nuclearies.operation).toBe('{"name":"SUM","args":["x","y"]}')
  })
})
