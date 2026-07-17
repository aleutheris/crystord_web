import { describe, it, expect } from 'vitest'
import { sortAtoms } from './sort'
import type { Atom } from '../../api-contract'

function makeAtom(uuid: string, title: string): Atom {
  return {
    labels: [],
    bonds: [],
    properties: {
      shellies: { uuid },
      nuclearies: { title, description: '', content: '', operation: null, constants: null },
    },
  }
}

describe('sortAtoms (EPIC-260071 / ADR-260062 D5)', () => {
  it('sorts by title A–Z, case-insensitively', () => {
    const atoms = [makeAtom('u1', 'banana'), makeAtom('u2', 'Apple'), makeAtom('u3', 'cherry'), makeAtom('u4', 'aardvark')]
    const titles = sortAtoms(atoms, 'title').map((a) => a.properties.nuclearies.title)
    expect(titles).toEqual(['aardvark', 'Apple', 'banana', 'cherry'])
  })

  it('defaults to the title comparator when no key is given', () => {
    const atoms = [makeAtom('u1', 'Zeta'), makeAtom('u2', 'alpha')]
    const titles = sortAtoms(atoms).map((a) => a.properties.nuclearies.title)
    expect(titles).toEqual(['alpha', 'Zeta'])
  })

  it('returns a new array and does not mutate the shared working set', () => {
    const atoms = [makeAtom('u1', 'b'), makeAtom('u2', 'a')]
    const sorted = sortAtoms(atoms)
    expect(sorted).not.toBe(atoms)
    expect(atoms.map((a) => a.properties.nuclearies.title)).toEqual(['b', 'a'])
  })
})
