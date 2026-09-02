import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useModalFocus } from '../../a11y/use-modal-focus'
import { helpConcepts } from '../../help'
import { C_BORDER, C_OVERLAY, C_SURFACE, C_TEXT_SECONDARY } from '../../styles/tokens'
import { enabledViews, inspectorTabs, navigators } from '../slots'
import { HelpBlocks } from './HelpBlocks'
import { HelpContents } from './HelpContents'
import { buildHelpEntries, groupHelpEntries, initialHelpSectionId } from './help-model'

const dialogStyle: CSSProperties = {
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 'min(46rem, 92vw)',
  height: 'min(34rem, 86vh)',
  background: C_SURFACE,
  border: `1px solid ${C_BORDER}`,
  borderRadius: '8px',
  padding: '1rem',
  zIndex: 1001,
  display: 'flex',
  flexDirection: 'column',
}

const summaryStyle: CSSProperties = {
  margin: '0 0 0.5rem',
  fontSize: '0.85rem',
  lineHeight: 1.55,
  color: C_TEXT_SECONDARY,
}

/** `scrollIntoView` is optional-called because jsdom does not implement it. */
function scrollToSection(id: string) {
  if (!id) return
  document.getElementById(id)?.scrollIntoView?.({ block: 'start' })
}

/**
 * The in-app help panel (ADR-260085 / EPIC-260080 T3).
 *
 * A centered modal, not a route: it mounts as a sibling of the workspace tree, so the working
 * set, the selection, the active view, the facets and the canvas node positions all survive
 * opening and closing it with no new code (bullet 2). Focus-in, the Tab trap, Escape and
 * focus-restore-to-the-trigger are inherited from `useModalFocus`.
 *
 * Content is the concepts list followed by one section per registered surface, each headed by
 * that surface's own registry `label`. It opens on the section for the center view the user is
 * currently in.
 */
export function HelpPanel({ activeView, onClose }: { activeView: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useModalFocus(dialogRef, onClose)

  const entries = useMemo(
    () => buildHelpEntries(helpConcepts, enabledViews, inspectorTabs, navigators),
    [],
  )
  // Seeded once, and never reassigned: the section help opens on (bullet 6).
  const [openOn] = useState(() => initialHelpSectionId(activeView, entries))
  const [currentId, setCurrentId] = useState(openOn)

  // Contextual open, on mount only (`openOn` never changes). Every later scroll happens in
  // `selectSection`, not here: keying this effect on `currentId` made re-selecting the section
  // you are already on a dead click, because the state it watched never changed.
  useEffect(() => { scrollToSection(openOn) }, [openOn])

  function selectSection(id: string) {
    setCurrentId(id)
    scrollToSection(id)
  }

  return (
    <>
      <div aria-hidden="true" onClick={onClose} style={{ position: 'fixed', inset: 0, background: C_OVERLAY, zIndex: 1000 }} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="help-title" tabIndex={-1} style={dialogStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h2 id="help-title" style={{ margin: 0, fontSize: '1.1rem' }}>Help</h2>
          <button type="button" aria-label="Close help" onClick={onClose} style={{ padding: '0.15rem 0.5rem' }}>×</button>
        </div>

        <div style={{ flex: 1, display: 'flex', gap: '0.75rem', minHeight: 0 }}>
          <HelpContents entries={entries} currentId={currentId} onSelect={selectSection} />
          {/* A real tab stop (ADR-260031 keyboard floor / WCAG 2.1.1): the prose has no focusable
              children, so without `tabIndex` this scroller is not in the tab ring — and
              `use-modal-focus`'s Tab trap then guarantees a keyboard-only reader can never
              scroll past the fold, since every shipped surface section is taller than the body. */}
          <div
            tabIndex={0}
            role="region"
            aria-label="Help content"
            style={{ flex: 1, overflow: 'auto', paddingRight: '0.25rem' }}
          >
            {groupHelpEntries(entries).map(({ group, label, entries: groupEntries }) => {
              return (
                <div key={group}>
                  <h3 style={{ margin: '0.5rem 0 0.25rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: C_TEXT_SECONDARY }}>
                    {label}
                  </h3>
                  {groupEntries.map((entry) => (
                    <section key={entry.id} id={entry.id} aria-labelledby={`${entry.id}-heading`} style={{ marginBottom: '1rem' }}>
                      <h4 id={`${entry.id}-heading`} style={{ margin: '0 0 0.25rem', fontSize: '0.95rem' }}>{entry.title}</h4>
                      <p style={summaryStyle}>{entry.section.summary}</p>
                      <HelpBlocks blocks={entry.section.body} />
                    </section>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
