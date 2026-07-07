# Change Log

<!-- Append entries below. Format: ## [YYYY-MM-DD] type | title -->
## [2026-06-13] documentation | Translation system wiki page

Added `wiki/modules/translation-system.md` documenting the key-based i18n
architecture, the `t()` lookup function, `BASE_TRANSLATIONS`/`SEED_LANGUAGES`
sources, offline-first storage in IndexedDB, backend DB seeding, the
`update-lang-seeder.ts` sync script, and the AI translation workflow via Gemini.

## [2026-06-13] feature | Translation upgrade endpoint + Super Admin button

Added `POST /api/upgrade-translations` backend endpoint that merges missing
translation keys from the canonical `SEED_LANGUAGES` into the database without
overwriting existing user/modified translations. Added `upgradeTranslations()`
to syncService and a **"Upgrade Translations from Build"** button in the
Super Admin → Localisation tab that calls the endpoint and displays the result.

## [2026-06-13] feature | Translation checker agent

Created `.opencode/agents/translation-checker.md` — a subagent that scans
modified files for hardcoded frontend strings, adds missing keys to
`BASE_TRANSLATIONS` and `SEED_LANGUAGES` in `services/i18n.ts`, and runs
`update-lang-seeder.ts` to sync the backend seed file. Uses
`anthropic/claude-sonnet-4-5`. Added to `opencode.json` and documented the
invocation workflow in `opencode.md`.

## [2026-06-13] documentation | Password reset feature docs

Added `wiki/modules/password-reset.md` documenting the complete password reset
flow: two backend endpoints (`POST /api/forgot-password`, `POST /api/reset-password`
in `backend/src/index.ts:705-753`), two frontend views (`forgot_password` and
`reset_password` in `pages/Landing.tsx`), storage wrappers in `services/storage.ts`,
16 new i18n keys in `services/i18n.ts`, the email template fallback chain (custom
template → translated strings → inline fallback), the `password_reset` entry in
`EMAIL_TRANSLATION_KEYS`, and the existing `users.reset_code`/`users.reset_expires`
columns. Updated `index.md` with the new page link.

## [2026-06-14] documentation | AI Generation mechanism docs

Added `wiki/modules/ai-generation.md` documenting the original Gemini-only AI proxy
architecture, API key management, endpoints, models, and response parsing.

## [2026-06-14] feature | Dynamic AI provider system

Replaced the single-provider Gemini architecture with a multi-provider AI system:
- `getAiConfig(orgId)` merging global defaults from `app_config` with org-level overrides
- `callAiProvider()` routing to Google Gemini or OpenRouter
- 5 new DB columns on `organizations`
- 3 new endpoints: `/api/org/openrouter-key`, `/api/org/ai-config`, `/api/ai/test`
- Super Admin AI tab for global provider/model defaults
- Org Settings AI overrides with provider dropdowns, model inputs, and test buttons
- Per-request model override via optional `model` field
- `sanitizeOrgForClient()` strips both `gemini_api_key` and `openrouter_api_key`
- Updated `wiki/modules/ai-generation.md` with full new architecture.
