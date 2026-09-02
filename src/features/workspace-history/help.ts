import type { HelpSection } from '../../help'

/**
 * Help copy for the History inspector tab (ADR-260068 / EPIC-260080).
 *
 * The panel heads this section with the tab's own label, so the copy never names it and opens
 * on what the tab is for rather than on the surface name (ADR-260085 D3).
 */
export const historyTabHelp: HelpSection = {
  summary:
    'Read what changed on the selected atom, when it changed, and who made the change — a record you can read but not edit.',
  body: [
    {
      kind: 'paragraph',
      text:
        'The selected atom’s recorded changes are listed newest first, ten at a time, with older ones loaded on request. ' +
        'Nothing here can be edited or undone — this is an account of what already happened. ' +
        'Pick a different atom and the list is loaded again for that one. ' +
        'When an atom has no recorded changes, the tab reads “No recorded changes for this atom.” instead of listing entries.',
    },
    {
      kind: 'list',
      items: [
        'The date and time of the change, in the format your device uses.',
        'A small chip naming the kind of change, exactly as it was recorded.',
        'The author, as an identifier rather than a name.',
        'The remark the author left, in italics. Some changes carry none.',
        'One line per changed field: the field name, then the old value, then an arrow to the new value. A dash stands for a value that was absent altogether.',
        'For a field that holds a list, a further line counting how many entries were removed, how many were added, and how many there are in total afterwards.',
        'Long values are shortened to fit; hover over one to read it in full.',
      ],
    },
    {
      kind: 'steps',
      items: [
        'Read down the list — the most recent change sits at the top.',
        'Choose Show more to add the next batch of up to ten older entries. It is hidden while a batch is loading, and once a batch comes back short — the sign that there is nothing older left.',
        'Choose Refresh history, the ⟳ button beside the heading, to load the list again. It starts over at the newest ten, so entries you had added with Show more are dropped. It cannot be used while entries are loading.',
      ],
    },
    {
      kind: 'paragraph',
      text:
        'A long author identifier is shortened; hover over it to read it in full. There is no name to show in its place. ' +
        'If a load fails, a message appears at the top of the tab and anything already listed stays on screen; choose Refresh history to try again.',
    },
  ],
}
