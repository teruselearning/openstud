


import { getSupabaseClient, isSupabaseConfigured } from './supabase';
import { Organization, Project, User, Species, Individual, BreedingEvent, BreedingLoan, Partnership, SystemSettings, ExternalPartner, LanguageConfig } from '../types';
import { getOrg } from './storage'; 

// --- Helper: Extract Error Message ---
const getErrorMessage = (error: any): string => {
  if (!error) return 'Unknown Error';
  if (typeof error === 'string') return error;
  return error.message || error.details || error.hint || JSON.stringify(error);
};

// --- Mappers (Frontend -> DB) ---
const mapOrgToDb = (o: Organization) => ({
  id: o.id,
  name: o.name,
  location: o.location,
  latitude: o.latitude ?? null,
  longitude: o.longitude ?? null,
  founded_year: o.foundedYear,
  description: o.description,
  focus: o.focus,
  is_org_public: o.isOrgPublic,
  is_species_public: o.isSpeciesPublic,
  obscure_location: o.obscureLocation,
  hide_name: o.hideName ?? false,
  allow_breeding_requests: o.allowBreedingRequests,
  breeding_request_contact_id: o.breedingRequestContactId || null,
  show_native_status: o.showNativeStatus ?? true,
  dashboard_block: o.dashboardBlock || null,
  is_deleted: o.deleted || false
});

const mapProjectToDb = (p: Project) => ({
  id: p.id,
  name: p.name,
  description: p.description || null,
  org_id: p.orgId || null
});

const mapUserToDb = (u: User) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  status: u.status,
  password: u.password || null,
  avatar_url: u.avatarUrl || null,
  allowed_project_ids: u.allowedProjectIds || null
});

const mapSpeciesToDb = (s: Species) => ({
  id: s.id,
  project_id: s.projectId,
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
  weight_history: i.weightHistory || null,
  growth_history: i.growthHistory || null,
  health_history: i.healthHistory || null
});

const mapEventToDb = (e: BreedingEvent) => ({
  id: e.id,
  species_id: e.speciesId,
  sire_id: e.sireId || null,
  dam_id: e.damId || null,
  date: e.date,
  offspring_count: e.offspringCount,
  successful_births: e.successfulBirths,
  losses: e.losses,
  notes: e.notes,
  offspring_ids: e.offspringIds || []
});

const mapLoanToDb = (l: BreedingLoan) => ({
  id: l.id,
  partner_org_id: l.partnerOrgId,
  proposer_org_id: l.proposerOrgId,
  role: l.role,
  start_date: l.startDate,
  end_date: l.endDate || null,
  status: l.status,
  individual_ids: l.individualIds || [],
  terms: l.terms,
  notification_recipient_id: l.notificationRecipientId || null,
  change_request: l.changeRequest || null
});

const mapPartnershipToDb = (p: Partnership) => ({
  id: p.id,
  org_id_1: p.orgId1,
  org_id_2: p.orgId2,
  status: p.status,
  established_date: p.establishedDate
});

const mapLanguageToDb = (l: LanguageConfig) => ({
  code: l.code,
  name: l.name,
  translations: l.translations,
  is_default: l.isDefault,
  manual_overrides: l.manualOverrides || [],
  is_deleted: l.deleted || false
});

// --- Push Methods ---
export const syncPushOrg = async (org: Organization) => {
  if (!isSupabaseConfigured()) return;
  const client = getSupabaseClient();
  const { error } = await client.from('organizations').upsert(mapOrgToDb(org));
  if (error) throw new Error(`Org Sync Failed: ${getErrorMessage(error)}`);
};

export const syncPushUsers = async (users: User[]) => {
  if (!isSupabaseConfigured()) return;
  if (users.length === 0) return;
  const client = getSupabaseClient();
  const { error } = await client.from('users').upsert(users.map(mapUserToDb));
  if (error) throw new Error(`Users Sync Failed: ${getErrorMessage(error)}`);
};

