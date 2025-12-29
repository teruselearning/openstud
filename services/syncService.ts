import { Organization, Project, User, Species, Individual, BreedingEvent, BreedingLoan, Partnership, SystemSettings, LanguageConfig } from '../types';
import { getOrg } from './storage'; 

// Configuration
const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const API_BASE_URL = isLocal ? 'http://localhost:3001' : '';

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
    
    // Handle non-JSON responses
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
       const text = await response.text();
       console.error("Non-JSON Response received:", text.substring(0, 500));
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
// Fix: Access correct camelCase properties showNativeStatus and dashboardBlock from Organization interface
const mapOrgToDb = (o: Organization) => ({ id: o.id, name: o.name, location: o.location, latitude: o.latitude ?? null, longitude: o.longitude ?? null, founded_year: o.foundedYear, description: o.description, focus: o.focus, is_org_public: o.isOrgPublic, is_species_public: o.isSpeciesPublic, obscure_location: o.obscureLocation, hide_name: o.hideName ?? false, allow_breeding_requests: o.allowBreedingRequests, breeding_request_contact_id: o.breedingRequestContactId || null, show_native_status: o.showNativeStatus ?? true, dashboard_block: o.dashboardBlock || null, is_deleted: o.deleted || false });
const mapProjectToDb = (p: Project) => ({ id: p.id, name: p.name, description: p.description || null, org_id: p.orgId || null });
// Fix: Access correct camelCase property allowedProjectIds from User interface
const mapUserToDb = (u: User) => ({ id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, password: u.password || null, avatar_url: u.avatarUrl || null, allowed_project_ids: u.allowedProjectIds || [] });
const mapSpeciesToDb = (s: Species) => ({ id: s.id, project_id: s.projectId, common_name: s.commonName, scientific_name: s.scientificName, type: s.type, plant_classification: s.plantClassification || null, conservation_status: s.conservationStatus, sexual_maturity_age_years: s.sexualMaturityAgeYears, average_adult_weight_kg: s.averageAdultWeightKg, life_expectancy_years: s.lifeExpectancyYears, breeding_season_start: s.breedingSeasonStart || null, breeding_season_end: s.breedingSeasonEnd || null, image_url: s.imageUrl || null, native_status_country: s.nativeStatusCountry || null, native_status_local: s.nativeStatusLocal || null });
// Fix: Access correct camelCase properties transferDate and transferNote from Individual interface
const mapIndToDb = (i: Individual) => ({ id: i.id, project_id: i.projectId, species_id: i.speciesId, studbook_id: i.studbookId, name: i.name, sex: i.sex, birth_date: i.birthDate || null, weight_kg: i.weightKg, sire_id: i.sireId || null, dam_id: i.damId || null, image_url: i.imageUrl || null, dna_sequence: i.dnaSequence || null, notes: i.notes || null, source: i.source || null, source_details: i.sourceDetails || null, latitude: i.latitude ?? null, longitude: i.longitude ?? null, is_deceased: i.isDeceased ?? false, death_date: i.deathDate || null, loan_status: i.loanStatus || null, transferred_to_org_id: i.transferredToOrgId || null, transfer_date: i.transferDate || null, transfer_note: i.transferNote || null, weight_history: i.weightHistory || [], growth_history: i.growthHistory || [], health_history: i.healthHistory || [] });
const mapEventToDb = (e: BreedingEvent) => ({ id: e.id, species_id: e.speciesId, sire_id: e.sireId || null, dam_id: e.damId || null, date: e.date, offspring_count: e.offspringCount, successful_births: e.successfulBirths, losses: e.losses, notes: e.notes, offspring_ids: e.offspringIds || [] });
const mapLoanToDb = (l: BreedingLoan) => ({ id: l.id, partner_org_id: l.partnerOrgId, proposer_org_id: l.proposerOrgId, role: l.role, start_date: l.startDate, end_date: l.endDate || null, status: l.status, individual_ids: l.individualIds || [], terms: l.terms, notification_recipient_id: l.notificationRecipientId || null, change_request: l.changeRequest || null });
const mapPartnershipToDb = (p: Partnership) => ({ id: p.id, org_id_1: p.orgId1, org_id_2: p.orgId2, status: p.status, established_date: p.establishedDate });
const mapLanguageToDb = (l: LanguageConfig) => ({ code: l.code, name: l.name, translations: l.translations, is_default: l.isDefault, manual_overrides: l.manualOverrides || [], is_deleted: l.deleted || false });

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

// CHANGED TO GET METHOD
export const fetchRemoteData = async () => {
  try {
    const response = await apiRequest('/api/sync', 'GET');
    const results = response.success ? response.data : response;
    const localOrg = getOrg();
    let myOrgData = results.org;
    if (!myOrgData && results.partners && localOrg.id) myOrgData = results.partners.find((p: any) => p.id === localOrg.id);
    const finalPartners = (results.partners || []).filter((p: any) => p.id !== (myOrgData?.id || localOrg.id));
    if (results.languages) {
        results.languages = results.languages.map((l: any) => ({ ...l, isDefault: l.isDefault ?? l.is_default ?? false, deleted: l.deleted ?? l.is_deleted ?? false }));
    }
    return { success: true, data: { ...results, org: myOrgData, partners: finalPartners } };
  } catch (error: any) {
    console.error("Sync Pull Failed:", error);
    return { success: false, message: error.message || "Failed to connect to API" };
  }
};