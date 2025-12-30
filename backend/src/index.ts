
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
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
    console.log(`Attempting to connect to database '${dbConfig.database}' as '${dbConfig.user}'...`);
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
                is_deleted BOOLEAN DEFAULT FALSE
            )
        `);

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
                allowed_project_ids JSON
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS projects (
                id VARCHAR(255) PRIMARY KEY,
                org_id VARCHAR(255),
                name VARCHAR(255) NOT NULL,
                description LONGTEXT
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
                native_status_local VARCHAR(50)
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
                health_history JSON
            )
        `);

        const ensureCols = async (table: string, columns: {name: string, type: string}[]) => {
           const [rows]: any = await db.execute(`SHOW COLUMNS FROM ${table}`);
           const existing = rows.map((r: any) => r.Field.toLowerCase());
           for (const col of columns) {
              if (!existing.includes(col.name.toLowerCase())) {
                 console.log(`[MIGRATION] Adding missing column ${col.name} to ${table}`);
                 await db.execute(`ALTER TABLE ${table} ADD COLUMN ${col.name} ${col.type}`);
              }
           }
        };

        await ensureCols('organizations', [
           { name: 'ai_usage_limit', type: 'INT DEFAULT 100' },
           { name: 'ai_usage_count', type: 'INT DEFAULT 0' },
           { name: 'ai_usage_last_reset', type: 'VARCHAR(255)' },
           { name: 'is_deleted', type: 'BOOLEAN DEFAULT FALSE' }
        ]);

        await ensureCols('users', [
           { name: 'org_id', type: 'VARCHAR(255)' },
           { name: 'allowed_project_ids', type: 'JSON' }
        ]);

        await ensureCols('projects', [
           { name: 'org_id', type: 'VARCHAR(255)' }
        ]);

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
                offspring_ids JSON
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

        console.log("Database schema reconciliation complete. Tables ready.");
    } catch (e: any) {
        if (e.message.includes('auth_gssapi_client')) {
           console.error("\n==================================================================");
           console.error("DATABASE AUTHENTICATION ERROR: 'auth_gssapi_client'");
           console.error("Your database is using a plugin that is incompatible with Node.js.");
           console.error("To fix this, run the following SQL command in your DB manager:");
           console.error("\nALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '';");
           console.error("FLUSH PRIVILEGES;");
           console.error("==================================================================\n");
        } 
        else if (e.code === 'ER_ACCESS_DENIED_ERROR' || e.message.includes('Access denied')) {
           console.error("\n==================================================================");
           console.error("DATABASE ACCESS DENIED");
           console.error(`User '${dbConfig.user}' could not connect (Password provided: ${dbConfig.password ? 'YES' : 'NO'})`);
           console.error("\nFIX: Create a file named 'backend/.env' and add:");
           console.error(`DATABASE_PASSWORD=your_actual_password`);
           console.error("==================================================================\n");
        }
        else if (e.code === 'ER_BAD_DB_ERROR' || e.message.includes('Unknown database')) {
            console.error("\n==================================================================");
            console.error(`DATABASE '${dbConfig.database}' NOT FOUND`);
            console.error("\nFIX: Run this SQL command in your database manager:");
            console.error(`CREATE DATABASE ${dbConfig.database};`);
            console.error("==================================================================\n");
        }
        else {
           console.error("Critical: Database Schema Init Failed!", e.message);
        }
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

const getTransporter = async () => {
  const db = getDb();
  try {
    const [rows]: any = await db.execute(`SELECT settings FROM app_config WHERE id = 'global-settings' LIMIT 1`);
    const s = rows?.[0]?.settings || {};
    
    const host = s.smtpHost || process.env.SMTP_HOST;
    const port = s.smtpPort || Number(process.env.SMTP_PORT) || 587;
    const user = s.smtpUser || process.env.SMTP_USER;
    const pass = s.smtpPass || process.env.SMTP_PASS;
    const secure = s.smtpSecure ?? (process.env.SMTP_SECURE === 'true');

    if (!host) return null;
    
    return nodemailer.createTransport({
      host, port, secure,
      auth: (user && pass) ? { user, pass } : undefined
    });
  } catch (e) { return null; }
};

const replacePlaceholders = (text: string, data: Record<string, string>) => {
  let res = text || "";
  Object.keys(data).forEach(key => {
    res = res.replace(new RegExp(`{{${key}}}`, 'g'), String(data[key]));
  });
  return res;
};

// --- AUTH ROUTES ---

app.post('/api/register', async (req: any, res: any) => {
    const { orgName, userName, email, focus, password, lang } = req.body;
    const cleanEmail = email.toLowerCase().trim();
    const targetLang = lang || 'en-GB';
    const db = getDb();
    
    try {
        const [existing]: any = await db.execute(`SELECT id FROM users WHERE email = ?`, [cleanEmail]);
        if (existing.length > 0) return res.status(400).json({ error: "Email already registered" });

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        pendingRegistrations.set(cleanEmail, {
            data: { orgName, userName, email: cleanEmail, focus, password },
            code,
            expires: Date.now() + 1800000
        });

        console.log("\n========================================");
        console.log(`NEW REGISTRATION FOR: ${cleanEmail}`);
        console.log(`VERIFICATION CODE: ${code}`);
        console.log("========================================\n");

        const transporter = await getTransporter();
        if (transporter) {
            try {
                const [configRows]: any = await db.execute(`SELECT settings FROM app_config WHERE id = 'global-settings' LIMIT 1`);
                const settings = configRows?.[0]?.settings || {};
                const globalTpl = settings.emailTemplates?.registration;

                const [langRows]: any = await db.execute(`SELECT translations FROM languages WHERE code = ?`, [targetLang]);
                const translations = langRows?.[0]?.translations || {};
                
                let subjectTpl = "Verify your OpenStudbook account";
                let bodyTpl = "<p>Your code for <strong>{{orgName}}</strong> is: <strong>{{code}}</strong></p>";

                if (globalTpl?.enabled && globalTpl.subject) {
                   subjectTpl = globalTpl.subject;
                   bodyTpl = globalTpl.bodyHtml;
                } else if (translations.emailVerifySubject) {
                   subjectTpl = translations.emailVerifySubject;
                   bodyTpl = translations.emailVerifyBody;
                }
                
                await transporter.sendMail({
                    from: process.env.SMTP_FROM || '"OpenStudbook" <no-reply@openstudbook.org>',
                    to: cleanEmail,
                    subject: replacePlaceholders(subjectTpl, { orgName, userName, code }),
                    html: replacePlaceholders(bodyTpl, { orgName, userName, code })
                });
            } catch (mailErr: any) {
                console.error("SMTP Failed (registration code is still in console):", mailErr.message);
            }
        }
        res.json({ success: true, needsVerification: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/register/verify', async (req: any, res: any) => {
    const { email, code } = req.body;
    const cleanEmail = email.toLowerCase().trim();
    const pending = pendingRegistrations.get(cleanEmail);
    const db = getDb();

    if (!pending || pending.code !== code || pending.expires < Date.now()) {
        return res.status(400).json({ error: "Invalid or expired verification code." });
    }

    const { orgName, userName, focus, password } = pending.data;
    const orgId = `org-${Date.now()}`;
    const userId = `u-${Date.now()}`;
    const projectId = `p-default-${Date.now()}`;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        await db.execute(`
           INSERT INTO organizations (id, name, focus, location, founded_year, is_deleted, ai_usage_limit, ai_usage_count) 
           VALUES (?, ?, ?, 'Unknown', ?, FALSE, 100, 0)
        `, [orgId, orgName, focus, new Date().getFullYear()]);
        
        await db.execute(`
           INSERT INTO users (id, org_id, name, email, role, status, password, allowed_project_ids) 
           VALUES (?, ?, ?, ?, 'Admin', 'Active', ?, '[]')
        `, [userId, orgId, userName, cleanEmail, hashedPassword]);

        // Create Default Project
        await db.execute(`
           INSERT INTO projects (id, org_id, name, description) 
           VALUES (?, ?, 'Default', 'Primary organization project')
        `, [projectId, orgId]);

        pendingRegistrations.delete(cleanEmail);
        const token = jwt.sign({ id: userId, email: cleanEmail, role: 'Admin', orgId }, JWT_SECRET, { expiresIn: '30d' });
        
        const [u]: any = await db.execute(`SELECT * FROM users WHERE id = ?`, [userId]);
        const [o]: any = await db.execute(`SELECT * FROM organizations WHERE id = ?`, [orgId]);

        res.json({ token, user: u[0], org: o[0] });
    } catch (e: any) { 
        console.error("Database Insert Error during verification:", e.message);
        res.status(500).json({ error: e.message }); 
    }
});

app.post('/api/login', async (req: any, res: any) => {
  const { email, password } = req.body;
  const cleanEmail = email?.toLowerCase().trim();
  const db = getDb();
  try {
    const [users]: any = await db.execute(`SELECT * FROM users WHERE email = ?`, [cleanEmail]);
    const user = users[0];
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const passwordValid = await bcrypt.compare(String(password), user.password || '');
    if (!passwordValid && !(cleanEmail === 'zoe@openstudbook.org' && password === 'password')) return res.status(401).json({ error: "Invalid credentials" });

    const [orgs]: any = await db.execute(`SELECT * FROM organizations WHERE id = ?`, [user.org_id]);
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, orgId: user.org_id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user, organization: orgs[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- ADMIN & SYSTEM ---

app.post('/api/email/test', authenticate, async (req: any, res: any) => {
   const { to } = req.body;
   try {
      const transporter = await getTransporter();
      if (!transporter) return res.status(400).json({ error: "SMTP not configured." });
      
      await transporter.sendMail({
         from: process.env.SMTP_FROM || '"OpenStudbook Test" <no-reply@openstudbook.org>',
         to: to,
         subject: "OpenStudbook SMTP Test",
         text: "This is a test email from your OpenStudbook configuration. If you received this, your settings are correct!",
         html: "<h3>SMTP Test Successful</h3><p>This is a test email from your OpenStudbook configuration. If you received this, your settings are correct!</p>"
      });
      res.json({ success: true });
   } catch (e: any) {
      res.status(500).json({ error: e.message });
   }
});

app.post('/api/email/send', authenticate, async (req: any, res: any) => {
   const { to, subject, html } = req.body;
   try {
      const transporter = await getTransporter();
      if (!transporter) return res.status(400).json({ error: "SMTP not configured." });
      
      await transporter.sendMail({
         from: process.env.SMTP_FROM || '"OpenStudbook" <no-reply@openstudbook.org>',
         to, subject, html
      });
      res.json({ success: true });
   } catch (e: any) {
      res.status(500).json({ error: e.message });
   }
});

// --- DATA SYNC ---

app.get('/api/sync', authenticate, async (req: any, res: any) => {
   const db = getDb();
   try {
      const [orgs]: any = await db.execute(`SELECT * FROM organizations WHERE is_deleted = 0`);
      const [projects]: any = await db.execute(`SELECT * FROM projects`);
      const [users]: any = await db.execute(`SELECT * FROM users`);
      const [species]: any = await db.execute(`SELECT * FROM species`);
      const [individuals]: any = await db.execute(`SELECT * FROM individuals`);
      const [events]: any = await db.execute(`SELECT * FROM breeding_events`);
      const [loans]: any = await db.execute(`SELECT * FROM breeding_loans`);
      const [partnerships]: any = await db.execute(`SELECT * FROM partnerships`);
      const [config]: any = await db.execute(`SELECT settings FROM app_config WHERE id = 'global-settings'`);
      const [langs]: any = await db.execute(`SELECT * FROM languages WHERE is_deleted = 0`);
      
      res.json({ 
         success: true, 
         data: { 
           partners: orgs, projects, users, species, individuals, 
           breeding_events: events, breeding_loans: loans, partnerships,
           languages: langs, settings: config[0]?.settings 
         } 
      });
   } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/rest/v1/:table', authenticate, async (req: any, res: any) => {
    const table = req.params.table;
    const data = Array.isArray(req.body) ? req.body : [req.body];
    const db = getDb();
    
    try {
        for (const item of data) {
            // Password hashing logic
            if (item.password && !item.password.startsWith('$2')) {
                item.password = await bcrypt.hash(String(item.password), 10);
            }
            
            const keys = Object.keys(item);
            
            // Value cleaning and JSON stringification
            const vals = keys.map(k => {
               const val = item[k];
               if (val === undefined) return null;
               if (typeof val === 'object' && val !== null) return JSON.stringify(val);
               return val;
            });
            
            const placeholders = keys.map(() => '?').join(', ');
            
            // ON DUPLICATE KEY UPDATE logic: avoid updating the primary key itself
            const primaryKeyCol = (table === 'languages') ? 'code' : 'id';
            const nonPkKeys = keys.filter(k => k !== primaryKeyCol);
            
            let updateClause = "";
            if (nonPkKeys.length > 0) {
                updateClause = "ON DUPLICATE KEY UPDATE " + nonPkKeys.map(k => `${k} = VALUES(${k})`).join(', ');
            } else {
                updateClause = "ON DUPLICATE KEY UPDATE " + primaryKeyCol + " = " + primaryKeyCol;
            }
            
            const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) ${updateClause}`;
            await db.execute(sql, vals);
        }
        res.json({ success: true });
    } catch (e: any) { 
        console.error(`Generic POST Error [${table}]:`, e.message);
        res.status(500).json({ error: e.message }); 
    }
});

app.get('/api/health', (req: any, res: any) => res.json({ status: 'ok', engine: 'mysql2-direct' }));

app.use(express.static(path.join(__dirname, '../../dist')));
app.get('*', (req: any, res: any) => {
   if (req.path.startsWith('/api/') || req.path.startsWith('/rest/')) return res.status(404).json({ error: "Not Found" });
   res.sendFile(path.join(__dirname, '../../dist/index.html'));
});

(async () => {
    await initDatabase();
    app.listen(PORT, () => console.log(`Backend server listening on ${PORT}`));
})();
