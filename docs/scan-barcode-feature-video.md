# Scan Barcode Feature Video Representation

This is a shot-by-shot demo script representing the feature behavior before commit.

## Scene 1 - Open Add Item

- Show `Add item` screen.
- Focus on new button: **Scan barcode to auto-fill** under Name.

## Scene 2 - Launch Scanner

- Tap scan button.
- Full-screen scanner opens with framing box, hint text, and controls.
- Show top controls: **Flashlight on/off** and **Cancel**.

## Scene 3 - Permission Path

- If permission not granted, show `Allow camera` prompt.
- Tap `Allow camera` to proceed.

## Scene 4 - Barcode Scan

- Point camera at barcode.
- App captures code and performs lookup against Open Food Facts.
- Brief loading spinner appears.

## Scene 5 - In-Scanner Result Card

- Stay on scanner screen after lookup.
- Show result card with:
  - Product name (or "Product not found")
  - Barcode value
  - Parsed quantity/unit (if available)
  - Additional notes (brand or fallback reason)
- Show actions:
  - **Use this result** (accept and return to add item)
  - **Scan again** (clear current result and resume scanning)
  - **Retry lookup** (visible when product metadata is missing)

## Scene 6 - Autofill Results in Add Item

- Tap **Use this result**.
- Return to Add Item screen.
- Fields auto-populate:
  - `Name` from product name (if found)
  - `Quantity` and `Unit` when parseable
  - `Notes` with brand info (if available)
  - `Notes` includes `Barcode: <code>`

## Scene 7 - User Edits + Save

- User can adjust any fields manually.
- Tap `Save` as normal.

## Edge Cases Captured

- No product found: result card appears with fallback text and **Retry lookup**.
- Lookup unavailable: same graceful fallback.
- Invalid code format: no crash; fallback note.