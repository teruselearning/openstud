
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
    
    let finalUrl = `${API_BASE_URL}${endpoint}`;
    if (method.toUpperCase() === 'GET') {
      const sep = finalUrl.includes('?') ? '&' : '?';
      finalUrl = `${finalUrl}${sep}_t=${Date.now()}`;
    }

    const config: RequestInit = {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      mode: 'cors'
    };
    
    const response = await fetch(finalUrl, config);
    
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
  aiUsageLimit: o.ai_usage_limit,
  aiUsageCount: o.ai_usage_count,
  aiUsageLastReset: o.ai_usage_last_reset,
  hasOwnGeminiKey: !!o.has_gemini_api_key,
  deleted: !!o.is_deleted
});

const fromDbProject = (p: any): Project => ({ id: p.id, name: p.name, description: p.description, orgId: p.org_id });

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

const fromDbSpecies = (s: any): Species => ({ 
  id: s.id, 
  projectId: s.project_id, 
  commonName: s.common_name, 
  scientificName: s.scientific_name, 
  type: s.type, 
  plantClassification: s.plant_classification, 
  conservationStatus: s.conservation_status, 
  sexualMaturityAgeYears: s.sexual_maturity_age_years, 
  averageAdultWeightKg: s.average_adult_weight_kg, 
  lifeExpectancyYears: s.life_expectancy_years, 
  breedingSeasonStart: s.breeding_season_start, 
  breedingSeasonEnd: s.breeding_season_end, 
  imageUrl: s.image_url, 
  nativeStatusCountry: s.native_status_country,
  nativeStatusLocal: s.native_status_local,
  description: s.description || undefined,
});

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
  thumbnailUrl: i.thumbnail_url || undefined,
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
  boundary: safeParse(e.boundary, []), individualIds: safeParse(e.individual_ids, []),
  feedSchedules: safeParse(e.feed_schedules, [])
});

const fromDbEvent = (e: any): BreedingEvent => ({ 
  id: e.id, 
  speciesId: e.species_id, 
  sireId: e.sire_id || '', 
  damId: e.dam_id || '', 
  date: e.date, 
  offspringCount: e.offspring_count, 
  successfulBirths: e.successful_births, 
  losses: e.losses, 
  notes: e.notes, 
  offspringIds: safeParse(e.offspring_ids, []) 
});

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

const fromDbLanguage = (l: any): LanguageConfig => ({ 
  code: l.code, 
  name: l.name, 
  translations: safeParse(l.translations, {}), 
  isDefault: !!l.is_default, 
  manualOverrides: safeParse(l.manual_overrides, []), 
  deleted: !!l.is_deleted 
});

const sanitizeNum = (val: any, fallback: any = 0) => {
    if (val === null || val === undefined) return fallback;
    const n = Number(val);
    return isNaN(n) ? fallback : n;
};

export const mapOrgToDb = (o: Organization) => ({ 
  id: o.id, 
  name: o.name || 'Unnamed Org', 
  location: o.location || 'Unknown', 
  latitude: o.latitude ?? null, 
  longitude: o.longitude ?? null, 
  founded_year: sanitizeNum(o.foundedYear, 2024), 
  description: o.description || null, 
  // Fix: Changed 'Animals' to 'Fauna' to match OrganizationFocus type
  focus: o.focus || 'Fauna', 
  is_org_public: o.isOrgPublic || false, 
  is_species_public: o.isSpeciesPublic || false, 
  obscure_location: o.obscureLocation || false, 
  hide_name: o.hideName ?? false, 
  allow_breeding_requests: o.allowBreedingRequests || false, 
  breeding_request_contact_id: o.breedingRequestContactId || null, 
  show_native_status: o.showNativeStatus ?? true, 
  // Fixed: Correct property name is dashboardBlock
  dashboard_block: o.dashboardBlock || null, 
  enable_mfa: o.enableMfa ?? false, 
  enable_enclosures: o.enableEnclosures ?? false, 
  ai_usage_limit: sanitizeNum(o.aiUsageLimit, 0), // 0 = unlimited (default for new orgs)
  ai_usage_count: sanitizeNum(o.aiUsageCount, 0),
  ai_usage_last_reset: o.aiUsageLastReset || null,
  is_deleted: o.deleted || false 
});

export const mapProjectToDb = (p: Project) => ({ 
  id: p.id, 
  name: p.name || 'Unnamed Project', 
  description: p.description || null, 
  org_id: p.orgId || null 
});

export const mapUserToDb = (u: User) => ({ 
  id: u.id, 
  org_id: u.orgId, 
  name: u.name || 'Unknown User', 
  email: u.email, 
  role: u.role || 'Keeper', 
  status: u.status || 'Active', 
  password: u.password || null, 
  /* Fixed property name from avatar_url to avatarUrl */
  avatar_url: u.avatarUrl || null, 
  allowed_project_ids: u.allowedProjectIds || [], 
  preferred_language: u.preferredLanguage || 'en-GB' 
});

