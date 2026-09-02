import type { HelpSection } from '../../help'

/**
 * Help copy for the Details inspector tab (ADR-260061 / EPIC-260080).
 *
 * No title: the help panel heads this section with the tab's own label, so the copy never
 * names itself. Every sentence is checked against `DetailPanel` — which the atom-creation
 * overlay reuses — plus `Inspector`, `WorkspaceShell`, `DeleteConfirmDialog` and
 * `atomPermissions`; control names are quoted as they appear on screen.
 */
export const detailsTabHelp: HelpSection = {
  summary:
    'Read and edit the selected atom’s title, description, and content, and delete the atom if you own it.',
  body: [
    {
      kind: 'paragraph',
      text:
        'Select an atom and the inspector opens along the right edge; this is the first of its tabs. '
        + 'It holds three fields: Title, which every atom must have, Description for a short summary, '
        + 'and Content for the atom’s own text. What you type stays in the form until you save it — '
        + 'the ✕ button clears the selection and closes the inspector, and moving to another tab and '
        + 'back starts the form over, so either one drops an unsaved edit.',
    },
    {
      kind: 'steps',
      items: [
        'Select an atom, then choose Details in the inspector tabs.',
        'Change the Title, Description, or Content field.',
        'Choose Save. It reads Saving… while the change is stored, and if the change does not go through, a message appears just above the button.',
      ],
    },
    {
      kind: 'steps',
      items: [
        'To remove an atom you own, choose Delete at the bottom right of the panel.',
        'Read the Delete Atom? dialog that opens — it names the atom you are about to delete.',
        'Choose Delete there to remove it, or Cancel to keep it. Deleting clears the selection, so the inspector closes with it.',
      ],
    },
    {
      kind: 'list',
      items: [
        'With view-only access a note near the top reads You have view-only access to this atom, the fields cannot be typed into, and no Save button appears.',
        'An editor can change the fields and save them; Delete appears only for the atom’s owner.',
        'On a computed atom, Content cannot be edited, and a note under it says the value comes from the atom’s formula — the formula itself lives in the Compute tab.',
        'Labels are not edited here once an atom exists — the Classify tab and the Table view own them.',
        'The ▸ button beside the tabs collapses the inspector to a strip, and the ◂ button on that strip opens it again.',
      ],
    },
    {
      kind: 'paragraph',
      text:
        'The same form serves the Create Atom overlay, headed Create New Atom. It adds a Labels field '
        + 'between Title and Description, and its button reads Create instead of Save. Create stays '
        + 'disabled — with the note Add at least one label — an atom needs one to be created — until a '
        + 'label is there; typing one into Add label counts, so you need not press Enter first. While '
        + 'the atom is being created the button reads Creating….',
    },
  ],
}
