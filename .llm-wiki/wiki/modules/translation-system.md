# Translation System

## Overview

The app uses a **key-based, static translation dictionary** approach. There is no external i18n library (`react-i18next`, `FormatJS`, etc.). Instead, all translations are defined in a single TypeScript file (`services/i18n.ts`) and consumed via a React Context (`LanguageContext`) that provides a `t(key)` function.

## Source of Truth: `services/i18n.ts`

This file defines two exports:

### `BASE_TRANSLATIONS`

A flat `Record<string, string>` mapping every translation key to its **English (default)** value:

```ts
export const BASE_TRANSLATIONS = {
    dashboard: "Dashboard",
    species: "Species",
    // ... ~420 keys
};
```

A `TranslationKey` type is derived: `type TranslationKey = keyof typeof BASE_TRANSLATIONS`.

### `SEED_LANGUAGES`

An array of `LanguageConfig` objects — one per supported language. Each entry has:

| Field | Type | Description |
|-------|------|-------------|
| `code` | `string` | Locale code (e.g. `"en-GB"`, `"id"`, `"ms"`, `"pt"`, `"es"`, `"fr"`) |
| `name` | `string` | Human-readable name (e.g. `"Bahasa Indonesia"`) |
| `isDefault` | `boolean` | Whether this is the fallback language |
| `translations` | `Record<string, string>` | The translated strings for this language |

Each language spreads `BASE_TRANSLATIONS` and overrides only the keys that differ from the English default. For example, `en-GB` overrides `organization` → `"Organisation"`, while `id` overrides most keys with Indonesian translations.

### Currently supported languages

| Code | Name | Default |
|------|------|---------|
| `en-GB` | English (UK) | ✅ |
| `en-US` | English (US) | |
| `id` | Bahasa Indonesia | |
| `ms` | Bahasa Melayu | |
| `pt` | Português | |
| `es` | Español | |
| `fr` | Français | |

## How the Frontend Consumes Translations

### `LanguageContext` (defined in `App.tsx:117`)

```ts
interface LanguageContextType {
  language: string;           // current language code
  setLanguage: (lang: string) => void;
  t: (key: TranslationKey) => string;  // the lookup function
  refreshTranslations: () => void;
  availableLanguages: LanguageConfig[];
}
```

### The `t()` function (`App.tsx:297`)

```ts
const t = (key: TranslationKey): string => {
    const activeLang = languages.find(l => l.code === currentLangCode);
    if (activeLang && activeLang.translations && activeLang.translations[key]) {
        return activeLang.translations[key];
    }
    return BASE_TRANSLATIONS[key] || key;
};
```

Lookup order:
1. The currently selected language's `translations` map
2. `BASE_TRANSLATIONS` (English fallback)
3. The raw key string as last resort

### Usage in Components

Components access translations via `useContext(LanguageContext)`:

```tsx
const { t } = useContext(LanguageContext);
return <span>{t('dashboard')}</span>;
```

The entire app is wrapped in `<LanguageContext.Provider>` inside `App.tsx`.

### Language Selector

A `<select>` in the Sidebar (`App.tsx:198`) lets users switch languages. The selected language is persisted in the user's `Session.preferredLanguage`.

## How Translations are Stored & Loaded

### Offline-First Architecture

The app uses an **offline-first** pattern with IndexedDB (via `services/localDb.ts`) and localStorage:

1. **On first load**: If no languages exist in IndexedDB, `SEED_LANGUAGES` from `i18n.ts` is written to IndexedDB (`services/storage.ts:58-63`).
2. **On sync**: The backend's language data (from the `languages` table) is fetched and merged into IndexedDB, potentially overriding the seed values.
3. **At runtime**: `getLanguages()` reads from the in-memory cache (`languagesCache`) which is hydrated from IndexedDB at startup.

### Backend Storage

The backend stores languages in a MySQL/MariaDB table:

```sql
CREATE TABLE languages (
    code VARCHAR(10) PRIMARY KEY,
    name VARCHAR(255),
    translations JSON,
    is_default TINYINT(1) DEFAULT 0,
    manual_overrides JSON,
    is_deleted TINYINT(1) DEFAULT 0
);
```

### Backend Seeding

On initial setup (`backend/src/index.ts:157-175`), the `seedDatabase` function inserts all languages from `backend/src/seed-languages.json` into the `languages` table. This JSON file is a duplicate of the `SEED_LANGUAGES` data, kept in sync by the `update-lang-seeder.ts` script.

## Adding a New Language

