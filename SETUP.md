# OpenStudbook — Development Environment Setup

This document covers everything needed to set up a new development machine from scratch.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 18+ (20 LTS recommended) | [nodejs.org](https://nodejs.org) |
| npm | 9+ | Bundled with Node |
| MariaDB | 10.6+ (or MySQL 8.0+) | [mariadb.org](https://mariadb.org) |
| Git | Any recent | [git-scm.com](https://git-scm.com) |
| GitHub CLI (`gh`) | Any recent | `winget install GitHub.cli` or [cli.github.com](https://cli.github.com) |
| CodeGraph | Latest | `npm install -g @opencode-ai/codegraph` |
| opencode | Latest | `npm install -g @opencode-ai/opencode` |
| maildev | Latest | `npm install -g maildev` |
| cloudflared | Any recent | `winget install cloudflare.cloudflared` or [developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) |

## 1. Clone the repository

```bash
git clone https://github.com/teruselearning/openstud.git
cd openstud
```

## 2. Install dependencies

```bash
# Frontend
npm install

# Backend
cd backend && npm install && cd ..
```

## 3. Configure environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` with your database credentials and secrets:

```env
PORT=3001
JWT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
API_KEY=<Gemini API key>
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_USER=root
DATABASE_PASSWORD=<your db password>
DATABASE_NAME=openstudbook
```

## 4. Create the database

```bash
mysql -u root -p -e "CREATE DATABASE openstudbook CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

## 5. Start the dev servers

```bash
# Terminal 1 — Backend (port 3001)
cd backend && npm run dev

# Terminal 2 — Frontend (port 3000)
npm run dev

# Terminal 3 — Mail catcher (port 1080)
maildev --smtp 1025 --web 1080
```

Open **http://localhost:3000** — the installer wizard will guide you through the rest.

## 6. Set up opencode

### Global config

Create `~/.config/opencode/opencode.jsonc`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "codegraph": {
      "type": "local",
      "command": ["codegraph", "serve", "--mcp"],
      "enabled": true
    }
  }
}
```

### Index the project with CodeGraph

```bash
cd openstud
codegraph init
```

This creates the `.codegraph/` index that powers code navigation.

### Authenticate GitHub CLI

```bash
gh auth login
```

Required for the `@git` agent to create PRs.

## 7. Verify setup

```bash
# Check all tools are available
node --version
npm --version
codegraph --version
opencode --version
gh --version
maildev --version
```

## 8. Start working

```bash
opencode
```

The `@git` agent will handle commits, branches, and PRs. See `opencode.md` for the full workflow.

## Troubleshooting

| Issue | Fix |
|---|---|
| `codegraph: command not found` | Run `npm install -g @opencode-ai/codegraph` |
| `opencode: command not found` | Run `npm install -g @opencode-ai/opencode` |
| Database connection refused | Ensure MariaDB/MySQL is running and credentials in `.env` are correct |
| Maildev not sending | Ensure `maildev` is running on SMTP port 1025 |
| `gh` not authenticated | Run `gh auth login` |
