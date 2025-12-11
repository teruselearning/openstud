
import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import { HashRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  PawPrint, 
  Settings, 
  Menu, 
  X, 
  Dna,
  HeartHandshake,
  Globe2,
  LogOut,
  EyeOff,
  Bell,
  Briefcase,
  Plus,
  FolderOpen,
  Map,
  RefreshCw,
  AlertCircle,
  Database,
  Copy,
  Info,
  Globe,
  Shield,
  User as UserIcon,
  Camera,
  CheckCircle2,
  Mail,
  Lock,
  Save,
  Loader2
} from 'lucide-react';
import Dashboard from './pages/Dashboard';
import SpeciesManager from './pages/SpeciesManager';
import IndividualManager from './pages/IndividualManager';
import OrgSettings from './pages/OrgSettings';
import BreedingManager from './pages/BreedingManager';
import IndividualDetail from './pages/IndividualDetail';
import Network from './pages/Network';
import Landing, { ViewMode } from './pages/Landing';
import Notifications from './pages/Notifications';
import PlantMap from './pages/PlantMap';
import SuperAdminPage from './pages/SuperAdmin';
import { getSession, logout, isImpersonating, restoreMainOrg, getOrg, getSpecies, getNotifications, getSystemSettings, getProjects, getCurrentProjectId, saveProjects, saveCurrentProjectId, getIndividuals, saveOrg, saveUsers, saveSpecies, saveIndividuals, saveBreedingEvents, saveBreedingLoans, savePartnerships, saveSystemSettings, saveNetworkPartners, getUsers, getLanguages, saveLanguages, saveSession, sendMfaCode } from './services/storage';
import { fetchRemoteData, syncPushUsers } from './services/syncService';
import { User, UserRole, Organization, SystemSettings, Project, LanguageConfig } from './types';
import { TranslationKey, BASE_TRANSLATIONS } from './services/i18n';
import { SUPABASE_SCHEMA_SQL } from './services/schemaTemplate';
import { hashPassword } from './services/crypto';

// Language Context
interface LanguageContextType {
  language: string;
  setLanguage: (lang: string) => void;
  t: (key: TranslationKey) => string;
  refreshTranslations: () => void;
  availableLanguages: LanguageConfig[];
}

export const LanguageContext = createContext<LanguageContextType>({
  language: 'en-GB',
  setLanguage: () => {},
  t: (key) => key,
  refreshTranslations: () => {},
  availableLanguages: []
});

const NavItem = ({ to, icon: Icon, label, active, badge }: { to: string, icon: any, label: string, active: boolean, badge?: number }) => (
  <Link 
    to={to} 
    className={`flex items-center justify-between px-4 py-3 rounded-lg transition-colors ${
      active ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'
    }`}
  >
    <div className="flex items-center space-x-3">
      <Icon size={20} />
      <span className="font-medium">{label}</span>
    </div>
    {badge ? (
      <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{badge}</span>
    ) : null}
  </Link>
);