export const syncPushProjects = async (projects: Project[]) => {
  if (!isSupabaseConfigured()) return;
  if (projects.length === 0) return;
  const client = getSupabaseClient();
  const { error } = await client.from('projects').upsert(projects.map(mapProjectToDb));
  if (error) throw new Error(`Projects Sync Failed: ${getErrorMessage(error)}`);
};

export const syncPushSpecies = async (species: Species[]) => {
  if (!isSupabaseConfigured()) return;
  if (species.length === 0) return;
  const client = getSupabaseClient();
  const { error } = await client.from('species').upsert(species.map(mapSpeciesToDb));
  if (error) throw new Error(`Species Sync Failed: ${getErrorMessage(error)}`);
};

export const syncPushIndividuals = async (individuals: Individual[]) => {
  if (!isSupabaseConfigured()) return;
  if (individuals.length === 0) return;
  const client = getSupabaseClient();
  const pass1Data = individuals.map(i => {
    const dbObj = mapIndToDb(i);
    return { ...dbObj, sire_id: null, dam_id: null };
  });
  const { error: error1 } = await client.from('individuals').upsert(pass1Data);
  if (error1) throw new Error(`Individuals Sync (Pass 1) Failed: ${getErrorMessage(error1)}`);

  const indWithParents = individuals.filter(i => i.sireId || i.damId);
  if (indWithParents.length > 0) {
    const pass2Data = indWithParents.map(mapIndToDb);
    const { error: error2 } = await client.from('individuals').upsert(pass2Data);
    if (error2) throw new Error(`Individuals Sync (Pass 2) Failed: ${getErrorMessage(error2)}`);
  }
};

export const syncPushBreedingEvents = async (events: BreedingEvent[]) => {
  if (!isSupabaseConfigured()) return;
  if (events.length === 0) return;
  const client = getSupabaseClient();
  const { error } = await client.from('breeding_events').upsert(events.map(mapEventToDb));
  if (error) throw new Error(`Breeding Events Sync Failed: ${getErrorMessage(error)}`);
};

export const syncPushBreedingLoans = async (loans: BreedingLoan[]) => {
  if (!isSupabaseConfigured()) return;
  if (loans.length === 0) return;
  const client = getSupabaseClient();
  const { error } = await client.from('breeding_loans').upsert(loans.map(mapLoanToDb));
  if (error) throw new Error(`Loans Sync Failed: ${getErrorMessage(error)}`);
};

export const syncPushPartnerships = async (partnerships: Partnership[]) => {
  if (!isSupabaseConfigured()) return;
  if (partnerships.length === 0) return;
  const client = getSupabaseClient();
  const { error } = await client.from('partnerships').upsert(partnerships.map(mapPartnershipToDb));
  if (error) throw new Error(`Partnerships Sync Failed: ${getErrorMessage(error)}`);
};

export const syncPushSettings = async (settings: SystemSettings) => {
  if (!isSupabaseConfigured()) return;
  const client = getSupabaseClient();
  const { error } = await client.from('app_config').upsert({ id: 'global-settings', settings: settings });
  if (error) throw new Error(`Settings Sync Failed: ${getErrorMessage(error)}`);
};

export const syncPushLanguages = async (languages: LanguageConfig[]) => {
  if (!isSupabaseConfigured()) return;
  const client = getSupabaseClient();
  const { error } = await client.from('languages').upsert(languages.map(mapLanguageToDb));
  if (error) {
      const msg = getErrorMessage(error);
      if (error.code === '42P01' || msg.includes('Could not find the table') || msg.includes('schema cache')) {
          console.warn("Languages table missing or schema cache stale. Skipping cloud sync for languages.");
          return;
      }
      throw new Error(`Languages Sync Failed: ${msg}`);
  }
};

export const syncDeleteLanguage = async (code: string) => {
  if (!isSupabaseConfigured()) return;
  const client = getSupabaseClient();
  // Soft delete update
  const { error } = await client.from('languages').update({ is_deleted: true }).eq('code', code);
  if (error) throw new Error(`Language Soft Delete Failed: ${getErrorMessage(error)}`);
};

