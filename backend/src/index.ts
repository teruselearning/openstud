
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

// Database Connection Configuration
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
const JWT_SECRET = process.env.JWT_SECRET || 'openstudbook-stable-dev-secret-2024';

console.log(`[AUTH] JWT Secret initialized (hash prefix): ${crypto.createHash('sha256').update(JWT_SECRET).digest('hex').substring(0, 8)}`);

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(morgan('dev'));

/**
 * EMAIL UTILITY
 * Fetches SMTP config from DB and sends email
 */
const sendMail = async (to: string, subject: string, html: string) => {
    const db = getDb();
    try {
        const [rows]: any = await db.execute(`SELECT settings FROM app_config WHERE id = 'global-settings'`);
        let settings = rows[0]?.settings;
        if (typeof settings === 'string') settings = JSON.parse(settings);
        
        if (!settings || !settings.smtpHost) {
            console.warn(`[MAILER] SMTP not configured. Code for ${to} is logged only.`);
            console.log(`[MAILER] SUBJECT: ${subject}`);
            console.log(`[MAILER] CONTENT: ${html.replace(/<[^>]*>/g, '')}`); // Log text version
            return { success: false, error: "SMTP not configured" };
        }

        const transporter = nodemailer.createTransport({
            host: settings.smtpHost,
            port: settings.smtpPort || 587,
            secure: !!settings.smtpSecure,
            auth: {
                user: settings.smtpUser,
                pass: settings.smtpPass,
            },
        });

        await transporter.sendMail({
            from: `"OpenStudbook" <${settings.smtpUser}>`,
            to,
            subject,
            html,
        });

        console.log(`[MAILER] Email successfully sent to ${to}`);
        return { success: true };
    } catch (e: any) {
        console.error(`[MAILER ERROR] Failed to send to ${to}:`, e.message);
        return { success: false, error: e.message };
    }
};

/**
 * AUTO-INITIALIZE DATABASE & MIGRATE COLUMNS
 */
