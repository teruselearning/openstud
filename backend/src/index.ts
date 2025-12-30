import express from 'express';
import cors from 'cors';
// @ts-ignore
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import morgan from 'morgan';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import path from 'path';

declare const __dirname: string;

dotenv.config();

// --- CRASH PREVENTION ---
(process as any).on('uncaughtException', (err: any) => {
  console.error('CRITICAL ERROR (Uncaught Exception):', err);
});

(process as any).on('unhandledRejection', (reason: any, promise: any) => {
  console.error('CRITICAL ERROR (Unhandled Rejection):', reason);
});

const prisma = new PrismaClient();
const app: any = express();
const PORT = Number(process.env.PORT) || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret-do-not-use-in-prod';

// Simple in-memory stores
const resetCodes = new Map<string, { code: string, expires: number }>();
const pendingRegistrations = new Map<string, { data: any, code: string, expires: number }>();

// 1. Core Middleware
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(morgan('dev'));

/**
 * AUTO-INITIALIZE DATABASE
 * Ensures tables exist and initial config is present
 */
const initDatabase = async () => {
    console.log("Initializing database...");
    try {
        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS organizations (
                id VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255),
                location VARCHAR(255),
                latitude DOUBLE,
                longitude DOUBLE,
                founded_year INT,
                description LONGTEXT,
                focus VARCHAR(255),
                is_org_public BOOLEAN DEFAULT FALSE,
                is_species_public BOOLEAN DEFAULT FALSE,
                obscure_location BOOLEAN DEFAULT FALSE,
                hide_name BOOLEAN DEFAULT FALSE,
                allow_breeding_requests BOOLEAN DEFAULT FALSE,
                breeding_request_contact_id VARCHAR(255),
                show_native_status BOOLEAN DEFAULT TRUE,
                dashboard_block JSON,
                ai_usage_limit INT DEFAULT 100,
                ai_usage_count INT DEFAULT 0,
                ai_usage_last_reset VARCHAR(255),
                is_deleted BOOLEAN DEFAULT FALSE
            )
        `);

        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(255) PRIMARY KEY,
                org_id VARCHAR(255),
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                role VARCHAR(50) NOT NULL,
                status VARCHAR(50) NOT NULL,
                password VARCHAR(255),
                avatar_url LONGTEXT,
                allowed_project_ids JSON
            )
        `);

        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS projects (
                id VARCHAR(255) PRIMARY KEY,
                org_id VARCHAR(255),
                name VARCHAR(255) NOT NULL,
                description LONGTEXT
            )
        `);

        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS species (
                id VARCHAR(255) PRIMARY KEY,
                project_id VARCHAR(255),
                common_name VARCHAR(255) NOT NULL,
                scientific_name VARCHAR(255) NOT NULL,
                type VARCHAR(50) NOT NULL,
                plant_classification VARCHAR(50),
                conservation_status VARCHAR(255),
                sexual_maturity_age_years DOUBLE,
                average_adult_weight_kg DOUBLE,
                life_expectancy_years DOUBLE,
                breeding_season_start INT,
                breeding_season_end INT,
                image_url LONGTEXT,
                native_status_country VARCHAR(50),
                native_status_local VARCHAR(50)
            )
        `);

        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS individuals (
                id VARCHAR(255) PRIMARY KEY,
                project_id VARCHAR(255),
                species_id VARCHAR(255),
                studbook_id VARCHAR(255),
                name VARCHAR(255) NOT NULL,
                sex VARCHAR(20) NOT NULL,
                birth_date VARCHAR(50),
                weight_kg DOUBLE,
                sire_id VARCHAR(255),
                dam_id VARCHAR(255),
                image_url LONGTEXT,
                dna_sequence LONGTEXT,
                notes LONGTEXT,
                source VARCHAR(255),
                source_details VARCHAR(255),
                latitude DOUBLE,
                longitude DOUBLE,
                is_deceased BOOLEAN DEFAULT FALSE,
                death_date VARCHAR(50),
                loan_status VARCHAR(50),
                transferred_to_org_id VARCHAR(255),
                transfer_date VARCHAR(50),
                transfer_note LONGTEXT,
                weight_history JSON,
                growth_history JSON,
                health_history JSON
            )
        `);

        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS breeding_events (
                id VARCHAR(255) PRIMARY KEY,
                species_id VARCHAR(255),
                sire_id VARCHAR(255),
                dam_id VARCHAR(255),
                date VARCHAR(50),
                offspring_count INT,
                successful_births INT,
                losses INT,
                notes LONGTEXT,
                offspring_ids JSON
            )
        `);

        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS app_config (
                id VARCHAR(255) PRIMARY KEY,
                settings JSON
            )
        `);

        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS languages (
                code VARCHAR(10) PRIMARY KEY,
                name VARCHAR(255),
                translations JSON,
                is_default BOOLEAN DEFAULT FALSE,
                manual_overrides JSON,
                is_deleted BOOLEAN DEFAULT FALSE
            )
        `);

        // Ensure default config row exists
        await prisma.$executeRawUnsafe(`
            INSERT IGNORE INTO app_config (id, settings) VALUES ('global-settings', '{}')
        `);

        console.log("Database initialized successfully.");
    } catch (e: any) {
        console.error("Database initialization failed. Check your connection string.");
        console.error(e.message);
    }
};

