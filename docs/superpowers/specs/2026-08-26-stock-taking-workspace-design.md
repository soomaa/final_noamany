# Stock-Taking Workspace Design

## Goal

Replace the cramped stock-taking session dialog with a responsive, searchable workspace that lets staff count inventory in the product's configured units and packages, review variances, and correct mistakes before finalizing.

## Approved Flow

1. Creating a session opens the session workspace immediately.
2. The workspace shows a searchable catalog of inventory products with filters for raw materials, ready products, prepared products, packaging, and all products.
3. Product cards show name, code, current system quantity, base unit, and cost.
4. Selecting a product opens a touch-friendly count panel.
5. The count panel supports compatible measurement units and configured package sizes. Package count plus an optional loose remainder is converted to the product's base stock unit before saving.
6. The live preview shows system quantity, physical quantity, variance status, and estimated variance value.
7. A reason is required only for shortage or surplus.
8. Counted items appear in a session review area and can be edited or deleted while the session is a draft.
9. Final review summarizes shortage, surplus, matched items, and estimated values before sending the session for approval.

## Responsive Behavior

- Mobile uses a single-column catalog/review flow with 44px minimum touch targets and a full-width count sheet.
- Desktop uses a catalog and session-review split layout.
- No core action depends on hover, and no wide data table is required to complete a count on mobile.

## Data Safety

- Existing stock-taking tables remain unchanged.
- Counted package/remainder values are converted to the existing base `counted_quantity` field.
- Editing and deleting are allowed only while the session status is `draft`.
- Final approval continues to apply only the stored variance delta, preserving inventory movements recorded after the count.

