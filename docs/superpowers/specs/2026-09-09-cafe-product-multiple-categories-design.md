# Cafe Products in Multiple Categories

## Goal

Allow one cafe product to appear in multiple cafe categories. All selected categories are equal from the user's perspective, and selecting any of them in the POS must include the product.

## Current behavior

`cafe_products.category_id` stores one optional category. The product editor uses a single-select dropdown, list responses expose one `categoryId` and `categoryName`, and POS/list filtering compares against that single value.

## Data model

Add a `cafe_product_categories` join table with:

- `product_id`
- `category_id`
- `sort_order`, preserving the order selected in the editor
- a unique constraint on `(product_id, category_id)`
- indexes on both foreign keys
- cascading deletion when a cafe product is deleted
- restricted category deletion while the category is assigned to a cafe product

The migration copies every existing non-null `cafe_products.category_id` assignment into the join table. The existing `category_id` column remains as a compatibility mirror of the first selected category during this rollout, so older integrations and the linked inventory-product flow continue to behave safely. It is not presented as a primary category in the UI.

## API contract

Create and update accept `categoryIds: number[]`. The backend removes duplicates, validates that every category exists and is active, and replaces the product's category assignments transactionally.

Product list and detail responses expose:

- `categoryIds: number[]`
- `categories: Array<{ id: number; name: string }>`
- the existing `categoryId` and `categoryName` compatibility fields, derived from the first selected category

Filtering by `categoryId` matches the join relation, with a legacy fallback to `cafe_products.category_id` for safe deployment across partially migrated data.

## Product editor UX

Replace the single category select with a searchable multi-select popover that follows the existing RTL visual system:

- The trigger shows selected category names when space permits and a compact count for overflow.
- The popover contains a search field and a scrollable checklist.
- Each category row has a checkbox and the full category name.
- A clear action removes all selections.
- Empty search and no-category states have explicit Arabic copy.
- Keyboard focus, labels, and checked state remain accessible.

The review step and products table display all assigned categories. No category remains a valid state.

## POS behavior

Category filters in both cafe POS surfaces use the product's `categoryIds`. A product assigned to several categories appears under each selected category and appears only once in unfiltered results and the cart.

Any server-side cafe-product category filter uses the join relation, so other consumers receive the same behavior.

## Compatibility

- Existing products retain their current category through the data migration.
- Clients still reading `categoryId` and `categoryName` continue to work.
- The linked inventory product keeps a single mirrored category using the first selected cafe category; this does not give that category special POS behavior.
- Category deletion checks include the new join table.

## Validation and errors

- Duplicate IDs are normalized.
- Unknown, deleted, or inactive category IDs are rejected with a clear Arabic validation error.
- Assignment replacement and product mutation happen in one transaction.
- An empty array removes all cafe category assignments and clears the compatibility mirror.

## Testing

- Migration/backfill structure is validated.
- Backend tests cover create, update, deduplication, invalid categories, serialization, and filter-by-any-category.
- Frontend state tests cover search, toggling, clearing, and compact selected-label output.
- POS tests cover visibility in every assigned category without duplicate unfiltered products.
- Backend and frontend builds run after the focused tests.
