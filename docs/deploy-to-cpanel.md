# Deploying OpenStudbook to cPanel

This guide walks you through deploying both the **Vite (React) frontend** and **Express (Node.js) backend** to a cPanel server with MySQL support.

---

## Prerequisites

- cPanel account with:
  - **Node.js** support (via "Setup Node.js App" or Passenger)
  - **MySQL/MariaDB** database access
  - **SSH access** (recommended; some steps work via File Manager)
- Node.js 18+ installed locally (for building)
- Your domain or subdomain pointed to the server

---

## 1. Build the Application Locally

You must build **both** the frontend and backend on your local machine before uploading.

### Frontend

```bash
# From the project root
npm install
npm run build
```

This produces a `dist/` folder containing static HTML, CSS, and JS files.

### Backend

```bash
# From the backend directory
cd backend
npm install
npm run build
```

This compiles TypeScript and outputs to `backend/dist/`.

---

## 2. Set Up MySQL on cPanel

1. Log in to cPanel.
2. Open **MySQL Databases**.
3. Create a new database (e.g., `openstudbook`).
4. Create a new MySQL user with a strong password.
5. Add the user to the database with **All Privileges**.
6. Note the database name, username, and password — you'll need these for the `.env` file.

---

## 3. Upload Files to the Server

### Option A: Via SSH (Recommended)

```bash
# Connect to your server
ssh user@yourdomain.com

# Navigate to the public_html directory or your app's root
cd ~/public_html

# Create the backend directory
mkdir -p backend

# Upload via SCP from your local machine (run locally, not on server)
# Frontend files:
scp -r dist/* user@yourdomain.com:~/public_html/

# Backend files:
scp -r backend/dist backend/package.json backend/package-lock.json user@yourdomain.com:~/public_html/backend/
```

### Option B: Via cPanel File Manager

1. Open **File Manager** in cPanel.
2. Navigate to `public_html`.
3. Upload the contents of your local `dist/` folder directly into `public_html`.
4. Create a `backend/` folder inside `public_html`.
5. Upload `backend/dist/`, `backend/package.json`, and `backend/package-lock.json` into it.

### Final Directory Structure on Server

```
~/public_html/
├── index.html
├── assets/
│   ├── index-xxxx.js
│   └── index-xxxx.css
├── .htaccess
├── backend/
│   ├── dist/
│   │   └── index.js
│   ├── package.json
│   └── package-lock.json
└── uploads/          (created automatically by backend)
```

---

## 4. Configure the Backend

### Create the `.env` File

Create `backend/.env` on the server with your production values:

```bash
# Connect via SSH
ssh user@yourdomain.com

# Create the env file
cat > ~/public_html/backend/.env << 'EOF'
PORT=3001
JWT_SECRET=your-random-32-plus-character-secret-here
API_KEY=your-google-gemini-api-key-here
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_USER=your_mysql_username
DATABASE_PASSWORD=your_mysql_password
DATABASE_NAME=your_database_name
UPLOADS_DIR=/home/youruser/public_html/uploads
FRONTEND_DIR=/home/youruser/public_html
EOF
```

**Generate a secure JWT secret:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Install Production Dependencies

```bash
cd ~/public_html/backend
npm install --production
```

### Fix CORS for Production

The backend currently allows all origins (`origin: '*'`). Update this in `backend/src/index.ts` before rebuilding, or use an `.htaccess` reverse proxy approach.

**Option 1: Rebuild with CORS locked to your domain**

Edit `backend/src/index.ts` line 60:
```typescript
// Change from:
app.use(cors({ origin: '*' }));

// To:
app.use(cors({ origin: 'https://yourdomain.com' }));
```

Then rebuild: `cd backend && npm run build`

**Option 2: Use Apache as a reverse proxy (no CORS change needed)**

See the Apache configuration section below.

---

## 5. Configure the Frontend

### API Base URL

The frontend must call the backend at your production URL, not `localhost`.

If your backend runs on the same domain (e.g., `https://yourdomain.com/api`), ensure the frontend API base URL is set to the production domain.

Check if your code uses a base URL configuration. If not, you may need to:

1. Rebuild the frontend with the correct base URL, or
2. Configure Apache to proxy API requests to the backend.

---

## 6. Configure Apache (SPA Routing + API Proxy)

Create or edit `.htaccess` in `public_html/`:

```apache
# Enable mod_rewrite
RewriteEngine On

# Serve the frontend for all non-API, non-backend routes (SPA fallback)
RewriteCond %{REQUEST_URI} !^/api/
RewriteCond %{REQUEST_URI} !^/rest/
RewriteCond %{REQUEST_URI} !^/uploads/
RewriteCond %{REQUEST_URI} !^/backend/
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ index.html [L]

# Proxy API requests to the Node.js backend
RewriteCond %{REQUEST_URI} ^/api/
RewriteRule ^api/(.*)$ http://127.0.0.1:3001/api/$1 [P,L]

# Proxy REST requests to the Node.js backend
RewriteCond %{REQUEST_URI} ^/rest/
RewriteRule ^rest/(.*)$ http://127.0.0.1:3001/rest/$1 [P,L]

# Proxy uploads to the Node.js backend
RewriteCond %{REQUEST_URI} ^/uploads/
RewriteRule ^uploads/(.*)$ http://127.0.0.1:3001/uploads/$1 [P,L]
```

