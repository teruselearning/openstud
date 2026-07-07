# AI Generation Mechanism — Full Architecture

## Overview
The app uses AI models for four features: species data autofill, scientific illustration generation, interface translation, and reverse geocoding. All AI calls are proxied through the backend to keep API keys secure — the client never touches a raw API key.

The system supports two AI providers:
- **Google Gemini**: via `@google/genai` SDK with structured JSON schema support
- **OpenRouter**: OpenAI-compatible `/chat/completions` API with Bearer token auth

Each org can independently configure which provider to use for text (research) vs image generation, and override the model on a per-request basis.

## Provider Abstraction — `getAiConfig(orgId)`

**Backend** (`backend/src/index.ts:278-312`):

The function `getAiConfig(orgId)` merges global defaults from `app_config` with org-level overrides from `organizations`:

1. Start with `DEFAULT_AI_CONFIG`:
   - `providerText`: `'google'`
   - `providerImage`: `'google'`
   - `researchModel`: `'gemini-3-flash-preview'`
   - `imageModel`: `'gemini-2.5-flash-image'`
   - `googleApiKey`: `process.env.API_KEY`
   - `openrouterApiKey`: `''`
   - `openrouterBaseUrl`: `'https://openrouter.ai/api/v1'`
2. Overlay global settings from `app_config` (row `id = 'global-settings'`):
   - `aiResearchModel`, `aiImageModel`, `aiProviderText`, `aiProviderImage`, `openrouterApiKey`, `openrouterBaseUrl`, `geminiApiKey`
3. Overlay org-specific overrides from `organizations` table:
   - `gemini_api_key`, `openrouter_api_key`, `ai_provider_text`, `ai_provider_image`, `ai_research_model`, `ai_image_model`

Returns an `AiConfig` object with: `providerText`, `providerImage`, `researchModel`, `imageModel`, `googleApiKey`, `openrouterApiKey`, `openrouterBaseUrl`.

## New DB Columns

Columns added to the `organizations` table (migrations at `backend/src/index.ts:148-152`):

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `openrouter_api_key` | `TEXT NULL` | — | Per-org OpenRouter API key |
| `ai_provider_text` | `VARCHAR(50)` | `'google'` | Provider for text/research: `'google'` or `'openrouter'` |
| `ai_provider_image` | `VARCHAR(50)` | `'google'` | Provider for image generation |
| `ai_research_model` | `VARCHAR(255) NULL` | — | Override research model (e.g. `'gpt-4o'`) |
| `ai_image_model` | `VARCHAR(255) NULL` | — | Override image model (e.g. `'dall-e-3'`) |

## Routing Logic — `callAiProvider()`

**Backend** (`backend/src/index.ts:378-437`):

The unified function `callAiProvider(config, purpose, prompt, jsonMode)` routes requests:

### OpenRouter path
- Uses `POST {openrouterBaseUrl}/chat/completions` with `Authorization: Bearer {openrouterApiKey}`
- OpenAI-compatible body: `{ model, messages: [{ role: 'user', content: prompt }] }`
- If `jsonMode` is true (text purpose), sets `response_format: { type: 'json_object' }`
- Image purpose unsets `response_format` (image models may not support JSON mode)
- Parses `data.choices[0].message.content`

### Google Gemini path (default)
- Uses `@google/genai` SDK instantiated with `apiKey`
- Image generation: `ai.models.generateContent()` with `inlineData` extraction — returns `IMAGE_BASE64:{base64data}`
- Text generation: same API with `responseMimeType: "application/json"` and `responseSchema` (species or translation schema)

## New Endpoints

### `POST /api/org/openrouter-key` (`index.ts:339-353`)
- **Auth**: Admin / Super Admin
- **Input**: `{ key }` (empty string = clear)
- **Action**: Saves or clears `organizations.openrouter_api_key` for the user's org
- **Response**: `{ success: true, has_openrouter_key: boolean }`

### `POST /api/org/ai-config` (`index.ts:356-372`)
- **Auth**: Admin / Super Admin
- **Input**: `{ providerText, providerImage, researchModel, imageModel }` (null = clear override)
- **Action**: Updates org-level provider/model overrides in `organizations`
- **Response**: `{ success: true }`

### `POST /api/ai/test` (`index.ts:498-524`)
- **Auth**: Required
- **Input**: `{ provider, model, apiKey, purpose }` (`purpose`: `'text'` | `'image'`)
- **Action**: Builds a temporary `AiConfig` using the org's config plus any test overrides, sends a short test prompt
- **Response**: `{ success: true, result: string }` or `{ success: false, error: string }`
- **Called from**: Both Org Settings and Super Admin UI test buttons

