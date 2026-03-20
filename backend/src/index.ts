
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
import { GoogleGenAI, Type } from "@google/genai";

declare const __dirname: string;

dotenv.config();

let dbConfig = {
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
let isConfigured = false;

const getDb = () => {
  if (!pool) {
    pool = mysql.createPool(dbConfig);
  }
  return pool;
};

const resetPool = (newConfig: any) => {
  if (pool) {
    pool.end();
  }
  dbConfig = { ...dbConfig, ...newConfig };
  pool = mysql.createPool(dbConfig);
};

const app: any = express();
const PORT = Number(process.env.PORT) || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'openstudbook-stable-dev-secret-2024';

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(morgan('dev'));

// --- AI Service Definitions ---
const TEXT_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-2.5-flash-image';

const speciesSchema = {
  type: Type.OBJECT,
  properties: {
    scientificName: { type: Type.STRING },
    type: { type: Type.STRING, enum: ["Animal", "Plant"] },
    conservationStatus: { type: Type.STRING },
    sexualMaturityAgeYears: { type: Type.NUMBER },
    averageAdultWeightKg: { type: Type.NUMBER },
    lifeExpectancyYears: { type: Type.NUMBER },
    breedingSeasonStart: { type: Type.INTEGER },
    breedingSeasonEnd: { type: Type.INTEGER },
    plantClassification: { type: Type.STRING },
    nativeStatusCountry: { type: Type.STRING },
    nativeStatusLocal: { type: Type.STRING },
    description: { type: Type.STRING }
  },
  required: ["scientificName", "conservationStatus", "type"],
};

const translationSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      k: { type: Type.STRING },
      v: { type: Type.STRING }
    },
    required: ["k", "v"]
  }
};

const sanitizeJsonResponse = (text: string): string => {
  if (!text) return "";
  let clean = text.trim();
  if (clean.startsWith("```")) {
    clean = clean.replace(/^```[a-z]*\n/i, "").replace(/\n```$/i, "");
  }
  const firstBrace = clean.indexOf('{');
  const firstBracket = clean.indexOf('[');
  let start = -1;
  let end = -1;
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    start = firstBrace;
    end = clean.lastIndexOf('}');
  } else if (firstBracket !== -1) {
    start = firstBracket;
    end = clean.lastIndexOf(']');
  }
  if (start !== -1 && end !== -1 && end > start) {
    return clean.substring(start, end + 1);
  }
  return clean;
};

