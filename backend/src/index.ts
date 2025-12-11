import express from 'express';
import cors from 'cors';
// @ts-ignore
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import morgan from 'morgan';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret-do-not-use-in-prod';

// Increase payload size limit for base64 images
app.use(express.json({ limit: '50mb' }) as any);
app.use(express.urlencoded({ limit: '50mb', extended: true }) as any);

// Enable permissive CORS for dev
app.use(cors({ origin: '*' }) as any);

app.use(morgan('dev') as any);

// --- Helper: JSON Serializer for SQLite ---
// SQLite doesn't strictly support JSON types in all Prisma versions or configurations.
// We safely parse strings back to JSON for GET, and stringify JSON for POST/PUT.

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

const safeStringify = (val: any) => {
  if (typeof val === 'object' && val !== null) {
    return JSON.stringify(val);
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
    return next(); // Bypassing auth for easier migration/demo testing
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

// --- Auth Routes ---

app.post('/api/login', async (req: any, res: any) => {
  const { email, password } = req.body;
  
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    
    if (!user || user.password !== password) { 
       return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role }, 
        JWT_SECRET, 
        { expiresIn: '30d' }
    );
    
    // Parse allowed_project_ids before returning
    const safeUser = { ...user, allowed_project_ids: safeParse(user.allowed_project_ids) };
    res.json({ token, user: safeUser });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// --- Synchronization Endpoints ---

// GET /api/sync - Returns all data for the frontend to cache
app.get('/api/sync', authenticate, async (req: any, res: any) => {
  try {
    const [
      orgs, projects, users, species, individuals, 
      events, loans, partnerships, config, languages
    ] = await Promise.all([
      prisma.organization.findMany({ where: { is_deleted: false } }),
      prisma.project.findMany(),
      prisma.user.findMany(),
      prisma.species.findMany(),
      prisma.individual.findMany(),
      prisma.breedingEvent.findMany(),
      prisma.breedingLoan.findMany(),
      prisma.partnership.findMany(),
      prisma.appConfig.findUnique({ where: { id: 'global-settings' } }),
      prisma.language.findMany({ where: { is_deleted: false } })
    ]);

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
            dashboardBlock: safeParse(o.dashboard_block),
            deleted: o.is_deleted
        })),
        projects: projects.map((p: any) => ({ ...p, orgId: p.org_id })),
        users: users.map((u: any) => ({ 
            ...u, 
            avatarUrl: u.avatar_url, 
            allowedProjectIds: safeParse(u.allowed_project_ids) 
        })),
        species: species.map((s: any) => ({
            ...s,
            projectId: s.project_id,
            commonName: s.common_name,
            scientificName: s.scientific_name,
            plantClassification: s.plant_classification,
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
            weightHistory: safeParse(i.weight_history),
            growthHistory: safeParse(i.growth_history),
            healthHistory: safeParse(i.health_history)
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
            offspringIds: safeParse(e.offspring_ids)
        })),
        breedingLoans: loans.map((l: any) => ({
            ...l,
            partnerOrgId: l.partner_org_id,
            proposerOrgId: l.proposer_org_id,
            role: l.role,
            start_date: l.start_date,
            end_date: l.end_date || null,
            status: l.status,
            individualIds: safeParse(l.individual_ids) || [],
            terms: l.terms,
            notificationRecipientId: l.notification_recipient_id || null,
            changeRequest: safeParse(l.change_request) || null
        })),
        partnerships: partnerships.map((p: any) => ({
            ...p,
            orgId1: p.org_id_1,
            orgId2: p.org_id_2,
            establishedDate: p.established_date
        })),
        settings: config ? safeParse(config.settings) : {},
        languages: languages.map((l: any) => ({
            code: l.code,
            name: l.name,
            translations: safeParse(l.translations),
            isDefault: l.is_default,
            manualOverrides: safeParse(l.manual_overrides),
            deleted: l.is_deleted
        }))
      }
    });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ success: false, message: e.message });
  }
});

// Helper for Upserts with Manual Serializer
const createUpsertHandler = (table: any, prepareBody: (body: any) => any) => async (req: any, res: any) => {
    try {
        const rawData = req.body;
        // Handle array or single object
        const items = Array.isArray(rawData) ? rawData : [rawData];
        
        for (const rawItem of items) {
            const item = prepareBody(rawItem);
            await table.upsert({
                where: { id: item.id || item.code },
                update: item,
                create: item
            });
        }
        res.json({ success: true });
    } catch (e: any) {
        console.error(`Upsert Error:`, e);
        res.status(500).json({ success: false, message: e.message });
    }
};

// Prep functions to handle JSON stringification
const prepOrg = (o: any) => ({ ...o, dashboard_block: safeStringify(o.dashboard_block) });
const prepUser = (u: any) => ({ ...u, allowed_project_ids: safeStringify(u.allowed_project_ids) });
const prepInd = (i: any) => ({ 
    ...i, 
    weight_history: safeStringify(i.weight_history),
    growth_history: safeStringify(i.growth_history),
    health_history: safeStringify(i.health_history)
});
const prepEvent = (e: any) => ({ ...e, offspring_ids: safeStringify(e.offspring_ids) });
const prepLoan = (l: any) => ({ 
    ...l, 
    individual_ids: safeStringify(l.individual_ids),
    change_request: safeStringify(l.change_request)
});
const prepConfig = (c: any) => ({ ...c, settings: safeStringify(c.settings) });
const prepLang = (l: any) => ({
    ...l,
    translations: safeStringify(l.translations),
    manual_overrides: safeStringify(l.manual_overrides)
});

// Define routes
app.post('/rest/v1/organizations', createUpsertHandler(prisma.organization, prepOrg));
app.post('/rest/v1/projects', createUpsertHandler(prisma.project, (x: any) => x));
app.post('/rest/v1/users', createUpsertHandler(prisma.user, prepUser));
app.post('/rest/v1/species', createUpsertHandler(prisma.species, (x: any) => x));
app.post('/rest/v1/individuals', createUpsertHandler(prisma.individual, prepInd));
app.post('/rest/v1/breeding_events', createUpsertHandler(prisma.breedingEvent, prepEvent));
app.post('/rest/v1/breeding_loans', createUpsertHandler(prisma.breedingLoan, prepLoan));
app.post('/rest/v1/partnerships', createUpsertHandler(prisma.partnership, (x: any) => x));
app.post('/rest/v1/app_config', createUpsertHandler(prisma.appConfig, prepConfig));
app.post('/rest/v1/languages', createUpsertHandler(prisma.language, prepLang));

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
        if (code) {
            await prisma.language.update({
                where: { code },
                data: { is_deleted: true }
            });
            return res.json({ success: true });
        }
        res.status(400).json({ error: "Missing Code" });
    } catch(e:any) {
        res.status(500).json({ error: e.message });
    }
});

// Start Server
app.listen(PORT, () => {
  console.log(`OpenStudbook Backend running on http://localhost:${PORT}`);
});
