import { Organization, Project, User, Species, Individual, BreedingEvent, BreedingLoan, Partnership, SystemSettings, LanguageConfig, Enclosure } from '../types';

const API_BASE_URL = '';

const apiRequest = async (endpoint: string, method: string, body?: any, retries = 3, backoff = 300) => {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('os_token');
    const cleanToken = (token && token !== 'undefined' && token !== 'null') ? token.replace(/"/g, '') : null;
    if (cleanToken) {
        headers['Authorization'] = `Bearer ${cleanToken}`;
    }
    const config: RequestInit = {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      mode: 'cors'
    };
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    if (response.status === 401) {
       localStorage.removeItem('os_token');
       localStorage.removeItem('os_session');
       const errorData = await response.json().catch(() => ({}));
       throw new Error(errorData.error || "Session expired. Please log in again.");
    }
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
       throw new Error(`Server Error: Unexpected response format (${response.status}).`);
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'API Request Failed');
    return data;
  } catch (error: any) {
    if (error.message.includes('Session expired') || error.message.includes('Unauthorized')) throw error;
    if (retries > 0 && (error.message.includes('Failed to fetch') || error.message.includes('Network request failed'))) {
       await new Promise(resolve => setTimeout(resolve, backoff));
       return apiRequest(endpoint, method, body, retries - 1, backoff * 2);
    }
    throw error;
  }
};

const safeParse = (data: any, fallback: any = {}) => {
  if (!data) return fallback;
  if (typeof data === 'object' && data !== null) return data;
  try { return JSON.parse(data.toString()); } catch (e) { return fallback; }
};

const fromDbOrg = (o: any): Organization => ({ 
  id: o.id, name: o.name, location: o.location, latitude: o.latitude, longitude: o.longitude, 
  foundedYear: o.founded_year, 
  description: o.description, focus: o.focus, isOrgPublic: !!o.is_org_public, isSpeciesPublic: !!o.is_species_public, 
  obscureLocation: !!o.obscure_location, hideName: !!o.hide_name, allowBreedingRequests: !!o.allow_breeding_requests, 
  breedingRequestContactId: o.breeding_request_contact_id, showNativeStatus: !!o.show_native_status, 
  dashboardBlock: safeParse(o.dashboard_block, null), enableMfa: !!o.enable_mfa, enableEnclosures: !!o.enable_enclosures, 
  deleted: !!o.is_deleted 
});

const fromDbProject = (p: any): Project => ({ id: p.id, name: p.name, description: p.description, orgId: p.org_id });

// Corrected snake_case mapping to camelCase interface properties for fromDbUser
const fromDbUser = (u: any): User => ({ 
  id: u.id, 
  orgId: u.org_id, 
  name: u.name, 
  email: u.email, 
  role: u.role, 
  status: u.status, 
  avatarUrl: u.avatar_url, 
  allowedProjectIds: safeParse(u.allowed_project_ids, []), 
  preferredLanguage: u.preferred_language 
});

// Fixed: Corrected scientific_name to scientificName mapping
const fromDbSpecies = (s: any): Species => ({ 
  id: s.id, projectId: s.project_id, commonName: s.common_name, scientificName: s.scientific_name, type: s.type, 
  plantClassification: s.plant_classification, conservationStatus: s.conservation_status, 
  sexualMaturityAgeYears: s.sexual_maturity_age_years, averageAdultWeightKg: s.average_adult_weight_kg, 
  lifeExpectancyYears: s.life_expectancy_years, 
  breedingSeasonStart: s.breeding_season_start, breedingSeasonEnd: s.breeding_season_end, 
  imageUrl: s.image_url, nativeStatusCountry: s.native_status_country, nativeStatusLocal: s.native_status_local 
});

