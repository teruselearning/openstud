import express, { Request as ExpressRequest, Response as ExpressResponse, NextFunction, RequestHandler } from 'express';
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
app.use(express.json({ limit: '50mb' }) as RequestHandler);
app.use(express.urlencoded({ limit: '50mb', extended: true }) as RequestHandler);
app.use(cors());
app.use(morgan('dev') as RequestHandler);

// --- Middleware ---

interface AuthRequest extends ExpressRequest {
  user?: any;
}

const authenticate = (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    // For the initial migration/sync phase, if no token is provided, 
    // we might want to allow it OR strictly enforce it. 
    // The frontend currently doesn't send Bearer tokens in syncService.ts.
    // TODO: Update Frontend syncService.ts to send headers.
    // For now, we will proceed but log a warning, or require a specific header.
    // return res.status(401).json({ error: "No token provided" });
    return next(); // Bypassing auth for easier migration testing
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

// --- Auth Routes ---

app.post('/api/login', async (req: ExpressRequest, res: ExpressResponse) => {
  const { email, password } = req.body;
  
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    
    // NOTE: In a real app, you must compare hashed passwords using bcrypt.
    // The current frontend sends a pre-hashed SHA-256 string as the 'password'.
    // We compare that hash directly with the stored hash.
    if (!user || user.password !== password) { 
       return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role }, 
        JWT_SECRET, 
        { expiresIn: '30d' }
    );
    
    res.json({ token, user });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// --- Synchronization Endpoints ---

// GET /api/sync - Returns all data for the frontend to cache
app.get('/api/sync', authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
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

    // Format matches frontend expectations from fetchRemoteData
    res.json({
      success: true,
      data: {
        // In a real multi-tenant app, we would filter 'org' by the logged-in user's org.
        // Here we return all (assuming single instance or super admin view for sync).
        // The frontend filters "My Org" vs "Partners" client-side.
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
            deleted: o.is_deleted
        })),
        projects: projects.map((p: any) => ({ ...p, orgId: p.org_id })),
        users: users.map((u: any) => ({ ...u, avatarUrl: u.avatar_url, allowedProjectIds: u.allowed_project_ids })),
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
            proposerOrgId: l.proposer_org_id,
            startDate: l.start_date,
            endDate: l.end_date,
            individualIds: l.individual_ids,
            notificationRecipientId: l.notification_recipient_id,
            changeRequest: l.change_request
        })),
        partnerships: partnerships.map((p: any) => ({
            ...p,
            orgId1: p.org_id_1,
            orgId2: p.org_id_2,
            establishedDate: p.established_date
        })),
        settings: config?.settings,
        languages: languages.map((l: any) => ({
            code: l.code,
            name: l.name,
            translations: l.translations,
            isDefault: l.is_default,
            manualOverrides: l.manual_overrides,
            deleted: l.is_deleted
        }))
      }
    });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ success: false, message: e.message });
  }
});

// Helper for Upserts
const createUpsertHandler = (table: any, mapper: (body: any) => any) => async (req: ExpressRequest, res: ExpressResponse) => {
    try {
        const data = req.body;
        // Handle array or single object
        const items = Array.isArray(data) ? data : [data];
        
        for (const item of items) {
            // Check if item has ID, if so upsert
            // The frontend mappers (in syncService.ts) send data with DB column names if using Supabase client,
            // but since we are replacing the client, the frontend might be sending frontend keys.
            // *Critial Assumption*: The frontend syncService.ts maps to snake_case before sending.
            // Based on the user prompt's `syncService.ts`, the frontend creates objects like:
            // { id:..., name:..., location:..., is_org_public:... }
            // So we can pass them directly to Prisma if keys match.
            
            // However, Prisma generated types usually use camelCase for fields in JavaScript
            // but map to snake_case in DB.
            // We need to ensure the incoming body matches the Prisma Client Model field names.
            
            // Since `syncService.ts` manually mapped keys to snake_case (e.g. `is_org_public`), 
            // but Prisma expects `is_org_public` defined in schema as `is_org_public Boolean ...`?
            // Wait, in schema.prisma above I defined: `is_org_public Boolean @default(false)`
            // Prisma Client JS will expose this as `is_org_public`.
            // So if `syncService.ts` sends snake_case, we are good.
            
            await table.upsert({
                where: { id: item.id || item.code }, // Code for languages
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

// Define routes using the generic handler
// Note: We use the exact paths the frontend calls
app.post('/rest/v1/organizations', createUpsertHandler(prisma.organization, (x: any) => x));
app.post('/rest/v1/projects', createUpsertHandler(prisma.project, (x: any) => x));
app.post('/rest/v1/users', createUpsertHandler(prisma.user, (x: any) => x));
app.post('/rest/v1/species', createUpsertHandler(prisma.species, (x: any) => x));
app.post('/rest/v1/individuals', createUpsertHandler(prisma.individual, (x: any) => x));
app.post('/rest/v1/breeding_events', createUpsertHandler(prisma.breedingEvent, (x: any) => x));
app.post('/rest/v1/breeding_loans', createUpsertHandler(prisma.breedingLoan, (x: any) => x));
app.post('/rest/v1/partnerships', createUpsertHandler(prisma.partnership, (x: any) => x));
app.post('/rest/v1/app_config', createUpsertHandler(prisma.appConfig, (x: any) => x));
app.post('/rest/v1/languages', createUpsertHandler(prisma.language, (x: any) => x));

// Soft Delete Endpoints (triggered via PATCH or POST depending on Supabase client usage, 
// but typically Supabase client sends `UPDATE` which maps to PATCH in REST)
app.patch('/rest/v1/organizations', async (req: ExpressRequest, res: ExpressResponse) => {
    try {
        const id = req.query.id?.toString().replace('eq.', '');
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

app.patch('/rest/v1/languages', async (req: ExpressRequest, res: ExpressResponse) => {
    try {
        const code = req.query.code?.toString().replace('eq.', '');
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