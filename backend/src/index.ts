import express from 'express';
import cors from 'cors';
// @ts-ignore
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import morgan from 'morgan';
import dotenv from 'dotenv';

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
    // Note: allowedProjectIds is the Prisma field name for the text[] column allowed_project_ids
    const safeUser = { ...user, allowedProjectIds: user.allowedProjectIds };
    res.json({ token, user: safeUser });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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
      prisma.organization.findMany({ where: { isDeleted: false } }).catch(() => []),
      prisma.project.findMany().catch(() => []),
      prisma.user.findMany().catch(() => []),
      prisma.species.findMany().catch(() => []),
      prisma.individual.findMany().catch(() => []),
      prisma.breedingEvent.findMany().catch(() => []),
      prisma.breedingLoan.findMany().catch(() => []),
      prisma.partnership.findMany().catch(() => []),
      prisma.appConfig.findUnique({ where: { id: 'global-settings' } }).catch(() => null),
      prisma.language?.findMany({ where: { isDeleted: false } }).catch(() => []) 
    ]);

    // Note: Prisma Client normalizes snake_case columns to camelCase fields by default.
    // e.g. founded_year -> foundedYear
    res.json({
      success: true,
      data: {
        partners: orgs.map((o: any) => ({
            ...o,
            foundedYear: o.foundedYear,
            isOrgPublic: o.isOrgPublic,
            isSpeciesPublic: o.isSpeciesPublic,
            obscureLocation: o.obscureLocation,
            hideName: o.hideName,
            allowBreedingRequests: o.allowBreedingRequests,
            breedingRequestContactId: o.breedingRequestContactId,
            showNativeStatus: o.showNativeStatus,
            dashboardBlock: o.dashboardBlock,
            deleted: o.isDeleted
        })),
        projects: projects.map((p: any) => ({ ...p, orgId: p.orgId })),
        users: users.map((u: any) => ({ 
            ...u, 
            avatarUrl: u.avatarUrl, 
            allowedProjectIds: u.allowedProjectIds 
        })),
        species: species.map((s: any) => ({
            ...s,
            projectId: s.projectId,
            commonName: s.commonName,
            scientificName: s.scientificName,
            plantClassification: s.plantClassification,
            conservationStatus: s.conservationStatus,
            sexualMaturityAgeYears: s.sexualMaturityAgeYears,
            averageAdultWeightKg: s.averageAdultWeightKg,
            lifeExpectancyYears: s.lifeExpectancyYears,
            breedingSeasonStart: s.breedingSeasonStart,
            breedingSeasonEnd: s.breedingSeasonEnd,
            imageUrl: s.imageUrl,
            nativeStatusCountry: s.nativeStatusCountry,
            nativeStatusLocal: s.nativeStatusLocal
        })),
        individuals: individuals.map((i: any) => ({
            ...i,
            projectId: i.projectId,
            speciesId: i.speciesId,
            studbookId: i.studbookId,
            birthDate: i.birthDate,
            weightKg: i.weightKg,
            sireId: i.sireId,
            damId: i.damId,
            imageUrl: i.imageUrl,
            dnaSequence: i.dnaSequence,
            sourceDetails: i.sourceDetails,
            isDeceased: i.isDeceased,
            deathDate: i.deathDate,
            loanStatus: i.loanStatus,
            transferredToOrgId: i.transferredToOrgId,
            transferDate: i.transferDate,
            transferNote: i.transferNote,
            weightHistory: i.weightHistory,
            growthHistory: i.growthHistory,
            healthHistory: i.healthHistory
        })),
        breedingEvents: events.map((e: any) => ({
            ...e,
            speciesId: e.speciesId,
            sireId: e.sireId,
            damId: e.damId,
            offspringCount: e.offspringCount,
            successfulBirths: e.successfulBirths,
            losses: e.losses,
            notes: e.notes,
            offspringIds: e.offspringIds
        })),
        breedingLoans: loans.map((l: any) => ({
            ...l,
            partnerOrgId: l.partnerOrgId,
            proposerOrgId: l.proposerOrgId,
            role: l.role,
            startDate: l.startDate,
            endDate: l.endDate || null,
            status: l.status,
            individualIds: l.individualIds || [],
            terms: l.terms,
            notificationRecipientId: l.notificationRecipientId || null,
            changeRequest: l.changeRequest || null
        })),
        partnerships: partnerships.map((p: any) => ({
            ...p,
            orgId1: p.orgId1,
            orgId2: p.orgId2,
            establishedDate: p.establishedDate
        })),
        settings: config ? config.settings : {},
        languages: (languages || []).map((l: any) => ({
            code: l.code,
            name: l.name,
            translations: l.translations,
            isDefault: l.isDefault,
            manualOverrides: l.manualOverrides,
            deleted: l.isDeleted
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
            console.error(`Database Table Missing. ID Field: ${idField}. Run 'npx prisma generate' or check schema.`);
            return res.status(500).json({ success: false, message: `Database table not initialized for ${idField}.` });
        }

        for (const rawItem of items) {
            const item = prepareBody(rawItem);
            const whereClause: any = {};
            whereClause[idField] = item[idField];

            await table.upsert({
                where: whereClause,
                update: item,
                create: item
            });
        }
        res.json({ success: true });
    } catch (e: any) {
        console.error(`Upsert Error (${idField}):`, e);
        res.status(500).json({ success: false, message: e.message });
    }
};

// Prep functions
const prepOrg = (o: any) => o;
const prepUser = (u: any) => u;
const prepInd = (i: any) => i;
const prepEvent = (e: any) => e;
const prepLoan = (l: any) => l;
const prepConfig = (c: any) => c;
const prepLang = (l: any) => l;

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
app.post('/rest/v1/languages', createUpsertHandler(prisma.language, prepLang, 'code')); 

// Soft Delete
app.patch('/rest/v1/organizations', async (req: any, res: any) => {
    try {
        const id = (req.query.id as string)?.replace('eq.', '');
        if (id) {
            await prisma.organization.update({
                where: { id },
                data: { isDeleted: true }
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
                data: { isDeleted: true }
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