const authenticate = (req: any, res: any, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "No token provided" });
  const token = authHeader.split(' ')[1];
  try {
    (req as any).user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

const getTransporter = async () => {
  const config: any = await prisma.$queryRawUnsafe(`SELECT settings FROM app_config WHERE id = 'global-settings' LIMIT 1`);
  const s = config?.[0]?.settings || {};
  if (!s.smtpHost) {
      console.log("[SMTP] Outgoing mail skipped: Host not configured in System Admin settings.");
      return null;
  }
  return nodemailer.createTransport({
    host: s.smtpHost,
    port: s.smtpPort || 587,
    secure: s.smtpSecure || false,
    auth: (s.smtpUser && s.smtpPass) ? { user: s.smtpUser, pass: s.smtpPass } : undefined
  });
};

const replacePlaceholders = (text: string, data: Record<string, string>) => {
  let res = text;
  Object.keys(data).forEach(key => {
    res = res.replace(new RegExp(`{{${key}}}`, 'g'), data[key]);
  });
  return res;
};

// 2. Auth & Registration Routes
app.post('/api/register', async (req: any, res: any, next: express.NextFunction) => {
    const { orgName, userName, email, focus, password, lang } = req.body;
    const cleanEmail = email.toLowerCase().trim();
    const targetLang = lang || 'en-GB';
    
    try {
        const existing: any = await prisma.$queryRawUnsafe(`SELECT id FROM users WHERE email = ? LIMIT 1`, cleanEmail);
        if (existing.length > 0) return res.status(400).json({ error: "Email already registered" });

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        pendingRegistrations.set(cleanEmail, {
            data: { orgName, userName, email: cleanEmail, focus, password },
            code,
            expires: Date.now() + 1800000
        });

        console.log(`[REGISTRATION] Verification Code for ${cleanEmail}: ${code}`);
        const transporter = await getTransporter();
        
        if (transporter) {
            try {
                // Fetch template from DB for localization
                const langData: any = await prisma.$queryRawUnsafe(`SELECT translations FROM languages WHERE code = ? LIMIT 1`, targetLang);
                const translations = langData?.[0]?.translations || {};
                
                const subjectTpl = translations.emailVerifySubject || "Verify your OpenStudbook account";
                const bodyTpl = translations.emailVerifyBody || "<p>Your verification code is: <strong>{{code}}</strong></p>";
                
                const dataToFill = { orgName, userName, code };
                const subject = replacePlaceholders(subjectTpl, dataToFill);
                const html = replacePlaceholders(bodyTpl, dataToFill);

                await transporter.sendMail({
                    from: process.env.SMTP_FROM || '"OpenStudbook" <no-reply@openstudbook.org>',
                    to: cleanEmail,
                    subject,
                    html
                });
            } catch (mailErr: any) {
                console.error("[SMTP] Failed to send registration email:", mailErr.message);
            }
        }
        res.json({ success: true, needsVerification: true, message: "Verification code sent to email." });
    } catch (e: any) {
        next(e);
    }
});

app.post('/api/register/verify', async (req: any, res: any, next: express.NextFunction) => {
    const { email, code } = req.body;
    const cleanEmail = email.toLowerCase().trim();
    const pending = pendingRegistrations.get(cleanEmail);

    if (!pending) {
        return res.status(400).json({ error: "No pending registration found for this email." });
    }
    if (pending.code !== code || pending.expires < Date.now()) {
        return res.status(400).json({ error: "Invalid or expired verification code." });
    }

    const { orgName, userName, focus, password } = pending.data;
    const orgId = `org-${Date.now()}`;
    const userId = `u-${Date.now()}`;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        await prisma.$executeRawUnsafe(`
            INSERT INTO organizations (id, name, focus, location, founded_year, is_org_public, is_species_public, obscure_location, is_deleted, ai_usage_limit, ai_usage_count)
            VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 100, 0)
        `, orgId, orgName, focus, 'Unknown', new Date().getFullYear());

        await prisma.$executeRawUnsafe(`
            INSERT INTO users (id, org_id, name, email, role, status, password, allowed_project_ids)
            VALUES (?, ?, ?, ?, 'Admin', 'Active', ?, '[]')
        `, userId, orgId, userName, cleanEmail, hashedPassword);

        pendingRegistrations.delete(cleanEmail);

        const token = jwt.sign({ id: userId, email: cleanEmail, role: 'Admin', orgId: orgId }, JWT_SECRET, { expiresIn: '30d' });
        
        const users: any = await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE id = ?`, userId);
        const orgs: any = await prisma.$queryRawUnsafe(`SELECT * FROM organizations WHERE id = ?`, orgId);

        res.json({ token, user: users[0], org: orgs[0] });
    } catch (e: any) {
        console.error("DATABASE REGISTRATION ERROR:", e);
        res.status(500).json({ error: `Database error during registration: ${e.message}. Please verify your MySQL connection.` });
    }
});

app.post('/api/login', async (req: any, res: any, next: express.NextFunction) => {
  const { email, password } = req.body;
  const cleanEmail = email?.toLowerCase().trim();
  try {
    const users: any = await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE email = ? LIMIT 1`, cleanEmail);
    const user = users[0];
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const dbHash = String(user.password || '').trim();
    let passwordValid = dbHash ? await bcrypt.compare(String(password), dbHash) : false;
    
    // Developer Fallback
    if (!passwordValid && cleanEmail === 'zoe@openstudbook.org' && password === 'password') passwordValid = true;
    if (!passwordValid) return res.status(401).json({ error: "Invalid credentials" });

    const orgs: any = await prisma.$queryRawUnsafe(`SELECT * FROM organizations WHERE id = ?`, user.org_id);

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, orgId: user.org_id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user, organization: orgs[0] || null });
  } catch (e: any) { next(e); }
});

