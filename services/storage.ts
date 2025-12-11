
import { Organization, User, Species, Individual, UserRole, Sex, BreedingEvent, ExternalPartner, UserStatus, OrganizationFocus, Partnership, SystemSettings, Project, BreedingLoan, Notification, LanguageConfig } from '../types';
import { BASE_TRANSLATIONS, SEED_LANGUAGES } from './i18n';
import { syncPushOrg, syncPushUsers, syncPushProjects, syncPushSpecies, syncPushIndividuals, syncPushBreedingEvents, syncPushBreedingLoans, syncPushPartnerships, syncPushSettings, syncDeleteOrganization, syncPushLanguages, syncDeleteLanguage } from './syncService';
import { hashPassword } from './crypto';

// API Configuration
const API_BASE_URL = 'http://localhost:3001';

// Re-export sync functions for external usage (e.g. SuperAdmin seeding)
export { syncPushOrg, syncPushUsers, syncPushProjects, syncPushSpecies, syncPushIndividuals, syncPushBreedingEvents, syncPushBreedingLoans, syncPushPartnerships, syncPushSettings, syncDeleteOrganization, syncPushLanguages, syncDeleteLanguage };

// --- Constants & Keys ---
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
  TOKEN: `${STORAGE_PREFIX}token`, // New JWT Token key
  NOTIFICATIONS: `${STORAGE_PREFIX}notifications`,
  SETTINGS: `${STORAGE_PREFIX}settings`,
  LANGUAGES: `${STORAGE_PREFIX}languages`,
  TRUSTED_DEVICES: `${STORAGE_PREFIX}trusted_devices`,
  IMPERSONATING: `${STORAGE_PREFIX}impersonating`,
  BACKUP: `${STORAGE_PREFIX}backup`
};

// --- Core Helper Functions ---

const get = <T>(key: string, defaultVal: T): T => {
  if (typeof window === 'undefined') return defaultVal;
  const item = localStorage.getItem(key);
  if (!item) return defaultVal;
  try {
    return JSON.parse(item);
  } catch (e) {
    if (typeof defaultVal === 'string') {
        return defaultVal as unknown as T;
    }
    return defaultVal;
  }
};

const set = <T>(key: string, val: T) => {
  if (typeof window !== 'undefined') localStorage.setItem(key, JSON.stringify(val));
};

const getDefaultSystemSettings = (): SystemSettings => ({
  smtpHost: '', smtpPort: 587, smtpUser: '', smtpPass: '', smtpSecure: true,
  themePrimaryColor: '#059669', themeSecondaryColor: '#10b981',
  aboutPage: { enabled: true, title: 'About Us', contentHtml: '<p>About content...</p>' },
  privacyPage: { enabled: true, title: 'Privacy Policy', contentHtml: '<p>Privacy content...</p>' },
  termsPage: { enabled: true, title: 'Terms & Conditions', contentHtml: '<p>Terms content...</p>' },
  enableMfa: false
});

export const getSystemSettings = (): SystemSettings => get(KEYS.SETTINGS, getDefaultSystemSettings());
export const saveSystemSettings = (s: SystemSettings, skipSync = false) => {
  set(KEYS.SETTINGS, s);
  if (!skipSync) {
    syncPushSettings(s).catch(err => {
      // console.error("Sync Error (Settings):", err); // Suppressed to avoid noise
    });
  }
};

// --- Language Management ---
export const getLanguages = (): LanguageConfig[] => {
  const stored = get<LanguageConfig[]>(KEYS.LANGUAGES, []);
  if (stored.length === 0) {
    // Seed initial languages if none exist
    set(KEYS.LANGUAGES, SEED_LANGUAGES);
    // Quietly attempt sync, don't spam console if offline
    syncPushLanguages(SEED_LANGUAGES).catch(() => {});
    return SEED_LANGUAGES;
  }
  // Filter out soft deleted languages locally
  return stored.filter(l => !l.deleted);
};

