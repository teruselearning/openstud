import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import jwt from 'jsonwebtoken';
import morgan from 'morgan';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import path from 'path';
import process from 'process';
import nodemailer from 'nodemailer';

declare const __dirname: string;

dotenv.config();

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

let pool: mysql.Pool | null = null;

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

const initDatabase = async () => {
    console.log('[DATABASE] Initializing full schema and seeds...');
    try {
        const connection = await mysql.createConnection({ 
            host: dbConfig.host, 
            user: dbConfig.user, 
            password: dbConfig.password, 
            port: dbConfig.port 
        });
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\`;`);
        await connection.end();

        const db = getDb();
        
        // --- Table Definitions ---
        // Changed obscure_location default to 1 (True)
        await db.execute(`CREATE TABLE IF NOT EXISTS organizations (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255), location VARCHAR(255), latitude DOUBLE, longitude DOUBLE, founded_year INT, description LONGTEXT, focus VARCHAR(255), is_org_public TINYINT(1) DEFAULT 0, is_species_public TINYINT(1) DEFAULT 0, obscure_location TINYINT(1) DEFAULT 1, hide_name TINYINT(1) DEFAULT 0, allow_breeding_requests TINYINT(1) DEFAULT 0, breeding_request_contact_id VARCHAR(255), show_native_status TINYINT(1) DEFAULT 1, dashboard_block JSON, enable_mfa TINYINT(1) DEFAULT 0, enable_enclosures TINYINT(1) DEFAULT 0, is_deleted TINYINT(1) DEFAULT 0)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS users (id VARCHAR(255) PRIMARY KEY, org_id VARCHAR(255), name VARCHAR(255), email VARCHAR(255) UNIQUE, role VARCHAR(50), status VARCHAR(50), password VARCHAR(255), avatar_url LONGTEXT, allowed_project_ids JSON, preferred_language VARCHAR(10) DEFAULT 'en-GB', reset_code VARCHAR(10), reset_expires BIGINT)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS projects (id VARCHAR(255) PRIMARY KEY, org_id VARCHAR(255), name VARCHAR(255) NOT NULL, description LONGTEXT)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS species (id VARCHAR(255) PRIMARY KEY, project_id VARCHAR(255), common_name VARCHAR(255) NOT NULL, scientific_name VARCHAR(255) NOT NULL, type VARCHAR(50) NOT NULL, plant_classification VARCHAR(50), conservation_status VARCHAR(255), sexual_maturity_age_years DOUBLE, average_adult_weight_kg DOUBLE, life_expectancy_years DOUBLE, breeding_season_start INT, breeding_season_end INT, image_url LONGTEXT, native_status_country VARCHAR(50), native_status_local VARCHAR(50))`);
        await db.execute(`CREATE TABLE IF NOT EXISTS individuals (id VARCHAR(255) PRIMARY KEY, project_id VARCHAR(255), species_id VARCHAR(255), enclosure_id VARCHAR(255), studbook_id VARCHAR(255), name VARCHAR(255) NOT NULL, sex VARCHAR(20) NOT NULL, birth_date VARCHAR(50), weight_kg DOUBLE, sire_id VARCHAR(255), dam_id VARCHAR(255), image_url LONGTEXT, dna_sequence LONGTEXT, notes LONGTEXT, source VARCHAR(255), source_details VARCHAR(255), latitude DOUBLE, longitude DOUBLE, is_deceased TINYINT(1) DEFAULT 0, death_date VARCHAR(50), loan_status VARCHAR(50), transferred_to_org_id VARCHAR(255), transfer_date VARCHAR(50), transfer_note LONGTEXT, weight_history JSON, growth_history JSON, health_history JSON)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS enclosures (id VARCHAR(255) PRIMARY KEY, org_id VARCHAR(255), project_id VARCHAR(255), name VARCHAR(255) NOT NULL, description LONGTEXT, boundary JSON, individual_ids JSON)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS breeding_events (id VARCHAR(255) PRIMARY KEY, species_id VARCHAR(255), sire_id VARCHAR(255), dam_id VARCHAR(255), date VARCHAR(50), offspring_count INT, successful_births INT, losses INT, notes LONGTEXT, offspring_ids JSON)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS breeding_loans (id VARCHAR(255) PRIMARY KEY, partner_org_id VARCHAR(255), proposer_org_id VARCHAR(255), role VARCHAR(50), start_date VARCHAR(50), end_date VARCHAR(50), status VARCHAR(50), individual_ids JSON, masonry_id VARCHAR(255), notification_recipient_id VARCHAR(255), change_request JSON, terms LONGTEXT)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS partnerships (id VARCHAR(255) PRIMARY KEY, org_id_1 VARCHAR(255), org_id_2 VARCHAR(255), status VARCHAR(50), established_date VARCHAR(50))`);
        await db.execute(`CREATE TABLE IF NOT EXISTS app_config (id VARCHAR(255) PRIMARY KEY, settings JSON)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS languages (code VARCHAR(10) PRIMARY KEY, name VARCHAR(255), translations JSON, is_default TINYINT(1) DEFAULT 0, manual_overrides JSON, is_deleted TINYINT(1) DEFAULT 0)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS verification_codes (email VARCHAR(255) PRIMARY KEY, code VARCHAR(10) NOT NULL, expires_at BIGINT NOT NULL)`);
        
        // --- Seed Data Logic ---
        const [orgs]: any = await db.execute(`SELECT id FROM organizations LIMIT 1`);
        if (orgs.length === 0) {
            console.log('[DATABASE] Seeding multiple organizations...');
            await db.execute(`INSERT INTO organizations (id, name, location, focus, is_org_public, is_species_public, obscure_location) VALUES ('org-1', 'Wild Conservation Soc.', 'Oregon, USA', 'Animals', 1, 1, 0)`);
            await db.execute(`INSERT INTO organizations (id, name, location, focus, is_org_public, is_species_public, obscure_location) VALUES ('org-2', 'Oceanic Research Lab', 'Queensland, AU', 'Animals', 1, 1, 0)`);
            
            const hashed = await bcrypt.hash('password', 10);
            await db.execute(`INSERT INTO users (id, org_id, name, email, role, status, password) VALUES ('u-demo', 'org-1', 'Sarah Jenkins', 'sarah@wild.org', 'Super Admin', 'Active', ?)`, [hashed]);
            
            await db.execute(`INSERT INTO projects (id, org_id, name, description) VALUES ('p-1', 'org-1', 'Highland Sanctuary', 'Main animal collection')`);
            await db.execute(`INSERT INTO projects (id, org_id, name, description) VALUES ('p-2', 'org-2', 'Coral Nursery', 'Marine life restoration')`);
            
            await db.execute(`INSERT INTO species (id, project_id, common_name, scientific_name, type, conservation_status) VALUES ('sp-1', 'p-1', 'Snow Leopard', 'Panthera uncia', 'Animal', 'Vulnerable')`);
            await db.execute(`INSERT INTO species (id, project_id, common_name, scientific_name, type, conservation_status) VALUES ('sp-2', 'p-2', 'Green Sea Turtle', 'Chelonia mydas', 'Animal', 'Endangered')`);
        }

        const [langs]: any = await db.execute(`SELECT code FROM languages LIMIT 1`);
        if (langs.length === 0) {
            console.log('[DATABASE] Seeding core languages...');
            await db.execute(`INSERT INTO languages (code, name, is_default, translations) VALUES ('en-GB', 'English (UK)', 1, ?)`, [JSON.stringify({})]);
            await db.execute(`INSERT INTO languages (code, name, is_default, translations) VALUES ('en-US', 'English (US)', 0, ?)`, [JSON.stringify({})]);
        }
        console.log('[DATABASE] Initialization finished.');
    } catch (e: any) { 
        console.error("[DATABASE] Initialization Error:", e.message);
    }
};