const rawUpsert = async (table: string, idField: string, item: any) => {
    const keys = Object.keys(item);
    const values = Object.values(item);
    const placeholders = keys.map(() => '?').join(', ');
    const updates = keys.map(k => `${k} = VALUES(${k})`).join(', ');

    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`;
    return prisma.$executeRawUnsafe(sql, ...values);
};

// 4. REST Data Endpoints
app.post('/rest/v1/:table', authenticate, async (req: any, res: any) => {
    const table = req.params.table;
    const data = req.body;
    const items = Array.isArray(data) ? data : [data];
    
    try {
        for (const item of items) {
            if (item.password && !item.password.startsWith('$2')) {
                item.password = await bcrypt.hash(String(item.password), 10);
            }
            Object.keys(item).forEach(k => {
                if (typeof item[k] === 'object') item[k] = JSON.stringify(item[k]);
            });
            await rawUpsert(table, 'id', item);
        }
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/sync', authenticate, async (req: any, res: any, next: express.NextFunction) => {
   try {
      const [partners, projects, users, species, individuals, events, config, languages] = await Promise.all([
         prisma.$queryRawUnsafe(`SELECT * FROM organizations WHERE is_deleted = 0`),
         prisma.$queryRawUnsafe(`SELECT * FROM projects`),
         prisma.$queryRawUnsafe(`SELECT * FROM users`),
         prisma.$queryRawUnsafe(`SELECT * FROM species`),
         prisma.$queryRawUnsafe(`SELECT * FROM individuals`),
         prisma.$queryRawUnsafe(`SELECT * FROM breeding_events`),
         prisma.$queryRawUnsafe(`SELECT * FROM app_config WHERE id = 'global-settings'`),
         prisma.$queryRawUnsafe(`SELECT * FROM languages WHERE is_deleted = 0`)
      ]);
      
      res.json({ 
         success: true, 
         data: { partners, projects, users, species, individuals, languages, breeding_events: events, settings: (config as any)?.[0]?.settings } 
      });
   } catch (e: any) { next(e); }
});

app.get('/api/health', (req: any, res: any) => res.json({ status: 'ok', version: '1.1.2-rawsql' }));

app.use(express.static(path.join(__dirname, '../../dist')));

app.get('*', (req: any, res: any) => {
   if (req.path.startsWith('/api/') || req.path.startsWith('/rest/')) {
      return res.status(404).json({ error: "API Route not found" });
   }
   res.sendFile(path.join(__dirname, '../../dist/index.html'));
});

app.use((err: any, req: any, res: any, next: any) => {
  console.error("EXPRESS ERROR:", err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || "Internal Server Error", success: false });
});

// START SERVER
(async () => {
    await initDatabase();
    app.listen(PORT, () => console.log(`Backend running on port ${PORT} in Raw SQL Mode`));
})();
