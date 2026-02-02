
import React, { Component, ReactNode, useState, useEffect, createContext, useContext, useRef, ErrorInfo } from 'react';
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
  Loader2,
  Check,
  Server,
  Box,
  Layers,
  Eye
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
import EnclosureManager from './pages/EnclosureManager';
import SetupWizard from './components/SetupWizard';
import { getSession, logout, isImpersonating, restoreMainOrg, getOrg, getSpecies, getNotifications, getSystemSettings, getProjects, getCurrentProjectId, saveProjects, saveCurrentProjectId, getIndividuals, saveOrg, saveUsers, saveSpecies, saveIndividuals, saveBreedingEvents, saveBreedingLoans, savePartnerships, saveSystemSettings, saveNetworkPartners, getUsers, getLanguages, saveLanguages, saveSession, sendMfaCode, syncPushOrg, syncPushUsers, syncPushProjects, syncPushSpecies, syncPushIndividuals, syncPushBreedingEvents, syncPushBreedingLoans, syncPushPartnerships, syncPushLanguages, syncPushSettings, syncPushEnclosures, getBreedingEvents, getBreedingLoans, getPartnerships, getNetworkPartners, initHighCapacityStorage, saveEnclosures, getEnclosures } from './services/storage';
import { fetchRemoteData, fetchPublicConfig } from './services/syncService';
import { User, UserRole, Organization, SystemSettings, Project, LanguageConfig } from './types';
import { TranslationKey, BASE_TRANSLATIONS } from './services/i18n';

// --- Components ---

