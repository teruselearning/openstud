
import express from 'express';
import cors from 'cors';
// @ts-ignore
import { PrismaClient } from '@prisma/client';
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

const prisma = new PrismaClient();
const app = express();
const PORT = Number(process.env.PORT) || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret-do-not-use-in-prod';

app.use(cors({ origin: '*' }) as any);
app.use(express.json({ limit: '50mb' }) as any);
app.use(express.urlencoded({ limit: '50mb', extended: true }) as any);
app.use(morgan('dev') as any);
app.use(express.static(path.join(__dirname, '../../dist')));

// --- Middleware ---
const authenticate = (req: any, res: any, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return next();
  const token = authHeader.split(' ')[1];
  try {
    (req as any).user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

app.get('/api/health', (req: any, res: any) => res.json({ status: 'ok' }));

app.post('/api/login', async (req: any, res: any) => {
  const { email, password } = req.body;
  const cleanEmail = email?.toLowerCase().trim();
  
  console.log(`[LOGIN] Attempt: ${cleanEmail}`);
  
  try {
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    
    if (!user) {
       console.log(`[LOGIN] User NOT found: ${cleanEmail}`);
       // Timing attack protection
       await bcrypt.compare("dummy", '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890'); 
       return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!user.password) {
       console.log(`[LOGIN] User found but password column is NULL or empty.`);
       return res.status(401).json({ error: "Invalid credentials" });
    }

    // DIAGNOSTIC LOGGING
    console.log(`[DEBUG] Received Password: "${password.substring(0,2)}..." (Len: ${password.length})`);
    console.log(`[DEBUG] Database Hash: "${user.password.substring(0,7)}..." (Len: ${user.password.length})`);

    // Standard Bcrypt comparison
    const passwordValid = await bcrypt.compare(password, user.password);
    
    if (!passwordValid) {
       console.log(`[LOGIN] Bcrypt comparison FAILED for: ${cleanEmail}`);
       if (user.password.length < 60) {
          console.warn(`[CRITICAL] DB Hash is only ${user.password.length} chars. Bcrypt requires 60. Your DB column is likely too short!`);
       }
       return res.status(401).json({ error: "Invalid credentials" });
    }

    console.log(`[LOGIN] SUCCESS: ${cleanEmail}`);
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
    
    res.json({ 
      token, 
      user: { 
        ...user, 
        allowedProjectIds: user.allowed_project_ids || [], 
        avatarUrl: user.avatar_url 
      } 
    });
  } catch (e: any) {
    console.error("[LOGIN] SERVER ERROR:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post('/api/register', async (req: any, res: any) => {
  const { orgName, userName, email, focus, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const orgId = `org-${Date.now()}`;
    const [newOrg, newProject, newUser] = await prisma.$transaction([
      prisma.organization.create({ data: { id: orgId, name: orgName, focus: focus || 'Animals', founded_year: new Date().getFullYear(), location: 'Unknown', description: '', is_org_public: false, is_species_public: false, obscure_location: false, allow_breeding_requests: false } }),
      prisma.project.create({ data: { id: `p-${Date.now()}`, name: 'Main Project', description: 'Default project', org_id: orgId } }),
      prisma.user.create({ data: { id: `u-${Date.now()}`, name: userName, email: email.toLowerCase().trim(), password: hashedPassword, role: 'Admin', status: 'Active', allowed_project_ids: [] } })
    ]);
    const token = jwt.sign({ id: newUser.id, email: newUser.email, role: newUser.role }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { ...newUser, allowedProjectIds: [], avatarUrl: null }, org: newOrg });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Registration failed" });
  }
});

const createUpsertHandler = (table: any, prepareBody: (body: any) => any, idField: string = 'id') => async (req: any, res: any) => {
    try {
        const rawData = req.body;
        const items = Array.isArray(rawData) ? rawData : [rawData];
        for (const rawItem of items) {
            const item = prepareBody(rawItem);
            const whereClause: any = {};
            whereClause[idField] = item[idField];
            
            // Password logic for synchronization
            if (idField === 'id' && item.password) {
               // Only hash if it's NOT a bcrypt hash (checked via common prefixes)
               if (!item.password.startsWith('$2a$') && !item.password.startsWith('$2b$') && !item.password.startsWith('$2y$')) {
                  console.log(`[SYNC] Hashing plain text password for ${item.email}`);
                  item.password = await bcrypt.hash(item.password, 10);
               }
            }
            
            Object.keys(item).forEach(key => item[key] === undefined && delete item[key]);
            await table.upsert({ where: whereClause, update: item, create: item });
        }
        res.json({ success: true });
    } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
};

const prepOrg = (o: any) => ({ id: o.id, name: o.name, location: o.location, latitude: o.latitude, longitude: o.longitude, founded_year: o.founded_year, description: o.description, focus: o.focus, is_org_public: o.is_org_public, is_species_public: o.is_species_public, obscure_location: o.obscure_location, hide_name: o.hide_name, allow_breeding_requests: o.allow_breeding_requests, breeding_request_contact_id: o.breeding_request_contact_id, show_native_status: o.show_native_status, dashboard_block: o.dashboard_block, is_deleted: o.is_deleted });
const prepProject = (p: any) => ({ id: p.id, org_id: p.org_id, name: p.name, description: p.description });
const prepUser = (u: any) => ({ id: u.id, name: u.name, email: u.email?.toLowerCase().trim(), role: u.role, status: u.status, password: u.password, avatar_url: u.avatar_url, allowed_project_ids: u.allowed_project_ids });
const prepSpecies = (s: any) => ({ id: s.id, project_id: s.project_id, common_name: s.common_name, scientific_name: s.scientific_name, type: s.type, plant_classification: s.plant_classification, conservation_status: s.conservation_status, sexual_maturity_age_years: s.sexual_maturity_age_years, average_adult_weight_kg: s.average_adult_weight_kg, life_expectancy_years: s.life_expectancy_years, breeding_season_start: s.breeding_season_start, breeding_season_end: s.breeding_season_end, image_url: s.image_url, native_status_country: s.native_status_country, native_status_local: s.native_status_local });
const prepInd = (i: any) => ({ id: i.id, project_id: i.project_id, species_id: i.species_id, studbook_id: i.studbook_id, name: i.name, sex: i.sex, birth_date: i.birth_date, weight_kg: i.weight_kg, sire_id: i.sire_id, dam_id: i.dam_id, image_url: i.image_url, dna_sequence: i.dna_sequence, notes: i.notes, source: i.source, source_details: i.source_details, latitude: i.latitude, longitude: i.longitude, is_deceased: i.is_deceased, death_date: i.death_date, loan_status: i.loan_status, transferred_to_org_id: i.transferred_to_org_id, transfer_date: i.transfer_date, transfer_note: i.transfer_note, weight_history: i.weight_history, growth_history: i.growth_history, health_history: i.health_history });

app.post('/rest/v1/organizations', createUpsertHandler(prisma.organization, prepOrg));
app.post('/rest/v1/projects', createUpsertHandler(prisma.project, prepProject));
app.post('/rest/v1/users', createUpsertHandler(prisma.user, prepUser));
app.post('/rest/v1/species', createUpsertHandler(prisma.species, prepSpecies));
app.post('/rest/v1/individuals', createUpsertHandler(prisma.individual, prepInd));
app.post('/api/sync', authenticate, async (req: any, res: any) => {
   try {
      const [orgs, projects, users, species, individuals, config, languages] = await Promise.all([
         prisma.organization.findMany({ where: { is_deleted: false } }),
         prisma.project.findMany(),
         prisma.user.findMany(),
         prisma.species.findMany(),
         prisma.individual.findMany(),
         prisma.appConfig.findUnique({ where: { id: 'global-settings' } }),
         prisma.language?.findMany({ where: { is_deleted: false } })
      ]);
      res.json({ success: true, data: { partners: orgs, projects, users, species, individuals, settings: config?.settings, languages } });
   } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

app.get('*', (req: any, res: any) => res.sendFile(path.join(__dirname, '../../dist/index.html')));
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
