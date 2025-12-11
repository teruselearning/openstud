
import React, { useContext, useState, useEffect } from 'react';
import { getNetworkPartners, getUsers, switchOrganization, getSystemSettings, saveSystemSettings, getOrg, getProjects, getIndividuals, getBreedingEvents, getBreedingLoans, getPartnerships, getSpecies, syncPushOrg, syncPushUsers, syncPushProjects, syncPushSpecies, syncPushIndividuals, syncPushBreedingEvents, syncPushBreedingLoans, syncPushPartnerships, syncPushSettings, deleteOrganization, getLanguages, saveLanguages, deleteLanguage } from '../services/storage';
import { checkSupabaseConnection, isSupabaseConfigured, saveSupabaseConfig, getSupabaseConfig } from '../services/supabase';
import { SUPABASE_SCHEMA_SQL } from '../services/schemaTemplate';
import { translateDictionary } from '../services/geminiService';
import { Shield, Database, Layout, Settings, MapPin, Eye, Save, Copy, Check, AlertCircle, RefreshCw, UploadCloud, Code, FileText, X, Building2, EyeOff, LogIn, Trash2, Sparkles, Play, Globe, Star, Plus, Loader2, Lock, Unlock, ChevronDown, ChevronRight, Sprout, PawPrint, AlertTriangle, ExternalLink, PenLine, GripVertical } from 'lucide-react';
import { LanguageContext } from '../App';
import { SystemSettings, LandingFeature, Organization, LanguageConfig, Sex } from '../types';
import RichTextEditor from '../components/RichTextEditor';
import { BASE_TRANSLATIONS } from '../services/i18n';

