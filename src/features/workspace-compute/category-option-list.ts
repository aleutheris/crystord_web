/**
 * Values requested per taxonomy read, and the ceiling on what one read can return:
 * "Pagination defaults to `limit=25`, **max limit=100**" (`user-guide.md:1096`) — over-limit
 * raises `OR-QUERY-LIMIT-EXCEEDED`, so asking for more does not return more.
 *
 * A dimension with more values than this cannot be listed in full by a single request. The
 * pickers do not page, so the overflow is unreachable — which callers must SAY rather than
 * present a page as the whole taxonomy (see `optionsWithSelected`'s `authoritative`).
 */
export const TAXONOMY_PAGE_LIMIT = 100

/** The minimum a dropdown needs to render one taxonomy option. */
export interface CategoryOption {
  key: string
  displayName: string
  /** Present in the taxonomy but unusable by the query — rendered, not selectable. */
  unusable?: boolean
}

/** What ownership marking needs from a `CategoryValue`. */
interface OwnedValue {
  key: string
  displayName: string
  accessLevel: 'OWNER' | 'EDITOR' | 'VIEWER'
}

/**
 * Mark values the caller does not OWN as unusable (EPIC-260082 §Constraints).
 *
 * `retrieveCategoryValues` is access-scoped to taxonomy the caller owns **or has been granted**
 * (`user-guide.md:270-272`), but the category COLLECT queries "only resolve values you own"
 * (`user-guide.md:1320`). A granted value therefore selects cleanly, satisfies the
 * required-constants gate, saves without error — and then collects nothing, reporting success.
 * That is the exact silent-empty outcome the dropdown was chosen over a text box to prevent.
 *
 * The asymmetry is deliberate: the DIMENSION is matched by key, so a granted dimension is
 * legitimately usable and must stay unfiltered. Only values carry the ownership constraint.
 * Marked rather than hidden, so "why isn't the value I can see in Classify offered here?" is
 * answered in place — assignments are limited to *readable* taxonomy (`user-guide.md:1102-1104`),
 * so a user really can classify at a value they cannot collect.
 */
export function markUnusableValues(values: readonly OwnedValue[]): CategoryOption[] {
  return values.map((v) => (
    v.accessLevel === 'OWNER'
      ? { key: v.key, displayName: v.displayName }
      : { key: v.key, displayName: `${v.displayName} (shared with you — cannot be collected)`, unusable: true }
  ))
}

/** Whether a stored value key is present but unusable — the save must not proceed on it. */
export function isUnusableValue(options: readonly CategoryOption[], selected: string): boolean {
  return options.some((o) => o.key === selected && o.unusable === true)
}

/**
 * Options for one dropdown, with a **sticky option** for a stored key the list does not offer
 * (renamed, deleted, authored against another taxonomy — or simply not loaded yet). Without it a
 * `<select>` whose value matches no option renders blank-or-first while state still holds the
 * stored key — the user would see one value and save another. Same spirit as the shortened-UUID
 * fallback that out-of-set atom references get (ADR-260065 §3): show it honestly, don't drop it.
 *
 * `authoritative` says whether the list is known to be COMPLETE. Only then may the option claim
 * the key is absent from the taxonomy: an empty list also means "still loading" or "load failed",
 * and an unconditional claim would libel the user's own valid data on every open of a saved
 * category COLLECT, for the duration of the fetch. When it is not authoritative the key still
 * shows — the mismatch this function exists to prevent matters more than the annotation.
 */
export function optionsWithSelected(
  known: readonly CategoryOption[],
  selected: string,
  authoritative: boolean,
): CategoryOption[] {
  if (selected === '' || known.some((k) => k.key === selected)) return [...known]
  const displayName = authoritative ? `${selected} (not in your taxonomy)` : selected
  return [...known, { key: selected, displayName }]
}
