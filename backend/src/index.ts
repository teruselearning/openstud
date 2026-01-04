
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import jwt from 'jsonwebtoken';
import morgan from 'morgan';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import path from 'path';
import process from 'process';

declare const __dirname: string;

dotenv.config();

// Error handling for the process
(process as any).on('uncaughtException', (err: any) => {
  console.error('CRITICAL ERROR (Uncaught Exception):', err);
});

(process as any).on('unhandledRejection', (reason: any, promise: any) => {
  console.error('CRITICAL ERROR (Unhandled Rejection):', reason);
});

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

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(morgan('dev'));

// Responsive HTML Wrapper for system emails
const wrapEmail = (title: string, content: string) => `
<div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; background-color: #ffffff;">
  <div style="background-color: #059669; padding: 32px 24px; text-align: center;">
    <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.025em;">OpenStudbook</h1>
  </div>
  <div style="padding: 40px 32px; color: #1e293b;">
    <h2 style="margin-top: 0; color: #0f172a; font-size: 20px; font-weight: 700;">${title}</h2>
    <div style="font-size: 16px; line-height: 1.6; color: #475569;">
      ${content}
    </div>
  </div>
  <div style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #f1f5f9;">
    <p style="margin: 0; font-size: 12px; color: #94a3b8;">&copy; ${new Date().getFullYear()} OpenStudbook Project. All rights reserved.</p>
    <p style="margin: 4px 0 0; font-size: 11px; color: #cbd5e1;">Captive Population Management System</p>
  </div>
</div>
`;

const sendMail = async (to: string, subject: string, html: string, isRaw: boolean = false) => {
    const db = getDb();
    try {
        const [rows]: any = await db.execute(`SELECT settings FROM app_config WHERE id = 'global-settings'`);
        let settings = rows[0]?.settings;
        if (typeof settings === 'string') settings = JSON.parse(settings);
        if (!settings || !settings.smtpHost) return { success: false, error: "SMTP not configured" };
        
        const transporter = nodemailer.createTransport({ 
          host: settings.smtpHost, 
          port: settings.smtpPort || 587, 
          secure: !!settings.smtpSecure, 
          auth: { user: settings.smtpUser, pass: settings.smtpPass },
          tls: { rejectUnauthorized: false }
        });
        
        const finalHtml = isRaw ? html : wrapEmail(subject, html);
        
        await transporter.sendMail({ 
          from: `"OpenStudbook" <noreply@openstudbook.org>`, 
          to, 
          subject, 
          html: finalHtml 
        });
        return { success: true };
    } catch (e: any) { 
        console.error("Email send failed:", e);
        return { success: false, error: e.message }; 
    }
};

