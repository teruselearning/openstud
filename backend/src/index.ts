
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

        // Migration check for existing databases
        try {
            await db.execute('ALTER TABLE organizations ADD COLUMN enable_mfa BOOLEAN DEFAULT FALSE');
        } catch(e) {}

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

        // Migration check for users table invite columns
        try {
            await db.execute('ALTER TABLE users ADD COLUMN invite_token VARCHAR(255)');
            await db.execute('ALTER TABLE users ADD COLUMN invite_expires BIGINT');
        } catch(e) {}

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
                CONSTRAINT fk_ind_species KEY (species_id) REFERENCES species(id) ON DELETE CASCADE
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

        await db.execute(`INSERT IGNORE INTO app_config (id, settings) VALUES ('global-settings', '{}')`);
        console.log("Database tables ready.");
    } catch (e: any) {
        console.error("Critical: Database Schema Init Failed!", e.message);
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

const restrictToSuperAdmin = (req: any, res: any, next: express.NextFunction) => {
    if (req.user && (req.user.role === 'Super Admin' || req.user.role === 'SUPER_ADMIN')) {
        next();
    } else {
        res.status(403).json({ error: "Super Admin privileges required" });
    }
};

const getGlobalConfig = async () => {
  const db = getDb();
  try {
    const [rows]: any = await db.execute(`SELECT settings FROM app_config WHERE id = 'global-settings' LIMIT 1`);
    let s = rows?.[0]?.settings || {};
    if (typeof s === 'string') { try { s = JSON.parse(s); } catch (e) { s = {}; } }
    return s;
  } catch (e) { return {}; }
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

// --- PUBLIC ROUTES ---

/**
 * Public endpoint for landing page settings and branding
 */
app.get('/api/config', async (req: any, res: any) => {
   const db = getDb();
   try {
      const [config]: any = await db.execute(`SELECT settings FROM app_config WHERE id = 'global-settings'`);
      const [langs]: any = await db.execute(`SELECT * FROM languages WHERE is_deleted = 0`);
      
      let settings = config[0]?.settings || {};
      if (typeof settings === 'string') { try { settings = JSON.parse(settings); } catch (e) {} }
      
      res.json({ 
         success: true, 
         data: { 
            settings,
            languages: langs 
         } 
      });
   } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- AUTH ROUTES ---

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

        const settings = await getGlobalConfig();
        const transporter = getTransporter(settings);
        
        if (transporter) {
            try {
                const template = settings.emailTemplates?.registration;
                const placeholders = { orgName, code, userName, year: new Date().getFullYear().toString() };
                const subject = (template?.enabled && template.subject) 
                  ? replacePlaceholders(template.subject, placeholders)
                  : "Verify your OpenStudbook account";
                const bodyHtml = (template?.enabled && template.bodyHtml)
                  ? replacePlaceholders(template.bodyHtml, placeholders)
                  : `<p>Your code for <strong>${orgName}</strong> is: <strong>${code}</strong></p>`;

                await transporter.sendMail({
                    from: process.env.SMTP_FROM || '"OpenStudbook" <no-reply@openstudbook.org>',
                    to: cleanEmail,
                    subject,
                    html: bodyHtml
                });
            } catch (mailErr: any) { console.error("SMTP Failed", mailErr.message); }
        }
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
        await db.execute(`
           INSERT INTO organizations (id, name, focus, location, latitude, longitude, founded_year) 
           VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [orgId, orgName, focus, location || 'Unknown', latitude || null, longitude || null, new Date().getFullYear()]);
        
        await db.execute(`
           INSERT INTO users (id, org_id, name, email, role, status, password, allowed_project_ids) 
           VALUES (?, ?, ?, ?, 'Admin', 'Active', ?, '[]')
        `, [userId, orgId, userName, cleanEmail, hashedPassword]);

        await db.execute(`
           INSERT INTO projects (id, org_id, name, description) 
           VALUES (?, ?, 'Default', 'Primary organization project')
        `, [projectId, orgId]);

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

// --- USER INVITE WORKFLOW ---

app.post('/api/users/invite', authenticate, async (req: any, res: any) => {
    const { name, email, role, allowedProjectIds } = req.body;
    const adminOrgId = (req as any).user.orgId;
    const cleanEmail = email.toLowerCase().trim();
    const db = getDb();

    try {
        // Check permissions: only Admins of the same org or Super Admins
        if (req.user.role !== 'Admin' && req.user.role !== 'Super Admin') {
            return res.status(403).json({ error: "Unauthorized to invite users." });
        }

        const [existing]: any = await db.execute(`SELECT id FROM users WHERE email = ?`, [cleanEmail]);
        if (existing.length > 0) return res.status(400).json({ error: "User with this email already exists." });

        const inviteToken = crypto.randomBytes(32).toString('hex');
        const inviteExpires = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days
        const userId = `u-${Date.now()}`;

        await db.execute(`
            INSERT INTO users (id, org_id, name, email, role, status, allowed_project_ids, invite_token, invite_expires)
            VALUES (?, ?, ?, ?, ?, 'Invited', ?, ?, ?)
        `, [userId, adminOrgId, name, cleanEmail, role, JSON.stringify(allowedProjectIds || []), inviteToken, inviteExpires]);

        const [orgRows]: any = await db.execute(`SELECT name FROM organizations WHERE id = ?`, [adminOrgId]);
        const orgName = orgRows[0]?.name || 'Your Organization';

        // Send Email
        const settings = await getGlobalConfig();
        const transporter = getTransporter(settings);
        if (transporter) {
            const template = settings.emailTemplates?.invite;
            const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
            const inviteUrl = `${appUrl}/#/accept-invite?token=${inviteToken}`;
            
            const placeholders = { orgName, userName: name, inviteUrl, year: new Date().getFullYear().toString() };
            const subject = (template?.enabled && template.subject) 
              ? replacePlaceholders(template.subject, placeholders)
              : `Invitation to join ${orgName} on OpenStudbook`;
            
            const bodyHtml = (template?.enabled && template.bodyHtml)
              ? replacePlaceholders(template.bodyHtml, placeholders)
              : `<p>Hello ${name},</p><p>You have been invited to join <strong>${orgName}</strong> on OpenStudbook.</p><p><a href="${inviteUrl}">Click here to accept the invitation and set your password.</a></p>`;

            await transporter.sendMail({
                from: process.env.SMTP_FROM || '"OpenStudbook" <no-reply@openstudbook.org>',
                to: cleanEmail,
                subject,
                html: bodyHtml
            });
        }

        res.json({ success: true, message: "Invitation sent." });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/users/accept-invite', async (req: any, res: any) => {
    const { token, password } = req.body;
    const db = getDb();
    try {
        const [users]: any = await db.execute(`SELECT * FROM users WHERE invite_token = ? AND invite_expires > ?`, [token, Date.now()]);
        const user = users[0];
        if (!user) return res.status(400).json({ error: "Invalid or expired invitation token." });

        const hashedPassword = await bcrypt.hash(password, 10);
        await db.execute(`
            UPDATE users 
            SET status = 'Active', password = ?, invite_token = NULL, invite_expires = NULL 
            WHERE id = ?
        `, [hashedPassword, user.id]);

        const [orgs]: any = await db.execute(`SELECT * FROM organizations WHERE id = ?`, [user.org_id]);
        const authToken = jwt.sign({ id: user.id, email: user.email, role: user.role, orgId: user.org_id }, JWT_SECRET, { expiresIn: '30d' });
        
        res.json({ success: true, token: authToken, user: { ...user, status: 'Active' }, organization: orgs[0] });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/users/check-invite', async (req: any, res: any) => {
    const { token } = req.body;
    const db = getDb();
    try {
        const [rows]: any = await db.execute(`
            SELECT u.name, u.email, o.name as orgName 
            FROM users u 
            JOIN organizations o ON u.org_id = o.id 
            WHERE u.invite_token = ? AND u.invite_expires > ?
        `, [token, Date.now()]);
        
        if (rows.length === 0) return res.status(400).json({ error: "Invalid token" });
        res.json({ success: true, data: rows[0] });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Generic REST endpoints
app.post('/rest/v1/:table', authenticate, async (req: any, res: any) => {
    const table = req.params.table;
    const data = Array.isArray(req.body) ? req.body : [req.body];
    const db = getDb();
    try {
        for (const item of data) {
            if (item.password && !item.password.startsWith('$2')) {
                item.password = await bcrypt.hash(String(item.password), 10);
            }
            
            const keys = Object.keys(item);
            const vals = keys.map(k => (typeof item[k] === 'object' && item[k] !== null) ? JSON.stringify(item[k]) : (item[k] ?? null));
            const placeholders = keys.map(() => '?').join(', ');
            const primaryKeyCol = (table === 'languages') ? 'code' : 'id';
            const nonPkKeys = keys.filter(k => k !== primaryKeyCol);
            
            // CRITICAL: Escape column and table names with backticks to prevent conflict with reserved keywords like 'type'
            const escapedTable = `\`${table}\``;
            const escapedKeys = keys.map(k => `\`${k}\``).join(', ');
            
            let updateClause = "";
            if (nonPkKeys.length > 0) {
                // Use VALUES() function but ensure column names inside are backticked
                updateClause = "ON DUPLICATE KEY UPDATE " + nonPkKeys.map(k => `\`${k}\` = VALUES(\`${k}\`)`).join(', ');
            } else {
                updateClause = `ON DUPLICATE KEY UPDATE \`${primaryKeyCol}\` = \`${primaryKeyCol}\``;
            }
            
            const sql = `INSERT INTO ${escapedTable} (${escapedKeys}) VALUES (${placeholders}) ${updateClause}`;
            
            try {
                await db.execute(sql, vals);
            } catch (innerError: any) {
                // Fallback for drivers/modes where execute might struggle with VALUES() function logic in some SQL versions
                console.warn(`Prepared statement failed for ${table}, attempting raw query...`);
                await db.query(sql, vals);
            }
        }
        res.json({ success: true });
    } catch (e: any) { 
        console.error(`Generic REST error on ${table}:`, e.message);
        res.status(500).json({ error: e.message }); 
    }
});

app.get('/api/sync', authenticate, async (req: any, res: any) => {
   const db = getDb();
   const orgId = (req as any).user.orgId;
   try {
      // 1. Get all public organizations for the network map
      const [allOrgs]: any = await db.execute(`SELECT * FROM organizations WHERE is_deleted = 0`);
      
      // 2. Get my organization's data specifically
      const [myOrgRows]: any = await db.execute(`SELECT * FROM organizations WHERE id = ? LIMIT 1`, [orgId]);
      
      // 3. Get projects belonging to my organization
      const [projects]: any = await db.execute(`SELECT * FROM projects WHERE org_id = ?`, [orgId]);
      
      // 4. Get users belonging to my organization
      const [users]: any = await db.execute(`SELECT * FROM users WHERE org_id = ?`, [orgId]);
      
      // 5. Get species belonging to my organization's projects
      const [species]: any = await db.execute(`
        SELECT * FROM species 
        WHERE project_id IN (SELECT id FROM projects WHERE org_id = ?)
      `, [orgId]);
      
      // 6. Get individuals belonging to my organization's projects
      const [individuals]: any = await db.execute(`
        SELECT * FROM individuals 
        WHERE project_id IN (SELECT id FROM projects WHERE org_id = ?)
      `, [orgId]);
      
      // 7. Get breeding events linked to my organization's species
      const [events]: any = await db.execute(`
        SELECT * FROM breeding_events 
        WHERE species_id IN (
            SELECT id FROM species 
            WHERE project_id IN (SELECT id FROM projects WHERE org_id = ?)
        )
      `, [orgId]);
      
      // 8. Get breeding loans where my organization is proposer or partner
      const [loans]: any = await db.execute(`
        SELECT * FROM breeding_loans 
        WHERE proposer_org_id = ? OR partner_org_id = ?
      `, [orgId, orgId]);
      
      // 9. Get partnerships involving my organization
      const [partnerships]: any = await db.execute(`
        SELECT * FROM partnerships 
        WHERE org_id_1 = ? OR org_id_2 = ?
      `, [orgId, orgId]);
      
      const [config]: any = await db.execute(`SELECT settings FROM app_config WHERE id = 'global-settings'`);
      const [langs]: any = await db.execute(`SELECT * FROM languages WHERE is_deleted = 0`);
      
      let settings = config[0]?.settings;
      if (typeof settings === 'string') { try { settings = JSON.parse(settings); } catch (e) {} }
      
      res.json({ 
        success: true, 
        data: { 
            org: myOrgRows[0] || null,
            partners: allOrgs, 
            projects, 
            users, 
            species, 
            individuals, 
            breeding_events: events, 
            breeding_loans: loans, 
            partnerships, 
            languages: langs, 
            settings 
        } 
      });
   } catch (e: any) { 
      console.error("Sync Error:", e.message);
      res.status(500).json({ error: e.message }); 
   }
});

app.get('/api/health', (req: any, res: any) => res.json({ status: 'ok' }));
app.use(express.static(path.join(__dirname, '../../dist')));
app.get('*', (req: any, res: any) => {
   if (req.path.startsWith('/api/') || req.path.startsWith('/rest/')) return res.status(404).json({ error: "Not Found" });
   res.sendFile(path.join(__dirname, '../../dist/index.html'));
});

(async () => { await initDatabase(); app.listen(PORT, () => console.log(`Backend server listening on ${PORT}`)); })();
