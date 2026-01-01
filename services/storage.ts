
import { Organization, User, Species, Individual, UserRole, Sex, BreedingEvent, ExternalPartner, UserStatus, OrganizationFocus, Partnership, SystemSettings, Project, BreedingLoan, Notification, LanguageConfig, EmailTemplate, Enclosure } from '../types';
import { BASE_TRANSLATIONS, SEED_LANGUAGES } from './i18n';
import { syncPushOrg, syncPushUsers, syncPushProjects, syncPushSpecies, syncPushIndividuals, syncPushBreedingEvents, syncPushBreedingLoans, syncPushPartnerships, syncPushSettings, syncDeleteOrganization, syncPushLanguages, syncDeleteLanguage, syncPermanentDeleteOrganization, syncPushEnclosures } from './syncService';
import { hashPassword } from './crypto';
import { sendSystemEmail } from './emailService';
import { localDb } from './localDb';

// Simplified API Base URL - handled by Vite Proxy
const API_BASE_URL = '';

// Re-export sync functions for external use
export { syncPushOrg, syncPushUsers, syncPushProjects, syncPushSpecies, syncPushIndividuals, syncPushBreedingEvents, syncPushBreedingLoans, syncPushPartnerships, syncPushSettings, syncDeleteOrganization, syncPushLanguages, syncDeleteLanguage, syncPermanentDeleteOrganization, syncPushEnclosures };

// Re-export syncPermanentDeleteOrganization as permanentDeleteOrganization to fix SuperAdmin.tsx error
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

// In-Memory Cache for heavy collections to maintain synchronous performance
let individualsCache: Individual[] = [];
let speciesCache: Species[] = [];
let languagesCache: LanguageConfig[] = [];
let enclosuresCache: Enclosure[] = [];
let isLoaded = false;

/**
 * Initializes high-capacity storage. Must be called on app start.
 */
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
    
    // Initial Seed for languages if IndexedDB is empty
    if (langs.length === 0) {
      languagesCache = SEED_LANGUAGES;
      await localDb.saveAll('languages', SEED_LANGUAGES);
      syncPushLanguages(SEED_LANGUAGES).catch(() => {});
    } else {
      languagesCache = langs;
    }

    isLoaded = true;
    console.log(`OpenStudbook Storage: Loaded ${inds.length} individuals, ${specs.length} species, ${encls.length} enclosures, and ${langs.length} languages from IndexedDB.`);
  } catch (err) {
    console.error("Failed to initialize IndexedDB storage:", err);
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
    if (parsed === null) return defaultVal;
    return parsed;
  } catch (e) {
    if (typeof defaultVal === 'string') return defaultVal as unknown as T;
    return defaultVal;
  }
};

const set = <T>(key: string, val: T) => {
  if (typeof window !== 'undefined') {
    if ([KEYS.INDIVIDUALS, KEYS.SPECIES, KEYS.LANGUAGES, KEYS.ENCLOSURES].includes(key)) {
       console.warn(`Attempted to save giant collection ${key} to localStorage. High-capacity storage should handle this.`);
       return;
    }

    const stringified = JSON.stringify(val);
    try {
      localStorage.setItem(key, stringified);
    } catch (e) {
      if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
         localStorage.removeItem(KEYS.BACKUP);
         localStorage.removeItem(KEYS.NOTIFICATIONS);
         localStorage.removeItem(KEYS.PARTNERS); 
         try {
            localStorage.setItem(key, stringified);
         } catch (e2) {}
      }
    }
  }
};

export const clearLocalCache = () => {
    const essentialKeys = [KEYS.SESSION, KEYS.TOKEN, KEYS.ORG, KEYS.CURRENT_PROJECT];
    const allKeys = Object.keys(localStorage);
    allKeys.forEach(k => {
        if (k.startsWith(STORAGE_PREFIX) && !essentialKeys.includes(k)) {
            localStorage.removeItem(k);
        }
    });
    individualsCache = [];
    speciesCache = [];
    languagesCache = [];
    enclosuresCache = [];
    localDb.saveAll('individuals', []);
    localDb.saveAll('species', []);
    localDb.saveAll('languages', []);
    localDb.saveAll('enclosures', []);
    window.location.reload();
};

