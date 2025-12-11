
import express from 'express';
import cors from 'cors';
// @ts-ignore
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import morgan from 'morgan';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

// --- CRASH PREVENTION ---
process.on('uncaughtException', (err) => {
  console.error('CRITICAL ERROR (Uncaught Exception):', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL ERROR (Unhandled Rejection):', reason);
});

const prisma = new PrismaClient();
const app = express();
const PORT = Number(process.env.PORT) || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret-do-not-use-in-prod';

// Enable permissive CORS for dev (Must be first middleware)
app.use(cors({ origin: '*' }) as any);

// Increase payload size limit for base64 images
app.use(express.json({ limit: '50mb' }) as any);
app.use(express.urlencoded({ limit: '50mb', extended: true }) as any);

app.use(morgan('dev') as any);

// --- Helper: JSON Parsing for SQLite Compatibility (GET) ---
const safeParse = (val: any) => {
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
  return val;
};

// --- Middleware ---
interface AuthRequest extends express.Request {
  user?: any;
}

const authenticate = (req: any, res: any, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    (req as any).user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

// --- Health Check ---
app.get('/', (req: any, res: any) => {
  res.send('OpenStudbook Backend is running');
});

// --- Secure Auth Routes ---

// 1. LOGIN
app.post('/api/login', async (req: any, res: any) => {
  const { email, password } = req.body;
  
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    
    if (!user) {
       // Mitigation for timing attacks: verify a dummy hash if user not found
       await bcrypt.compare(password, '$2b$10$abcdefghijklmnopqrstuv'); 
       return res.status(401).json({ error: "Invalid credentials" });
    }

    const passwordValid = await bcrypt.compare(password, user.password);
    
    if (!passwordValid) {
       return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role }, 
        JWT_SECRET, 
        { expiresIn: '30d' }
    );

    // Map DB fields to Frontend fields
    const safeUser = { 
        ...user, 
        allowedProjectIds: user.allowed_project_ids || [],
        avatarUrl: user.avatar_url
    };
    
    res.json({ token, user: safeUser });
  } catch (e: any) {
    console.error("Login Error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 2. REGISTER
app.post('/api/register', async (req: any, res: any) => {
  const { orgName, userName, email, focus, password } = req.body;

  if (!email || !password || !orgName) {
      return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
        return res.status(409).json({ error: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const orgId = `org-${Date.now()}`;
    const projectId = `p-${Date.now()}`;
    const userId = `u-${Date.now()}`;

    // Transaction: Create Org -> Project -> User
    const [newOrg, newProject, newUser] = await prisma.$transaction([
      prisma.organization.create({
        data: {
          id: orgId,
          name: orgName,
          focus: focus || 'Animals',
          founded_year: new Date().getFullYear(),
          location: 'Unknown',
          description: '',
          is_org_public: false,
          is_species_public: false,
          obscure_location: false,
          allow_breeding_requests: false
        }
      }),
      prisma.project.create({
        data: {
          id: projectId,
          name: 'Main Project',
          description: 'Default project',
          org_id: orgId
        }
      }),
      prisma.user.create({
        data: {
          id: userId,
          name: userName,
          email: email,
          password: hashedPassword,
          role: 'Admin', // Default role for creator
          status: 'Active',
          allowed_project_ids: [] // Empty = All Access
        }
      })
    ]);

    const token = jwt.sign(
        { id: newUser.id, email: newUser.email, role: newUser.role }, 
        JWT_SECRET, 
        { expiresIn: '30d' }
    );

    const safeUser = { 
        ...newUser, 
        allowedProjectIds: newUser.allowed_project_ids || [],
        avatarUrl: newUser.avatar_url
    };

    res.json({ token, user: safeUser, org: newOrg });

  } catch (e: any) {
    console.error("Registration Error:", e);
    res.status(500).json({ error: e.message || "Registration failed" });
  }
});

// --- Synchronization Endpoints ---
app.get('/api/sync', authenticate, async (req: any, res: any) => {
  try {
    // Wrap database calls in a try/catch to handle potential missing table errors gracefully
    const [
      orgs, projects, users, species, individuals, 
      events, loans, partnerships, config, languages
    ] = await Promise.all([
      prisma.organization.findMany({ where: { is_deleted: false } }).catch(() => []),
      prisma.project.findMany().catch(() => []),
      prisma.user.findMany().catch(() => []),
      prisma.species.findMany().catch(() => []),
      prisma.individual.findMany().catch(() => []),
      prisma.breedingEvent.findMany().catch(() => []),
      prisma.breedingLoan.findMany().catch(() => []),
      prisma.partnership.findMany().catch(() => []),
      prisma.appConfig.findUnique({ where: { id: 'global-settings' } }).catch(() => null),
      prisma.language?.findMany({ where: { is_deleted: false } }).catch(() => []) 
    ]);

    // MAP DB SNAKE_CASE TO FRONTEND CAMELCASE
    res.json({
      success: true,
      data: {
        partners: orgs.map((o: any) => ({
            ...o,
            foundedYear: o.founded_year,
            isOrgPublic: o.is_org_public,
            isSpeciesPublic: o.is_species_public,
            obscureLocation: o.obscure_location,
            hideName: o.hide_name,
            allowBreedingRequests: o.allow_breeding_requests,
            breedingRequestContactId: o.breeding_request_contact_id,
            showNativeStatus: o.show_native_status,
            dashboardBlock: o.dashboard_block,
            deleted: o.is_deleted
        })),
        projects: projects.map((p: any) => ({ ...p, orgId: p.org_id })),
        users: users.map((u: any) => ({ 
            ...u, 
            avatarUrl: u.avatar_url, 
            allowedProjectIds: u.allowed_project_ids 
        })),
        species: species.map((s: any) => ({
            ...s,
            projectId: s.project_id,
            commonName: s.common_name,
            scientificName: s.scientific_name,
            type: s.type,
            plant_classification: s.plant_classification,
            conservationStatus: s.conservation_status,
            sexualMaturityAgeYears: s.sexual_maturity_age_years,
            averageAdultWeightKg: s.average_adult_weight_kg,
            lifeExpectancyYears: s.life_expectancy_years,
            breedingSeasonStart: s.breeding_season_start,
            breedingSeasonEnd: s.breeding_season_end,
            imageUrl: s.image_url,
            nativeStatusCountry: s.native_status_country,
            nativeStatusLocal: s.native_status_local
        })),
        individuals: individuals.map((i: any) => ({
            ...i,
            projectId: i.project_id,
            speciesId: i.species_id,
            studbookId: i.studbook_id,
            birthDate: i.birth_date,
            weightKg: i.weight_kg,
            sireId: i.sire_id,
            damId: i.dam_id,
            imageUrl: i.image_url,
            dnaSequence: i.dna_sequence,
            sourceDetails: i.source_details,
            isDeceased: i.is_deceased,
            deathDate: i.death_date,
            loanStatus: i.loan_status,
            transferredToOrgId: i.transferred_to_org_id,
            transferDate: i.transfer_date,
            transferNote: i.transfer_note,
            weightHistory: i.weight_history,
            growthHistory: i.growth_history,
            healthHistory: i.health_history
        })),
        breedingEvents: events.map((e: any) => ({
            ...e,
            speciesId: e.species_id,
            sireId: e.sire_id,
            damId: e.dam_id,
            offspringCount: e.offspring_count,
            successfulBirths: e.successful_births,
            losses: e.losses,
            notes: e.notes,
            offspringIds: e.offspring_ids
        })),
        breedingLoans: loans.map((l: any) => ({
            ...l,
            partnerOrgId: l.partner_org_id,
            proposer_org_id: l.proposer_org_id,
            role: l.role,
            startDate: l.start_date,
            endDate: l.end_date,
            status: l.status,
            individual_ids: l.individual_ids || [],
            terms: l.terms,
            notification_recipient_id: l.notification_recipient_id || null,
            change_request: l.change_request || null
        })),
        partnerships: partnerships.map((p: any) => ({
            ...p,
            orgId1: p.org_id_1,
            orgId2: p.org_id_2,
            establishedDate: p.established_date
        })),
        settings: config ? config.settings : {},
        languages: (languages || []).map((l: any) => ({
            code: l.code,
            name: l.name,
            translations: l.translations,
            is_default: l.is_default,
            manual_overrides: l.manual_overrides,
            deleted: l.is_deleted
        }))
      }
    });
  } catch (e: any) {
    console.error("Sync Error:", e);
    res.status(500).json({ success: false, message: e.message });
  }
});

// Helper for Upserts
const createUpsertHandler = (table: any, prepareBody: (body: any) => any, idField: string = 'id') => async (req: any, res: any) => {
    try {
        const rawData = req.body;
        const items = Array.isArray(rawData) ? rawData : [rawData];
        
        if (!table) {
            console.error(`Database Table Missing for ID Field: ${idField}.`);
            return res.status(500).json({ success: false, message: `Database table not initialized for ${idField}.` });
        }

        for (const rawItem of items) {
            const item = prepareBody(rawItem);
            const whereClause: any = {};
            whereClause[idField] = item[idField];

            // Filter out undefined keys to prevent Prisma validation errors
            Object.keys(item).forEach(key => item[key] === undefined && delete item[key]);

            await table.upsert({
                where: whereClause,
                update: item,
                create: item
            });
        }
        res.json({ success: true });
    } catch (e: any) {
        console.error(`Upsert Error (${idField}):`, e);
        // Return full error details to help debugging
        res.status(500).json({ success: false, message: e.message, details: e.meta || e.clientVersion });
    }
};

// Prep functions - explicitly define what to pass through to strip any extra/unknown fields
const prepOrg = (o: any) => ({
    id: o.id, name: o.name, location: o.location, latitude: o.latitude, longitude: o.longitude,
    founded_year: o.founded_year, description: o.description, focus: o.focus,
    is_org_public: o.is_org_public, is_species_public: o.is_species_public,
    obscure_location: o.obscure_location, hide_name: o.hide_name,
    allow_breeding_requests: o.allow_breeding_requests, breeding_request_contact_id: o.breeding_request_contact_id,
    show_native_status: o.show_native_status, dashboard_block: o.dashboard_block, is_deleted: o.is_deleted
});
const prepProject = (p: any) => ({
    id: p.id, org_id: p.org_id, name: p.name, description: p.description
});
const prepUser = (u: any) => ({
    id: u.id, name: u.name, email: u.email, role: u.role, status: u.status,
    password: u.password, avatar_url: u.avatar_url, allowed_project_ids: u.allowed_project_ids
});
const prepSpecies = (s: any) => ({
    id: s.id, project_id: s.project_id, common_name: s.common_name, scientific_name: s.scientific_name,
    type: s.type, plant_classification: s.plant_classification, conservation_status: s.conservation_status,
    sexual_maturity_age_years: s.sexual_maturity_age_years, average_adult_weight_kg: s.average_adult_weight_kg,
    life_expectancy_years: s.life_expectancy_years, breeding_season_start: s.breeding_season_start,
    breeding_season_end: s.breeding_season_end, image_url: s.image_url,
    native_status_country: s.native_status_country, native_status_local: s.native_status_local
});
const prepInd = (i: any) => ({
    id: i.id, project_id: i.project_id, species_id: i.species_id, studbook_id: i.studbook_id,
    name: i.name, sex: i.sex, birth_date: i.birth_date, weight_kg: i.weight_kg,
    sire_id: i.sire_id, dam_id: i.dam_id, image_url: i.image_url, dna_sequence: i.dna_sequence,
    notes: i.notes, source: i.source, source_details: i.source_details,
    latitude: i.latitude, longitude: i.longitude, is_deceased: i.is_deceased, death_date: i.death_date,
    loan_status: i.loan_status, transferred_to_org_id: i.transferred_to_org_id,
    transfer_date: i.transfer_date, transfer_note: i.transfer_note,
    weight_history: i.weight_history, growth_history: i.growth_history, health_history: i.health_history
});
const prepEvent = (e: any) => ({
    id: e.id, species_id: e.species_id, sire_id: e.sire_id, dam_id: e.dam_id, date: e.date,
    offspring_count: e.offspring_count, successful_births: e.successful_births,
    losses: e.losses, notes: e.notes, offspring_ids: e.offspring_ids
});
const prepLoan = (l: any) => ({
    id: l.id, partner_org_id: l.partner_org_id, proposer_org_id: l.proposer_org_id,
    role: l.role, start_date: l.start_date, end_date: l.end_date, status: l.status,
    individual_ids: l.individual_ids, terms: l.terms,
    notification_recipient_id: l.notification_recipient_id, change_request: l.change_request
});
const prepConfig = (c: any) => c;
const prepLang = (l: any) => ({
    code: l.code, name: l.name, translations: l.translations, is_default: l.is_default,
    manual_overrides: l.manual_overrides, is_deleted: l.is_deleted
});

// Define routes with prep functions
app.post('/rest/v1/organizations', createUpsertHandler(prisma.organization, prepOrg));
app.post('/rest/v1/projects', createUpsertHandler(prisma.project, prepProject));
app.post('/rest/v1/users', createUpsertHandler(prisma.user, prepUser));
app.post('/rest/v1/species', createUpsertHandler(prisma.species, prepSpecies));
app.post('/rest/v1/individuals', createUpsertHandler(prisma.individual, prepInd));
app.post('/rest/v1/breeding_events', createUpsertHandler(prisma.breedingEvent, prepEvent));
app.post('/rest/v1/breeding_loans', createUpsertHandler(prisma.breedingLoan, prepLoan));
app.post('/rest/v1/partnerships', createUpsertHandler(prisma.partnership, (x: any) => x));
app.post('/rest/v1/app_config', createUpsertHandler(prisma.appConfig, prepConfig));
app.post('/rest/v1/languages', createUpsertHandler(prisma.language, prepLang, 'code')); 

// Soft Delete
app.patch('/rest/v1/organizations', async (req: any, res: any) => {
    try {
        const id = (req.query.id as string)?.replace('eq.', '');
        if (id) {
            await prisma.organization.update({
                where: { id },
                data: { is_deleted: true }
            });
            return res.json({ success: true });
        }
        res.status(400).json({ error: "Missing ID" });
    } catch(e:any) {
        res.status(500).json({ error: e.message });
    }
});

app.patch('/rest/v1/languages', async (req: any, res: any) => {
    try {
        const code = (req.query.code as string)?.replace('eq.', '');
        // Safeguard against undefined prisma.language (if client not regenerated)
        if (code && prisma.language) {
            await prisma.language.update({
                where: { code },
                data: { is_deleted: true }
            });
            return res.json({ success: true });
        } else if (!prisma.language) {
            return res.status(500).json({ error: "Language table not initialized." });
        }
        res.status(400).json({ error: "Missing Code" });
    } catch(e:any) {
        res.status(500).json({ error: e.message });
    }
});

// Bind to default to allow Node to handle dual-stack
app.listen(PORT, () => {
  console.log(`OpenStudbook Backend running on port ${PORT}`);
});
