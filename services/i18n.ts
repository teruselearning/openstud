import { LanguageConfig } from "../types";

export const BASE_TRANSLATIONS = {
    // Nav & Sidebar
    dashboard: "Dashboard",
    networkMap: "Network",
    plantMap: "Flora Map",
    species: "Species",
    individuals: "Specimens",
    breeding: "Breeding",
    usersRoles: "Users & Roles",
    organization: "Organization",
    superAdmin: "Super Admin",
    signOut: "Sign Out",
    currentProject: "Current Project",
    allProjects: "All Projects",
    createNewProject: "Create New Project",
    
    // Landing Page
    landingTitle: "Open Source Captive Breeding Management",
    landingSubtitle: "OpenStudbook is an open-source platform for zoos, aquariums, and botanical gardens to manage species populations and track genetics.",
    createOrg: "Create Organization",
    exploreDemo: "Explore Demo",
    demoLogin: "Demo Login",
    getStarted: "Get Started",
    securePrivate: "Secure & Private",
    securePrivateDesc: "Your data is yours. Choose exactly what to share.",
    floraFauna: "Fauna & Flora",
    floraFaunaDesc: "Unified management for animals and plants.",
    globalNetwork: "Global Network",
    globalNetworkDesc: "Connect with partners worldwide.",
    back: "Back",
    registerOrg: "Register Organization",
    orgName: "Organization Name",
    orgFocus: "Focus",
    cityLocation: "City / Location",
    adminDetails: "Admin Account Details",
    yourFullName: "Your Full Name",
    workEmail: "Work Email",
    password: "Password",
    confirmPassword: "Confirm Password",
    verifyEmailAndContinue: "Verify Email & Continue",
    signIn: "Sign In",
    welcomeBack: "Welcome Back",
    signInSubtitle: "Sign in to your organisation.",
    forgotPassword: "Forgot Password?",
    needAccount: "Need an account? Register here",
    backToLanding: "Back to Landing",
    
    // Footer & Static
    about: "About",
    privacyPolicy: "Privacy Policy",
    termsConditions: "Terms & Conditions",
    
    // Dashboard
    overview: "Overview",
    welcomeBackDashboard: "Welcome back to your organization dashboard.",
    totalSpecies: "Total Species",
    totalIndividuals: "Total Specimens",
    endangeredSpecies: "Endangered Species",
    activeUsers: "Active Users",
    breedingPairs: "Suggested Breeding Pairs",
    match: "Match",
    noBreeding: "No breeding recommendations available at this time.",
    popDist: "Population Distribution",
    consStatus: "Conservation Status Ratio",
    origin: "Population Origin",
    ageDist: "Age & Sex Distribution",
    wildCaught: "Wild Caught",
    captiveBred: "Captive Bred",
    unknownOrigin: "Unknown Origin",
    males: "Males",
    females: "Females",
    unknownSex: "Unknown",
    years: "years",

    // Org Settings
    orgSettings: "Organization Settings",
    orgSettingsSubtitle: "Manage your zoo or sanctuary details and privacy.",
    locationName: "Location Name (City/State)",
    geoLocation: "Geo-Location (Map)",
    description: "Description",
    projectManagement: "Project Management",
    projectManagementDesc: "Create, edit, or delete projects. Transfer species between projects.",
    dataManagement: "Data Management",
    dataManagementDesc: "Export your data for safekeeping or transfer it to another system.",
    saveChanges: "Save Changes",
    saved: "Saved!",
    
    // Forms
    commonName: "Common Name",
    commonNamePlaceholder: "e.g. Red Panda",
    scientificName: "Scientific Name",
    scientificNamePlaceholder: "e.g. Ailurus fulgens",
    type: "Kingdom",
    animal: "Fauna",
    plant: "Flora",
    conservationStatus: "Conservation Status",
    sexualMaturity: "Sexual Maturity (Years)",
    lifeExpectancy: "Life Expectancy (Years)",
    autofill: "Autofill",
    aiGenerate: "AI Illustration",
    cancel: "Cancel",
    save: "Save",
    add: "Add",
    searchSpecies: "Search Species...",
    searchIndividuals: "Search Specimens...",

    // Super Admin & System
    saSubtitle: "Global system management and oversight.",
    security: "Security",
    email: "Email",
    landing: "Landing",
    localisation: "Localisation",
    network: "Network",
    cacheManage: "Local Cache Management",
    createOrgBtn: "Create Organisation",
    loginAs: "Login As",
    hostTag: "Host",
    smtpTestSuccess: "SMTP test sent successfully!",
    
    // Email templates
    emailVerifySubject: "Verify your email",
    emailVerifyBody: "<p>Your verification code is: <b>{{code}}</b></p>",
    emailInviteSubject: "Invitation to join {{orgName}}",
    emailInviteBody: "<p>Hello {{userName}},</p><p>You have been invited to join <b>{{orgName}}</b>.</p><p><a href='{{inviteUrl}}'>Click here to accept the invitation</a></p>",
    emailNotifySubject: "System Notification",
    emailNotifyBody: "<p>Hello,</p><p>{{message}}</p>",

    // Templates Labels
    registration: "User Registration",
    mfa: "Two-Factor Auth",
    invite: "Team Invitation",
    notification: "System Alerts"
};

export type TranslationKey = keyof typeof BASE_TRANSLATIONS;

export const SEED_LANGUAGES: LanguageConfig[] = [
  {
    code: "en-GB",
    name: "English (UK)",
    isDefault: true,
    translations: {
      ...BASE_TRANSLATIONS,
      organization: "Organisation",
      createOrg: "Create Organisation",
      registerOrg: "Register Organisation",
      orgName: "Organisation Name",
      welcomeBackDashboard: "Welcome back to your organisation dashboard.",
      orgSettings: "Organisation Settings",
      orgSettingsSubtitle: "Manage your zoo or sanctuary details.",
      allOrganizations: "All Organisations",
      createOrgBtn: "Create Organisation"
    }
  },
  {
    code: "en-US",
    name: "English (US)",
    isDefault: false,
    translations: { ...BASE_TRANSLATIONS }
  }
];