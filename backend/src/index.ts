
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

// Temporary memory store for password reset codes
const resetCodes = new Map<string, { code: string, expires: number }>();

// --- EMAIL TRANSPORTER HELPER ---
const getTransporter = async () => {
  try {
    const config: any = await (prisma as any).appConfig.findUnique({ where: { id: 'global-settings' } });
    const settings = (config?.settings || {}) as any;

    // Strictly check if host is configured and not a placeholder
    const hasHost = settings.smtpHost && typeof settings.smtpHost === 'string' && settings.smtpHost.trim() !== '' && !settings.smtpHost.includes('your-smtp');

    if (hasHost) {
      console.log(`[EMAIL] Using configured SMTP: ${settings.smtpHost}:${settings.smtpPort}`);
      return nodemailer.createTransport({
        host: settings.smtpHost,
        port: Number(settings.smtpPort) || 587,
        secure: !!settings.smtpSecure,
        auth: {
          user: settings.smtpUser,
          pass: settings.smtpPass,
        },
      });
    }

    // Default Fallback to Mailcatcher
    console.log(`[EMAIL] No valid SMTP configured. Falling back to Mailcatcher (127.0.0.1:1025)`);
    return nodemailer.createTransport({
      host: '127.0.0.1',
      port: 1025,
      secure: false,
      ignoreTLS: true
    });
  } catch (e) {
    console.error("[EMAIL] Transporter init error, falling back to local:", e);
    return nodemailer.createTransport({ host: '127.0.0.1', port: 1025 });
  }
};

// --- BCRYPT SELF TEST ---
const runBcryptSelfTest = async () => {
  console.log('[SYSTEM] Running Bcrypt self-test...');
  try {
    const testPass = 'password';
    const testHash = await bcrypt.hash(testPass, 10);
    const result = await bcrypt.compare(testPass, testHash);
    if (result) {
      console.log('[SYSTEM] Bcrypt self-test PASSED.');
    } else {
      console.error('[CRITICAL] Bcrypt self-test FAILED! Comparison logic is broken in this environment.');
    }
  } catch (e) {
    console.error('[CRITICAL] Bcrypt self-test errored:', e);
  }
};
runBcryptSelfTest();

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

app.get('/api/health', (req: any, res: any) => res.json({ status: 'ok', version: '1.0.11' }));

// --- EMAIL ROUTES ---