export const saveLanguages = (langs: LanguageConfig[], skipSync = false) => {
  set(KEYS.LANGUAGES, langs);
  if (!skipSync) {
    syncPushLanguages(langs).catch(err => {
      // Only log if it's NOT a connectivity error (which is expected in offline mode)
      if (!err.message.includes('Failed to fetch') && !err.message.includes('Network request failed')) {
         console.error("Sync Error (Languages):", err);
      }
    });
  }
};

export const deleteLanguage = async (code: string) => {
  // Update local storage - Mark as deleted or remove?
  // If we remove locally but sync fails, next pull might bring it back unless sync filters.
  // Sync service `fetchRemoteData` now filters `is_deleted`.
  // So we can remove locally.
  const current = get<LanguageConfig[]>(KEYS.LANGUAGES, []);
  const updated = current.filter(l => l.code !== code);
  set(KEYS.LANGUAGES, updated);
  
  // Update remote DB explicitly using soft delete logic
  try {
    await syncDeleteLanguage(code);
  } catch (e: any) {
    console.warn("Language delete sync failed:", e.message);
    // Suppress error so UI updates even if sync fails
  }
};

// --- Pattern Generator ---
export const generatePattern = (text: string): string => {
  const settings = getSystemSettings();
  const baseColor = settings.themePrimaryColor || '#059669';
  const width = 400;
  const height = 300;
  
  // Solid background using primary color
  let svgContent = `<rect width="${width}" height="${height}" fill="${baseColor}"/>`;
  
  const estimatedFontSize = Math.min(60, Math.max(16, 500 / (text.length + 1)));
  
  // Text overlay
  svgContent += `
    <text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold" font-size="${estimatedFontSize}" fill="rgba(255,255,255,0.95)" style="text-shadow: 2px 2px 4px rgba(0,0,0,0.3);">${text}</text>
  `;
  
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${svgContent}</svg>`.trim())}`;
};
export const generateMockPattern = generatePattern;

// --- Initialization Defaults (Empty for Production) ---
const createEmptyOrg = (): Organization => ({
  id: '',
  name: 'New Organization',
  location: '',
  foundedYear: new Date().getFullYear(),
  description: '',
  focus: 'Animals',
  isOrgPublic: false,
  isSpeciesPublic: false,
  obscureLocation: false,
  allowBreedingRequests: false
});

// Mock helpers for manual generation only
const createMockOrg = (): Organization => ({
  id: 'org-1',
  name: 'Sanctuary of the Wild',
  location: 'Sabah, Borneo',
  latitude: 4.965, longitude: 117.805,
  isOrgPublic: true, isSpeciesPublic: true, obscureLocation: false, hideName: false, foundedYear: 1998,
  description: 'Dedicated to the preservation of endangered species through captive breeding and education.',
  focus: 'Animals', allowBreedingRequests: true, breedingRequestContactId: 'u-1', showNativeStatus: true,
  dashboardBlock: { enabled: true, title: 'Demo Environment', content: '<p>Welcome to the <strong>OpenStudbook Demo</strong>! Feel free to explore the features.</p>' }
});

const createMockProjects = (): Project[] => [
  { id: 'p-1', name: 'Main Collection', description: 'General collection management', orgId: 'org-1' },
  { id: 'p-2', name: 'Conservation 2025', description: 'Special conservation initiatives', orgId: 'org-1' },
  // Adding partner project mock for local testing
  { id: 'p-seattle-1', name: 'Northwest Native', description: 'Local species tracking for Seattle', orgId: 'ext-1' }
];

const createMockUsers = (): User[] => [
  { id: 'u-1', name: 'Sarah Admin', email: 'sarah@wild.org', role: UserRole.ADMIN, status: UserStatus.ACTIVE, password: '', allowedProjectIds: [] },
  { id: 'u-2', name: 'Mike Keeper', email: 'mike@wild.org', role: UserRole.KEEPER, status: UserStatus.ACTIVE, password: '', allowedProjectIds: ['p-1'] },
  { id: 'u-3', name: 'Zoe Super', email: 'zoe@openstudbook.org', role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE, password: '', allowedProjectIds: [] }
];

