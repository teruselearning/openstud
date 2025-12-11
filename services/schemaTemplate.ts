

export const SUPABASE_SCHEMA_SQL = `
-- 1. Enable RLS and Grants (Crucial for 'permission denied' fix)
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- 2. Tables (Safe Creation - Idempotent)
CREATE TABLE IF NOT EXISTS public.organizations (
  id text primary key,
  name text,
  location text,
  latitude double precision,
  longitude double precision,
  founded_year integer,
  description text,
  focus text,
  is_org_public boolean,
  is_species_public boolean,
  obscure_location boolean,
  hide_name boolean,
  allow_breeding_requests boolean,
  breeding_request_contact_id text,
  show_native_status boolean,
  dashboard_block jsonb,
  is_deleted boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.projects (
  id text primary key,
  org_id text references public.organizations(id) ON DELETE CASCADE,
  name text,
  description text
);

CREATE TABLE IF NOT EXISTS public.users (
  id text primary key,
  name text,
  email text,
  role text,
  status text,
  password text,
  avatar_url text,
  allowed_project_ids text[]
);

CREATE TABLE IF NOT EXISTS public.species (
  id text primary key,
  project_id text references public.projects(id) ON DELETE CASCADE,
  common_name text,
  scientific_name text,
  type text,
  plant_classification text,
  conservation_status text,
  sexual_maturity_age_years double precision,
  average_adult_weight_kg double precision,
  life_expectancy_years double precision,
  breeding_season_start integer,
  breeding_season_end integer,
  image_url text,
  native_status_country text,
  native_status_local text
);

CREATE TABLE IF NOT EXISTS public.individuals (
  id text primary key,
  project_id text references public.projects(id) ON DELETE CASCADE,
  species_id text references public.species(id) ON DELETE CASCADE,
  studbook_id text,
  name text,
  sex text,
  birth_date text,
  weight_kg double precision,
  sire_id text,
  dam_id text,
  image_url text,
  dna_sequence text,
  notes text,
  source text,
  source_details text,
  latitude double precision,
  longitude double precision,
  is_deceased boolean,
  death_date text,
  loan_status text,
  transferred_to_org_id text,
  transfer_date text,
  transfer_note text,
  weight_history jsonb,
  growth_history jsonb,
  health_history jsonb
);

CREATE TABLE IF NOT EXISTS public.breeding_events (
  id text primary key,
  species_id text references public.species(id) ON DELETE CASCADE,
  sire_id text,
  dam_id text,
  date text,
  offspring_count integer,
  successful_births integer,
  losses integer,
  notes text,
  offspring_ids text[]
);

CREATE TABLE IF NOT EXISTS public.breeding_loans (
  id text primary key,
  partner_org_id text,
  proposer_org_id text,
  role text,
  start_date text,
  end_date text,
  status text,
  individual_ids text[],
  terms text,
  notification_recipient_id text,
  change_request jsonb
);

CREATE TABLE IF NOT EXISTS public.partnerships (
  id text primary key,
  org_id_1 text,
  org_id_2 text,
  status text,
  established_date text
);

CREATE TABLE IF NOT EXISTS public.app_config (
  id text primary key,
  settings jsonb
);

-- New Languages Table
CREATE TABLE IF NOT EXISTS public.languages (
  code text primary key,
  name text,
  translations jsonb,
  is_default boolean,
  manual_overrides jsonb,
  is_deleted boolean DEFAULT false
);

-- 3. Enable RLS (Idempotent)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.species ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.individuals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.breeding_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.breeding_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partnerships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.languages ENABLE ROW LEVEL SECURITY;

-- 4. Create Policies (Drop first to avoid conflicts)
DROP POLICY IF EXISTS "Public Access" ON public.organizations;
CREATE POLICY "Public Access" ON public.organizations FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public Access" ON public.projects;
CREATE POLICY "Public Access" ON public.projects FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public Access" ON public.users;
CREATE POLICY "Public Access" ON public.users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public Access" ON public.species;
CREATE POLICY "Public Access" ON public.species FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public Access" ON public.individuals;
CREATE POLICY "Public Access" ON public.individuals FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public Access" ON public.breeding_events;
CREATE POLICY "Public Access" ON public.breeding_events FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public Access" ON public.breeding_loans;
CREATE POLICY "Public Access" ON public.breeding_loans FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public Access" ON public.partnerships;
CREATE POLICY "Public Access" ON public.partnerships FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public Access" ON public.app_config;
CREATE POLICY "Public Access" ON public.app_config FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public Access" ON public.languages;
CREATE POLICY "Public Access" ON public.languages FOR ALL USING (true) WITH CHECK (true);

-- 5. Final Grant to ensure new tables are accessible
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT ALL ON TABLE public.app_config TO anon;
GRANT ALL ON TABLE public.languages TO anon;

-- 6. Initialize Config Rows (Prevent 404s)
INSERT INTO public.app_config (id, settings) VALUES ('global-settings', '{}'::jsonb) ON CONFLICT (id) DO NOTHING;

-- 7. FIX EXISTING CONSTRAINTS (For users updating existing DB)
-- This ensures 'Cascade Delete' is enabled so deleting an Org automatically deletes its projects/species/etc.
DO $$
BEGIN
  -- Projects -> Org
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'projects_org_id_fkey') THEN
    ALTER TABLE public.projects DROP CONSTRAINT projects_org_id_fkey;
  END IF;
  ALTER TABLE public.projects ADD CONSTRAINT projects_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

  -- Species -> Projects
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'species_project_id_fkey') THEN
    ALTER TABLE public.species DROP CONSTRAINT species_project_id_fkey;
  END IF;
  ALTER TABLE public.species ADD CONSTRAINT species_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

  -- Individuals -> Projects
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'individuals_project_id_fkey') THEN
    ALTER TABLE public.individuals DROP CONSTRAINT individuals_project_id_fkey;
  END IF;
  ALTER TABLE public.individuals ADD CONSTRAINT individuals_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
  
  -- Breeding Events -> Species
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'breeding_events_species_id_fkey') THEN
    ALTER TABLE public.breeding_events DROP CONSTRAINT breeding_events_species_id_fkey;
  END IF;
  ALTER TABLE public.breeding_events ADD CONSTRAINT breeding_events_species_id_fkey FOREIGN KEY (species_id) REFERENCES public.species(id) ON DELETE CASCADE;
END $$;
`;