> **Note:** `mod_proxy` and `mod_rewrite` must be enabled on the server. If proxy rules don't work, use the "Node.js App" setup instead (see below).

---

## 7. Start the Backend Application

### Method A: cPanel Node.js App (Recommended)

1. In cPanel, open **Setup Node.js App** (or **Passenger**).
2. Click **Create Application**.
3. Set:
   - **Node.js version**: 18+ (or latest available)
   - **Application mode**: Production
   - **Application root**: `backend`
   - **Application startup file**: `dist/index.js`
   - **Application URL**: your domain or subdomain
4. Click **Create**.
5. This will auto-install dependencies and start the app.

### Method B: Manual with PM2 (via SSH)

```bash
# Install PM2 globally (if not already)
npm install -g pm2

# Start the backend
cd ~/public_html/backend
pm2 start dist/index.js --name openstudbook-backend
pm2 save
pm2 startup    # follow the printed command to enable on boot
```

### Method C: .htaccess Reverse Proxy (if no Node.js app setup available)

Use the `.htaccess` proxy rules from Section 6. The backend must be started manually via SSH or a cron job:

```bash
# Add to crontab for auto-restart
crontab -e
# Add this line:
@reboot cd /home/user/public_html/backend && node dist/index.js &
```

---

## 8. Verify the Deployment

### Check the Backend is Running

```bash
# From SSH
curl http://127.0.0.1:3001/api/install/status
# Expected: {"success":true,"installed":false,"connected":true} (on first run)
```

Or from a browser:
```
https://yourdomain.com/api/install/status
```

### Run the Installer

1. Open `https://yourdomain.com` in your browser.
2. The app should redirect you to the setup wizard.
3. Enter your MySQL credentials and org details.
4. The installer creates all tables and seeds initial data.

### Check the Frontend Loads

- Open `https://yourdomain.com` — the React app should load.
- Open browser DevTools → Network tab and check that API calls return 200 (not 404 or CORS errors).

### Common Issues

| Symptom | Fix |
|---|---|
| 503 error on all requests | Backend not running — check PM2 logs or cPanel Node.js app status |
| API calls return 404 | Check `.htaccess` proxy rules or that backend is running on port 3001 |
| CORS errors in browser | Update `origin` in backend CORS config and rebuild, or use `.htaccess` proxy |
| Blank page after login | Frontend is making API calls to `localhost:3001` — fix the API base URL |
| "Cannot find module" | Run `npm install --production` in the `backend/` directory on the server |
| "JWT_SECRET is not set" | Ensure `backend/.env` exists with a valid `JWT_SECRET` |
| Database connection failed | Verify MySQL credentials in `.env` and that the database exists |
| Upload images fail | Ensure the `uploads/` directory exists and is writable (`chmod 755`) |

---

## 9. Post-Deployment Checklist

- [ ] Backend is running and responding at `/api/install/status`
- [ ] Frontend loads and connects to the backend API
- [ ] CORS is locked to your production domain (not `*`)
- [ ] `JWT_SECRET` is a strong, random string (32+ characters)
- [ ] Database connection works
- [ ] File uploads work (check `uploads/` directory permissions)
- [ ] HTTPS is enabled (use cPanel's Let's Encrypt or your hosting provider's SSL)
- [ ] `node_modules/` is NOT uploaded to the server
- [ ] `.env` file is NOT in version control

---

## 10. Updating the Application

When deploying updates:

```bash
# 1. Build locally
npm run build                    # frontend
cd backend && npm run build      # backend

# 2. Upload only the built files
scp -r dist/* user@yourdomain.com:~/public_html/
scp -r backend/dist user@yourdomain.com:~/public_html/backend/

# 3. Restart the backend
ssh user@yourdomain.com
cd ~/public_html/backend
pm2 restart openstudbook-backend
```

If you added new dependencies to `backend/package.json`, run `npm install --production` on the server before restarting.

---

## Appendix: Environment Variable Reference

| Variable | Description | Example |
|---|---|---|
| `PORT` | Backend listen port | `3001` |
| `JWT_SECRET` | Secret for signing JWT tokens | `<random 32+ char hex string>` |
| `API_KEY` | Google Gemini API key (optional) | `AIza...` |
| `DATABASE_HOST` | MySQL host | `localhost` |
| `DATABASE_PORT` | MySQL port | `3306` |
| `DATABASE_USER` | MySQL username | `openstudbook_user` |
| `DATABASE_PASSWORD` | MySQL password | `secure_password_here` |
| `DATABASE_NAME` | MySQL database name | `openstudbook` |
| `UPLOADS_DIR` | Absolute path to uploads folder | `/home/user/public_html/uploads` |
| `FRONTEND_DIR` | Absolute path to frontend build folder | `/home/user/public_html` |
