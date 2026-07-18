import { describe, it, expect } from 'vitest'
import { parseOperation, serializeOperation } from './operation-payload'

describe('parseOperation', () => {
  it('parses the canonical payload', () => {
    expect(parseOperation('{"name":"SUM","args":["a-1","taxRate"]}')).toEqual({
      name: 'SUM',
      args: ['a-1', 'taxRate'],
    })
  })

  it('defaults missing args to an empty list', () => {
    expect(parseOperation('{"name":"COLLECT"}')).toEqual({ name: 'COLLECT', args: [] })
  })

  it('coerces non-string args via String', () => {
    expect(parseOperation('{"name":"SUM","args":[1,true]}')).toEqual({
      name: 'SUM',
      args: ['1', 'true'],
    })
  })

  it('treats a non-array args field as absent', () => {
    expect(parseOperation('{"name":"SUM","args":"a-1"}')).toEqual({ name: 'SUM', args: [] })
  })

  // Tolerance table (ADR-260065): every degenerate input degrades to null, never a crash.
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty string (manual atom)', ''],
    ['malformed JSON', '{name:SUM'],
    ['a JSON scalar', '"SUM"'],
    ['a JSON array', '["SUM"]'],
    ['JSON null literal', 'null'],
    ['missing name', '{"args":["a-1"]}'],
    ['non-string name', '{"name":3,"args":[]}'],
    ['empty name', '{"name":"","args":[]}'],
  ])('returns null for %s', (_label, input) => {
    expect(parseOperation(input)).toBeNull()
  })
})

describe('serializeOperation', () => {
  it('serializes to the canonical key order', () => {
    expect(serializeOperation({ name: 'SUM', args: ['a-1', 'a-2'] })).toBe(
      '{"name":"SUM","args":["a-1","a-2"]}',
    )
  })

  it('round-trips through parseOperation', () => {
    const payload = { name: 'DIVIDE', args: ['a-1', 'divisor'] }
    expect(parseOperation(serializeOperation(payload))).toEqual(payload)
  })

  it('serializes an empty args list', () => {
    expect(serializeOperation({ name: 'COLLECT', args: [] })).toBe('{"name":"COLLECT","args":[]}')
  })
})
