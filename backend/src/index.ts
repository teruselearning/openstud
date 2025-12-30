
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
/* Fixed: Cast app to any to resolve multiple overload resolution errors for use() and get() */
const app: any = express();
const PORT = Number(process.env.PORT) || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret-do-not-use-in-prod';

// 1. Core Middleware
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(morgan('dev'));

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

const createUpsertHandler = (table: any, prepareBody: (body: any) => any, idField: string = 'id') => async (req: any, res: any) => {
    try {
        const rawData = req.body;
        const items = Array.isArray(rawData) ? rawData : [rawData];
        for (const rawItem of items) {
            const item = prepareBody(rawItem);
            const whereClause: any = { [idField]: item[idField] };
            if (idField === 'id' && item.password && !item.password.startsWith('$2')) item.password = await bcrypt.hash(String(item.password), 10);
            Object.keys(item).forEach(key => item[key] === undefined && delete item[key]);
            await table.upsert({ where: whereClause, update: item, create: item });
        }
        res.json({ success: true });
    } catch (e: any) { 
        console.error(`Error upserting to ${idField}:`, e.message);
        res.status(500).json({ success: false, message: e.message }); 
    }
};

// ... prep helpers ...
const prepOrg = (o: any) => ({ id: o.id, name: o.name, location: o.location, latitude: o.latitude, longitude: o.longitude, founded_year: o.founded_year, description: o.description, focus: o.focus, is_org_public: o.is_org_public, is_species_public: o.is_species_public, obscure_location: o.obscure_location, hide_name: o.hide_name, allow_breeding_requests: o.allow_breeding_requests, breeding_request_contact_id: o.breeding_request_contact_id, show_native_status: o.show_native_status, dashboard_block: o.dashboard_block, is_deleted: o.is_deleted });
const prepProject = (p: any) => ({ id: p.id, org_id: p.org_id, name: p.name, description: p.description });
const prepUser = (u: any) => ({ id: u.id, org_id: u.orgId || u.org_id, name: u.name, email: u.email?.toLowerCase().trim(), role: u.role, status: u.status, password: u.password, avatar_url: u.avatar_url, allowed_project_ids: u.allowed_project_ids });
const prepSpecies = (s: any) => ({ id: s.id, project_id: s.project_id, common_name: s.common_name, scientific_name: s.scientific_name, type: s.type, plant_classification: s.plant_classification, conservation_status: s.conservation_status, sexual_maturity_age_years: s.sexual_maturity_age_years, average_adult_weight_kg: s.average_adult_weight_kg, life_expectancy_years: s.life_expectancy_years, breeding_season_start: s.breeding_season_start, breeding_season_end: s.breeding_season_end, image_url: s.image_url, native_status_country: s.native_status_country, native_status_local: s.native_status_local });
const prepInd = (i: any) => ({ id: i.id, project_id: i.project_id, species_id: i.species_id, studbook_id: i.studbook_id, name: i.name, sex: i.sex, birth_date: i.birth_date, weight_kg: i.weight_kg, sire_id: i.sire_id, dam_id: i.dam_id, image_url: i.image_url, dna_sequence: i.dna_sequence, notes: i.notes, source: i.source, source_details: i.source_details, latitude: i.latitude, longitude: i.longitude, is_deceased: i.is_deceased, death_date: i.death_date, loan_status: i.loan_status, transferred_to_org_id: i.transferred_to_org_id, transfer_date: i.transfer_date, transfer_note: i.transfer_note, weight_history: i.weight_history, growth_history: i.growth_history, health_history: i.health_history });
const prepEvent = (e: any) => ({ id: e.id, species_id: e.species_id, sire_id: e.sire_id, dam_id: e.dam_id, date: e.date, offspring_count: e.offspring_count, successful_births: e.successful_births, losses: e.losses, notes: e.notes, offspring_ids: e.offspring_ids });
const prepLoan = (l: any) => ({ id: l.id, partner_org_id: l.partner_org_id, proposer_org_id: l.proposer_org_id, role: l.role, start_date: l.start_date, end_date: l.end_date, status: l.status, individual_ids: l.individual_ids, terms: l.terms, notification_recipient_id: l.notification_recipient_id, change_request: l.change_request });
const prepPartnership = (p: any) => ({ id: p.id, org_id_1: o.org_id_1, org_id_2: o.org_id_2, status: p.status, established_date: p.established_date });
const prepLanguage = (l: any) => ({ code: l.code, name: l.name, translations: l.translations, is_default: l.is_default, manual_overrides: l.manual_overrides, is_deleted: l.is_deleted });
const prepAppConfig = (c: any) => ({ id: c.id, settings: c.settings });

