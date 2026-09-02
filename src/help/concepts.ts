/**
 * Core-concept help topics (ADR-260085 / EPIC-260080).
 *
 * The six ideas the workspace is built from — atom, label, bond, category, formula, grant.
 * Unlike a surface section these carry their own `title`: no shell surface names them, so the
 * help panel has nothing else to head them with. Written for someone using the app, from the
 * shipped controls; `docs/user-guide.md` was used only to confirm each statement is true.
 */
import type { HelpTopic } from './help-types'

export const helpConcepts: HelpTopic[] = [
  {
    id: 'atom',
    title: 'Atoms',
    summary:
      'An atom is one unit of information — a task, a customer, a cost line — with a title, a description, and a content value.',
    body: [
      {
        kind: 'paragraph',
        text:
          'Everything else in the workspace hangs off an atom: the labels that group it, the categories that classify it, the bonds that link it to other atoms, and the formula that can compute its content. The Details tab holds Title, Description and Content, and shows the atom’s identifier at the bottom.',
      },
      {
        kind: 'steps',
        items: [
          'Choose Create Atom — every view offers it.',
          'Type a Title, then add at least one label. An atom cannot be created without one.',
          'Fill in Description and Content now if you have them; both stay editable afterwards, until a formula takes Content over.',
          'Choose Create.',
        ],
      },
      {
        kind: 'paragraph',
        text:
          'Only the owner of an atom can delete it, so Delete appears only on your own atoms, and it asks you to confirm first. On the canvas you can select an atom and press the Delete key instead: the same confirmation, and then an Undo button at the bottom of the screen for a few seconds.',
      },
    ],
  },
  {
    id: 'label',
    title: 'Labels',
    summary: 'Labels are free-text tags you attach to an atom to group it and find it again.',
    body: [
      {
        kind: 'paragraph',
        text:
          'An atom needs at least one label the moment it is created. After that, labels live in the Classify tab: type into Add label and press Enter to attach one, picking from the suggestions of labels already in use, or leave the list and type something new. The × on a chip removes it.',
      },
      {
        kind: 'paragraph',
        text:
          'Each chip you add or remove is saved straight away — there is no separate save step, and a failure says so instead of quietly dropping the change. In the left rail, the Labels lens lists every label present in the current results with a count beside it.',
      },
    ],
  },
  {
    id: 'bond',
    title: 'Bonds',
    summary: 'A bond is a named, one-way link from one atom to another.',
    body: [
      {
        kind: 'steps',
        items: [
          'On the canvas, drag a connection from one atom to another.',
          'In the Name this Bond dialog, type a Bond name — it starts out as RELATES_TO.',
          'Choose Create.',
        ],
      },
      {
        kind: 'paragraph',
        text:
          'The bond belongs to the atom you dragged from and points at the one you dropped on, so its name reads in that direction: DEPENDS_ON, BELONGS_TO, RELATES_TO.',
      },
      {
        kind: 'paragraph',
        text:
          'Adding a bond changes the atom it starts from, so it needs editor access to that atom. Categories are not bonds — classifying an atom never creates a link between atoms.',
      },
    ],
  },
  {
    id: 'category',
    title: 'Categories, dimensions and values',
    summary:
      'A category classifies an atom along a named axis: a dimension such as Region, holding values such as Europe and Belgium.',
    body: [
      {
        kind: 'paragraph',
        text:
          'Values can sit under other values, so one dimension can hold a whole tree. That is the difference from labels: a label is text you type, while a category value is chosen from a structure that already exists.',
      },
      {
        kind: 'steps',
        items: [
          'In the Classify tab, choose Assign category.',
          'Pick the axis from the Dimension list.',
          'Expand that dimension’s values and choose the one the atom belongs to.',
        ],
      },
      {
        kind: 'paragraph',
        text:
          'Assigned values appear as chips on a row led by their dimension name; hover one to see its full path, such as Region ▸ Europe ▸ Belgium, and use the × to clear it. The Categories lens in the left rail browses the same tree with atom counts, and choosing a value narrows the working set to it — with Include subcategories on, to everything beneath it as well.',
      },
    ],
  },
  {
    id: 'formula',
    title: 'Formulas and computed atoms',
    summary: 'A formula makes an atom’s content a computed value instead of one you type.',
    body: [
      {
        kind: 'steps',
        items: [
          'Open the Compute tab of a manual atom and choose Add computation.',
          'Pick what it does: SUM, MINUS, PRODUCT and DIVIDE work on numbers, COLLECT gathers atoms.',
          'For the number operations, fill in every row under Arguments — each is either an Atom reference, found by title among the atoms in your current results, or a Constant you have added under Constants. Add argument adds a row; COLLECT replaces those rows with its own picker.',
          'Choose Save formula. It stays disabled while anything is missing, and the reason appears just above it.',
        ],
      },
      {
        kind: 'paragraph',
        text:
          'From then on the atom’s Content is read-only in the Details tab and shows the computed result. The Compute tab prints the formula and, under Explain this value, says in plain words how it went: how many inputs it was computed from, which inputs failed, or which atoms form a dependency loop.',
      },
      {
        kind: 'paragraph',
        text:
          'COLLECT gathers atoms rather than numbers — those carrying all of a set of labels, those at one category value, or those at a value and everything beneath it. Convert to manual discards the formula and hands the content back to you to type, so it asks you to confirm first.',
      },
    ],
  },
  {
    id: 'grant',
    title: 'Sharing and access',
    summary:
      'Sharing gives another person, or a whole workspace, access to one atom at the level you choose.',
    body: [
      {
        kind: 'paragraph',
        text:
          'The Share tab appears only on atoms you own. Enter a username — or switch the type to Workspace and enter a workspace key — choose Editor or Viewer, and choose Share.',
      },
      {
        kind: 'list',
        items: [
          'An editor can change the atom’s details, its labels, its categories, its formula, and the bonds that start from it.',
          'A viewer sees the same atom read-only: the editing controls are gone and a note says the access is view-only.',
          'Only the owner can delete an atom, share it, or take that sharing away.',
        ],
      },
      {
        kind: 'paragraph',
        text:
          'The tab lists everyone who currently has access, whether each is a user or a workspace, the level they hold, and when it was granted. Revoke asks you to confirm before the access is removed.',
      },
    ],
  },
]