const initDatabase = async () => {
    console.log("Starting Database Initialization...");
    try {
        const connection = await mysql.createConnection({
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password,
            port: dbConfig.port
        });
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\`;`);
        await connection.end();
        console.log(`Ensured database '${dbConfig.database}' exists.`);
    } catch (e: any) {
        console.warn("Database creation check skipped or failed:", e.message);
    }

    const db = getDb();
    try {
        await db.query('SELECT 1');
        
        // Organizations table
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
                is_org_public TINYINT(1) DEFAULT 0,
                is_species_public TINYINT(1) DEFAULT 0,
                obscure_location TINYINT(1) DEFAULT 0,
                hide_name TINYINT(1) DEFAULT 0,
                allow_breeding_requests TINYINT(1) DEFAULT 0,
                breeding_request_contact_id VARCHAR(255),
                show_native_status TINYINT(1) DEFAULT 1,
                dashboard_block JSON,
                ai_usage_limit INT DEFAULT 100,
                ai_usage_count INT DEFAULT 0,
                ai_usage_last_reset VARCHAR(255),
                enable_mfa TINYINT(1) DEFAULT 0,
                enable_enclosures TINYINT(1) DEFAULT 0,
                is_deleted TINYINT(1) DEFAULT 0
            )
        `);

        // Users table
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
                reset_code VARCHAR(10),
                reset_expires BIGINT,
                CONSTRAINT fk_user_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
            )
        `);

        // Other tables
        await db.execute(`CREATE TABLE IF NOT EXISTS projects (id VARCHAR(255) PRIMARY KEY, org_id VARCHAR(255), name VARCHAR(255) NOT NULL, description LONGTEXT, CONSTRAINT fk_project_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS species (id VARCHAR(255) PRIMARY KEY, project_id VARCHAR(255), common_name VARCHAR(255) NOT NULL, scientific_name VARCHAR(255) NOT NULL, type VARCHAR(50) NOT NULL, plant_classification VARCHAR(50), conservation_status VARCHAR(255), sexual_maturity_age_years DOUBLE, average_adult_weight_kg DOUBLE, life_expectancy_years DOUBLE, breeding_season_start INT, breeding_season_end INT, image_url LONGTEXT, native_status_country VARCHAR(50), native_status_local VARCHAR(50), CONSTRAINT fk_species_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS individuals (id VARCHAR(255) PRIMARY KEY, project_id VARCHAR(255), species_id VARCHAR(255), enclosure_id VARCHAR(255), studbook_id VARCHAR(255), name VARCHAR(255) NOT NULL, sex VARCHAR(20) NOT NULL, birth_date VARCHAR(50), weight_kg DOUBLE, sire_id VARCHAR(255), dam_id VARCHAR(255), image_url LONGTEXT, dna_sequence LONGTEXT, notes LONGTEXT, source VARCHAR(255), source_details VARCHAR(255), latitude DOUBLE, longitude DOUBLE, is_deceased TINYINT(1) DEFAULT 0, death_date VARCHAR(50), loan_status VARCHAR(50), transferred_to_org_id VARCHAR(255), transfer_date VARCHAR(50), transfer_note LONGTEXT, weight_history JSON, growth_history JSON, health_history JSON, CONSTRAINT fk_ind_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE, CONSTRAINT fk_ind_species FOREIGN KEY (species_id) REFERENCES species(id) ON DELETE CASCADE)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS enclosures (id VARCHAR(255) PRIMARY KEY, org_id VARCHAR(255), name VARCHAR(255) NOT NULL, description LONGTEXT, boundary JSON, individual_ids JSON, CONSTRAINT fk_enclosure_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS breeding_events (id VARCHAR(255) PRIMARY KEY, species_id VARCHAR(255), sire_id VARCHAR(255), dam_id VARCHAR(255), date VARCHAR(50), offspring_count INT, successful_births INT, losses INT, notes LONGTEXT, offspring_ids JSON, CONSTRAINT fk_event_species FOREIGN KEY (species_id) REFERENCES species(id) ON DELETE CASCADE)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS breeding_loans (id VARCHAR(255) PRIMARY KEY, partner_org_id VARCHAR(255), proposer_org_id VARCHAR(255), role VARCHAR(50), start_date VARCHAR(50), end_date VARCHAR(50), status VARCHAR(50), individual_ids JSON, terms LONGTEXT, notification_recipient_id VARCHAR(255), change_request JSON)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS partnerships (id VARCHAR(255) PRIMARY KEY, org_id_1 VARCHAR(255), org_id_2 VARCHAR(255), status VARCHAR(50), established_date VARCHAR(50))`);
        await db.execute(`CREATE TABLE IF NOT EXISTS app_config (id VARCHAR(255) PRIMARY KEY, settings JSON)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS languages (code VARCHAR(10) PRIMARY KEY, name VARCHAR(255), translations JSON, is_default TINYINT(1) DEFAULT 0, manual_overrides JSON, is_deleted TINYINT(1) DEFAULT 0)`);

        await db.execute(`INSERT IGNORE INTO app_config (id, settings) VALUES ('global-settings', '{}')`);
        
        // --- Migration: Ensure reset columns exist if table was already created ---
        try {
            await db.execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_code VARCHAR(10)`);
            await db.execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires BIGINT`);
        } catch(e) {}

        // --- SEEDING: Demo User & Org (Ensure Sarah is present) ---
        const [sarahRows]: any = await db.execute('SELECT id FROM users WHERE email = ?', ['sarah@wild.org']);
        if (sarahRows.length === 0) {
           console.log("[SEED] Provisioning demo environment for Sarah Keeper...");
           const orgId = 'org-1';
           await db.execute(`INSERT IGNORE INTO organizations (id, name, location, focus) VALUES (?, ?, ?, ?)`, [orgId, 'Wilderness Trust', 'Global Sanctuary', 'Animals']);
           await db.execute(`INSERT IGNORE INTO projects (id, org_id, name, description) VALUES (?, ?, ?, ?)`, ['p-1', orgId, 'General Collection', 'Initial project for demo.']);
           const hashedPassword = await bcrypt.hash('password', 10);
           await db.execute(`INSERT INTO users (id, org_id, name, email, role, status, password) VALUES (?, ?, ?, ?, ?, ?, ?)`, 
             ['u-1', orgId, 'Sarah Keeper', 'sarah@wild.org', 'Admin', 'Active', hashedPassword]);
           console.log("[SEED] Demo user and organization created successfully.");
        }

        console.log("Database schema synchronized and migrations complete.");
    } catch (e: any) {
        console.error("CRITICAL: Database Initialization Failed!", e.message);
        process.exit(1);
    }
};

/**
 * TOKEN VERIFICATION MIDDLEWARE
 */
const authenticate = (req: any, res: any, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Unauthorized: No token provided" });

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: "Unauthorized: Malformed token" });

  const token = parts[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    (req as any).user = decoded;
    next();
  } catch (e: any) {
    return res.status(401).json({ error: "Session expired. Please log in again." });
  }
};

// --- API ROUTES ---