const initDatabase = async () => {
    console.log('[DATABASE] Initializing connectivity and schema...');
    try {
        const connection = await mysql.createConnection({ 
            host: dbConfig.host, 
            user: dbConfig.user, 
            password: dbConfig.password, 
            port: dbConfig.port 
        });
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\`;`);
        await connection.end();
        console.log(`[DATABASE] Database check complete: \`${dbConfig.database}\``);
    } catch (e: any) {
        console.error("[DATABASE] Pre-init connection check failed:", e.message);
    }

    const db = getDb();
    try {
        // Table foundations (Core)
        console.log('[DATABASE] Validating table structures...');
        await db.execute(`CREATE TABLE IF NOT EXISTS organizations (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255))`);
        await db.execute(`CREATE TABLE IF NOT EXISTS users (id VARCHAR(255) PRIMARY KEY, org_id VARCHAR(255))`);
        await db.execute(`CREATE TABLE IF NOT EXISTS projects (id VARCHAR(255) PRIMARY KEY, org_id VARCHAR(255), name VARCHAR(255) NOT NULL, description LONGTEXT)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS species (id VARCHAR(255) PRIMARY KEY, project_id VARCHAR(255), common_name VARCHAR(255) NOT NULL, scientific_name VARCHAR(255) NOT NULL, type VARCHAR(50) NOT NULL, plant_classification VARCHAR(50), conservation_status VARCHAR(255), sexual_maturity_age_years DOUBLE, average_adult_weight_kg DOUBLE, life_expectancy_years DOUBLE, breeding_season_start INT, breeding_season_end INT, image_url LONGTEXT, native_status_country VARCHAR(50), native_status_local VARCHAR(50))`);
        await db.execute(`CREATE TABLE IF NOT EXISTS individuals (id VARCHAR(255) PRIMARY KEY, project_id VARCHAR(255), species_id VARCHAR(255), enclosure_id VARCHAR(255), studbook_id VARCHAR(255), name VARCHAR(255) NOT NULL, sex VARCHAR(20) NOT NULL, birth_date VARCHAR(50), weight_kg DOUBLE, sire_id VARCHAR(255), dam_id VARCHAR(255), image_url LONGTEXT, dna_sequence LONGTEXT, notes LONGTEXT, source VARCHAR(255), source_details VARCHAR(255), latitude DOUBLE, longitude DOUBLE, is_deceased TINYINT(1) DEFAULT 0, death_date VARCHAR(50), loan_status VARCHAR(50), transferred_to_org_id VARCHAR(255), transfer_date VARCHAR(50), transfer_note LONGTEXT, weight_history JSON, growth_history JSON, health_history JSON)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS enclosures (id VARCHAR(255) PRIMARY KEY, org_id VARCHAR(255), project_id VARCHAR(255), name VARCHAR(255) NOT NULL, description LONGTEXT, boundary JSON, individual_ids JSON)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS breeding_events (id VARCHAR(255) PRIMARY KEY, species_id VARCHAR(255), sire_id VARCHAR(255), dam_id VARCHAR(255), date VARCHAR(50), offspring_count INT, successful_births INT, losses INT, notes LONGTEXT, offspring_ids JSON)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS breeding_loans (id VARCHAR(255) PRIMARY KEY, partner_org_id VARCHAR(255), proposer_org_id VARCHAR(255), role VARCHAR(50), start_date VARCHAR(50), end_date VARCHAR(50), status VARCHAR(50), individual_ids JSON, terms LONGTEXT, notification_recipient_id VARCHAR(255), change_request JSON)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS partnerships (id VARCHAR(255) PRIMARY KEY, org_id_1 VARCHAR(255), org_id_2 VARCHAR(255), status VARCHAR(50), established_date VARCHAR(50))`);
        await db.execute(`CREATE TABLE IF NOT EXISTS app_config (id VARCHAR(255) PRIMARY KEY, settings JSON)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS languages (code VARCHAR(10) PRIMARY KEY, name VARCHAR(255), translations JSON, is_default TINYINT(1) DEFAULT 0, manual_overrides JSON, is_deleted TINYINT(1) DEFAULT 0)`);
        await db.execute(`INSERT IGNORE INTO app_config (id, settings) VALUES ('global-settings', '{}')`);

        // Migration engine: Ensure every required column exists for sync/auth
        const ensureColumn = async (table: string, column: string, definition: string) => {
            try {
                const [columns]: any = await db.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
                if (columns.length === 0) {
                    console.log(`[DB MIGRATION] Adding column \`${column}\` to table \`${table}\`...`);
                    await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
                }
            } catch (err: any) {
                console.warn(`[DB MIGRATION WARNING] Column check for ${table}.${column}:`, err.message);
            }
        };

        // Table: Users
        await ensureColumn('users', 'name', "VARCHAR(255) NOT NULL DEFAULT ''");
        await ensureColumn('users', 'email', "VARCHAR(255) NOT NULL UNIQUE");
        await ensureColumn('users', 'role', "VARCHAR(50) NOT NULL DEFAULT 'Keeper'");
        await ensureColumn('users', 'status', "VARCHAR(50) NOT NULL DEFAULT 'Active'");
        await ensureColumn('users', 'password', "VARCHAR(255)");
        await ensureColumn('users', 'avatar_url', "LONGTEXT");
        await ensureColumn('users', 'allowed_project_ids', "JSON");
        await ensureColumn('users', 'reset_code', "VARCHAR(10)");
        await ensureColumn('users', 'reset_expires', "BIGINT");
        await ensureColumn('users', 'preferred_language', "VARCHAR(10) DEFAULT 'en-GB'");

        // Table: Organizations
        await ensureColumn('organizations', 'location', "VARCHAR(255)");
        await ensureColumn('organizations', 'latitude', "DOUBLE");
        await ensureColumn('organizations', 'longitude', "DOUBLE");
        await ensureColumn('organizations', 'founded_year', "INT DEFAULT 2024");
        await ensureColumn('organizations', 'description', "LONGTEXT");
        await ensureColumn('organizations', 'focus', "VARCHAR(255) DEFAULT 'Animals'");
        await ensureColumn('organizations', 'is_org_public', "TINYINT(1) DEFAULT 0");
        await ensureColumn('organizations', 'is_species_public', "TINYINT(1) DEFAULT 0");
        await ensureColumn('organizations', 'obscure_location', "TINYINT(1) DEFAULT 0");
        await ensureColumn('organizations', 'hide_name', "TINYINT(1) DEFAULT 0");
        await ensureColumn('organizations', 'allow_breeding_requests', "TINYINT(1) DEFAULT 0");
        await ensureColumn('organizations', 'breeding_request_contact_id', "VARCHAR(255)");
        await ensureColumn('organizations', 'show_native_status', "TINYINT(1) DEFAULT 1");
        await ensureColumn('organizations', 'dashboard_block', "JSON");
        await ensureColumn('organizations', 'ai_usage_limit', "INT DEFAULT 100");
        await ensureColumn('organizations', 'ai_usage_count', "INT DEFAULT 0");
        await ensureColumn('organizations', 'ai_usage_last_reset', "VARCHAR(255)");
        await ensureColumn('organizations', 'enable_mfa', "TINYINT(1) DEFAULT 0");
        await ensureColumn('organizations', 'enable_enclosures', "TINYINT(1) DEFAULT 0");
        await ensureColumn('organizations', 'is_deleted', "TINYINT(1) DEFAULT 0");

        console.log('[DATABASE] All schema migrations finished successfully.');
    } catch (e: any) { 
        console.error("[DATABASE] Critical migration failure:", e);
    }
};

