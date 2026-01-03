
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

// Responsive HTML Wrapper for all emails
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
    <p style="margin: 4px 0 0; font-size: 11px; color: #cbd5e1;">This is a system notification from your captive breeding management platform.</p>
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
    try {
        const connection = await mysql.createConnection({ 
            host: dbConfig.host, 
            user: dbConfig.user, 
            password: dbConfig.password, 
            port: dbConfig.port 
        });
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\`;`);
        await connection.end();
    } catch (e: any) {
        console.warn("Database creation check failed:", e.message);
    }

    const db = getDb();
    try {
        // Tables
        await db.execute(`CREATE TABLE IF NOT EXISTS organizations (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255), location VARCHAR(255), latitude DOUBLE, longitude DOUBLE, founded_year INT, description LONGTEXT, focus VARCHAR(255), is_org_public TINYINT(1) DEFAULT 0, is_species_public TINYINT(1) DEFAULT 0, obscure_location TINYINT(1) DEFAULT 0, hide_name TINYINT(1) DEFAULT 0, allow_breeding_requests TINYINT(1) DEFAULT 0, breeding_request_contact_id VARCHAR(255), show_native_status TINYINT(1) DEFAULT 1, dashboard_block JSON, ai_usage_limit INT DEFAULT 100, ai_usage_count INT DEFAULT 0, ai_usage_last_reset VARCHAR(255), enable_mfa TINYINT(1) DEFAULT 0, enable_enclosures TINYINT(1) DEFAULT 0, is_deleted TINYINT(1) DEFAULT 0)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS users (id VARCHAR(255) PRIMARY KEY, org_id VARCHAR(255), name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE, role VARCHAR(50) NOT NULL, status VARCHAR(50) NOT NULL, password VARCHAR(255), avatar_url LONGTEXT, allowed_project_ids JSON, reset_code VARCHAR(10), reset_expires BIGINT)`);
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

        // Seed Demo
        const [users]: any = await db.execute('SELECT id FROM users WHERE email = ?', ['sarah@wild.org']);
        if (users.length === 0) {
            console.log("Seeding Demo User...");
            const orgId = 'org-1';
            const userId = 'u-1';
            const hashedPassword = await bcrypt.hash('password', 10);
            await db.execute(`INSERT IGNORE INTO organizations (id, name, location, focus, is_org_public, is_species_public) VALUES (?, 'Wild Foundation', 'Portland, OR', 'Animals', 1, 1)`, [orgId]);
            await db.execute(`INSERT IGNORE INTO users (id, org_id, name, email, role, status, password) VALUES (?, ?, 'Sarah Jenkins', 'sarah@wild.org', 'Admin', 'Active', ?)`, [userId, orgId, hashedPassword]);
            await db.execute(`INSERT IGNORE INTO projects (id, org_id, name, description) VALUES ('p-1', ?, 'Global Conservation', 'Primary research project')`, [orgId]);
        }
    } catch (e: any) { 
        console.error("Database Init Failed:", e);
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

// --- ROUTES ---

app.post('/api/login', async (req: any, res: any) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required." });
    
    const normalizedEmail = email.toLowerCase().trim();
    const db = getDb();
    try {
        const [rows]: any = await db.execute('SELECT * FROM users WHERE email = ? LIMIT 1', [normalizedEmail]);
        const user = rows[0];
        
        if (!user) {
            return res.status(401).json({ error: "Account not found." });
        }
        
        let isMatch = false;
        if (user.password && user.password.startsWith('$2')) {
            isMatch = await bcrypt.compare(password, user.password);
        } else {
            isMatch = user.password === password;
        }
        
        if (!isMatch) {
            return res.status(401).json({ error: "Invalid password." });
        }
        
        const [orgRows]: any = await db.execute('SELECT * FROM organizations WHERE id = ? LIMIT 1', [user.org_id]);
        const token = jwt.sign({ id: user.id, orgId: user.org_id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        
        res.json({ token, user, organization: orgRows[0] });
    } catch (e) { 
        console.error("Login Error:", e);
        res.status(500).json({ error: "Login processing error." }); 
    }
});

app.post('/api/register', async (req: any, res: any) => {
    const { orgName, userName, email, focus, password, location } = req.body;
    const normalizedEmail = email.toLowerCase().trim();
    const db = getDb();
    try {
        const [existing]: any = await db.execute('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
        if (existing.length > 0) return res.status(400).json({ error: "Email already in use." });
        
        const orgId = `org-${Date.now()}`;
        const userId = `u-${Date.now()}`;
        const hashedPassword = await bcrypt.hash(password, 10);
        
        await db.execute(`INSERT INTO organizations (id, name, location, focus, is_org_public, is_species_public) VALUES (?, ?, ?, ?, 1, 1)`, [orgId, orgName, location, focus]);
        await db.execute(`INSERT INTO users (id, org_id, name, email, role, status, password) VALUES (?, ?, ?, ?, 'Admin', 'Active', ?)`, [userId, orgId, userName, normalizedEmail, hashedPassword]);
        
        const token = jwt.sign({ id: userId, orgId, role: 'Admin' }, JWT_SECRET, { expiresIn: '7d' });
        const [u]: any = await db.execute('SELECT * FROM users WHERE id = ?', [userId]);
        const [o]: any = await db.execute('SELECT * FROM organizations WHERE id = ?', [orgId]);
        
        res.json({ success: true, token, user: u[0], organization: o[0] });
    } catch (e: any) { 
        res.status(500).json({ error: e.message }); 
    }
});

app.post('/api/forgot-password', async (req: any, res: any) => {
    const { email } = req.body;
    const db = getDb();
    try {
        const normalizedEmail = email.toLowerCase().trim();
        const [rows]: any = await db.execute('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
        if (rows.length === 0) return res.status(404).json({ error: "Email not found." });
        
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = Date.now() + 3600000; // 1 hour
        
        await db.execute('UPDATE users SET reset_code = ?, reset_expires = ? WHERE email = ?', [code, expires, normalizedEmail]);
        
        await sendMail(
          normalizedEmail, 
          "Password Reset Code", 
          `<p>You requested a password reset. Please use the following verification code to proceed:</p>
           <div style="margin: 32px 0; padding: 24px; background-color: #f0fdf4; border: 2px dashed #059669; border-radius: 12px; text-align: center;">
             <span style="font-family: 'Courier New', Courier, monospace; font-size: 42px; font-weight: 800; letter-spacing: 8px; color: #065f46;">${code}</span>
           </div>
           <p style="font-size: 14px; color: #64748b;">This code will expire in 1 hour. If you did not request this, please ignore this email.</p>`
        );
        res.json({ success: true, message: "Reset code sent to your email." });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/reset-password', async (req: any, res: any) => {
    const { email, code, newPassword } = req.body;
    const db = getDb();
    try {
        const normalizedEmail = email.toLowerCase().trim();
        const [rows]: any = await db.execute('SELECT * FROM users WHERE email = ? AND reset_code = ?', [normalizedEmail, code]);
        if (rows.length === 0) return res.status(400).json({ error: "Invalid or expired reset code." });
        
        const user = rows[0];
        if (user.reset_expires < Date.now()) return res.status(400).json({ error: "Code expired." });
        
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.execute('UPDATE users SET password = ?, reset_code = NULL, reset_expires = NULL WHERE id = ?', [hashedPassword, user.id]);
        
        res.json({ success: true, message: "Password updated successfully." });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
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
      if (typeof settings === 'string') settings = JSON.parse(settings);
      
      res.json({ success: true, data: { org: myOrgRows[0], partners: allOrgs, projects, users, species, individuals, enclosures, breedingEvents, breedingLoans, partnerships, languages: langs, settings } });
   } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Generic REST endpoint for CRUD
const restRouter = express.Router();
restRouter.use(authenticate);
restRouter.post('/:table', async (req: any, res: any) => {
    const { table } = req.params;
    const items = Array.isArray(req.body) ? req.body : [req.body];
    const db = getDb();
    try {
        for (const item of items) {
            const keys = Object.keys(item);
            const values = Object.values(item).map(v => typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
            const placeholders = keys.map(() => '?').join(', ');
            const updates = keys.map(k => `\`${k}\` = VALUES(\`${k}\`)`).join(', ');
            await db.execute(`INSERT INTO \`${table}\` (\`${keys.join('`, `')}\`) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`, values);
        }
        res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});
app.use('/rest/v1', restRouter);

app.get('/api/config', async (req: any, res: any) => {
   const db = getDb();
   try {
      const [config]: any = await db.execute(`SELECT settings FROM app_config WHERE id = 'global-settings'`);
      const [langs]: any = await db.execute(`SELECT * FROM languages WHERE is_deleted = 0`);
      let settings = config[0]?.settings;
      if (typeof settings === 'string') settings = JSON.parse(settings);
      res.json({ success: true, data: { settings: settings || {}, languages: langs || [] } });
   } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/email/send', authenticate, async (req: any, res: any) => {
    const { to, subject, html, templateKey, placeholders } = req.body;
    
    let finalHtml = html;
    let finalSubject = subject;

    const db = getDb();
    const [rows]: any = await db.execute(`SELECT settings FROM app_config WHERE id = 'global-settings'`);
    let settings = rows[0]?.settings;
    if (typeof settings === 'string') settings = JSON.parse(settings);

    // 1. Pull from DB templates if templateKey is provided AND enabled
    if (templateKey) {
       const template = settings?.emailTemplates?.[templateKey];
       if (template && template.enabled) {
          finalHtml = template.bodyHtml;
          finalSubject = template.subject;
       }
    }

    // 2. Perform placeholder replacement on the content (whether fallback or custom)
    if (placeholders) {
       Object.entries(placeholders).forEach(([k, v]) => {
          const regex = new RegExp(`{{${k}}}`, 'g');
          finalHtml = finalHtml.replace(regex, String(v));
          finalSubject = finalSubject.replace(regex, String(v));
       });
    }

    const result = await sendMail(to, finalSubject, finalHtml, !!templateKey);
    if (result.success) res.json({ success: true });
    else res.status(500).json({ error: result.error });
});

app.post('/api/email/test', authenticate, async (req: any, res: any) => {
    const result = await sendMail(req.body.to, "OpenStudbook SMTP Test", "<p>Your SMTP configuration is working correctly! You are now ready to receive system notifications.</p>");
    if (result.success) res.json({ success: true });
    else res.status(500).json({ error: result.error });
});

// Serve Frontend
app.use(express.static(path.join(__dirname, '../../dist')));
app.get('*', (req: any, res: any) => {
   if (req.path.startsWith('/api/') || req.path.startsWith('/rest/')) return res.status(404).json({ error: "Not Found" });
   res.sendFile(path.join(__dirname, '../../dist/index.html'));
});

// Startup
(async () => { 
    await initDatabase(); 
    app.listen(PORT, () => console.log(`Backend server listening on ${PORT}`)); 
})();