app.post('/api/login', async (req: any, res: any) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required." });
    
    const normalizedEmail = email.toLowerCase().trim();
    const db = getDb();
    
    try {
        const [rows]: any = await db.execute('SELECT * FROM users WHERE email = ? LIMIT 1', [normalizedEmail]);
        const user = rows[0];
        
        if (!user) {
           console.warn(`[AUTH] Login failed for ${normalizedEmail}: Account not found.`);
           return res.status(401).json({ error: "Account not found." });
        }

        const isMatch = await bcrypt.compare(password, user.password).catch(() => user.password === password);
        if (!isMatch) {
           console.warn(`[AUTH] Login failed for ${normalizedEmail}: Password mismatch.`);
           return res.status(401).json({ error: "Invalid password." });
        }

        const [orgRows]: any = await db.execute('SELECT * FROM organizations WHERE id = ? LIMIT 1', [user.org_id]);
        const token = jwt.sign({ id: user.id, orgId: user.org_id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

        console.log(`[AUTH] Login successful for: ${normalizedEmail}`);
        res.json({ token, user, organization: orgRows[0] });
    } catch (e: any) { 
        console.error(`[AUTH ERROR]`, e);
        res.status(500).json({ error: "Server error during login." }); 
    }
});

app.post('/api/register', async (req: any, res: any) => {
    const { orgName, userName, email, focus, password, latitude, longitude, location } = req.body;
    if (!orgName || !userName || !email || !password) return res.status(400).json({ error: "Missing required fields." });

    const normalizedEmail = email.toLowerCase().trim();
    const db = getDb();
    
    try {
        const [existing]: any = await db.execute('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
        if (existing.length > 0) return res.status(400).json({ error: "Email already in use." });

        const orgId = `org-${Date.now()}`;
        const userId = `u-${Date.now()}`;
        const hashedPassword = await bcrypt.hash(password, 10);

        await db.execute(
            `INSERT INTO organizations (id, name, location, latitude, longitude, focus, founded_year, is_org_public, is_species_public, allow_breeding_requests) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 1)`,
            [orgId, orgName, location || '', latitude || null, longitude || null, focus || 'Animals', new Date().getFullYear()]
        );

        await db.execute(
            `INSERT INTO users (id, org_id, name, email, role, status, password) VALUES (?, ?, ?, ?, 'Admin', 'Active', ?)`,
            [userId, orgId, userName, normalizedEmail, hashedPassword]
        );

        const token = jwt.sign({ id: userId, orgId, role: 'Admin' }, JWT_SECRET, { expiresIn: '7d' });
        const [userRows]: any = await db.execute('SELECT * FROM users WHERE id = ?', [userId]);
        const [orgRows]: any = await db.execute('SELECT * FROM organizations WHERE id = ?', [orgId]);

        res.json({ success: true, token, user: userRows[0], organization: orgRows[0] });
    } catch (e: any) {
        console.error(`[REGISTER ERROR]`, e);
        res.status(500).json({ error: e.message || "Registration failed." });
    }
});

app.post('/api/forgot-password', async (req: any, res: any) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required." });
    const normalizedEmail = email.toLowerCase().trim();
    const db = getDb();
    try {
        const [rows]: any = await db.execute('SELECT id, name FROM users WHERE email = ?', [normalizedEmail]);
        if (rows.length === 0) return res.json({ success: true, message: "If account exists, code sent." });

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = Date.now() + (30 * 60 * 1000); // 30 mins

        await db.execute('UPDATE users SET reset_code = ?, reset_expires = ? WHERE email = ?', [code, expires, normalizedEmail]);
        
        // Attempt real mail
        await sendMail(normalizedEmail, "Password Reset Code", `Hello ${rows[0].name}, your reset code is: ${code}`);

        console.log(`[AUTH] Password reset code for ${normalizedEmail}: ${code}`);
        res.json({ success: true, message: "Reset code sent." });
    } catch (e: any) {
        res.status(500).json({ error: "Failed to process forgot password request." });
    }
});

app.post('/api/reset-password', async (req: any, res: any) => {
    const { email, code, newPassword } = req.body;
    const normalizedEmail = email.toLowerCase().trim();
    const db = getDb();
    try {
        const [rows]: any = await db.execute('SELECT reset_code, reset_expires FROM users WHERE email = ?', [normalizedEmail]);
        const user = rows[0];

        if (!user || user.reset_code !== code || Date.now() > user.reset_expires) {
            return res.status(400).json({ error: "Invalid or expired reset code." });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.execute('UPDATE users SET password = ?, reset_code = NULL, reset_expires = NULL WHERE email = ?', [hashedPassword, normalizedEmail]);

        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: "Failed to reset password." });
    }
});

