
import { Organization, Project, User, Species, Individual, BreedingEvent, BreedingLoan, Partnership, SystemSettings, LanguageConfig } from '../types';
import { getOrg } from './storage'; 

// Using relative paths to leverage the Vite proxy (defined in vite.config.ts)
// This resolves "Cannot POST" errors by routing /api and /rest correctly to the backend
const API_BASE_URL = '';

// Helper for Fetch Wrapper with Retry
const apiRequest = async (endpoint: string, method: string, body?: any, retries = 3, backoff = 300) => {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Include the auth token if available
    const token = localStorage.getItem('os_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token.replace(/"/g, '')}`;
    }

    const config: RequestInit = {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      mode: 'cors'
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    
    // Handle non-JSON responses (usually 404 or 500 HTML pages)
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
       const text = await response.text();
       console.error(`Non-JSON Response from ${endpoint}:`, text.substring(0, 500));
       throw new Error(`Server Error: The backend returned an unexpected response (${response.status}).`);
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || 'API Request Failed');
    }
    return data;
  } catch (error: any) {
    if (retries > 0 && (error.message.includes('Failed to fetch') || error.message.includes('Network request failed'))) {
       await new Promise(resolve => setTimeout(resolve, backoff));
       return apiRequest(endpoint, method, body, retries - 1, backoff * 2);
    }
    if (method === 'GET') {
       console.warn(`API Sync Skipped [${method} ${endpoint}]: Backend unavailable.`);
       return { success: false, message: error.message };
    }
    throw error;
  }
};

