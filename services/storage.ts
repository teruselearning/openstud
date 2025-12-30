
import { Organization, User, Species, Individual, UserRole, Sex, BreedingEvent, ExternalPartner, UserStatus, OrganizationFocus, Partnership, SystemSettings, Project, BreedingLoan, Notification, LanguageConfig, EmailTemplate } from '../types';
import { BASE_TRANSLATIONS, SEED_LANGUAGES } from './i18n';
import { syncPushOrg, syncPushUsers, syncPushProjects, syncPushSpecies, syncPushIndividuals, syncPushBreedingEvents, syncPushBreedingLoans, syncPushPartnerships, syncPushSettings, syncDeleteOrganization, syncPushLanguages, syncDeleteLanguage } from './syncService';
import { hashPassword } from './crypto';
import { sendSystemEmail } from './emailService';

// Simplified API Base URL - handled by Vite Proxy
const API_BASE_URL = '';

export { syncPushOrg, syncPushUsers, syncPushProjects, syncPushSpecies, syncPushIndividuals, syncPushBreedingEvents, syncPushBreedingLoans, syncPushPartnerships, syncPushSettings, syncDeleteOrganization, syncPushLanguages, syncDeleteLanguage };

const STORAGE_PREFIX = 'os_';
const KEYS = {
  ORG: `${STORAGE_PREFIX}org`,
  USERS: `${STORAGE_PREFIX}users`,
  PROJECTS: `${STORAGE_PREFIX}projects`,
  CURRENT_PROJECT: `${STORAGE_PREFIX}current_project`,
  SPECIES: `${STORAGE_PREFIX}species`,
  INDIVIDUALS: `${STORAGE_PREFIX}individuals`,
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
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
         console.warn("Storage quota exceeded. Pruning non-essential data.");
         // Clear largest non-essential caches
         localStorage.removeItem(KEYS.BACKUP);
         localStorage.removeItem(KEYS.NOTIFICATIONS);
         // Try again
         try {
            localStorage.setItem(key, JSON.stringify(val));
         } catch (secondErr) {
            console.error("Critical: Storage remains full after pruning.", secondErr);
         }
      }
    }
  }
};

export const getSystemSettings = (): SystemSettings => {
  const defaults: SystemSettings = {
    smtpHost: '', smtpPort: 587, smtpUser: '', smtpPass: '', smtpSecure: false,
    emailTemplates: {
      registration: { 
        enabled: true, 
        subject: "Verify your OpenStudbook account", 
        bodyHtml: "<h3>Welcome to OpenStudbook!</h3><p>Your verification code for <strong>{{orgName}}</strong> is: <strong style='font-size: 24px; color: #059669;'>{{code}}</strong></p><p>Enter this code in your browser to complete your registration.</p>" 
      },
      mfa: { 
        enabled: true, 
        subject: "Your OpenStudbook Security Code", 
        bodyHtml: "<h3>Security Verification</h3><p>Hello {{userName}},</p><p>Use the following code to sign in to your account: <strong style='font-size: 24px; color: #3b82f6;'>{{code}}</strong></p><p>If you did not request this code, please secure your account immediately.</p>" 
      },
      invite: { 
        enabled: true, 
        subject: "You've been invited to join {{orgName}}", 
        bodyHtml: "<h3>Team Invitation</h3><p>You have been invited to join the studbook management team at <strong>{{orgName}}</strong>.</p><p>Click the link below or log in using your email to get started.</p>" 
      },
      notification: { 
        enabled: true, 
        subject: "OpenStudbook: New Activity in {{orgName}}", 
        bodyHtml: "<h3>Project Update</h3><p>New activity has been recorded in your project:</p><div style='padding: 15px; background: #f8fafc; border-left: 4px solid #059669;'>{{message}}</div><p>Log in to view the full details.</p>" 
      }
    },
    themePrimaryColor: '#059669', themeSecondaryColor: '#10b981',
    aboutPage: { enabled: true, title: 'About OpenStudbook', contentHtml: '<p>Open-source population management for conservation.</p>' },
    privacyPage: { enabled: true, title: 'Privacy Policy', contentHtml: '<p>Your data is protected and stored securely.</p>' },
    termsPage: { enabled: true, title: 'Terms & Conditions', contentHtml: '<p>Use of this software is subject to standard open-source licensing.</p>' },
    enableMfa: false
  };
  
  const stored = get<Partial<SystemSettings>>(KEYS.SETTINGS, {});
  return {
    ...defaults,
    ...stored,
    emailTemplates: { ...defaults.emailTemplates, ...(stored.emailTemplates || {}) },
    aboutPage: { ...defaults.aboutPage, ...(stored.aboutPage || {}) },
    privacyPage: { ...defaults.privacyPage, ...(stored.privacyPage || {}) },
    termsPage: { ...defaults.termsPage, ...(stored.termsPage || {}) },
    landingPageConfig: stored.landingPageConfig || defaults.landingPageConfig
  };
};

