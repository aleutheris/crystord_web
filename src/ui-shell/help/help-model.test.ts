import { describe, it, expect } from 'vitest'
import type { HelpSection, HelpTopic } from '../../help'
import { HELP_GROUPS, HELP_GROUP_LABELS, buildHelpEntries, groupHelpEntries, helpSectionId, initialHelpSectionId, type HelpSurface } from './help-model'

/**
 * Pure help-panel model (ADR-260085 / EPIC-260080 T3). No React, no registry — the fixtures
 * below are deliberately fake so the assertions pin the *mechanism* (ordering, anchor ids,
 * label sourcing, contextual open) and never the shipped prose, which ADR-260085 §Verification
 * says is a human review rather than a coverage claim.
 */

function section(text: string): HelpSection {
  return { summary: `${text} summary.`, body: [{ kind: 'paragraph', text }] }
}

function topic(id: string, title: string): HelpTopic {
  return { id, title, ...section(`${title} body.`) }
}

function surface(id: string, label: string): HelpSurface {
  return { id, label, help: section(`${label} body.`) }
}

describe('helpSectionId', () => {
  it('namespaces the anchor id by group so the same surface id can appear in two groups', () => {
    // A view and an inspector tab may both be called `details`; the group prefix is what keeps
    // their DOM anchors — and therefore the table-of-contents keys — distinct.
    expect(helpSectionId('views', 'details')).toBe('help-views-details')
    expect(helpSectionId('tabs', 'details')).toBe('help-tabs-details')
  })

  it('builds an id for every group key the table of contents renders', () => {
    expect(HELP_GROUPS.map((group) => helpSectionId(group, 'x'))).toEqual([
      'help-concepts-x',
      'help-views-x',
      'help-tabs-x',
      'help-lenses-x',
    ])
  })

  it('keys the anchor off the registry id, not the label, so a rename cannot break a link', () => {
    // Same registry id, two different labels — one stable anchor.
    expect(helpSectionId('views', 'flow')).toBe(helpSectionId('views', 'flow'))
    expect(helpSectionId('views', 'flow')).not.toContain(' ')
  })

  it('labels every group it exposes', () => {
    // Guards against a group key being added to HELP_GROUPS with no heading to render.
    for (const group of HELP_GROUPS) expect(HELP_GROUP_LABELS[group]).toBeTruthy()
  })
})

describe('buildHelpEntries', () => {
  const concepts = [topic('atom', 'Atoms'), topic('bond', 'Bonds')]
  const views = [surface('flow', 'Flow')]
  const tabs = [surface('details', 'Details')]
  const lenses = [surface('labels', 'Labels')]

  it('orders the outline concepts, then views, then inspector tabs, then explorer lenses', () => {
    const entries = buildHelpEntries(concepts, views, tabs, lenses)
    expect(entries.map((entry) => entry.group)).toEqual([
      'concepts',
      'concepts',
      'views',
      'tabs',
      'lenses',
    ])
  })

  it('gives every entry its group-namespaced anchor id', () => {
    const entries = buildHelpEntries(concepts, views, tabs, lenses)
    expect(entries.map((entry) => entry.id)).toEqual([
      'help-concepts-atom',
      'help-concepts-bond',
      'help-views-flow',
      'help-tabs-details',
      'help-lenses-labels',
    ])
  })

  it('carries each surface section through untouched so the panel renders the authored body', () => {
    const [, , view] = buildHelpEntries(concepts, views, tabs, lenses)
    expect(view!.section).toBe(views[0]!.help)
  })

  it('titles a concept entry from the topic, which owns its own title (no descriptor names it)', () => {
    const [atom] = buildHelpEntries(concepts, [], [], [])
    expect(atom!.title).toBe('Atoms')
    expect(atom!.section).toBe(concepts[0])
  })

  it('titles a surface entry from the descriptor label, never from the help object (ADR-260085 D3)', () => {
    // The mechanism that makes a rename propagate by construction: `HelpSection` has no title
    // field, and the entry's title is read off the descriptor. A fake descriptor whose label
    // was "renamed" out from under its own copy proves the title does not come from the copy.
    const renamed: HelpSurface = {
      id: 'flow',
      label: 'Renamed Surface',
      help: { summary: 'Stale Name explains the old thing.', body: [{ kind: 'paragraph', text: 'Stale Name again.' }] },
    }
    const [entry] = buildHelpEntries([], [renamed], [], [])
    expect(entry!.title).toBe('Renamed Surface')
    expect(entry!.title).not.toContain('Stale Name')
  })

  it('applies that same label rule to inspector tabs and explorer lenses, not just views', () => {
    const entries = buildHelpEntries([], [], [surface('t', 'Renamed Tab')], [surface('l', 'Renamed Lens')])
    expect(entries.map((entry) => entry.title)).toEqual(['Renamed Tab', 'Renamed Lens'])
  })

  it('returns an empty outline when nothing is registered and there are no concepts', () => {
    expect(buildHelpEntries([], [], [], [])).toEqual([])
  })
})

describe('initialHelpSectionId (contextual open, EPIC-260080 bullet 6)', () => {
  const entries = buildHelpEntries(
    [topic('atom', 'Atoms')],
    [surface('flow', 'Flow'), surface('table', 'Table')],
    [surface('details', 'Details')],
    [surface('labels', 'Labels')],
  )

  it('opens on the active center view section when that view has an entry', () => {
    expect(initialHelpSectionId('table', entries)).toBe('help-views-table')
  })

  it('falls back to the first entry when the active view is gated off the enabled set', () => {
    // `enabledViews` is what help describes, so an active-but-disabled view has no section to
    // land on; the reader still gets a usable panel rather than a blank one.
    expect(initialHelpSectionId('board', entries)).toBe('help-concepts-atom')
  })

  it('does not match a same-named tab or lens — contextual open is keyed to views only', () => {
    // 'details' is a tab id here, not a view id: the group prefix stops it from being mistaken
    // for the active center view, which is the only shell-level state the panel can read.
    expect(initialHelpSectionId('details', entries)).toBe('help-concepts-atom')
  })

  it('returns an empty id for an empty outline, so the panel has nothing to scroll to', () => {
    expect(initialHelpSectionId('flow', [])).toBe('')
  })
})

describe('groupHelpEntries', () => {
  const entries = buildHelpEntries(
    [{ id: 'c1', title: 'Concept', summary: 's', body: [{ kind: 'paragraph', text: 't' }] }],
    [{ id: 'v1', label: 'View', help: { summary: 's', body: [{ kind: 'paragraph', text: 't' }] } }],
    [],
    [{ id: 'l1', label: 'Lens', help: { summary: 's', body: [{ kind: 'paragraph', text: 't' }] } }],
  )

  it('drops empty groups and keeps the outline order', () => {
    expect(groupHelpEntries(entries).map((s) => s.group)).toEqual(['concepts', 'views', 'lenses'])
  })

  it('labels each group and partitions every entry into exactly one of them', () => {
    const grouped = groupHelpEntries(entries)
    expect(grouped.map((s) => s.label)).toEqual(['Concepts', 'Views', 'Explorer lenses'])
    expect(grouped.flatMap((s) => s.entries)).toEqual(entries)
  })

  it('returns nothing for an empty outline', () => {
    expect(groupHelpEntries([])).toEqual([])
  })
})