app.post('/api/email/send', async (req: any, res: any) => {
    const { to, templateKey, placeholders, subject, html } = req.body;
    const db = getDb();
    try {
        // Fetch templates from DB to apply placeholders if requested via templateKey
        let finalSubject = subject;
        let finalHtml = html;

        if (templateKey) {
            const [rows]: any = await db.execute(`SELECT settings FROM app_config WHERE id = 'global-settings'`);
            let settings = rows[0]?.settings;
            if (typeof settings === 'string') settings = JSON.parse(settings);
            
            const template = settings?.emailTemplates?.[templateKey];
            if (template && template.enabled) {
                finalSubject = template.subject;
                finalHtml = template.bodyHtml;
                // Replace placeholders
                if (placeholders) {
                    Object.entries(placeholders).forEach(([k, v]) => {
                        finalSubject = finalSubject.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
                        finalHtml = finalHtml.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
                    });
                }
            }
        }

        const mailResult = await sendMail(to, finalSubject, finalHtml);
        if (mailResult.success) {
            res.json({ success: true, message: "Email sent." });
        } else {
            res.status(500).json({ error: mailResult.error });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/email/test', authenticate, async (req: any, res: any) => {
    const { to } = req.body;
    const result = await sendMail(to, "SMTP Test Connection", "<p>Your OpenStudbook SMTP configuration is working correctly!</p>");
    if (result.success) res.json({ success: true, message: "Test email sent." });
    else res.status(500).json({ error: result.error });
});

app.get('/api/config', async (req: any, res: any) => {
   const db = getDb();
   try {
      const [config]: any = await db.execute(`SELECT settings FROM app_config WHERE id = 'global-settings'`);
      const [langs]: any = await db.execute(`SELECT * FROM languages WHERE is_deleted = 0`);
      let settings = config[0]?.settings;
      if (typeof settings === 'string') { try { settings = JSON.parse(settings); } catch (e) {} }
      res.json({ success: true, data: { settings: settings || {}, languages: langs || [] } });
   } catch (e: any) {
      res.status(500).json({ error: e.message });
   }
});

app.get('/api/sync', authenticate, async (req: any, res: any) => {
   const db = getDb();
   const orgId = (req as any).user.orgId;
   const isSuper = (req as any).user.role === 'Super Admin';
   try {
      const [allOrgs]: any = await db.execute(`SELECT * FROM organizations WHERE is_deleted = 0`);
      const [myOrgRows]: any = await db.execute(`SELECT * FROM organizations WHERE id = ? LIMIT 1`, [orgId]);
      const [projects]: any = isSuper ? await db.execute(`SELECT * FROM projects`) : await db.execute(`SELECT * FROM projects WHERE org_id = ?`, [orgId]);
      const [users]: any = isSuper ? await db.execute(`SELECT * FROM users`) : await db.execute(`SELECT * FROM users WHERE org_id = ?`, [orgId]);
      const [species]: any = isSuper ? await db.execute(`SELECT * FROM species`) : await db.execute(`SELECT * FROM species WHERE project_id IN (SELECT id FROM projects WHERE org_id = ?)`, [orgId]);
      const [individuals]: any = isSuper ? await db.execute(`SELECT * FROM individuals`) : await db.execute(`SELECT * FROM individuals WHERE project_id IN (SELECT id FROM projects WHERE org_id = ?)`, [orgId]);
      const [enclosures]: any = isSuper ? await db.execute(`SELECT * FROM enclosures`) : await db.execute(`SELECT * FROM enclosures WHERE org_id = ?`, [orgId]);
      const [breedingEvents]: any = isSuper ? await db.execute(`SELECT * FROM breeding_events`) : await db.execute(`SELECT * FROM breeding_events WHERE species_id IN (SELECT id FROM species WHERE project_id IN (SELECT id FROM projects WHERE org_id = ?))`, [orgId]);
      const [breedingLoans]: any = isSuper ? await db.execute(`SELECT * FROM breeding_loans`) : await db.execute(`SELECT * FROM breeding_loans WHERE proposer_org_id = ? OR partner_org_id = ?`, [orgId, orgId]);
      const [partnerships]: any = isSuper ? await db.execute(`SELECT * FROM partnerships`) : await db.execute(`SELECT * FROM partnerships WHERE org_id_1 = ? OR org_id_2 = ?`, [orgId, orgId]);
      const [config]: any = await db.execute(`SELECT settings FROM app_config WHERE id = 'global-settings'`);
      const [langs]: any = await db.execute(`SELECT * FROM languages WHERE is_deleted = 0`);
      let settings = config[0]?.settings;
      if (typeof settings === 'string') { try { settings = JSON.parse(settings); } catch (e) {} }
      res.json({ success: true, data: { org: myOrgRows[0] || null, partners: allOrgs, projects, users, species, individuals, enclosures, breedingEvents, breedingLoans, partnerships, languages: langs, settings } });
   } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/health', (req: any, res: any) => res.json({ status: 'ok' }));

app.use(express.static(path.join(__dirname, '../../dist')));
app.get('*', (req: any, res: any) => {
   if (req.path.startsWith('/api/') || req.path.startsWith('/rest/')) return res.status(404).json({ error: "Not Found" });
   res.sendFile(path.join(__dirname, '../../dist/index.html'));
});

(async () => { 
    await initDatabase(); 
    app.listen(PORT, () => console.log(`Backend server listening on ${PORT}`)); 
})();
