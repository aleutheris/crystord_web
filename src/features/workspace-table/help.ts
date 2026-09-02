/**
 * In-app help copy for the Table center view (EPIC-260080 / ADR-260062).
 *
 * The panel heads this section with the surface's own registered label, so the copy never opens
 * by naming it. That guarantee covers the heading only (ADR-260085 D3) — control names in the
 * body below are plain literals, so a rename means re-reading this file.
 * Every claim below is behavior shipped in `TableView`, `EditableCell`, `sort.ts`, and the
 * shared `LabelChipEditor`.
 */
import type { HelpSection } from '../../help'

export const tableViewHelp: HelpSection = {
  summary:
    'Work through the atoms in the current results as spreadsheet rows, editing their titles, labels, and content directly in the cells.',
  body: [
    {
      kind: 'paragraph',
      text:
        'Every atom in the current results gets one row, sorted by title from A to Z with capitals ignored, under four columns: Title, Labels, Content, and Computed. Create Atom, at the top right, opens the Create New Atom panel; with no results loaded, the table asks you to run a search first.',
    },
    {
      kind: 'list',
      items: [
        'Title — edit it in the cell; it will not save empty.',
        'Labels — type into Add label and press Enter to attach one; choose the × on a label to remove it.',
        'Content — edit it in the cell, over several lines if you need them.',
        'Computed — shows ƒ when the content comes from a formula; that content is set on the Compute tab and read-only here.',
        'An atom you may only view shows its title, labels, and content as plain text, with nothing to edit; so does one whose access is unknown.',
      ],
    },
    {
      kind: 'steps',
      items: [
        'Click a Title or Content cell to turn it into a text box holding its current value.',
        'Type the new value.',
        'Press Enter to save. In a Content cell, Enter adds a line and Ctrl+Enter (Cmd+Enter on a Mac) saves.',
        'Press Escape, or click outside the cell, to keep the old value.',
      ],
    },
    {
      kind: 'paragraph',
      text:
        'Each cell saves on its own; there is no separate save step for the row. While a save is on its way the row dims and takes no further edits. If it fails, "Could not save the change. Please try again." appears above the table and clears on the next successful save.',
    },
    {
      kind: 'paragraph',
      text:
        'Clicking a row selects that atom and highlights it — the same selection the panel on the right and the other views follow, so switching views keeps that atom in focus. Starting an edit does not select the row. With a row focused, Arrow Up and Arrow Down move between rows, and Enter selects it.',
    },
  ],
}
