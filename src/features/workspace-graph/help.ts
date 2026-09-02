/**
 * Help copy for the two graph canvases — the relationship canvas (ADR-260028 / ADR-260036 /
 * ADR-260038) and the calculation canvas (ADR-260039 / ADR-260040 / ADR-260072, badges per
 * ADR-260065, zoom detail per ADR-260067). Authored for EPIC-260080.
 *
 * No section carries a title: the help panel heads each one with the view's own registered
 * label, so a rename propagates without touching this copy.
 */
import type { HelpSection } from '../../help'

export const networkViewHelp: HelpSection = {
  summary: 'Map how atoms reference one another, and draw new relationships between them by hand.',
  body: [
    {
      kind: 'paragraph',
      text:
        'Each atom in the current result is a circle labeled with its title; hover one to see its labels as well. ' +
        'A line between two circles is a bond, and the arrowhead points from the atom that names the bond to its target. ' +
        'Circles are placed automatically so connected atoms sit near each other. Drag a circle to move it, and choose ' +
        'Re-layout to arrange them all again — which discards the positions you moved by hand.',
    },
    {
      kind: 'steps',
      items: [
        'Hover an atom you can edit; a ring appears around its circle.',
        'Drag from that ring onto a second atom, dropping anywhere on its circle or the ring around it.',
        'In the Name this Bond dialog, type a name for the relationship — it starts as RELATES_TO — and choose Create.',
      ],
    },
    {
      kind: 'list',
      items: [
        'Click an atom to select it — bold outline, highlighted background — and it opens in the panel on the right; click empty canvas or press Escape to clear the selection.',
        'Arrow Right or Arrow Down selects the next atom, Arrow Left or Arrow Up the previous one.',
        'With an atom you own selected, Delete asks you to confirm deleting it.',
        'After a deletion, an Undo button sits at the bottom of the screen for six seconds, counting down.',
        'Create Atom, at the top right, adds an atom.',
      ],
    },
    {
      kind: 'paragraph',
      text:
        'A collapsible Legend in the bottom-right corner restates what a circle, a line and a selected atom mean. ' +
        'A search returning more than 400 atoms is not drawn until you choose Render anyway, and above that size the ' +
        'atoms are placed in a plain grid instead of the usual arrangement.',
    },
  ],
}

export const flowViewHelp: HelpSection = {
  summary: 'Follow how values move through calculations, from the atoms that supply them to the atoms computed from them.',
  body: [
    {
      kind: 'paragraph',
      text:
        'Atoms are laid out in columns from left to right: the atoms that are calculated from nothing else sit on the ' +
        'left, and every atom computed from them sits further right. An arrow runs from the atom that supplies a value ' +
        'to the atom that consumes it, so reading left to right follows the calculation.',
    },
    {
      kind: 'paragraph',
      text:
        'By default only atoms joined by at least one calculation link appear. Include all adds the remaining atoms of ' +
        'the current result; those extras are drawn dimmed, with a dashed outline, because they neither feed a ' +
        'calculation nor come out of one. Choose it again to return to the smaller set.',
    },
    {
      kind: 'list',
      items: [
        'As you zoom in, each atom grows from a dot and title into a block showing its value, an ƒ mark when it has a formula, and up to four small dots — round for labels, square for category dimensions, with a +N count when there are more.',
        'A tag in the top-right corner reports the last calculation: OK, Error or Skipped; point at it for the detail, such as "Up to date" or "Skipped — optional input absent".',
        'An atom you fill in by hand carries no tag unless the last run reported a failure for it, and setting Compute badges to Selected atom only, under Preferences, limits tags to the atom you have selected.',
      ],
    },
    {
      kind: 'paragraph',
      text:
        'When atoms end up depending on each other in a loop, every line in that loop is drawn thicker and in red, and ' +
        'the atoms involved show an Error tag whose detail reads Dependency cycle.',
    },
    {
      kind: 'list',
      items: [
        'Click an atom to select it and open it in the panel on the right.',
        'Re-layout restores the columns after you have dragged atoms around; Create Atom adds an atom.',
      ],
    },
  ],
}
