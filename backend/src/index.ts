
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
                enable_enclosures BOOLEAN DEFAULT FALSE,
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
        await ensureColumn('organizations', 'enable_enclosures', 'BOOLEAN DEFAULT FALSE');
        await ensureColumn('organizations', 'is_deleted', 'BOOLEAN DEFAULT FALSE');

        await db.execute(`
            CREATE TABLE IF NOT EXISTS enclosures (
                id VARCHAR(255) PRIMARY KEY,
                org_id VARCHAR(255),
                name VARCHAR(255) NOT NULL,
                description LONGTEXT,
                latitude DOUBLE,
                longitude DOUBLE,
                species_ids JSON,
                CONSTRAINT fk_enclosure_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
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
                enclosure_id VARCHAR(255),
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

        await ensureColumn('individuals', 'enclosure_id', 'VARCHAR(255)');

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

// ... existing email and auth logic ...

app.get('/api/sync', authenticate, async (req: any, res: any) => {
   const db = getDb();
   const orgId = (req as any).user.orgId;
   const isSuper = req.user.role === 'Super Admin';
   
   try {
      const [allOrgs]: any = await db.execute(`SELECT * FROM organizations WHERE is_deleted = 0`);
      const [myOrgRows]: any = await db.execute(`SELECT * FROM organizations WHERE id = ? LIMIT 1`, [orgId]);
      
      const [enclosures]: any = isSuper 
         ? await db.execute(`SELECT * FROM enclosures`) 
         : await db.execute(`SELECT * FROM enclosures WHERE org_id = ?`, [orgId]);

      // Super Admin gets all data, others get filtered
      const [projects]: any = isSuper 
         ? await db.execute(`SELECT * FROM projects`) 
         : await db.execute(`SELECT * FROM projects WHERE org_id = ?`, [orgId]);
         
      const [users]: any = isSuper 
         ? await db.execute(`SELECT * FROM users`) 
         : await db.execute(`SELECT * FROM users WHERE org_id = ?`, [orgId]);
         
      const [species]: any = isSuper 
         ? await db.execute(`SELECT * FROM species`) 
         : await db.execute(`SELECT * FROM species WHERE project_id IN (SELECT id FROM projects WHERE org_id = ?)`, [orgId]);
         
      const [individuals]: any = isSuper 
         ? await db.execute(`SELECT * FROM individuals`) 
         : await db.execute(`SELECT * FROM individuals WHERE project_id IN (SELECT id FROM projects WHERE org_id = ?)`, [orgId]);
         
      const [events]: any = isSuper 
         ? await db.execute(`SELECT * FROM breeding_events`) 
         : await db.execute(`SELECT * FROM breeding_events WHERE species_id IN (SELECT id FROM species WHERE project_id IN (SELECT id FROM projects WHERE org_id = ?))`, [orgId]);
         
      const [loans]: any = isSuper 
         ? await db.execute(`SELECT * FROM breeding_loans`) 
         : await db.execute(`SELECT * FROM breeding_loans WHERE proposer_org_id = ? OR partner_org_id = ?`, [orgId, orgId]);
         
      const [partnerships]: any = isSuper 
         ? await db.execute(`SELECT * FROM partnerships`) 
         : await db.execute(`SELECT * FROM partnerships WHERE org_id_1 = ? OR org_id_2 = ?`, [orgId, orgId]);
         
      const [config]: any = await db.execute(`SELECT settings FROM app_config WHERE id = 'global-settings'`);
      const [langs]: any = await db.execute(`SELECT * FROM languages WHERE is_deleted = 0`);
      
      // Discovery Species: Unique public species metadata for network browsing
      const [discoverySpecies]: any = await db.execute(`
         SELECT DISTINCT scientific_name, common_name, type, image_url, conservation_status 
         FROM species 
         WHERE project_id IN (SELECT id FROM projects WHERE org_id IN (SELECT id FROM organizations WHERE is_species_public = 1))
      `);

      let settings = config[0]?.settings;
      if (typeof settings === 'string') { try { settings = JSON.parse(settings); } catch (e) {} }
      
      res.json({ success: true, data: { 
         org: myOrgRows[0] || null, 
         partners: allOrgs, 
         projects, 
         users, 
         species, 
         individuals, 
         enclosures,
         breedingEvents: events, 
         breedingLoans: loans, 
         partnerships, 
         languages: langs, 
         settings,
         discoverySpecies
      } });
   } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ... rest of the file ...