export const getSystemSettings = (): SystemSettings => {
  const defaults: SystemSettings = {
    smtpHost: '', smtpPort: 587, smtpUser: '', smtpPass: '', smtpSecure: false,
    emailTemplates: {
      registration: { enabled: true, subject: BASE_TRANSLATIONS.emailVerifySubject, bodyHtml: BASE_TRANSLATIONS.emailVerifyBody },
      mfa: { enabled: true, subject: "Your OpenStudbook Security Code", bodyHtml: BASE_TRANSLATIONS.emailVerifyBody }, 
      invite: { enabled: true, subject: BASE_TRANSLATIONS.emailInviteSubject, bodyHtml: BASE_TRANSLATIONS.emailInviteBody },
      notification: { enabled: true, subject: BASE_TRANSLATIONS.emailNotifySubject, bodyHtml: BASE_TRANSLATIONS.emailNotifyBody },
      password_reset: { enabled: true, subject: "OpenStudbook Password Reset", bodyHtml: BASE_TRANSLATIONS.emailVerifyBody } 
    },
    themePrimaryColor: '#059669', themeSecondaryColor: '#10b981',
    aboutPage: { enabled: true, title: 'About OpenStudbook', contentHtml: '<p>Open-source population management.</p>' },
    privacyPage: { enabled: true, title: 'Privacy Policy', contentHtml: '<p>Your data is protected.</p>' },
    termsPage: { enabled: true, title: 'Terms & Conditions', contentHtml: '<p>Standard open-source license.</p>' },
    enableMfa: false,
    enableRegistration: true,
    landingPageConfig: {
      heroTitle: "The Future of Captive Breeding Management",
      heroSubtitle: "Open-source platform for zoos and botanical gardens.",
      showFeatures: true,
      features: []
    }
  };
  const stored = get<Partial<SystemSettings>>(KEYS.SETTINGS, {});
  return { 
    ...defaults, 
    ...stored, 
    emailTemplates: { ...defaults.emailTemplates, ...(stored.emailTemplates || {}) }, 
    aboutPage: { ...defaults.aboutPage, ...(stored.aboutPage || {}) }, 
    privacyPage: { ...defaults.privacyPage, ...(stored.privacyPage || {}) }, 
    termsPage: { ...defaults.termsPage, ...(stored.termsPage || {}) },
    landingPageConfig: { ...defaults.landingPageConfig, ...(stored.landingPageConfig || {}) }
  };
};

export const saveSystemSettings = async (s: SystemSettings, skipSync = false) => {
  set(KEYS.SETTINGS, s);
  if (!skipSync) await syncPushSettings(s);
};

export const getLanguages = (): LanguageConfig[] => {
  return languagesCache.filter(l => !l.deleted);
};

export const saveLanguages = (langs: LanguageConfig[], skipSync = false) => {
  languagesCache = langs;
  localDb.saveAll('languages', langs).catch(err => console.error("Languages DB Save Failed:", err));
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
   if (typeof window === 'undefined') return;
   localStorage.removeItem(KEYS.SESSION);
   localStorage.removeItem(KEYS.TOKEN);
   localStorage.removeItem(KEYS.IMPERSONATING);
   localStorage.removeItem(KEYS.BACKUP);
   localStorage.removeItem(KEYS.ORG);
   localStorage.removeItem(KEYS.CURRENT_PROJECT);
};

