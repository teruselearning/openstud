

export enum UserRole {
  SUPER_ADMIN = 'Super Admin',
  ADMIN = 'Admin',
  KEEPER = 'Keeper',
  RESEARCHER = 'Researcher',
  VET = 'Veterinarian'
}

export enum UserStatus {
  ACTIVE = 'Active',
  INVITED = 'Invited'
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  avatarUrl?: string;
  password?: string; // For mock auth
  allowedProjectIds?: string[]; // If defined and not empty, restricts access to these project IDs
  preferredLanguage?: string; // Persisted language preference
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  orgId?: string; // Links project to an organization for multi-tenancy
}

export type OrganizationFocus = 'Animals' | 'Plants';

export interface DashboardBlockConfig {
  enabled: boolean;
  title: string;
  content: string;
}

export interface Organization {
  id: string;
  name: string;
  location: string;
  latitude?: number;
  longitude?: number;
  // Privacy Settings
  isOrgPublic: boolean;     // Visible on the map/network
  isSpeciesPublic: boolean; // Species list is visible to others
  obscureLocation: boolean; // If true, shows approximate city location instead of exact coords
  hideName?: boolean;       // If true, shows "Anonymous Organization" publicly
  foundedYear: number;
  description: string;
  focus: OrganizationFocus;
  // Breeding Loan Settings
  allowBreedingRequests: boolean;
  breedingRequestContactId?: string; // User ID of the receiver
  
  // Display Settings
  showNativeStatus?: boolean; // Show Native/Invasive pills on species cards

  // Custom Dashboard
  dashboardBlock?: DashboardBlockConfig;
  
  // Soft Delete
  deleted?: boolean;
}

export interface ExternalPartner {
  id: string;
  name: string;
  location: string;
  latitude: number;
  longitude: number;
  speciesIds: string[]; // IDs of species they have from the global/common list
  isOrgPublic: boolean;
  isSpeciesPublic: boolean;
  obscureLocation: boolean;
  hideName?: boolean;
  allowBreedingRequests: boolean;
  // Cache for population display
  populationCounts?: Record<string, string>; // e.g. { 's-1': '2.1.0' }
  deleted?: boolean;
}

export interface Partnership {
  id: string;
  orgId1: string;
  orgId2: string;
  status: 'Active' | 'Pending'; // Pending if we implement a 2-way handshake later, currently code-redemption makes it active immediately
  establishedDate: string;
}

export interface Notification {
  id: string;
  recipientId: string;
  senderOrgName: string;
  title: string;
  message: string;
  date: string;
  isRead: boolean;
  type: 'BreedingRequest' | 'System' | 'Partnership' | 'LoanUpdate';
}

export interface LandingFeature {
  id: string;
  title: string;
  description: string;
  icon: string; // Name of the icon to render
}

export interface LandingPageConfig {
  heroTitle?: string;
  heroSubtitle?: string;
  showFeatures?: boolean;
  features?: LandingFeature[]; // List of customizable feature cards
  customContentHtml?: string; // HTML content to display below hero/features
}

export interface StaticPageConfig {
  enabled: boolean;
  title: string;
  contentHtml: string;
}

export interface SystemSettings {
  // SMTP
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpSecure: boolean;
  // Theming
  themePrimaryColor: string; // Hex code for primary brand color
  themeSecondaryColor: string; // Hex code for secondary/accent
  appLogoUrl?: string;
  customCss?: string; // Custom CSS overrides
  // Content
  landingPageConfig?: LandingPageConfig;
  aboutPage: StaticPageConfig;
  privacyPage: StaticPageConfig;
  termsPage: StaticPageConfig;
  // AI
  geminiApiKey?: string;
  openAiApiKey?: string;
  // Security
  recaptchaSiteKey?: string;
  recaptchaSecretKey?: string;
  enableMfa: boolean;
}

export interface LanguageConfig {
  code: string; // 'en-GB', 'fr'
  name: string; // 'English (UK)'
  translations: Record<string, string>;
  isDefault: boolean;
  manualOverrides?: string[]; // Keys that have been manually edited and should be protected from auto-translate
  deleted?: boolean;
}

