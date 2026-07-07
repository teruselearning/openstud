
## 2026-06-16

- **Species Detail Page:** Created `pages/SpeciesDetail.tsx` at route `/species/:id` to display full species information, including hero image, description, biological metrics, native status, presence badge, external links, and individuals list. An "Edit Profile" button navigates to the species list with the edit modal open.
- **Species Card Clickability:** The species card in `SpeciesManager.tsx` is now clickable, navigating to `/species/:id`. Edit and delete buttons use `e.stopPropagation()` to prevent navigation.
- **"Generally Present" Badge Relocation:** The "Generally present" badge has been moved to the bottom of the species card in `SpeciesManager.tsx`. It now displays a teal "Generally present" badge when a species has no individuals but is generally present, replacing "No individuals yet".
