
import React, { useContext, useState, useEffect } from 'react';
import { getNetworkPartners, getUsers, switchOrganization, getSystemSettings, saveSystemSettings, getOrg, getProjects, getIndividuals, getBreedingEvents, getBreedingLoans, getPartnerships, getSpecies, syncPushOrg, syncPushUsers, syncPushProjects, syncPushSpecies, syncPushIndividuals, syncPushBreedingEvents, syncPushBreedingLoans, syncPushPartnerships, syncPushSettings, deleteOrganization, getLanguages, saveLanguages, deleteLanguage } from '../services/storage';
import { checkSupabaseConnection, isSupabaseConfigured, saveSupabaseConfig, getSupabaseConfig } from '../services/supabase';
import { SUPABASE_SCHEMA_SQL } from '../services/schemaTemplate';
import { translateDictionary } from '../services/geminiService';
import { testSmtpConnection } from '../services/emailService';
import { Shield, Database, Layout, Settings, MapPin, Eye, Save, Copy, Check, AlertCircle, RefreshCw, UploadCloud, Code, FileText, X, Building2, EyeOff, LogIn, Trash2, Sparkles, Play, Globe, Star, Plus, Loader2, Lock, Unlock, ChevronDown, ChevronRight, Sprout, PawPrint, AlertTriangle, ExternalLink, PenLine, GripVertical, Mail, PenTool, Send } from 'lucide-react';
import { LanguageContext } from '../App';
import { SystemSettings, LandingFeature, Organization, LanguageConfig, Sex, EmailTemplate } from '../types';
import RichTextEditor from '../components/RichTextEditor';
import { BASE_TRANSLATIONS } from '../services/i18n';