const Sidebar = ({ isOpen, onClose, user, onLogout, showBreeding, showPlantMap, logoUrl, projects, currentProjectId, onChangeProject, onAddProject, onEditProfile }: { isOpen: boolean, onClose: () => void, user: User, onLogout: () => void, showBreeding: boolean, showPlantMap: boolean, logoUrl?: string, projects: Project[], currentProjectId: string, onChangeProject: (id: string) => void, onAddProject: () => void, onEditProfile: () => void }) => {
  const location = useLocation();
  const path = location.pathname;
  const { t, language, setLanguage, availableLanguages } = useContext(LanguageContext);

  // robust check for super admin menu item
  const isSuper = user.role === UserRole.SUPER_ADMIN || (user.role as string) === 'Super Admin';

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={onClose}
        />
      )}
      
      {/* Sidebar Content */}
      <aside className={`fixed top-0 left-0 h-full w-64 bg-white border-r border-slate-200 z-30 transform transition-transform duration-300 lg:translate-x-0 flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 flex flex-col gap-4 flex-shrink-0">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2 text-emerald-700">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-8 w-auto object-contain" />
              ) : (
                <PawPrint size={32} />
              )}
              <h1 className="text-xl font-bold tracking-tight">OpenStudbook</h1>
            </div>
            <button onClick={onClose} className="lg:hidden text-slate-500">
              <X size={24} />
            </button>
          </div>

          {/* Project Selector */}
          <div className="relative">
             <div className="flex items-center gap-2 mb-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">
               <FolderOpen size={12} /> Current Project
             </div>
             <select 
               value={currentProjectId}
               onChange={(e) => {
                 if(e.target.value === 'NEW') {
                   onAddProject();
                 } else {
                   onChangeProject(e.target.value);
                 }
               }}
               className="w-full p-2 pl-3 border border-slate-300 rounded-lg text-sm bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
             >
               {projects.map(p => (
                 <option key={p.id} value={p.id}>{p.name}</option>
               ))}
               <option disabled>──────────</option>
               <option value="NEW">+ Create New Project</option>
             </select>
          </div>
        </div>

        <nav className="px-4 space-y-2 mt-1 flex-1 overflow-y-auto">
          <NavItem to="/" icon={LayoutDashboard} label={t('dashboard')} active={path === '/'} />
          <NavItem to="/species" icon={Dna} label={t('species')} active={path.startsWith('/species')} />
          <NavItem to="/individuals" icon={PawPrint} label={t('individuals')} active={path.startsWith('/individuals')} />
          {showPlantMap && (
             <NavItem to="/plant-map" icon={Map} label={t('plantMap')} active={path === '/plant-map'} />
          )}
          {showBreeding && (
             <NavItem to="/breeding" icon={HeartHandshake} label={t('breeding')} active={path.startsWith('/breeding')} />
          )}
          
          <div className="pt-4 mt-4 border-t border-slate-100">
             <NavItem to="/network" icon={Globe2} label={t('networkMap')} active={path === '/network'} />
             <NavItem to="/settings" icon={Settings} label={t('orgSettings')} active={path === '/settings'} />
             {isSuper && (
                <NavItem to="/super-admin" icon={Shield} label={t('superAdmin')} active={path === '/super-admin'} />
             )}
          </div>
        </nav>
        
        <div className="p-6 border-t border-slate-100 bg-slate-50 flex-shrink-0">
          <div className="mb-4">
             <div className="flex items-center gap-2 mb-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">
               <Globe size={12} /> Language
             </div>
             <select
               value={language}
               onChange={(e) => setLanguage(e.target.value)}
               className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
             >
               {availableLanguages.map(l => (
                 <option key={l.code} value={l.code}>{l.name}</option>
               ))}
             </select>
          </div>

          <div className="flex items-center justify-between mb-4 bg-white p-2 rounded-lg border border-slate-200">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full bg-emerald-200 flex items-center justify-center text-emerald-700 font-bold overflow-hidden">
                {user.avatarUrl ? <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover"/> : user.name.charAt(0)}
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-semibold text-slate-900 truncate max-w-[80px]">{user.name}</p>
                <p className="text-[10px] text-slate-500 truncate">{user.role}</p>
              </div>
            </div>
            <button 
               onClick={onEditProfile} 
               className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-emerald-600 transition-colors"
               title="Edit Profile"
            >
               <Settings size={14} />
            </button>
          </div>
          <button 
            onClick={onLogout}
            className="w-full flex items-center justify-center space-x-2 text-slate-500 hover:text-red-600 text-sm font-medium transition-colors"
          >
            <LogOut size={16} />
            <span>{t('signOut')}</span>
          </button>
        </div>
      </aside>
    </>
  );
};

const App: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [impersonating, setImpersonating] = useState(false);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [systemSettings, setSystemSettings] = useState<SystemSettings>(getSystemSettings());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string|null>(null);
  const [showDbSetup, setShowDbSetup] = useState(false);
  
  // Demo Mode Exit Flow
  const [initialLandingView, setInitialLandingView] = useState<ViewMode>('landing');
  
  // Project State
  const [projects, setProjects] = useState<Project[]>(getProjects());
  const [currentProjectId, setCurrentProjectIdState] = useState<string>(getCurrentProjectId());
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  
  // Logic to show/hide features based on project content
  const [showBreeding, setShowBreeding] = useState(true);
  const [showPlantMap, setShowPlantMap] = useState(false);

  // --- PROFILE EDIT STATE ---
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileForm, setProfileForm] = useState({
     name: '',
     email: '',
     avatarUrl: '',
     newPassword: '',
     confirmPassword: ''
  });
  const [pendingEmail, setPendingEmail] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);

  // --- LANGUAGE STATE ---
  const [languages, setLanguages] = useState<LanguageConfig[]>([]);
  const [currentLangCode, setCurrentLangCode] = useState('en-GB');

  useEffect(() => {
    // Initial Load of Languages
    const storedLangs = getLanguages();
    setLanguages(storedLangs);
    
    // Determine initial language
    const defaultLang = storedLangs.find(l => l.isDefault)?.code || 'en-GB';
    // User preference logic could go here (e.g. from session)
    const session = getSession();
    if (session?.preferredLanguage) {
       setCurrentLangCode(session.preferredLanguage);
    } else {
       setCurrentLangCode(defaultLang);
    }
  }, []);

  const refreshTranslations = () => {
     setLanguages(getLanguages());
  };

  const t = (key: TranslationKey): string => {
     const langConfig = languages.find(l => l.code === currentLangCode);
     if (langConfig && langConfig.translations && langConfig.translations[key]) {
        return langConfig.translations[key];
     }
     // Fallback to English/Default or Key itself
     return BASE_TRANSLATIONS[key] || key;
  };

  // Apply basic color theming and custom CSS
  useEffect(() => {
    const styleId = 'custom-theme-styles';
    let styleEl = document.getElementById(styleId);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    
    const pColor = systemSettings.themePrimaryColor || '#059669';
    const customCss = systemSettings.customCss || '';
    
    styleEl.innerHTML = `
      .text-emerald-600, .text-emerald-700 { color: ${pColor} !important; }
      .bg-emerald-600 { background-color: ${pColor} !important; }
      .bg-emerald-600:hover { opacity: 0.9; }
      .focus\\:ring-emerald-500:focus { --tw-ring-color: ${pColor} !important; }
      .border-emerald-100 { border-color: ${pColor}20 !important; }
      .bg-emerald-50 { background-color: ${pColor}10 !important; }
      .bg-emerald-100 { background-color: ${pColor}20 !important; }
      .text-emerald-800 { color: ${pColor} !important; filter: brightness(0.6); }
      
      /* Custom CSS Injection */
      ${customCss}
    `;
  }, [systemSettings]);

  // ... (calculateFeatureVisibility, performSync, loadData effects unchanged) ...
  const calculateFeatureVisibility = (pid: string) => {
     const allSpecies = getSpecies();
     const allIndividuals = getIndividuals();
     const org = getOrg();
     
     const projectSpecies = allSpecies.filter(s => s.projectId === pid);
     const projectInds = allIndividuals.filter(i => i.projectId === pid);

     const hasAnimalSpecies = projectSpecies.some(s => s.type === 'Animal');
     setShowBreeding((org.focus === 'Animals') || hasAnimalSpecies);

     const hasMappedPlants = projectInds.some(i => 
        i.latitude !== undefined && 
        i.longitude !== undefined && 
        allSpecies.find(s => s.id === i.speciesId)?.type === 'Plant'
     );
     setShowPlantMap(hasMappedPlants);
  };

  const performSync = async () => {
     setIsSyncing(true);
     setSyncError(null);
     try {
        const result = await fetchRemoteData();
        if (result.success && result.data) {
           const { data } = result;
           
           if (data.org) saveOrg(data.org, true);
           if (data.settings) {
              saveSystemSettings(data.settings, true);
              setSystemSettings(data.settings); 
           }
           if (data.languages) {
              saveLanguages(data.languages, true);
              setLanguages(data.languages);
           }
           if (data.projects) saveProjects(data.projects, true);
           if (data.users) saveUsers(data.users, true);
           if (data.species) saveSpecies(data.species, true);
           if (data.individuals) saveIndividuals(data.individuals, true);
           if (data.breedingEvents) saveBreedingEvents(data.breedingEvents, true);
           if (data.breedingLoans) saveBreedingLoans(data.breedingLoans, true);
           if (data.partnerships) savePartnerships(data.partnerships, true);
           if (data.partners) saveNetworkPartners(data.partners); 

           setProjects(getProjects());
           const freshOrg = getOrg();
           setCurrentOrg(freshOrg);
           
           console.log("Data Sync Complete");
        } else if (!result.success) {
           setSyncError(result.message || "Unknown sync error");
           if (result.message.includes('permission denied') || result.message.includes('relation') || result.message.includes('42P01') || result.message.includes('42501')) {
              setShowDbSetup(true);
           }
        }
     } catch (e: any) {
        console.error("Sync failed", e);
        setSyncError(e.message || "Sync Exception");
     } finally {
        setIsSyncing(false);
     }
  };

  const loadData = async (session: User) => {
    await performSync();
    setUser(session);
    if (session.preferredLanguage) {
       setCurrentLangCode(session.preferredLanguage);
    }
    
    const isSuper = session.role === UserRole.SUPER_ADMIN || (session.role as string) === 'Super Admin';
    if (isSuper) {
       setImpersonating(false);
       if (localStorage.getItem('os_impersonating')) {
          localStorage.removeItem('os_impersonating');
       }
    } else {
       setImpersonating(isImpersonating());
    }
    
    const org = getOrg();
    setCurrentOrg(org);
    const allProjects = getProjects();
    setProjects(allProjects);

    let availableProjects = allProjects.filter(p => {
        if (org.id && p.orgId && p.orgId !== org.id) return false;
        if (session.allowedProjectIds && session.allowedProjectIds.length > 0) {
           return session.allowedProjectIds.includes(p.id);
        }
        return true;
    });

    let savedPid = getCurrentProjectId();
    const isAllowed = availableProjects.some(p => p.id === savedPid);
    if (!isAllowed) {
        if (availableProjects.length > 0) savedPid = availableProjects[0].id;
        else savedPid = '';
        saveCurrentProjectId(savedPid);
    }
    
    setCurrentProjectIdState(savedPid);
    calculateFeatureVisibility(savedPid);
    setUnreadCount(getNotifications().filter(n => n.recipientId === session.id && !n.isRead).length);
    setIsLoading(false);
  };

  useEffect(() => {
    const session = getSession();
    if (session) loadData(session);
    else setIsLoading(false);
  }, []); 
  
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      const notifs = getNotifications();
      const myNotifs = notifs.filter(n => n.recipientId === user.id && !n.isRead);
      setUnreadCount(myNotifs.length);
      
      const settings = getSystemSettings();
      if (settings.themePrimaryColor !== systemSettings.themePrimaryColor || 
          settings.appLogoUrl !== systemSettings.appLogoUrl || 
          settings.customCss !== systemSettings.customCss) {
        setSystemSettings(settings);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [user, systemSettings]);

  const handleLogin = (u: User) => {
    loadData(u);
  };

  const handleLogout = () => {
    logout();
    setUser(null);
    setImpersonating(false);
  };
  
  const handleCreateOwnOrg = () => {
     setInitialLandingView('register');
     handleLogout();
  };

  const handleExitView = () => {
    restoreMainOrg();
    setImpersonating(false);
    setCurrentOrg(getOrg());
    window.location.reload(); 
  };
  
  const handleProjectChange = (id: string) => {
    setCurrentProjectIdState(id);
    saveCurrentProjectId(id);
    calculateFeatureVisibility(id);
  };

  const handleCreateProject = () => {
    if (!newProjectName) return;
    const newProject: Project = {
      id: `p-${Date.now()}`,
      name: newProjectName,
      description: newProjectDesc || '',
      orgId: currentOrg?.id 
    };
    const updated = [...projects, newProject];
    setProjects(updated);
    saveProjects(updated);
    setCurrentProjectIdState(newProject.id);
    saveCurrentProjectId(newProject.id);
    calculateFeatureVisibility(newProject.id);
    setShowAddProjectModal(false);
    setNewProjectName('');
    setNewProjectDesc('');
  };

  const handleManualSync = async () => {
     await performSync();
  };

  // --- Profile Logic ---
  const openProfileModal = () => {
     if (!user) return;
     setProfileForm({
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl || '',
        newPassword: '',
        confirmPassword: ''
     });
     setPendingEmail('');
     setIsVerifyingEmail(false);
     setVerifyCode('');
     setShowProfileModal(true);
  };

  const initiateEmailVerification = () => {
     if (!pendingEmail || !pendingEmail.includes('@')) return;
     const code = Math.floor(100000 + Math.random() * 900000).toString();
     setGeneratedCode(code);
     sendMfaCode(pendingEmail, code);
     setIsVerifyingEmail(true);
  };

  const verifyEmailCode = () => {
     if (verifyCode === generatedCode) {
        setProfileForm({ ...profileForm, email: pendingEmail });
        setIsVerifyingEmail(false);
        setPendingEmail('');
        alert("Email verified and updated in form. Click Save to persist changes.");
     } else {
        alert("Invalid code.");
     }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!user) return;
     if (profileForm.newPassword && profileForm.newPassword !== profileForm.confirmPassword) {
        alert("Passwords do not match.");
        return;
     }

     const allUsers = getUsers();
     let updatedUser = { ...user };
     
     // Update fields
     updatedUser.name = profileForm.name;
     updatedUser.email = profileForm.email;
     updatedUser.avatarUrl = profileForm.avatarUrl;
     
     // Update Password if set
     if (profileForm.newPassword) {
        updatedUser.password = await hashPassword(profileForm.newPassword);
     }

     // Save to list
     const updatedList = allUsers.map(u => u.id === user.id ? updatedUser : u);
     saveUsers(updatedList); // local
     saveSession(updatedUser); // session
     setUser(updatedUser); // state
     
     // Sync
     syncPushUsers([updatedUser]);
     
     setShowProfileModal(false);
     alert("Profile updated successfully.");
  };

  if (isLoading) return null;

  if (!user) {
    return (
      <LanguageContext.Provider value={{ 
        language: currentLangCode, 
        setLanguage: setCurrentLangCode, 
        t, 
        refreshTranslations, 
        availableLanguages: languages 
      }}>
        <Landing onLogin={handleLogin} initialView={initialLandingView} />
      </LanguageContext.Provider>
    );
  }

  // Filter Projects for Dropdown
  const visibleProjects = projects.filter(p => {
      if (currentOrg && p.orgId && p.orgId !== currentOrg.id) return false;
      if (user.allowedProjectIds && user.allowedProjectIds.length > 0) {
         return user.allowedProjectIds.includes(p.id);
      }
      return true;
  });
     
  const isDemoOrg = currentOrg?.id === 'org-1';
  const isSuperAdmin = user.role === UserRole.SUPER_ADMIN || (user.role as string) === 'Super Admin';
  const showDemoBanner = isDemoOrg && !isSuperAdmin;

  return (
    <LanguageContext.Provider value={{ 
      language: currentLangCode, 
      setLanguage: setCurrentLangCode, 
      t, 
      refreshTranslations, 
      availableLanguages: languages 
    }}>
      <HashRouter>
        <div className="min-h-screen bg-slate-50 flex">
          <Sidebar 
            isOpen={sidebarOpen} 
            onClose={() => setSidebarOpen(false)} 
            user={user} 
            onLogout={handleLogout} 
            showBreeding={showBreeding}
            showPlantMap={showPlantMap}
            logoUrl={systemSettings.appLogoUrl} 
            projects={visibleProjects}
            currentProjectId={currentProjectId}
            onChangeProject={handleProjectChange}
            onAddProject={() => setShowAddProjectModal(true)}
            onEditProfile={openProfileModal}
          />
          
          <main className="flex-1 lg:ml-64 flex flex-col min-h-screen relative">
            {impersonating && (
              <div className="bg-purple-600 text-white p-3 px-6 flex justify-between items-center sticky top-0 z-20 shadow-md">
                <div className="flex items-center gap-2">
                  <EyeOff size={20} />
                  <span className="font-medium">Viewing Organization: <strong>{currentOrg?.name}</strong></span>
                </div>
                <button 
                  onClick={handleExitView}
                  className="bg-white text-purple-700 px-4 py-1 rounded-full text-sm font-bold hover:bg-purple-50 transition-colors"
                >
                  Exit View
                </button>
              </div>
            )}

            {showDemoBanner && (
               <div className="bg-indigo-600 text-white p-3 px-6 flex flex-col sm:flex-row justify-between items-center sticky top-0 z-20 shadow-md gap-3">
                  <div className="flex items-center gap-2 text-sm">
                     <Info size={20} className="shrink-0" />
                     <span>You are exploring the <strong>Demo Organization</strong>. Features are read-only.</span>
                  </div>
                  <button 
                     onClick={handleCreateOwnOrg}
                     className="bg-white text-indigo-700 hover:bg-indigo-50 px-4 py-1.5 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center gap-2 whitespace-nowrap"
                  >
                     <Plus size={16} /> Create Your Own Organization
                  </button>
               </div>
            )}

            <header className="bg-white border-b border-slate-200 p-4 flex items-center justify-between sticky top-0 z-10">
              {/* Mobile Header Branding */}
              <div className="lg:hidden flex items-center space-x-2 text-emerald-700 font-bold">
                 {systemSettings.appLogoUrl ? (
                    <img src={systemSettings.appLogoUrl} alt="Logo" className="h-8 w-auto object-contain" />
                  ) : (
                    <PawPrint size={24} />
                  )}
                <span>OpenStudbook</span>
              </div>

              {/* Desktop Header Spacer */}
              <div className="hidden lg:block"></div>

              <div className="flex items-center gap-4">
                 {/* Notifications Bell */}
                 <Link to="/notifications" className="relative text-slate-500 hover:text-emerald-600 transition-colors p-2 hover:bg-slate-50 rounded-full">
                    <Bell size={20} />
                    {unreadCount > 0 && (
                       <span className="absolute top-1.5 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
                    )}
                 </Link>

                 {/* Sync Status */}
                 <div className="hidden sm:flex items-center gap-2">
                    {syncError && (
                       <div 
                         onClick={() => setShowDbSetup(true)}
                         className="flex items-center gap-2 bg-red-50 text-red-700 px-3 py-1 rounded-full text-xs border border-red-200 animate-pulse cursor-pointer hover:bg-red-100" 
                         title={syncError}
                       >
                          <AlertCircle size={12} />
                          <span>Sync Error</span>
                       </div>
                    )}
                    <button 
                       onClick={handleManualSync} 
                       className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full transition-colors ${isSyncing ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400 hover:text-slate-600'}`}
                       title="Sync Status"
                    >
                       <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
                       {isSyncing ? 'Syncing...' : 'Synced'}
                    </button>
                 </div>

                 {/* Mobile Menu Toggle */}
                 <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-slate-600 p-1">
                   <Menu size={24} />
                 </button>
              </div>
            </header>

            <div className="flex-1 p-4 lg:p-8 overflow-y-auto">
              <Routes>
                <Route path="/" element={<Dashboard currentProjectId={currentProjectId} />} />
                <Route path="/network" element={<Network />} />
                <Route path="/species" element={<SpeciesManager currentProjectId={currentProjectId} />} />
                <Route path="/individuals" element={<IndividualManager currentProjectId={currentProjectId} />} />
                <Route path="/individuals/:id" element={<IndividualDetail />} />
                {showPlantMap && (
                   <Route path="/plant-map" element={<PlantMap currentProjectId={currentProjectId} />} />
                )}
                {showBreeding && (
                  <Route path="/breeding" element={<BreedingManager currentProjectId={currentProjectId} />} />
                )}
                <Route path="/settings" element={<OrgSettings />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/super-admin" element={isSuperAdmin ? <SuperAdminPage /> : <Navigate to="/" replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </main>
        </div>

        {/* ... Modals (AddProject, DBSetup, Profile) ... */}
        {showAddProjectModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
             <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Briefcase size={20}/> New Project</h3>
                <div className="space-y-4">
                   <div>
                      <label className="text-sm font-medium text-slate-700">Project Name</label>
                      <input 
                        placeholder="e.g. Highland Conservation"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 mt-1"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        autoFocus
                      />
                   </div>
                   <div>
                      <label className="text-sm font-medium text-slate-700">Description (Optional)</label>
                      <textarea 
                        placeholder="Brief description of this project..."
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 mt-1"
                        value={newProjectDesc}
                        onChange={(e) => setNewProjectDesc(e.target.value)}
                        rows={3}
                      />
                   </div>
                   <div className="flex justify-end gap-2 pt-2">
                      <button onClick={() => setShowAddProjectModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
                      <button onClick={handleCreateProject} disabled={!newProjectName} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium disabled:opacity-50">Create Project</button>
                   </div>
                </div>
             </div>
          </div>
        )}

        {showProfileModal && user && (
           <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 animate-in zoom-in duration-200">
                 <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                       <UserIcon size={20} className="text-emerald-600"/> Edit Profile
                    </h3>
                    <button onClick={() => setShowProfileModal(false)} className="text-slate-400 hover:text-slate-600"><X size={24}/></button>
                 </div>
                 
                 <form onSubmit={handleSaveProfile} className="space-y-4">
                    <div className="flex flex-col items-center mb-4">
                       <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden mb-2 relative group">
                          {profileForm.avatarUrl ? (
                             <img src={profileForm.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                          ) : (
                             <UserIcon size={32} className="text-slate-400" />
                          )}
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                             <Camera size={20} className="text-white"/>
                          </div>
                       </div>
                       <input 
                          className="text-xs text-center border border-slate-200 rounded px-2 py-1 w-full bg-white text-slate-900"
                          placeholder="Avatar URL"
                          value={profileForm.avatarUrl}
                          onChange={e => setProfileForm({...profileForm, avatarUrl: e.target.value})}
                       />
                    </div>

                    <div>
                       <label className="text-sm font-medium text-slate-700">Full Name</label>
                       <input 
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900 mt-1"
                          value={profileForm.name}
                          onChange={e => setProfileForm({...profileForm, name: e.target.value})}
                          required
                       />
                    </div>

                    <div>
                       <label className="text-sm font-medium text-slate-700">Email Address</label>
                       <div className="mt-1 space-y-2">
                          <input 
                             className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none bg-slate-100 text-slate-500"
                             value={profileForm.email}
                             readOnly
                             title="To change email, use the verification flow below."
                          />
                          {!isVerifyingEmail ? (
                             <div className="flex gap-2">
                                <input 
                                   className="flex-1 px-3 py-1.5 border border-slate-300 rounded text-sm outline-none focus:ring-1 focus:ring-emerald-500 bg-white text-slate-900"
                                   placeholder="New Email Address"
                                   value={pendingEmail}
                                   onChange={e => setPendingEmail(e.target.value)}
                                />
                                <button 
                                   type="button" 
                                   onClick={initiateEmailVerification}
                                   disabled={!pendingEmail || !pendingEmail.includes('@')}
                                   className="bg-slate-800 text-white px-3 py-1.5 rounded text-sm hover:bg-slate-700 disabled:opacity-50"
                                >
                                   Verify
                                </button>
                             </div>
                          ) : (
                             <div className="bg-emerald-50 p-3 rounded border border-emerald-100">
                                <p className="text-xs text-emerald-800 mb-2 font-medium">Enter code sent to {pendingEmail}:</p>
                                <div className="flex gap-2">
                                   <input 
                                      className="w-24 px-2 py-1 border border-emerald-300 rounded text-center tracking-widest font-mono bg-white text-slate-900"
                                      placeholder="000000"
                                      value={verifyCode}
                                      onChange={e => setVerifyCode(e.target.value)}
                                   />
                                   <button 
                                      type="button" 
                                      onClick={verifyEmailCode}
                                      className="text-xs bg-emerald-600 text-white px-3 py-1 rounded font-bold hover:bg-emerald-700"
                                   >
                                      Confirm
                                   </button>
                                   <button 
                                      type="button" 
                                      onClick={() => setIsVerifyingEmail(false)}
                                      className="text-xs text-slate-500 hover:text-slate-700"
                                   >
                                      Cancel
                                   </button>
                                </div>
                             </div>
                          )}
                       </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 mt-2">
                       <label className="text-sm font-bold text-slate-700 flex items-center gap-1 mb-2">
                          <Lock size={14}/> Change Password
                       </label>
                       <div className="grid grid-cols-2 gap-3">
                          <input 
                             type="password"
                             className="px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                             placeholder="New Password"
                             value={profileForm.newPassword}
                             onChange={e => setProfileForm({...profileForm, newPassword: e.target.value})}
                          />
                          <input 
                             type="password"
                             className="px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                             placeholder="Confirm"
                             value={profileForm.confirmPassword}
                             onChange={e => setProfileForm({...profileForm, confirmPassword: e.target.value})}
                          />
                       </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                       <button type="button" onClick={() => setShowProfileModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                       <button type="submit" className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-emerald-700 shadow-sm flex items-center gap-2">
                          <Save size={18}/> Save Changes
                       </button>
                    </div>
                 </form>
              </div>
           </div>
        )}

        {showDbSetup && (
           <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
                 <div className="p-6 border-b border-red-100 bg-red-50 flex justify-between items-center rounded-t-xl">
                    <div className="flex items-center gap-3 text-red-800">
                       <Database size={24} />
                       <h3 className="text-xl font-bold">Database Setup Required</h3>
                    </div>
                    <button onClick={() => setShowDbSetup(false)} className="text-red-600 hover:text-red-800 bg-white/50 p-1 rounded-full"><X size={24}/></button>
                 </div>
                 
                 <div className="p-6 overflow-y-auto space-y-4">
                    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                       <p className="text-sm text-yellow-800 font-bold">
                          Sync Error: {syncError || "Tables missing or permission denied."}
                       </p>
                       <p className="text-xs text-yellow-700 mt-1">
                          This usually means the Supabase database hasn't been initialized or the permissions (RLS Policies) are blocking access.
                       </p>
                    </div>

                    <h4 className="font-bold text-slate-900">How to Fix:</h4>
                    <ol className="list-decimal list-inside text-sm text-slate-700 space-y-2">
                       <li>Go to your <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="text-blue-600 underline">Supabase Dashboard</a>.</li>
                       <li>Open the <strong>SQL Editor</strong> from the sidebar.</li>
                       <li>Click <strong>New Query</strong>.</li>
                       <li>Copy the code below and paste it into the editor.</li>
                       <li>Click <strong>Run</strong>.</li>
                    </ol>

                    <div className="relative">
                       <textarea 
                          readOnly 
                          className="w-full h-64 p-4 bg-slate-900 text-green-400 font-mono text-xs rounded-lg border border-slate-700 focus:outline-none"
                          value={SUPABASE_SCHEMA_SQL}
                       />
                       <button 
                          onClick={() => navigator.clipboard.writeText(SUPABASE_SCHEMA_SQL)}
                          className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg backdrop-blur transition-colors"
                          title="Copy to Clipboard"
                       >
                          <Copy size={16} />
                       </button>
                    </div>
                 </div>
                 
                 <div className="p-4 border-t border-slate-100 flex justify-end bg-slate-50 rounded-b-xl">
                    <button 
                       onClick={() => { setShowDbSetup(false); handleManualSync(); }}
                       className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 shadow-sm flex items-center gap-2"
                    >
                       <RefreshCw size={18} /> Retry Sync
                    </button>
                 </div>
              </div>
           </div>
        )}
      </HashRouter>
    </LanguageContext.Provider>
  );
};

export default App;
