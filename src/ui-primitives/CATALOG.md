# UI Primitives Catalog

Shared template library for Crystord App. All reusable UI primitives live here so feature modules can build against stable contracts rather than duplicating patterns.

## Purpose

This directory provides:
- **Prop contracts** (TypeScript interfaces) for every template category
- **Barrel exports** so any feature can import cleanly via `@ui/<category>`
- A named home for future template implementations when a primitive is built

Nothing in this directory imports from a feature module. Feature modules may freely import from here.

## Categories

| Category | Contract file | What goes here |
|---|---|---|
| `buttons/` | `button.types.ts` | Primary, Secondary, Danger, Ghost, Icon button variants |
| `inputs/` | `input.types.ts` | Text, Password, Search input variants |
| `selection/` | `selection.types.ts` | RadioButton, Checkbox, Select dropdown |
| `feedback/` | `feedback.types.ts` | Dialog, Toast, Spinner |
| `layout/` | `layout.types.ts` | Card, Panel |
| `typography/` | `typography.types.ts` | Heading (h1–h6), Label, BodyText |
| `widgets/` | `widgets.types.ts` | FilterBuilder, CategoryTree, LabelChipEditor — shared filtering & taxonomy widgets (EPIC-260066 T8) |

## How to Add a Template

1. **Define or extend the contract** — add or update props in the category `*.types.ts` file. Keep all color/spacing references tied to tokens from `@styles/tokens`.
2. **Create the component file** — `PascalCaseName.tsx` inside the category folder. The component must accept the typed props interface from the contract file.
3. **Export from the category barrel** — add a named export to the category `index.ts`.
4. **The master `index.ts` already re-exports all categories** — no change needed there.

## Naming Conventions

- Component files: `PrimaryButton.tsx`, `TextInput.tsx` (PascalCase)
- Type files: `button.types.ts` (kebab-case, `.types.ts` suffix)
- Barrel files: `index.ts` (always)

## Branding Constraint

Every template **must** reference brand tokens from `@styles/tokens` for color and semantic styling. Hard-coded hex values are not allowed (enforced by the ESLint hex-color guard from ADR-260047).

## Dependency Rule

`ui-primitives` → `styles` only.
Feature modules → `ui-primitives` allowed.
`ui-primitives` → feature modules: **never**.