interface ErrorBoundaryProps {
  children?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

/**
 * Fix: Use direct Component inheritance for ErrorBoundary to ensure props and state are correctly typed and accessible in render().
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // Explicitly declared props and state to fix "Property 'props' does not exist on type 'ErrorBoundary'" error.
  public props: ErrorBoundaryProps;
  public state: ErrorBoundaryState = { hasError: false };

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState { 
    return { hasError: true, error }; 
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) { 
    console.error("ErrorBoundary caught an error", error, errorInfo); 
  }

  render(): ReactNode {
    const { hasError, error } = this.state;
    const { children } = this.props;

    if (hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-slate-50 rounded-xl m-4 border border-slate-200">
          <AlertCircle size={48} className="text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">Something went wrong.</h2>
          <p className="text-slate-600 mb-6 max-w-md">We couldn't load this section. This might be due to a temporary glitch or missing data.</p>
          {error && <div className="mb-6 p-3 bg-red-50 text-red-700 text-xs font-mono rounded text-left w-full max-w-md overflow-auto">{error.toString()}</div>}
          <button onClick={() => window.location.reload()} className="bg-emerald-600 text-white px-6 py-2 rounded-lg hover:bg-emerald-700 font-medium transition-colors shadow-sm flex items-center gap-2"><RefreshCw size={18} /> Reload Application</button>
        </div>
      );
    }
    return children;
  }
}

const Toast = ({ message, type, onClose }: { message: string, type: 'success' | 'error', onClose: () => void }) => {
  useEffect(() => { const timer = setTimeout(onClose, 3000); return () => clearTimeout(timer); }, [onClose]);
  return (
    <div className={`fixed bottom-6 right-6 z-[9999] px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5 duration-300 ${type === 'success' ? 'bg-slate-900 text-white' : 'bg-red-600 text-white'}`}>
      {type === 'success' ? <CheckCircle2 size={24} className="text-emerald-400" /> : <AlertCircle size={24} className="text-white" />}
      <div><p className="font-bold text-sm">{type === 'success' ? 'Success' : 'Error'}</p><p className="text-sm opacity-90">{message}</p></div>
      <button onClick={onClose} className="ml-4 p-1 hover:bg-white/20 rounded-full transition-colors"><X size={16} /></button>
    </div>
  );
};

interface LanguageContextType {
  language: string;
  setLanguage: (lang: string) => void;
  t: (key: TranslationKey) => string;
  refreshTranslations: () => void;
  availableLanguages: LanguageConfig[];
}

export const LanguageContext = createContext<LanguageContextType>({
  language: 'en-GB', setLanguage: () => {}, t: (key) => key, refreshTranslations: () => {}, availableLanguages: []
});

const NavItem = ({ to, icon: Icon, label, active, badge }: { to: string, icon: any, label: string, active: boolean, badge?: number }) => (
  <Link to={to} className={`flex items-center justify-between px-4 py-3 rounded-lg transition-colors ${active ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}>
    <div className="flex items-center space-x-3"><Icon size={20} /><span className="font-medium">{label}</span></div>
    {badge ? <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{badge}</span> : null}
  </Link>
);

const Sidebar = ({ isOpen, onClose, user, onLogout, showBreeding, showPlantMap, showEnclosures, logoUrl, projects, currentProjectId, onChangeProject, onAddProject, onEditProfile }: { isOpen: boolean, onClose: () => void, user: User, onLogout: () => void, showBreeding: boolean, showPlantMap: boolean, showEnclosures: boolean, logoUrl?: string, projects: Project[], currentProjectId: string, onChangeProject: (id: string) => void, onAddProject: () => void, onEditProfile: () => void }) => {
  const location = useLocation();
  const path = location.pathname;
  const { t, language, setLanguage, availableLanguages } = useContext(LanguageContext);
  const org = getOrg();
  // Fix: Changed 'Plants' to 'Flora' to match OrganizationFocus type
  const enclosureLabel = org.focus === 'Flora' ? 'Areas' : 'Enclosures';
  
  const isSuper = user.role === UserRole.SUPER_ADMIN || (user.role as string) === 'Super Admin';
  const isAdmin = user.role === UserRole.ADMIN || isSuper;
  const hasGlobalAccess = isAdmin || !user.allowedProjectIds || user.allowedProjectIds.length === 0;

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={onClose} />}
      <aside className={`fixed top-0 left-0 h-full w-64 bg-white border-r border-slate-200 z-30 transform transition-transform duration-300 lg:translate-x-0 flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 flex flex-col gap-4 flex-shrink-0">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2 text-emerald-700">{logoUrl ? <img src={logoUrl} alt="Logo" className="h-8 w-auto object-contain" /> : <PawPrint size={32} />}<h1 className="text-xl font-bold tracking-tight">OpenStudbook</h1></div>
            <button onClick={onClose} className="lg:hidden text-slate-500"><X size={24} /></button>
          </div>
          <div className="relative">
             <div className="flex items-center gap-2 mb-1 text-xs font-semibold text-slate-400 uppercase tracking-wider"><FolderOpen size={12} /> Current Project</div>
             <select 
               value={currentProjectId} 
               onChange={(e) => e.target.value === 'NEW' ? onAddProject() : onChangeProject(e.target.value)} 
               className="w-full p-2 pl-3 border border-slate-300 rounded-lg text-sm bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium disabled:opacity-50"
               disabled={!isAdmin && projects.length <= 1}
             >
               {hasGlobalAccess && projects.length > 1 && (
                 <option value="ALL_PROJECTS">🌐 All Projects</option>
               )}
               {projects.length > 0 ? (
                 projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)
               ) : (
                 <option value="">No Projects Found</option>
               )}
               {isAdmin && (
                 <>
                   <option disabled>──────────</option>
                   <option value="NEW">+ Create New Project</option>
                 </>
               )}
             </select>
          </div>
        </div>
        <nav className="px-4 space-y-2 mt-1 flex-1 overflow-y-auto">
          <NavItem to="/" icon={LayoutDashboard} label={t('dashboard')} active={path === '/'} />
          <NavItem to="/species" icon={Dna} label={t('species')} active={path.startsWith('/species')} />
          <NavItem to="/individuals" icon={PawPrint} label={t('individuals')} active={path.startsWith('/individuals')} />
          {showEnclosures && <NavItem to="/enclosures" icon={Box} label={enclosureLabel} active={path.startsWith('/enclosures')} />}
          {showPlantMap && <NavItem to="/plant-map" icon={Map} label={t('plantMap')} active={path === '/plant-map'} />}
          {showBreeding && <NavItem to="/breeding" icon={HeartHandshake} label={t('breeding')} active={path.startsWith('/breeding')} />}
          
          <div className="pt-4 mt-4 border-t border-slate-100 space-y-1">
             <NavItem to="/network" icon={Globe2} label={t('networkMap')} active={path === '/network'} />
             {isAdmin && <NavItem to="/settings" icon={Settings} label={t('orgSettings')} active={path === '/settings'} />}
             {isSuper && <NavItem to="/super-admin" icon={Shield} label={t('superAdmin')} active={path === '/super-admin'} />}
          </div>
        </nav>
        <div className="p-6 border-t border-slate-100 bg-slate-50 flex-shrink-0">
          <div className="mb-4">
             <div className="flex items-center gap-2 mb-1 text-xs font-semibold text-slate-400 uppercase tracking-wider"><Globe size={12} /> Language</div>
             <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500">
               {availableLanguages.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
             </select>
          </div>
          <div className="flex items-center justify-between mb-4 bg-white p-2 rounded-lg border border-slate-200">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full bg-emerald-200 flex items-center justify-center text-emerald-700 font-bold overflow-hidden">{user.avatarUrl ? <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover"/> : user.name.charAt(0)}</div>
              <div className="overflow-hidden"><p className="text-sm font-semibold text-slate-900 truncate max-w-[80px]">{user.name}</p><p className="text-[10px] text-slate-500 truncate">{user.role}</p></div>
            </div>
            <button onClick={onEditProfile} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-emerald-600 transition-colors" title="Edit Profile"><Settings size={14} /></button>
          </div>
          <button onClick={onLogout} className="w-full flex items-center justify-center space-x-2 text-slate-500 hover:text-red-600 text-sm font-medium transition-colors"><LogOut size={16} /><span>{t('signOut')}</span></button>
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
  const [showBackendSetup, setShowBackendSetup] = useState(false);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [initialLandingView, setInitialLandingView] = useState<ViewMode>('landing');
  const [projects, setProjects] = useState<Project[]>(getProjects());
  const [currentProjectId, setCurrentProjectIdState] = useState<string>(getCurrentProjectId());
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [showBreeding, setShowBreeding] = useState(true);
  const [showPlantMap, setShowPlantMap] = useState(false);
  const [showEnclosures, setShowEnclosures] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', email: '', avatarUrl: '', newPassword: '', confirmPassword: '' });
  const [languages, setLanguages] = useState<LanguageConfig[]>([]);
  const [currentLangCode, setCurrentLangCode] = useState('en-GB');
  const [showSetupWizard, setShowSetupWizard] = useState(false);

  const handleProjectChange = (id: string) => { 
    setCurrentProjectIdState(id); 
    saveCurrentProjectId(id); 
    calculateFeatureVisibility(id); 
  };

  useEffect(() => {
    const initializeApp = async () => {
       await initHighCapacityStorage();
       const storedLangs = getLanguages();
       setLanguages(storedLangs);
       const session = getSession();
       const token = localStorage.getItem('os_token');

       if (session?.preferredLanguage) setCurrentLangCode(session.preferredLanguage);
       else setCurrentLangCode(storedLangs.find(l => l.isDefault)?.code || 'en-GB');
       
       try {
          const res = await fetchPublicConfig();
          if (res.success) {
             if (res.settings) {
                const currentLocal = getSystemSettings();
                const merged = { ...currentLocal, ...res.settings, landingPageConfig: { ...currentLocal.landingPageConfig, ...(res.settings.landingPageConfig || {}) } };
                saveSystemSettings(merged, true); 
                setSystemSettings(merged);
             }
             if (res.languages && res.languages.length > 0) { saveLanguages(res.languages, true); setLanguages(res.languages); }
          }
       } catch (e) { console.warn("Public config failed."); }
       
       if (session && token) {
          try { await loadData(session); } catch (e) { logout(); setUser(null); }
       }
       setIsLoading(false);
    };
    initializeApp();
  }, []);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => setToast({ message, type });
  const refreshTranslations = () => setLanguages(getLanguages());
  const t = (key: TranslationKey): string => languages.find(l => l.code === currentLangCode)?.translations[key] || BASE_TRANSLATIONS[key] || key;

  useEffect(() => {
    const styleId = 'custom-theme-styles';
    let styleEl = document.getElementById(styleId) || document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
    const pColor = systemSettings.themePrimaryColor || '#059669';
    styleEl.innerHTML = `
      .text-emerald-600, .text-emerald-700 { color: ${pColor} !important; }
      .bg-emerald-600 { background-color: ${pColor} !important; }
      .bg-emerald-600:hover { opacity: 0.9; }
      .focus\\:ring-emerald-500:focus { --tw-ring-color: ${pColor} !important; }
      .border-emerald-100 { border-color: ${pColor}20 !important; }
      .bg-emerald-50 { background-color: ${pColor}10 !important; }
      .bg-emerald-100 { background-color: ${pColor}20 !important; }
      .text-emerald-800 { color: ${pColor} !important; filter: brightness(0.6); }
      ${systemSettings.customCss || ''}
    `;
  }, [systemSettings]);

  const calculateFeatureVisibility = (pid: string) => {
     if (!pid) return;
     const org = getOrg();
     const allSpecies = getSpecies();
     const allInds = getIndividuals();
     const projectSpecies = pid === 'ALL_PROJECTS' ? allSpecies : allSpecies.filter(s => s.projectId === pid);
     // Fix: Changed 'Animals' to 'Fauna' to match OrganizationFocus type
     setShowBreeding(org.focus === 'Fauna' || projectSpecies.some(s => s.type === 'Animal'));
     setShowEnclosures(!!org.enableEnclosures);
     const hasMappedPlants = allInds.some(i => (pid === 'ALL_PROJECTS' || i.projectId === pid) && i.latitude !== undefined && allSpecies.find(s => s.id === i.speciesId)?.type === 'Plant');
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
           if (data.partners) saveNetworkPartners(data.partners);
           if (data.settings) { 
              const merged = { ...getSystemSettings(), ...data.settings };
              saveSystemSettings(merged, true); 
              setSystemSettings(merged); 
           }
           if (data.languages) { saveLanguages(data.languages, true); setLanguages(data.languages); }
           if (data.projects) saveProjects(data.projects, true);
           if (data.users) saveUsers(data.users, true);
           if (data.species) saveSpecies(data.species, true);
           if (data.individuals) saveIndividuals(data.individuals, true);
           if (data.enclosures) saveEnclosures(data.enclosures, true);

           const activeOrg = getOrg();
           setCurrentOrg(activeOrg);
           const pjs = getProjects().filter(p => (p.orgId || (p as any).org_id) === activeOrg.id);
           setProjects(pjs);
           if (pjs.length > 0) {
              const currentId = getCurrentProjectId();
              // If only one project exists, force user away from 'ALL_PROJECTS' if they were there
              if (pjs.length === 1 && (currentId === 'ALL_PROJECTS' || !currentId)) {
                 handleProjectChange(pjs[0].id);
              } else {
                 calculateFeatureVisibility(currentId || pjs[0].id);
              }
           }
           
           const session = getSession();
           if (session && session.role === UserRole.ADMIN && (!data.species || data.species.length === 0)) {
              setShowSetupWizard(true);
           }
        }
     } catch (e: any) { setSyncError(e.message); } finally { setIsSyncing(false); }
  };

  const loadData = async (session: User) => {
    await performSync();
    setUser(session);
    if (session.preferredLanguage) setCurrentLangCode(session.preferredLanguage);
    const isImpersonatingSession = isImpersonating();
    setImpersonating(isImpersonatingSession);
    
    let activeOrg = getOrg();
    setCurrentOrg(activeOrg);
    
    const allProjects = getProjects();
    let availableProjects = allProjects.filter(p => (p.orgId || (p as any).org_id) === activeOrg.id);
    if (session.allowedProjectIds && session.allowedProjectIds.length > 0) {
       availableProjects = availableProjects.filter(p => session.allowedProjectIds!.includes(p.id));
    }

    let savedPid = getCurrentProjectId();
    if (savedPid !== 'ALL_PROJECTS' && !availableProjects.some(p => p.id === savedPid)) {
        savedPid = availableProjects.length > 0 ? availableProjects[0].id : '';
        saveCurrentProjectId(savedPid);
    }
    
    // Safety check for single-project Orgs
    if (availableProjects.length === 1 && (savedPid === 'ALL_PROJECTS' || !savedPid)) {
       savedPid = availableProjects[0].id;
       saveCurrentProjectId(savedPid);
    }

    setProjects(availableProjects);
    setCurrentProjectIdState(savedPid);
    calculateFeatureVisibility(savedPid);
    setUnreadCount(getNotifications().filter(n => n.recipientId === session.id && !n.isRead).length);
  };

  const handleLogin = (u: User) => loadData(u);
  const handleLogout = () => { logout(); setUser(null); setImpersonating(false); };

  const handleCreateProject = () => {
    if (!newProjectName) return;
    const orgId = currentOrg?.id || getOrg().id;
    const newProject: Project = { id: `p-${Date.now()}`, name: newProjectName, description: newProjectDesc || '', orgId: orgId };
    const allProjects = [...getProjects(), newProject];
    saveProjects(allProjects);
    setProjects(allProjects.filter(p => (p.orgId || (p as any).org_id) === orgId));
    handleProjectChange(newProject.id);
    setShowAddProjectModal(false);
    setNewProjectName(''); setNewProjectDesc('');
    showToast("Project created successfully!", "success");
  };

  const openProfileModal = () => {
     if (!user) return;
     setProfileForm({ name: user.name, email: user.email, avatarUrl: user.avatarUrl || '', newPassword: '', confirmPassword: '' });
     setShowProfileModal(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!user) return;
     if (profileForm.newPassword && profileForm.newPassword !== profileForm.confirmPassword) { showToast("Passwords do not match.", "error"); return; }
     let updatedUser = { ...user, name: profileForm.name, email: profileForm.email, avatarUrl: profileForm.avatarUrl };
     if (profileForm.newPassword) updatedUser.password = profileForm.newPassword;
     saveUsers(getUsers().map(u => u.id === user.id ? updatedUser : u));
     saveSession(updatedUser); setUser(updatedUser);
     setShowProfileModal(false); showToast("Profile updated successfully.", "success");
  };

  if (isLoading) return null;
  
  if (!user) return (
    <LanguageContext.Provider value={{ language: currentLangCode, setLanguage: setCurrentLangCode, t, refreshTranslations, availableLanguages: languages }}>
       <Landing onLogin={handleLogin} initialView={initialLandingView} />
    </LanguageContext.Provider>
  );

  const isSuper = user.role === UserRole.SUPER_ADMIN || (user.role as string) === 'Super Admin';
  const isAdmin = user.role === UserRole.ADMIN || isSuper;

  return (
    <LanguageContext.Provider value={{ language: currentLangCode, setLanguage: setCurrentLangCode, t, refreshTranslations, availableLanguages: languages }}>
      <HashRouter>
        <div className="min-h-screen bg-slate-50 flex">
          <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} showBreeding={showBreeding} showPlantMap={showPlantMap} showEnclosures={showEnclosures} logoUrl={systemSettings.appLogoUrl} projects={projects} currentProjectId={currentProjectId} onChangeProject={handleProjectChange} onAddProject={() => setShowAddProjectModal(true)} onEditProfile={openProfileModal} />
          <main className="flex-1 lg:ml-64 flex flex-col min-h-screen relative">
            <header className="bg-white border-b border-slate-200 p-4 flex items-center justify-between sticky top-0 z-10">
              <div className="lg:hidden flex items-center space-x-2 text-emerald-700 font-bold">{systemSettings.appLogoUrl ? <img src={systemSettings.appLogoUrl} alt="Logo" className="h-8 w-auto object-contain" /> : <PawPrint size={24} />}<span>OpenStudbook</span></div>
              <div className="hidden lg:block"></div>
              <div className="flex items-center gap-4">
                 <Link to="/notifications" className="relative text-slate-500 hover:text-emerald-600 transition-colors p-2 hover:bg-slate-50 rounded-full"><Bell size={20} />{unreadCount > 0 && <span className="absolute top-1.5 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>}</Link>
                 <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-slate-600 p-1"><Menu size={24} /></button>
              </div>
            </header>
            <div className="flex-1 p-4 lg:p-8 overflow-y-auto">
              <ErrorBoundary>
                <Routes>
                  <Route path="/" element={<Dashboard currentProjectId={currentProjectId} />} />
                  <Route path="/network" element={<Network />} />
                  <Route path="/species" element={<SpeciesManager currentProjectId={currentProjectId} />} />
                  <Route path="/individuals" element={<IndividualManager currentProjectId={currentProjectId} />} />
                  <Route path="/individuals/:id" element={<IndividualDetail />} />
                  <Route path="/enclosures" element={<EnclosureManager currentProjectId={currentProjectId} />} />
                  {showPlantMap && <Route path="/plant-map" element={<PlantMap currentProjectId={currentProjectId} />} />}
                  {showBreeding && <Route path="/breeding" element={<BreedingManager currentProjectId={currentProjectId} />} />}
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/settings" element={isAdmin ? <OrgSettings /> : <Navigate to="/" replace />} />
                  <Route path="/super-admin" element={isSuper ? <SuperAdminPage /> : <Navigate to="/" replace />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </ErrorBoundary>
            </div>
          </main>
        </div>
        {showSetupWizard && <SetupWizard onClose={() => setShowSetupWizard(false)} />}
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        {showAddProjectModal && isAdmin && <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"><div className="bg-white rounded-xl shadow-xl max-sm w-full p-6"><h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Briefcase size={20}/> New Project</h3><div className="space-y-4"><div><label className="text-sm font-medium text-slate-700">Project Name</label><input placeholder="e.g. Highland Conservation" className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 mt-1" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} autoFocus /></div><div><label className="text-sm font-medium text-slate-700">Description (Optional)</label><textarea placeholder="Brief description..." className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 mt-1" value={newProjectDesc} onChange={(e) => setNewProjectDesc(e.target.value)} rows={3} /></div><div className="flex justify-end gap-2 pt-2"><button onClick={() => setShowAddProjectModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button><button onClick={handleCreateProject} disabled={!newProjectName} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium disabled:opacity-50">Create Project</button></div></div></div></div>}
        {showProfileModal && user && <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"><div className="bg-white rounded-xl shadow-xl w-full max-md p-6 animate-in zoom-in duration-200"><div className="flex justify-between items-center mb-6"><h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><UserIcon size={20} className="text-emerald-600"/> Edit Profile</h3><button onClick={() => setShowProfileModal(false)} className="text-slate-400 hover:text-slate-600"><X size={24}/></button></div><form onSubmit={handleSaveProfile} className="space-y-4"><div><label className="text-sm font-medium text-slate-700">Full Name</label><input className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900 mt-1" value={profileForm.name} onChange={e => setProfileForm({...profileForm, name: e.target.value})} required /></div><div><label className="text-sm font-medium text-slate-700">Email Address</label><div className="mt-1 space-y-2"><input className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none bg-slate-100 text-slate-500" value={profileForm.email} readOnly /></div></div><div className="pt-2 border-t border-slate-100 mt-2"><label className="text-sm font-bold text-slate-700 flex items-center gap-1 mb-2"><Lock size={14}/> Change Password</label><div className="grid grid-cols-2 gap-3"><input type="password" className="px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" placeholder="New Password" value={profileForm.newPassword} onChange={e => setProfileForm({...profileForm, newPassword: e.target.value})} /><input type="password" className="px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" placeholder="Confirm" value={profileForm.confirmPassword} onChange={e => setProfileForm({...profileForm, confirmPassword: e.target.value})} /></div></div><div className="flex justify-end gap-2 pt-4"><button type="button" onClick={() => setShowProfileModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button><button type="submit" className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-emerald-700 shadow-sm flex items-center gap-2"><Save size={18}/> Save Changes</button></div></form></div></div>}
      </HashRouter>
    </LanguageContext.Provider>
  );
};
export default App;
