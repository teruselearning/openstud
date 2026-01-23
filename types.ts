
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
  orgId: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  avatarUrl?: string;
  password?: string;
  allowedProjectIds?: string[];
  preferredLanguage?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  orgId?: string;
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
  isOrgPublic: boolean;
  isSpeciesPublic: boolean;
  obscureLocation: boolean;
  hideName?: boolean;
  enableMfa?: boolean;
  enableEnclosures?: boolean;
  foundedYear: number;
  description: string;
  focus: OrganizationFocus;
  allowBreedingRequests: boolean;
  breedingRequestContactId?: string;
  showNativeStatus?: boolean;
  dashboardBlock?: DashboardBlockConfig;
  aiUsageLimit?: number;
  aiUsageCount?: number;
  aiUsageLastReset?: string;
  deleted?: boolean;
}

export interface EnclosurePoint {
  lat: number;
  lng: number;
}

export interface Enclosure {
  id: string;
  orgId: string;
  projectId?: string; // Scoped to a specific project
  name: string;
  description?: string;
  boundary?: EnclosurePoint[]; // Array of points for the polygon
  individualIds: string[]; // Associated individuals
}

export interface ExternalPartner {
  id: string;
  name: string;
  location: string;
  latitude: number;
  longitude: number;
  speciesIds: string[];
  isOrgPublic: boolean;
  isSpeciesPublic: boolean;
  obscureLocation: boolean;
  hideName?: boolean;
  allowBreedingRequests: boolean;
  // Added optional focus to satisfy type checks when treating partners as organizations
  focus?: OrganizationFocus;
  populationCounts?: Record<string, string>;
  deleted?: boolean;
}

export interface Partnership {
  id: string;
  orgId1: string;
  orgId2: string;
  status: 'Active' | 'Pending';
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
  icon: string;
}

export interface LandingPageConfig {
  heroTitle?: string;
  heroSubtitle?: string;
  showFeatures?: boolean;
  features?: LandingFeature[];
  customContentHtml?: string;
  registrationBanner?: string;
}

export interface StaticPageConfig {
  enabled: boolean;
  title: string;
  contentHtml: string;
}

export interface EmailTemplate {
  subject: string;
  bodyHtml: string;
  enabled: boolean;
}

export interface SystemSettings {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpSecure: boolean;
  emailTemplates?: Record<string, EmailTemplate>;
  themePrimaryColor: string;
  themeSecondaryColor: string;
  appLogoUrl?: string;
  customCss?: string;
  landingPageConfig?: LandingPageConfig;
  aboutPage: StaticPageConfig;
  privacyPage: StaticPageConfig;
  termsPage: StaticPageConfig;
  recaptchaSiteKey?: string;
  recaptchaSecretKey?: string;
  enableMfa: boolean;
  enableRegistration: boolean;
  aiModel?: string;
}

export interface LanguageConfig {
  code: string;
  name: string;
  translations: Record<string, string>;
  isDefault: boolean;
  manualOverrides?: string[];
  deleted?: boolean;
}

export type SpeciesType = 'Animal' | 'Plant';
export type PlantClassification = 'Dioecious' | 'Monoecious';
export type NativeStatus = 'Native' | 'Introduced' | 'Invasive' | 'Unknown';

export interface Species {
  id: string;
  projectId: string;
  commonName: string;
  scientificName: string;
  type: SpeciesType;
  plantClassification?: PlantClassification;
  conservationStatus: string;
  sexualMaturityAgeYears: number;
  averageAdultWeightKg: number;
  life_expectancy_years?: number; // Legacy sync compat
  lifeExpectancyYears: number;
  breedingSeasonStart?: number;
  breedingSeasonEnd?: number;
  imageUrl?: string;
  nativeStatusCountry?: NativeStatus;
  nativeStatusLocal?: NativeStatus;
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
  imageUrl?: string;
  note?: string;
}

export interface HealthRecord {
  id: string;
  date: string;
  type: 'Checkup' | 'Vaccination' | 'Injury' | 'Treatment' | 'Other';
  description: string;
  performedBy?: string;
  imageUrl?: string;
}

export type LoanStatus = 'None' | 'Loaned Out' | 'On Loan';
export type AcquisitionSource = 'Bred in house' | 'Captive Bred' | 'Wild Caught' | 'Other';

export interface Individual {
  id: string;
  projectId: string;
  speciesId: string;
  enclosureId?: string;
  studbookId: string;
  name: string;
  sex: Sex;
  birthDate: string;
  weightKg: number;
  sireId?: string;
  damId?: string;
  imageUrl?: string;
  dnaSequence?: string;
  dnaFileName?: string;
  dnaFileType?: string;
  notes: string;
  source?: AcquisitionSource;
  sourceDetails?: string;
  latitude?: number;
  longitude?: number;
  isDeceased?: boolean;
  deathDate?: string;
  loanStatus?: LoanStatus;
  transferredToOrgId?: string;
  transferDate?: string;
  transferNote?: string;
  weightHistory?: WeightRecord[];
  growthHistory?: GrowthRecord[];
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
  newEndDate?: string;
  newTerms?: string;
  note?: string;
  requestedDate: string;
}

export interface BreedingLoan {
  id: string;
  partnerOrgId: string;
  proposerOrgId: string;
  role: LoanRole;
  startDate: string;
  endDate?: string;
  status: 'Proposed' | 'Active' | 'Rejected' | 'Completed' | 'Cancelled';
  individualIds: string[];
  terms: string;
  notificationRecipientId?: string;
  changeRequest?: BreedingLoanChangeRequest;
}
