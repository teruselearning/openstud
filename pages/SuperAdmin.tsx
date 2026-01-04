
import { useContext, useState, useEffect, useMemo } from 'react';
import { getNetworkPartners, getUsers, switchOrganization, getSystemSettings, saveSystemSettings, getOrg, getLanguages, saveLanguages, permanentDeleteOrganization, clearLocalCache, getSpecies, getProjects, getIndividuals } from '../services/storage';
import { testSmtpConnection } from '../services/emailService';
import { translateDictionary } from '../services/geminiService';
import { 
  Shield, Save, Loader2, Globe, Star, Mail, PenTool, LogIn, CheckCircle2, 
  Send, AlertCircle, Trash2, X, RefreshCw, Plus, Layout, Palette, 
  Lock, FileText, Type, Image as ImageIcon, Sparkles, UserPlus, AlertTriangle, Wand2,
  Building2, Briefcase, MapPin, GripVertical, Info, Database, Zap, Check, Search,
  ChevronDown, ChevronRight, Dna, Users, Activity, Leaf
} from 'lucide-react';
import { LanguageContext } from '../App';
import { SystemSettings, LanguageConfig, EmailTemplate, UserRole, StaticPageConfig, Organization, OrganizationFocus, LandingFeature, ExternalPartner, Project, Individual, Species, Sex } from '../types';
import RichTextEditor from '../components/RichTextEditor';
import { BASE_TRANSLATIONS } from '../services/i18n';
import React from 'react';

type AdminTab = 'overview' | 'email' | 'settings' | 'security' | 'languages';
type OverviewSubTab = 'organizations' | 'species_browser';

