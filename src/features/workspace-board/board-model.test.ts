import { describe, it, expect } from 'vitest'
import type { Atom } from '../../api-contract'
import type { CategoryValue } from '../../api-contract/category-operations'
import {
  UNASSIGNED, deriveColumns, rootAncestorMap, columnAssignments, recategorized, isNoopMove,
} from './board-model'

function value(key: string, parentValueKeys: string[] = [], displayName = key.toUpperCase()): CategoryValue {
  return { key, displayName, description: null, dimensionKey: 'region', parentValueKeys, accessLevel: 'OWNER', ownerUsername: 'demo' }
}

function atom(uuid: string, categories?: { dimensionKey: string; valueKey: string }[]): Atom {
  return {
    labels: ['Project'],
    bonds: [],
    ...(categories !== undefined ? { categories } : {}),
    properties: {
      shellies: { uuid },
      nuclearies: { title: uuid, description: '', content: '', operation: '', constants: {} },
    },
  }
}

// Region taxonomy: europe (root) ▸ belgium ▸ antwerp; asia (root).
const REGION = [value('europe'), value('belgium', ['europe']), value('antwerp', ['belgium']), value('asia')]

describe('deriveColumns (ADR-260070 — roots only)', () => {
  it('keeps roots (empty parentValueKeys) in stable input order, dropping descendants', () => {
    expect(deriveColumns(REGION)).toEqual([
      { key: 'europe', displayName: 'EUROPE' },
      { key: 'asia', displayName: 'ASIA' },
    ])
  })

  it('treats a value whose parents are all missing from the loaded list as a root', () => {
    expect(deriveColumns([value('orphan', ['gone'])])).toEqual([{ key: 'orphan', displayName: 'ORPHAN' }])
  })

  it('follows only loaded parents — one loaded parent among missing ones still nests', () => {
    expect(deriveColumns([value('root'), value('child', ['gone', 'root'])]))
      .toEqual([{ key: 'root', displayName: 'ROOT' }])
  })

  it('returns no columns for an empty value list', () => {
    expect(deriveColumns([])).toEqual([])
  })
})

describe('rootAncestorMap (ADR-260070 — client-side rollup)', () => {
  it('maps roots to themselves and descendants (any depth) to their root', () => {
    const map = rootAncestorMap(REGION)
    expect(map.get('europe')).toBe('europe')
    expect(map.get('belgium')).toBe('europe')
    expect(map.get('antwerp')).toBe('europe')
    expect(map.get('asia')).toBe('asia')
  })

  it('treats a missing parent as making the value its own root', () => {
    const map = rootAncestorMap([value('orphan', ['gone'])])
    expect(map.get('orphan')).toBe('orphan')
  })

  it('is cycle-safe — cycle members map to another member, never recursing', () => {
    const map = rootAncestorMap([value('a', ['b']), value('b', ['a'])])
    expect(map.get('a')).toBe('b')
    expect(map.get('b')).toBe('a')
  })

  it('resolves a chain hanging off a cycle without recursing', () => {
    const map = rootAncestorMap([value('a', ['b']), value('b', ['a']), value('c', ['a'])])
    // c → a → b → (a already visited) stops; no self-mapped root is ever reached.
    expect(map.get('c')).toBe('b')
  })
})

describe('columnAssignments (ADR-260070 — membership + Unassigned bucket)', () => {
  const rootMap = rootAncestorMap(REGION)

  it('keeps the Unassigned bucket first, even when empty', () => {
    const buckets = columnAssignments([atom('a1', [{ dimensionKey: 'region', valueKey: 'asia' }])], 'region', rootMap)
    expect([...buckets.keys()][0]).toBe(UNASSIGNED)
    expect(buckets.get(UNASSIGNED)).toEqual([])
  })

  it('rolls a deep-descendant assignment up to its root column', () => {
    const a = atom('a1', [{ dimensionKey: 'region', valueKey: 'antwerp' }])
    const buckets = columnAssignments([a], 'region', rootMap)
    expect(buckets.get('europe')).toEqual([a])
    expect(buckets.get(UNASSIGNED)).toEqual([])
  })

  it('puts atoms without an assignment in this dimension into Unassigned', () => {
    const bare = atom('a1', [])
    const noField = atom('a2')
    const otherDim = atom('a3', [{ dimensionKey: 'period', valueKey: 'q1' }])
    const buckets = columnAssignments([bare, noField, otherDim], 'region', rootMap)
    expect(buckets.get(UNASSIGNED)).toEqual([bare, noField, otherDim])
  })

  it('places a multi-assigned atom in EACH matching column', () => {
    const a = atom('a1', [
      { dimensionKey: 'region', valueKey: 'belgium' },
      { dimensionKey: 'region', valueKey: 'asia' },
    ])
    const buckets = columnAssignments([a], 'region', rootMap)
    expect(buckets.get('europe')).toEqual([a])
    expect(buckets.get('asia')).toEqual([a])
  })

  it('places an atom once per column when several assignments share a root', () => {
    const a = atom('a1', [
      { dimensionKey: 'region', valueKey: 'belgium' },
      { dimensionKey: 'region', valueKey: 'antwerp' },
    ])
    expect(columnAssignments([a], 'region', rootMap).get('europe')).toEqual([a])
  })

  it('treats unknown and cycle-locked assignments as unplaceable → Unassigned', () => {
    const unknown = atom('a1', [{ dimensionKey: 'region', valueKey: 'nowhere' }])
    const cycleMap = rootAncestorMap([value('a', ['b']), value('b', ['a'])])
    const cyclic = atom('a2', [{ dimensionKey: 'region', valueKey: 'a' }])
    expect(columnAssignments([unknown], 'region', rootMap).get(UNASSIGNED)).toEqual([unknown])
    expect(columnAssignments([cyclic], 'region', cycleMap).get(UNASSIGNED)).toEqual([cyclic])
  })
})