export type SpeciesType = 'Animal' | 'Plant';
export type PlantClassification = 'Dioecious' | 'Monoecious';
export type NativeStatus = 'Native' | 'Introduced' | 'Invasive' | 'Unknown';

export interface Species {
  id: string;
  projectId: string; // Linked to a specific project
  commonName: string;
  scientificName: string;
  type: SpeciesType; // Distinguish between Animal and Plant
  plantClassification?: PlantClassification; // Only if type is Plant
  conservationStatus: string; // e.g., IUCN status
  sexualMaturityAgeYears: number;
  averageAdultWeightKg: number;
  lifeExpectancyYears: number;
  breedingSeasonStart?: number; // 1-12 (Jan-Dec)
  breedingSeasonEnd?: number;   // 1-12 (Jan-Dec)
  imageUrl?: string;
  
  // Native Status Context
  nativeStatusCountry?: NativeStatus; // Is it native to the country of the Org
  nativeStatusLocal?: NativeStatus;   // Is it native to the specific local region of the Org
}

export enum Sex {
  MALE = 'Male',
  FEMALE = 'Female',
  UNKNOWN = 'Unknown'
}

export interface WeightRecord {
  id: string;
  date: string;
  weightKg?: number;
  note?: string;
  imageUrl?: string;
}

export interface GrowthRecord {
  id: string;
  date: string;
  heightCm: number;
  imageUrl?: string; // Image of the plant at this growth stage
  note?: string;
}

export interface HealthRecord {
  id: string;
  date: string;
  type: 'Checkup' | 'Vaccination' | 'Injury' | 'Treatment' | 'Other';
  description: string;
  performedBy?: string;
}

export type LoanStatus = 'None' | 'Loaned Out' | 'On Loan';
export type AcquisitionSource = 'Bred in house' | 'Captive Bred' | 'Wild Caught' | 'Other';

export interface Individual {
  id: string;
  projectId: string; // Linked to a specific project
  speciesId: string;
  studbookId: string; // Unique identifier in the breeding program
  name: string;
  sex: Sex;
  birthDate: string;
  weightKg: number; // Current weight (for animals)
  sireId?: string; // Father
  damId?: string; // Mother
  imageUrl?: string;
  dnaSequence?: string; // Placeholder for DNA data content or file reference
  notes: string;
  
  // Origin / Source
  source?: AcquisitionSource;
  sourceDetails?: string;
  
  // Location (For Plants)
  latitude?: number;
  longitude?: number;

  // Status
  isDeceased?: boolean;
  deathDate?: string;
  loanStatus?: LoanStatus; // Tracks if animal is part of a loan
  
  // Transfer Info
  transferredToOrgId?: string; // ID of external partner
  transferDate?: string;
  transferNote?: string;

  // History
  weightHistory?: WeightRecord[]; // For animals
  growthHistory?: GrowthRecord[]; // For plants
  healthHistory?: HealthRecord[];
}

export interface BreedingEvent {
  id: string;
  speciesId: string;
  sireId: string;
  damId: string;
  date: string;
  offspringCount: number;
  successfulBirths: number;
  losses: number;
  notes: string;
  offspringIds: string[];
}

export type LoanRole = 'Provider' | 'Recipient';

export interface BreedingLoanChangeRequest {
  requesterOrgId: string;
  type: 'Extension' | 'Conclusion' | 'Cancellation' | 'Modification';
  newEndDate?: string; // For extension
  newTerms?: string; // For modification
  note?: string;
  requestedDate: string;
}

export interface BreedingLoan {
  id: string;
  partnerOrgId: string; // ID of the external partner
  proposerOrgId: string; // ID of the org who created/proposed the loan
  role: LoanRole; // "My" role in this loan (Provider/Recipient)
  startDate: string;
  endDate?: string;
  status: 'Proposed' | 'Active' | 'Rejected' | 'Completed' | 'Cancelled';
  individualIds: string[]; // List of individuals involved in this loan
  terms: string; // Description of agreement (offspring, duration, etc)
  notificationRecipientId?: string; // Internal user ID to notify about updates
  changeRequest?: BreedingLoanChangeRequest; // Pending change request
}