const runMigrations = async (db: mysql.Pool) => {
  await db.execute(`CREATE TABLE IF NOT EXISTS organizations (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255), location VARCHAR(255), latitude DOUBLE, longitude DOUBLE, founded_year INT, description LONGTEXT, focus VARCHAR(255), is_org_public TINYINT(1) DEFAULT 0, is_species_public TINYINT(1) DEFAULT 0, obscure_location TINYINT(1) DEFAULT 1, hide_name TINYINT(1) DEFAULT 0, allow_breeding_requests TINYINT(1) DEFAULT 0, breeding_request_contact_id VARCHAR(255), show_native_status TINYINT(1) DEFAULT 1, dashboard_block JSON, enable_mfa TINYINT(1) DEFAULT 0, enable_enclosures TINYINT(1) DEFAULT 0, ai_usage_limit INT DEFAULT 100, ai_usage_count INT DEFAULT 0, ai_usage_last_reset VARCHAR(50), is_deleted TINYINT(1) DEFAULT 0)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS users (id VARCHAR(255) PRIMARY KEY, org_id VARCHAR(255), name VARCHAR(255), email VARCHAR(255) UNIQUE, role VARCHAR(50), status VARCHAR(50), password VARCHAR(255), avatar_url LONGTEXT, allowed_project_ids JSON, preferred_language VARCHAR(10) DEFAULT 'en-GB', reset_code VARCHAR(10), reset_expires BIGINT)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS projects (id VARCHAR(255) PRIMARY KEY, org_id VARCHAR(255), name VARCHAR(255) NOT NULL, description LONGTEXT)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS species (id VARCHAR(255) PRIMARY KEY, project_id VARCHAR(255), common_name VARCHAR(255) NOT NULL, scientific_name VARCHAR(255) NOT NULL, type VARCHAR(50) NOT NULL, plant_classification VARCHAR(50), conservation_status VARCHAR(255), sexual_maturity_age_years DOUBLE, average_adult_weight_kg DOUBLE, life_expectancy_years DOUBLE, breeding_season_start INT, breeding_season_end INT, image_url LONGTEXT, native_status_country VARCHAR(50), native_status_local VARCHAR(50))`);
  await db.execute(`CREATE TABLE IF NOT EXISTS individuals (id VARCHAR(255) PRIMARY KEY, project_id VARCHAR(255), species_id VARCHAR(255), enclosure_id VARCHAR(255), studbook_id VARCHAR(255), name VARCHAR(255) NOT NULL, sex VARCHAR(20) NOT NULL, birth_date VARCHAR(50), weight_kg DOUBLE, sire_id VARCHAR(255), dam_id VARCHAR(255), image_url LONGTEXT, dna_sequence LONGTEXT, notes VARCHAR(2000), source VARCHAR(255), source_details VARCHAR(255), latitude DOUBLE, longitude DOUBLE, is_deceased TINYINT(1) DEFAULT 0, death_date VARCHAR(50), loan_status VARCHAR(50), transferred_to_org_id VARCHAR(255), transfer_date VARCHAR(50), transfer_note LONGTEXT, weight_history JSON, growth_history JSON, health_history JSON)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS enclosures (id VARCHAR(255) PRIMARY KEY, org_id VARCHAR(255), project_id VARCHAR(255), name VARCHAR(255) NOT NULL, description LONGTEXT, boundary JSON, individual_ids JSON, feed_schedules JSON)`);
  try { await db.execute(`ALTER TABLE enclosures ADD COLUMN feed_schedules JSON`); } catch (e: any) { if (!e.message?.includes('Duplicate column')) throw e; }
  await db.execute(`CREATE TABLE IF NOT EXISTS breeding_events (id VARCHAR(255) PRIMARY KEY, species_id VARCHAR(255), sire_id VARCHAR(255), dam_id VARCHAR(255), date VARCHAR(50), offspring_count INT, successful_births INT, losses INT, notes LONGTEXT, offspring_ids JSON)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS breeding_loans (id VARCHAR(255) PRIMARY KEY, partner_org_id VARCHAR(255), proposer_org_id VARCHAR(255), role VARCHAR(50), start_date VARCHAR(50), end_date VARCHAR(50), status VARCHAR(50), individual_ids JSON, terms LONGTEXT, notification_recipient_id VARCHAR(255), change_request JSON)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS partnerships (id VARCHAR(255) PRIMARY KEY, org_id_1 VARCHAR(255), org_id_2 VARCHAR(255), status VARCHAR(50), established_date VARCHAR(50))`);
  await db.execute(`CREATE TABLE IF NOT EXISTS app_config (id VARCHAR(255) PRIMARY KEY, settings JSON)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS languages (code VARCHAR(10) PRIMARY KEY, name VARCHAR(255), translations JSON, is_default TINYINT(1) DEFAULT 0, manual_overrides JSON, is_deleted TINYINT(1) DEFAULT 0)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS verification_codes (email VARCHAR(255) PRIMARY KEY, code VARCHAR(10) NOT NULL, expires_at BIGINT NOT NULL)`);
};

