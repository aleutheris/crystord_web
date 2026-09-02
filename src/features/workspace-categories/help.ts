import type { HelpSection } from '../../help'

/**
 * Help copy for the Categories left-rail lens (EPIC-260080; surface ADR-260064, extended by
 * ADR-260071 for the nested dimension hierarchy and inline re-parenting).
 *
 * No heading here on purpose: the help panel heads the section with the lens's own label.
 */
export const categoriesNavigatorHelp: HelpSection = {
  summary:
    'Browse the category dimensions and values you own or have been given access to, and pick '
    + 'values to narrow the results.',
  body: [
    {
      kind: 'paragraph',
      text:
        'The rail lists top-level dimensions. Expand one to see the dimensions nested under it '
        + 'and then its own values; expand a value to reach the values beneath it. Contents load '
        + 'the first time you expand something, so it reads Loading… briefly. Each value carries '
        + 'a count in parentheses — the atoms you can see at that value or at any value beneath '
        + 'it. Clicking a dimension name expands or collapses it rather than filtering; before '
        + 'anything exists the rail reads No categories yet.',
    },
    {
      kind: 'steps',
      items: [
        'Check or clear Include subcategories. It starts checked, and while it is checked a '
        + 'value you pick also matches atoms filed at the values beneath it.',
        'Click a value name. The results narrow to that value straight away, and a chip appears '
        + 'at the top of the window beside the search field, reading the dimension key ▸ the '
        + 'value key — the keys, not the display names.',
        'Pick more values: several in one dimension match atoms in any of them, while values in '
        + 'different dimensions must all match.',
        'Click a picked value again, or the × on its chip, to drop it.',
      ],
    },
    {
      kind: 'paragraph',
      text:
        'Include subcategories is recorded when a dimension gets its first picked value, and '
        + 'that dimension’s later picks follow it; changing the checkbox afterwards applies only '
        + 'to dimensions you have not picked in yet.',
    },
    {
      kind: 'list',
      items: [
        '+ Add dimension opens a form: type a key and a display name, then press Create '
        + 'dimension. Once other dimensions exist, the form also offers a parent for the new '
        + 'one, starting on No parent (top level).',
        'A ✎ button sits beside every dimension and value you own or can edit. It opens an '
        + 'editor for that one below the list; clicking it again closes the editor.',
        'In that editor: change the Display name and press Rename; add a value beneath, with a '
        + 'key plus a display name and Add value; or press Delete, which asks again as Confirm '
        + 'delete, with Cancel beside it.',
        'Move this dimension appears only on a dimension you own — pick its new parent, then '
        + 'press Set parent. On a dimension you can edit but do not own, the editor says Only '
        + 'this dimension’s owner can move it instead.',
      ],
    },
  ],
}
