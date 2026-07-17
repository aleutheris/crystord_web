/* JS references to brand CSS custom properties defined in tokens.css */

export const C_PRIMARY = 'var(--color-primary)'
export const C_PRIMARY_DARK = 'var(--color-primary-dark)'
export const C_CONTROL = 'var(--color-control)'
export const C_CONTROL_DARK = 'var(--color-control-dark)'
export const C_ACCENT = 'var(--color-accent)'

export const C_BG = 'var(--color-bg)'
export const C_SURFACE = 'var(--color-surface)'
export const C_SURFACE_ALT = 'var(--color-surface-alt)'

export const C_TEXT = 'var(--color-text)'
export const C_TEXT_SECONDARY = 'var(--color-text-secondary)'
export const C_TEXT_MUTED = 'var(--color-text-muted)'

export const C_BORDER = 'var(--color-border)'
export const C_BORDER_SUBTLE = 'var(--color-border-subtle)'

export const C_SUCCESS = 'var(--color-success)'
export const C_WARNING = 'var(--color-warning)'
export const C_ERROR = 'var(--color-error)'

export const C_SELECTION_BG = 'var(--color-selection-bg)'

export const C_CARD_BG = 'var(--color-card-bg)'
export const C_CARD_SHADOW = 'var(--color-card-shadow)'

export const C_OVERLAY = 'var(--color-overlay)'

export const C_TOAST_BG = 'var(--color-toast-bg)'
export const C_TOAST_TEXT = 'var(--color-toast-text)'
export const C_TOAST_ACTION = 'var(--color-toast-action)'

export const C_CONNECTION_LINE = 'var(--color-connection-line)'

/**
 * Deterministic label-chip palette (ADR-260063 / EPIC-260067). 8 desaturated, brand-adjacent
 * hues with light/dark variants in tokens.css; indexed via `labelColorIndex` in
 * `label-colors.ts` so the same label gets the same color everywhere (node dots reuse it).
 */
export const C_LABEL_PALETTE: readonly string[] = [
  'var(--label-chip-1)',
  'var(--label-chip-2)',
  'var(--label-chip-3)',
  'var(--label-chip-4)',
  'var(--label-chip-5)',
  'var(--label-chip-6)',
  'var(--label-chip-7)',
  'var(--label-chip-8)',
]

export const C_CHIP_BG = 'var(--color-chip-bg)'
export const C_CHIP_BORDER = 'var(--color-chip-border)'
export const C_CHIP_TEXT = 'var(--color-chip-text)'
export const C_CHIP_INACTIVE_BG = 'var(--color-chip-inactive-bg)'
export const C_CHIP_INACTIVE_BORDER = 'var(--color-chip-inactive-border)'
export const C_CHIP_INACTIVE_TEXT = 'var(--color-chip-inactive-text)'
