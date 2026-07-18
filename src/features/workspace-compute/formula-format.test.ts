import { describe, it, expect } from 'vitest'
import type { Atom } from '../../api-contract'
import { shortUuid, atomTitle, describeArg, formatFormula, countInputArgs, constantValue } from './formula-format'

function makeAtom(uuid: string, title: string): Atom {
  return {
    labels: [],
    bonds: [],
    properties: {
      shellies: { uuid },
      nuclearies: { title, description: '', content: '', operation: '', constants: {} },
    },
  }
}

const ATOMS = [makeAtom('1c7b2b3d-aaaa-bbbb-cccc-000000000001', 'Alpha'), makeAtom('a-2', 'Beta')]

describe('shortUuid', () => {
  it('shortens long values with an ellipsis', () => {
    expect(shortUuid('1c7b2b3d-aaaa-bbbb-cccc-000000000001')).toBe('1c7b2b3d…')
  })

  it('leaves short values untouched', () => {
    expect(shortUuid('a-2')).toBe('a-2')
  })
})

describe('atomTitle', () => {
  it('resolves a working-set uuid to its title', () => {
    expect(atomTitle('a-2', ATOMS)).toBe('Beta')
  })

  it('returns undefined for an out-of-set uuid or an absent working set', () => {
    expect(atomTitle('missing', ATOMS)).toBeUndefined()
    expect(atomTitle('a-2', undefined)).toBeUndefined()
  })
})

describe('describeArg', () => {
  it('prefers the atom title', () => {
    expect(describeArg('a-2', ATOMS, { taxRate: 0.21 })).toBe('Beta')
  })

  it('shows the constant key when the arg references the constants map', () => {
    expect(describeArg('taxRate', ATOMS, { taxRate: 0.21 })).toBe('taxRate')
  })

  it('falls back to a shortened uuid outside the working set', () => {
    expect(describeArg('1c7b2b3d-out-of-set-uuid', ATOMS, {})).toBe('1c7b2b3d…')
  })

  it('handles null constants', () => {
    expect(describeArg('other', ATOMS, null)).toBe('other')
  })
})

describe('formatFormula', () => {
  it('renders operation(name-resolved args)', () => {
    expect(
      formatFormula({ name: 'SUM', args: ['a-2', 'taxRate'] }, ATOMS, { taxRate: 0.21 }),
    ).toBe('SUM(Beta, taxRate)')
  })

  it('renders an empty arg list', () => {
    expect(formatFormula({ name: 'COLLECT', args: [] }, ATOMS, {})).toBe('COLLECT()')
  })
})

describe('countInputArgs', () => {
  it('excludes constant-key args from the input count', () => {
    expect(countInputArgs({ name: 'SUM', args: ['a-1', 'a-2', 'taxRate'] }, { taxRate: 0.21 })).toBe(2)
  })

  it('counts every arg when there are no constants', () => {
    expect(countInputArgs({ name: 'SUM', args: ['a-1', 'a-2'] }, null)).toBe(2)
  })
})

describe('constantValue', () => {
  it.each([
    ['42', 42],
    ['-3.5', -3.5],
    [' 7 ', 7],
  ])('stores numeric-looking %s as a number', (raw, expected) => {
    expect(constantValue(raw)).toBe(expected)
  })

  it('keeps everything else a string (untrimmed)', () => {
    expect(constantValue('eu-west')).toBe('eu-west')
    expect(constantValue('1.2.3')).toBe('1.2.3')
    expect(constantValue('')).toBe('')
  })
})
