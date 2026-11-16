
## 2026-07-28 change | Added `localName` field to Species entity

Added an optional `localName` field across the full stack:

- **`types.ts`** — added `localName?: string` to the `Species` interface
- **`backend/src/index.ts`** — migration adds `local_name VARCHAR(255) NULL` column; `speciesSchema` includes `localName: Type.STRING`; AI prompt asks for localName (local/regional name if different from English)
- **`services/syncService.ts`** — `fromDbSpecies` maps `local_name => localName`, `mapSpeciesToDb` maps `localName => local_name`
- **`pages/SpeciesManager.tsx`** — localName input field in add/edit form, displayed on species card, included in search filter
- **`pages/IndividualManager.tsx`** — individual search matches species localName via species lookup map
- **`pages/SuperAdmin.tsx`** — species browser shows localName and searches by it
- **`services/i18n.ts`** — added `localName: "Local Name"` translation key

The field is optional, user-editable, AI-populated on autofill, and searchable in both species and individual lists.

## 2026-06-16

- **Species Detail Page:** Created `pages/SpeciesDetail.tsx` at route `/species/:id` to display full species information, including hero image, description, biological metrics, native status, presence badge, external links, and individuals list. An "Edit Profile" button navigates to the species list with the edit modal open.
- **Species Card Clickability:** The species card in `SpeciesManager.tsx` is now clickable, navigating to `/species/:id`. Edit and delete buttons use `e.stopPropagation()` to prevent navigation.
- **"Generally Present" Badge Relocation:** The "Generally present" badge has been moved to the bottom of the species card in `SpeciesManager.tsx`. It now displays a teal "Generally present" badge when a species has no individuals but is generally present, replacing "No individuals yet".
