
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
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret-do-not-use-in-prod';

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(morgan('dev'));

/**
 * AUTO-INITIALIZE DATABASE & MIGRATE COLUMNS
 */
const initDatabase = async () => {
    // Initial attempt to create the database if it doesn't exist
    try {
        const connection = await mysql.createConnection({
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password,
            port: dbConfig.port
        });
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\`;`);
        await connection.end();
    } catch (e) {
        console.warn("Could not ensure database existence, proceeding assuming it exists or connection fails later.");
    }

    const db = getDb();
    try {
        await db.query('SELECT 1');
        
        // Define all tables
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

        // Ensure critical columns exist for organizations
        await ensureColumn('organizations', 'enable_mfa', 'BOOLEAN DEFAULT FALSE');
        await ensureColumn('organizations', 'enable_enclosures', 'BOOLEAN DEFAULT FALSE');
        await ensureColumn('organizations', 'is_deleted', 'BOOLEAN DEFAULT FALSE');
        await ensureColumn('organizations', 'dashboard_block', 'JSON');

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

        // Migration check for enclosure_id in individuals
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

// --- AUTH ROUTES ---

app.post('/api/login', async (req: any, res: any) => {
    const { email, password } = req.body;
    const db = getDb();
    try {
        const [rows]: any = await db.execute('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
        const user = rows[0];
        if (!user) return res.status(401).json({ error: "User not found" });

        const isMatch = user.password === password || (user.password && await bcrypt.compare(password, user.password));
        if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

        const [orgRows]: any = await db.execute('SELECT * FROM organizations WHERE id = ? LIMIT 1', [user.org_id]);
        const token = jwt.sign({ id: user.id, orgId: user.org_id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

        res.json({ token, user, organization: orgRows[0] });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- PUBLIC CONFIG ROUTE (Fixes 404) ---

app.get('/api/config', async (req: any, res: any) => {
   const db = getDb();
   try {
      const [config]: any = await db.execute(`SELECT settings FROM app_config WHERE id = 'global-settings'`);
      const [langs]: any = await db.execute(`SELECT * FROM languages WHERE is_deleted = 0`);
      
      let settings = config[0]?.settings;
      if (typeof settings === 'string') { try { settings = JSON.parse(settings); } catch (e) {} }

      res.json({ 
         success: true, 
         data: { 
            settings: settings || {}, 
            languages: langs || [] 
         } 
      });
   } catch (e: any) {
      res.status(500).json({ error: e.message });
   }
});

// --- GENERIC UPSERT REST ROUTES ---

app.post('/rest/v1/:table', authenticate, async (req: any, res: any) => {
    const { table } = req.params;
    const db = getDb();
    const data = Array.isArray(req.body) ? req.body : [req.body];
    
    if (data.length === 0) return res.json({ success: true });

    try {
        for (const item of data) {
            const keys = Object.keys(item);
            if (keys.length === 0) continue;

            const values = keys.map(k => {
                const v = item[k];
                if (v === undefined) return null;
                if (v !== null && typeof v === 'object') return JSON.stringify(v);
                return v;
            });
            
            const placeholders = keys.map(() => '?').join(', ');
            const updateClause = keys.map(k => `\`${k}\` = VALUES(\`${k}\`)`).join(', ');
            
            const sql = `INSERT INTO \`${table}\` (${keys.map(k => `\`${k}\``).join(', ')}) 
                         VALUES (${placeholders}) 
                         ON DUPLICATE KEY UPDATE ${updateClause}`;
            
            await db.execute(sql, values);
        }
        res.json({ success: true });
    } catch (e: any) {
        console.error(`Upsert failed for table ${table}:`, e.message);
        res.status(500).json({ error: e.message });
    }
});

app.patch('/rest/v1/:table', authenticate, async (req: any, res: any) => {
    const { table } = req.params;
    const db = getDb();
    const { id, code, ...updates } = req.body;
    const pkField = table === 'languages' ? 'code' : 'id';
    const pkValue = table === 'languages' ? (code || req.query.code) : (id || req.query.id);

    if (!pkValue) return res.status(400).json({ error: "Missing primary key" });

    try {
        if (Object.keys(updates).length === 0) {
            const softDeleteField = (table === 'organizations' || table === 'languages') ? 'is_deleted' : null;
            if (softDeleteField) {
                await db.execute(`UPDATE \`${table}\` SET \`${softDeleteField}\` = 1 WHERE \`${pkField}\` = ?`, [pkValue]);
                return res.json({ success: true });
            }
            return res.status(400).json({ error: "No updates provided" });
        }

        const keys = Object.keys(updates);
        const values = keys.map(k => {
            const v = updates[k];
            if (v === undefined) return null;
            if (v !== null && typeof v === 'object') return JSON.stringify(v);
            return v;
        });
        const setClause = keys.map(k => `\`${k}\` = ?`).join(', ');
        
        await db.execute(`UPDATE \`${table}\` SET ${setClause} WHERE \`${pkField}\` = ?`, [...values, pkValue]);
        res.json({ success: true });
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
        const hashedPass = await bcrypt.hash(tempPassword, 10);

        await db.execute(
            'INSERT INTO organizations (id, name, focus, location, founded_year, is_org_public, is_species_public) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [orgId, orgName, focus, location, new Date().getFullYear(), true, true]
        );
        await db.execute(
            'INSERT INTO users (id, org_id, name, email, role, status, password) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [userId, orgId, adminName, adminEmail, 'Admin', 'Active', hashedPass]
        );
        res.json({ success: true, tempPassword });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/super-admin/organizations/:id', authenticate, async (req: any, res: any) => {
    if (req.user.role !== 'Super Admin') return res.status(403).json({ error: "Unauthorized" });
    const db = getDb();
    try {
        await db.execute('DELETE FROM organizations WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- SYNC ENDPOINT ---

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
         settings
      } });
   } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/health', (req: any, res: any) => res.json({ status: 'ok' }));

// Final Error Handler
app.use((err: any, req: any, res: any, next: any) => {
    console.error("Unhandled Middleware Error:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
});

app.use(express.static(path.join(__dirname, '../../dist')));
app.get('*', (req: any, res: any) => {
   if (req.path.startsWith('/api/') || req.path.startsWith('/rest/')) return res.status(404).json({ error: "Not Found" });
   res.sendFile(path.join(__dirname, '../../dist/index.html'));
});

(async () => { 
    await initDatabase(); 
    app.listen(PORT, () => console.log(`Backend server listening on ${PORT}`)); 
})();
