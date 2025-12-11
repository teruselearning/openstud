
import { Organization, Project, User, Species, Individual, BreedingEvent, BreedingLoan, Partnership, SystemSettings, LanguageConfig } from '../types';
import { getOrg } from './storage'; 

// Configuration
const API_BASE_URL = 'http://localhost:3001';

// Helper for Fetch Wrapper with Retry
const apiRequest = async (endpoint: string, method: string, body?: any, retries = 3, backoff = 300) => {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const config: RequestInit = {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      mode: 'cors'
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    
    // Handle non-JSON responses (e.g., server crash HTML)
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
       const text = await response.text();
       throw new Error(`Server returned non-JSON response: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || 'API Request Failed');
    }
    return data;
  } catch (error: any) {
    if (retries > 0 && (error.message.includes('Failed to fetch') || error.message.includes('Network request failed'))) {
       // console.warn(`API Request Failed. Retrying... (${retries} attempts left)`); // Suppress warning to avoid console noise
       await new Promise(resolve => setTimeout(resolve, backoff));
       return apiRequest(endpoint, method, body, retries - 1, backoff * 2);
    }
    
    // Don't throw for GET requests to allow UI to degrade gracefully to local-only mode
    if (method === 'GET') {
       console.warn(`API Sync Skipped [${method} ${endpoint}]: Backend unavailable.`);
       return { success: false, message: error.message };
    }
    
    // Re-throw for write operations so caller knows it failed
    throw error;
  }
};

// --- Mappers (Frontend -> Backend/DB) ---
// Note: We map to camelCase here because Prisma Client typically uses camelCase field names 
// even if the underlying database columns are snake_case.
const mapOrgToDb = (o: Organization) => ({
  id: o.id,
  name: o.name,
  location: o.location,
  latitude: o.latitude ?? null,
  longitude: o.longitude ?? null,
  foundedYear: o.foundedYear,
  description: o.description,
  focus: o.focus,
  isOrgPublic: o.isOrgPublic,
  isSpeciesPublic: o.isSpeciesPublic,
  obscureLocation: o.obscureLocation,
  hideName: o.hideName ?? false,
  allowBreedingRequests: o.allowBreedingRequests,
  breedingRequestContactId: o.breedingRequestContactId || null,
  showNativeStatus: o.showNativeStatus ?? true,
  dashboardBlock: o.dashboardBlock || null,
  isDeleted: o.deleted || false
});

const mapProjectToDb = (p: Project) => ({
  id: p.id,
  name: p.name,
  description: p.description || null,
  orgId: p.orgId || null
});

const mapUserToDb = (u: User) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  status: u.status,
  password: u.password || null,
  avatarUrl: u.avatarUrl || null,
  allowedProjectIds: u.allowedProjectIds || []
});

const mapSpeciesToDb = (s: Species) => ({
  id: s.id,
  projectId: s.projectId,
  commonName: s.commonName,
  scientificName: s.scientificName,
  type: s.type,
  plantClassification: s.plantClassification || null,
  conservationStatus: s.conservationStatus,
  sexualMaturityAgeYears: s.sexualMaturityAgeYears,
  averageAdultWeightKg: s.averageAdultWeightKg,
  lifeExpectancyYears: s.lifeExpectancyYears,
  breedingSeasonStart: s.breedingSeasonStart || null,
  breedingSeasonEnd: s.breedingSeasonEnd || null,
  imageUrl: s.imageUrl || null,
  nativeStatusCountry: s.nativeStatusCountry || null,
  nativeStatusLocal: s.nativeStatusLocal || null
});

const mapIndToDb = (i: Individual) => ({
  id: i.id,
  projectId: i.projectId,
  speciesId: i.speciesId,
  studbookId: i.studbookId,
  name: i.name,
  sex: i.sex,
  birthDate: i.birthDate || null,
  weightKg: i.weightKg,
  sireId: i.sireId || null,
  damId: i.damId || null,
  imageUrl: i.imageUrl || null,
  dnaSequence: i.dnaSequence || null,
  notes: i.notes || null,
  source: i.source || null,
  sourceDetails: i.sourceDetails || null,
  latitude: i.latitude ?? null,
  longitude: i.longitude ?? null,
  isDeceased: i.isDeceased ?? false,
  deathDate: i.deathDate || null,
  loanStatus: i.loanStatus || null,
  transferredToOrgId: i.transferredToOrgId || null,
  transferDate: i.transferDate || null,
  transferNote: i.transferNote || null,
  weightHistory: i.weightHistory || [],
  growthHistory: i.growthHistory || [],
  healthHistory: i.healthHistory || []
});

const mapEventToDb = (e: BreedingEvent) => ({
  id: e.id,
  speciesId: e.speciesId,
  sireId: e.sireId || null,
  damId: e.damId || null,
  date: e.date,
  offspringCount: e.offspringCount,
  successfulBirths: e.successfulBirths,
  losses: e.losses,
  notes: e.notes,
  offspringIds: e.offspringIds || []
});

const mapLoanToDb = (l: BreedingLoan) => ({
  id: l.id,
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
});

const mapPartnershipToDb = (p: Partnership) => ({
  id: p.id,
  orgId1: p.orgId1,
  orgId2: p.orgId2,
  status: p.status,
  establishedDate: p.establishedDate
});

const mapLanguageToDb = (l: LanguageConfig) => ({
  code: l.code,
  name: l.name,
  translations: l.translations,
  isDefault: l.isDefault,
  manualOverrides: l.manualOverrides || [],
  isDeleted: l.deleted || false
});

// --- Push Methods (Upserts) ---

export const syncPushOrg = async (org: Organization) => {
  await apiRequest('/rest/v1/organizations', 'POST', mapOrgToDb(org));
};

export const syncPushUsers = async (users: User[]) => {
  await apiRequest('/rest/v1/users', 'POST', users.map(mapUserToDb));
};

export const syncPushProjects = async (projects: Project[]) => {
  await apiRequest('/rest/v1/projects', 'POST', projects.map(mapProjectToDb));
};

export const syncPushSpecies = async (species: Species[]) => {
  await apiRequest('/rest/v1/species', 'POST', species.map(mapSpeciesToDb));
};

export const syncPushIndividuals = async (individuals: Individual[]) => {
  // Pass 1: Create/Update without parents to avoid FK issues
  const pass1Data = individuals.map(i => {
    const dbObj = mapIndToDb(i);
    return { ...dbObj, sireId: null, damId: null };
  });
  await apiRequest('/rest/v1/individuals', 'POST', pass1Data);

  // Pass 2: Update with parents
  const indWithParents = individuals.filter(i => i.sireId || i.damId);
  if (indWithParents.length > 0) {
    await apiRequest('/rest/v1/individuals', 'POST', indWithParents.map(mapIndToDb));
  }
};

export const syncPushBreedingEvents = async (events: BreedingEvent[]) => {
  await apiRequest('/rest/v1/breeding_events', 'POST', events.map(mapEventToDb));
};

export const syncPushBreedingLoans = async (loans: BreedingLoan[]) => {
  await apiRequest('/rest/v1/breeding_loans', 'POST', loans.map(mapLoanToDb));
};

export const syncPushPartnerships = async (partnerships: Partnership[]) => {
  await apiRequest('/rest/v1/partnerships', 'POST', partnerships.map(mapPartnershipToDb));
};

export const syncPushSettings = async (settings: SystemSettings) => {
  await apiRequest('/rest/v1/app_config', 'POST', { id: 'global-settings', settings });
};

export const syncPushLanguages = async (languages: LanguageConfig[]) => {
  await apiRequest('/rest/v1/languages', 'POST', languages.map(mapLanguageToDb));
};

// --- Delete Methods ---

export const syncDeleteLanguage = async (code: string) => {
  await apiRequest(`/rest/v1/languages?code=${code}`, 'PATCH');
};

export const syncDeleteOrganization = async (orgId: string) => {
  await apiRequest(`/rest/v1/organizations?id=${orgId}`, 'PATCH');
};

// --- Pull Method ---

export const fetchRemoteData = async () => {
  try {
    const response = await apiRequest('/api/sync', 'GET');
    
    // Check if backend returned success envelope or direct data
    const results = response.success ? response.data : response;

    // Filter "My Org" vs "Partners" logic handled locally if backend returns flat list
    const localOrg = getOrg();
    let myOrgData = results.org;
    
    if (!myOrgData && results.partners && localOrg.id) {
       myOrgData = results.partners.find((p: any) => p.id === localOrg.id);
    }

    const finalPartners = (results.partners || []).filter((p: any) => p.id !== (myOrgData?.id || localOrg.id));

    return {
      success: true,
      data: {
        ...results,
        org: myOrgData,
        partners: finalPartners
      }
    };
  } catch (error: any) {
    console.error("Sync Pull Failed:", error);
    return { success: false, message: error.message || "Failed to connect to Local API" };
  }
};
