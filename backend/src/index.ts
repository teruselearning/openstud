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

// Responsive HTML Wrapper for all system emails
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
        
        // Apply wrapper if not explicitly raw (custom user templates are sent raw)
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
        // Tables init...
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

app.post('/api/email/send', authenticate, async (req: any, res: any) => {
    const { to, subject, html, templateKey, placeholders } = req.body;
    
    let finalHtml = html;
    let finalSubject = subject;
    let useRawLayout = false;

    const db = getDb();
    const [rows]: any = await db.execute(`SELECT settings FROM app_config WHERE id = 'global-settings'`);
    let settings = rows[0]?.settings;
    if (typeof settings === 'string') settings = JSON.parse(settings);

    // 1. Pull from custom templates if provided AND enabled
    if (templateKey) {
       const template = settings?.emailTemplates?.[templateKey];
       if (template && template.enabled) {
          finalHtml = template.bodyHtml;
          finalSubject = template.subject;
          useRawLayout = true; // Use their custom layout exactly
       }
    }

    // 2. Placeholder replacement
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

// Other routes...

app.use(express.static(path.join(__dirname, '../../dist')));
app.get('*', (req: any, res: any) => {
   if (req.path.startsWith('/api/') || req.path.startsWith('/rest/')) return res.status(404).json({ error: "Not Found" });
   res.sendFile(path.join(__dirname, '../../dist/index.html'));
});

(async () => { 
    await initDatabase(); 
    app.listen(PORT, () => console.log(`Backend server listening on ${PORT}`)); 
})();