export const saveSystemSettings = (s: SystemSettings, skipSync = false) => {
  set(KEYS.SETTINGS, s);
  if (!skipSync) syncPushSettings(s).catch(() => {});
};

export const getLanguages = (): LanguageConfig[] => {
  const stored = get<LanguageConfig[]>(KEYS.LANGUAGES, []);
  if (stored.length === 0) {
    set(KEYS.LANGUAGES, SEED_LANGUAGES);
    syncPushLanguages(SEED_LANGUAGES).catch(() => {});
    return SEED_LANGUAGES;
  }
  return stored.filter(l => !l.deleted);
};

export const saveLanguages = (langs: LanguageConfig[], skipSync = false) => {
  set(KEYS.LANGUAGES, langs);
  if (!skipSync) syncPushLanguages(langs).catch(() => {});
};

export const deleteLanguage = async (code: string) => {
  const current = get<LanguageConfig[]>(KEYS.LANGUAGES, []);
  const updated = current.filter(l => l.code !== code);
  set(KEYS.LANGUAGES, updated);
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
    aiUsageLimit: 100, aiUsageCount: 0 
  };
  const org = get(KEYS.ORG, defaultOrg);
  if (!org || typeof org !== 'object') return defaultOrg;
  
  if (org.aiUsageLimit === undefined) org.aiUsageLimit = 100;
  if (org.aiUsageCount === undefined) org.aiUsageCount = 0;
  
  return org;
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
  const limit = org.aiUsageLimit || 100;
  
  if (lastReset !== currentMonthStr) {
     count = 0;
     lastReset = currentMonthStr;
  }
  
  if (count >= limit) {
     return false;
  }
  
  const updatedOrg = { 
    ...org, 
    aiUsageCount: count + 1, 
    aiUsageLastReset: currentMonthStr 
  };
  
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

export const getSpecies = (): Species[] => get(KEYS.SPECIES, []);
export const saveSpecies = (s: Species[], skipSync = false) => {
  set(KEYS.SPECIES, s);
  if (!skipSync) syncPushSpecies(s).catch(() => {});
};