// --- Mail Utilities ---

const sendMailInternal = async (to: string, subject: string, html: string, placeholders: Record<string, string> = {}) => {
    try {
        const db = getDb();
        const [rows]: any = await db.execute(`SELECT settings FROM app_config WHERE id = 'global-settings'`);
        let settings = rows[0]?.settings || {};
        if (typeof settings === 'string') settings = JSON.parse(settings);

        if (!settings.smtpHost || !settings.smtpUser) {
            console.warn("[MAIL] SMTP not configured in app settings. Skipping mail send.");
            return false;
        }

        const transporter = nodemailer.createTransport({
            host: settings.smtpHost,
            port: Number(settings.smtpPort) || 587,
            secure: !!settings.smtpSecure,
            auth: {
                user: settings.smtpUser,
                pass: settings.smtpPass
            }
        });

        let processedSubject = subject;
        let processedHtml = html;

        Object.entries(placeholders).forEach(([key, val]) => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            processedSubject = processedSubject.replace(regex, val);
            processedHtml = processedHtml.replace(regex, val);
        });

        await transporter.sendMail({
            from: `"OpenStudbook" <${settings.smtpUser}>`,
            to,
            subject: processedSubject,
            html: processedHtml
        });
        
        console.log(`[MAIL] Email sent successfully to ${to}`);
        return true;
    } catch (e) {
        console.error("[MAIL] Delivery error:", e);
        throw e;
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

// --- Endpoints ---

app.get('/api/config', async (req: any, res: any) => {
    try {
        const db = getDb();
        const [configRows]: any = await db.execute(`SELECT settings FROM app_config WHERE id = 'global-settings'`);
        const [langRows]: any = await db.execute(`SELECT * FROM languages WHERE is_deleted = 0`);
        let settings = configRows[0]?.settings || {};
        if (typeof settings === 'string') settings = JSON.parse(settings);
        res.json({ success: true, data: { settings, languages: langRows } });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/register/send-code', async (req: any, res: any) => {
    const { email, orgName } = req.body;
    try {
        const db = getDb();
        const cleanEmail = email.toLowerCase().trim();
        const [rows]: any = await db.execute(`SELECT id FROM users WHERE email = ?`, [cleanEmail]);
        if (rows.length > 0) return res.status(400).json({ error: "Email already in use." });

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = Date.now() + (15 * 60 * 1000); // 15 mins

        await db.execute(
            `INSERT INTO verification_codes (email, code, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE code = ?, expires_at = ?`,
            [cleanEmail, code, expires, code, expires]
        );

        console.log(`[EMAIL LOG] Verification code for ${cleanEmail}: ${code}`);
        
        // Fetch Template from settings
        const [configRows]: any = await db.execute(`SELECT settings FROM app_config WHERE id = 'global-settings'`);
        let settings = configRows[0]?.settings || {};
        if (typeof settings === 'string') settings = JSON.parse(settings);
        
        const template = settings.emailTemplates?.registration || {
            subject: "Verify your email - OpenStudbook",
            bodyHtml: `<p>Please use the following verification code for <strong>{{orgName}}</strong>:</p><div style="margin: 24px 0; padding: 20px; background-color: #f0fdf4; border: 2px dashed #059669; border-radius: 12px; text-align: center; font-family: monospace; font-size: 32px; font-weight: 800; color: #065f46; letter-spacing: 4px;">{{code}}</div><p style="font-size: 14px; color: #64748b;">This code will expire shortly. If you did not request this, please ignore this email.</p>`
        };

        try {
            await sendMailInternal(cleanEmail, template.subject, template.bodyHtml, {
                code,
                orgName: orgName || "your new organization",
                year: new Date().getFullYear().toString()
            });
        } catch (mailErr) {
            console.warn("Mail send failed during registration, proceeding with local simulation log only.");
        }

        res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/register', async (req: any, res: any) => {
    const { orgName, userName, email, password, location, focus, latitude, longitude, code } = req.body;
    try {
        const db = getDb();
        const cleanEmail = email.toLowerCase().trim();

        const [codes]: any = await db.execute(`SELECT * FROM verification_codes WHERE email = ? AND code = ?`, [cleanEmail, code]);
        if (codes.length === 0) return res.status(400).json({ error: "Invalid verification code." });
        if (codes[0].expires_at < Date.now()) return res.status(400).json({ error: "Verification code expired." });

        const orgId = `org-${Date.now()}`;
        const userId = `u-${Date.now()}`;
        const projectId = `p-${Date.now()}`;
        const hashedPassword = await bcrypt.hash(password, 10);

        // Explicitly set obscure_location to 1 (true)
        await db.execute(
            `INSERT INTO organizations (id, name, location, focus, is_org_public, latitude, longitude, obscure_location) VALUES (?, ?, ?, ?, 1, ?, ?, 1)`,
            [orgId, orgName, location || '', focus || 'Animals', latitude || null, longitude || null]
        );
        await db.execute(
            `INSERT INTO users (id, org_id, name, email, role, status, password) VALUES (?, ?, ?, ?, 'Admin', 'Active', ?)`,
            [userId, orgId, userName, cleanEmail, hashedPassword]
        );
        await db.execute(
            `INSERT INTO projects (id, org_id, name, description) VALUES (?, ?, 'General Collection', 'Default project created during registration.')`,
            [projectId, orgId]
        );
        
        await db.execute(`DELETE FROM verification_codes WHERE email = ?`, [cleanEmail]);

        const token = jwt.sign({ id: userId, orgId, role: 'Admin' }, JWT_SECRET, { expiresIn: '7d' });
        const [userRows]: any = await db.execute(`SELECT * FROM users WHERE id = ?`, [userId]);
        const [orgRows]: any = await db.execute(`SELECT * FROM organizations WHERE id = ?`, [orgId]);

        res.json({ 
            success: true, 
            token, 
            user: { ...userRows[0], orgId: userRows[0].org_id, avatarUrl: userRows[0].avatar_url, allowedProjectIds: [] },
            organization: orgRows[0]
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/login', async (req: any, res: any) => {
    const { email, password } = req.body;
    try {
        const db = getDb();
        const [rows]: any = await db.execute(`SELECT * FROM users WHERE email = ?`, [email.toLowerCase().trim()]);
        const user = rows[0];
        if (!user) return res.status(401).json({ error: "Invalid credentials" });
        const isValid = await bcrypt.compare(password, user.password || '').catch(() => false);
        if (!isValid) return res.status(401).json({ error: "Invalid credentials" });
        
        const token = jwt.sign({ id: user.id, orgId: user.org_id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        const [orgRows]: any = await db.execute(`SELECT * FROM organizations WHERE id = ?`, [user.org_id]);
        
        res.json({ 
            success: true, 
            token, 
            user: { ...user, orgId: user.org_id, avatarUrl: user.avatar_url, allowedProjectIds: typeof user.allowed_project_ids === 'string' ? JSON.parse(user.allowed_project_ids) : (user.allowed_project_ids || []) }, 
            organization: orgRows[0] 
        });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/sync', authenticate, async (req: any, res: any) => {
    const orgId = req.user.orgId;
    const role = req.user.role;
    const isSuper = role === 'Super Admin';
    try {
        const db = getDb();
        let orgRows, partnersRows, projectsRows, usersRows, speciesRows, individualsRows, languagesRows, configRows;

        if (isSuper) {
            [orgRows] = await db.execute(`SELECT * FROM organizations WHERE id = ?`, [orgId]);
            [partnersRows] = await db.execute(`SELECT * FROM organizations WHERE id != ?`);
            [projectsRows] = await db.execute(`SELECT * FROM projects`);
            [usersRows] = await db.execute(`SELECT id, org_id, name, email, role, status, avatar_url, allowed_project_ids FROM users`);
            [speciesRows] = await db.execute(`SELECT * FROM species`);
            [individualsRows] = await db.execute(`SELECT * FROM individuals`);
        } else {
            [orgRows] = await db.execute(`SELECT * FROM organizations WHERE id = ?`, [orgId]);
            [partnersRows] = await db.execute(`SELECT * FROM organizations WHERE id != ? AND is_org_public = 1`);
            [projectsRows] = await db.execute(`SELECT * FROM projects WHERE org_id = ?`, [orgId]);
            [usersRows] = await db.execute(`SELECT id, org_id, name, email, role, status, avatar_url, allowed_project_ids FROM users WHERE org_id = ?`, [orgId]);
            [speciesRows] = await db.execute(`SELECT s.* FROM species s JOIN projects p ON s.project_id = p.id WHERE p.org_id = ?`, [orgId]);
            [individualsRows] = await db.execute(`SELECT i.* FROM individuals i JOIN projects p ON i.project_id = p.id WHERE p.org_id = ?`, [orgId]);
        }
        
        [languagesRows] = await db.execute(`SELECT * FROM languages WHERE is_deleted = 0`);
        [configRows] = await db.execute(`SELECT settings FROM app_config WHERE id = 'global-settings'`);
        let settings = configRows[0]?.settings || {};

        res.json({ 
            success: true, 
            data: { 
                org: orgRows[0], 
                partners: partnersRows, 
                projects: projectsRows, 
                users: usersRows, 
                species: speciesRows, 
                individuals: individualsRows, 
                languages: languagesRows, 
                settings 
            } 
        });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/email/send', authenticate, async (req: any, res: any) => {
    const { to, subject, html, placeholders } = req.body;
    try {
        await sendMailInternal(to, subject, html, placeholders);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/email/test', authenticate, async (req: any, res: any) => {
    const { to } = req.body;
    try {
        await sendMailInternal(to, "SMTP Configuration Test", "<p>Congratulations! Your OpenStudbook SMTP configuration is working correctly.</p>");
        res.json({ success: true, message: "SMTP test OK" });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/forgot-password', async (req: any, res: any) => {
    const { email } = req.body;
    try {
        const db = getDb();
        const [rows]: any = await db.execute(`SELECT id FROM users WHERE email = ?`, [email]);
        if (rows.length === 0) return res.json({ success: true, message: "If account exists, code sent." });
        
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = Date.now() + (60 * 60 * 1000); // 1 hour
        
        await db.execute(`UPDATE users SET reset_code = ?, reset_expires = ? WHERE email = ?`, [code, expires, email]);
        
        await sendMailInternal(email, "Password Reset Code", "<p>Your password reset code is: <strong>{{code}}</strong></p>", { code });
        
        res.json({ success: true, message: "If account exists, code sent." });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/reset-password', async (req: any, res: any) => {
    const { email, code, newPassword } = req.body;
    try {
        const db = getDb();
        const [rows]: any = await db.execute(`SELECT * FROM users WHERE email = ? AND reset_code = ?`, [email, code]);
        if (rows.length === 0) return res.status(400).json({ error: "Invalid code" });
        if (rows[0].reset_expires < Date.now()) return res.status(400).json({ error: "Code expired" });
        
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.execute(`UPDATE users SET password = ?, reset_code = NULL, reset_expires = NULL WHERE email = ?`, [hashedPassword, email]);
        
        res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Generic generic REST DELETE to handle organizations, users, projects etc. 
// Added explicit REST route support to avoid 404s on generic table deletions
app.delete('/rest/v1/:table', authenticate, async (req: any, res: any) => {
    const { table } = req.params;
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "Missing id parameter" });
    
    try {
        const db = getDb();
        const allowedTables = ['organizations', 'users', 'projects', 'species', 'individuals', 'enclosures', 'languages', 'breeding_events', 'breeding_loans', 'partnerships'];
        if (!allowedTables.includes(table)) return res.status(400).json({ error: "Invalid table" });
        
        await db.execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.use(express.static(path.join(__dirname, '../../dist')));
app.get('*', (req: any, res: any) => {
   if (req.path.startsWith('/api/')) return res.status(404).json({ error: "API route not found" });
   res.sendFile(path.join(__dirname, '../../dist/index.html'));
});

(async () => { 
  await initDatabase(); 
  app.listen(PORT, () => console.log(`Backend server listening on ${PORT}`)); 
})();