## Global AI Config (Super Admin)

Super Admin page (`pages/SuperAdmin.tsx`) has an "AI" tab with these controls that save into `app_config` (row `id = 'global-settings'`):

| Field | i18n Key | Widget |
|-------|----------|--------|
| Research Model Provider | `aiProviderText` | Dropdown: Google / OpenRouter |
| Image Generation Provider | `aiProviderImage` | Dropdown: Google / OpenRouter |
| Research Model | `aiResearchModel` | Text input (placeholder: `gemini-3-flash-preview`) |
| Image Model | `aiImageModel` | Text input (placeholder: `gemini-2.5-flash-image`) |
| Gemini API Key | `geminiApiKey` | Password input (stored in global settings, overrides `.env API_KEY`) |
| OpenRouter API Key | `openrouterApiKey` | Password input |
| OpenRouter Base URL | `openrouterBaseUrl` | Text input (default: `https://openrouter.ai/api/v1`) |
| Test Text Model | — | Button calling `testAiConfig` with text purpose |
| Test Image Model | — | Button calling `testAiConfig` with image purpose |

## Org AI Overrides (Org Settings)

Org Settings page (`pages/OrgSettings.tsx`) has separate AI key and provider sections:

### OpenRouter API Key section
- Same pattern as Gemini key: write-only input, boolean indicator (`hasOpenrouterKey`)
- Save/clear via `saveOpenrouterKey()` in `services/storage.ts` → `POST /api/org/openrouter-key`
- Clear confirmation dialog

### AI Provider & Model Overrides section
- **Provider dropdowns** (Research Model Provider, Image Generation Provider): `'google'` | `'openrouter'`
- **Model text inputs**: optional, shows "Use system default" placeholder
- **Save button**: calls `saveOrgAiConfig()` → `POST /api/org/ai-config`
- **Test buttons**: calls `testAiConfig()` for both text and image purposes

## Model Override in Requests

Each AI endpoint accepts an optional `model` field in the request body to override the configured model on a per-request basis:

| Endpoint | Field | Purpose |
|----------|-------|---------|
| `POST /api/ai/species-data` | `model` | Overrides `researchModel` |
| `POST /api/ai/generate-image` | `model` | Overrides `imageModel` |
| `POST /api/ai/translate` | `model` | Overrides `researchModel` |

This is implemented by mutating the config object before the call:
```ts
if (reqModel) config.researchModel = reqModel;
```

## Default Models

| Model ID | Purpose | Constant |
|----------|---------|----------|
| `gemini-3-flash-preview` | Species data, translation | `researchModel` default |
| `gemini-2.5-flash-image` | Image generation | `imageModel` default |
| `gemini-flash-lite-latest` | Reverse geocode (Gemini fallback) | Inline in reverse-geocode |
| `https://openrouter.ai/api/v1` | OpenRouter base URL | `openrouterBaseUrl` default |

## Sanitization — `sanitizeOrgForClient()`

**Backend** (`backend/src/index.ts:315-319`):

Strips both `gemini_api_key` and `openrouter_api_key` from org data before sending to the client. Exposes only boolean indicators:
- `has_gemini_api_key` (mapped client-side as `hasOwnGeminiKey`)
- `has_openrouter_key` (mapped client-side as `hasOpenrouterKey`)

## Frontend Service (`services/geminiService.ts`)

All AI functions:
- `fetchSpeciesData(commonName, type, locationContext)` — calls `/api/ai/species-data`
- `generateSpeciesImage(commonName, scientificName, type)` — calls `/api/ai/generate-image`
- `translateDictionary(sourceData, targetLanguage)` — calls `/api/ai/translate`
- `reverseGeocode(lat, lng)` — calls `/api/ai/reverse-geocode`
- `testAiConfig({ provider, model, apiKey, purpose })` — calls `/api/ai/test`
- `fetchWikimediaImage(query)` — calls Wikimedia API directly (not proxied)
- `urlToBase64(url)` — utility to convert URLs to data URIs

All AI-proxied functions (except `reverseGeocode`) check `checkAndIncrementAiUsage()` before calling.

## Usage Limits

- Stored in `organizations.ai_usage_limit` (0 = unlimited) and `organizations.ai_usage_count` (monthly counter).
- `organizations.ai_usage_last_reset` tracks when the counter was last reset.
- The client-side `checkAndIncrementAiUsage()` in `services/storage.ts` checks the limit before making the call.
- Limits are enforced client-side only (the backend does not enforce usage caps).