// --- Exported Accessors ---

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
      if (backup) {
         const data = JSON.parse(backup);
         set(KEYS.ORG, data.org);
      }
      localStorage.removeItem(KEYS.IMPERSONATING);
      localStorage.removeItem(KEYS.BACKUP);
   }
};

export const switchOrganization = (partnerId: string, explicitOrg?: any): boolean => {
   const backup = {
      org: getOrg(),
   };
   localStorage.setItem(KEYS.BACKUP, JSON.stringify(backup));
   localStorage.setItem(KEYS.IMPERSONATING, partnerId);

   const partners = getNetworkPartners();
   const partner = explicitOrg || partners.find(p => p.id === partnerId);
   
   if (partner) {
      const tempOrg: Organization = {
         ...partner,
         // Ensure basic fields exist if switching to a partner object that might be partial
         foundedYear: partner.foundedYear || 2000, 
         description: partner.description || 'Partner Organization View',
         focus: partner.focus || 'Animals',
         breedingRequestContactId: 'u-temp'
      };
      set(KEYS.ORG, tempOrg);
      return true;
   }
   return false;
};

// Data Accessors
export const getOrg = (): Organization => get(KEYS.ORG, createEmptyOrg());
export const saveOrg = (o: Organization, skipSync = false) => {
  set(KEYS.ORG, o);
  if (!skipSync) {
    syncPushOrg(o).catch(err => {
      // console.error("Sync Error (Org):", err);
    });
  }
};

export const getProjects = (): Project[] => get(KEYS.PROJECTS, []);
export const saveProjects = (p: Project[], skipSync = false) => {
  set(KEYS.PROJECTS, p);
  if (!skipSync) {
    syncPushProjects(p).catch(err => {
      // console.error("Sync Error (Projects):", err);
    });
  }
};
export const getCurrentProjectId = (): string => get(KEYS.CURRENT_PROJECT, '');
export const saveCurrentProjectId = (id: string) => set(KEYS.CURRENT_PROJECT, id);

export const getUsers = (): User[] => get(KEYS.USERS, []);
export const saveUsers = (u: User[], skipSync = false) => {
  set(KEYS.USERS, u);
  if (!skipSync) {
    syncPushUsers(u).catch(err => {
      // console.error("Sync Error (Users):", err);
    });
  }
};

export const getSpecies = (): Species[] => get(KEYS.SPECIES, []);
export const saveSpecies = (s: Species[], skipSync = false) => {
  set(KEYS.SPECIES, s);
  if (!skipSync) {
    syncPushSpecies(s).catch(err => {
      // console.error("Sync Error (Species):", err);
    });
  }
};

export const getIndividuals = (): Individual[] => get(KEYS.INDIVIDUALS, []);
export const saveIndividuals = (i: Individual[], skipSync = false) => {
  set(KEYS.INDIVIDUALS, i);
  if (!skipSync) {
    syncPushIndividuals(i).catch(err => {
      // console.error("Sync Error (Individuals):", err);
    });
  }
};

export const getBreedingEvents = (): BreedingEvent[] => get(KEYS.BREEDING, []);
export const saveBreedingEvents = (b: BreedingEvent[], skipSync = false) => {
  set(KEYS.BREEDING, b);
  if (!skipSync) {
    syncPushBreedingEvents(b).catch(err => {
      // console.error("Sync Error (Events):", err);
    });
  }
};

export const getBreedingLoans = (): BreedingLoan[] => get(KEYS.BREEDING_LOANS, []);
export const saveBreedingLoans = (l: BreedingLoan[], skipSync = false) => {
  set(KEYS.BREEDING_LOANS, l);
  if (!skipSync) {
    syncPushBreedingLoans(l).catch(err => {
      // console.error("Sync Error (Loans):", err);
    });
  }
};

export const getPartnerships = (): Partnership[] => get(KEYS.PARTNERSHIPS, []);
export const savePartnerships = (p: Partnership[], skipSync = false) => {
  set(KEYS.PARTNERSHIPS, p);
  if (!skipSync) {
    syncPushPartnerships(p).catch(err => {
      // console.error("Sync Error (Partnerships):", err);
    });
  }
};

