import type { HelpSection } from '../../help'

/**
 * Help copy for the Classify inspector tab (ADR-260063 / EPIC-260080).
 *
 * No title: the help panel heads this section with the tab's own label, so the copy never
 * names itself. Every sentence is checked against `ClassifyTab`, `CategoriesSection` and the
 * shared label chip editor — control names are quoted as they appear on screen.
 */
export const classifyTabHelp: HelpSection = {
  summary:
    'Tag the selected atom with free-form labels and with structured categories, each change saved the moment you make it.',
  body: [
    {
      kind: 'paragraph',
      text:
        'Two editors stack here, Labels above Categories. Labels are free-form: you type them '
        + 'yourself and each becomes a colored chip. Categories are structured: you pick a value out '
        + 'of a dimension that has already been set up. A label keeps the same color everywhere it is '
        + 'drawn — chips here, dots on the canvas — and the chip always shows its text, so color is '
        + 'never the only signal.',
    },
    {
      kind: 'paragraph',
      text:
        'Under Labels, type into the Add label box and press Enter. Labels already in use are offered '
        + 'as suggestions as you type, and a label already on this atom is not added twice.',
    },
    {
      kind: 'steps',
      items: [
        'Choose Assign category. Choosing it a second time closes the picker again, changing nothing.',
        'Pick one entry from the Dimension list; its values load underneath, reading Loading values… until they arrive.',
        'Expand branches with the ▸ arrow until you reach the value you want.',
        'Select that value. The picker closes, and once the change is saved the value joins its dimension row as a chip.',
      ],
    },
    {
      kind: 'list',
      items: [
        'Category chips sit on a row led by the name of their dimension and a ▸, so a row reads Region ▸ Belgium.',
        'Hover a category chip to read its full path, from the dimension down through each parent: Region ▸ Europe ▸ Belgium.',
        'The × on a chip drops it from this atom. For a category, the value itself stays in its dimension, ready for other atoms.',
        'With nothing assigned the section reads No categories assigned; if the categories cannot be loaded, a message takes their place.',
      ],
    },
    {
      kind: 'paragraph',
      text:
        'There is no save button: every addition and removal is written straight away. While one is '
        + 'being saved the chips stay visible but the editing controls step aside, so a second change '
        + 'cannot overwrite the first. If a save does not go through, a message says so and you can '
        + 'repeat the change. With view-only access the chips still show in their usual colors, but '
        + 'with no × and no Add label box, and a note says you have view-only access to this atom.',
    },
  ],
}