export const mapSpeciesToDb = (s: Species) => ({ 
  id: s.id, 
  project_id: s.projectId, 
  /* Fixed property names from common_name to commonName and scientific_name to scientificName */
  common_name: s.commonName || 'Unknown Species', 
  scientific_name: s.scientificName || 'Unknown', 
  type: s.type || 'Animal', 
  plant_classification: s.plantClassification || null, 
  conservation_status: s.conservationStatus || 'Unknown', 
  sexual_maturity_age_years: sanitizeNum(s.sexualMaturityAgeYears), 
  average_adult_weight_kg: sanitizeNum(s.averageAdultWeightKg), 
  life_expectancy_years: sanitizeNum(s.lifeExpectancyYears), 
  breeding_season_start: sanitizeNum(s.breedingSeasonStart, null), 
  breeding_season_end: sanitizeNum(s.breedingSeasonEnd, null), 
  image_url: s.imageUrl || null, 
  native_status_country: s.nativeStatusCountry || null,
  native_status_local: s.nativeStatusLocal || null,
  description: s.description || null,
});

export const mapIndToDb = (i: Individual) => ({ 
  id: i.id, 
  project_id: i.projectId, 
  species_id: i.speciesId, 
  enclosure_id: i.enclosureId || null, 
  studbook_id: i.studbookId || 'SB-UNSET', 
  name: i.name || 'Unnamed Individual', 
  sex: i.sex || 'Unknown', 
  /* Fixed property name from birth_date to birthDate */
  birth_date: i.birthDate || null, 
  weight_kg: sanitizeNum(i.weightKg), 
  sire_id: i.sireId || null, 
  dam_id: i.damId || null, 
  image_url: i.imageUrl || null,
  thumbnail_url: i.thumbnailUrl || null,
  // Fixed: Correct property name is dnaSequence
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
  /* Fixed property names from transfer_date to transferDate and transfer_note to transferNote */
  transfer_date: i.transferDate, 
  transfer_note: i.transferNote, 
  weight_history: i.weightHistory || [], 
  growth_history: i.growthHistory || [], 
  health_history: i.healthHistory || [] 
});

export const mapEnclosureToDb = (e: Enclosure) => ({ 
  id: e.id, 
  // Fixed mapping org_id from e.orgId (was e.org_id)
  org_id: e.orgId, 
  project_id: e.projectId || null, 
  name: e.name || 'Unnamed Enclosure', 
  description: e.description || null, 
  boundary: e.boundary || [],
  individual_ids: e.individualIds || [],
  feed_schedules: e.feedSchedules || []
});

export const uploadImageToServer = async (dataUrl: string): Promise<string> => {
  const data = await apiRequest('/api/upload', 'POST', { data: dataUrl });
  return data.url as string;
};

export const syncPushOrg = async (org: Organization) => apiRequest('/rest/v1/organizations', 'POST', mapOrgToDb(org));
export const syncPushUsers = async (users: User[]) => apiRequest('/rest/v1/users', 'POST', users.map(mapUserToDb));
export const syncPushProjects = async (projects: Project[]) => apiRequest('/rest/v1/projects', 'POST', projects.map(mapProjectToDb));
export const syncPushSpecies = async (species: Species[]) => {
  // Push core data without images — images are large base64 blobs that can exceed
  // max_allowed_packet limits when batched, causing the entire push to silently fail.
  const coreData = species.map(s => { const { image_url, ...core } = mapSpeciesToDb(s); return core; });
  await apiRequest('/rest/v1/species', 'POST', coreData);
  // Push images one at a time via PATCH (partial update), fire-and-forget.
  // PATCH avoids MySQL NOT NULL errors that occur with INSERT ... ON DUPLICATE KEY UPDATE
  // when only { id, image_url } is provided (MySQL validates NOT NULL cols before dedup).
  for (const s of species) {
    if (s.imageUrl) {
      apiRequest('/rest/v1/species', 'PATCH', { id: s.id, image_url: s.imageUrl })
        .catch(e => console.error(`[Sync] Failed to save image for species ${s.id}:`, e?.message));
    }
  }
};
export const syncPushIndividuals = async (individuals: Individual[]) => {
  // Pass 1: core data without images or parent refs (avoid FK ordering issues)
  const pass1Data = individuals.map(i => { const { image_url, thumbnail_url, ...rest } = { ...mapIndToDb(i), sire_id: null, dam_id: null }; return rest; });
  await apiRequest('/rest/v1/individuals', 'POST', pass1Data);
  // Pass 2: update parent refs (no images)
  const indWithParents = individuals.filter(i => i.sireId || i.damId);
  if (indWithParents.length > 0) {
    const pass2Data = indWithParents.map(i => { const { image_url, thumbnail_url, ...rest } = mapIndToDb(i); return rest; });
    await apiRequest('/rest/v1/individuals', 'POST', pass2Data);
  }
  // Push images one at a time via PATCH (partial update), fire-and-forget.
  for (const i of individuals) {
    if (i.imageUrl) {
      apiRequest('/rest/v1/individuals', 'PATCH', { id: i.id, image_url: i.imageUrl, thumbnail_url: i.thumbnailUrl || null }).catch(() => {});
    }
  }
};
export const syncPushEnclosures = async (enclosures: Enclosure[]) => apiRequest('/rest/v1/enclosures', 'POST', enclosures.map(mapEnclosureToDb));