export const getIndividuals = (): Individual[] => get(KEYS.INDIVIDUALS, []);
export const saveIndividuals = (i: Individual[], skipSync = false) => {
  set(KEYS.INDIVIDUALS, i);
  if (!skipSync) syncPushIndividuals(i).catch(() => {});
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

/**
 * Exports all organization data from local storage for backup.
 */
export const exportFullData = () => {
  return {
    org: getOrg(),
    projects: getProjects(),
    users: getUsers(),
    species: getSpecies(),
    individuals: getIndividuals(),
    breedingEvents: getBreedingEvents(),
    breedingLoans: getBreedingLoans(),
    partnerships: getPartnerships(),
    settings: getSystemSettings(),
    languages: getLanguages()
  };
};

/**
 * Imports organization data into local storage.
 */
export const importFullData = (data: any) => {
  if (data.org) saveOrg(data.org);
  if (data.projects) saveProjects(data.projects);
  if (data.users) saveUsers(data.users);
  if (data.species) saveSpecies(data.species);
  if (data.individuals) saveIndividuals(data.individuals);
  if (data.breedingEvents) saveBreedingEvents(data.breedingEvents);
  if (data.breedingLoans) saveBreedingLoans(data.breedingLoans);
  if (data.partnerships) savePartnerships(data.partnerships);
  if (data.settings) saveSystemSettings(data.settings);
  if (data.languages) saveLanguages(data.languages);
};

/**
 * Exports species and individuals data as a CSV string.
 */
export const exportDataAsCSV = (): string => {
  const species = getSpecies();
  const individuals = getIndividuals();
  
  let csv = "Type,Common Name,Scientific Name,Studbook ID,Name,Sex,Birth Date,Weight (kg),Conservation Status\n";
  
  individuals.forEach(ind => {
    const sp = species.find(s => s.id === ind.speciesId);
    const row = [
      sp?.type || 'Unknown',
      sp?.commonName || 'Unknown',
      sp?.scientificName || 'Unknown',
      ind.studbookId,
      ind.name,
      ind.sex,
      ind.birthDate || '',
      ind.weightKg,
      sp?.conservationStatus || ''
    ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(",");
    csv += row + "\n";
  });
  
  return csv;
};

export const registerOrganization = async (orgName: string, userName: string, email: string, focus: OrganizationFocus, password: string, lang: string = 'en-GB'): Promise<any> => {
  const response = await fetch(`${API_BASE_URL}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orgName, userName, email, focus, password, lang })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Registration failed");
  return data;
};

export const confirmRegistration = async (email: string, code: string): Promise<User> => {
  const response = await fetch(`${API_BASE_URL}/api/register/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.toLowerCase().trim(), code })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Verification failed");
  
  const { token, user, org } = data;
  localStorage.setItem(KEYS.TOKEN, token);
  saveOrg(org, true);
  saveUsers([user], true);
  return user;
};

export const login = async (email: string, pass: string): Promise<User | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.toLowerCase().trim(), password: pass })
    });
    if (response.ok) {
      const { token, user, organization } = await response.json();
      localStorage.setItem(KEYS.TOKEN, token);
      if (organization) {
         saveOrg(organization, true);
      }
      return user;
    }
  } catch (e: any) {
    console.warn(`[LOGIN] Proxy fail:`, e.message);
  }

  const user = getUsers().find(u => u.email.toLowerCase().trim() === email.toLowerCase().trim());
  if (user?.password) {
     if (user.password.startsWith('$2')) return null;
     const hashedInput = await hashPassword(pass);
     if (hashedInput === user.password) {
        const partners = getNetworkPartners();
        const foundOrg = partners.find(p => p.id === user.orgId);
        if (foundOrg) {
           saveOrg(foundOrg as any, true);
        }
        return user;
     }
  }
  return null;
};

export const forgotPassword = async (email: string): Promise<any> => {
   try {
      const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ email: email.toLowerCase().trim() })
      });
      return await response.json();
   } catch (e: any) {
      return { success: false, error: e.message };
   }
};

export const resetPassword = async (email: string, code: string, newPassword: string): Promise<any> => {
   try {
      const response = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ email: email.toLowerCase().trim(), code, newPassword })
      });
      return await response.json();
   } catch (e: any) {
      return { success: false, error: e.message };
   }
};

export const deleteOrganization = async (orgId: string) => {
   try { await syncDeleteOrganization(orgId); } catch (e) {}
   saveNetworkPartners(getNetworkPartners().filter(p => p.id !== orgId));
};

export const isMfaTrustedDevice = (userId: string): boolean => !!JSON.parse(localStorage.getItem(KEYS.TRUSTED_DEVICES) || '{}')[userId];
export const trustDevice = (userId: string) => {
   const trusted = JSON.parse(localStorage.getItem(KEYS.TRUSTED_DEVICES) || '{}');
   trusted[userId] = true;
   localStorage.setItem(KEYS.TRUSTED_DEVICES, JSON.stringify(trusted));
};

export const sendMfaCode = async (email: string, code: string) => {
   await sendSystemEmail(email, 'mfa', { code }, "Your Verification Code", `Code: ${code}`);
};

