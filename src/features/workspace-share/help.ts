import type { HelpSection } from '../../help'

/**
 * Help copy for the Share inspector tab (ADR-260069 / EPIC-260080).
 *
 * The panel heads this section with the tab's own label, so the copy never names it.
 */
export const shareTabHelp: HelpSection = {
  summary:
    'See who the selected atom has been shared with, give a person or a workspace access to it, and take that access away again.',
  body: [
    {
      kind: 'paragraph',
      text:
        'The tab appears only on atoms you own — on anyone else’s atom it is not offered, ' +
        'because only an owner can change who has access. It opens by confirming that you own this atom.',
    },
    {
      kind: 'list',
      items: [
        'Each row of the Access grants list names one person or workspace, with the date and time access was granted.',
        'Type says whether the row is a user or a workspace; Level says whether they hold editor or viewer access.',
        'With nothing shared, the list reads “Not shared with anyone yet.”',
      ],
    },
    {
      kind: 'steps',
      items: [
        'Choose User or Workspace in the Principal type list; the text field relabels itself to Username or Workspace key to match.',
        'Type that username or workspace key into the field.',
        'Choose Editor or Viewer in the Access level list. It starts on Viewer, and keeps your last choice while you stay on this atom.',
        'Select Share. It stays unavailable until the field has text, and while a share or a revoke is still running.',
      ],
    },
    {
      kind: 'paragraph',
      text:
        'On success the field clears, the list reloads, and a line confirms who you shared with. ' +
        'If nothing matches what you typed, “No matching user or workspace was found.” appears, no access is given, ' +
        'and what you typed stays in the field so you can correct it.',
    },
    {
      kind: 'paragraph',
      text:
        'Removing access takes two steps: select Revoke on a row, and that button is replaced by ' +
        'Confirm revoke and Cancel. Confirm revoke drops the grant and reloads the list; Cancel leaves it ' +
        'in place. Anyone you revoke can be granted access again through the same form.',
    },
    {
      kind: 'paragraph',
      text:
        'Editor and viewer are the only levels you can hand out here, and ownership is not one of them — ' +
        'this tab cannot pass ownership of the atom to someone else.',
    },
  ],
}