export const syncDeleteOrganization = async (orgId: string) => {
  if (!isSupabaseConfigured()) throw new Error("Cloud database not configured.");
  const client = getSupabaseClient();
  
  console.log(`[Sync] Soft Deleting Org: ${orgId}`);

  // Soft Delete Only - Mark is_deleted = true
  const { error: orgError } = await client.from('organizations').update({ is_deleted: true }).eq('id', orgId);
  if (orgError) throw new Error(`Soft Delete Organization Failed: ${getErrorMessage(orgError)}`);
  
  console.log(`[Sync] Organization ${orgId} marked as deleted in cloud.`);
};

// --- Updated Pull Method ---

export const fetchRemoteData = async () => {
  if (!isSupabaseConfigured()) return { success: false, message: 'Supabase not configured' };
  const client = getSupabaseClient();

  try {
    const results: any = {};

    // 1. Fetch ALL Organizations (Filter out soft-deleted)
    const { data: allOrgs, error: orgError } = await client.from('organizations').select('*').neq('is_deleted', true);
    if (orgError) {
       console.error("Error fetching Organizations:", JSON.stringify(orgError));
       throw new Error(`Organization Sync: ${getErrorMessage(orgError)}`);
    }
    
    if (allOrgs) {
       // Logic to determine "My Organization" vs "Partners"
       const localOrg = getOrg();
       
       let myOrgData = null;
       
       // Try to find the local ID in the remote list
       if (localOrg && localOrg.id) {
          myOrgData = allOrgs.find((o: any) => o.id === localOrg.id);
       }
       
       // Fallback: ONLY if we have NO local ID, default to the first one available.
       if (!myOrgData && (!localOrg.id || localOrg.id === '')) {
          if (allOrgs.length > 0) {
             myOrgData = allOrgs[0];
          }
       }

       if (myOrgData) {
          results.org = {
             id: myOrgData.id,
             name: myOrgData.name,
             location: myOrgData.location,
             latitude: myOrgData.latitude,
             longitude: myOrgData.longitude,
             foundedYear: myOrgData.founded_year,
             description: myOrgData.description,
             focus: myOrgData.focus,
             isOrgPublic: myOrgData.is_org_public,
             isSpeciesPublic: myOrgData.is_species_public,
             obscureLocation: myOrgData.obscure_location,
             hideName: myOrgData.hide_name,
             allowBreedingRequests: myOrgData.allow_breeding_requests,
             breedingRequestContactId: myOrgData.breeding_request_contact_id,
             showNativeStatus: myOrgData.show_native_status,
             dashboard_block: myOrgData.dashboard_block,
             deleted: myOrgData.is_deleted
          };
       }

       // Map others to ExternalPartner format
       results.partners = allOrgs
          .filter((o: any) => o.id !== (myOrgData?.id || localOrg?.id || '')) // Filter out myself
          .map((o: any) => ({
             id: o.id,
             name: o.name,
             location: o.location,
             latitude: o.latitude,
             longitude: o.longitude,
             isOrgPublic: o.is_org_public,
             isSpeciesPublic: o.is_species_public,
             obscureLocation: o.obscure_location,
             hideName: o.hide_name,
             allowBreedingRequests: o.allow_breeding_requests,
             speciesIds: [], 
             populationCounts: {},
             deleted: o.is_deleted
          }));
    }

    // 2. Projects
    const { data: projects, error: projError } = await client.from('projects').select('*');
    if (projError) throw new Error(`Projects Sync: ${getErrorMessage(projError)}`);
    if (projects) {
       results.projects = projects.map((p: any) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          orgId: p.org_id
       }));
    }

    // 3. Users
    const { data: users, error: userError } = await client.from('users').select('*');
    if (userError) throw new Error(`Users Sync: ${getErrorMessage(userError)}`);
    if (users) {
       results.users = users.map((u: any) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          status: u.status,
          password: u.password,
          avatarUrl: u.avatar_url,
          allowedProjectIds: u.allowed_project_ids
       }));
    }

    // 4. Species
    const { data: species, error: spError } = await client.from('species').select('*');
    if (spError) throw new Error(`Species Sync: ${getErrorMessage(spError)}`);
    if (species) {
       results.species = species.map((s: any) => ({
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
          nativeStatusLocal: s.native_status_local
       }));
    }

    // 5. Individuals
    const { data: inds, error: indError } = await client.from('individuals').select('*');
    if (indError) throw new Error(`Individuals Sync: ${getErrorMessage(indError)}`);
    if (inds) {
       results.individuals = inds.map((i: any) => ({
          id: i.id,
          projectId: i.project_id,
          speciesId: i.species_id,
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
          isDeceased: i.is_deceased,
          deathDate: i.death_date,
          loanStatus: i.loan_status,
          transferred_to_org_id: i.transferred_to_org_id,
          transferDate: i.transfer_date,
          transferNote: i.transfer_note,
          weightHistory: i.weight_history || [],
          growthHistory: i.growth_history || [],
          healthHistory: i.health_history || []
       }));
    }

    // 6. Events
    const { data: events, error: evError } = await client.from('breeding_events').select('*');
    if (evError) throw new Error(`Breeding Events Sync: ${getErrorMessage(evError)}`);
    if (events) {
       results.breedingEvents = events.map((e: any) => ({
          id: e.id,
          speciesId: e.species_id,
          sireId: e.sire_id,
          damId: e.dam_id,
          date: e.date,
          offspringCount: e.offspring_count,
          successfulBirths: e.successful_births,
          losses: e.losses,
          notes: e.notes,
          offspringIds: e.offspring_ids || []
       }));
    }

    // 7. Loans
    const { data: loans, error: loanError } = await client.from('breeding_loans').select('*');
    if (loanError) throw new Error(`Loans Sync: ${getErrorMessage(loanError)}`);
    if (loans) {
       results.breedingLoans = loans.map((l: any) => ({
          id: l.id,
          partnerOrgId: l.partner_org_id,
          proposer_org_id: l.proposer_org_id,
          role: l.role,
          startDate: l.start_date,
          endDate: l.end_date,
          status: l.status,
          individualIds: l.individual_ids || [],
          terms: l.terms,
          notificationRecipientId: l.notification_recipient_id,
          changeRequest: l.change_request
       }));
    }

    // 8. Partnerships
    const { data: parts, error: partError } = await client.from('partnerships').select('*');
    if (partError) throw new Error(`Partnerships Sync: ${getErrorMessage(partError)}`);
    if (parts) {
       results.partnerships = parts.map((p: any) => ({
          id: p.id,
          orgId1: p.org_id_1,
          orgId2: p.org_id_2,
          status: p.status,
          establishedDate: p.established_date
       }));
    }

    // 9. Settings
    const { data: configData, error: configError } = await client.from('app_config').select('settings').eq('id', 'global-settings').single();
    if (configError && configError.code !== 'PGRST116') {
       console.error("Error fetching Settings:", JSON.stringify(configError)); 
    }
    if (configData && configData.settings) {
       results.settings = configData.settings;
    }

    // 10. Languages (Robust Fetch, filter soft deleted)
    try {
        const { data: langData, error: langError } = await client.from('languages').select('*').neq('is_deleted', true);
        if (langError) {
            const msg = getErrorMessage(langError);
            if (langError.code === '42P01' || msg.includes('Could not find the table') || msg.includes('schema cache')) {
                console.warn("Languages table missing in Supabase. Skipping language sync.");
            } else {
                console.error(`Languages Sync Error: ${msg}`);
            }
        } else if (langData) {
            results.languages = langData.map((l: any) => ({
                code: l.code,
                name: l.name,
                translations: l.translations,
                isDefault: l.is_default,
                manualOverrides: l.manual_overrides,
                deleted: l.is_deleted
            }));
        }
    } catch (langEx) {
        console.warn("Language fetch exception (continuing other syncs):", langEx);
    }

    return { success: true, data: results };
  } catch (error: any) {
    console.error("Sync Pull Failed:", error);
    const msg = getErrorMessage(error);
    return { success: false, message: msg };
  }
};
