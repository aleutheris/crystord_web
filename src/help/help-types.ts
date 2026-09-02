/**
 * In-app help content contracts (ADR-260085 / EPIC-260080).
 *
 * `src/help/` is a leaf: it imports nothing and is imported by both `ui-shell` (the slot
 * descriptors and the help panel) and the feature modules that author their own surface's
 * copy. That direction is what makes co-located content possible at all — a feature must not
 * import `ui-shell`, so the shared type cannot live in `slot-types.ts`. Precedent: `src/a11y/`.
 *
 * Content is typed TypeScript rather than markdown on purpose (EPIC-260080 bullet 5): the
 * required `help` field on every slot descriptor is a compile-time gate, and no markdown file
 * can be type-checked into existence.
 */

/** One rendered block of help copy. */
export type HelpBlock =
  /** A prose paragraph. */
  | { kind: 'paragraph'; text: string }
  /** An unordered list — facts, options, or things a surface shows. */
  | { kind: 'list'; items: string[] }
  /** An ordered list — a task the reader performs in sequence. */
  | { kind: 'steps'; items: string[] }

/**
 * Help copy for one registered shell surface (a view, an inspector tab, a navigator lens).
 *
 * Deliberately carries no `title`: the panel renders the surface's own `descriptor.label`, so a
 * rename propagates by construction and a section can never drift from the control it describes
 * (ADR-260085 D3). `body` must be non-empty — asserted over the imported registries.
 */
export interface HelpSection {
  /** One sentence answering "what is this surface for?", shown under the heading. */
  summary: string
  /** Ordered content blocks. Never empty. */
  body: HelpBlock[]
}

/**
 * A standalone concept entry (Atom, Label, Bond, …). Unlike a surface section it owns its
 * `title`, because no registry descriptor names it.
 */
export interface HelpTopic extends HelpSection {
  /** Stable anchor key, unique within the concepts list. */
  id: string
  title: string
}
