import type { HelpSection } from '../../help'

/**
 * Help copy for the Compute inspector tab (EPIC-260080 / ADR-260065).
 *
 * Carries no title: the help panel heads this section with the tab's own registered label, so
 * the copy never names the tab and never opens with it. Every control is quoted as it appears
 * on screen (`ComputeTab`, `FormulaBuilder`, `ArgSlots`, `CollectEditor`, `ExplainSection`).
 */
export const computeTabHelp: HelpSection = {
  summary:
    "Replace an atom's hand-entered content with a formula computed from other atoms, and see why its last result came out the way it did.",
  body: [
    {
      kind: 'paragraph',
      text:
        'An atom is either manual or computed. A manual one says its content is entered by hand and offers Add computation; a computed one shows a Formula line such as SUM(Invoice, taxRate), with Edit formula and Convert to manual at the bottom.',
    },
    {
      kind: 'steps',
      items: [
        'Select Add computation, or Edit formula on an atom that already has one.',
        'Pick a calculation from the Operation list; its description appears underneath.',
        'Fill each row under Arguments: Atom reference matches part of a title among the atoms in your current results — an atom outside them will not be offered — and Constant points at a key you added under Constants, where a numeric value is stored as a number. Add argument adds a row, and Remove argument takes one away.',
        'Select Save formula. It stays disabled while anything is missing, and the reason appears just above it.',
      ],
    },
    {
      kind: 'list',
      items: [
        'SUM adds one or more inputs; PRODUCT multiplies two or more.',
        'MINUS subtracts the second input from the first and DIVIDE divides the first by the second; the builder offers exactly two rows for each.',
        'COLLECT gathers atoms in bulk: instead of the Arguments and Constants rows it takes one choice from the Collect query list.',
      ],
    },
    {
      kind: 'list',
      items: [
        'Atoms with all of these labels — add each label under Labels to collect, pressing Enter after each; at least one is required.',
        'Atoms at this category value — pick a Category dimension, then a Category value; both are required.',
        'Atoms at this category value and everything beneath it — the same pair, extended to the values below the one you pick.',
        'A category value shared with you is listed but cannot be picked, because collecting resolves only values you own.',
      ],
    },
    {
      kind: 'paragraph',
      text:
        'Once the atom has been evaluated, Explain this value reports that result in plain words: up to date with the number of inputs used, skipped because an optional input was absent, the atoms caught in a dependency loop, the inputs that failed further up, or the cause here — a division by zero, a missing dependency, an empty collect setting. Flow can badge the same atom OK, Error, or Skipped.',
    },
    {
      kind: 'paragraph',
      text:
        'Convert to manual asks Remove the formula and enter content by hand? first: Convert clears the formula and hands the content back to you, and Keep formula leaves it as it is. With view-only access a note says you have view-only access to this atom and the buttons that change the formula are not shown, while the formula and its explanation still read normally.',
    },
  ],
}