describe('recategorized (ADR-260070 — replace one dimension only)', () => {
  const base = atom('a1', [
    { dimensionKey: 'region', valueKey: 'belgium' },
    { dimensionKey: 'period', valueKey: 'q1' },
  ])

  it('replaces this dimension with the root while preserving other dimensions', () => {
    expect(recategorized(base, 'region', 'asia').categories).toEqual([
      { dimensionKey: 'period', valueKey: 'q1' },
      { dimensionKey: 'region', valueKey: 'asia' },
    ])
  })

  it('clears only this dimension on null (Unassigned drop)', () => {
    expect(recategorized(base, 'region', null).categories).toEqual([
      { dimensionKey: 'period', valueKey: 'q1' },
    ])
  })

  it('collapses multiple assignments in the dimension to the single target root', () => {
    const multi = atom('a1', [
      { dimensionKey: 'region', valueKey: 'belgium' },
      { dimensionKey: 'region', valueKey: 'asia' },
    ])
    expect(recategorized(multi, 'region', 'europe').categories).toEqual([
      { dimensionKey: 'region', valueKey: 'europe' },
    ])
  })

  it('yields a categories array even when the atom carried none (replace-all is sent)', () => {
    expect(recategorized(atom('a1'), 'region', 'asia').categories).toEqual([
      { dimensionKey: 'region', valueKey: 'asia' },
    ])
    expect(recategorized(atom('a1'), 'region', null).categories).toEqual([])
  })

  it('does not mutate the input atom', () => {
    const before = structuredClone(base)
    recategorized(base, 'region', 'asia')
    expect(base).toEqual(before)
  })
})

describe('isNoopMove (ADR-260070 — no-op guard, coarsening still allowed)', () => {
  it('is a no-op when the dimension already holds exactly the target root', () => {
    const a = atom('a1', [{ dimensionKey: 'region', valueKey: 'europe' }])
    expect(isNoopMove(a, 'region', 'europe')).toBe(true)
  })

  it('is NOT a no-op for a descendant assignment — the drop coarsens to the root', () => {
    const a = atom('a1', [{ dimensionKey: 'region', valueKey: 'belgium' }])
    expect(isNoopMove(a, 'region', 'europe')).toBe(false)
  })

  it('is NOT a no-op when several assignments exist, even if one is the root', () => {
    const a = atom('a1', [
      { dimensionKey: 'region', valueKey: 'europe' },
      { dimensionKey: 'region', valueKey: 'asia' },
    ])
    expect(isNoopMove(a, 'region', 'europe')).toBe(false)
  })

  it('moving to Unassigned is a no-op only when the dimension has no assignments', () => {
    expect(isNoopMove(atom('a1', []), 'region', null)).toBe(true)
    expect(isNoopMove(atom('a1'), 'region', null)).toBe(true)
    expect(isNoopMove(atom('a1', [{ dimensionKey: 'period', valueKey: 'q1' }]), 'region', null)).toBe(true)
    expect(isNoopMove(atom('a1', [{ dimensionKey: 'region', valueKey: 'asia' }]), 'region', null)).toBe(false)
  })

  it('assigning to a target is never a no-op for an unassigned atom', () => {
    expect(isNoopMove(atom('a1'), 'region', 'asia')).toBe(false)
  })
})
