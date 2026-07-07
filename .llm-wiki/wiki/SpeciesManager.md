# Species Manager

The `SpeciesManager.tsx` component manages the display and interaction with species cards.

## Changes

- **Species Card Clickability:** The entire species card is now clickable. Clicking anywhere on the card (excluding the edit and delete buttons) navigates the user to the `/species/:id` route, displaying the detailed species page.
- **Button Event Propagation:** The edit and delete buttons within the species card now utilize `e.stopPropagation()` to prevent the click event from propagating to the card's navigation handler, ensuring that clicking these buttons only triggers their intended actions.
- **"Generally Present" Badge Relocation:** The "Generally present" badge has been moved from the card body to the bottom section of the species card. It is now displayed in the same position as the "View X individuals" or "No individuals yet" section. If a species has no associated individuals but `isGenerallyPresent` is true, a teal "Generally present" badge will be displayed instead of "No individuals yet".
