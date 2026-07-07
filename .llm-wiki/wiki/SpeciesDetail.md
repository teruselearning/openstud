# Species Detail Page

The `SpeciesDetail.tsx` page provides a comprehensive view of a single species, accessible via the route `/species/:id`. It presents all relevant species information in a full-page layout, similar to the `IndividualDetail` page for individuals.

## Features

- **Hero Image:** Displays a prominent image of the species, accompanied by conservation status and type badges.
- **Description and Project Info:** Detailed description of the species and associated project information.
- **Biological Metrics:** Key biological data such as maturity, lifespan, weight, and breeding season.
- **Native Status Badge:** Indicates the native status of the species.
- **Presence Badge:** Shown when `isGenerallyPresent` is true, indicating the species' general presence.
- **External Links:** Provides links to external resources like Wikipedia and the IUCN Red List.
- **Individuals List:** A list of individuals belonging to the species, with links to their respective individual detail pages.
- **"Edit Profile" Button:** Navigates back to the species list and opens the edit modal for the current species.