// Corrected snake_case mapping to camelCase interface properties for fromDbInd
const fromDbInd = (i: any): Individual => ({ 
  id: i.id, 
  projectId: i.project_id, 
  speciesId: i.species_id, 
  enclosureId: i.enclosure_id, 
  studbookId: i.studbook_id, 
  name: i.name, 
  sex: i.sex, 
  birthDate: i.birth_date, 
  weightKg: i.weight_kg, 
  sireId: i.sire_id, 
  damId: i.dam_id, 
  imageUrl: i.image_url, 
  dnaSequence: i.dna_sequence, 
  notes: i.notes, 
  source: i.source, 
  sourceDetails: i.source_details, 
  latitude: i.latitude, 
  longitude: i.longitude, 
  isDeceased: !!i.is_deceased, 
  deathDate: i.death_date, 
  loanStatus: i.loan_status, 
  transferredToOrgId: i.transferred_to_org_id, 
  transferDate: i.transfer_date, 
  transferNote: i.transfer_note, 
  weightHistory: safeParse(i.weight_history, []), 
  growthHistory: safeParse(i.growth_history, []), 
  healthHistory: safeParse(i.health_history, []) 
});

const fromDbEnclosure = (e: any): Enclosure => ({ 
  id: e.id, orgId: e.org_id, projectId: e.project_id, name: e.name, description: e.description, 
  boundary: safeParse(e.boundary, []), individualIds: safeParse(e.individual_ids, []) 
});

// Fixed: Corrected successful_births to successfulBirths mapping
const fromDbEvent = (e: any): BreedingEvent => ({ id: e.id, speciesId: e.species_id, sireId: e.sire_id || '', damId: e.dam_id || '', date: e.date, offspringCount: e.offspring_count, successfulBirths: e.successful_births, losses: e.losses, notes: e.notes, offspringIds: safeParse(e.offspring_ids, []) });

const fromDbLoan = (l: any): BreedingLoan => ({ 
  id: l.id, 
  partnerOrgId: l.partner_org_id, 
  proposerOrgId: l.proposer_org_id, 
  role: l.role, 
  startDate: l.start_date, 
  endDate: l.end_date, 
  status: l.status, 
  individualIds: safeParse(l.individual_ids, []), 
  terms: l.terms, 
  notificationRecipientId: l.notification_recipient_id, 
  changeRequest: safeParse(l.change_request, null) 
});

const fromDbPartnership = (p: any): Partnership => ({ 
  id: p.id, 
  orgId1: p.org_id_1, 
  orgId2: p.org_id_2, 
  status: p.status, 
  establishedDate: p.established_date 
});

// Fixed: Corrected manual_overrides to manualOverrides mapping
const fromDbLanguage = (l: any): LanguageConfig => ({ code: l.code, name: l.name, translations: safeParse(l.translations, {}), isDefault: !!l.is_default, manualOverrides: safeParse(l.manual_overrides, []), deleted: !!l.is_deleted });

const sanitizeNum = (val: any, fallback: any = 0) => {
    if (val === null || val === undefined) return fallback;
    const n = Number(val);
    return isNaN(n) ? fallback : n;
};

export const mapOrgToDb = (o: Organization) => ({ id: o.id, name: o.name, location: o.location, latitude: o.latitude ?? null, longitude: o.longitude ?? null, founded_year: sanitizeNum(o.foundedYear, 2024), description: o.description, focus: o.focus, is_org_public: o.isOrgPublic, is_species_public: o.isSpeciesPublic, obscure_location: o.obscureLocation, hide_name: o.hideName ?? false, allow_breeding_requests: o.allowBreedingRequests, breeding_request_contact_id: o.breedingRequestContactId || null, show_native_status: o.showNativeStatus ?? true, dashboard_block: o.dashboardBlock, enable_mfa: o.enableMfa ?? false, enable_enclosures: o.enableEnclosures ?? false, is_deleted: o.deleted || false });
export const mapProjectToDb = (p: Project) => ({ id: p.id, name: p.name, description: p.description || null, org_id: p.orgId || null });

