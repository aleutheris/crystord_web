import type { CSSProperties } from 'react'
import type { HelpBlock } from '../../help'
import { C_TEXT } from '../../styles/tokens'

const paragraphStyle: CSSProperties = {
  margin: '0 0 0.6rem',
  fontSize: '0.85rem',
  lineHeight: 1.55,
  color: C_TEXT,
}

const listStyle: CSSProperties = {
  margin: '0 0 0.6rem',
  paddingLeft: '1.1rem',
  fontSize: '0.85rem',
  lineHeight: 1.55,
  color: C_TEXT,
}

/**
 * Renders one help section's body (ADR-260085 / EPIC-260080 T3). Presentational only — the
 * three block kinds in `HelpBlock` map to a paragraph, an unordered list and an ordered list.
 */
export function HelpBlocks({ blocks }: { blocks: readonly HelpBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        if (block.kind === 'paragraph') {
          return <p key={index} style={paragraphStyle}>{block.text}</p>
        }
        const items = block.items.map((item, i) => <li key={i}>{item}</li>)
        return block.kind === 'steps'
          ? <ol key={index} style={listStyle}>{items}</ol>
          : <ul key={index} style={listStyle}>{items}</ul>
      })}
    </>
  )
}