export const getNotifications = (): Notification[] => get(KEYS.NOTIFICATIONS, []);
export const saveNotifications = (n: Notification[]) => set(KEYS.NOTIFICATIONS, n);

export const sendMockNotification = (recipientId: string, title: string, message: string, type: any = 'System') => {
   const notifs = getNotifications();
   saveNotifications([{ id: `n-${Date.now()}`, recipientId, senderOrgName: 'System', title, message, date: new Date().toISOString().split('T')[0], isRead: false, type }, ...notifs]);
};

export const generatePartnerInvite = (): string => {
  return Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
};

export const redeemPartnerInvite = (code: string): { success: boolean, message: string } => {
  const myOrg = getOrg();
  const partners = getNetworkPartners();
  const existingPartnerships = getPartnerships();
  
  const availablePartner = partners.find(p => 
    p.id !== myOrg.id && 
    !existingPartnerships.some(rel => (rel.orgId1 === myOrg.id && rel.orgId2 === p.id) || (rel.orgId1 === p.id && rel.orgId2 === myOrg.id))
  );

  if (!availablePartner) {
    return { success: false, message: "No available partners found to connect with using this code." };
  }

  const newPartnership: Partnership = {
    id: `prt-${Date.now()}`,
    orgId1: myOrg.id,
    orgId2: availablePartner.id,
    status: 'Active',
    establishedDate: new Date().toISOString().split('T')[0]
  };

  const updated = [...existingPartnerships, newPartnership];
  savePartnerships(updated);
  
  return { success: true, message: `Successfully connected with ${availablePartner.name}!` };
};

export const regenerateDemoData = async () => {
    const mockOrg: Organization = {
      id: 'org-1', name: 'Sanctuary of the Wild', location: 'Sabah, Borneo', latitude: 4.965, longitude: 117.805,
      isOrgPublic: true, isSpeciesPublic: true, obscureLocation: false, hideName: false, foundedYear: 1998,
      description: 'The global demonstration sanctuary for OpenStudbook.', focus: 'Animals', allowBreedingRequests: true, breedingRequestContactId: 'u-1', showNativeStatus: true,
      aiUsageLimit: 1000, aiUsageCount: 42
    };

    const mockUsers: User[] = [
      { id: 'u-1', orgId: 'org-1', name: 'Sarah Admin', email: 'sarah@wild.org', role: UserRole.ADMIN, status: UserStatus.ACTIVE, password: 'password', allowedProjectIds: [] },
      { id: 'u-2', orgId: 'org-1', name: 'Mike Keeper', email: 'mike@wild.org', role: UserRole.KEEPER, status: UserStatus.ACTIVE, password: 'password', allowedProjectIds: ['p-1'] },
      { id: 'u-3', orgId: 'org-1', name: 'Zoe Super', email: 'zoe@openstudbook.org', role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE, password: 'password', allowedProjectIds: [] }
    ];

    const projects: Project[] = [{ id: 'p-1', name: 'Main Collection', description: 'General collection management', orgId: 'org-1' }];
    const s1: Species = { id: 'sp-1', projectId: 'p-1', commonName: 'Sumatran Tiger', scientificName: 'Panthera tigris sumatrae', type: 'Animal', conservationStatus: 'Critically Endangered', sexualMaturityAgeYears: 4, averageAdultWeightKg: 120, lifeExpectancyYears: 20, breedingSeasonStart: 1, breedingSeasonEnd: 12, imageUrl: generatePattern('Sumatran Tiger') };

    const partners = getNetworkPartners();
    if (!partners.some(p => p.id === 'org-1')) {
       saveNetworkPartners([...partners, mockOrg as any]);
    }

    saveOrg(mockOrg, true);
    saveUsers(mockUsers, true);
    saveProjects(projects, true);
    saveSpecies([s1], true);
    saveIndividuals([], true);
    saveBreedingEvents([], true);

    try {
       await syncPushOrg(mockOrg);
       await syncPushUsers(mockUsers); 
       await syncPushProjects(projects);
       await syncPushSpecies([s1]);
    } catch(e: any) {}
};
