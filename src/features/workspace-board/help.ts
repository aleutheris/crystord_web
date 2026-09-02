/**
 * In-app help copy for the Board center view (EPIC-260080 / ADR-260070).
 *
 * The panel heads this section with the surface's own registered label, so the copy never opens
 * by naming it. That guarantee covers the heading only (ADR-260085 D3) — control names in the
 * body below are plain literals, so a rename means re-reading this file.
 * Every claim below is behavior shipped in `BoardView`, `BoardColumn`, `BoardCard`,
 * `board-model`, and `use-board-taxonomy`.
 */
import type { HelpSection } from '../../help'

export const boardViewHelp: HelpSection = {
  summary:
    'Classify atoms in bulk by laying them out as cards in columns — one column per top-level value of the category dimension you choose, plus Unassigned.',
  body: [
    {
      kind: 'steps',
      items: [
        'Pick a dimension from the Board dimension menu at the top; until you do, the board reads "Choose a dimension to lay out the board."',
        'Read the columns: Unassigned comes first, then one column per top-level value of that dimension, each headed by its name and card count.',
        'Move a card by dragging it onto another column, or open the card\'s "Move to…" menu, which lists every column including Unassigned.',
      ],
    },
    {
      kind: 'paragraph',
      text:
        'A move rewrites only the dimension the board is laid out by: the atom takes exactly that column\'s value, and its values in every other dimension are left untouched. Moving a card to Unassigned clears this dimension alone. Clicking a card selects its atom.',
    },
    {
      kind: 'list',
      items: [
        'A card appears under the top-level column its value belongs to, however deeply that value is nested beneath it.',
        'An atom with no value in this dimension, or one the dimension no longer offers, sits in Unassigned.',
        'An atom holding values under two different columns appears as a card in each of them; several values under the same column still show one card.',
        'Moving a card onto the column it already appears in through a nested value replaces that nested value with the top-level one; moving a card whose only value is exactly that column\'s does nothing.',
        'Moving a card that appears in several columns leaves the atom with the target column\'s value alone, so it drops out of the others.',
      ],
    },
    {
      kind: 'list',
      items: [
        'A card you can only view cannot be dragged and has no "Move to…" menu.',
        'A card fades while its change is saving and can be neither dragged nor moved by menu, then returns when the save finishes.',
        'If a save fails, "Could not save the change. Please try again." appears above the columns and the card stays put; the message clears as soon as a move saves.',
      ],
    },
  ],
}