// Partners - filtered for deleted
export const getNetworkPartners = (): ExternalPartner[] => {
  const all = get<ExternalPartner[]>(KEYS.PARTNERS, []);
  return all.filter(p => !p.deleted);
};
export const saveNetworkPartners = (partners: ExternalPartner[]) => set(KEYS.PARTNERS, partners);

export const generatePartnerInvite = (): string => {
   const org = getOrg();
   const code = `INV-${org.name.substring(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
   return code; 
};

export const redeemPartnerInvite = (code: string): { success: boolean, partner?: ExternalPartner, message: string } => {
   const partners = getNetworkPartners();
   let partnerId = '';
   // Mock lookup 
   if (code.includes('SEA')) partnerId = 'ext-1';
   else if (code.includes('SAN')) partnerId = 'ext-2';
   else if (code.includes('LON')) partnerId = 'ext-3';
   else return { success: false, message: "Invalid Invite Code" };

   const partner = partners.find(p => p.id === partnerId);
   if (!partner) return { success: false, message: "Partner not found in network" };

   const existing = getPartnerships();
   const org = getOrg();
   if (existing.some(p => (p.orgId1 === org.id && p.orgId2 === partnerId) || (p.orgId1 === partnerId && p.orgId2 === org.id))) {
      return { success: false, message: "Partnership already exists" };
   }

   const newPartnership: Partnership = {
      id: `rel-${Date.now()}`,
      orgId1: org.id,
      orgId2: partnerId,
      status: 'Active',
      establishedDate: new Date().toISOString().split('T')[0]
   };
   savePartnerships([...existing, newPartnership]); 
   return { success: true, partner, message: `Connected with ${partner.name}!` };
};

// --- AUTHENTICATION (SERVER SIDE MIGRATION) ---

export const registerOrganization = async (orgName: string, userName: string, email: string, focus: OrganizationFocus, password: string): Promise<User> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgName, userName, email, focus, password })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Registration failed");
    }

    const { token, user, org } = await response.json();
    
    // Store Auth
    localStorage.setItem(KEYS.TOKEN, token);
    
    // Update Local State with Server Response
    saveOrg(org, true); // Skip sync because server already has it
    saveUsers([user], true);
    
    return user;
  } catch (error: any) {
    console.error("Server Registration Failed:", error);
    throw error;
  }
};

export const login = async (email: string, pass: string): Promise<User | null> => {
  // 1. Try Server Auth First
  try {
    const response = await fetch(`${API_BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass })
    });

    if (response.ok) {
      const { token, user } = await response.json();
      localStorage.setItem(KEYS.TOKEN, token);
      return user;
    }
  } catch (e) {
    console.warn("Server Login Failed / Offline:", e);
  }

  // 2. Fallback: Local Demo Auth (For all demo users)
  // Allows login without backend or bcrypt dependency if offline
  const demoEmails = ['sarah@wild.org', 'mike@wild.org', 'zoe@openstudbook.org'];
  
  if (demoEmails.includes(email)) {
     const users = getUsers();
     const user = users.find(u => u.email === email);
     
     // Specific check for demo user password 'password' without hash lib dependency
     if (user && pass === 'password') {
        console.log("Logged in via Local Demo Fallback");
        return user;
     }
  }

  return null;
};

export const deleteOrganization = async (orgId: string) => {
   // 1. Trigger Cloud Soft Delete FIRST
   try {
      await syncDeleteOrganization(orgId);
   } catch (e: any) {
      if (!e.message.includes('not configured')) {
         throw e; // Stop if it's a genuine DB error
      }
   }

   // 2. Local Cleanup (Soft Delete)
   // For Network Partners list:
   const partners = get<ExternalPartner[]>(KEYS.PARTNERS, []);
   const updatedPartners = partners.filter(p => p.id !== orgId); // Remove from view
   saveNetworkPartners(updatedPartners);
};

// ... (MFA, Notifications, Exports, Imports - unchanged) ...
export const isMfaTrustedDevice = (userId: string): boolean => {
   if (typeof window === 'undefined') return false;
   const trusted = JSON.parse(localStorage.getItem(KEYS.TRUSTED_DEVICES) || '{}');
   return !!trusted[userId];
};

