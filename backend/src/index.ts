
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import jwt from 'jsonwebtoken';
import morgan from 'morgan';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import path from 'path';
import crypto from 'crypto';
// Import process explicitly to resolve typing issues in some environments
import process from 'process';

declare const __dirname: string;

dotenv.config();

// --- CRASH PREVENTION ---
(process as any).on('uncaughtException', (err: any) => {
  console.error('CRITICAL ERROR (Uncaught Exception):', err);
});

(process as any).on('unhandledRejection', (reason: any, promise: any) => {
  console.error('CRITICAL ERROR (Unhandled Rejection):', reason);
});

// Database Connection
const dbConfig = {
  host: process.env.DATABASE_HOST || 'localhost',
  user: process.env.DATABASE_USER || 'root',
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'openstudbook',
  port: Number(process.env.DATABASE_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let pool: mysql.Pool;

const getDb = () => {
  if (!pool) {
    pool = mysql.createPool(dbConfig);
  }
  return pool;
};

const app: any = express();
const PORT = Number(process.env.PORT) || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret-do-not-use-in-prod';

const pendingRegistrations = new Map<string, { data: any, code: string, expires: number }>();
const passwordResets = new Map<string, { code: string, expires: number }>();

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(morgan('dev'));

/**
 * AUTO-INITIALIZE DATABASE & MIGRATE COLUMNS
 */
const initDatabase = async () => {
    const db = getDb();
    try {
        await db.query('SELECT 1');
        
        await db.execute(`
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
                enable_mfa BOOLEAN DEFAULT FALSE,
                is_deleted BOOLEAN DEFAULT FALSE
            )
        `);

        // Migrations helper for columns
        const ensureColumn = async (table: string, column: string, definition: string) => {
           try {
              const [rows]: any = await db.execute(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
              if (rows.length === 0) {
                 console.log(`Migrating: Adding column ${column} to ${table}`);
                 await db.execute(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
              }
           } catch (e) { console.warn(`Migration check failed for ${table}.${column}`); }
        };

        await ensureColumn('organizations', 'enable_mfa', 'BOOLEAN DEFAULT FALSE');
        await ensureColumn('organizations', 'is_deleted', 'BOOLEAN DEFAULT FALSE');

        await db.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(255) PRIMARY KEY,
                org_id VARCHAR(255),
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                role VARCHAR(50) NOT NULL,
                status VARCHAR(50) NOT NULL,
                password VARCHAR(255),
                avatar_url LONGTEXT,
                allowed_project_ids JSON,
                invite_token VARCHAR(255),
                invite_expires BIGINT,
                CONSTRAINT fk_user_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
            )
        `);

        await ensureColumn('users', 'invite_token', 'VARCHAR(255)');
        await ensureColumn('users', 'invite_expires', 'BIGINT');

        await db.execute(`
            CREATE TABLE IF NOT EXISTS projects (
                id VARCHAR(255) PRIMARY KEY,
                org_id VARCHAR(255),
                name VARCHAR(255) NOT NULL,
                description LONGTEXT,
                CONSTRAINT fk_project_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
            )
        `);

        await db.execute(`
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
                native_status_local VARCHAR(50),
                CONSTRAINT fk_species_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            )
        `);

        await db.execute(`
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
                health_history JSON,
                CONSTRAINT fk_ind_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                CONSTRAINT fk_ind_species FOREIGN KEY (species_id) REFERENCES species(id) ON DELETE CASCADE
            )
        `);

        await db.execute(`
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
                offspring_ids JSON,
                CONSTRAINT fk_event_species FOREIGN KEY (species_id) REFERENCES species(id) ON DELETE CASCADE
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS breeding_loans (
                id VARCHAR(255) PRIMARY KEY,
                partner_org_id VARCHAR(255),
                proposer_org_id VARCHAR(255),
                role VARCHAR(50),
                start_date VARCHAR(50),
                end_date VARCHAR(50),
                status VARCHAR(50),
                individual_ids JSON,
                terms LONGTEXT,
                notification_recipient_id VARCHAR(255),
                change_request JSON
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS partnerships (
                id VARCHAR(255) PRIMARY KEY,
                org_id_1 VARCHAR(255),
                org_id_2 VARCHAR(255),
                status VARCHAR(50),
                established_date VARCHAR(50)
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS app_config (
                id VARCHAR(255) PRIMARY KEY,
                settings JSON
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS languages (
                code VARCHAR(10) PRIMARY KEY,
                name VARCHAR(255),
                translations JSON,
                is_default BOOLEAN DEFAULT FALSE,
                manual_overrides JSON,
                is_deleted BOOLEAN DEFAULT FALSE
            )
        `);

        await ensureColumn('languages', 'manual_overrides', 'JSON');
        await ensureColumn('languages', 'is_deleted', 'BOOLEAN DEFAULT FALSE');

        await db.execute(`INSERT IGNORE INTO app_config (id, settings) VALUES ('global-settings', '{}')`);
        console.log("Database schema synchronized.");
    } catch (e: any) {
        console.error("CRITICAL: Database Initialization Failed!", e.message);
        process.exit(1);
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

// Global default templates
const DEFAULT_EMAIL_TEMPLATES: Record<string, { subject: string, bodyHtml: string, enabled: boolean }> = {
    registration: { 
        enabled: true, 
        subject: "Verify your OpenStudbook account", 
        bodyHtml: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; background-color: #ffffff;"><div style="background-color: #059669; padding: 32px 24px; text-align: center;"><h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.025em;">OpenStudbook</h1></div><div style="padding: 40px 32px; color: #1e293b;"><h2 style="margin-top: 0; color: #0f172a; font-size: 20px; font-weight: 700;">Welcome! Verify your account</h2><p style="font-size: 16px; line-height: 1.6; color: #475569;">To complete your registration for <strong>{{orgName}}</strong>, please use the following verification code:</p><div style="margin: 32px 0; padding: 24px; background-color: #f0fdf4; border: 2px dashed #059669; border-radius: 12px; text-align: center;"><span style="font-family: 'Courier New', Courier, monospace; font-size: 42px; font-weight: 800; letter-spacing: 8px; color: #065f46;">{{code}}</span></div><p style="font-size: 14px; color: #64748b;">This code will expire in 30 minutes. If you did not request this, please ignore this email.</p></div><div style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #f1f5f9;"><p style="margin: 0; font-size: 12px; color: #94a3b8;">&copy; {{year}} OpenStudbook Project. All rights reserved.</p></div></div>`
    },
    mfa: { 
        enabled: true, 
        subject: "Your OpenStudbook Security Code", 
        bodyHtml: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; background-color: #ffffff;"><div style="background-color: #1e293b; padding: 32px 24px; text-align: center;"><h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.025em;">OpenStudbook</h1></div><div style="padding: 40px 32px; color: #1e293b;"><h2 style="margin-top: 0; color: #0f172a; font-size: 20px; font-weight: 700;">Security Code</h2><p style="font-size: 16px; line-height: 1.6; color: #475569;">Hello, please use the following code to complete your secure sign-in:</p><div style="margin: 32px 0; padding: 24px; background-color: #f8fafc; border: 2px solid #e2e8f0; border-radius: 12px; text-align: center;"><span style="font-family: 'Courier New', Courier, monospace; font-size: 42px; font-weight: 800; letter-spacing: 8px; color: #1e293b;">{{code}}</span></div><p style="font-size: 14px; color: #64748b;">This code is valid for 10 minutes. Do not share this code with anyone.</p></div><div style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #f1f5f9;"><p style="margin: 0; font-size: 12px; color: #94a3b8;">&copy; {{year}} OpenStudbook Project. All rights reserved.</p></div></div>`
    },
    invite: { 
        enabled: true, 
        subject: "Invitation to join {{orgName}} on OpenStudbook", 
        bodyHtml: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; background-color: #ffffff;"><div style="background-color: #059669; padding: 32px 24px; text-align: center;"><h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.025em;">OpenStudbook</h1></div><div style="padding: 40px 32px; color: #1e293b;"><h2 style="margin-top: 0; color: #0f172a; font-size: 20px; font-weight: 700;">You've been invited!</h2><p style="font-size: 16px; line-height: 1.6; color: #475569;">Hello <strong>{{userName}}</strong>,</p><p style="font-size: 16px; line-height: 1.6; color: #475569;">You have been invited to join the management team at <strong>{{orgName}}</strong>.</p><div style="margin: 32px 0; text-align: center;"><a href="{{inviteUrl}}" style="background-color: #059669; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 16px; display: inline-block;">Accept Invitation</a></div><p style="font-size: 14px; color: #64748b;">This invitation expires in 7 days.</p></div><div style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #f1f5f9;"><p style="margin: 0; font-size: 12px; color: #94a3b8;">&copy; {{year}} OpenStudbook Project. All rights reserved.</p></div></div>`
    },
    notification: { 
        enabled: true, 
        subject: "New Notification from OpenStudbook", 
        bodyHtml: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; background-color: #ffffff;"><div style="background-color: #059669; padding: 32px 24px; text-align: center;"><h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.025em;">OpenStudbook</h1></div><div style="padding: 40px 32px; color: #1e293b;"><h2 style="margin-top: 0; color: #0f172a; font-size: 20px; font-weight: 700;">System Activity</h2><p style="font-size: 16px; line-height: 1.6; color: #475569;">{{message}}</p></div><div style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #f1f5f9;"><p style="margin: 0; font-size: 12px; color: #94a3b8;">&copy; {{year}} OpenStudbook Project. All rights reserved.</p></div></div>`
    },
    password_reset: { 
        enabled: true, 
        subject: "OpenStudbook Password Reset", 
        bodyHtml: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; background-color: #ffffff;"><div style="background-color: #0f172a; padding: 32px 24px; text-align: center;"><h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.025em;">OpenStudbook</h1></div><div style="padding: 40px 32px; color: #1e293b;"><h2 style="margin-top: 0; color: #0f172a; font-size: 20px; font-weight: 700;">Password Reset</h2><p style="font-size: 16px; line-height: 1.6; color: #475569;">Hello {{userName}}, please use the code below to reset your password:</p><div style="margin: 32px 0; padding: 24px; background-color: #f1f5f9; border-radius: 12px; text-align: center;"><span style="font-family: 'Courier New', Courier, monospace; font-size: 42px; font-weight: 800; letter-spacing: 8px; color: #0f172a;">{{code}}</span></div><p style="font-size: 14px; color: #64748b;">If you did not request this, please ignore this email.</p></div><div style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #f1f5f9;"><p style="margin: 0; font-size: 12px; color: #94a3b8;">&copy; {{year}} OpenStudbook Project. All rights reserved.</p></div></div>`
    }
};

const getGlobalConfig = async () => {
  const db = getDb();
  try {
    const [rows]: any = await db.execute(`SELECT settings FROM app_config WHERE id = 'global-settings' LIMIT 1`);
    let s = rows?.[0]?.settings || {};
    if (typeof s === 'string') { try { s = JSON.parse(s); } catch (e) { s = {}; } }
    
    // Ensure email templates exist and are merged with defaults
    if (!s.emailTemplates) s.emailTemplates = {};
    Object.keys(DEFAULT_EMAIL_TEMPLATES).forEach(key => {
        if (!s.emailTemplates[key]) {
            s.emailTemplates[key] = { ...DEFAULT_EMAIL_TEMPLATES[key] };
        }
    });

    return s;
  } catch (e) { return { emailTemplates: DEFAULT_EMAIL_TEMPLATES }; }
};

const getTransporter = (s: any) => {
    const host = s.smtpHost || process.env.SMTP_HOST;
    const port = s.smtpPort || Number(process.env.SMTP_PORT) || 587;
    const user = s.smtpUser || process.env.SMTP_USER;
    const pass = s.smtpPass || process.env.SMTP_PASS;
    const secure = s.smtpSecure ?? (process.env.SMTP_SECURE === 'true');
    if (!host || host === '') return null;
    return nodemailer.createTransport({ host, port, secure, auth: (user && pass) ? { user, pass } : undefined });
};

const replacePlaceholders = (text: string, data: Record<string, string>) => {
  let res = text || "";
  Object.keys(data).forEach(key => { res = res.split(`{{${key}}}`).join(String(data[key])); });
  return res;
};

const sendFormattedEmail = async (to: string, templateKey: string, placeholders: Record<string, string>) => {
    const settings = await getGlobalConfig();
    const transporter = getTransporter(settings);
    if (!transporter) {
        console.error("CRITICAL: SMTP Not Configured. Email failed.");
        throw new Error("SMTP Not Configured");
    }

    const template = settings.emailTemplates?.[templateKey] || DEFAULT_EMAIL_TEMPLATES[templateKey];
    const dataWithYear = { ...placeholders, year: new Date().getFullYear().toString() };
    
    let subject = (template?.enabled && template.subject) ? template.subject : (DEFAULT_EMAIL_TEMPLATES[templateKey]?.subject || "");
    let bodyHtml = (template?.enabled && template.bodyHtml) ? template.bodyHtml : (DEFAULT_EMAIL_TEMPLATES[templateKey]?.bodyHtml || "");

    const finalSubject = replacePlaceholders(subject, dataWithYear);
    const finalBody = replacePlaceholders(bodyHtml, dataWithYear);

    return transporter.sendMail({
        from: process.env.SMTP_FROM || '"OpenStudbook" <no-reply@openstudbook.org>',
        to,
        subject: finalSubject,
        html: finalBody
    });
};

// --- PUBLIC ROUTES ---

app.get('/api/config', async (req: any, res: any) => {
   const db = getDb();
   try {
      const [config]: any = await db.execute(`SELECT settings FROM app_config WHERE id = 'global-settings'`);
      const [langs]: any = await db.execute(`SELECT * FROM languages WHERE is_deleted = 0`);
      let settings = config[0]?.settings || {};
      if (typeof settings === 'string') { try { settings = JSON.parse(settings); } catch (e) {} }
      res.json({ success: true, data: { settings, languages: langs } });
   } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/setup-demo', async (req: any, res: any) => {
    const db = getDb();
    try {
        const orgId = 'org-1';
        const hashedPassword = await bcrypt.hash('password', 10);
        
        await db.execute(`INSERT IGNORE INTO organizations (id, name, location, latitude, longitude, is_org_public, is_species_public, obscure_location, hide_name, founded_year, description, focus, allow_breeding_requests, show_native_status, ai_usage_limit) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
            [orgId, 'Sanctuary of the Wild', 'Sabah, Borneo', 4.965, 117.805, true, true, false, false, 1998, 'The global demonstration sanctuary for OpenStudbook.', 'Animals', true, true, 1000]);
            
        const users = [
            ['u-1', orgId, 'Sarah Admin', 'sarah@wild.org', 'Admin', 'Active', hashedPassword],
            ['u-2', orgId, 'Mike Keeper', 'mike@wild.org', 'Keeper', 'Active', hashedPassword],
            ['u-3', orgId, 'Zoe Super', 'zoe@openstudbook.org', 'Super Admin', 'Active', hashedPassword]
        ];
        
        for (const u of users) {
            await db.execute(`INSERT IGNORE INTO users (id, org_id, name, email, role, status, password, allowed_project_ids) VALUES (?, ?, ?, ?, ?, ?, ?, '[]')`, u);
        }

        await db.execute(`INSERT IGNORE INTO projects (id, org_id, name, description) VALUES (?, ?, ?, ?)`, ['p-1', orgId, 'Main Collection', 'General collection management']);

        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// --- AUTH & REGISTRATION ---

app.post('/api/register', async (req: any, res: any) => {
    const { orgName, userName, email, focus, password, lang, latitude, longitude, location } = req.body;
    const cleanEmail = email.toLowerCase().trim();
    const db = getDb();
    try {
        const [existing]: any = await db.execute(`SELECT id FROM users WHERE email = ?`, [cleanEmail]);
        if (existing.length > 0) return res.status(400).json({ error: "Email already registered" });
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        pendingRegistrations.set(cleanEmail, {
            data: { orgName, userName, email: cleanEmail, focus, password, latitude, longitude, location },
            code,
            expires: Date.now() + 1800000
        });
        
        try {
            await sendFormattedEmail(cleanEmail, 'registration', { orgName, code, userName });
        } catch (mailErr: any) { console.error("SMTP Failed", mailErr.message); }

        res.json({ success: true, needsVerification: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/register/verify', async (req: any, res: any) => {
    const { email, code } = req.body;
    const cleanEmail = email.toLowerCase().trim();
    const pending = pendingRegistrations.get(cleanEmail);
    const db = getDb();
    if (!pending || pending.code !== code || pending.expires < Date.now()) return res.status(400).json({ error: "Invalid code" });
    const { orgName, userName, focus, password, latitude, longitude, location } = pending.data;
    const orgId = `org-${Date.now()}`;
    const userId = `u-${Date.now()}`;
    const projectId = `p-default-${Date.now()}`;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.execute(`INSERT INTO organizations (id, name, focus, location, latitude, longitude, founded_year) VALUES (?, ?, ?, ?, ?, ?, ?)`, [orgId, orgName, focus, location || 'Unknown', latitude || null, longitude || null, new Date().getFullYear()]);
        await db.execute(`INSERT INTO users (id, org_id, name, email, role, status, password, allowed_project_ids) VALUES (?, ?, ?, ?, 'Admin', 'Active', ?, '[]')`, [userId, orgId, userName, cleanEmail, hashedPassword]);
        await db.execute(`INSERT INTO projects (id, org_id, name, description) VALUES (?, ?, 'Default', 'Primary organization project')`, [projectId, orgId]);
        pendingRegistrations.delete(cleanEmail);
        const token = jwt.sign({ id: userId, email: cleanEmail, role: 'Admin', orgId }, JWT_SECRET, { expiresIn: '30d' });
        const [u]: any = await db.execute(`SELECT * FROM users WHERE id = ?`, [userId]);
        const [o]: any = await db.execute(`SELECT * FROM organizations WHERE id = ?`, [orgId]);
        res.json({ token, user: u[0], org: o[0] });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/login', async (req: any, res: any) => {
  const { email, password } = req.body;
  const db = getDb();
  try {
    const [users]: any = await db.execute(`SELECT * FROM users WHERE email = ?`, [email?.toLowerCase().trim()]);
    const user = users[0];
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    const passwordValid = await bcrypt.compare(String(password), user.password || '');
    if (!passwordValid) return res.status(401).json({ error: "Invalid credentials" });
    const [orgs]: any = await db.execute(`SELECT * FROM organizations WHERE id = ?`, [user.org_id]);
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, orgId: user.org_id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user, organization: orgs[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- SUPER ADMIN ROUTES ---

app.post('/api/super-admin/organizations', authenticate, async (req: any, res: any) => {
    if (req.user.role !== 'Super Admin') return res.status(403).json({ error: "Unauthorized" });
    const { orgName, adminName, adminEmail, focus, location } = req.body;
    const db = getDb();
    try {
        const orgId = `org-${Date.now()}`;
        const userId = `u-${Date.now()}`;
        const tempPassword = Math.random().toString(36).substring(2, 10);
        const hashedPassword = await bcrypt.hash(tempPassword, 10);
        
        await db.execute(`INSERT INTO organizations (id, name, location, focus, founded_year) VALUES (?, ?, ?, ?, ?)`, [orgId, orgName, location, focus, new Date().getFullYear()]);
        await db.execute(`INSERT INTO users (id, org_id, name, email, role, status, password, allowed_project_ids) VALUES (?, ?, ?, ?, 'Admin', 'Active', ?, '[]')`, [userId, orgId, adminName, adminEmail.toLowerCase().trim(), hashedPassword]);
        
        res.json({ success: true, orgId, tempPassword });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/super-admin/organizations/:id', authenticate, async (req: any, res: any) => {
    if (req.user.role !== 'Super Admin') return res.status(403).json({ error: "Unauthorized" });
    const db = getDb();
    try {
        await db.execute(`DELETE FROM organizations WHERE id = ?`, [req.params.id]);
        res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- EMAIL ROUTE ---

app.post('/api/email/send', authenticate, async (req: any, res: any) => {
    const { to, subject, html, templateKey, placeholders } = req.body;
    try {
        if (templateKey) {
            await sendFormattedEmail(to, templateKey, placeholders || {});
        } else {
            const settings = await getGlobalConfig();
            const transporter = getTransporter(settings);
            if (!transporter) return res.status(500).json({ error: "SMTP not configured" });
            await transporter.sendMail({
                from: process.env.SMTP_FROM || '"OpenStudbook" <no-reply@openstudbook.org>',
                to, subject, html
            });
        }
        res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/email/test', authenticate, async (req: any, res: any) => {
    const { to } = req.body;
    try {
        await sendFormattedEmail(to, 'notification', { message: "OpenStudbook SMTP Connection Test Successful!" });
        res.json({ success: true, message: "Test email sent." });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- PASSWORD RESET ---

app.post('/api/auth/forgot-password', async (req: any, res: any) => {
    const { email } = req.body;
    const cleanEmail = email.toLowerCase().trim();
    const db = getDb();
    try {
        const [users]: any = await db.execute(`SELECT name FROM users WHERE email = ?`, [cleanEmail]);
        if (users.length === 0) return res.status(404).json({ success: false, error: "Email not found." });
        
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        passwordResets.set(cleanEmail, { code, expires: Date.now() + 3600000 });
        
        try {
            await sendFormattedEmail(cleanEmail, 'password_reset', { code, userName: users[0].name });
        } catch (mailErr: any) { console.error("Password reset mail failed", mailErr); }

        res.json({ success: true, message: "A recovery code has been sent to your email." });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/auth/reset-password', async (req: any, res: any) => {
    const { email, code, newPassword } = req.body;
    const cleanEmail = email.toLowerCase().trim();
    const resetData = passwordResets.get(cleanEmail);
    const db = getDb();
    
    if (!resetData || resetData.code !== code || resetData.expires < Date.now()) {
        return res.status(400).json({ success: false, error: "Invalid or expired reset code." });
    }
    
    try {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.execute(`UPDATE users SET password = ? WHERE email = ?`, [hashedPassword, cleanEmail]);
        passwordResets.delete(cleanEmail);
        res.json({ success: true, message: "Password updated successfully." });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// --- USER INVITE ---

app.post('/api/users/invite', authenticate, async (req: any, res: any) => {
    const { name, email, role, allowedProjectIds } = req.body;
    const adminOrgId = (req as any).user.orgId;
    const cleanEmail = email.toLowerCase().trim();
    const db = getDb();
    try {
        if (req.user.role !== 'Admin' && req.user.role !== 'Super Admin') return res.status(403).json({ error: "Unauthorized." });
        const [existing]: any = await db.execute(`SELECT id FROM users WHERE email = ?`, [cleanEmail]);
        if (existing.length > 0) return res.status(400).json({ error: "User already exists." });
        
        const inviteToken = crypto.randomBytes(32).toString('hex');
        const inviteExpires = Date.now() + (7 * 24 * 60 * 60 * 1000); 
        const userId = `u-${Date.now()}`;
        
        await db.execute(`INSERT INTO users (id, org_id, name, email, role, status, allowed_project_ids, invite_token, invite_expires) VALUES (?, ?, ?, ?, ?, 'Invited', ?, ?, ?)`, [userId, adminOrgId, name, cleanEmail, role, JSON.stringify(allowedProjectIds || []), inviteToken, inviteExpires]);
        
        const [orgRows]: any = await db.execute(`SELECT name FROM organizations WHERE id = ?`, [adminOrgId]);
        const orgName = orgRows[0]?.name || 'Your Organization';
        
        const host = req.get('host');
        const protocol = req.protocol;
        const appHost = (host.includes(':3001')) ? host.replace(':3001', ':3000') : host;
        const appUrl = process.env.APP_URL || `${protocol}://${appHost}`;
        const inviteUrl = `${appUrl}/#/accept-invite?token=${inviteToken}`;

        try {
            await sendFormattedEmail(cleanEmail, 'invite', { orgName, userName: name, inviteUrl });
        } catch (mailErr: any) { console.error("Invite mail failed", mailErr); }

        res.json({ success: true, message: "Invitation sent." });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/users/:targetUserId', authenticate, async (req: any, res: any) => {
    const { targetUserId } = req.params;
    const requester = (req as any).user;
    const db = getDb();
    try {
        if (requester.role !== 'Admin' && requester.role !== 'Super Admin') return res.status(403).json({ error: "Unauthorized." });
        const [userRows]: any = await db.execute(`SELECT * FROM users WHERE id = ?`, [targetUserId]);
        const userToDelete = userRows[0];
        if (!userToDelete) return res.status(404).json({ error: "User not found." });
        if (requester.role !== 'Super Admin' && userToDelete.org_id !== requester.orgId) return res.status(403).json({ error: "Unauthorized." });

        const isPending = userToDelete.status === 'Invited';
        const message = isPending 
            ? "Your invitation has been revoked." 
            : "Your account has been disabled.";

        try {
            await sendFormattedEmail(userToDelete.email, 'notification', { message });
        } catch (mailErr: any) { console.warn("Delete notify failed", mailErr); }

        await db.execute(`DELETE FROM users WHERE id = ?`, [targetUserId]);
        res.json({ success: true, message: "User removed." });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users/accept-invite', async (req: any, res: any) => {
    const { token, password } = req.body;
    const db = getDb();
    try {
        const [users]: any = await db.execute(`SELECT * FROM users WHERE invite_token = ? AND invite_expires > ?`, [token, Date.now()]);
        const user = users[0];
        if (!user) return res.status(400).json({ error: "Invalid token." });
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.execute(`UPDATE users SET status = 'Active', password = ?, invite_token = NULL, invite_expires = NULL WHERE id = ?`, [hashedPassword, user.id]);
        const [orgs]: any = await db.execute(`SELECT * FROM organizations WHERE id = ?`, [user.org_id]);
        const authToken = jwt.sign({ id: user.id, email: user.email, role: user.role, orgId: user.org_id }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ success: true, token: authToken, user: { ...user, status: 'Active' }, organization: orgs[0] });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users/check-invite', async (req: any, res: any) => {
    const { token } = req.body;
    const db = getDb();
    try {
        const [rows]: any = await db.execute(`SELECT u.name, u.email, o.name as orgName FROM users u JOIN organizations o ON u.org_id = o.id WHERE u.invite_token = ? AND u.invite_expires > ?`, [token, Date.now()]);
        if (rows.length === 0) return res.status(400).json({ error: "Invalid token" });
        res.json({ success: true, data: rows[0] });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- GENERIC REST ENDPOINT ---

app.post('/rest/v1/:table', authenticate, async (req: any, res: any) => {
    const table = req.params.table;
    if (['app_config', 'languages'].includes(table) && req.user.role !== 'Super Admin') {
        return res.status(403).json({ error: "Forbidden." });
    }

    const data = Array.isArray(req.body) ? req.body : [req.body];
    const db = getDb();
    try {
        for (const item of data) {
            if (item.password && !item.password.startsWith('$2')) {
                item.password = await bcrypt.hash(String(item.password), 10);
            }
            const keys = Object.keys(item);
            const vals = keys.map(k => {
                const v = item[k];
                // CRITICAL FIX: Explicitly handle boolean types to prevent MySQL rejection
                if (typeof v === 'boolean') return v ? 1 : 0;
                if (typeof v === 'number') return v;
                if (typeof v === 'object' && v !== null) return JSON.stringify(v);
                return v ?? null;
            });
            const placeholders = keys.map(() => '?').join(', ');
            const primaryKeyCol = (table === 'languages') ? 'code' : 'id';
            const nonPkKeys = keys.filter(k => k !== primaryKeyCol);
            const escapedTable = `\`${table}\``;
            const escapedKeys = keys.map(k => `\`${k}\``).join(', ');
            let updateClause = nonPkKeys.length > 0 ? "ON DUPLICATE KEY UPDATE " + nonPkKeys.map(k => `\`${k}\` = VALUES(\`${k}\`)`).join(', ') : `ON DUPLICATE KEY UPDATE \`${primaryKeyCol}\` = \`${primaryKeyCol}\``;
            const sql = `INSERT INTO ${escapedTable} (${escapedKeys}) VALUES (${placeholders}) ${updateClause}`;
            await db.query(sql, vals);
        }
        res.json({ success: true });
    } catch (e: any) { 
        console.error(`Generic REST Handler Error [POST /rest/v1/${table}]:`, e.message);
        console.error("SQL Error context:", e);
        res.status(500).json({ error: e.message }); 
    }
});

app.get('/api/sync', authenticate, async (req: any, res: any) => {
   const db = getDb();
   const orgId = (req as any).user.orgId;
   try {
      const [allOrgs]: any = await db.execute(`SELECT * FROM organizations WHERE is_deleted = 0`);
      const [myOrgRows]: any = await db.execute(`SELECT * FROM organizations WHERE id = ? LIMIT 1`, [orgId]);
      const [projects]: any = await db.execute(`SELECT * FROM projects WHERE org_id = ?`, [orgId]);
      const [users]: any = await db.execute(`SELECT * FROM users WHERE org_id = ?`, [orgId]);
      const [species]: any = await db.execute(`SELECT * FROM species WHERE project_id IN (SELECT id FROM projects WHERE org_id = ?)`, [orgId]);
      const [individuals]: any = await db.execute(`SELECT * FROM individuals WHERE project_id IN (SELECT id FROM projects WHERE org_id = ?)`, [orgId]);
      const [events]: any = await db.execute(`SELECT * FROM breeding_events WHERE species_id IN (SELECT id FROM species WHERE project_id IN (SELECT id FROM projects WHERE org_id = ?))`, [orgId]);
      const [loans]: any = await db.execute(`SELECT * FROM breeding_loans WHERE proposer_org_id = ? OR partner_org_id = ?`, [orgId, orgId]);
      const [partnerships]: any = await db.execute(`SELECT * FROM partnerships WHERE org_id_1 = ? OR org_id_2 = ?`, [orgId, orgId]);
      const [config]: any = await db.execute(`SELECT settings FROM app_config WHERE id = 'global-settings'`);
      const [langs]: any = await db.execute(`SELECT * FROM languages WHERE is_deleted = 0`);
      let settings = config[0]?.settings;
      if (typeof settings === 'string') { try { settings = JSON.parse(settings); } catch (e) {} }
      res.json({ success: true, data: { org: myOrgRows[0] || null, partners: allOrgs, projects, users, species, individuals, breedingEvents: events, breedingLoans: loans, partnerships, languages: langs, settings } });
   } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/health', (req: any, res: any) => res.json({ status: 'ok' }));
app.use(express.static(path.join(__dirname, '../../dist')));
app.get('*', (req: any, res: any) => {
   if (req.path.startsWith('/api/') || req.path.startsWith('/rest/')) return res.status(404).json({ error: "Not Found" });
   res.sendFile(path.join(__dirname, '../../dist/index.html'));
});

(async () => { await initDatabase(); app.listen(PORT, () => console.log(`Backend server listening on ${PORT}`)); })();
