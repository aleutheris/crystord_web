import type { HelpSection, HelpTopic } from '../../help'

/**
 * Pure help-panel model (ADR-260085 / EPIC-260080 T3).
 *
 * Imports types only — no registry, no React — so the ordering, the anchor ids and the
 * contextual-open rule are testable as plain functions.
 */

/** The four ordered groups the table of contents renders. */
export type HelpGroupKey = 'concepts' | 'views' | 'tabs' | 'lenses'

export const HELP_GROUPS: readonly HelpGroupKey[] = ['concepts', 'views', 'tabs', 'lenses']

export const HELP_GROUP_LABELS: Record<HelpGroupKey, string> = {
  concepts: 'Concepts',
  views: 'Views',
  tabs: 'Inspector tabs',
  lenses: 'Explorer lenses',
}

/**
 * The slice of a slot descriptor the help panel reads. Structural on purpose: it matches
 * `ViewDescriptor`/`InspectorTabDescriptor`/`NavigatorDescriptor` without importing them, so
 * this module stays free of the registries it is asked to describe.
 */
export interface HelpSurface {
  id: string
  label: string
  help: HelpSection
}

/** One entry in both the table of contents and the body. */
export interface HelpEntry {
  /** DOM anchor id — also the table-of-contents key. */
  id: string
  /** Heading text. For a surface this is the descriptor's own `label` (ADR-260085 D3). */
  title: string
  group: HelpGroupKey
  section: HelpSection
}

/** Anchor id for a group's member. Stable across renames — keyed by registry id, not label. */
export function helpSectionId(group: HelpGroupKey, id: string): string {
  return `help-${group}-${id}`
}

function surfaceEntry(group: HelpGroupKey, surface: HelpSurface): HelpEntry {
  // `title` comes from the descriptor, never from the help module: a surface rename
  // propagates into help by construction rather than by anyone remembering to edit copy.
  return { id: helpSectionId(group, surface.id), title: surface.label, group, section: surface.help }
}

/**
 * The full ordered help outline: concepts first, then one entry per registered surface
 * (EPIC-260080 bullet 3). Surfaces contribute `label` + `help` only.
 */
export function buildHelpEntries(
  concepts: readonly HelpTopic[],
  views: readonly HelpSurface[],
  tabs: readonly HelpSurface[],
  lenses: readonly HelpSurface[],
): HelpEntry[] {
  return [
    ...concepts.map((topic) => ({
      id: helpSectionId('concepts', topic.id),
      title: topic.title,
      group: 'concepts' as const,
      section: topic,
    })),
    ...views.map((view) => surfaceEntry('views', view)),
    ...tabs.map((tab) => surfaceEntry('tabs', tab)),
    ...lenses.map((lens) => surfaceEntry('lenses', lens)),
  ]
}

/**
 * Which section help opens on (EPIC-260080 bullet 6): the section for the center view the
 * user is looking at, falling back to the first entry when that view has no entry — which
 * happens when the active view is gated off the enabled set, or when there are no surfaces
 * at all. Contextual open stops at the center view: the inspector's active tab and the left
 * rail's active lens are component-local, not shell state (Risks (b), the recorded open
 * question).
 */
export function initialHelpSectionId(activeView: string, entries: readonly HelpEntry[]): string {
  const target = helpSectionId('views', activeView)
  if (entries.some((entry) => entry.id === target)) return target
  return entries[0]?.id ?? ''
}

/**
 * The outline partitioned into the groups the panel renders, empty groups already dropped.
 *
 * Both the table of contents and the body render from this one function. They used to run the
 * same filter-and-skip loop independently, which typechecks and lints and passes while the two
 * quietly disagree about which groups exist or in what order — nothing asserts that the contents
 * list matches the body.
 */
export function groupHelpEntries(
  entries: readonly HelpEntry[],
): { group: HelpGroupKey; label: string; entries: HelpEntry[] }[] {
  return HELP_GROUPS
    .map((group) => ({
      group,
      label: HELP_GROUP_LABELS[group],
      entries: entries.filter((entry) => entry.group === group),
    }))
    .filter((section) => section.entries.length > 0)
}