const SuperAdmin: React.FC = () => {
  const { t, refreshTranslations } = useContext(LanguageContext);
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [overviewSubTab, setOverviewSubTab] = useState<OverviewSubTab>('organizations');
  
  const [partners, setPartners] = useState<ExternalPartner[]>([]);
  const [myOrg, setMyOrg] = useState<Organization | null>(null);
  const [allSpecies, setAllSpecies] = useState<Species[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [allIndividuals, setAllIndividuals] = useState<Individual[]>([]);
  const [orgToDelete, setOrgToDelete] = useState<Organization | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [expandedOrgId, setExpandedOrgId] = useState<string | null>(null);

  const [settings, setSettings] = useState<SystemSettings>(getSystemSettings());
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpeciesForHolders, setSelectedSpeciesForHolders] = useState<Species | null>(null);
  
  const [selectedTemplate, setSelectedTemplate] = useState<string>('registration');
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate>({ subject: '', bodyHtml: '', enabled: true });
  
  const [testEmail, setTestEmail] = useState('');
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);
  const [testResult, setTestResult] = useState<{success: boolean, message: string} | null>(null);

  const [languages, setLanguages] = useState<LanguageConfig[]>([]);
  const [editingLang, setEditingLang] = useState<LanguageConfig | null>(null);
  const [newLangCode, setNewLangCode] = useState('');
  const [newLangName, setNewLangName] = useState('');
  const [isSavingLang, setIsSavingLang] = useState(false);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [aiFillSuccess, setAiFillSuccess] = useState(false);
  const [translationSearch, setTranslationSearch] = useState('');

  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [newOrgData, setNewOrgData] = useState({
     orgName: '',
     adminName: '',
     adminEmail: '',
     focus: 'Animals' as OrganizationFocus,
     location: ''
  });

  useEffect(() => {
    const current = getSystemSettings();
    setSettings(current);
    setLanguages(getLanguages());
    setPartners(getNetworkPartners());
    setMyOrg(getOrg());
    setAllSpecies(getSpecies());
    setAllProjects(getProjects());
    setAllIndividuals(getIndividuals());
    
    const initialTpl = current.emailTemplates?.[selectedTemplate as keyof typeof current.emailTemplates];
    if (initialTpl) {
       setEditingTemplate(initialTpl);
    }
  }, [selectedTemplate]);

  const allOrganizations = [myOrg, ...(partners || [])].filter(p => p && !p.deleted) as (Organization | ExternalPartner)[];

  const handleSaveAllSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    
    const finalSettings: SystemSettings = {
      ...settings,
      emailTemplates: {
         ...settings.emailTemplates,
         [selectedTemplate]: editingTemplate
      }
    };
    
    try {
      await saveSystemSettings(finalSettings);
      setSettings(finalSettings);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
    } catch (err) {
      console.error("Save settings failed", err);
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleTemplateChange = (type: string) => {
     const currentTemplates = { 
        ...settings.emailTemplates, 
        [selectedTemplate]: editingTemplate 
     };
     setSelectedTemplate(type);
     const nextTpl = currentTemplates[type as keyof typeof currentTemplates];
     if (nextTpl) {
        setEditingTemplate(nextTpl);
     }
     setSettings(prev => ({ ...prev, emailTemplates: currentTemplates }));
  };

  const handleRunSmtpTest = async () => {
    if (!testEmail) return;
    setIsTestingSmtp(true);
    setTestResult(null);
    await handleSaveAllSettings();
    try {
      await testSmtpConnection(testEmail);
      setTestResult({ success: true, message: t('smtpTestSuccess') });
    } catch (e: any) {
      setTestResult({ success: false, message: e.message || "SMTP Connection Failed" });
    } finally {
      setIsTestingSmtp(false);
    }
  };

  const handleAddFeature = () => {
    const features = settings.landingPageConfig?.features || [];
    const newFeature: LandingFeature = {
      id: `f-${Date.now()}`,
      title: 'New Feature',
      description: 'Feature description goes here.',
      icon: 'Shield'
    };
    setSettings({
      ...settings,
      landingPageConfig: {
        ...settings.landingPageConfig,
        features: [...features, newFeature]
      }
    });
  };

  const handleRemoveFeature = (id: string) => {
    const features = settings.landingPageConfig?.features || [];
    setSettings({
      ...settings,
      landingPageConfig: {
        ...settings.landingPageConfig,
        features: features.filter(f => f.id !== id)
      }
    });
  };

  const handleUpdateFeature = (id: string, field: keyof LandingFeature, value: string) => {
    const features = settings.landingPageConfig?.features || [];
    setSettings({
      ...settings,
      landingPageConfig: {
        ...settings.landingPageConfig,
        features: features.map(f => f.id === id ? { ...f, [field]: value } : f)
      }
    });
  };

  return (
    <div className="space-y-8 pb-12">
      {/* ... header and tabs ... */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Shield className="text-purple-600" /> {t('superAdmin')}</h2>
          <p className="text-slate-500">{t('saSubtitle')}</p>
        </div>
        <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm overflow-x-auto whitespace-nowrap scrollbar-hide">
           <button onClick={() => setActiveTab('overview')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'overview' ? 'bg-purple-100 text-purple-700' : 'text-slate-600 hover:bg-slate-50'}`}>{t('network')}</button>
           <button onClick={() => setActiveTab('security')} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'security' ? 'bg-purple-100 text-purple-700' : 'text-slate-600 hover:bg-slate-50'}`}><Lock size={16} /> {t('security')}</button>
           <button onClick={() => setActiveTab('email')} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'email' ? 'bg-purple-100 text-purple-700' : 'text-slate-600 hover:bg-slate-50'}`}><Mail size={16} /> {t('email')}</button>
           <button onClick={() => setActiveTab('settings')} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'settings' ? 'bg-purple-100 text-purple-700' : 'text-slate-600 hover:bg-slate-50'}`}><Layout size={16} /> {t('landing')}</button>
           <button onClick={() => setActiveTab('languages')} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'languages' ? 'bg-purple-100 text-purple-700' : 'text-slate-600 hover:bg-slate-50'}`}><Globe size={16} /> {t('localisation')}</button>
        </div>
      </div>

      {activeTab === 'email' && (
         <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 animate-in fade-in">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 flex flex-col h-fit">
               {/* ... SMTP fields ... */}
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-fit min-h-[600px]">
               <div className="flex items-center gap-3 mb-4 border-b border-slate-50 pb-4">
                  <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg"><PenTool size={20}/></div>
                  <h3 className="font-extrabold text-lg text-slate-900">Email Templates</h3>
               </div>
               <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-xl">
                  {['registration', 'mfa', 'invite', 'notification'].map(tKey => (
                     <button key={tKey} onClick={() => handleTemplateChange(tKey)} className={`flex-1 py-1 text-[10px] font-extrabold rounded-lg uppercase tracking-wider transition-all ${selectedTemplate === tKey ? 'bg-white shadow text-emerald-700' : 'text-slate-500 hover:text-slate-800'}`}>
                        {t(tKey as any) || tKey}
                     </button>
                  ))}
               </div>
               <div className="space-y-3 flex-1 flex flex-col">
                  {/* ... Editor ... */}
               </div>
            </div>
         </div>
      )}

      {activeTab === 'settings' && (
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in">
            {/* ... Theming ... */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
               <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                  <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><Layout size={20}/></div>
                  <h3 className="font-extrabold text-lg text-slate-900">{t('landingPage')}</h3>
               </div>
               <div className="space-y-4">
                  <div className="space-y-1 border-b border-slate-50 pb-4">
                     <div className="flex items-center justify-between">
                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                           <UserPlus size={16} className="text-indigo-500"/> {t('enableRegistration')}
                        </label>
                        <label className="relative inline-flex items-center cursor-pointer">
                           <input type="checkbox" className="sr-only peer" checked={settings.enableRegistration !== false} onChange={e => setSettings({...settings, enableRegistration: e.target.checked})} />
                           <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                        </label>
                     </div>
                  </div>
                  {/* ... Hero Title/Subtitle inputs ... */}
               </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default SuperAdmin;
