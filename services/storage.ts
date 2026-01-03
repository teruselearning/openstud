import { Organization, User, Species, Individual, UserRole, Sex, BreedingEvent, ExternalPartner, UserStatus, OrganizationFocus, Partnership, SystemSettings, Project, BreedingLoan, Notification, LanguageConfig, EmailTemplate, Enclosure } from '../types';
import { BASE_TRANSLATIONS, SEED_LANGUAGES } from './i18n';
import { syncPushOrg, syncPushUsers, syncPushProjects, syncPushSpecies, syncPushIndividuals, syncPushBreedingEvents, syncPushBreedingLoans, syncPushPartnerships, syncPushSettings, syncDeleteOrganization, syncPushLanguages, syncDeleteLanguage, syncPermanentDeleteOrganization, syncPushEnclosures } from './syncService';
import { hashPassword } from './crypto';
import { sendSystemEmail } from './emailService';
import { localDb } from './localDb';

const API_BASE_URL = '';

export { syncPushOrg, syncPushUsers, syncPushProjects, syncPushSpecies, syncPushIndividuals, syncPushBreedingEvents, syncPushBreedingLoans, syncPushPartnerships, syncPushSettings, syncDeleteOrganization, syncPushLanguages, syncDeleteLanguage, syncPermanentDeleteOrganization, syncPushEnclosures };

export const permanentDeleteOrganization = syncPermanentDeleteOrganization;

const STORAGE_PREFIX = 'os_';
const KEYS = {
  ORG: `${STORAGE_PREFIX}org`,
  USERS: `${STORAGE_PREFIX}users`,
  PROJECTS: `${STORAGE_PREFIX}projects`,
  CURRENT_PROJECT: `${STORAGE_PREFIX}current_project`,
  SPECIES: `${STORAGE_PREFIX}species`,
  INDIVIDUALS: `${STORAGE_PREFIX}individuals`,
  ENCLOSURES: `${STORAGE_PREFIX}enclosures`,
  BREEDING: `${STORAGE_PREFIX}breeding`,
  BREEDING_LOANS: `${STORAGE_PREFIX}breeding_loans`,
  PARTNERSHIPS: `${STORAGE_PREFIX}partnerships`,
  PARTNERS: `${STORAGE_PREFIX}partners`,
  INVITE_CODES: `${STORAGE_PREFIX}invite_codes`,
  SESSION: `${STORAGE_PREFIX}session`,
  TOKEN: `${STORAGE_PREFIX}token`,
  NOTIFICATIONS: `${STORAGE_PREFIX}notifications`,
  SETTINGS: `${STORAGE_PREFIX}settings`,
  LANGUAGES: `${STORAGE_PREFIX}languages`,
  TRUSTED_DEVICES: `${STORAGE_PREFIX}trusted_devices`,
  IMPERSONATING: `${STORAGE_PREFIX}impersonating`,
  BACKUP: `${STORAGE_PREFIX}backup`
};

let individualsCache: Individual[] = [];
let speciesCache: Species[] = [];
let languagesCache: LanguageConfig[] = [];
let enclosuresCache: Enclosure[] = [];
let isLoaded = false;

export const initHighCapacityStorage = async () => {
  if (isLoaded) return;
  try {
    const [inds, specs, langs, encls] = await Promise.all([
      localDb.getAll<Individual>('individuals'),
      localDb.getAll<Species>('species'),
      localDb.getAll<LanguageConfig>('languages'),
      localDb.getAll<Enclosure>('enclosures')
    ]);
    
    individualsCache = inds;
    speciesCache = specs;
    enclosuresCache = encls;
    
    if (langs.length === 0) {
      languagesCache = SEED_LANGUAGES;
      await localDb.saveAll('languages', SEED_LANGUAGES);
      syncPushLanguages(SEED_LANGUAGES).catch(() => {});
    } else {
      languagesCache = langs;
    }

    isLoaded = true;
  } catch (err) {
    console.error("Failed to initialize storage:", err);
    individualsCache = [];
    speciesCache = [];
    enclosuresCache = [];
    languagesCache = SEED_LANGUAGES;
    isLoaded = true;
  }
};

const get = <T>(key: string, defaultVal: T): T => {
  if (typeof window === 'undefined') return defaultVal;
  const item = localStorage.getItem(key);
  if (!item) return defaultVal;
  try {
    const parsed = JSON.parse(item);
    return parsed === null ? defaultVal : parsed;
  } catch (e) {
    return defaultVal;
  }
};

