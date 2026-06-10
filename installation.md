# OpenStudbook Installation Guide

> **This guide covers a quick manual setup. The [README](README.md) is the canonical reference — see it for full configuration options, production deployment, and security notes.**

---

## Prerequisites

- **Node.js** 18 LTS or higher (20 LTS recommended)
- **MariaDB** 10.6+ or **MySQL** 8.0+ — must be running before you start
- **npm** 9+ (bundled with Node)

---

## Setup

### 1. Clone and install dependencies

```bash
git clone https://github.com/teruselearning/openstud.git
cd openstud
npm install
cd backend && npm install && cd ..
```

### 2. Configure the backend

```bash
cp backend/.env.example backend/.env
```

Open `backend/.env` and set at minimum:

```env
JWT_SECRET=<long random string>
DATABASE_HOST=localhost
DATABASE_USER=root
DATABASE_PASSWORD=<your db password>
DATABASE_NAME=openstudbook
```

Generate a secure JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Create the database

```bash
mysql -u root -p -e "CREATE DATABASE openstudbook CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

### 4. Start the app

```bash
# Terminal 1 — backend
cd backend && npm run dev

# Terminal 2 — frontend
npm run dev
```

Open **http://localhost:3000** — the installer wizard will guide you through the rest.

---

## First Run

The web installer will:

1. Verify your database connection
2. Run all migrations and seed default data
3. Create your first organisation and admin account

After setup, configure SMTP, languages, and feature flags under **Super Admin** (gear icon in the sidebar).

---

## Production

See [Production Deployment](README.md#production-deployment) in the README for build steps, Nginx config, process management, and the security checklist.

> **Never expose the app publicly without completing the security checklist first.**
