# Password Reset

Added in [log: 2026-06-13]. Two-step flow: user submits email, receives a 6-digit code, then sets a new password.

## Flow

```
Login form → "Forgot Password?" link
  → forgot_password view (email input)
    → POST /api/forgot-password
      → 6-digit code stored in users.reset_code, 30-min expiry in users.reset_expires
      → sendMailInternal with templateKey='password_reset'
    → reset_password view (code + new password)
      → POST /api/reset-password
        → validates code, hashes new password, clears reset_code/reset_expires
      → redirected to login
```

## Backend — `backend/src/index.ts:705-753`

### POST /api/forgot-password

Request: `{ email, language? }`

- Always returns `{ success: true, message: "..." }` for unknown emails to prevent enumeration.
- Generates a random 6-digit code, stores in `users.reset_code` with `reset_expires = Date.now() + 30min`.
- Calls `sendMailInternal(email, subject, html, { code }, 'password_reset', lang)`.
- If SMTP is not configured, the response includes `{ fallbackCode: code }` so the frontend can display it directly.

### POST /api/reset-password

Request: `{ email, code, newPassword }`

- Validates `user.reset_code === code` and `user.reset_expires > Date.now()`.
- Hashes the password with bcrypt (10 rounds), updates the row, nullifies `reset_code` and `reset_expires`.
- Returns `{ success: true }`.

## Frontend — `pages/Landing.tsx`

Two views toggled via `viewMode` state:

| View | Lines | Description |
|------|-------|-------------|
| `forgot_password` | 509-523 | Email input form, calls `forgotPassword()` → navigates to `reset_password` on success |
| `reset_password` | 525-549 | 6-digit code input + new password + confirm, calls `resetPassword()` → back to login |

A "Forgot Password?" link on the login form (line 433) sets `viewMode('forgot_password')`.

When `fallbackCode` is set (SMTP unavailable), an amber warning box displays the code directly in the UI.

## Storage — `services/storage.ts:385-415`

- **`forgotPassword(email)`** — POSTs to `/api/forgot-password` with the user's `preferredLanguage`.
- **`resetPassword(email, code, newPassword)`** — POSTs to `/api/reset-password`.

Both return `{ success, error?, message? }`.

## i18n — `services/i18n.ts:49, 370-386`

16 new keys under a `// Password Reset` section:

| Key | English value |
|-----|---------------|
| `forgotPassword` | "Forgot Password?" |
| `forgotPasswordTitle` | "Forgot Password?" |
| `forgotPasswordDesc` | "Enter your email address and we'll send you a code..." |
| `sendResetCode` | "Send Reset Code" |
| `checkYourEmail` | "Check Your Email" |
| `resetPasswordDesc` | "Enter the code sent to your email and choose a new password." |
| `resetCode` | "Reset Code" |
| `newPassword` | "New Password" |
| `confirmNewPassword` | "Confirm New Password" |
| `resetPasswordBtn` | "Reset Password" |
| `passwordResetSuccess` | "Password reset successful! You can now sign in." |
| `backToLogin` | "Back to Login" |
| `codeExpired` | "This code has expired. Please request a new one." |
| `invalidResetCode` | "Invalid reset code." |
| `resetCodeSent` | "A reset code has been sent to your email." |
| `resetPasswordEmailSubject` | "Reset your password" |
| `resetPasswordEmailBody` | HTML with `{{code}}` placeholder |

## Email template — fallback chain

`sendMailInternal` with `templateKey='password_reset'` resolves content in this order:

1. **Custom template** — `settings.emailTemplates.password_reset` (from DB `app_config.settings`), if `enabled` and has `subject`/`bodyHtml`.
2. **Translated strings** — for non-English languages, looks up `emailVerifySubject` / `emailVerifyBody` from the language's translations in the `languages` table (same keys used by MFA and registration).
3. **Inline fallback** — the subject/HTML passed directly to `sendMailInternal` (the hardcoded English strings in `backend/src/index.ts:726-727`).
4. **`{{code}}` placeholder** is replaced in all cases.

## Database schema (existing, no migration needed)

```sql
users.reset_code    VARCHAR(10)   -- 6-digit code
users.reset_expires BIGINT        -- epoch ms, 30 min from creation
```

These columns are created in the initial schema at `backend/src/index.ts:129`.

## Testing with maildev

1. Start maildev: `maildev --smtp 1025 --web 1080`
2. Ensure SMTP settings in DB `app_config` match the local config (see [[CLAUDE.md]]).
3. Navigate to login → click "Forgot Password?" → enter an existing user's email.
4. Check http://localhost:1080 for the email with the 6-digit code.
5. Enter the code and a new password → submit → login with the new password.

**Without maildev/SMTP:** the code appears in:
- The amber "Email not configured" box on the `reset_password` view (if the backend returns `fallbackCode`)
- The backend console log: `[EMAIL LOG] Password reset code for ...: XXXXXX`