/* Fixed property names offspring_count to offspringCount and successful_births to successfulBirths */
export const syncPushBreedingEvents = async (events: BreedingEvent[]) => apiRequest('/rest/v1/breeding_events', 'POST', events.map(e => ({ id: e.id, species_id: e.speciesId, sire_id: e.sireId, dam_id: e.damId, date: e.date, offspring_count: e.offspringCount, successful_births: e.successfulBirths, losses: e.losses, notes: e.notes, offspring_ids: e.offspringIds })));

/* Fixed property names proposer_org_id to proposerOrgId, individual_ids to individualIds, notification_recipient_id to notificationRecipientId, change_request to changeRequest */
export const syncPushBreedingLoans = async (loans: BreedingLoan[]) => apiRequest('/rest/v1/breeding_loans', 'POST', loans.map(l => ({ id: l.id, partner_org_id: l.partnerOrgId, proposer_org_id: l.proposerOrgId, role: l.role, start_date: l.startDate, end_date: l.endDate, status: l.status, individual_ids: l.individualIds, terms: l.terms, notification_recipient_id: l.notificationRecipientId, change_request: l.changeRequest })));

/* Fixed property name established_date to establishedDate */
export const syncPushPartnerships = async (partnerships: Partnership[]) => apiRequest('/rest/v1/partnerships', 'POST', partnerships.map(p => ({ id: p.id, org_id_1: p.orgId1, org_id_2: p.orgId2, status: p.status, established_date: p.establishedDate })));

export const syncPushSettings = async (settings: SystemSettings) => apiRequest('/rest/v1/app_config', 'POST', { id: 'global-settings', settings });
/* Fixed property name is_deleted to deleted */
export const syncPushLanguages = async (languages: LanguageConfig[]) => apiRequest('/rest/v1/languages', 'POST', languages.map(l => ({ code: l.code, name: l.name, translations: l.translations, is_default: !!l.isDefault, manual_overrides: l.manualOverrides, is_deleted: !!l.deleted })));

export const syncDeleteOrganization = async (id: string) => syncDeleteRecord('organizations', id);
export const syncPermanentDeleteOrganization = async (id: string) => syncDeleteRecord('organizations', id);
export const syncDeleteLanguage = async (code: string) => apiRequest(`/rest/v1/languages?code=${code}`, 'DELETE');

export const syncDeleteRecord = async (table: string, id: string) => {
  console.log(`[SYNC DELETE] Deleting ${id} from ${table}...`);
  return apiRequest(`/rest/v1/${table}?id=${id}`, 'DELETE');
};

export const fetchPublicConfig = async () => {
   try {
      const response = await fetch(`${API_BASE_URL}/api/config?t=${Date.now()}`);
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
    const response = await apiRequest(`/api/sync`, 'GET');
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

export const fetchIndividualImage = async (id: string): Promise<string | null> => {
  try {
    const data = await apiRequest(`/api/individuals/${id}/image`, 'GET');
    return data.imageUrl || null;
  } catch { return null; }
};

export const fetchSpeciesImage = async (id: string): Promise<string | null> => {
  try {
    const data = await apiRequest(`/api/species/${id}/image`, 'GET');
    return data.imageUrl || null;
  } catch { return null; }
};

export const getInstallStatus = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/install/status?t=${Date.now()}`);
    if (!response.ok) return { success: false, installed: false };
    return await response.json();
  } catch (e) { return { success: false, installed: false }; }
};

export const testInstallConnection = async (config: { host: string; user: string; password: string; port: string }) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/install/test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    return await response.json();
  } catch (e: any) {
    return { success: false, error: e.message || 'Could not reach the backend.' };
  }
};

export const runInstallSetup = async (config: any) => {
  const response = await fetch(`${API_BASE_URL}/api/install/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!response.ok || response.headers.get('content-length') === '0') {
    throw new Error(`Server error (${response.status}). Check backend logs.`);
  }
  return await response.json();
};
