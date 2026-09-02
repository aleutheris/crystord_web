import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HelpBlocks } from './HelpBlocks'

/**
 * The three block kinds have to reach the reader as three different things — a step list that
 * renders unordered stops reading as a sequence. `HelpPanel`'s own fixtures use paragraphs only,
 * so without this the list and steps branches ship unexercised.
 */
describe('HelpBlocks', () => {
  it('renders each block kind as its own element, in authored order', () => {
    const { container } = render(
      <HelpBlocks
        blocks={[
          { kind: 'paragraph', text: 'A paragraph.' },
          { kind: 'steps', items: ['First', 'Second'] },
          { kind: 'list', items: ['One', 'Two'] },
        ]}
      />,
    )
    expect([...container.children].map((el) => el.tagName)).toEqual(['P', 'OL', 'UL'])
    expect(screen.getByText('A paragraph.')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['First', 'Second', 'One', 'Two'])
  })
})