const set = <T>(key: string, val: T) => {
  if (typeof window !== 'undefined') {
    if ([KEYS.INDIVIDUALS, KEYS.SPECIES, KEYS.LANGUAGES, KEYS.ENCLOSURES].includes(key)) return;
    localStorage.setItem(key, JSON.stringify(val));
  }
};

export const clearLocalCache = () => {
    localStorage.removeItem(KEYS.BACKUP);
    localStorage.removeItem(KEYS.PARTNERS);
    individualsCache = [];
    speciesCache = [];
    enclosuresCache = [];
    localDb.saveAll('individuals', []);
    localDb.saveAll('species', []);
    localDb.saveAll('enclosures', []);
    window.location.reload();
};

export const getSystemSettings = (): SystemSettings => {
  const defaults: SystemSettings = {
    smtpHost: '', smtpPort: 587, smtpUser: '', smtpPass: '', smtpSecure: false,
    emailTemplates: {
      registration: { enabled: true, subject: BASE_TRANSLATIONS.emailVerifySubject, bodyHtml: BASE_TRANSLATIONS.emailVerifyBody },
      mfa: { enabled: true, subject: "Security Code", bodyHtml: BASE_TRANSLATIONS.emailVerifyBody }, 
      invite: { enabled: true, subject: BASE_TRANSLATIONS.emailInviteSubject, bodyHtml: BASE_TRANSLATIONS.emailInviteBody },
      notification: { enabled: true, subject: BASE_TRANSLATIONS.emailNotifySubject, bodyHtml: BASE_TRANSLATIONS.emailNotifyBody },
      password_reset: { enabled: true, subject: "Password Reset", bodyHtml: BASE_TRANSLATIONS.emailVerifyBody } 
    },
    themePrimaryColor: '#059669', themeSecondaryColor: '#10b981',
    aboutPage: { enabled: true, title: 'About', contentHtml: '' },
    privacyPage: { enabled: true, title: 'Privacy', contentHtml: '' },
    termsPage: { enabled: true, title: 'Terms', contentHtml: '' },
    enableMfa: false,
    enableRegistration: true,
    landingPageConfig: { heroTitle: "", heroSubtitle: "", showFeatures: true, features: [] }
  };
  const stored = get<Partial<SystemSettings>>(KEYS.SETTINGS, {});
  return { ...defaults, ...stored };
};

export const saveSystemSettings = async (s: SystemSettings, skipSync = false) => {
  set(KEYS.SETTINGS, s);
  if (!skipSync) await syncPushSettings(s);
};

export const getLanguages = (): LanguageConfig[] => languagesCache.filter(l => !l.deleted);
export const saveLanguages = (langs: LanguageConfig[], skipSync = false) => {
  languagesCache = langs;
  localDb.saveAll('languages', langs);
  if (!skipSync) syncPushLanguages(langs).catch(() => {});
};

export const deleteLanguage = async (code: string) => {
  const updated = languagesCache.filter(l => l.code !== code);
  languagesCache = updated;
  await localDb.saveAll('languages', updated);
  try { await syncDeleteLanguage(code); } catch (e) {}
};

export const generatePattern = (text: string): string => {
  const settings = getSystemSettings();
  const baseColor = settings.themePrimaryColor || '#059669';
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="${baseColor}"/><text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="24" fill="white">${text}</text></svg>`)}`;
};

export const getSession = (): User | null => get(KEYS.SESSION, null);
export const saveSession = (u: User) => set(KEYS.SESSION, u);

export const logout = () => {
   localStorage.removeItem(KEYS.SESSION);
   localStorage.removeItem(KEYS.TOKEN);
   localStorage.removeItem(KEYS.IMPERSONATING);
   localStorage.removeItem(KEYS.BACKUP);
};

export const isImpersonating = () => !!localStorage.getItem(KEYS.IMPERSONATING);
export const restoreMainOrg = () => {
   if (isImpersonating()) {
      const backup = localStorage.getItem(KEYS.BACKUP);
      if (backup) set(KEYS.ORG, JSON.parse(backup).org);
      localStorage.removeItem(KEYS.IMPERSONATING);
      localStorage.removeItem(KEYS.BACKUP);
   }
};

export const switchOrganization = (partnerId: string, explicitOrg?: any): boolean => {
   const backup = { org: getOrg() };
   localStorage.setItem(KEYS.BACKUP, JSON.stringify(backup));
   localStorage.setItem(KEYS.IMPERSONATING, partnerId);
   const partners = getNetworkPartners();
   const partner = explicitOrg || partners.find(p => p.id === partnerId);
   if (partner) {
      set(KEYS.ORG, { ...partner, foundedYear: partner.foundedYear || 2000, description: partner.description || '', focus: partner.focus || 'Animals' });
      return true;
   }
   return false;
};