const authenticate = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Unauthorized: No token provided" });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    (req as any).user = decoded;
    next();
  } catch (e) { return res.status(401).json({ error: "Unauthorized: Session expired" }); }
};

// Public Endpoints
app.get('/api/config', async (req: any, res: any) => {
    const db = getDb();
    try {
        const [configRows]: any = await db.execute(`SELECT settings FROM app_config WHERE id = 'global-settings'`);
        const [langRows]: any = await db.execute(`SELECT code, name, translations, is_default, manual_overrides FROM languages WHERE is_deleted = 0`);
        
        let settings = configRows[0]?.settings || {};
        if (typeof settings === 'string') settings = JSON.parse(settings);

        res.json({ 
            success: true, 
            data: { 
                settings, 
                languages: langRows.map((l: any) => ({
                    ...l,
                    translations: typeof l.translations === 'string' ? JSON.parse(l.translations) : l.translations,
                    manual_overrides: typeof l.manual_overrides === 'string' ? JSON.parse(l.manual_overrides) : l.manual_overrides,
                    isDefault: !!l.is_default
                }))
            } 
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/login', async (req: any, res: any) => {
    const { email, password } = req.body;
    const db = getDb();
    try {
        const [rows]: any = await db.execute(`SELECT * FROM users WHERE email = ?`, [email]);
        const user = rows[0];
        if (!user) return res.status(401).json({ error: "Invalid credentials" });

        // Compare using bcrypt
        const isValid = await bcrypt.compare(password, user.password || '').catch(() => false);
        // Fallback for simple plain text if needed during development
        if (!isValid && user.password !== password) return res.status(401).json({ error: "Invalid credentials" });

        const token = jwt.sign({ id: user.id, orgId: user.org_id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        
        const [orgRows]: any = await db.execute(`SELECT * FROM organizations WHERE id = ?`, [user.org_id]);
        
        res.json({ 
            success: true, 
            token, 
            user: {
                id: user.id,
                orgId: user.org_id,
                name: user.name,
                email: user.email,
                role: user.role,
                status: user.status,
                avatarUrl: user.avatar_url,
                preferredLanguage: user.preferred_language,
                allowedProjectIds: typeof user.allowed_project_ids === 'string' ? JSON.parse(user.allowed_project_ids) : user.allowed_project_ids
            },
            organization: orgRows[0]
        });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/register', async (req: any, res: any) => {
    const { orgName, userName, email, focus, location, password } = req.body;
    const db = getDb();
    const orgId = `org-${Date.now()}`;
    const userId = `u-${Date.now()}`;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.execute(
            `INSERT INTO organizations (id, name, location, focus, founded_year) VALUES (?, ?, ?, ?, ?)`,
            [orgId, orgName, location, focus, new Date().getFullYear()]
        );
        
        await db.execute(
            `INSERT INTO users (id, org_id, name, email, role, status, password) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [userId, orgId, userName, email, 'Admin', 'Active', hashedPassword]
        );

        const token = jwt.sign({ id: userId, orgId, role: 'Admin' }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: userId, orgId, name: userName, email, role: 'Admin', status: 'Active' }, organization: { id: orgId, name: orgName, location, focus } });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Protected Sync Endpoints
app.get('/api/sync', authenticate, async (req: any, res: any) => {
    const orgId = req.user.orgId;
    const db = getDb();
    try {
        const [orgs]: any = await db.execute(`SELECT * FROM organizations WHERE id = ?`, [orgId]);
        const [users]: any = await db.execute(`SELECT id, org_id, name, email, role, status, avatar_url, allowed_project_ids, preferred_language FROM users WHERE org_id = ?`, [orgId]);
        const [projects]: any = await db.execute(`SELECT * FROM projects WHERE org_id = ?`, [orgId]);
        const [species]: any = await db.execute(`SELECT s.* FROM species s JOIN projects p ON s.project_id = p.id WHERE p.org_id = ?`, [orgId]);
        const [individuals]: any = await db.execute(`SELECT i.* FROM individuals i JOIN projects p ON i.project_id = p.id WHERE p.org_id = ?`, [orgId]);
        const [enclosures]: any = await db.execute(`SELECT * FROM enclosures WHERE org_id = ?`, [orgId]);
        const [events]: any = await db.execute(`SELECT e.* FROM breeding_events e JOIN species s ON e.species_id = s.id JOIN projects p ON s.project_id = p.id WHERE p.org_id = ?`, [orgId]);
        const [loans]: any = await db.execute(`SELECT * FROM breeding_loans WHERE partner_org_id = ? OR proposer_org_id = ?`, [orgId, orgId]);
        const [partnerships]: any = await db.execute(`SELECT * FROM partnerships WHERE org_id_1 = ? OR org_id_2 = ?`, [orgId, orgId]);
        const [partners]: any = await db.execute(`SELECT * FROM organizations WHERE is_org_public = 1 AND id != ?`, [orgId]);
        
        const [configRows]: any = await db.execute(`SELECT settings FROM app_config WHERE id = 'global-settings'`);
        const [langRows]: any = await db.execute(`SELECT * FROM languages WHERE is_deleted = 0`);

        res.json({
            success: true,
            data: {
                org: orgs[0],
                users,
                projects,
                species,
                individuals,
                enclosures,
                breedingEvents: events,
                breedingLoans: loans,
                partnerships,
                partners,
                settings: configRows[0]?.settings || {},
                languages: langRows
            }
        });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/email/send', authenticate, async (req: any, res: any) => {
    const { to, subject, html, templateKey, placeholders, language } = req.body;
    let finalHtml = html;
    let finalSubject = subject;
    let useRawLayout = false;
    const db = getDb();
    
    if (language && templateKey) {
        const [langRows]: any = await db.execute(`SELECT translations FROM languages WHERE code = ? AND is_deleted = 0`, [language]);
        const translations = langRows[0]?.translations;
        if (translations) {
            const subjKey = `email${templateKey.charAt(0).toUpperCase() + templateKey.slice(1)}Subject`;
            const bodyKey = `email${templateKey.charAt(0).toUpperCase() + templateKey.slice(1)}Body`;
            if (translations[subjKey]) finalSubject = translations[subjKey];
            if (translations[bodyKey]) {
                finalHtml = translations[bodyKey];
                useRawLayout = true; 
            }
        }
    }

    if (!finalHtml || finalHtml === html) {
       const [configRows]: any = await db.execute(`SELECT settings FROM app_config WHERE id = 'global-settings'`);
       let settings = configRows[0]?.settings;
       if (typeof settings === 'string') settings = JSON.parse(settings);
       if (templateKey) {
          const template = settings?.emailTemplates?.[templateKey];
          if (template && template.enabled) {
             finalHtml = template.bodyHtml;
             finalSubject = template.subject;
             useRawLayout = true; 
          }
       }
    }

    if (placeholders) {
       Object.entries(placeholders).forEach(([k, v]) => {
          const placeholder = `{{${k}}}`;
          finalHtml = finalHtml.split(placeholder).join(String(v));
          finalSubject = finalSubject.split(placeholder).join(String(v));
       });
    }

    const result = await sendMail(to, finalSubject, finalHtml, useRawLayout);
    if (result.success) res.json({ success: true });
    else res.status(500).json({ error: result.error });
});

// Serve Frontend
app.use(express.static(path.join(__dirname, '../../dist')));
app.get('*', (req: any, res: any) => {
   if (req.path.startsWith('/api/') || req.path.startsWith('/rest/')) {
       return res.status(404).json({ error: "Endpoint not found" });
   }
   res.sendFile(path.join(__dirname, '../../dist/index.html'));
});

(async () => { 
    await initDatabase(); 
    app.listen(PORT, () => console.log(`Backend server listening on ${PORT}`)); 
})();