const SuperAdmin: React.FC = () => {
  const { t, refreshTranslations } = useContext(LanguageContext);
  const [activeTab, setActiveTab] = useState<'overview' | 'database' | 'settings' | 'content' | 'languages'>('overview');
  
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
      terms: pagesConfig.terms
    };
    saveSystemSettings(updated);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 3000);
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
     const apiKey = settings.geminiApiKey || process.env.API_KEY;
     if (!apiKey) {
        alert("Gemini API Key is required. Configure it in Settings.");
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
           <button onClick={() => setActiveTab('settings')} className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap flex items-center gap-2 ${activeTab === 'settings' ? 'bg-purple-100 text-purple-700' : 'text-slate-600 hover:bg-slate-50'}`}><Settings size={16} /> {t('appSettings')}</button>
           <button onClick={() => setActiveTab('content')} className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap flex items-center gap-2 ${activeTab === 'content' ? 'bg-purple-100 text-purple-700' : 'text-slate-600 hover:bg-slate-50'}`}><Layout size={16} /> Content</button>
           <button onClick={() => setActiveTab('languages')} className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap flex items-center gap-2 ${activeTab === 'languages' ? 'bg-purple-100 text-purple-700' : 'text-slate-600 hover:bg-slate-50'}`}><Globe size={16} /> {t('manageLanguages')}</button>
        </div>
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="space-y-8 animate-in fade-in">
           {/* Organizations Table */}
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
                                      <button 
                                         onClick={() => handleToggleExpandOrg(org.id)}
                                         className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
                                      >
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
                                   <td className="px-6 py-4 text-sm text-slate-600 flex items-center gap-1">
                                      <MapPin size={14}/> {org.location}
                                   </td>
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
                                            <button 
                                               onClick={() => handleLoginAs(org.id, org as any)}
                                               className="bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900 text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1"
                                               title="Impersonate Organization"
                                            >
                                               <LogIn size={12} /> Login As
                                            </button>
                                            <button 
                                               onClick={() => triggerDeleteOrg(org.id, org.name)}
                                               className="bg-red-50 text-red-600 hover:bg-red-100 text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1 disabled:opacity-50"
                                               title="Delete Organization"
                                               disabled={isDeletingOrg === org.id}
                                            >
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
                                            <h4 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
                                               <Database size={14}/> Species Breakdown
                                            </h4>
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
            {/* ... Database UI unchanged ... */}
            <div className="space-y-6">
               <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                     <Database size={20} className="text-emerald-600" /> Connection Settings
                  </h3>
                  <div className="space-y-4">
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Supabase Project URL</label>
                        <input 
                           className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 bg-white text-slate-900 font-mono text-sm"
                           value={dbConfig.url}
                           onChange={e => setDbConfig({...dbConfig, url: e.target.value})}
                        />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Supabase Anon Key</label>
                        <input 
                           className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 bg-white text-slate-900 font-mono text-sm"
                           type="password"
                           value={dbConfig.key}
                           onChange={e => setDbConfig({...dbConfig, key: e.target.value})}
                        />
                     </div>
                     <div className="flex gap-2 pt-2">
                        <button onClick={handleSaveDbConfig} className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-emerald-700 flex items-center gap-2"><Save size={16} /> Save Credentials</button>
                        <button onClick={handleTestDb} disabled={isCheckingDb} className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-medium hover:bg-slate-50 flex items-center gap-2 disabled:opacity-50">{isCheckingDb ? <RefreshCw size={16} className="animate-spin"/> : <Play size={16} />} Test Connection</button>
                     </div>
                     {dbCheckResult && <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${dbCheckResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{dbCheckResult.success ? <Check size={16} /> : <AlertCircle size={16} />}{dbCheckResult.message}</div>}
                  </div>
               </div>
               
               <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
                     <Code size={20} className="text-slate-500" /> Database Setup
                  </h3>
                  <button onClick={() => setShowSchemaModal(true)} className="w-full bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-medium hover:bg-slate-100 shadow-sm flex items-center justify-center gap-2"><FileText size={16} /> View SQL Schema</button>
               </div>
            </div>

            <div className="space-y-6">
               <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4"><UploadCloud size={20} className="text-blue-600" /> Seed Database</h3>
                  <div className="flex-1 bg-slate-900 rounded-lg p-4 font-mono text-xs text-green-400 overflow-y-auto min-h-[200px] mb-4 shadow-inner border border-slate-700">
                     {seedLogs.length === 0 && <div className="text-slate-500 italic text-center mt-8">Ready to seed.</div>}
                     {seedLogs.map((log, i) => <div key={i} className="mb-1 border-b border-slate-800/50 pb-1">{log}</div>)}
                     {isSeeding && <div className="animate-pulse mt-2">_</div>}
                  </div>
                  <button onClick={handleSeedDatabase} disabled={isSeeding} className="w-full bg-blue-600 text-white px-4 py-3 rounded-lg font-bold hover:bg-blue-700 flex items-center justify-center gap-2 shadow-md disabled:opacity-50 disabled:cursor-not-allowed">{isSeeding ? <RefreshCw size={18} className="animate-spin" /> : <Database size={18} />}{isSeeding ? 'Seeding in progress...' : 'Populate / Seed Database'}</button>
               </div>
            </div>
         </div>
      )}

      {/* SETTINGS TAB */}
      {activeTab === 'settings' && (
         <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 p-6 animate-in fade-in">
            {/* ... Settings UI unchanged ... */}
            <h3 className="text-lg font-bold text-slate-900 mb-6">General Application Settings</h3>
            <form onSubmit={handleSaveSettings} className="space-y-6">
               <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Application Logo URL</label>
                  <input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900" value={settings.appLogoUrl || ''} onChange={e => setSettings({...settings, appLogoUrl: e.target.value})} placeholder="https://..." />
               </div>
               <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Primary Brand Color</label>
                  <div className="flex gap-2">
                     <input type="color" className="h-10 w-10 rounded cursor-pointer border border-slate-200" value={settings.themePrimaryColor} onChange={e => setSettings({...settings, themePrimaryColor: e.target.value})} />
                     <input className="flex-1 px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 font-mono" value={settings.themePrimaryColor} onChange={e => setSettings({...settings, themePrimaryColor: e.target.value})} />
                  </div>
               </div>
               
               <div className="border-t border-slate-100 pt-6">
                  <h4 className="text-md font-bold text-slate-800 mb-3 flex items-center gap-2"><Sparkles size={18}/> AI Integration</h4>
                  <div className="space-y-2">
                     <label className="text-sm font-medium text-slate-700">Gemini API Key</label>
                     <input 
                        type="password"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900" 
                        value={settings.geminiApiKey || ''} 
                        onChange={e => setSettings({...settings, geminiApiKey: e.target.value})}
                        placeholder="AIza..." 
                     />
                     <p className="text-xs text-slate-500">
                        Default: Uses <code>process.env.API_KEY</code>. Override here if needed.
                     </p>
                  </div>
               </div>

               <div className="flex justify-end pt-4">
                  <button type="submit" className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-emerald-700 flex items-center gap-2"><Save size={18} /> {settingsSaved ? 'Saved!' : 'Save Settings'}</button>
               </div>
            </form>
         </div>
      )}

      {/* CONTENT TAB */}
      {activeTab === 'content' && (
         <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in">
            {/* ... Content UI unchanged ... */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Landing Page Configuration</h3>
                <div className="space-y-6">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                         <label className="text-sm font-medium text-slate-700 mb-1 block">Hero Title</label>
                         <input 
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                            value={landingConfig.heroTitle || ''}
                            onChange={e => setLandingConfig({...landingConfig, heroTitle: e.target.value})}
                         />
                      </div>
                      <div>
                         <label className="text-sm font-medium text-slate-700 mb-1 block">Hero Subtitle</label>
                         <input 
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                            value={landingConfig.heroSubtitle || ''}
                            onChange={e => setLandingConfig({...landingConfig, heroSubtitle: e.target.value})}
                         />
                      </div>
                   </div>

                   {/* FEATURE TILES MANAGEMENT */}
                   <div className="border-t border-slate-100 pt-6">
                      <div className="flex justify-between items-center mb-4">
                         <h4 className="text-md font-bold text-slate-800 flex items-center gap-2"><Layout size={18}/> Feature Tiles</h4>
                         <button 
                           onClick={handleAddFeature}
                           className="text-sm bg-purple-50 text-purple-700 hover:bg-purple-100 px-3 py-1.5 rounded-lg font-medium flex items-center gap-1"
                         >
                           <Plus size={16} /> Add Tile
                         </button>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         {features.length === 0 && <p className="text-sm text-slate-400 italic p-4 border border-dashed rounded-lg text-center col-span-full">No feature tiles configured. Default tiles will be shown.</p>}
                         {features.map((feature, idx) => (
                            <div key={feature.id} className="p-4 bg-slate-50 border border-slate-200 rounded-lg relative group">
                               <div className="flex items-start gap-3">
                                  <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-slate-500 border border-slate-100 shadow-sm font-mono text-xs">
                                     {feature.icon}
                                  </div>
                                  <div className="flex-1">
                                     <h5 className="font-bold text-slate-900 text-sm">{feature.title}</h5>
                                     <p className="text-xs text-slate-500 mt-1 line-clamp-2">{feature.description}</p>
                                  </div>
                               </div>
                               <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => { setEditingFeature(feature); setShowFeatureForm(true); }} className="p-1 bg-white hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded border border-slate-200 shadow-sm"><PenLine size={12}/></button>
                                  <button onClick={() => handleDeleteFeature(feature.id)} className="p-1 bg-white hover:bg-red-50 text-slate-400 hover:text-red-600 rounded border border-slate-200 shadow-sm"><X size={12}/></button>
                               </div>
                            </div>
                         ))}
                      </div>
                   </div>
                   
                   <div className="border-t border-slate-100 pt-6">
                      <label className="text-sm font-bold text-slate-700 mb-2 block">Custom Content (Below Features)</label>
                      <RichTextEditor 
                         value={landingConfig.customContentHtml || ''}
                         onChange={val => setLandingConfig({...landingConfig, customContentHtml: val})}
                         height="200px"
                      />
                   </div>
                </div>
            </div>
            
            <div className="flex justify-end">
               <button 
                  onClick={handleSaveSettings}
                  className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-emerald-700 flex items-center gap-2 shadow-sm"
               >
                  <Save size={18} /> Save All Content
               </button>
            </div>
         </div>
      )}

      {/* LANGUAGES TAB */}
      {activeTab === 'languages' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-[700px] animate-in fade-in">
           {/* ... Languages UI unchanged ... */}
           <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <div>
                 <h3 className="text-lg font-bold text-slate-900">{t('manageLanguages')}</h3>
                 <p className="text-sm text-slate-500">Add or edit translations for the interface.</p>
              </div>
              <div className="flex gap-2">
                 <input 
                    className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-900 placeholder:text-slate-400 w-24" 
                    placeholder="Code (de)" 
                    value={newLangCode}
                    onChange={e => setNewLangCode(e.target.value)}
                    maxLength={5}
                 />
                 <input 
                    className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-900 placeholder:text-slate-400 w-32" 
                    placeholder="Name (German)" 
                    value={newLangName}
                    onChange={e => setNewLangName(e.target.value)}
                 />
                 <button 
                    onClick={handleAddLanguage} 
                    disabled={!newLangCode || isSavingLang} 
                    className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
                 >
                    {isSavingLang ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Add
                 </button>
              </div>
           </div>
           
           <div className="flex flex-1 overflow-hidden">
              {/* Sidebar List */}
              <div className="w-64 border-r border-slate-200 bg-slate-50 overflow-y-auto p-2">
                 {languages.map(lang => (
                    <div 
                       key={lang.code} 
                       className={`flex justify-between items-center p-3 rounded-lg cursor-pointer mb-1 transition-colors ${editingLang?.code === lang.code ? 'bg-white shadow text-purple-700 font-bold' : 'hover:bg-white text-slate-600'}`}
                       onClick={() => setEditingLang(lang)}
                    >
                       <div className="flex items-center gap-2">
                          <span>{lang.name}</span>
                          {lang.isDefault && <Star size={12} className="text-amber-500 fill-amber-500" />}
                       </div>
                       <div className="flex gap-1">
                          <button 
                             onClick={(e) => {e.stopPropagation(); triggerDeleteLang(lang.code, lang.name);}}
                             className="text-slate-400 hover:text-red-500 p-1"
                             disabled={lang.code === 'en-GB' || isSavingLang}
                          >
                             <Trash2 size={12} />
                          </button>
                       </div>
                    </div>
                 ))}
              </div>
              
              {/* Editor Area */}
              <div className="flex-1 flex flex-col overflow-hidden bg-white">
                 {editingLang ? (
                    <>
                       <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center flex-wrap gap-2">
                          <span className="font-bold text-slate-700 uppercase flex items-center gap-2">
                             <Globe size={16} /> {editingLang.name} <span className="text-xs text-slate-400 font-normal">({editingLang.code})</span>
                          </span>
                          <div className="flex gap-2">
                             {editingLang.code !== 'en-GB' && (
                                <button 
                                   onClick={handleAutoTranslate}
                                   disabled={isTranslating || isSavingLang}
                                   className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-purple-700 shadow-sm flex items-center gap-2 disabled:opacity-50"
                                >
                                   {isTranslating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} 
                                   <span className="hidden sm:inline">Auto-Translate</span>
                                </button>
                             )}
                             {!editingLang.isDefault && (
                                <button onClick={() => handleSetDefaultLanguage(editingLang.code)} className="text-sm text-slate-500 hover:text-amber-600 font-medium px-3 py-1 rounded bg-white border border-slate-200 hover:border-amber-200">
                                   Set as Default
                                </button>
                             )}
                             <button 
                                onClick={handleSaveTranslations} 
                                disabled={isSavingLang}
                                className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-bold hover:bg-blue-700 shadow-sm flex items-center gap-2 disabled:opacity-50"
                             >
                                {isSavingLang ? <Loader2 size={16} className="animate-spin" /> : <Save size={16}/>} Save
                             </button>
                          </div>
                       </div>
                       <div className="flex-1 overflow-y-auto p-0">
                          <table className="w-full text-left border-collapse">
                             <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                                <tr className="border-b border-slate-200 text-xs text-slate-500 uppercase font-semibold">
                                   <th className="py-3 px-4 w-1/3 bg-slate-50">Key</th>
                                   <th className="py-3 px-4 w-2/3 bg-slate-50">Translation</th>
                                </tr>
                             </thead>
                             <tbody className="divide-y divide-slate-100">
                                {Object.keys(BASE_TRANSLATIONS).map(key => {
                                   const isOverridden = editingLang.manualOverrides?.includes(key);
                                   return (
                                      <tr key={key} className="hover:bg-slate-50 group">
                                         <td className="py-3 px-4 font-mono text-xs text-slate-500 select-all">{key}</td>
                                         <td className="py-3 px-4 relative">
                                            <input 
                                               className={`w-full border rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none bg-white text-slate-900 shadow-sm ${isOverridden ? 'border-amber-300 ring-1 ring-amber-100' : 'border-slate-300'}`}
                                               value={editingLang.translations[key] || ''}
                                               onChange={e => handleUpdateTranslation(key, e.target.value)}
                                               placeholder={(BASE_TRANSLATIONS as any)[key]} 
                                            />
                                            {isOverridden && (
                                               <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                                  <span title="Manually Edited (Protected from Auto-Translate)">
                                                     <Lock size={12} className="text-amber-500" />
                                                  </span>
                                                  <button 
                                                     onClick={() => handleUnlockTranslation(key)}
                                                     className="text-slate-400 hover:text-slate-600 bg-white rounded-full p-0.5 shadow-sm border border-slate-200"
                                                     title="Unlock (Allow Auto-Translate)"
                                                  >
                                                     <Unlock size={12}/>
                                                  </button>
                                               </div>
                                            )}
                                         </td>
                                      </tr>
                                   );
                                })}
                             </tbody>
                          </table>
                       </div>
                    </>
                 ) : (
                    <div className="flex-1 flex items-center justify-center text-slate-400">
                       Select a language to edit translations
                    </div>
                 )}
              </div>
           </div>
        </div>
      )}

      {/* Feature Edit Modal */}
      {showFeatureForm && editingFeature && (
         <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 animate-in zoom-in duration-200">
               <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold text-slate-900">Edit Feature Card</h3>
                  <button onClick={() => setShowFeatureForm(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
               </div>
               
               <div className="space-y-4">
                  <div>
                     <label className="text-sm font-medium text-slate-700 block mb-1">Title</label>
                     <input 
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none" 
                        value={editingFeature.title} 
                        onChange={e => setEditingFeature({...editingFeature, title: e.target.value})} 
                        placeholder="Feature Title"
                     />
                  </div>
                  <div>
                     <label className="text-sm font-medium text-slate-700 block mb-1">Description</label>
                     <textarea 
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none" 
                        rows={3} 
                        value={editingFeature.description} 
                        onChange={e => setEditingFeature({...editingFeature, description: e.target.value})} 
                        placeholder="Short description..."
                     />
                  </div>
                  <div>
                     <div className="flex justify-between items-center mb-1">
                        <label className="text-sm font-medium text-slate-700">Icon Name</label>
                        <a href="https://lucide.dev/icons" target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                           Browse Icons <ExternalLink size={10}/>
                        </a>
                     </div>
                     <input 
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 font-mono text-sm focus:ring-2 focus:ring-emerald-500 outline-none" 
                        value={editingFeature.icon} 
                        onChange={e => setEditingFeature({...editingFeature, icon: e.target.value})} 
                        placeholder="e.g. Shield, Globe, Users" 
                     />
                     <p className="text-xs text-slate-500 mt-1">Must match a valid Lucide React icon name.</p>
                  </div>
               </div>
               <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
                  <button onClick={() => setShowFeatureForm(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                  <button onClick={handleUpdateFeature} className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-medium">Update</button>
               </div>
            </div>
         </div>
      )}

      {/* Schema Modal */}
      {showSchemaModal && (
         <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl flex flex-col max-h-[90vh]">
               <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2"><Database size={18}/> Supabase SQL Schema</h3>
                  <button onClick={() => setShowSchemaModal(false)}><X size={20} className="text-slate-400 hover:text-slate-600"/></button>
               </div>
               <div className="p-4 flex-1 overflow-hidden relative">
                  <textarea 
                     readOnly
                     className="w-full h-full bg-slate-900 text-green-400 font-mono text-xs p-4 rounded-lg resize-none focus:outline-none"
                     value={SUPABASE_SCHEMA_SQL}
                  />
                  <button 
                     onClick={() => { navigator.clipboard.writeText(SUPABASE_SCHEMA_SQL); alert("Copied to clipboard!"); }}
                     className="absolute top-6 right-6 bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg backdrop-blur"
                     title="Copy SQL"
                  >
                     <Copy size={16} />
                  </button>
               </div>
               <div className="p-4 border-t border-slate-100 text-right text-sm text-slate-500">
                  Copy this SQL and run it in the Supabase SQL Editor to create tables.
               </div>
            </div>
         </div>
      )}

      {/* Deletion Confirmation Modal */}
      {deleteTarget && (
         <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
               <div className="flex items-center gap-3 mb-4 text-red-600">
                  <div className="p-2 bg-red-100 rounded-full"><AlertTriangle size={24}/></div>
                  <h3 className="text-lg font-bold">Confirm Deletion</h3>
               </div>
               
               <p className="text-slate-600 mb-4">
                  You are about to permanently delete <strong>{deleteTarget.name}</strong>.
               </p>
               
               {deleteTarget.type === 'org' && (
                  <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100 mb-4">
                     This will soft-delete the organization and hide all associated data (projects, species, individuals) from the system.
                  </p>
               )}

               <div className="flex justify-end gap-3">
                  <button 
                     onClick={() => setDeleteTarget(null)}
                     className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                  >
                     Cancel
                  </button>
                  <button 
                     onClick={confirmDelete}
                     className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold shadow-sm flex items-center gap-2"
                  >
                     <Trash2 size={16} />
                     Yes, Delete
                  </button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default SuperAdmin;