// Fixed: Corrected u.preferred_language to u.preferredLanguage
export const mapUserToDb = (u: User) => ({ id: u.id, org_id: u.orgId, name: u.name, email: u.email, role: u.role, status: u.status, password: u.password || null, avatar_url: u.avatarUrl || null, allowed_project_ids: u.allowedProjectIds || [], preferred_language: u.preferredLanguage || 'en-GB' });

// Fixed: Corrected s.common_name, s.scientific_name, s.conservation_status properties
export const mapSpeciesToDb = (s: Species) => ({ 
  id: s.id, project_id: s.projectId, common_name: s.commonName, scientific_name: s.scientificName, type: s.type, 
  plant_classification: s.plantClassification || null, 
  conservation_status: s.conservationStatus, sexual_maturity_age_years: sanitizeNum(s.sexualMaturityAgeYears), average_adult_weight_kg: sanitizeNum(s.averageAdultWeightKg), life_expectancy_years: sanitizeNum(s.lifeExpectancyYears), breeding_season_start: sanitizeNum(s.breedingSeasonStart, null), breeding_season_end: sanitizeNum(s.breedingSeasonEnd, null), image_url: s.imageUrl || null, native_status_country: s.nativeStatusCountry || null, native_status_local: s.nativeStatusLocal || null 
});

// Fixed: Corrected i.image_url to i.imageUrl
export const mapIndToDb = (i: Individual) => ({ 
  id: i.id, 
  project_id: i.projectId, 
  species_id: i.speciesId, 
  enclosure_id: i.enclosureId || null, 
  studbook_id: i.studbookId, 
  name: i.name, 
  sex: i.sex, 
  birth_date: i.birthDate || null, 
  weight_kg: sanitizeNum(i.weightKg), 
  sire_id: i.sireId || null, 
  dam_id: i.damId || null, 
  image_url: i.imageUrl || null, 
  dna_sequence: i.dnaSequence || null, 
  notes: i.notes || null, 
  source: i.source || null, 
  source_details: i.sourceDetails || null, 
  latitude: i.latitude ?? null, 
  longitude: i.longitude ?? null, 
  is_deceased: i.isDeceased ?? false, 
  death_date: i.deathDate || null, 
  loan_status: i.loanStatus || null, 
  transferred_to_org_id: i.transferredToOrgId || null, 
  transfer_date: i.transferDate || null, 
  transfer_note: i.transferNote || null, 
  weight_history: i.weightHistory || [], 
  growth_history: i.growthHistory || [], 
  health_history: i.healthHistory || [] 
});

// Fixed: Corrected individual_ids mapping for Enclosure in mapEnclosureToDb
export const mapEnclosureToDb = (e: Enclosure) => ({ id: e.id, org_id: e.orgId, project_id: e.projectId || null, name: e.name, description: e.description || null, boundary: e.boundary || [], individual_ids: e.individualIds || [] });

export const syncPushOrg = async (org: Organization) => apiRequest('/rest/v1/organizations', 'POST', mapOrgToDb(org));
export const syncPushUsers = async (users: User[]) => apiRequest('/rest/v1/users', 'POST', users.map(mapUserToDb));
export const syncPushProjects = async (projects: Project[]) => apiRequest('/rest/v1/projects', 'POST', projects.map(mapProjectToDb));
export const syncPushSpecies = async (species: Species[]) => apiRequest('/rest/v1/species', 'POST', species.map(mapSpeciesToDb));
export const syncPushIndividuals = async (individuals: Individual[]) => {
  const pass1Data = individuals.map(i => ({ ...mapIndToDb(i), sire_id: null, dam_id: null }));
  await apiRequest('/rest/v1/individuals', 'POST', pass1Data);
  const indWithParents = individuals.filter(i => i.sireId || i.damId);
  if (indWithParents.length > 0) await apiRequest('/rest/v1/individuals', 'POST', indWithParents.map(mapIndToDb));
};
export const syncPushEnclosures = async (enclosures: Enclosure[]) => apiRequest('/rest/v1/enclosures', 'POST', enclosures.map(mapEnclosureToDb));

