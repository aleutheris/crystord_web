import { describe, it, expect } from 'vitest'
import { views, inspectorTabs, navigators } from './index'
import { helpConcepts } from '../../help'

/**
 * EPIC-260080 C2 — every registered surface has help.
 *
 * The compile-time half is the required `help` field on the three slot descriptors
 * (`slot-types.ts`): registering a surface without one is `TS2741`. This is the runtime half,
 * and it asserts over the **imported registry data**, never over file text — ADR-260085 §D5,
 * because a source-text grep reads as coverage while providing none (EPIC-260078 documented one
 * going silently vacuous).
 *
 * It proves presence, not truth. Whether a sentence is still accurate is a human read, and this
 * project ships in beta where the copy is expected to lag the code a little.
 */

const KINDS = ['paragraph', 'list', 'steps']

/** `views` — not `enabledViews` — so a flag-gated-off view still owes help. */
const REGISTRIES = [
  ['views', views],
  ['inspector tabs', inspectorTabs],
  ['navigator lenses', navigators],
] as const

describe('C2 — every registered surface carries renderable help', () => {
  it.each(REGISTRIES)('%s', (_name, entries) => {
    expect(entries.length).toBeGreaterThan(0)
    for (const entry of entries) {
      expect(entry.help.summary.trim(), entry.id).not.toBe('')
      expect(entry.help.body.length, entry.id).toBeGreaterThan(0)
      for (const block of entry.help.body) {
        expect(KINDS, `${entry.id} block kind`).toContain(block.kind)
      }
    }
  })

  // The concepts list has no descriptor behind it, so the compile-time gate cannot reach it.
  it('and so does every core-concept topic', () => {
    expect(helpConcepts.length).toBeGreaterThan(0)
    for (const topic of helpConcepts) {
      expect(topic.title.trim(), topic.id).not.toBe('')
      expect(topic.body.length, topic.id).toBeGreaterThan(0)
    }
  })
})