const seedDatabase = async (db: mysql.Pool, orgName?: string, adminPassword?: string) => {
  const [orgs]: any = await db.execute(`SELECT id FROM organizations LIMIT 1`);
  if (orgs.length === 0) {
    console.log('[DATABASE] Seeding initial data...');
    const name = orgName || 'My Organisation';
    const hashed = await bcrypt.hash(adminPassword || 'password', 10);
    await db.execute(`INSERT INTO organizations (id, name, location, focus, is_org_public, is_species_public, obscure_location, enable_enclosures) VALUES ('org-1', ?, '', 'Fauna', 1, 1, 0, 1)`, [name]);
    await db.execute(`INSERT INTO users (id, org_id, name, email, role, status, password) VALUES ('u-admin', 'org-1', 'Administrator', 'admin@openstudbook.local', 'Super Admin', 'Active', ?)`, [hashed]);
    await db.execute(`INSERT INTO projects (id, org_id, name, description) VALUES ('p-1', 'org-1', 'Default Project', 'Main collection')`);
    await db.execute(`INSERT INTO app_config (id, settings) VALUES ('global-settings', ?)`, [JSON.stringify({ enableRegistration: true, themePrimaryColor: '#059669' })]);
    await db.execute(`INSERT INTO languages (code, name, is_default, translations) VALUES ('en-GB', 'English (UK)', 1, ?)`, [JSON.stringify({})]);
    await db.execute(`INSERT INTO languages (code, name, is_default, translations) VALUES ('en-US', 'English (US)', 0, ?)`, [JSON.stringify({})]);
  }
};

const initDatabase = async () => {
    console.log('[DATABASE] Connecting...');
    try {
        const db = getDb();
        const connection = await db.getConnection();
        connection.release();
        
        await runMigrations(db);
        await seedDatabase(db);
        isConfigured = true;
        console.log('[DATABASE] Connection successful.');
    } catch (e: any) { 
        console.error("[DATABASE] Connection Failed:", e.message);
        isConfigured = false;
    }
};

const authenticate = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Unauthorized" });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    (req as any).user = decoded;
    next();
  } catch (e) { return res.status(401).json({ error: "Session expired" }); }
};

// --- Installer Endpoints ---

app.get('/api/install/status', async (req: any, res: any) => {
  try {
    const db = getDb();
    const connection = await db.getConnection();
    connection.release();
    const [rows]: any = await db.execute(`SHOW TABLES LIKE 'organizations'`);
    res.json({ success: true, installed: rows.length > 0, connected: true });
  } catch (e: any) {
    res.json({ success: true, installed: false, connected: false, error: e.message });
  }
});

app.post('/api/install/setup', async (req: any, res: any) => {
  const { host, user, password, database, port, orgName, adminPassword } = req.body;
  try {
    const testConn = await mysql.createConnection({ host, user, password, port: Number(port) || 3306 });
    await testConn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\`;`);
    await testConn.end();
    resetPool({ host, user, password, database, port: Number(port) || 3306 });
    const db = getDb();
    await runMigrations(db);
    await seedDatabase(db, orgName, adminPassword);
    isConfigured = true;
    res.json({ success: true, message: "Installation successful!" });
  } catch (e: any) {
    res.status(500).json({ error: `Installation failed: ${e.message}` });
  }
});

// --- AI Proxy Endpoints ---

