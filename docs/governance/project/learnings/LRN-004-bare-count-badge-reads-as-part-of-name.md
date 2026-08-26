# Learning Record: LRN-004 A bare trailing count badge reads as part of the name — worst at zero

## 1. Context

- Date discovered: 2026-08-26
- Discovered by: user report, walked back to root cause with the assistant
- Area: `ui-primitives` (`CategoryTree` widget), consumed by `workspace-categories` and
  `workspace-classify`
- Trigger: user noticed every freshly-created category value displayed as e.g. `Tesla0` in the
  Categories navigator after refresh

## 2. What Happened

`CategoryTree` renders each node's name and its `atomCount` badge as two adjacent `<span>`
elements with no separator between them:

```jsx
<span className={classNames?.label}>{node.displayName}</span>
{node.atomCount !== undefined && <span className={classNames?.count}>{node.atomCount}</span>}
```

The component's own doc comment calls it "style-neutral... data/styling injected" — it expects
callers to pass a `classNames` prop supplying real CSS spacing between `.label` and `.count`.
Neither of its two consumers (`CategoriesNavigator.tsx`, `CategoriesSection.tsx`) does. With no
CSS gap and no whitespace in the markup, adjacent inline elements render flush against each
other, so `Tesla` + `0` rendered as `Tesla0`.

It was most visible right after creating a value: a brand-new value has never had an atom
classified into it, so `atomCount` is `0` the moment it first renders — and `0` glued onto a name
reads as a typo or a stray character, not as "zero atoms," which is what made it get noticed and
reported as a bug rather than "no styling yet."

## 3. Why It Happened

- The widget's "style-neutral" contract was interpreted as "the caller must supply ALL visual
  separation," including the minimum needed for the badge to be legible as a badge at all. But a
  bare trailing number next to a name isn't just unstyled — it's ambiguous regardless of styling
  intent, because nothing marks it as a distinct, meaningful value rather than part of the string.
- Both consumers were built independently and neither supplied `classNames.count`, so the gap
  went unnoticed in review — there was no single place that would have caught "nobody actually
  passes this."

## 4. Impact

- User impact: low-to-medium — cosmetic, but actively misleading (looked like corrupted data,
  not a missing zero-count badge), and would recur for every consumer that skips `classNames`.
- Delivery impact: none — caught and fixed same-session, no rework beyond the fix itself.
- Quality impact: a client-rendering defect, not a data or backend defect (see the sibling
  investigation on `_System` labels in the same session for the contrast — that one WAS
  backend-originated; this one was not).

## 5. Prevention and Guardrails

- Preventive action: the count now renders as `(N)` baked into the widget itself
  (`CategoryTree.tsx`), not left to caller-supplied CSS — a self-delimiting format is legible with
  zero styling, so the widget's "style-neutral" contract no longer has to cover this case.
- Verification signal: `CategoryTree.test.tsx` has a dedicated regression test asserting an
  `atomCount: 0` node renders `(0)` as a separate node and never `Name0` as one string.

## 6. What To Do Next Time

When a "style-neutral, styling injected" component renders a bare number, date, or other
low-context value next to a name/label with no caller-supplied separator guaranteed, check
whether the value is self-evidently distinct without any styling at all (parens, a colon, a unit
suffix). If it isn't, that's markup the widget itself should own — don't defer legibility to a
`classNames` prop that may never actually be supplied by any consumer.

## 7. Cross-References

- Related epics / requirements: EPIC-260068 (Categories Navigator, original `CategoryTree`
  consumer), EPIC-260067 (Classify tab, second consumer)
- Related ADRs: ADR-260061 (`ui-primitives` / shared widget seam), ADR-260064 (Categories
  Navigator, introduced the count badges), ADR-260071 (current Categories Navigator baseline)
- Related ICRs / contracts: N/A — no interface change; `atomCount` semantics
  (`CategoryChildCount.atomCount`, schema.graphql) are unchanged, only its rendering.

## 8. Status

- Status: Active
- Superseded by: N/A
