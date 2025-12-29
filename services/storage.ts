
import { Organization, User, Species, Individual, UserRole, Sex, BreedingEvent, ExternalPartner, UserStatus, OrganizationFocus, Partnership, SystemSettings, Project, BreedingLoan, Notification, LanguageConfig } from '../types';
import { BASE_TRANSLATIONS, SEED_LANGUAGES } from './i18n';
import { syncPushOrg, syncPushUsers, syncPushProjects, syncPushSpecies, syncPushIndividuals, syncPushBreedingEvents, syncPushBreedingLoans, syncPushPartnerships, syncPushSettings, syncDeleteOrganization, syncPushLanguages, syncDeleteLanguage } from './syncService';
import { hashPassword } from './crypto';
import { sendSystemEmail } from './emailService';

// Improved API Configuration detection
const getApiBaseUrl = () => {
  if (typeof window === 'undefined') return 'http://localhost:3001';
  const { hostname, protocol } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.')) {
    return `${protocol}//${hostname}:3001`;
  }
  return '';
};

const API_BASE_URL = getApiBaseUrl();

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
    return JSON.parse(item);
  } catch (e) {
    if (typeof defaultVal === 'string') return defaultVal as unknown as T;
    return defaultVal;
  }
};

const set = <T>(key: string, val: T) => {
  if (typeof window !== 'undefined') localStorage.setItem(key, JSON.stringify(val));
};

export const getSystemSettings = (): SystemSettings => get(KEYS.SETTINGS, {
  smtpHost: '', smtpPort: 587, smtpUser: '', smtpPass: '', smtpSecure: false,
  emailTemplates: {
    mfa: { enabled: true, subject: "Your Verification Code", bodyHtml: "Code: {{code}}" },
    invite: { enabled: true, subject: "OpenStudbook Invite", bodyHtml: "Welcome to {{orgName}}" },
    notification: { enabled: true, subject: "New Activity", bodyHtml: "{{message}}" }
  },
  themePrimaryColor: '#059669', themeSecondaryColor: '#10b981',
  aboutPage: { enabled: true, title: 'About', contentHtml: '' },
  privacyPage: { enabled: true, title: 'Privacy', contentHtml: '' },
  termsPage: { enabled: true, title: 'Terms', contentHtml: '' },
  enableMfa: false
});

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
      set(KEYS.ORG, { ...partner, foundedYear: 2000, description: '', focus: 'Animals' });
      return true;
   }
   return false;
};

export const getOrg = (): Organization => get(KEYS.ORG, { id: '', name: 'New Org', location: '', foundedYear: 2024, description: '', focus: 'Animals', isOrgPublic: false, isSpeciesPublic: false, obscureLocation: false, allowBreedingRequests: false });
export const saveOrg = (o: Organization, skipSync = false) => {
  set(KEYS.ORG, o);
  if (!skipSync) syncPushOrg(o).catch(() => {});
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

export const getNetworkPartners = (): ExternalPartner[] => get<ExternalPartner[]>(KEYS.PARTNERS, []).filter(p => !p.deleted);
export const saveNetworkPartners = (partners: ExternalPartner[]) => set(KEYS.PARTNERS, partners);

export const generatePartnerInvite = (): string => {
  const code = `${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`;
  const codes = get<string[]>(KEYS.INVITE_CODES, []);
  codes.push(code);
  set(KEYS.INVITE_CODES, codes);
  return code;
};

export const redeemPartnerInvite = (code: string): { success: boolean, message: string } => {
  const partners = getNetworkPartners();
  const myOrg = getOrg();
  const candidate = partners.find(p => p.id !== myOrg.id);
  if (!candidate) return { success: false, message: "No partners found." };
  const current = getPartnerships();
  const newRel: Partnership = { id: `ps-${Date.now()}`, orgId1: myOrg.id, orgId2: candidate.id, status: 'Active', establishedDate: new Date().toISOString().split('T')[0] };
  savePartnerships([...current, newRel]);
  return { success: true, message: `Connected to ${candidate.name}` };
};

export const registerOrganization = async (orgName: string, userName: string, email: string, focus: OrganizationFocus, password: string): Promise<User> => {
  const response = await fetch(`${API_BASE_URL}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orgName, userName, email, focus, password })
  });
  if (!response.ok) throw new Error((await response.json()).error || "Registration failed");
  const { token, user, org } = await response.json();
  localStorage.setItem(KEYS.TOKEN, token);
  saveOrg(org, true);
  saveUsers([user], true);
  return user;
};

export const login = async (email: string, pass: string): Promise<User | null> => {
  console.log(`[LOGIN DEBUG] Frontend login request for ${email}`);
  try {
    const response = await fetch(`${API_BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.toLowerCase().trim(), password: pass })
    });
    if (response.ok) {
      const { token, user } = await response.json();
      localStorage.setItem(KEYS.TOKEN, token);
      return user;
    }
  } catch (e: any) {
    console.warn(`[LOGIN DEBUG] Server unreachable:`, e.message);
  }

  // Local Fallback (Only works if DB has standard plain-text from old local-only mode)
  const user = getUsers().find(u => u.email.toLowerCase().trim() === email.toLowerCase().trim());
  if (user?.password) {
     if (user.password.startsWith('$2')) return null; // Server required for Bcrypt
     const hashedInput = await hashPassword(pass);
     if (hashedInput === user.password) return user;
  }
  return null;
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
   await sendSystemEmail(email, 'mfa', { code }, "Code", `Code: ${code}`);
};

