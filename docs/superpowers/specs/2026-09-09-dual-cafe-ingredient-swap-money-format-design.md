# Dual Cafe Ingredient Swap and Money Format Design

## Scope

Ship the same behavior in ONE80 and ONE MILLION. Add an ingredient-swap workspace inside **إدارة الخامات**, and standardize every user-visible monetary value to English digits with no `.00` for whole amounts and exactly two decimal places when piastres exist.

## Ingredient swap

The workspace lives as a top-level tab inside the existing raw-materials page so it keeps the inventory context and full-page width without adding sidebar noise. Both ingredient selectors use the shared searchable `Combobox`. Selecting distinct source and target ingredients loads every direct product and variant recipe that uses the source.

Each result identifies its product and optional variant, shows the current quantity/unit, permits an inline positive replacement quantity, and has an individual checkbox plus select-all. Rows where the target already exists in the same recipe are marked as conflicts and cannot be selected. Units must be compatible with the target ingredient's base unit. The sticky action bar reports the selected count and submits one atomic batch.

Backend endpoints:

- `GET /cafe-products/ingredient-swap/preview?sourceIngredientId=&targetIngredientId=`
- `POST /cafe-products/ingredient-swap`

The mutation revalidates every selected recipe in one transaction, updates only current recipe definitions, preserves sales and stock history, and writes one `business_audit_log` record. Existing `club.cafe.products:view` and `club.cafe.products:update` permissions guard preview and apply respectively.

## Money display

The canonical output uses English digits and `EGP` in both Arabic and English UI:

- `20` → `20 EGP`
- `20.5` → `20.50 EGP`
- `20.25` → `20.25 EGP`
- `1250` → `1,250 EGP`

Input values and calculation precision do not change. Shared formatters own display normalization; cafe/POS local money helpers and printable receipts must call the same number formatter so screen and paper agree.

## Safety and verification

No schema migration is required. Apply is atomic and rejects stale, missing, duplicate-target, invalid-quantity, and unit-incompatible rows. Tests cover preview mapping, conflict detection, atomic updates, audit creation, formatter examples, searchable UI source contracts, and receipt output. Both frontend and backend builds must pass before ZIP packaging.