app.post('/api/email/send', authenticate, async (req: any, res: any) => {
  const { to, subject, html } = req.body;
  if (!to || !subject || !html) return res.status(400).json({ error: "Missing required fields" });

  try {
    const transporter = await getTransporter();
    await transporter.sendMail({
      from: '"OpenStudbook" <noreply@openstudbook.org>',
      to,
      subject,
      html
    });
    res.json({ success: true });
  } catch (e: any) {
    console.error("[EMAIL] Send failed:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/email/test', authenticate, async (req: any, res: any) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: "To address required" });

  try {
    const transporter = await getTransporter();
    await transporter.sendMail({
      from: '"OpenStudbook Test" <noreply@openstudbook.org>',
      to,
      subject: "SMTP Connection Test",
      text: "If you received this, your OpenStudbook SMTP configuration (or fallback) is working correctly.",
      html: "<h3>SMTP Connection Test</h3><p>If you received this, your OpenStudbook SMTP configuration (or fallback) is working correctly.</p>"
    });
    res.json({ success: true, message: "Test email sent successfully!" });
  } catch (e: any) {
    console.error("[EMAIL] Test failed:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Proper Forgot Password flow
app.post('/api/auth/forgot-password', async (req: any, res: any) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });
  const cleanEmail = String(email).toLowerCase().trim();
  
  console.log(`[AUTH] Forgot password request for: ${cleanEmail}`);
  
  try {
    const user: any = await (prisma as any).user.findUnique({ where: { email: cleanEmail } });
    if (!user) {
      console.log(`[AUTH] User not found for forgot-password: ${cleanEmail}`);
      // Don't reveal if user exists or not for security
      return res.json({ success: true, message: "If an account exists, a code has been sent." });
    }
    
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    resetCodes.set(cleanEmail, { code, expires: Date.now() + 15 * 60 * 1000 }); // 15 mins
    
    console.log(`[AUTH] NEW CODE for ${cleanEmail}: ${code}`);
    
    // Attempt to send email
    try {
      const transporter = await getTransporter();
      await transporter.sendMail({
        from: '"OpenStudbook" <security@openstudbook.org>',
        to: cleanEmail,
        subject: "Password Reset Code",
        html: `<h3>Reset Your Password</h3><p>Your verification code is: <b>${code}</b></p><p>This code will expire in 15 minutes.</p>`
      });
      console.log(`[EMAIL] Reset code sent to ${cleanEmail} via SMTP.`);
    } catch (mailErr: any) {
      console.warn(`[AUTH] Mail sending failed, but code is logged above: ${mailErr.message}`);
    }

    return res.json({ success: true, message: "Verification code sent to email." });
  } catch (e: any) {
    console.error(`[AUTH] Critical failure in forgot-password for ${cleanEmail}:`, e.message);
    return res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/reset-password', async (req: any, res: any) => {
  const { email, code, newPassword } = req.body;
  if (!email || !code || !newPassword) return res.status(400).json({ error: "Missing required fields" });
  
  const cleanEmail = String(email).toLowerCase().trim();
  console.log(`[AUTH] Resetting password for: ${cleanEmail}`);
  
  const record = resetCodes.get(cleanEmail);
  if (!record || record.code !== String(code) || record.expires < Date.now()) {
    console.log(`[AUTH] Invalid or expired code attempt for: ${cleanEmail}`);
    return res.status(400).json({ error: "Invalid or expired code." });
  }
  
  try {
    const hashedPassword = await bcrypt.hash(String(newPassword), 10);
    await (prisma as any).user.update({
      where: { email: cleanEmail },
      data: { password: hashedPassword }
    });
    resetCodes.delete(cleanEmail);
    console.log(`[AUTH] Password changed successfully for ${cleanEmail}`);
    return res.json({ success: true, message: "Password updated successfully." });
  } catch (e: any) {
    console.error(`[AUTH] Reset failed for ${cleanEmail}:`, e.message);
    return res.status(500).json({ error: e.message });
  }
});

app.post('/api/rescue/reset-password', async (req: any, res: any) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });
  try {
    const hashedPassword = await bcrypt.hash("password", 10);
    const cleanEmail = String(email).toLowerCase().trim();
    await (prisma as any).user.update({
      where: { email: cleanEmail },
      data: { password: hashedPassword }
    });
    console.log(`[RESCUE] Password for ${cleanEmail} reset to "password".`);
    res.json({ success: true, message: `Password for ${cleanEmail} reset to "password"` });
  } catch (e: any) {
    console.error("[RESCUE] Failed:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/login', async (req: any, res: any) => {
  const { email, password } = req.body;
  const cleanEmail = email?.toLowerCase().trim();
  
  console.log(`[LOGIN] Attempt: ${cleanEmail}`);
  
  try {
    const user: any = await (prisma as any).user.findUnique({ where: { email: cleanEmail } });
    
    if (!user) {
       console.log(`[LOGIN] User NOT found: ${cleanEmail}`);
       return res.status(401).json({ error: "Invalid credentials" });
    }

    const inputPass = String(password);
    const dbHash = String(user.password || '').trim();
    
    let passwordValid = false;
    if (dbHash) {
       passwordValid = await bcrypt.compare(inputPass, dbHash);
    }
    
    // EMERGENCY BYPASS FOR ZOE
    if (!passwordValid && cleanEmail === 'zoe@openstudbook.org' && inputPass === 'password') {
       console.warn(`[AUTH] EMERGENCY BYPASS triggered for zoe@openstudbook.org`);
       passwordValid = true;
    }
    
    if (!passwordValid) {
       console.log(`[LOGIN] Auth FAILED for: ${cleanEmail}`);
       return res.status(401).json({ error: "Invalid credentials" });
    }

    // FIX: Safely check for organization ID
    const actualOrgId = user.org_id || user.orgId;
    let organization = null;
    
    if (actualOrgId && typeof actualOrgId === 'string' && actualOrgId.length > 0) {
       organization = await (prisma as any).organization.findUnique({ where: { id: actualOrgId } });
    }

    // SPECIAL HANDLING: If Super Admin has no org, try to find the first available org
    if (!organization && user.role === 'Super Admin') {
       const firstOrg = await (prisma as any).organization.findFirst({ where: { is_deleted: false } });
       if (firstOrg) {
          console.log(`[LOGIN] Super Admin associated with first available org: ${firstOrg.name}`);
          organization = firstOrg;
          await (prisma as any).user.update({
             where: { id: user.id },
             data: { org_id: firstOrg.id }
          });
       }
    }

    console.log(`[LOGIN] SUCCESS: ${cleanEmail} (Org: ${organization?.name || 'None'})`);
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, orgId: actualOrgId || organization?.id }, JWT_SECRET, { expiresIn: '30d' });
    
    res.json({ 
      token, 
      user: { 
        ...user, 
        orgId: actualOrgId || organization?.id,
        allowedProjectIds: user.allowed_project_ids || user.allowedProjectIds || [], 
        avatarUrl: user.avatar_url || user.avatarUrl
      },
      organization: organization || undefined
    });
  } catch (e: any) {
    console.error("[LOGIN] SERVER ERROR:", e);
    res.status(500).json({ error: "Internal server error" });
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
            
            if (idField === 'id' && item.password) {
               const p = String(item.password);
               if (!p.startsWith('$2a$') && !p.startsWith('$2b$') && !p.startsWith('$2y$')) {
                  item.password = await bcrypt.hash(p, 10);
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
const prepUser = (u: any) => ({ id: u.id, org_id: u.orgId || u.org_id, name: u.name, email: u.email?.toLowerCase().trim(), role: u.role, status: u.status, password: u.password, avatar_url: u.avatar_url, allowed_project_ids: u.allowed_project_ids });
const prepSpecies = (s: any) => ({ id: s.id, project_id: s.project_id, common_name: s.common_name, scientific_name: s.scientific_name, type: s.type, plant_classification: s.plant_classification, conservation_status: s.conservation_status, sexual_maturity_age_years: s.sexual_maturity_age_years, average_adult_weight_kg: s.average_adult_weight_kg, life_expectancy_years: s.life_expectancy_years, breeding_season_start: s.breeding_season_start, breeding_season_end: s.breeding_season_end, image_url: s.image_url, native_status_country: s.native_status_country, native_status_local: s.native_status_local });
const prepInd = (i: any) => ({ id: i.id, project_id: i.project_id, species_id: i.species_id, studbook_id: i.studbook_id, name: i.name, sex: i.sex, birth_date: i.birth_date, weight_kg: i.weight_kg, sire_id: i.sire_id, dam_id: i.dam_id, image_url: i.image_url, dna_sequence: i.dna_sequence, notes: i.notes, source: i.source, source_details: i.source_details, latitude: i.latitude, longitude: i.longitude, is_deceased: i.is_deceased, death_date: i.death_date, loan_status: i.loan_status, transferred_to_org_id: i.transferred_to_org_id, transfer_date: i.transfer_date, transfer_note: i.transfer_note, weight_history: i.weight_history, growth_history: i.growth_history, health_history: i.health_history });

app.post('/rest/v1/organizations', createUpsertHandler((prisma as any).organization, prepOrg));
app.post('/rest/v1/projects', createUpsertHandler((prisma as any).project, prepProject));
app.post('/rest/v1/users', createUpsertHandler((prisma as any).user, prepUser));
app.post('/rest/v1/species', createUpsertHandler((prisma as any).species, prepSpecies));
app.post('/rest/v1/individuals', createUpsertHandler((prisma as any).individual, prepInd));

app.get('/api/sync', authenticate, async (req: any, res: any) => {
   try {
      const [orgs, projects, users, species, individuals, config, languages] = await Promise.all([
         (prisma as any).organization.findMany({ where: { is_deleted: false } }),
         (prisma as any).project.findMany(),
         (prisma as any).user.findMany(),
         (prisma as any).species.findMany(),
         (prisma as any).individual.findMany(),
         (prisma as any).appConfig.findUnique({ where: { id: 'global-settings' } }),
         (prisma as any).language?.findMany({ where: { is_deleted: false } }) || []
      ]);
      res.json({ 
        success: true, 
        data: { 
          partners: orgs, 
          projects, 
          users, 
          species, 
          individuals, 
          settings: config?.settings, 
          languages 
        } 
      });
   } catch (e: any) { 
      console.error("[SYNC] Error:", e.message);
      res.status(500).json({ success: false, message: e.message }); 
   }
});

app.get('*', (req: any, res: any) => res.sendFile(path.join(__dirname, '../../dist/index.html')));
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
