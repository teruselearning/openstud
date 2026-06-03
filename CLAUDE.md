# OpenStudbook — Dev Environment

## Stack

| Layer | Tool | Port |
|---|---|---|
| Frontend | Vite (React + TypeScript) | 3000 |
| Backend | Express + ts-node-dev | 3001 |
| Database | MySQL | 3306 |
| Mail catcher | maildev | SMTP 1025 · Web UI 1080 |

## Starting the dev environment

### 1. Backend
```bash
cd backend && npm run dev
```

### 2. Frontend
```bash
npm run dev
```

### 3. Mail catcher (maildev)
```bash
maildev --smtp 1025 --web 1080
```
Web UI: http://localhost:1080  
All outbound emails are caught here — nothing reaches real inboxes.

> maildev is installed as a global npm package:
> `npm install -g maildev`

### 4. Cloudflare tunnel (public URL)
```bash
npm run tunnel
```
Or directly:
```bash
"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:3000 --no-autoupdate
```
The public `trycloudflare.com` URL is printed to the console on startup.

## SMTP settings (stored in DB `app_config`)

| Key | Value |
|---|---|
| smtpHost | localhost |
| smtpPort | 1025 |
| smtpUser | (empty) |
| smtpPass | (empty) |
| smtpSecure | false |

These match maildev's defaults — no changes needed for local dev.

## Environment variables

Backend reads from `backend/.env`:

```
PORT=3001
JWT_SECRET=...
API_KEY=...
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_USER=root
DATABASE_PASSWORD=...
DATABASE_NAME=openstudbook
```

## Cloudflare tunnel

The `npm run tunnel` script uses the locally installed `cloudflared` at:
`C:\Program Files (x86)\cloudflared\cloudflared.exe`

For ngrok instead: `npm run ngrok`

---

## Security Maintenance Plan

### Automated (no action needed once set up)

| What | How | Cadence |
|---|---|---|
| Dependency vulnerability PRs | GitHub Dependabot (`.github/dependabot.yml`) | Weekly — Mondays |
| `npm audit` gate on PRs | GitHub Actions (`.github/workflows/security.yml`) | Every push to `main` / `pre-deployment` |
| TypeScript type-check gate | GitHub Actions (same workflow) | Every push |
| Database backup | Windows Scheduled Task → `scripts/backup-db.ps1` | Nightly at 02:00 |
| Backup pruning | Built into `backup-db.ps1` | Nightly (keeps 30 days) |

**First-time setup for the scheduled backup task:**
```powershell
# Run once as Administrator
powershell -ExecutionPolicy Bypass -File scripts\register-scheduled-tasks.ps1
```
Backups are written to `backups/` as `.sql.gz` files (excluded from git via `.gitignore`).

---

### Manual — Quarterly Checklist

**Credentials**
- [ ] Rotate `JWT_SECRET` in `backend/.env` and restart backend (invalidates all sessions — users re-login)
- [ ] Rotate `DATABASE_PASSWORD` in MariaDB and `backend/.env`
- [ ] Rotate `API_KEY` (Gemini) if shared or potentially exposed
- [ ] Review any per-org Gemini API keys stored in the DB

**Dependencies**
- [ ] Run `npm audit` in root and `backend/` — fix anything at high or critical severity
- [ ] Review and merge pending Dependabot PRs

**Access**
- [ ] Audit Super Admin accounts — remove any that are no longer needed
- [ ] Review active user sessions / tokens (no server-side session store currently — rotating JWT_SECRET covers this)

**Infrastructure**
- [ ] Verify nightly backups are succeeding (`backups/backup.log`)
- [ ] Test a backup restore against a spare DB instance
- [ ] Check MariaDB version — upgrade if a security release is available

---

### Known Hardening Items (implement before public deployment)

These are not yet in the codebase and should be addressed before exposing the app to the internet:

| Priority | Issue | Fix |
|---|---|---|
| 🔴 High | CORS is `origin: '*'` | Lock to your actual domain in `backend/src/index.ts` |
| 🔴 High | No HTTP security headers | Add `helmet` middleware (`npm install helmet`) |
| 🔴 High | No rate limiting on auth endpoints | Add `express-rate-limit` on `/api/login`, `/api/register`, `/api/forgot-password` |
| 🟡 Medium | JWT secret is a static string | Use a long random secret (32+ chars) and rotate quarterly |
| 🟡 Medium | `express.json` body limit is 50 MB | Reduce to `5mb` unless large uploads are needed |
| 🟢 Low | Morgan logs to console only | Pipe to a file with log rotation in production |

---

### Backups

Backups are stored in `backups/` (gitignored). The script uses MariaDB's `mysqldump` with `--single-transaction` for a consistent snapshot.

To restore a backup:
```powershell
# Decompress
Expand-Archive backups\openstudbook_2026-01-01_02-00-00.sql.gz -DestinationPath backups\

# Restore
& "C:\Program Files\MariaDB 12.2\bin\mysql.exe" -u root -p openstudbook < backups\openstudbook_2026-01-01_02-00-00.sql
```