Through the **Super Admin → Localisation** tab (`pages/SuperAdmin.tsx:273`):

1. Enter a language code and name
2. A new `LanguageConfig` is created with `BASE_TRANSLATIONS` as the initial translations (all English)
3. An **"AI Localisation"** button calls `translateDictionary` from `services/geminiService.ts`, which uses the Gemini API to translate every key in `BASE_TRANSLATIONS` into the target language

## Adding New Translation Keys

When a new feature adds user-visible strings:

1. **Add the key** to the `BASE_TRANSLATIONS` object in `services/i18n.ts` with its English (default) value
2. **Add overrides** in each `SEED_LANGUAGES` entry where the translation differs from English (for `en-GB`/`en-US` variants, this means the spelling localisations; for non-English languages, the translated value)
3. **Update `backend/src/seed-languages.json`** by running `npx tsx update-lang-seeder.ts` — this script reads `SEED_LANGUAGES` from the TypeScript source and rewrites the JSON INSERT statements in `backend/src/index.ts`
4. **Rebuild and redeploy** so the backend's `seed-languages.json` and the frontend's `i18n.ts` are both current
5. **Run the upgrade process** (see below) to merge new keys into the database without overwriting existing translations

### Manual update-lang-seeder.ts workflow

```bash
npx tsx update-lang-seeder.ts
```

This script:
- Reads `SEED_LANGUAGES` from `services/i18n.ts`
- Finds the INSERT lines for each non-English language in `backend/src/index.ts`
- Replaces them with up-to-date JSON containing all translations
- Handles both replacement and fallback appending of missing languages

## Translation Upgrade Process

After deploying a new build with additional translation keys, the database must be updated with those new keys. An on-demand admin endpoint handles this.

### Mechanism

1. A **Super Admin** navigates to **Super Admin → Localisation** and clicks **"Upgrade Translations from Build"**
2. The frontend sends the canonical `SEED_LANGUAGES` array (from `services/i18n.ts`) to `POST /api/upgrade-translations`
3. The backend compares each language's stored translations with the canonical seed:
   - **Keys present in the DB** are left unchanged (preserving any user modifications or manually entered translations)
   - **Keys missing from the DB** are inserted with the seed's value

### Merging Rules

| Scenario | Behaviour |
|----------|-----------|
| Key exists in DB but value differs from seed | **Kept** — DB value is preserved |
| Key exists in DB with same value | **Kept** — no change |
| Key missing from DB | **Added** — seed value is inserted |
| Language not in DB at all | **Created** — entire seed is inserted |

This guarantees that user-generated content, custom translations, and manual edits are **never overwritten or deleted**.

### API Endpoint

`POST /api/upgrade-translations` (authenticated, Super Admin only)

Request body:
```json
{ "seedLanguages": [ { "code": "id", "name": "Bahasa Indonesia", "translations": { ... }, ... } ] }
```

Response:
```json
{ "success": true, "summary": [ { "code": "id", "name": "Bahasa Indonesia", "addedKeys": ["newKey1", "newKey2"] } ] }
```

### Key Files

| File | Purpose |
|------|---------|
| `backend/src/index.ts` | `POST /api/upgrade-translations` endpoint |
| `services/syncService.ts` | `upgradeTranslations()` API client function |
| `services/storage.ts` | Re-exports `upgradeTranslations` |
| `pages/SuperAdmin.tsx` | Button + result display in Localisation tab |

## AI-Powered Translation

The `translateDictionary` function (`services/geminiService.ts`) sends the entire `BASE_TRANSLATIONS` dictionary to the Gemini API with a prompt to translate all values into a target language. It returns `{k: string, v: string}[]` which is then merged into the language's translations.

This is available in the **Super Admin → Localisation** UI, and also for landing page content translations.

## Key Files

| File | Purpose |
|------|---------|
| `services/i18n.ts` | Source of truth — `BASE_TRANSLATIONS` and `SEED_LANGUAGES` |
| `backend/src/seed-languages.json` | Backend seed data (generated/manually kept in sync) |
| `update-lang-seeder.ts` | Script to sync `seed-languages.json` with `i18n.ts` |
| `services/storage.ts` | Offline storage, language load/save/sync logic |
| `services/geminiService.ts` | AI translation via Gemini API |
| `pages/SuperAdmin.tsx` | Admin UI for managing languages and upgrade button |
| `App.tsx` | `LanguageContext` definition, `t()` function, language selector |
| `services/syncService.ts` | `upgradeTranslations()` API client |
| `backend/src/index.ts` | `POST /api/upgrade-translations` endpoint |