app.post('/api/ai/species-data', authenticate, async (req: any, res: any) => {
  const { commonName, type, locationContext } = req.body;
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: `Provide biological data for "${commonName}" (Kingdom: ${type === 'Animal' ? 'Fauna' : 'Flora'}). Org location: ${locationContext}. Return ONLY JSON.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: speciesSchema,
      },
    });
    if (response.text) {
      const sanitized = sanitizeJsonResponse(response.text);
      res.json(JSON.parse(sanitized));
    } else {
      res.status(500).json({ error: "AI returned empty response" });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ai/generate-image', authenticate, async (req: any, res: any) => {
  const { prompt } = req.body;
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: { parts: [{ text: prompt }] }
    });
    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          if (part.inlineData) {
            return res.json({ imageUrl: `data:image/png;base64,${part.inlineData.data}` });
          }
        }
      }
    }
    res.status(404).json({ error: "No image generated" });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ai/translate', authenticate, async (req: any, res: any) => {
  const { sourceData, targetLanguage } = req.body;
  try {
    const payload = Object.entries(sourceData).map(([k, v]) => ({ k, v }));
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    const prompt = `Translate interface strings into "${targetLanguage}": ${JSON.stringify(payload)}`;
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
      config: { 
        responseMimeType: "application/json",
        responseSchema: translationSchema
      }
    });
    if (response.text) {
      const sanitized = sanitizeJsonResponse(response.text);
      res.json(JSON.parse(sanitized));
    } else {
      res.json([]);
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ai/reverse-geocode', authenticate, async (req: any, res: any) => {
  const { lat, lng } = req.body;
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    const response = await ai.models.generateContent({
      model: 'gemini-flash-lite-latest',
      contents: `Identify location at: Lat ${lat}, Lng ${lng}. Return ONLY "City, Country".`,
      config: { thinkingConfig: { thinkingBudget: 0 } }
    });
    res.json({ location: response.text?.trim() || "Unknown Location" });
  } catch (e: any) {
    res.json({ location: `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
  }
});

