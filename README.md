<div align="center">
<img width="1200" height="475" alt="OpenStudbook Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# OpenStudbook

**Open-source captive breeding and botanical collection management for zoos, aquariums, and botanical gardens.**

[![Security Audit](https://github.com/teruselearning/openstud/actions/workflows/security.yml/badge.svg)](https://github.com/teruselearning/openstud/actions/workflows/security.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)

</div>

---

OpenStudbook is a self-hosted web platform for managing captive animal and plant populations. Track individuals, species, breeding events, genetic lineage, health records, and enclosures — with a global network map for inter-organisation partnerships.

**Key features:**
- 🐾 **Fauna & Flora modes** — unified management for animals and plants
- 🧬 **Studbook & genetics** — lineage tracking, breeding recommendations, DNA records
- 🌍 **Network map** — discover partner organisations and propose breeding loans
- 🤖 **AI assist** — species autofill and illustration via Gemini (optional)
- 🔒 **Multi-factor auth**, per-org user roles, and full data export
- 🌐 **Multi-language** — 10+ languages with live AI translation

---

## Contents

- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Running the Dev Environment](#running-the-dev-environment)
- [First-Time Setup (Installer)](#first-time-setup-installer)
- [Production Deployment](#production-deployment)
- [Resetting the Database](#resetting-the-database)
- [Optional: AI Features](#optional-ai-features)
- [Optional: Cloudflare / ngrok Tunnel](#optional-cloudflare--ngrok-tunnel)
- [Security](#security)
- [Contributing](#contributing)

---

## Requirements

| Dependency | Minimum version | Notes |
|---|---|---|
| Node.js | 18 LTS | 20 LTS recommended |
| npm | 9+ | Bundled with Node |
| MariaDB **or** MySQL | MariaDB 10.6+ / MySQL 8.0+ | Must support `utf8mb4` |

> **Windows users:** [MariaDB MSI installer](https://mariadb.org/download/) is the easiest option.  
> **macOS users:** `brew install mariadb && brew services start mariadb`  
> **Linux users:** `sudo apt install mariadb-server` or equivalent.

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/teruselearning/openstud.git
cd openstud

# 2. Install frontend dependencies
npm install

# 3. Install backend dependencies
cd backend && npm install && cd ..

# 4. Configure environment
cp backend/.env.example backend/.env
#    → open backend/.env and fill in your DB credentials and JWT secret

# 5. Create the database
#    (MariaDB / MySQL must be running)
mysql -u root -p -e "CREATE DATABASE openstudbook CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 6. Start the backend
cd backend && npm run dev &

# 7. Start the frontend (new terminal)
npm run dev
```

Then open **http://localhost:3000** — the installer wizard will guide you through creating your first organisation and admin account.

---

## Configuration

All backend configuration lives in `backend/.env`. Copy the example file and edit it:

```bash
cp backend/.env.example backend/.env
```

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Backend port (default: `3001`) |
| `JWT_SECRET` | **Yes** | Long random string used to sign auth tokens. Generate one: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `DATABASE_HOST` | **Yes** | DB host (usually `localhost`) |
| `DATABASE_PORT` | No | DB port (default: `3306`) |
| `DATABASE_USER` | **Yes** | DB username |
| `DATABASE_PASSWORD` | **Yes** | DB password |
| `DATABASE_NAME` | **Yes** | DB name (e.g. `openstudbook`) |
| `API_KEY` | No | Gemini API key — enables AI species autofill and illustrations. [Get one free.](https://aistudio.google.com/) |

> **Never commit `backend/.env`** — it is gitignored by default.

---

## Running the Dev Environment

You need four processes running simultaneously. Open a separate terminal for each:

### 1. Backend (Express + TypeScript)

```bash
cd backend
npm run dev
# Listening on http://localhost:3001
```

### 2. Frontend (Vite + React)

```bash
npm run dev
# Listening on http://localhost:3000
```

### 3. Mail catcher (optional — catches outbound emails locally)

OpenStudbook sends transactional emails (invitations, password reset, MFA codes). In development, catch them locally instead of sending to real inboxes.

**Using [maildev](https://github.com/maildev/maildev)** (recommended):

```bash
# Install once
npm install -g maildev

# Run
maildev --smtp 1025 --web 1080
```

Web UI → **http://localhost:1080**

Then set these values in the Super Admin → SMTP settings panel:

| Setting | Value |
|---|---|
| SMTP Host | `localhost` |
| SMTP Port | `1025` |
| SMTP User | *(empty)* |
| SMTP Pass | *(empty)* |
| Secure (TLS) | Off |

### 4. Cloudflare tunnel (optional — gives your local app a public HTTPS URL)

Useful for testing on mobile devices or sharing a preview.

```bash
npm run tunnel
```

The public `trycloudflare.com` URL is printed to the console. Requires [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) installed at `C:\Program Files (x86)\cloudflared\cloudflared.exe`.

---

## First-Time Setup (Installer)

On a **fresh database**, the app automatically shows the installation wizard at **http://localhost:3000**.

The wizard will ask you to:

1. **Test the database connection** — verifies the credentials in `backend/.env` are working
2. **Create your organisation** — name and admin account details
3. **Choose a focus** — Fauna (animals) or Flora (plants)

After setup, you can configure SMTP, languages, branding, and feature flags under **Super Admin** (the gear icon in the sidebar).

> If you need to re-run the installer (e.g. for testing), see [Resetting the Database](#resetting-the-database).

---

## Production Deployment

OpenStudbook is designed to run on a single Linux/Windows server behind a reverse proxy.

### Recommended stack

```
Internet → Nginx (HTTPS/TLS) → Vite static build (port 80)
                              → Express backend (port 3001)
```

### Build steps

```bash
# Build the frontend
npm run build
# Output is in dist/ — serve as static files via Nginx

# Build the backend
cd backend && npm run build
# Output is in backend/dist/ — run with: node dist/index.js
```

### Nginx example config

```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;

    # SSL cert (e.g. Let's Encrypt)
    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Frontend (built static files)
    root /var/www/openstudbook/dist;
    index index.html;
    try_files $uri $uri/ /index.html;

    # Backend API proxy
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /rest/ {
        proxy_pass http://localhost:3001;
    }

    location /uploads/ {
        proxy_pass http://localhost:3001;
    }
}

# Redirect HTTP → HTTPS
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}
```

### Environment for production

Update `backend/.env` for production:

```
NODE_ENV=production
PORT=3001
JWT_SECRET=<strong random secret — rotate quarterly>
DATABASE_HOST=localhost
DATABASE_USER=openstudbook_user
DATABASE_PASSWORD=<strong password>
DATABASE_NAME=openstudbook
```

### Process management (Linux)

```bash
# Install pm2
npm install -g pm2

# Start backend
pm2 start backend/dist/index.js --name openstudbook-api

# Auto-restart on reboot
pm2 startup
pm2 save
```

### Before going public — security checklist

- [ ] Lock CORS in `backend/src/index.ts`: change `origin: '*'` to your domain
- [ ] Add `helmet` middleware: `npm install helmet` → `app.use(helmet())`
- [ ] Add rate limiting on auth endpoints: `npm install express-rate-limit`
- [ ] Use a strong, unique `JWT_SECRET` (32+ random characters)
- [ ] Restrict DB user permissions — grant only `SELECT, INSERT, UPDATE, DELETE` on `openstudbook`
- [ ] Enable HTTPS — use Let's Encrypt / Certbot
- [ ] Disable `enableRegistration` in Super Admin if you don't want public sign-ups

---

## Resetting the Database

Useful during development or to re-run the installer wizard.

**MariaDB / MySQL:**

```bash
mysql -u root -p -e "DROP DATABASE openstudbook; CREATE DATABASE openstudbook CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

Then restart the backend — it will re-run migrations and show the installer on next page load.

---

## Optional: AI Features

OpenStudbook integrates with [Google Gemini](https://aistudio.google.com/) for:

- **Species autofill** — fill conservation status, lifespan, weight from scientific name
- **AI illustration** — generate a representative species image
- **Language translation** — auto-translate UI strings into new languages

To enable, add your key to `backend/.env`:

```
API_KEY=your_gemini_api_key_here
```

AI usage is tracked per organisation and capped by the Super Admin. Organisations can also provide their own Gemini API key in Org Settings to bypass the shared limit.

---

## Optional: Cloudflare / ngrok Tunnel

Expose your local dev instance publicly (useful for mobile testing, demos, or webhook testing).

**Cloudflare Quick Tunnel** (no account needed):
```bash
npm run tunnel
```

**ngrok** (requires free account):
```bash
npm run ngrok
```

Both print a public HTTPS URL to the console.

---

## Security

See the [security maintenance plan in CLAUDE.md](CLAUDE.md#security-maintenance-plan) for the full automated and manual security schedule.

To report a vulnerability, please open a [GitHub Security Advisory](https://github.com/teruselearning/openstud/security/advisories/new) rather than a public issue.

---

## Contributing

Contributions are welcome! Please:

1. Fork the repo and create a feature branch from `main`
2. Run `npm audit` in both root and `backend/` — no new high/critical issues
3. Test the installer flow on a fresh database before submitting
4. Open a pull request against `main` with a clear description of the change

For larger changes, open an issue first to discuss the approach.

---

<div align="center">
  <sub>Built with ❤️ for wildlife conservation and botanical management.</sub>
</div>