// --- Mappers ---
const mapOrgToDb = (o: Organization) => ({ id: o.id, name: o.name, location: o.location, latitude: o.latitude ?? null, longitude: o.longitude ?? null, founded_year: o.foundedYear, description: o.description, focus: o.focus, is_org_public: o.isOrgPublic, is_species_public: o.isSpeciesPublic, obscure_location: o.obscureLocation, hide_name: o.hideName ?? false, allow_breeding_requests: o.allowBreedingRequests, breeding_request_contact_id: o.breedingRequestContactId || null, show_native_status: o.showNativeStatus ?? true, dashboard_block: o.dashboardBlock || null, is_deleted: o.deleted || false });
const mapProjectToDb = (p: Project) => ({ id: p.id, name: p.name, description: p.description || null, org_id: p.orgId || null });
// Fixed error on line 61: Referenced u.avatarUrl instead of u.avatar_url
const mapUserToDb = (u: User) => ({ id: u.id, org_id: u.orgId, name: u.name, email: u.email, role: u.role, status: u.status, password: u.password || null, avatar_url: u.avatarUrl || null, allowed_project_ids: u.allowedProjectIds || [] });
const mapSpeciesToDb = (s: Species) => ({ 
  id: s.id, 
  project_id: s.projectId, 
  // Fixed error on lines 65, 66, 68: Referenced camelCase properties commonName, scientificName, and plantClassification
  common_name: s.commonName, 
  scientific_name: s.scientificName, 
  type: s.type, 
  plant_classification: s.plantClassification || null, 
  conservation_status: s.conservationStatus, 
  sexual_maturity_age_years: s.sexualMaturityAgeYears, 
  average_adult_weight_kg: s.averageAdultWeightKg, 
  life_expectancy_years: s.lifeExpectancyYears, 
  breeding_season_start: s.breedingSeasonStart || null, 
  breeding_season_end: s.breedingSeasonEnd || null, 
  image_url: s.imageUrl || null, 
  native_status_country: s.nativeStatusCountry || null, 
  native_status_local: s.nativeStatusLocal || null 
});
const mapIndToDb = (i: Individual) => ({ 
  id: i.id, 
  project_id: i.projectId, 
  species_id: i.speciesId, 
  studbook_id: i.studbookId, 
  name: i.name, 
  sex: i.sex, 
  birth_date: i.birthDate || null, 
  weight_kg: i.weightKg, 
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
const mapEventToDb = (e: BreedingEvent) => ({ id: e.id, species_id: e.speciesId, sire_id: e.sireId || null, dam_id: e.damId || null, date: e.date, offspring_count: e.offspringCount, successful_births: e.successfulBirths, losses: e.losses, notes: e.notes, offspring_ids: e.offspringIds || [] });
/* Fixed error on line 108: Changed l.proposer_org_id, l.individual_ids, and l.notification_recipient_id to use correct camelCase properties from type BreedingLoan */
const mapLoanToDb = (l: BreedingLoan) => ({ id: l.id, partner_org_id: l.partnerOrgId, proposer_org_id: l.proposerOrgId, role: l.role, start_date: l.startDate, end_date: l.endDate || null, status: l.status, individual_ids: l.individualIds || [], terms: l.terms, notification_recipient_id: l.notificationRecipientId || null, change_request: l.changeRequest || null });
// Fixed error on line 110: Referenced p.establishedDate instead of p.established_date
const mapPartnershipToDb = (p: Partnership) => ({ id: p.id, org_id_1: p.orgId1, org_id_2: p.orgId2, status: p.status, established_date: p.establishedDate });
const mapLanguageToDb = (l: LanguageConfig) => ({ code: l.code, name: l.name, translations: l.translations, is_default: l.isDefault, manual_overrides: l.manualOverrides || [], is_deleted: l.deleted || false });

// --- Reverse Mappers (DB to App) ---
const fromDbOrg = (o: any): Organization => ({ id: o.id, name: o.name, location: o.location, latitude: o.latitude, longitude: o.longitude, foundedYear: o.founded_year, description: o.description, focus: o.focus, isOrgPublic: !!o.is_org_public, isSpeciesPublic: !!o.is_species_public, obscureLocation: !!o.obscure_location, hideName: !!o.hide_name, allowBreedingRequests: !!o.allow_breeding_requests, breedingRequestContactId: o.breeding_request_contact_id, showNativeStatus: !!o.show_native_status, dashboardBlock: o.dashboard_block, deleted: !!o.is_deleted });
const fromDbProject = (p: any): Project => ({ id: p.id, name: p.name, description: p.description, orgId: p.org_id });
const fromDbUser = (u: any): User => ({ id: u.id, orgId: u.org_id || u.orgId, name: u.name, email: u.email, role: u.role, status: u.status, avatarUrl: u.avatar_url, allowedProjectIds: u.allowed_project_ids || [] });
const fromDbSpecies = (s: any): Species => ({ id: s.id, projectId: s.project_id, commonName: s.common_name, scientificName: s.scientific_name, type: s.type, plantClassification: s.plant_classification, conservationStatus: s.conservation_status, sexualMaturityAgeYears: s.sexual_maturity_age_years, averageAdultWeightKg: s.average_adult_weight_kg, lifeExpectancyYears: s.life_expectancy_years, breedingSeasonStart: s.breeding_season_start, breedingSeasonEnd: s.breeding_season_end, imageUrl: s.image_url, nativeStatusCountry: s.native_status_country, nativeStatusLocal: s.native_status_local });
const fromDbInd = (i: any): Individual => ({ id: i.id, projectId: i.project_id, speciesId: i.species_id, studbookId: i.studbook_id, name: i.name, sex: i.sex, birthDate: i.birth_date, weightKg: i.weight_kg, sireId: i.sire_id, damId: i.dam_id, imageUrl: i.image_url, dnaSequence: i.dna_sequence, notes: i.notes, source: i.source, sourceDetails: i.source_details, latitude: i.latitude, longitude: i.longitude, isDeceased: !!i.is_deceased, deathDate: i.death_date, loanStatus: i.loan_status, transferredToOrgId: i.transferred_to_org_id, transferDate: i.transfer_date, transferNote: i.transfer_note, weightHistory: i.weight_history || [], growthHistory: i.growth_history || [], healthHistory: i.health_history || [] });
const fromDbEvent = (e: any): BreedingEvent => ({ id: e.id, speciesId: e.species_id, sireId: e.sire_id, damId: e.dam_id, date: e.date, offspringCount: e.offspring_count, successfulBirths: e.successful_births, losses: e.losses, notes: e.notes, offspringIds: e.offspring_ids || [] });
const fromDbLoan = (l: any): BreedingLoan => ({ id: l.id, partnerOrgId: l.partner_org_id, proposerOrgId: l.proposer_org_id, role: l.role, startDate: l.start_date, endDate: l.end_date, status: l.status, individualIds: l.individual_ids || [], terms: l.terms, notificationRecipientId: l.notification_recipient_id, changeRequest: l.change_request });
const fromDbPartnership = (p: any): Partnership => ({ id: p.id, orgId1: p.org_id_1, orgId2: p.org_id_2, status: p.status, establishedDate: p.established_date });
const fromDbLanguage = (l: any): LanguageConfig => ({ code: l.code, name: l.name, translations: l.translations, isDefault: !!l.is_default, manualOverrides: l.manual_overrides || [], deleted: !!l.is_deleted });

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
export const syncPushBreedingEvents = async (events: BreedingEvent[]) => apiRequest('/rest/v1/breeding_events', 'POST', events.map(mapEventToDb));
export const syncPushBreedingLoans = async (loans: BreedingLoan[]) => apiRequest('/rest/v1/breeding_loans', 'POST', loans.map(mapLoanToDb));
export const syncPushPartnerships = async (partnerships: Partnership[]) => apiRequest('/rest/v1/partnerships', 'POST', partnerships.map(mapPartnershipToDb));
export const syncPushSettings = async (settings: SystemSettings) => apiRequest('/rest/v1/app_config', 'POST', { id: 'global-settings', settings });
export const syncPushLanguages = async (languages: LanguageConfig[]) => apiRequest('/rest/v1/languages', 'POST', languages.map(mapLanguageToDb));

export const syncDeleteLanguage = async (code: string) => apiRequest(`/rest/v1/languages?code=${code}`, 'PATCH');
export const syncDeleteOrganization = async (orgId: string) => apiRequest(`/rest/v1/organizations?id=${orgId}`, 'PATCH');

// GET METHOD WITH TRANSFORMATION
export const fetchRemoteData = async () => {
  try {
    const response = await apiRequest('/api/sync', 'GET');
    const raw = response.success ? response.data : response;
    
    // Comprehensive Transformation Layer
    const results = {
       org: raw.org ? fromDbOrg(raw.org) : null,
       partners: (raw.partners || []).map(fromDbOrg),
       projects: (raw.projects || []).map(fromDbProject),
       users: (raw.users || []).map(fromDbUser),
       species: (raw.species || []).map(fromDbSpecies),
       individuals: (raw.individuals || []).map(fromDbInd),
       breedingEvents: (raw.breeding_events || []).map(fromDbEvent),
       breedingLoans: (raw.breeding_loans || []).map(fromDbLoan),
       partnerships: (raw.partnerships || []).map(fromDbPartnership),
       languages: (raw.languages || []).map(fromDbLanguage),
       settings: raw.settings
    };

    const localOrg = getOrg();
    let myOrgData = results.org;
    if (!myOrgData && results.partners && localOrg.id) {
       myOrgData = results.partners.find((p: any) => p.id === localOrg.id);
    }
    
    const finalPartners = (results.partners || []).filter((p: any) => p.id !== (myOrgData?.id || localOrg.id));
    
    return { success: true, data: { ...results, org: myOrgData, partners: finalPartners } };
  } catch (error: any) {
    console.error("Sync Pull Failed:", error);
    return { success: false, message: error.message || "Failed to connect to API" };
  }
};