const SuperAdmin: React.FC = () => {
  const { t, refreshTranslations } = useContext(LanguageContext);
  const [activeTab, setActiveTab] = useState<'overview' | 'database' | 'settings' | 'content' | 'languages' | 'email'>('overview');
  
  // Data Stats
  const partners = getNetworkPartners();
  const myOrg = getOrg();
  const allOrganizations = [myOrg, ...partners];

  // Database State
  const [dbConfig, setDbConfig] = useState(getSupabaseConfig());
  const [dbCheckResult, setDbCheckResult] = useState<{success: boolean, message: string} | null>(null);
  const [isCheckingDb, setIsCheckingDb] = useState(false);
  const [seedLogs, setSeedLogs] = useState<string[]>([]);
  const [isSeeding, setIsSeeding] = useState(false);
  const [showSchemaModal, setShowSchemaModal] = useState(false);

  // Org Expansion State
  const [expandedOrgId, setExpandedOrgId] = useState<string | null>(null);
  const [orgBreakdown, setOrgBreakdown] = useState<any[]>([]);

  // Settings State
  const [settings, setSettings] = useState<SystemSettings>(getSystemSettings());
  const [landingConfig, setLandingConfig] = useState(settings.landingPageConfig || {});
  const [pagesConfig, setPagesConfig] = useState({
     about: settings.aboutPage,
     privacy: settings.privacyPage,
     terms: settings.termsPage
  });
  
  // Email State
  const [testEmail, setTestEmail] = useState('');
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('mfa');
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  
  // Language State
  const [languages, setLanguages] = useState<LanguageConfig[]>([]);
  const [editingLang, setEditingLang] = useState<LanguageConfig | null>(null);
  const [newLangCode, setNewLangCode] = useState('');
  const [newLangName, setNewLangName] = useState('');
  const [isSavingLang, setIsSavingLang] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [isDeletingOrg, setIsDeletingOrg] = useState<string | null>(null);
  
  // Deletion Modal State
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'org' | 'lang', id: string, name: string } | null>(null);
  
  // Landing Page Feature Editing
  const [features, setFeatures] = useState<LandingFeature[]>(landingConfig.features || []);
  const [editingFeature, setEditingFeature] = useState<LandingFeature | null>(null);
  const [showFeatureForm, setShowFeatureForm] = useState(false);

  useEffect(() => {
    const current = getSystemSettings();
    setSettings(current);
    setLandingConfig(current.landingPageConfig || {});
    setFeatures(current.landingPageConfig?.features || []);
    setPagesConfig({
       about: current.aboutPage,
       privacy: current.privacyPage,
       terms: current.termsPage
    });
    setDbConfig(getSupabaseConfig());
    setLanguages(getLanguages());
    
    if (current.emailTemplates) {
       setEditingTemplate(current.emailTemplates['mfa']);
    }
  }, []);

  const addLog = (msg: string) => setSeedLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const handleSaveDbConfig = () => {
     saveSupabaseConfig(dbConfig.url, dbConfig.key);
     addLog("Credentials saved locally.");
     alert("Credentials saved. Reloading to apply...");
     window.location.reload();
  };

  const handleTestDb = async () => {
    setIsCheckingDb(true);
    setDbCheckResult(null);
    addLog("Testing connection...");
    const result = await checkSupabaseConnection();
    setDbCheckResult(result);
    addLog(`Connection Test: ${result.success ? 'SUCCESS' : 'FAILED'} - ${result.message}`);
    setIsCheckingDb(false);
  };

  const handleSeedDatabase = async () => {
    if (!isSupabaseConfigured()) {
       alert("Error: Supabase not configured. Check credentials.");
       return;
    }
    if (!window.confirm("This will overwrite cloud data with your local data. Continue?")) return;

    setIsSeeding(true);
    setSeedLogs([]);
    addLog("Starting Database Seed...");

    try {
       await syncPushOrg(getOrg());
       await syncPushSettings(getSystemSettings());
       await syncPushProjects(getProjects());
       await syncPushUsers(getUsers());
       await syncPushSpecies(getSpecies());
       await syncPushIndividuals(getIndividuals());
       await syncPushBreedingEvents(getBreedingEvents());
       await syncPushBreedingLoans(getBreedingLoans());
       await syncPushPartnerships(getPartnerships());
       await saveLanguages(getLanguages(), false); 
       
       addLog("SUCCESS! Database population complete.");
       alert("Database seeded successfully!");
    } catch (e: any) {
       console.error(e);
       addLog(`ERROR: ${e.message}`);
       alert(`Seeding Failed: ${e.message}`);
    } finally {
       setIsSeeding(false);
    }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = {
      ...settings,
      landingPageConfig: { ...landingConfig, features: features },
      aboutPage: pagesConfig.about,
      privacyPage: pagesConfig.privacy,
      terms: pagesConfig.terms,
      // Ensure current template edit is saved to the main object
      emailTemplates: {
         ...settings.emailTemplates,
         [selectedTemplate]: editingTemplate || settings.emailTemplates?.[selectedTemplate]
      }
    };
    saveSystemSettings(updated);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 3000);
  };
  
  const handleTestSmtp = async () => {
     if(!testEmail) return;
     setIsTestingSmtp(true);
     try {
        // Save settings first to ensure backend uses latest
        await syncPushSettings(settings);
        const result = await testSmtpConnection(testEmail);
        alert(result.message);
     } catch (e: any) {
        alert("SMTP Test Failed: " + e.message);
     } finally {
        setIsTestingSmtp(false);
     }
  };
  
  const handleTemplateChange = (type: string) => {
     // Save current work to local state before switching
     if (editingTemplate) {
        setSettings(prev => ({
           ...prev,
           emailTemplates: { ...prev.emailTemplates, [selectedTemplate]: editingTemplate }
        }));
     }
     
     setSelectedTemplate(type);
     setEditingTemplate(settings.emailTemplates?.[type] || { subject: '', bodyHtml: '', enabled: true });
  };

  const handleLoginAs = (orgId: string, orgObj: Organization) => {
     if(switchOrganization(orgId, orgObj)) window.location.reload();
  };
  
  const triggerDeleteOrg = (orgId: string, orgName: string) => {
     setDeleteTarget({ type: 'org', id: orgId, name: orgName });
  };

  const triggerDeleteLang = (code: string, name: string) => {
     if (code === 'en-GB') {
        alert("Cannot delete the base language.");
        return;
     }
     setDeleteTarget({ type: 'lang', id: code, name });
  };

  const confirmDelete = async () => {
     if (!deleteTarget) return;

     if (deleteTarget.type === 'org') {
        setIsDeletingOrg(deleteTarget.id);
        try {
           await deleteOrganization(deleteTarget.id);
           alert(`Organization "${deleteTarget.name}" deleted successfully.`);
           window.location.reload();
        } catch(e: any) {
           console.error("Delete failed", e);
           alert(`Failed to delete organization: ${e.message}`);
           setIsDeletingOrg(null);
        }
     } else if (deleteTarget.type === 'lang') {
        setIsSavingLang(true);
        try {
           await deleteLanguage(deleteTarget.id);
           
           // Update local state after successful delete
           const updated = languages.filter(l => l.code !== deleteTarget.id);
           setLanguages(updated);
           
           refreshTranslations();
           if (editingLang?.code === deleteTarget.id) setEditingLang(null);
        } catch(e: any) {
           alert(`Failed to delete language from cloud: ${e.message}`);
        } finally {
           setIsSavingLang(false);
        }
     }
     
     setDeleteTarget(null);
  };

  const handleToggleExpandOrg = (orgId: string) => {
     if (expandedOrgId === orgId) {
        setExpandedOrgId(null);
        setOrgBreakdown([]);
     } else {
        setExpandedOrgId(orgId);
        // Calculate breakdown
        const allProjects = getProjects();
        const allSpecies = getSpecies();
        const allIndividuals = getIndividuals();

        const orgProjectIds = allProjects.filter(p => p.orgId === orgId).map(p => p.id);
        const orgSpecies = allSpecies.filter(s => orgProjectIds.includes(s.projectId));
        
        const breakdown = orgSpecies.map(s => {
           const inds = allIndividuals.filter(i => i.speciesId === s.id && !i.isDeceased);
           const m = inds.filter(i => i.sex === Sex.MALE).length;
           const f = inds.filter(i => i.sex === Sex.FEMALE).length;
           const u = inds.filter(i => i.sex === Sex.UNKNOWN || !i.sex).length;
           return {
              id: s.id,
              name: s.commonName,
              scientific: s.scientificName,
              type: s.type,
              count: `${m}.${f}.${u}`
           };
        });
        setOrgBreakdown(breakdown);
     }
  };

  const handleAddFeature = () => {
     const newFeat: LandingFeature = { id: `f-${Date.now()}`, title: 'New Feature', description: 'Description here...', icon: 'HelpCircle' };
     setFeatures([...features, newFeat]);
     setEditingFeature(newFeat);
     setShowFeatureForm(true);
  };

  const handleUpdateFeature = () => {
     if(!editingFeature) return;
     const updated = features.map(f => f.id === editingFeature.id ? editingFeature : f);
     setFeatures(updated);
     setShowFeatureForm(false);
     setEditingFeature(null);
  };

  const handleDeleteFeature = (id: string) => {
     if(window.confirm("Remove this feature tile?")) {
        const updated = features.filter(f => f.id !== id);
        setFeatures(updated);
     }
  };

  const handleAddLanguage = async () => {
     if (!newLangCode || !newLangName) return;
     const exists = languages.find(l => l.code === newLangCode);
     if (exists) {
        alert("Language code already exists.");
        return;
     }
     
     const newLang: LanguageConfig = {
        code: newLangCode,
        name: newLangName,
        isDefault: false,
        translations: { ...BASE_TRANSLATIONS }, 
        manualOverrides: []
     };
     
     const updated = [...languages, newLang];
     setLanguages(updated);
     setIsSavingLang(true);
     try {
        await saveLanguages(updated, false);
        setNewLangCode('');
        setNewLangName('');
        refreshTranslations();
        alert(`Added ${newLangName} and synced to database.`);
     } catch (e) {
        alert("Saved locally, but failed to sync to database. Check console.");
     } finally {
        setIsSavingLang(false);
     }
  };

  const handleSetDefaultLanguage = async (code: string) => {
     const updated = languages.map(l => ({ ...l, isDefault: l.code === code }));
     setLanguages(updated);
     await saveLanguages(updated, false);
     refreshTranslations();
  };

  const handleUpdateTranslation = (key: string, value: string) => {
     if (!editingLang) return;
     const currentOverrides = editingLang.manualOverrides || [];
     const newOverrides = currentOverrides.includes(key) ? currentOverrides : [...currentOverrides, key];
     const updatedLang = { ...editingLang, manualOverrides: newOverrides, translations: { ...editingLang.translations, [key]: value } };
     setEditingLang(updatedLang);
     const updatedList = languages.map(l => l.code === editingLang.code ? updatedLang : l);
     setLanguages(updatedList);
  };

  const handleUnlockTranslation = (key: string) => {
     if (!editingLang) return;
     const currentOverrides = editingLang.manualOverrides || [];
     const newOverrides = currentOverrides.filter(k => k !== key);
     const updatedLang = { ...editingLang, manualOverrides: newOverrides };
     setEditingLang(updatedLang);
     const updatedList = languages.map(l => l.code === editingLang.code ? updatedLang : l);
     setLanguages(updatedList);
  };

  const handleSaveTranslations = async () => {
     if (!editingLang) return;
     setIsSavingLang(true);
     try {
        await saveLanguages(languages, false);
        refreshTranslations();
        alert("Translations saved to database!");
     } catch (e) {
        alert("Saved locally, but DB sync failed.");
     } finally {
        setIsSavingLang(false);
     }
  };

  const handleAutoTranslate = async () => {
     if (!editingLang) return;
     if (editingLang.code === 'en-GB') {
        alert("Cannot auto-translate the source language (English UK).");
        return;
     }
     const apiKey = process.env.API_KEY;
     if (!apiKey) {
        alert("Gemini API Key is not configured in the environment.");
        return;
     }
     setIsTranslating(true);
     try {
        const overrides = new Set(editingLang.manualOverrides || []);
        const keysToTranslate = Object.keys(BASE_TRANSLATIONS).filter(k => !overrides.has(k));
        if (keysToTranslate.length === 0) {
           alert("All keys are manually overridden. Nothing to translate.");
           return;
        }
        const sourceObject: Record<string, string> = {};
        keysToTranslate.forEach(k => { sourceObject[k] = (BASE_TRANSLATIONS as any)[k]; });
        const translatedDict = await translateDictionary(sourceObject, editingLang.name);
        const newTranslations = { ...editingLang.translations, ...translatedDict };
        const updatedLang = { ...editingLang, translations: newTranslations };
        setEditingLang(updatedLang);
        const updatedList = languages.map(l => l.code === editingLang.code ? updatedLang : l);
        setLanguages(updatedList);
        await saveLanguages(updatedList, false);
        refreshTranslations();
        alert(`Successfully auto-translated ${Object.keys(translatedDict).length} strings.`);
     } catch (e: any) {
        console.error("Auto Translate Error", e);
        alert(`Translation failed: ${e.message}`);
     } finally {
        setIsTranslating(false);
     }
  };

  return (
    <div className="space-y-8 pb-12 relative">
      {/* Header & Tabs */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="text-purple-600" /> {t('saDashboard')}
          </h2>
          <p className="text-slate-500">{t('saSubtitle')}</p>
        </div>
        
        <div className="flex bg-white p-1 rounded-lg border border-slate-200 shadow-sm overflow-x-auto max-w-full">
           <button onClick={() => setActiveTab('overview')} className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap ${activeTab === 'overview' ? 'bg-purple-100 text-purple-700' : 'text-slate-600 hover:bg-slate-50'}`}>{t('systemOverview')}</button>
           <button onClick={() => setActiveTab('database')} className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap flex items-center gap-2 ${activeTab === 'database' ? 'bg-purple-100 text-purple-700' : 'text-slate-600 hover:bg-slate-50'}`}><Database size={16} /> Database</button>
           <button onClick={() => setActiveTab('email')} className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap flex items-center gap-2 ${activeTab === 'email' ? 'bg-purple-100 text-purple-700' : 'text-slate-600 hover:bg-slate-50'}`}><Mail size={16} /> Email</button>
           <button onClick={() => setActiveTab('settings')} className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap flex items-center gap-2 ${activeTab === 'settings' ? 'bg-purple-100 text-purple-700' : 'text-slate-600 hover:bg-slate-50'}`}><Settings size={16} /> {t('appSettings')}</button>
           <button onClick={() => setActiveTab('content')} className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap flex items-center gap-2 ${activeTab === 'content' ? 'bg-purple-100 text-purple-700' : 'text-slate-600 hover:bg-slate-50'}`}><Layout size={16} /> Content</button>
           <button onClick={() => setActiveTab('languages')} className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap flex items-center gap-2 ${activeTab === 'languages' ? 'bg-purple-100 text-purple-700' : 'text-slate-600 hover:bg-slate-50'}`}><Globe size={16} /> {t('manageLanguages')}</button>
        </div>
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="space-y-8 animate-in fade-in">
           <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-200 flex justify-between items-center">
                 <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Building2 size={20} className="text-slate-500"/> {t('organizationList')}
                 </h3>
                 <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">{allOrganizations.length} Records</span>
              </div>
              <div className="overflow-x-auto">
                 <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200">
                       <tr>
                          <th className="w-10"></th>
                          <th className="px-6 py-4 font-semibold text-slate-700 text-sm">{t('orgName')}</th>
                          <th className="px-6 py-4 font-semibold text-slate-700 text-sm">{t('location')}</th>
                          <th className="px-6 py-4 font-semibold text-slate-700 text-sm">Focus</th>
                          <th className="px-6 py-4 font-semibold text-slate-700 text-sm">{t('foundedYear')}</th>
                          <th className="px-6 py-4 font-semibold text-slate-700 text-sm">Visibility</th>
                          <th className="px-6 py-4 font-semibold text-slate-700 text-sm text-right">Actions</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {allOrganizations.map((org, index) => {
                          const isSelf = org.id === myOrg.id;
                          const isExpanded = expandedOrgId === org.id;
                          return (
                             <React.Fragment key={org.id || index}>
                                <tr className={`hover:bg-slate-50 transition-colors ${isExpanded ? 'bg-slate-50' : ''}`}>
                                   <td className="pl-4">
                                      <button onClick={() => handleToggleExpandOrg(org.id)} className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors">
                                         {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                      </button>
                                   </td>
                                   <td className="px-6 py-4">
                                      <div className="flex items-center gap-2">
                                         <span className="font-bold text-slate-900">{org.name}</span>
                                         {isSelf && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-bold">You</span>}
                                      </div>
                                      <span className="text-xs text-slate-400 font-mono">{org.id}</span>
                                   </td>
                                   <td className="px-6 py-4 text-sm text-slate-600 flex items-center gap-1"><MapPin size={14}/> {org.location}</td>
                                   <td className="px-6 py-4">
                                      <span className={`text-xs px-2 py-1 rounded font-bold ${(org as any).focus === 'Animals' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                                         {(org as any).focus || 'N/A'}
                                      </span>
                                   </td>
                                   <td className="px-6 py-4 text-sm text-slate-600">{(org as any).foundedYear || '-'}</td>
                                   <td className="px-6 py-4">
                                      <div className="flex flex-col gap-1">
                                         {org.isOrgPublic ? (
                                            <span className="text-xs text-emerald-600 flex items-center gap-1"><Eye size={12}/> Public Profile</span>
                                         ) : (
                                            <span className="text-xs text-slate-400 flex items-center gap-1"><EyeOff size={12}/> Hidden</span>
                                         )}
                                      </div>
                                   </td>
                                   <td className="px-6 py-4 text-right">
                                      {!isSelf && (
                                         <div className="flex justify-end gap-2">
                                            <button onClick={() => handleLoginAs(org.id, org as any)} className="bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900 text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1"><LogIn size={12} /> Login As</button>
                                            <button onClick={() => triggerDeleteOrg(org.id, org.name)} className="bg-red-50 text-red-600 hover:bg-red-100 text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1 disabled:opacity-50" disabled={isDeletingOrg === org.id}>
                                               {isDeletingOrg === org.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Delete
                                            </button>
                                         </div>
                                      )}
                                   </td>
                                </tr>
                                {isExpanded && (
                                   <tr>
                                      <td colSpan={7} className="bg-slate-50 p-6 border-b border-slate-200">
                                         <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
                                            <h4 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2"><Database size={14}/> Species Breakdown</h4>
                                            {orgBreakdown.length > 0 ? (
                                               <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                                  {orgBreakdown.map((item, i) => (
                                                     <div key={i} className="flex items-center justify-between p-2 rounded border border-slate-100 text-sm">
                                                        <div className="flex items-center gap-2">
                                                           {item.type === 'Plant' ? <Sprout size={14} className="text-green-600"/> : <PawPrint size={14} className="text-blue-600"/>}
                                                           <div>
                                                              <div className="font-medium text-slate-900">{item.name}</div>
                                                              <div className="text-[10px] text-slate-500 italic">{item.scientific}</div>
                                                           </div>
                                                        </div>
                                                        <div className="text-right">
                                                           <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">M.F.U</span>
                                                           <div className="font-mono font-medium text-slate-700">{item.count}</div>
                                                        </div>
                                                     </div>
                                                  ))}
                                               </div>
                                            ) : (
                                               <p className="text-slate-400 text-sm italic">No species data found.</p>
                                            )}
                                         </div>
                                      </td>
                                   </tr>
                                )}
                             </React.Fragment>
                          );
                       })}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>
      )}

      {/* DATABASE TAB */}
      {activeTab === 'database' && (
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in">
            <div className="space-y-6">
               <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2"><Database size={20} className="text-emerald-600" /> Connection Settings</h3>
                  <div className="space-y-4">
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Supabase URL</label>
                        <input className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none bg-white text-slate-900 font-mono text-sm" value={dbConfig.url} onChange={e => setDbConfig({...dbConfig, url: e.target.value})} />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Supabase Key</label>
                        <input className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none bg-white text-slate-900 font-mono text-sm" type="password" value={dbConfig.key} onChange={e => setDbConfig({...dbConfig, key: e.target.value})} />
                     </div>
                     <div className="flex gap-2 pt-2">
                        <button onClick={handleSaveDbConfig} className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-emerald-700 flex items-center gap-2"><Save size={16} /> Save Credentials</button>
                        <button onClick={handleTestDb} disabled={isCheckingDb} className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-medium hover:bg-slate-50 flex items-center gap-2 disabled:opacity-50">{isCheckingDb ? <Loader2 size={16} className="animate-spin"/> : <Play size={16} />} Test Connection</button>
                     </div>
                     {dbCheckResult && <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${dbCheckResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{dbCheckResult.success ? <Check size={16} /> : <AlertCircle size={16} />}{dbCheckResult.message}</div>}
                  </div>
               </div>
               <button onClick={() => setShowSchemaModal(true)} className="w-full bg-slate-100 border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-medium hover:bg-slate-200 flex items-center justify-center gap-2"><FileText size={16} /> View SQL Schema</button>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col">
               <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4"><UploadCloud size={20} className="text-blue-600" /> Seed Database</h3>
               <div className="flex-1 bg-slate-900 rounded-lg p-4 font-mono text-xs text-green-400 overflow-y-auto min-h-[200px] mb-4 shadow-inner border border-slate-700">
                  {seedLogs.length === 0 && <div className="text-slate-500 italic text-center mt-8">Ready to seed.</div>}
                  {seedLogs.map((log, i) => <div key={i} className="mb-1 border-b border-slate-800/50 pb-1">{log}</div>)}
                  {isSeeding && <div className="animate-pulse mt-2">_</div>}
               </div>
               <button onClick={handleSeedDatabase} disabled={isSeeding} className="w-full bg-blue-600 text-white px-4 py-3 rounded-lg font-bold hover:bg-blue-700 flex items-center justify-center gap-2 shadow-md disabled:opacity-50">{isSeeding ? <RefreshCw size={18} className="animate-spin" /> : <Database size={18} />}{isSeeding ? 'Seeding...' : 'Populate / Seed Database'}</button>
            </div>
         </div>
      )}

      {/* EMAIL TAB */}
      {activeTab === 'email' && (
         <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
               <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2"><Mail size={20} className="text-blue-600" /> SMTP Configuration</h3>
                  <div className="space-y-4">
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{t('smtpHost')}</label>
                        <input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900" value={settings.smtpHost} onChange={e => setSettings({...settings, smtpHost: e.target.value})} placeholder="smtp.gmail.com" />
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div>
                           <label className="block text-sm font-medium text-slate-700 mb-1">{t('port')}</label>
                           <input type="number" className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900" value={settings.smtpPort} onChange={e => setSettings({...settings, smtpPort: parseInt(e.target.value)})} placeholder="587" />
                        </div>
                        <div className="flex items-end">
                           <label className="flex items-center space-x-2 bg-slate-50 px-3 py-2.5 rounded-lg border border-slate-200 w-full cursor-pointer">
                              <input type="checkbox" className="rounded text-blue-600 focus:ring-blue-500" checked={settings.smtpSecure} onChange={e => setSettings({...settings, smtpSecure: e.target.checked})} />
                              <span className="text-sm text-slate-700">{t('secureConnection')}</span>
                           </label>
                        </div>
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{t('username')}</label>
                        <input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900" value={settings.smtpUser} onChange={e => setSettings({...settings, smtpUser: e.target.value})} placeholder="user@example.com" />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{t('password')}</label>
                        <input type="password" className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900" value={settings.smtpPass} onChange={e => setSettings({...settings, smtpPass: e.target.value})} placeholder="••••••••" />
                     </div>
                     <div className="pt-2 border-t border-slate-100 mt-4">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Test Connection</label>
                        <div className="flex gap-2">
                           <input className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900" placeholder="Test Email Address" value={testEmail} onChange={e => setTestEmail(e.target.value)} />
                           <button onClick={handleTestSmtp} disabled={isTestingSmtp || !testEmail} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50 flex items-center gap-2">{isTestingSmtp ? <Loader2 size={16} className="animate-spin"/> : <Send size={16}/>} Test</button>
                        </div>
                     </div>
                  </div>
               </div>
               <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col h-full">
                  <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2"><PenTool size={20} className="text-emerald-600" /> Email Templates</h3>
                  <div className="flex gap-2 mb-4 bg-slate-50 p-1 rounded-lg">
                     <button onClick={() => handleTemplateChange('mfa')} className={`flex-1 py-1.5 text-sm font-medium rounded transition-all ${selectedTemplate === 'mfa' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}>MFA Code</button>
                     <button onClick={() => handleTemplateChange('invite')} className={`flex-1 py-1.5 text-sm font-medium rounded transition-all ${selectedTemplate === 'invite' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}>User Invite</button>
                     <button onClick={() => handleTemplateChange('notification')} className={`flex-1 py-1.5 text-sm font-medium rounded transition-all ${selectedTemplate === 'notification' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}>General</button>
                  </div>
                  {editingTemplate && (
                     <div className="space-y-4 flex-1 flex flex-col">
                        <label className="flex items-center gap-2 text-sm text-slate-700 font-medium cursor-pointer">
                           <input type="checkbox" checked={editingTemplate.enabled} onChange={e => setEditingTemplate({...editingTemplate, enabled: e.target.checked})} className="rounded text-emerald-600" />
                           Enable Custom Template
                        </label>
                        <input className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900" value={editingTemplate.subject} onChange={e => setEditingTemplate({...editingTemplate, subject: e.target.value})} placeholder="Subject" />
                        <div className="flex-1 min-h-[200px]"><RichTextEditor value={editingTemplate.bodyHtml} onChange={val => setEditingTemplate({...editingTemplate, bodyHtml: val})} height="100%" /></div>
                     </div>
                  )}
               </div>
            </div>
            <div className="flex justify-end pt-4"><button onClick={handleSaveSettings} className="bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-bold hover:bg-emerald-700 flex items-center gap-2 shadow-sm"><Save size={18} /> {settingsSaved ? 'Settings Saved!' : 'Save Email Configuration'}</button></div>
         </div>
      )}

      {/* LANGUAGES TAB - Full Implementation for default export fix */}
      {activeTab === 'languages' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-[700px] animate-in fade-in">
           <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <div>
                 <h3 className="text-lg font-bold text-slate-900">{t('manageLanguages')}</h3>
                 <p className="text-sm text-slate-500">Add or edit translations for the interface.</p>
              </div>
              <div className="flex gap-2">
                 <input className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-900 w-24" placeholder="Code (de)" value={newLangCode} onChange={e => setNewLangCode(e.target.value)} maxLength={5} />
                 <input className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-900 w-32" placeholder="Name (German)" value={newLangName} onChange={e => setNewLangName(e.target.value)} />
                 <button onClick={handleAddLanguage} disabled={!newLangCode || isSavingLang} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-emerald-700 flex items-center gap-2">
                    {isSavingLang ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Add
                 </button>
              </div>
           </div>
           
           <div className="flex flex-1 overflow-hidden">
              <div className="w-64 border-r border-slate-200 bg-slate-50 overflow-y-auto p-2">
                 {languages.map(lang => (
                    <div key={lang.code} className={`flex justify-between items-center p-3 rounded-lg cursor-pointer mb-1 ${editingLang?.code === lang.code ? 'bg-white shadow text-purple-700 font-bold' : 'hover:bg-white text-slate-600'}`} onClick={() => setEditingLang(lang)}>
                       <div className="flex items-center gap-2"><span>{lang.name}</span>{lang.isDefault && <Star size={12} className="text-amber-500 fill-amber-500" />}</div>
                       <button onClick={(e) => {e.stopPropagation(); triggerDeleteLang(lang.code, lang.name);}} className="text-slate-400 hover:text-red-500 p-1" disabled={lang.code === 'en-GB' || isSavingLang}><Trash2 size={12} /></button>
                    </div>
                 ))}
              </div>
              
              <div className="flex-1 flex flex-col overflow-hidden bg-white">
                 {editingLang ? (
                    <>
                       <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center flex-wrap gap-2">
                          <span className="font-bold text-slate-700 uppercase flex items-center gap-2"><Globe size={16} /> {editingLang.name} <span className="text-xs text-slate-400 font-normal">({editingLang.code})</span></span>
                          <div className="flex gap-2">
                             {editingLang.code !== 'en-GB' && (
                                <button onClick={handleAutoTranslate} disabled={isTranslating || isSavingLang} className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-purple-700 shadow-sm flex items-center gap-2 disabled:opacity-50">
                                   {isTranslating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} <span className="hidden sm:inline">Auto-Translate</span>
                                </button>
                             )}
                             {!editingLang.isDefault && (
                                <button onClick={() => handleSetDefaultLanguage(editingLang.code)} className="text-sm text-slate-500 hover:text-amber-600 font-medium px-3 py-1 rounded bg-white border border-slate-200">Set as Default</button>
                             )}
                          </div>
                       </div>
                       <div className="flex-1 overflow-y-auto p-6 space-y-4">
                          {Object.keys(BASE_TRANSLATIONS).map(key => (
                             <div key={key} className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">{key}</label>
                                <div className="flex gap-2">
                                   <input className="flex-1 border border-slate-300 rounded px-3 py-2 text-sm bg-white text-slate-900" value={editingLang.translations[key] || ''} onChange={e => handleUpdateTranslation(key, e.target.value)} />
                                   {editingLang.manualOverrides?.includes(key) && (
                                      <button onClick={() => handleUnlockTranslation(key)} className="text-slate-400 hover:text-emerald-600" title="Unlock auto-translate"><Unlock size={14}/></button>
                                   )}
                                </div>
                             </div>
                          ))}
                       </div>
                       <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
                          <button onClick={handleSaveTranslations} disabled={isSavingLang} className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-emerald-700 flex items-center gap-2">
                             {isSavingLang ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Save All Translations
                          </button>
                       </div>
                    </>
                 ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50">
                       <Globe size={48} className="mb-4 opacity-20" />
                       <p>Select a language to edit translations.</p>
                    </div>
                 )}
              </div>
           </div>
        </div>
      )}

      {/* Modal Placeholders */}
      {deleteTarget && (
         <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
               <h3 className="text-lg font-bold mb-4">Confirm Delete</h3>
               <p className="text-sm mb-6">Delete {deleteTarget.name}?</p>
               <div className="flex gap-3"><button onClick={() => setDeleteTarget(null)} className="flex-1 px-4 py-2 bg-slate-100 rounded-lg">Cancel</button><button onClick={confirmDelete} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg">Delete</button></div>
            </div>
         </div>
      )}

      {showSchemaModal && (
         <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full flex flex-col max-h-[80vh]">
               <div className="p-4 border-b flex justify-between items-center"><h3 className="font-bold">SQL Schema</h3><button onClick={() => setShowSchemaModal(false)}><X size={20}/></button></div>
               <div className="flex-1 overflow-auto p-4 bg-slate-900"><pre className="text-xs text-emerald-400 font-mono">{SUPABASE_SCHEMA_SQL}</pre></div>
            </div>
         </div>
      )}
    </div>
  );
};

// Added missing default export
export default SuperAdmin;