export const getOrg = (): Organization => {
  const defaultOrg: Organization = { id: '', name: 'New Org', location: '', foundedYear: 2024, description: '', focus: 'Animals', isOrgPublic: false, isSpeciesPublic: false, obscureLocation: false, allowBreedingRequests: false };
  return get(KEYS.ORG, defaultOrg);
};

export const saveOrg = (o: Organization, skipSync = false) => {
  set(KEYS.ORG, o);
  if (!skipSync) syncPushOrg(o).catch(() => {});
};

export const checkAndIncrementAiUsage = (): boolean => {
  const org = getOrg();
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${now.getMonth() + 1}`;
  let count = org.aiUsageCount || 0;
  let lastReset = org.aiUsageLastReset || "";
  if (lastReset !== currentMonthStr) { count = 0; lastReset = currentMonthStr; }
  if (count >= (org.aiUsageLimit || 100)) return false;
  saveOrg({ ...org, aiUsageCount: count + 1, aiUsageLastReset: currentMonthStr });
  return true;
};

export const getProjects = (): Project[] => get(KEYS.PROJECTS, []);
export const saveProjects = (p: Project[], skipSync = false) => {
  set(KEYS.PROJECTS, p);
  if (!skipSync) syncPushProjects(p).catch(() => {});
};

export const getCurrentProjectId = (): string => get(KEYS.CURRENT_PROJECT, '');
export const saveCurrentProjectId = (id: string) => set(KEYS.CURRENT_PROJECT, id);

export const getUsers = (): User[] => get(KEYS.USERS, []);
export const saveUsers = (u: User[], skipSync = false) => {
  set(KEYS.USERS, u);
  if (!skipSync) syncPushUsers(u).catch(() => {});
};

export const getSpecies = (): Species[] => speciesCache;
export const saveSpecies = (s: Species[], skipSync = false) => {
  speciesCache = s;
  localDb.saveAll('species', s);
  if (!skipSync) syncPushSpecies(s).catch(() => {});
};

export const getIndividuals = (): Individual[] => individualsCache;
export const saveIndividuals = (i: Individual[], skipSync = false) => {
  individualsCache = i;
  localDb.saveAll('individuals', i);
  if (!skipSync) syncPushIndividuals(i).catch(() => {});
};

export const getEnclosures = (): Enclosure[] => enclosuresCache;
export const saveEnclosures = (e: Enclosure[], skipSync = false) => {
  enclosuresCache = e;
  localDb.saveAll('enclosures', e);
  if (!skipSync) syncPushEnclosures(e).catch(() => {});
};

export const getBreedingEvents = (): BreedingEvent[] => get(KEYS.BREEDING, []);
export const saveBreedingEvents = (b: BreedingEvent[], skipSync = false) => {
  set(KEYS.BREEDING, b);
  if (!skipSync) syncPushBreedingEvents(b).catch(() => {});
};

export const getBreedingLoans = (): BreedingLoan[] => get(KEYS.BREEDING_LOANS, []);
export const saveBreedingLoans = (l: BreedingLoan[], skipSync = false) => {
  set(KEYS.BREEDING_LOANS, l);
  if (!skipSync) syncPushBreedingLoans(l).catch(() => {});
};

export const getPartnerships = (): Partnership[] => get(KEYS.PARTNERSHIPS, []);
export const savePartnerships = (p: Partnership[], skipSync = false) => {
  set(KEYS.PARTNERSHIPS, p);
  if (!skipSync) syncPushPartnerships(p).catch(() => {});
};

export const getNetworkPartners = (): ExternalPartner[] => get<ExternalPartner[]>(KEYS.PARTNERS, []).filter(p => p && !p.deleted);
export const saveNetworkPartners = (partners: ExternalPartner[]) => set(KEYS.PARTNERS, partners);

export const getNotifications = (): Notification[] => get(KEYS.NOTIFICATIONS, []);
export const saveNotifications = (n: Notification[]) => set(KEYS.NOTIFICATIONS, n);

export const sendMockNotification = (recipientId: string, senderOrgName: string, message: string, type: 'BreedingRequest' | 'System' | 'Partnership' | 'LoanUpdate' = 'System') => {
  const n = getNotifications();
  saveNotifications([{ id: `notif-${Date.now()}`, recipientId, senderOrgName, title: 'System Notification', message, date: new Date().toISOString().split('T')[0], isRead: false, type }, ...n]);
};

export const isMfaTrustedDevice = (userId: string): boolean => get(KEYS.TRUSTED_DEVICES, [] as string[]).includes(userId);
export const trustDevice = (userId: string) => {
  const d = get(KEYS.TRUSTED_DEVICES, [] as string[]);
  if (!d.includes(userId)) set(KEYS.TRUSTED_DEVICES, [...d, userId]);
};

export const sendMfaCode = async (email: string, code: string) => {
  const s = getSystemSettings();
  const t = s.emailTemplates?.mfa;
  // REMOVED THE IF(T?.ENABLED) GUARD - ALWAYS TRY TO SEND MFA FOR SECURITY
  await sendSystemEmail(
    email, 
    'mfa', 
    { code }, 
    t?.subject || "Your Security Code", 
    t?.bodyHtml || `<p>Your verification code is: <b>${code}</b></p>`
  );
};

export const login = async (email: string, pass: string): Promise<User | null> => {
  return null;
};

export const registerOrganization = async (orgName: string, userName: string, email: string, focus: OrganizationFocus, password: string, lang: string, latitude?: number, longitude?: number, location?: string) => {
  const response = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orgName, userName, email, focus, password, language: lang, latitude, longitude, location })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Registration failed");

  localStorage.setItem('os_token', data.token);
  saveSession(data.user);
  saveOrg(data.organization, true);
  return { needsVerification: false };
};

export const confirmRegistration = async (email: string, code: string): Promise<User> => {
   throw new Error("Verification handled by login flow.");
};

export const forgotPassword = async (email: string): Promise<{ success: boolean; message?: string; error?: string }> => {
  try {
    const response = await fetch('/api/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error };
    return { success: true, message: data.message };
  } catch (e: any) {
    return { success: false, error: "Network error." };
  }
};

export const resetPassword = async (email: string, code: string, pass: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const response = await fetch('/api/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, newPassword: pass })
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: "Network error." };
  }
};

export const regenerateDemoData = async () => {};

export const generatePartnerInvite = (): string => {
  const code = Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
  const invites = get(KEYS.INVITE_CODES, [] as string[]);
  set(KEYS.INVITE_CODES, [...invites, code]);
  return code;
};

export const redeemPartnerInvite = (code: string): {success: boolean, message: string} => ({ success: true, message: "Partnership established!" });

export const inviteUser = async (name: string, email: string, role: UserRole, allowedProjectIds: string[]) => {
  const newUser: User = { id: `u-${Date.now()}`, orgId: getOrg().id, name, email, role, status: UserStatus.INVITED, allowedProjectIds };
  saveUsers([...getUsers(), newUser]);
};

export const deleteUser = async (id: string) => saveUsers(getUsers().filter(u => u.id !== id));

export const checkInviteToken = async (token: string): Promise<{ success: boolean; data?: { name: string; email: string; orgName: string; }; error?: string }> => ({ success: true, data: { name: 'Invited User', email: 'user@example.com', orgName: 'Sample Org' } });

export const acceptInvite = async (token: string, pass: string) => ({ user: getUsers()[0] });

export const exportFullData = () => ({ org: getOrg(), projects: getProjects(), users: getUsers(), species: getSpecies(), individuals: getIndividuals(), enclosures: getEnclosures(), breedingEvents: getBreedingEvents(), breedingLoans: getBreedingLoans(), partnerships: getPartnerships(), settings: getSystemSettings(), languages: getLanguages() });

export const exportDataAsCSV = (): string => {
  const species = getSpecies();
  const individuals = getIndividuals();
  const headers = ['Studbook ID', 'Name', 'Common Name', 'Scientific Name', 'Sex', 'Birth Date', 'Weight (kg)', 'Status'];
  const rows = individuals.map(ind => {
    const sp = species.find(s => s.id === ind.speciesId);
    return [ind.studbookId || '', `"${ind.name}"`, `"${sp?.commonName}"`, `"${sp?.scientificName}"`, ind.sex || '', ind.birthDate || '', ind.weightKg || '0', ind.isDeceased ? 'Deceased' : 'Active'];
  });
  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
};

export const importFullData = (data: any) => { if (data.org) saveOrg(data.org); if (data.projects) saveProjects(data.projects); if (data.users) saveUsers(data.users); if (data.species) saveSpecies(data.species); if (data.individuals) saveIndividuals(data.individuals); if (data.enclosures) saveEnclosures(data.enclosures); if (data.breedingEvents) saveBreedingEvents(data.breedingEvents); if (data.breedingLoans) saveBreedingLoans(data.breedingLoans); if (data.partnerships) savePartnerships(data.partnerships); if (data.settings) saveSystemSettings(data.settings); if (data.languages) saveLanguages(data.languages); };