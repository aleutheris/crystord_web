import type { CSSProperties } from 'react'
import { groupHelpEntries, type HelpEntry } from './help-model'
import { C_BORDER, C_PRIMARY, C_TEXT_SECONDARY } from '../../styles/tokens'

const groupHeadingStyle: CSSProperties = {
  margin: '0.75rem 0 0.25rem',
  fontSize: '0.7rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: C_TEXT_SECONDARY,
}

const listStyle: CSSProperties = { listStyle: 'none', margin: 0, padding: 0 }

function linkStyle(current: boolean): CSSProperties {
  return {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '0.2rem 0.35rem',
    border: 'none',
    borderLeft: current ? `2px solid ${C_PRIMARY}` : '2px solid transparent',
    background: 'transparent',
    color: current ? C_PRIMARY : 'inherit',
    fontWeight: current ? 600 : 400,
    fontFamily: 'inherit',
    fontSize: '0.8rem',
    cursor: 'pointer',
  }
}

/**
 * The help panel's table of contents (ADR-260085 / EPIC-260080 T3 / bullet 7): anchors only,
 * no search. Entry titles come from `HelpEntry.title`, which for a surface is its registry
 * `label` — so this list renames itself when a surface is renamed.
 */
export function HelpContents({ entries, currentId, onSelect }: {
  entries: readonly HelpEntry[]
  currentId: string
  onSelect: (id: string) => void
}) {
  return (
    <nav
      aria-label="Help contents"
      style={{ flexShrink: 0, width: '11rem', overflow: 'auto', borderRight: `1px solid ${C_BORDER}`, paddingRight: '0.5rem' }}
    >
      {groupHelpEntries(entries).map(({ group, label, entries: groupEntries }) => {
        return (
          <div key={group}>
            <h3 style={groupHeadingStyle}>{label}</h3>
            <ul style={listStyle}>
              {groupEntries.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    aria-current={entry.id === currentId ? 'true' : undefined}
                    onClick={() => onSelect(entry.id)}
                    style={linkStyle(entry.id === currentId)}
                  >
                    {entry.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}