export const getNotifications = (): Notification[] => get(KEYS.NOTIFICATIONS, []);
export const saveNotifications = (n: Notification[]) => set(KEYS.NOTIFICATIONS, n);

export const sendMockNotification = (recipientId: string, title: string, message: string, type: any = 'System') => {
   const notifs = getNotifications();
   saveNotifications([{ id: `n-${Date.now()}`, recipientId, senderOrgName: 'System', title, message, date: new Date().toISOString().split('T')[0], isRead: false, type }, ...notifs]);
};

export const exportSpeciesData = (speciesId: string): any => {
   const species = getSpecies().find(s => s.id === speciesId);
   if (!species) return null;
   return { species, individuals: getIndividuals().filter(i => i.speciesId === speciesId), exportDate: new Date().toISOString() };
};

export const importSpeciesData = (data: any) => {
   if (!data.species) throw new Error("Invalid Format");
   const allS = getSpecies();
   const idx = allS.findIndex(s => s.id === data.species.id);
   if (idx >= 0) allS[idx] = data.species; else allS.push(data.species);
   saveSpecies(allS);
   if (data.individuals) {
      const allI = getIndividuals();
      data.individuals.forEach((ind: Individual) => {
         const iIdx = allI.findIndex(i => i.id === ind.id);
         if (iIdx >= 0) allI[iIdx] = ind; else allI.push(ind);
      });
      saveIndividuals(allI);
   }
};

export const exportFullData = () => ({
   org: getOrg(), users: getUsers(), species: getSpecies(), individuals: getIndividuals(),
   breedingEvents: getBreedingEvents(), settings: getSystemSettings(), languages: getLanguages(), version: '1.0'
});

export const importFullData = (data: any) => {
   if (!data.org) throw new Error("Invalid Backup");
   saveOrg(data.org);
   if (data.users) saveUsers(data.users);
   if (data.species) saveSpecies(data.species);
   if (data.individuals) saveIndividuals(data.individuals);
   if (data.breedingEvents) saveBreedingEvents(data.breedingEvents);
   if (data.settings) saveSystemSettings(data.settings);
   if (data.languages) saveLanguages(data.languages);
};

export const exportDataAsCSV = (): string => {
  const individuals = getIndividuals();
  const species = getSpecies();
  const header = "Studbook ID,Individual Name,Common Name,Scientific Name,Sex,Birth Date,Status";
  const rows = individuals.map(ind => {
    const sp = species.find(s => s.id === ind.speciesId);
    return [ind.studbookId, ind.name, sp?.commonName, sp?.scientificName, ind.sex, ind.birthDate, ind.isDeceased ? 'Deceased' : 'Active'].join(",");
  });
  return [header, ...rows].join("\n");
};

export const regenerateDemoData = async () => {
    const mockOrg: Organization = {
      id: 'org-1', name: 'Sanctuary of the Wild', location: 'Sabah, Borneo', latitude: 4.965, longitude: 117.805,
      isOrgPublic: true, isSpeciesPublic: true, obscureLocation: false, hideName: false, foundedYear: 1998,
      description: 'Demo Sanctuary', focus: 'Animals', allowBreedingRequests: true, breedingRequestContactId: 'u-1', showNativeStatus: true
    };

    // Use standard plain text for sync, the backend now correctly detects and hashes these
    const mockUsers: User[] = [
      { id: 'u-1', name: 'Sarah Admin', email: 'sarah@wild.org', role: UserRole.ADMIN, status: UserStatus.ACTIVE, password: 'password', allowedProjectIds: [] },
      { id: 'u-2', name: 'Mike Keeper', email: 'mike@wild.org', role: UserRole.KEEPER, status: UserStatus.ACTIVE, password: 'password', allowedProjectIds: ['p-1'] },
      { id: 'u-3', name: 'Zoe Super', email: 'zoe@openstudbook.org', role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE, password: 'password', allowedProjectIds: [] }
    ];

    const projects: Project[] = [{ id: 'p-1', name: 'Main Collection', description: 'General collection management', orgId: 'org-1' }];
    const s1: Species = { id: 'sp-1', projectId: 'p-1', commonName: 'Sumatran Tiger', scientificName: 'Panthera tigris sumatrae', type: 'Animal', conservationStatus: 'Critically Endangered', sexualMaturityAgeYears: 4, averageAdultWeightKg: 120, lifeExpectancyYears: 20, breedingSeasonStart: 1, breedingSeasonEnd: 12, imageUrl: generatePattern('Sumatran Tiger') };

    saveOrg(mockOrg, true);
    saveUsers(mockUsers, true);
    saveProjects(projects, true);
    saveSpecies([s1], true);
    saveIndividuals([], true);
    saveBreedingEvents([], true);

    console.log("Demo Data Restored Locally.");

    try {
       await syncPushOrg(mockOrg);
       await syncPushUsers(mockUsers); 
       await syncPushProjects(projects);
       await syncPushSpecies([s1]);
       console.log("Demo Data Synced to Backend.");
    } catch(e: any) {
       console.warn("Demo Sync Failed:", e.message);
    }
};
