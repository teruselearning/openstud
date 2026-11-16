# Species Management

This document outlines the species management module, including the "Presence" and "Local Name" features.

## Presence Feature

The "Presence" feature allows users to mark a species as "Generally present" at the species level. This moves the tracking of presence from individual records to a species-level attribute.

### Implementation Details:

*   **Frontend (`pages/SpeciesManager.tsx`):**
    *   A checkbox toggle has been added to the species creation/edit form under a "Presence" section, enabling users to mark a species as "Generally present."
    *   A teal-colored "Generally present" badge is displayed on the species card when `isGenerallyPresent` is true.

*   **Shared Types (`types.ts`):**
    *   The `Species` interface now includes an optional boolean field: `isGenerallyPresent?: boolean`. This field defaults to `false`/`null`.

*   **Data Synchronization (`src/services/syncService.ts`):**
    *   The `fromDbSpecies` function now reads the `is_generally_present` column from the database and maps it to the `isGenerallyPresent` field.
    *   The `mapSpeciesToDb` function writes `1` to the `is_generally_present` column if `isGenerallyPresent` is `true`, and `NULL` otherwise.

*   **Backend (`backend/src/index.ts`):**
    *   A new column, `is_generally_present TINYINT(1) DEFAULT NULL`, has been added to the database via a migration.
    *   This column is included in both super-admin and organization-scoped sync SELECT queries.

### Database Representation:

The `is_generally_present` column in the database stores:
*   `1` for `true` (generally present)
*   `NULL` for `false` (not generally present)

The TypeScript `isGenerallyPresent` boolean field handles the conversion to and from this database representation.

## Local Name Feature

The "Local Name" feature allows users to associate a species with its common name in a local or regional language, displayed alongside the English common name on species cards and detail pages.

### Data Flow

*   **TypeScript Interface (`types.ts`):** The `Species` interface includes an optional field `localName?: string` (line ~254).
*   **Database (`backend/src/index.ts`):** A migration adds `local_name VARCHAR(255) NULL` to the `species` table (line ~193). The column is nullable since the field is optional.
*   **AI Autofill (`backend/src/index.ts`):** The AI prompt (line ~489) instructs the model to populate `localName` with the common name in the local/regional language if it differs from the English common name, or set it to `null` otherwise.
*   **Sync Service (`services/syncService.ts`):**
    *   `fromDbSpecies` maps `local_name => localName`, converting `null` to `undefined` (line ~107).
    *   `mapSpeciesToDb` maps `localName => local_name`, converting `undefined`/empty to `null` (line ~268).
*   **Validation Schema (`backend/src/index.ts`):** `localName` is defined in `speciesSchema` as `{ type: Type.STRING }` (optional, line ~117).

### Frontend Details (`pages/SpeciesManager.tsx`)

*   **Add/Edit Form:** The species modal includes an input field labeled with the translation key `localName` and a placeholder "e.g. 当地名称". Stored in `formData.localName` and initially blank (`''`).
*   **Species Card:** When `species.localName` is truthy, it is displayed below the scientific name in subdued text (`text-xs text-slate-400`).
*   **Search:** The species list search filter checks `sp.localName` alongside `commonName` and `scientificName` (all lowercased).

### Individual Search (`pages/IndividualManager.tsx`)

Individual search now also matches against the species' local name. When filtering individuals, the code builds a species lookup map and checks `sp?.localName` alongside `commonName` and `scientificName` (line ~541). This enables users to find individuals by typing the species' local name.

### Super Admin Browser (`pages/SuperAdmin.tsx`)

The super-admin species browser:
*   Shows `sp.localName` when present as a truncated line on each species row (line ~558).
*   Includes `s.localName` in the search query filter (line ~407), allowing admins to search species by local name.

### Internationalization (`services/i18n.ts`)

A new translation key was added:
```typescript
localName: "Local Name"
```
(line ~114) providing a display label for the field across the UI.