export const trustDevice = (userId: string) => {
   if (typeof window === 'undefined') return;
   const trusted = JSON.parse(localStorage.getItem(KEYS.TRUSTED_DEVICES) || '{}');
   trusted[userId] = true;
   localStorage.setItem(KEYS.TRUSTED_DEVICES, JSON.stringify(trusted));
};

export const sendMfaCode = (email: string, code: string) => {
   console.log(`[MOCK EMAIL] To: ${email}, Code: ${code}`);
   alert(`MOCK EMAIL: Your verification code is ${code}`);
};

export const getNotifications = (): Notification[] => get(KEYS.NOTIFICATIONS, []);
export const saveNotifications = (n: Notification[]) => set(KEYS.NOTIFICATIONS, n);

export const sendMockNotification = (recipientId: string, title: string, message: string, type: any = 'System') => {
   const notifs = getNotifications();
   const newNotif: Notification = {
      id: `n-${Date.now()}`,
      recipientId,
      senderOrgName: 'System',
      title,
      message,
      date: new Date().toISOString().split('T')[0],
      isRead: false,
      type
   };
   saveNotifications([newNotif, ...notifs]);
};

export const exportSpeciesData = (speciesId: string): any => {
   const species = getSpecies().find(s => s.id === speciesId);
   if (!species) return null;
   const individuals = getIndividuals().filter(i => i.speciesId === speciesId);
   return { species, individuals, exportDate: new Date().toISOString() };
};

export const importSpeciesData = (data: any) => {
   if (!data.species) throw new Error("Invalid Format");
   const allSpecies = getSpecies();
   const existingIdx = allSpecies.findIndex(s => s.id === data.species.id);
   if (existingIdx >= 0) allSpecies[existingIdx] = data.species; 
   else allSpecies.push(data.species);
   saveSpecies(allSpecies);

   if (data.individuals && Array.isArray(data.individuals)) {
      const allInds = getIndividuals();
      data.individuals.forEach((ind: Individual) => {
         const idx = allInds.findIndex(i => i.id === ind.id);
         if (idx >= 0) allInds[idx] = ind;
         else allInds.push(ind);
      });
      saveIndividuals(allInds); 
   }
};

export const exportFullData = () => {
   return {
      org: getOrg(),
      users: getUsers(),
      species: getSpecies(),
      individuals: getIndividuals(),
      breedingEvents: getBreedingEvents(),
      settings: getSystemSettings(),
      languages: getLanguages(),
      version: '1.0'
   };
};

export const importFullData = (data: any) => {
   if (!data.org) throw new Error("Invalid Backup File");
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
  const projects = getProjects();

  const header = "Studbook ID,Individual Name,Common Name,Scientific Name,Type,Sex,Birth/Plant Date,Current Weight (kg),Height (cm),Status,Project,Sire ID,Dam ID,Location,Notes";

  const rows = individuals.map(ind => {
    const sp = species.find(s => s.id === ind.speciesId);
    const proj = projects.find(p => p.id === ind.projectId);
    
    let status = 'Active';
    if (ind.isDeceased) status = 'Deceased';
    else if (ind.loanStatus === 'Loaned Out') status = 'Loaned Out';
    else if (ind.loanStatus === 'On Loan') status = 'On Loan';
    else if (ind.transferredToOrgId) status = 'Transferred';

    const escape = (txt: any) => {
        if (txt === undefined || txt === null) return '';
        const str = String(txt);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) return `"${str.replace(/"/g, '""')}"`;
        return str;
    };

    let latestHeight = '';
    if (ind.growthHistory && ind.growthHistory.length > 0) {
       const sorted = [...ind.growthHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
       latestHeight = String(sorted[0].heightCm);
    }

    const location = (ind.latitude && ind.longitude) ? `${ind.latitude}, ${ind.longitude}` : '';

    return [
      escape(ind.studbookId), escape(ind.name), escape(sp?.commonName), escape(sp?.scientificName), escape(sp?.type),
      escape(ind.sex), escape(ind.birthDate), escape(ind.weightKg), escape(latestHeight), escape(status),
      escape(proj?.name), escape(ind.sireId), escape(ind.damId), escape(location), escape(ind.notes)
    ].join(",");
  });

  return [header, ...rows].join("\n");
};

