import { C_LABEL_PALETTE } from './tokens'

/**
 * Deterministic label → palette-slot hash (ADR-260063 / EPIC-260067): char-code sum mod 8.
 * Same label, same color, everywhere — chips today, node dots later (EPIC-260072). Color is
 * never the sole signal (REQ-CR-260011): the label text is always rendered alongside.
 */
export function labelColorIndex(label: string): number {
  let sum = 0
  for (let i = 0; i < label.length; i += 1) {
    sum += label.charCodeAt(i)
  }
  return sum % C_LABEL_PALETTE.length
}

/** The CSS custom-property reference (`var(--label-chip-N)`) for a label's palette slot. */
export function labelColorToken(label: string): string {
  return C_LABEL_PALETTE[labelColorIndex(label)]!
}
