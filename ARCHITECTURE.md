# VereinO Architecture & Refactor Plan (v1.32)

This document outlines the target architecture for the renderer (Electron + React + TypeScript) and the incremental refactor plan started in 1.31 and continued in 1.32.

## Goals

- Make `App.tsx` a thin shell (layout + providers + routing) instead of an all-in-one file.
- Extract views, components, hooks, and context providers into dedicated folders.
- Improve reusability and testability of tiles, modals, and data loading logic.
- Keep behavior and UI identical while moving code; no breaking changes.

## Target Structure

- `src/renderer/`
  - `App.tsx` (thin): layout, navigation, global modals mount point
  - `views/`
    - `Dashboard/`
    - `Buchungen/` (later extraction of table + modals)
    - `Budgets/`
    - `Zweckbindungen/`
    - `Reports/` (Summary, charts, tabs)
    - `Receipts/`
    - `Invoices/` → `InvoicesView.tsx`
    - `Members/` → `MembersView.tsx`
  - `components/`
    - `tiles/` → `BudgetTiles.tsx`, `EarmarkUsageCards.tsx`
    - `modals/` → `BindingModal.tsx`, `BudgetModal.tsx`, `QuickAddModal.tsx`, `SmartRestoreModal.tsx`, `SetupWizardModal.tsx`
    - `common/` → shared UI elements
  - `hooks/` → `useBindings.ts`, `useBudgets.ts`, `useTags.ts`, `useReports.ts`, `useEarmarks.ts`
  - `contexts/` → `SettingsContext.tsx`, `FiltersContext.tsx`, `NotifyContext.tsx`
  - `lib/` → utilities (formatting, color, dates)
  - `index.css` and style tokens

## Incremental Steps (sprints)

1. Tiles extraction
   - DONE: Components created under `components/tiles/`.
   - TODO: Ensure imports in `App.tsx` use extracted tiles and remove inline duplicates.

2. Modal extraction
   - Move `BindingModal` and `BudgetModal` to `components/modals/`.
   - Extract `QuickAddModal` similarly.

3. Views extraction
   - Move `MembersView` to `views/Members/MembersView.tsx` and import in `App.tsx`.
   - Move `InvoicesView` to `views/Invoices/InvoicesView.tsx` and import.
   - Group Reports subcomponents into `views/Reports/`.

4. Hooks and contexts
   - Create data hooks (`useBindings`, `useBudgets`, `useTags`, `useReports`) to replace inline loaders.
   - Introduce `SettingsContext` and `FiltersContext` to reduce prop drilling in `App.tsx` and children.

5. Cleanup
   - Update imports to use barrels (`components/tiles/index.ts`, `components/modals/index.ts`, `views/**/index.ts`).
   - Remove residual inline helpers that move to `lib/` (e.g., `contrastText`).
   - Address inline styles gradually by introducing CSS modules or utility classes.

## Contracts (selected)

- BudgetTiles
  - in: `budgets: Budget[]`, `eurFmt: Intl.NumberFormat`, `onEdit(budget)`
  - out: renders grid of tiles, emits `onEdit` when Edit clicked; dispatches `apply-budget-jump` for drill-down

- EarmarkUsageCards
  - in: `bindings: Earmark[]`, `from`, `to`, `sphere`, `onEdit(binding)`
  - out: renders cards with progress, actions; dispatches `apply-earmark-filter`

## Edge Cases to watch

- Optional fields from IPC: start/end dates and counts may be undefined → components handle gracefully.
- Filters and jump events must keep behavior identical after extraction.
- Modal stacking and overlay click handling remain consistent.

## Verification

- After each extraction, run dev build, click through: Buchungen filters, Budgets tiles, Zweckbindungen tiles, Members, Invoices.
- Ensure packaging (electron-builder) still succeeds.

## Versioning

- 1.31: Features + initial tiles components added.
- 1.32: Packaging with version bump; start wiring external tiles; begin extracting Members/Invoices and modals.
