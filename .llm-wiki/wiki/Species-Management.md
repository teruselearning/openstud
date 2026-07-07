# Species Management

This document outlines the species management module, including the new "Presence" feature.

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