const wrapEmailHtml = (content: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; }
    .wrapper { background-color: #f8fafc; padding: 40px 20px; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0; }
    .header { background-color: #059669; padding: 32px; text-align: center; }
    .logo-text { color: #ffffff; font-size: 24px; font-weight: 800; margin: 0; text-decoration: none; }
    .content { padding: 40px; color: #334155; line-height: 1.6; font-size: 16px; }
    .footer { background-color: #f1f5f9; padding: 24px; text-align: center; color: #64748b; font-size: 12px; }
    hr { border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header"><div class="logo-text">OpenStudbook</div></div>
      <div class="content">${content}</div>
      <div class="footer"><p>&copy; ${new Date().getFullYear()} OpenStudbook Project. This is an automated message.</p></div>
    </div>
  </div>
</body>
</html>
`;

// Maps email template keys to their i18n translation keys
const EMAIL_TRANSLATION_KEYS: Record<string, { subject: string; body: string }> = {
    invite:        { subject: 'emailInviteSubject',  body: 'emailInviteBody'  },
    registration:  { subject: 'emailVerifySubject',  body: 'emailVerifyBody'  },
    mfa:           { subject: 'emailVerifySubject',  body: 'emailVerifyBody'  },
    notification:  { subject: 'emailNotifySubject',  body: 'emailNotifyBody'  },
    password_reset:{ subject: 'emailVerifySubject',  body: 'emailVerifyBody'  },
    removal:       { subject: 'emailNotifySubject',  body: 'emailNotifyBody'  },
};

const sendMailInternal = async (to: string, subject: string, html: string, placeholders: Record<string, string> = {}, templateKey?: string, language?: string) => {
    try {
        const db = getDb();
        const [rows]: any = await db.execute(`SELECT settings FROM app_config WHERE id = 'global-settings'`);
        let settings = rows[0]?.settings || {};
        if (typeof settings === 'string') settings = JSON.parse(settings);

        if (!settings.smtpHost || !settings.smtpUser) {
            console.warn("[MAIL] SMTP not configured. Skipping send.");
            return false;
        }

        const transporter = nodemailer.createTransport({
            host: settings.smtpHost,
            port: Number(settings.smtpPort) || 587,
            secure: !!settings.smtpSecure,
            auth: { user: settings.smtpUser, pass: settings.smtpPass }
        });

        let finalSubject = subject;
        let finalHtml = html;

        // Start with the stored English template (if any)
        if (templateKey && settings.emailTemplates && settings.emailTemplates[templateKey]) {
            const tpl = settings.emailTemplates[templateKey];
            if (tpl.enabled && tpl.subject && tpl.bodyHtml) {
                finalSubject = tpl.subject;
                finalHtml = tpl.bodyHtml;
            }
        }

        // Override with translated strings if a non-English language is requested
        if (language && language !== 'en' && language !== 'en-GB' && templateKey && EMAIL_TRANSLATION_KEYS[templateKey]) {
            try {
                const langCode = language.split('-')[0]; // e.g. 'fr-FR' → 'fr'
                const [langRows]: any = await db.execute(
                    `SELECT translations, manual_overrides FROM languages WHERE (code = ? OR code = ?) AND is_deleted = 0 LIMIT 1`,
                    [language, langCode]
                );
                if (langRows.length > 0) {
                    const rawTrans = langRows[0].translations || {};
                    const rawOverrides = langRows[0].manual_overrides || {};
                    const translations = typeof rawTrans === 'string' ? JSON.parse(rawTrans) : rawTrans;
                    const overrides = typeof rawOverrides === 'string' ? JSON.parse(rawOverrides) : rawOverrides;
                    const merged = { ...translations, ...overrides };
                    const keys = EMAIL_TRANSLATION_KEYS[templateKey];
                    if (merged[keys.subject]) finalSubject = merged[keys.subject];
                    if (merged[keys.body])    finalHtml    = merged[keys.body];
                    console.log(`[MAIL] Using ${language} translations for ${templateKey} email.`);
                }
            } catch (translationErr) {
                console.warn("[MAIL] Could not load language translations, falling back to English:", translationErr);
            }
        }

        Object.entries(placeholders).forEach(([key, val]) => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            finalSubject = finalSubject.replace(regex, val);
            finalHtml = finalHtml.replace(regex, val);
        });

        const fromAddress = 'admin@openstudbook.org';
        const fromHeader = `"Open Studbook" <${fromAddress}>`;

        await transporter.sendMail({
            from: fromHeader,
            to,
            subject: finalSubject,
            html: wrapEmailHtml(finalHtml)
        });
        
        console.log(`[MAIL] Email successfully sent to ${to}`);
        return true;
    } catch (e) {
        console.error("[MAIL] Error sending email:", e);
        throw e;
    }
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

app.post('/api/demo-login', async (req: any, res: any) => {
    try {
        const db = getDb();
        const [rows]: any = await db.execute(`SELECT * FROM users WHERE email = 'sarah@wild.org'`);
        const user = rows[0];
        if (!user) return res.status(404).json({ error: "Demo user not found. Database might be initializing." });
        
        const token = jwt.sign({ id: user.id, orgId: user.org_id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        const [orgRows]: any = await db.execute(`SELECT * FROM organizations WHERE id = ?`, [user.org_id]);
        
        res.json({ 
            success: true, token, 
            user: { ...user, orgId: user.org_id, avatarUrl: user.avatar_url, allowedProjectIds: typeof user.allowed_project_ids === 'string' ? JSON.parse(user.allowed_project_ids) : (user.allowed_project_ids || []) }, 
            organization: orgRows[0] 
        });
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
        const expires = Date.now() + (15 * 60 * 1000);

        await db.execute(
            `INSERT INTO verification_codes (email, code, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE code = ?, expires_at = ?`,
            [cleanEmail, code, expires, code, expires]
        );

        console.log(`[EMAIL LOG] Verification code for ${cleanEmail}: ${code}`);
        
        await sendMailInternal(cleanEmail, "Verify your email - OpenStudbook", `<p>Please use the code below for <strong>{{orgName}}</strong>:</p><div style="padding: 20px; background: #f0fdf4; border: 2px dashed #059669; border-radius: 8px; text-align: center; font-family: monospace; font-size: 32px; font-weight: bold; color: #065f46;">{{code}}</div>`, {
            code, orgName: orgName || "your organization"
        }, 'registration');

        res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/register', async (req: any, res: any) => {
    const { orgName, userName, email, password, location, focus, latitude, longitude, code } = req.body;
    try {
        const db = getDb();
        const cleanEmail = email.toLowerCase().trim();

        const [codes]: any = await db.execute(`SELECT * FROM verification_codes WHERE email = ? AND code = ?`, [cleanEmail, code]);
        if (codes.length === 0) return res.status(400).json({ error: "Invalid code." });
        if (codes[0].expires_at < Date.now()) return res.status(400).json({ error: "Code expired." });

        const orgId = `org-${Date.now()}`;
        const userId = `u-${Date.now()}`;
        const hashedPassword = await bcrypt.hash(password, 10);

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            await conn.execute(
                `INSERT INTO organizations (id, name, location, focus, is_org_public, latitude, longitude, obscure_location) VALUES (?, ?, ?, ?, 1, ?, ?, 1)`,
                [orgId, orgName, location || '', focus || 'Fauna', latitude || null, longitude || null]
            );
            await conn.execute(
                `INSERT INTO users (id, org_id, name, email, role, status, password) VALUES (?, ?, ?, ?, 'Admin', 'Active', ?)`,
                [userId, orgId, userName, cleanEmail, hashedPassword]
            );
            await conn.execute(`DELETE FROM verification_codes WHERE email = ?`, [cleanEmail]);
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }

        const token = jwt.sign({ id: userId, orgId, role: 'Admin' }, JWT_SECRET, { expiresIn: '7d' });
        const [userRows]: any = await db.execute(`SELECT * FROM users WHERE id = ?`, [userId]);
        const [orgRows]: any = await db.execute(`SELECT * FROM organizations WHERE id = ?`, [orgId]);

        res.json({ 
            success: true, token, 
            user: { ...userRows[0], orgId: userRows[0].org_id, avatarUrl: userRows[0].avatar_url, allowedProjectIds: [] },
            organization: orgRows[0]
        });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
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
        const [orgRows]: any = await db.execute(`SELECT * FROM organizations WHERE id = ? AND is_deleted = 0`, [user.org_id]);
        
        res.json({ 
            success: true, token, 
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
        let orgRows: any = [], partnersRows: any = [], projectsRows: any = [], usersRows: any = [], speciesRows: any = [], individualsRows: any = [], languagesRows: any = [], configRows: any = [], enclosuresRows: any = [];

        if (isSuper) {
            const [o]: any = await db.execute(`SELECT * FROM organizations WHERE id = ? AND is_deleted = 0`, [orgId]);
            orgRows = o;
            const [p]: any = await db.execute(`SELECT * FROM organizations WHERE id != ? AND is_deleted = 0`, [orgId]);
            partnersRows = p;
            const [pj]: any = await db.execute(`SELECT * FROM projects`);
            projectsRows = pj;
            const [u]: any = await db.execute(`SELECT id, org_id, name, email, role, status, avatar_url, allowed_project_ids FROM users`);
            usersRows = u;
            const [s]: any = await db.execute(`SELECT * FROM species`);
            speciesRows = s;
            const [i]: any = await db.execute(`SELECT * FROM individuals`);
            individualsRows = i;
            const [enc]: any = await db.execute(`SELECT * FROM enclosures`);
            enclosuresRows = enc;
        } else {
            const [o]: any = await db.execute(`SELECT * FROM organizations WHERE id = ? AND is_deleted = 0`, [orgId]);
            orgRows = o;
            const [p]: any = await db.execute(`SELECT * FROM organizations WHERE id != ? AND is_org_public = 1 AND is_deleted = 0`, [orgId]);
            partnersRows = p;
            const [pj]: any = await db.execute(`SELECT * FROM projects WHERE org_id = ?`, [orgId]);
            projectsRows = pj;
            const [u]: any = await db.execute(`SELECT id, org_id, name, email, role, status, avatar_url, allowed_project_ids FROM users WHERE org_id = ?`, [orgId]);
            usersRows = u;
            const [s]: any = await db.execute(`SELECT s.* FROM species s JOIN projects p ON s.project_id = p.id WHERE p.org_id = ?`, [orgId]);
            speciesRows = s;
            const [i]: any = await db.execute(`SELECT i.* FROM individuals i JOIN projects p ON i.project_id = p.id WHERE p.org_id = ?`, [orgId]);
            individualsRows = i;
            const [enc]: any = await db.execute(`SELECT * FROM enclosures WHERE org_id = ?`, [orgId]);
            enclosuresRows = enc;
        }
        
        const [l]: any = await db.execute(`SELECT * FROM languages WHERE is_deleted = 0`);
        languagesRows = l;
        const [conf]: any = await db.execute(`SELECT settings FROM app_config WHERE id = 'global-settings'`);
        configRows = conf;

        let settings = configRows[0]?.settings || {};
        if (typeof settings === 'string') settings = JSON.parse(settings);

        res.json({ 
            success: true, 
            data: { 
                org: orgRows[0] || null, 
                partners: partnersRows || [], 
                projects: projectsRows || [], 
                users: usersRows || [], 
                species: speciesRows || [], 
                individuals: individualsRows || [], 
                enclosures: enclosuresRows || [],
                languages: languagesRows || [], 
                settings 
            } 
        });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/proxy-image', authenticate, async (req: any, res: any) => {
    const { url } = req.body;
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'url required' });
    try {
        // Convert Google Drive share URLs → direct download URL
        let fetchUrl = url.trim();
        const gdFile = fetchUrl.match(/\/file\/d\/([^\/\?&]+)/);
        const gdOpen = fetchUrl.match(/[?&]id=([^&]+)/);
        if (gdFile) {
            fetchUrl = `https://drive.google.com/uc?export=download&id=${gdFile[1]}`;
        } else if (gdOpen && fetchUrl.includes('drive.google.com')) {
            fetchUrl = `https://drive.google.com/uc?export=download&id=${gdOpen[1]}`;
        }

        const response = await fetch(fetchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OpenStudbook/1.0)' },
            redirect: 'follow',
        });
        if (!response.ok) return res.status(502).json({ error: `Remote fetch failed: ${response.status}` });

        const contentType = (response.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
        if (!contentType.startsWith('image/')) return res.status(415).json({ error: `URL did not return an image (got ${contentType})` });

        const buffer = Buffer.from(await response.arrayBuffer());
        const base64 = buffer.toString('base64');
        res.json({ success: true, base64, mimeType: contentType });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/invite/check', async (req: any, res: any) => {
    const { token } = req.query;
    try {
        const db = getDb();
        const [rows]: any = await db.execute(
            `SELECT u.id, u.name, u.email, u.status, o.name as org_name FROM users u JOIN organizations o ON u.org_id = o.id WHERE u.id = ?`,
            [token]
        );
        const user = rows[0];
        if (!user) return res.status(404).json({ error: "Invalid or expired invitation." });
        if (user.status !== 'Invited') return res.status(400).json({ error: "This invitation has already been used." });
        res.json({ success: true, data: { name: user.name, email: user.email, orgName: user.org_name } });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/invite/accept', async (req: any, res: any) => {
    const { token, password } = req.body;
    try {
        const db = getDb();
        const [rows]: any = await db.execute(
            `SELECT u.*, o.name as org_name FROM users u JOIN organizations o ON u.org_id = o.id WHERE u.id = ?`,
            [token]
        );
        const user = rows[0];
        if (!user) return res.status(404).json({ error: "Invalid or expired invitation." });
        if (user.status !== 'Invited') return res.status(400).json({ error: "Invitation already used." });
        const hashed = await bcrypt.hash(password, 10);
        await db.execute(`UPDATE users SET password = ?, status = 'Active' WHERE id = ?`, [hashed, token]);
        const jwtToken = jwt.sign({ id: user.id, orgId: user.org_id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        const [orgRows]: any = await db.execute(`SELECT * FROM organizations WHERE id = ? AND is_deleted = 0`, [user.org_id]);
        res.json({
            success: true, token: jwtToken,
            user: { id: user.id, orgId: user.org_id, name: user.name, email: user.email, role: user.role, status: 'Active', allowedProjectIds: typeof user.allowed_project_ids === 'string' ? JSON.parse(user.allowed_project_ids || '[]') : (user.allowed_project_ids || []) },
            organization: orgRows[0]
        });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/email/send', authenticate, async (req: any, res: any) => {
    const { to, subject, html, placeholders, templateKey, language } = req.body;
    try {
        await sendMailInternal(to, subject, html, placeholders, templateKey, language);
        res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/email/test', authenticate, async (req: any, res: any) => {
    const { to } = req.body;
    try {
        const success = await sendMailInternal(to, "SMTP Connectivity Test", "<p>This is a test email to verify your SMTP settings are correct.</p>");
        if (success) res.json({ success: true, message: "Test email sent successfully!" });
        else res.status(400).json({ error: "SMTP configured but failed to send. Check logs." });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/rest/v1/:table', authenticate, async (req: any, res: any) => {
    const { table } = req.params;
    const body = req.body;
    const data = Array.isArray(body) ? body : [body];
    
    if (data.length === 0) return res.json({ success: true });

    try {
        const db = getDb();
        for (const item of data) {
            const keys = Object.keys(item);
            const values = Object.values(item).map(v => (typeof v === 'object' && v !== null) ? JSON.stringify(v) : v);
            
            const placeholders = keys.map(() => '?').join(', ');
            const updates = keys.map(k => `\`${k}\` = VALUES(\`${k}\`)`).join(', ');
            
            const sql = `INSERT INTO \`${table}\` (\`${keys.join('`, `')}\`) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`;
            await db.execute(sql, values);
        }
        res.json({ success: true });
    } catch (e: any) { 
        console.error(`[REST POST] Error on table ${table}:`, e.message);
        res.status(500).json({ error: e.message }); 
    }
});

app.get('/rest/v1/:table', authenticate, async (req: any, res: any) => {
    const { table } = req.params;
    const { id } = req.query;
    try {
        const db = getDb();
        let sql = `SELECT * FROM \`${table}\``;
        const params = [];
        if (id) {
           sql += ` WHERE id = ?`;
           params.push(id);
        }
        const [rows]: any = await db.execute(sql, params);
        res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.delete('/rest/v1/:table', authenticate, async (req: any, res: any) => {
    const { table } = req.params;
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "Missing id" });
    
    try {
        const db = getDb();
        if (table === 'organizations') {
            const conn = await db.getConnection();
            try {
               await conn.beginTransaction();
               await conn.execute(`DELETE FROM individuals WHERE project_id IN (SELECT id FROM projects WHERE org_id = ?)`, [id]);
               await conn.execute(`DELETE FROM species WHERE project_id IN (SELECT id FROM projects WHERE org_id = ?)`, [id]);
               await conn.execute(`DELETE FROM projects WHERE org_id = ?`, [id]);
               await conn.execute(`DELETE FROM enclosures WHERE org_id = ?`, [id]);
               await conn.execute(`DELETE FROM users WHERE org_id = ?`, [id]);
               await conn.execute(`DELETE FROM breeding_loans WHERE proposer_org_id = ? OR partner_org_id = ?`, [id, id]);
               await conn.execute(`DELETE FROM partnerships WHERE org_id_1 = ? OR org_id_2 = ?`, [id, id]);
               await conn.execute(`DELETE FROM organizations WHERE id = ?`, [id]);
               await conn.commit();
            } catch (err) {
               await conn.rollback();
               throw err;
            } finally { conn.release(); }
        } else {
            await db.execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
        }
        res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.use(express.static(path.join(__dirname, '../../dist')));
app.get('*', (req: any, res: any) => {
   if (req.path.startsWith('/api/')) return res.status(404).json({ error: "404" });
   res.sendFile(path.join(__dirname, '../../dist/index.html'));
});

(async () => { await initDatabase(); app.listen(PORT, () => console.log(`Backend listening on ${PORT}`)); })();