## AI Endpoints (all in `backend/src/index.ts`)

### 1. Species Data Autofill — `POST /api/ai/species-data`
- **Auth**: Required (authenticate middleware)
- **Input**: `{ commonName, type, locationContext, model? }`
- **Model**: Resolved via `getAiConfig()` → `researchModel`, overridable with `model` field
- **Schema**: Structured JSON response with `responseMimeType: "application/json"` and a defined `speciesSchema`
- **Prompt**: Asks for comprehensive biological data. If `locationContext` is provided, requests native status for that specific location.
- **Called from**: `fetchSpeciesData()` in geminiService → used in SpeciesManager and IndividualManager autofill buttons.
- **Usage limit**: Yes — checked client-side before the call.

### 2. Image Generation — `POST /api/ai/generate-image`
- **Auth**: Required (authenticate middleware)
- **Input**: `{ prompt, model? }`
- **Model**: Resolved via `getAiConfig()` → `imageModel`, overridable
- **Response handling**:
  - Gemini: Returns `{ imageUrl: "data:image/png;base64,..." }` extracted from `inlineData`
  - OpenRouter: Returns `{ imageUrl: <url> }` extracted from markdown or URL in response
- **Prompt (client-side)**: Generated in `generateSpeciesImage()` — requests a clean scientific illustration on white background.
- **Fallback**: On failure, `generatePattern(commonName)` returns an SVG placeholder pattern.

### 3. Translation — `POST /api/ai/translate`
- **Auth**: Required (authenticate middleware)
- **Input**: `{ sourceData: Record<string,string>, targetLanguage, model? }`
- **Model**: Resolved via `getAiConfig()` → `researchModel`, overridable
- **Schema**: Array of `{ k: string, v: string }` objects.
- **Prompt**: "You are a professional translator..."
- **Called from**: Super Admin language editor's "Localise via Gemini AI" button.
- **Usage limit**: Yes.

### 4. Reverse Geocoding — `POST /api/ai/reverse-geocode`
- **Auth**: No (public — used during registration before user has an account)
- **Input**: `{ lat, lng }`
- **Strategy (3 tiers)**:
  1. **Nominatim (OSM)** — free, no API key. Requests `https://nominatim.openstreetmap.org/reverse` with User-Agent header.
  2. **Gemini fallback** — only if `process.env.API_KEY` is set. Uses `gemini-flash-lite-latest` with thinking disabled. Not routed through `callAiProvider()`.
  3. **Coordinate fallback** — returns `"{lat}, {lng}"` as string.

### 5. Test AI Config — `POST /api/ai/test`
- **Auth**: Required (authenticate middleware)
- **Input**: `{ provider, model, apiKey, purpose }`
- **Action**: Builds a temporary merged config, sends a short test prompt, returns result or error.
- **Called from**: Org Settings and Super Admin test buttons.

## Response Parsing

The `sanitizeJsonResponse()` utility strips markdown code fences and extracts the first JSON object or array from the AI response, handling cases where the model wraps output in ```json blocks.

## Organization Type (`types.ts:43-73`)

Client-side `Organization` interface includes:
- `hasOwnGeminiKey?: boolean` — true when a Gemini key is stored server-side
- `hasOpenrouterKey?: boolean` — true when an OpenRouter key is stored server-side
- `aiProviderText?: string` — per-org text provider override
- `aiProviderImage?: string` — per-org image provider override
- `aiResearchModel?: string` — per-org research model override
- `aiImageModel?: string` — per-org image model override

## Security Notes

1. API keys never leave the server — `sanitizeOrgForClient()` strips `gemini_api_key` and `openrouter_api_key` from org data.
2. Per-org keys are stored in DB columns: `organizations.gemini_api_key` (TEXT, nullable) and `organizations.openrouter_api_key` (TEXT, nullable).
3. A global Gemini key can be set via Super Admin → AI tab (stored in `app_config` as `geminiApiKey`), which overrides `.env API_KEY` but is still overridden by per-org `gemini_api_key`.
4. Key endpoints (`POST /api/org/gemini-key`, `POST /api/org/openrouter-key`) require Admin/Super Admin role.
5. OpenRouter keys can also be set globally via Super Admin → AI tab (stored in `app_config`).

### Gemini API Key Priority

The Gemini API key is resolved in this order (highest priority first):
1. Per-org `organizations.gemini_api_key` — set via Org Settings
2. Global `geminiApiKey` — set via Super Admin → AI tab (stored in `app_config.global-settings`)
3. Server environment variable `.env API_KEY` — fallback default