// --- DEMO RESTORATION FUNCTION ---
export const regenerateDemoData = async () => {
    // 1. Prepare Data
    const mockOrg = createMockOrg();
    
    // Store simple hash or placeholder locally
    // The backend sync will receive this placeholder. Since the backend expects a bcrypt hash, 
    // a simple string won't work for REAL backend auth, but for demo mode it's irrelevant.
    // The user will use the "Explore Demo" button which triggers the local bypass logic above.
    const mockUsers = createMockUsers().map(u => ({ ...u, password: 'demo-local-placeholder' }));
    
    let projects = createMockProjects();
    const projectId = projects[0].id;

    const s1: Species = {
       id: 'sp-1', projectId, commonName: 'Sumatran Tiger', scientificName: 'Panthera tigris sumatrae', type: 'Animal',
       conservationStatus: 'Critically Endangered', sexualMaturityAgeYears: 4, averageAdultWeightKg: 120, lifeExpectancyYears: 20,
       breedingSeasonStart: 1, breedingSeasonEnd: 12, imageUrl: generatePattern('Sumatran Tiger')
    };
    const s2: Species = {
       id: 'sp-2', projectId, commonName: 'Titan Arum', scientificName: 'Amorphophallus titanum', type: 'Plant',
       conservationStatus: 'Endangered', sexualMaturityAgeYears: 7, averageAdultWeightKg: 0, lifeExpectancyYears: 40,
       plantClassification: 'Monoecious', breedingSeasonStart: 1, breedingSeasonEnd: 12, imageUrl: generatePattern('Titan Arum')
    };
    const speciesList = [s1, s2];

    const i1: Individual = {
       id: 'ind-1', projectId, speciesId: s1.id, studbookId: 'SB-1001', name: 'Raja', sex: Sex.MALE, birthDate: '2018-05-15', weightKg: 130,
       notes: 'Dominant male.', imageUrl: generatePattern('Raja'), weightHistory: [], growthHistory: [], healthHistory: [],
       source: 'Wild Caught', loanStatus: 'Loaned Out'
    };
    const i2: Individual = {
       id: 'ind-2', projectId, speciesId: s1.id, studbookId: 'SB-1002', name: 'Ratu', sex: Sex.FEMALE, birthDate: '2019-02-10', weightKg: 110,
       notes: 'Good mother.', imageUrl: generatePattern('Ratu'), weightHistory: [], growthHistory: [], healthHistory: [],
       source: 'Captive Bred'
    };
    const individualList = [i1, i2];

    const ev1: BreedingEvent = {
       id: 'evt-1', speciesId: s1.id, sireId: i1.id, damId: i2.id, date: '2023-06-01', offspringCount: 2, successfulBirths: 2, losses: 0,
       notes: 'First successful clutch.', offspringIds: []
    };
    const events = [ev1];

    // 2. Save LOCALLY FIRST (Critical for offline capability)
    saveOrg(mockOrg, true);
    saveUsers(mockUsers, true);
    saveProjects(projects, true);
    saveSpecies(speciesList, true);
    saveIndividuals(individualList, true);
    saveBreedingEvents(events, true);
    
    // Ensure Languages exist
    getLanguages();

    console.log("Demo Data Restored Locally.");

    // 3. Attempt Sync (Fire and forget, or handle silently)
    try {
       await syncPushOrg(mockOrg);
       await syncPushUsers(mockUsers);
       await syncPushProjects(projects);
       await syncPushSpecies(speciesList);
       await syncPushIndividuals(individualList);
       await syncPushBreedingEvents(events);
       console.log("Demo Data Synced to Backend.");
    } catch(e: any) {
       // Suppress backend errors during demo init - user can still work locally
       console.warn("Demo Sync Failed (Backend might be offline or empty):", e.message);
    }
};