export const isImpersonating = () => typeof window !== 'undefined' && !!localStorage.getItem(KEYS.IMPERSONATING);
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
  const defaultOrg: Organization = { 
    id: '', name: 'New Org', location: '', foundedYear: 2024, description: '', 
    focus: 'Animals', isOrgPublic: false, isSpeciesPublic: false, 
    obscureLocation: false, allowBreedingRequests: false,
    aiUsageLimit: 100, aiUsageCount: 0, enableMfa: false, enableEnclosures: false
  };
  const org = get(KEYS.ORG, defaultOrg);
  if (!org || typeof org !== 'object') return defaultOrg;
  return org;
};

export const saveOrg = (o: Organization, skipSync = false) => {
  set(KEYS.ORG, o);
  if (!skipSync) {
    syncPushOrg(o)
      .then(() => console.log("Org settings pushed to server successfully."))
      .catch((err) => console.error("Failed to push org settings to server:", err));
  }
};

export const checkAndIncrementAiUsage = (): boolean => {
  const org = getOrg();
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${now.getMonth() + 1}`;
  let count = org.aiUsageCount || 0;
  let lastReset = org.aiUsageLastReset || "";
  const limit = org.aiUsageLimit || 100;
  if (lastReset !== currentMonthStr) { count = 0; lastReset = currentMonthStr; }
  if (count >= limit) return false;
  const updatedOrg = { ...org, aiUsageCount: count + 1, aiUsageLastReset: currentMonthStr };
  saveOrg(updatedOrg);
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
  localDb.saveAll('species', s).catch(err => console.error("Species DB Save Failed:", err));
  if (!skipSync) syncPushSpecies(s).catch(() => {});
};

export const getIndividuals = (): Individual[] => individualsCache;
export const saveIndividuals = (i: Individual[], skipSync = false) => {
  individualsCache = i;
  localDb.saveAll('individuals', i).catch(err => console.error("Individuals DB Save Failed:", err));
  if (!skipSync) syncPushIndividuals(i).catch(() => {});
};

export const getEnclosures = (): Enclosure[] => enclosuresCache;
export const saveEnclosures = (e: Enclosure[], skipSync = false) => {
  enclosuresCache = e;
  localDb.saveAll('enclosures', e).catch(err => console.error("Enclosures DB Save Failed:", err));
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
  const notifications = getNotifications();
  const newNotif: Notification = {
    id: `notif-${Date.now()}`,
    recipientId,
    senderOrgName,
    title: type === 'System' ? 'System Update' : type.replace(/([A-Z])/g, ' $1').trim(),
    message,
    date: new Date().toISOString().split('T')[0],
    isRead: false,
    type
  };
  saveNotifications([newNotif, ...notifications]);
};

export const isMfaTrustedDevice = (userId: string): boolean => {
  const devices = get(KEYS.TRUSTED_DEVICES, [] as string[]);
  return devices.includes(userId);
};

export const trustDevice = (userId: string) => {
  const devices = get(KEYS.TRUSTED_DEVICES, [] as string[]);
  if (!devices.includes(userId)) {
    set(KEYS.TRUSTED_DEVICES, [...devices, userId]);
  }
};

export const sendMfaCode = async (email: string, code: string) => {
  const settings = getSystemSettings();
  const template = settings.emailTemplates?.mfa;
  if (!template || !template.enabled) return;
  await sendSystemEmail(email, 'mfa', { code }, template.subject, template.bodyHtml);
};

export const login = async (email: string, pass: string): Promise<User | null> => {
  const users = getUsers();
  const match = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (match) return match;
  return null;
};

export const registerOrganization = async (orgName: string, userName: string, email: string, focus: OrganizationFocus, pass: string, lang: string, lat?: number, lng?: number, location?: string) => {
  const id = `org-${Date.now()}`;
  const newOrg: Organization = {
    id, name: orgName, location: location || '', latitude: lat, longitude: lng,
    foundedYear: new Date().getFullYear(), description: '', focus,
    isOrgPublic: true, isSpeciesPublic: true, obscureLocation: false, allowBreedingRequests: true,
    aiUsageLimit: 100, aiUsageCount: 0, enableMfa: false, enableEnclosures: false
  };
  const newUser: User = {
    id: `u-${Date.now()}`, orgId: id, name: userName, email, role: UserRole.ADMIN, status: UserStatus.ACTIVE,
    preferredLanguage: lang
  };
  saveOrg(newOrg);
  saveUsers([...getUsers(), newUser]);
  return { needsVerification: false };
};

export const confirmRegistration = async (email: string, code: string): Promise<User> => {
   const user = getUsers().find(u => u.email === email);
   if (!user) throw new Error("User not found");
   return user;
};

export const forgotPassword = async (email: string): Promise<{ success: boolean; message?: string; error?: string }> => ({ success: true, message: "Reset code sent to email." });
export const resetPassword = async (email: string, code: string, pass: string): Promise<{ success: boolean; error?: string }> => ({ success: true });

export const regenerateDemoData = async () => {};

export const generatePartnerInvite = (): string => {
  const code = Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
  const invites = get(KEYS.INVITE_CODES, [] as string[]);
  set(KEYS.INVITE_CODES, [...invites, code]);
  return code;
};

export const redeemPartnerInvite = (code: string): {success: boolean, message: string} => {
  return { success: true, message: "Partnership established!" };
};

export const inviteUser = async (name: string, email: string, role: UserRole, allowedProjectIds: string[]) => {
  const newUser: User = {
    id: `u-${Date.now()}`,
    orgId: getOrg().id,
    name, email, role, status: UserStatus.INVITED,
    allowedProjectIds
  };
  const updated = [...getUsers(), newUser];
  saveUsers(updated);
};

export const deleteUser = async (id: string) => {
  const updated = getUsers().filter(u => u.id !== id);
  saveUsers(updated);
};

export const checkInviteToken = async (token: string): Promise<{ success: boolean; data?: { name: string; email: string; orgName: string; }; error?: string }> => ({ success: true, data: { name: 'Invited User', email: 'user@example.com', orgName: 'Sample Org' } });

export const acceptInvite = async (token: string, pass: string) => {
  const user = getUsers()[0];
  return { user };
};

export const exportFullData = () => ({ org: getOrg(), projects: getProjects(), users: getUsers(), species: getSpecies(), individuals: getIndividuals(), enclosures: getEnclosures(), breedingEvents: getBreedingEvents(), breedingLoans: getBreedingLoans(), partnerships: getPartnerships(), settings: getSystemSettings(), languages: getLanguages() });

export const exportDataAsCSV = (): string => {
  const species = getSpecies();
  const individuals = getIndividuals();
  const headers = ['Studbook ID', 'Name', 'Common Name', 'Scientific Name', 'Sex', 'Birth Date', 'Weight (kg)', 'Status', 'Notes', 'Source', 'Latitude', 'Longitude'];
  const rows = individuals.map(ind => {
    const sp = species.find(s => s.id === ind.speciesId);
    return [ind.studbookId || '', `"${(ind.name || '').replace(/"/g, '""')}"`, `"${(sp?.commonName || '').replace(/"/g, '""')}"`, `"${(sp?.scientificName || '').replace(/"/g, '""')}"`, ind.sex || '', ind.birthDate || '', ind.weightKg || '0', ind.isDeceased ? 'Deceased' : 'Active', `"${(ind.notes || '').replace(/"/g, '""')}"`, ind.source || '', ind.latitude || '', ind.longitude || ''];
  });
  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
};

export const importFullData = (data: any) => { if (data.org) saveOrg(data.org); if (data.projects) saveProjects(data.projects); if (data.users) saveUsers(data.users); if (data.species) saveSpecies(data.species); if (data.individuals) saveIndividuals(data.individuals); if (data.enclosures) saveEnclosures(data.enclosures); if (data.breedingEvents) saveBreedingEvents(data.breedingEvents); if (data.breedingLoans) saveBreedingLoans(data.breedingLoans); if (data.partnerships) savePartnerships(data.partnerships); if (data.settings) saveSystemSettings(data.settings); if (data.languages) saveLanguages(data.languages); };