export const syncPushBreedingEvents = async (events: BreedingEvent[]) => apiRequest('/rest/v1/breeding_events', 'POST', events.map(e => ({ id: e.id, species_id: e.speciesId, sire_id: e.sireId, dam_id: e.damId, date: e.date, offspring_count: e.offspringCount, successful_births: e.successfulBirths, losses: e.losses, notes: e.notes, offspring_ids: e.offspringIds })));

export const syncPushBreedingLoans = async (loans: BreedingLoan[]) => apiRequest('/rest/v1/breeding_loans', 'POST', loans.map(l => ({ id: l.id, partner_org_id: l.partnerOrgId, proposer_org_id: l.proposerOrgId, role: l.role, start_date: l.startDate, end_date: l.endDate, status: l.status, individual_ids: l.individualIds, terms: l.terms, notification_recipient_id: l.notificationRecipientId, change_request: l.changeRequest })));

export const syncPushPartnerships = async (partnerships: Partnership[]) => apiRequest('/rest/v1/partnerships', 'POST', partnerships.map(p => ({ id: p.id, org_id_1: p.orgId1, org_id_2: p.orgId2, status: p.status, established_date: p.establishedDate })));

export const syncPushSettings = async (settings: SystemSettings) => apiRequest('/rest/v1/app_config', 'POST', { id: 'global-settings', settings });
export const syncPushLanguages = async (languages: LanguageConfig[]) => apiRequest('/rest/v1/languages', 'POST', languages.map(l => ({ code: l.code, name: l.name, translations: l.translations, is_default: !!l.isDefault, manual_overrides: l.manualOverrides, is_deleted: !!l.deleted })));

export const syncDeleteOrganization = async (id: string) => syncDeleteRecord('organizations', id);
export const syncPermanentDeleteOrganization = async (id: string) => syncDeleteRecord('organizations', id);
export const syncDeleteLanguage = async (code: string) => apiRequest(`/rest/v1/languages?code=${code}`, 'DELETE');

export const syncDeleteRecord = async (table: string, id: string) => apiRequest(`/rest/v1/${table}?id=${id}`, 'DELETE');

export const fetchPublicConfig = async () => {
   try {
      const response = await fetch(`${API_BASE_URL}/api/config`);
      if (!response.ok) return { success: false };
      const res = await response.json();
      if (res.success && res.data) {
         return { success: true, settings: res.data.settings, languages: (res.data.languages || []).map(fromDbLanguage) };
      }
      return { success: false };
   } catch (e) { return { success: false }; }
};

export const fetchRemoteData = async () => {
  try {
    const response = await apiRequest('/api/sync', 'GET');
    const raw = response.success ? response.data : response;
    const results = {
       org: raw.org ? fromDbOrg(raw.org) : null,
       partners: (raw.partners || []).map(fromDbOrg),
       projects: (raw.projects || []).map(fromDbProject),
       users: (raw.users || []).map(fromDbUser),
       species: (raw.species || []).map(fromDbSpecies),
       individuals: (raw.individuals || []).map(fromDbInd),
       enclosures: (raw.enclosures || []).map(fromDbEnclosure),
       breedingEvents: (raw.breedingEvents || []).map(fromDbEvent),
       breedingLoans: (raw.breedingLoans || []).map(fromDbLoan),
       partnerships: (raw.partnerships || []).map(fromDbPartnership),
       languages: (raw.languages || []).map(fromDbLanguage),
       settings: raw.settings
    };
    return { success: true, data: results };
  } catch (error: any) {
    console.error("Sync Pull Failed:", error);
    return { success: false, message: error.message || "Failed to connect to API" };
  }
};