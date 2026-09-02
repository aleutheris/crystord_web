import type { HelpSection } from '../help'

/**
 * Help copy for the Labels left-rail lens (surface ADR-260061 / EPIC-260080).
 *
 * Sits beside `LabelsNavigator.tsx` rather than in a feature folder because this lens is owned
 * by the shell itself. Carries no title on purpose: the help panel heads the section with the
 * lens's own label, so a rename propagates without touching this copy (`help/help-types.ts`).
 */
export const labelsNavigatorHelp: HelpSection = {
  summary:
    'Shows which labels the atoms in the current results carry, and how many carry each one.',
  body: [
    {
      kind: 'paragraph',
      text:
        'Each row pairs a label with a count: the number of atoms in the current results that '
        + 'carry that label. A label is listed once however many atoms use it, and an atom '
        + 'carrying several labels is counted under each of them. Rows are sorted '
        + 'alphabetically, and only labels present in the results appear — there are no zero rows.',
    },
    {
      kind: 'list',
      items: [
        'The list describes what is currently in the results, not the whole workspace.',
        'Picking a category value narrows the results straight away, and this list follows it. '
        + 'A search in the top bar narrows them only once you run it — typing in the field '
        + 'leaves this list untouched until then.',
        'Rows are read-only — clicking a label does not narrow the results or select an atom.',
        'When nothing in the results carries a label, the rail reads "No labels in the current '
        + 'results."',
      ],
    },
    {
      kind: 'paragraph',
      text:
        'To work with one of the labels you see here, narrow the results from the search field '
        + 'at the top of the window, then read this list again.',
    },
    {
      kind: 'steps',
      items: [
        'Note the label you want from this list.',
        'Type it into the Search labels field in the top bar, or click it among the label '
        + 'buttons in the same bar — those buttons offer the same labels this list counts.',
        'Press Run search query to reload the results for the labels you picked.',
        'Look back at this list: every count now describes the narrowed results.',
      ],
    },
    {
      kind: 'paragraph',
      text:
        'This list only reports what the atoms carry. Labels are added and removed one atom at '
        + 'a time: select an atom, then use the Classify tab that appears on the right. On an '
        + 'atom you can only view, that tab shows the labels but offers no way to change them.',
    },
    {
      kind: 'paragraph',
      text:
        'To browse by category dimension instead, click Categories in the row of tabs just '
        + 'above this list.',
    },
  ],
}