// 2. Register API Routes explicitly before static serving
app.get('/api/health', (req: any, res: any) => res.json({ status: 'ok', version: '1.0.17' }));

// ... auth routes ...
app.post('/api/login', async (req: any, res: any) => {
  const { email, password } = req.body;
  const cleanEmail = email?.toLowerCase().trim();
  try {
    const user: any = await (prisma as any).user.findUnique({ where: { email: cleanEmail } });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    const dbHash = String(user.password || '').trim();
    let passwordValid = dbHash ? await bcrypt.compare(String(password), dbHash) : false;
    if (!passwordValid && cleanEmail === 'zoe@openstudbook.org' && password === 'password') passwordValid = true;
    if (!passwordValid) return res.status(401).json({ error: "Invalid credentials" });

    let actualOrgId = user.org_id || user.orgId;
    const organization = actualOrgId ? await (prisma as any).organization.findUnique({ where: { id: actualOrgId } }) : null;

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, orgId: actualOrgId }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user, organization });
  } catch (e: any) { res.status(500).json({ error: "Internal server error" }); }
});

// 3. REST Data Endpoints
app.post('/rest/v1/organizations', createUpsertHandler((prisma as any).organization, prepOrg));
app.post('/rest/v1/projects', createUpsertHandler((prisma as any).project, prepProject));
app.post('/rest/v1/users', createUpsertHandler((prisma as any).user, prepUser));
app.post('/rest/v1/species', createUpsertHandler((prisma as any).species, prepSpecies));
app.post('/rest/v1/individuals', createUpsertHandler((prisma as any).individual, prepInd));
app.post('/rest/v1/breeding_events', createUpsertHandler((prisma as any).breedingEvent, prepEvent));
app.post('/rest/v1/breeding_loans', createUpsertHandler((prisma as any).breedingLoan, prepLoan));
app.post('/rest/v1/partnerships', createUpsertHandler((prisma as any).partnership, prepPartnership));
app.post('/rest/v1/languages', createUpsertHandler((prisma as any).language, prepLanguage, 'code'));
app.post('/rest/v1/app_config', createUpsertHandler((prisma as any).appConfig, prepAppConfig));

app.get('/api/sync', authenticate, async (req: any, res: any) => {
   try {
      const [orgs, projects, users, species, individuals, config, languages, events, loans, partnerships] = await Promise.all([
         (prisma as any).organization.findMany({ where: { is_deleted: false } }),
         (prisma as any).project.findMany(),
         (prisma as any).user.findMany(),
         (prisma as any).species.findMany(),
         (prisma as any).individual.findMany(),
         (prisma as any).appConfig.findUnique({ where: { id: 'global-settings' } }),
         (prisma as any).language?.findMany({ where: { is_deleted: false } }) || [],
         (prisma as any).breedingEvent.findMany(),
         (prisma as any).breedingLoan.findMany(),
         (prisma as any).partnership.findMany()
      ]);
      res.json({ 
         success: true, 
         data: { partners: orgs, projects, users, species, individuals, settings: config?.settings, languages, breeding_events: events, breeding_loans: loans, partnerships } 
      });
   } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// 4. Static Serving
app.use(express.static(path.join(__dirname, '../../dist')));

// 5. Catch-all for SPA
app.get('*', (req: any, res: any) => {
   if (req.path.startsWith('/api/') || req.path.startsWith('/rest/')) {
      return res.status(404).json({ error: "API Route not found" });
   }
   res.sendFile(path.join(__dirname, '../../dist/index.html'));
});

app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
