import { describe, it, expect } from 'vitest'
import { labelColorIndex, labelColorToken } from './label-colors'
import { C_LABEL_PALETTE } from './tokens'

describe('labelColorIndex (ADR-260063 — deterministic label palette hash)', () => {
  it('is deterministic — the same label always maps to the same index', () => {
    expect(labelColorIndex('Project')).toBe(labelColorIndex('Project'))
    expect(labelColorIndex('Task')).toBe(labelColorIndex('Task'))
  })

  it('is the char-code sum mod 8', () => {
    // 'A' = 65 → slot 1; 'AB' = 65 + 66 = 131 → 131 % 8 = 3.
    expect(labelColorIndex('A')).toBe(65 % 8)
    expect(labelColorIndex('AB')).toBe(131 % 8)
    expect(labelColorIndex('')).toBe(0)
  })

  it('always lands in [0, 8)', () => {
    const labels = ['Project', 'Task', 'Urgent', 'Region', 'était-là', 'ключ', '日本語', 'x'.repeat(500)]
    for (const label of labels) {
      const idx = labelColorIndex(label)
      expect(Number.isInteger(idx)).toBe(true)
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThan(8)
    }
  })

  it('distributes single-char labels across every slot', () => {
    // Char codes 65..72 ('A'..'H') cover all residues mod 8 — the hash uses the full palette.
    const seen = new Set<number>()
    for (let code = 65; code < 73; code += 1) {
      seen.add(labelColorIndex(String.fromCharCode(code)))
    }
    expect(seen.size).toBe(8)
  })
})

describe('labelColorToken', () => {
  it('returns the palette CSS custom-property reference for the hashed slot', () => {
    expect(labelColorToken('Project')).toBe(C_LABEL_PALETTE[labelColorIndex('Project')])
    expect(labelColorToken('A')).toBe('var(--label-chip-2)') // 65 % 8 = 1 → second slot
  })
})
