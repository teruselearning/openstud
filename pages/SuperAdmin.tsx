import React, { useContext, useState, useEffect, useMemo } from 'react';
import { getNetworkPartners, getUsers, switchOrganization, getSystemSettings, saveSystemSettings, getOrg, getLanguages, saveLanguages, permanentDeleteOrganization, clearLocalCache, getSpecies, getProjects, getIndividuals } from '../services/storage';
import { testSmtpConnection } from '../services/emailService';
import { translateDictionary } from '../services/geminiService';
import { 
  Shield, Save, Loader2, Globe, Star, Mail, PenTool, LogIn, CheckCircle2, 
  Send, AlertCircle, Trash2, X, RefreshCw, Plus, Layout, Palette, 
  Lock, FileText, Type, Image as ImageIcon, Sparkles, UserPlus, AlertTriangle, Wand2,
  Building2, Briefcase, MapPin, GripVertical, Info, Database, Zap, Check, Search,
  ChevronDown, ChevronRight, Dna, Users, Activity, Leaf, MessageSquare
} from 'lucide-react';
import { LanguageContext } from '../App';
import { SystemSettings, LanguageConfig, EmailTemplate, UserRole, StaticPageConfig, Organization, OrganizationFocus, LandingFeature, ExternalPartner, Project, Individual, Species, Sex } from '../types';
import RichTextEditor from '../components/RichTextEditor';
import { BASE_TRANSLATIONS } from '../services/i18n';

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

  const handleImpersonate = (orgId: string) => {
    const explicitOrg = allOrganizations.find(o => o.id === orgId);
    if (explicitOrg && switchOrganization(orgId, explicitOrg)) {
       window.location.hash = '/';
       window.location.reload();
    }
  };

  const handlePermanentlyDelete = async () => {
    if (!orgToDelete) return;
    setIsDeleting(true);
    try {
       await permanentDeleteOrganization(orgToDelete.id);
       setPartners(partners.filter(p => p.id !== orgToDelete.id));
       setOrgToDelete(null);
    } catch (e) {
       alert("Delete failed: " + e);
    } finally {
       setIsDeleting(false);
    }
  };

  const handleSaveLanguage = () => {
    if (!editingLang) return;
    setIsSavingLang(true);
    const updated = languages.map(l => l.code === editingLang.code ? editingLang : l);
    saveLanguages(updated);
    setLanguages(updated);
    refreshTranslations();
    setTimeout(() => { setIsSavingLang(false); setEditingLang(null); }, 500);
  };

  const handleAddLanguage = () => {
     if (!newLangCode || !newLangName) return;
     const newLang: LanguageConfig = {
        code: newLangCode,
        name: newLangName,
        translations: { ...BASE_TRANSLATIONS },
        isDefault: false
     };
     const updated = [...languages, newLang];
     setLanguages(updated);
     saveLanguages(updated);
     setNewLangCode(''); setNewLangName('');
     setEditingLang(newLang);
  };

  const handleAiTranslate = async () => {
     if (!editingLang) return;
     setIsAutoFilling(true);
     setAiFillSuccess(false);
     try {
        const results = await translateDictionary(BASE_TRANSLATIONS, editingLang.name);
        const newTranslations = { ...editingLang.translations };
        results.forEach(({ k, v }) => { newTranslations[k] = v; });
        setEditingLang({ ...editingLang, translations: newTranslations });
        setAiFillSuccess(true);
     } catch (e) { alert("AI Localisation failed: " + e); }
     finally { setIsAutoFilling(false); }
  };

  const filteredOrgs = allOrganizations.filter(o => 
     o.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
     o.location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredSpecies = allSpecies.filter(s => 
     s.commonName.toLowerCase().includes(searchQuery.toLowerCase()) || 
     s.scientificName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredTranslationKeys = useMemo(() => {
     if (!editingLang) return [];
     return Object.keys(BASE_TRANSLATIONS).filter(key => 
        key.toLowerCase().includes(translationSearch.toLowerCase()) || 
        BASE_TRANSLATIONS[key as keyof typeof BASE_TRANSLATIONS].toLowerCase().includes(translationSearch.toLowerCase())
     );
  }, [editingLang, translationSearch]);

  const getStatsForOrg = (orgId: string) => {
     const orgProjects = allProjects.filter(p => (p as any).orgId === orgId || (p as any).org_id === orgId);
     const orgProjectIds = orgProjects.map(p => p.id);
     const orgSpecies = allSpecies.filter(s => orgProjectIds.includes(s.projectId));
     const orgInds = allIndividuals.filter(i => orgProjectIds.includes(i.projectId));
     return { projectCount: orgProjects.length, speciesCount: orgSpecies.length, indCount: orgInds.length };
  };

  return (
    <div className="space-y-8 pb-12">
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

      {activeTab === 'overview' && (
         <div className="space-y-6 animate-in fade-in">
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
               <div className="flex bg-slate-100 p-1 rounded-lg">
                  <button onClick={() => setOverviewSubTab('organizations')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${overviewSubTab === 'organizations' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500'}`}>{t('allOrganizations')}</button>
                  <button onClick={() => setOverviewSubTab('species_browser')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${overviewSubTab === 'species_browser' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500'}`}>Species Directory</button>
               </div>
               <div className="relative flex-1 max-w-md w-full">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" placeholder={overviewSubTab === 'organizations' ? t('searchName') : "Search species catalog..."} className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-200 outline-none" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
               </div>
               <button className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md transition-all whitespace-nowrap"><Plus size={18}/> {t('createOrgBtn')}</button>
            </div>

            {overviewSubTab === 'organizations' && (
               <div className="grid gap-4">
                  {filteredOrgs.map(org => {
                     const stats = getStatsForOrg(org.id);
                     const isExpanded = expandedOrgId === org.id;
                     return (
                        <div key={org.id} className={`bg-white rounded-2xl border transition-all duration-300 ${isExpanded ? 'border-purple-300 ring-4 ring-purple-50 shadow-xl' : 'border-slate-200 shadow-sm hover:shadow-md'}`}>
                           <div className="p-6 flex flex-col md:flex-row justify-between items-center gap-6">
                              <div className="flex items-center gap-5 flex-1 w-full">
                                 <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${org.id === myOrg?.id ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}>
                                    {org.id === myOrg?.id ? <Star size={28} /> : <Building2 size={28} />}
                                 </div>
                                 <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                       <h3 className="text-lg font-extrabold text-slate-900 truncate">{org.name}</h3>
                                       {org.id === myOrg?.id && <span className="bg-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest">{t('hostTag')}</span>}
                                       <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest ${org.focus === 'Flora' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{org.focus}</span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 font-medium">
                                       <span className="flex items-center gap-1.5"><MapPin size={14} className="text-slate-400" /> {org.location || 'No Location Set'}</span>
                                       <span className="flex items-center gap-1.5"><Users size={14} className="text-slate-400" /> Member of Network</span>
                                    </div>
                                 </div>
                                 <div className="hidden lg:grid grid-cols-3 gap-6 px-6 border-x border-slate-100">
                                    <div className="text-center"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">Projects</p><p className="text-lg font-black text-slate-800">{stats.projectCount}</p></div>
                                    <div className="text-center"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">Species</p><p className="text-lg font-black text-slate-800">{stats.speciesCount}</p></div>
                                    <div className="text-center"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">Indivs</p><p className="text-lg font-black text-slate-800">{stats.indCount}</p></div>
                                 </div>
                              </div>
                              <div className="flex gap-2 w-full md:w-auto">
                                 <button onClick={() => setExpandedOrgId(isExpanded ? null : org.id)} className="flex-1 md:flex-none p-2.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-all" title="View Details"><Info size={20} /></button>
                                 <button onClick={() => handleImpersonate(org.id)} className="flex-[2] md:flex-none flex items-center justify-center gap-2 bg-slate-900 hover:bg-black text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all"><LogIn size={18} /> {t('loginAs')}</button>
                                 {org.id !== myOrg?.id && (<button onClick={() => setOrgToDelete(org as Organization)} className="flex-1 md:flex-none p-2.5 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"><Trash2 size={20} /></button>)}
                              </div>
                           </div>
                           {isExpanded && (
                              <div className="px-6 pb-6 pt-2 animate-in slide-in-from-top-2">
                                 <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                                    <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Briefcase size={16} className="text-purple-600"/> Organization Details</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                       <div><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">ID Ref</p><p className="text-xs font-mono text-slate-600 break-all">{org.id}</p></div>
                                       <div><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Public Access</p><div className="flex gap-2">{org.isOrgPublic ? <span className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-0.5 rounded font-black">DIR LISTED</span> : <span className="bg-slate-200 text-slate-500 text-[10px] px-2 py-0.5 rounded font-black">PRIVATE</span>} {org.allowBreedingRequests && <span className="bg-purple-100 text-purple-700 text-[10px] px-2 py-0.5 rounded font-black">NETWORK</span>}</div></div>
                                       <div><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Coordinates</p><p className="text-xs font-medium text-slate-600">{org.latitude ? `${org.latitude.toFixed(4)}, ${org.longitude?.toFixed(4)}` : 'N/A'}</p></div>
                                       <div className="lg:col-span-1 flex items-end justify-end"><button onClick={() => clearLocalCache()} className="text-xs font-bold text-slate-400 hover:text-red-600 transition-colors flex items-center gap-1.5 uppercase tracking-widest"><RefreshCw size={12}/> Refresh Sync</button></div>
                                    </div>
                                 </div>
                              </div>
                           )}
                        </div>
                     );
                  })}
               </div>
            )}

            {overviewSubTab === 'species_browser' && (
               <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                  <table className="w-full text-left">
                     <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                           <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Species Info</th>
                           <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                           <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Managed By</th>
                           <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Global Population</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100">
                        {filteredSpecies.map(sp => {
                           const project = allProjects.find(p => p.id === sp.projectId);
                           const org = allOrganizations.find(o => o.id === (project as any)?.org_id || (project as any)?.orgId);
                           const indCount = allIndividuals.filter(i => i.speciesId === sp.id).length;
                           
                           return (
                              <tr key={sp.id} className="hover:bg-slate-50 transition-colors group">
                                 <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                       <div className="w-10 h-10 bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                                          {sp.imageUrl ? <img src={sp.imageUrl} className="w-full h-full object-cover" /> : <Dna className="w-full h-full p-2 text-slate-300" />}
                                       </div>
                                       <div>
                                          <p className="font-bold text-slate-900">{sp.commonName}</p>
                                          <p className="text-[10px] text-slate-500 italic font-serif">{sp.scientificName}</p>
                                       </div>
                                    </div>
                                 </td>
                                 <td className="px-6 py-4">
                                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest border ${sp.type === 'Animal' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>{sp.type}</span>
                                 </td>
                                 <td className="px-6 py-4">
                                    <div className="flex flex-col">
                                       <p className="text-xs font-bold text-slate-700">{org?.name || 'Unknown Org'}</p>
                                       <p className="text-[10px] text-slate-400 flex items-center gap-1"><Briefcase size={10}/> {project?.name}</p>
                                    </div>
                                 </td>
                                 <td className="px-6 py-4 text-center">
                                    <div className="inline-flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-lg">
                                       <Activity size={14} className="text-slate-400"/>
                                       <span className="text-sm font-black text-slate-700">{indCount}</span>
                                    </div>
                                 </td>
                              </tr>
                           );
                        })}
                        {filteredSpecies.length === 0 && (
                           <tr>
                              <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">No global species records found.</td>
                           </tr>
                        )}
                     </tbody>
                  </table>
               </div>
            )}
         </div>
      )}

      {activeTab === 'email' && (
         <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 animate-in fade-in">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 flex flex-col h-fit">
               <div className="flex items-center gap-3 mb-2 border-b border-slate-50 pb-4">
                  <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg"><Mail size={20}/></div>
                  <h3 className="font-extrabold text-lg text-slate-900">{t('smtpSettings')}</h3>
               </div>
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">{t('smtpHost')}</label><input className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm" placeholder="smtp.postmarkapp.com" value={settings.smtpHost} onChange={e => setSettings({...settings, smtpHost: e.target.value})} /></div>
                  <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">{t('port')}</label><input type="number" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm" placeholder="587" value={settings.smtpPort} onChange={e => setSettings({...settings, smtpPort: parseInt(e.target.value)})} /></div>
                  <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">{t('username')}</label><input className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm" placeholder="api-key-here" value={settings.smtpUser} onChange={e => setSettings({...settings, smtpUser: e.target.value})} /></div>
                  <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">{t('password')}</label><input type="password" placeholder="••••••••" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm" value={settings.smtpPass} onChange={e => setSettings({...settings, smtpPass: e.target.value})} /></div>
               </div>
               <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer py-2"><input type="checkbox" className="rounded text-emerald-600" checked={settings.smtpSecure} onChange={e => setSettings({...settings, smtpSecure: e.target.checked})} /> {t('secureConnection')}</label>
               
               <div className="pt-4 mt-2 border-t border-slate-50">
                  <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-3">SMTP Connectivity Test</h4>
                  <div className="flex gap-2">
                     <input type="email" placeholder="test@recipient.com" className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-200" value={testEmail} onChange={e => setTestEmail(e.target.value)} />
                     <button onClick={handleRunSmtpTest} disabled={isTestingSmtp || !testEmail} className="bg-slate-900 hover:bg-black text-white px-6 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-50">
                        {isTestingSmtp ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />} Send Test
                     </button>
                  </div>
                  {testResult && (
                     <div className={`mt-3 p-3 rounded-xl flex items-start gap-2 animate-in slide-in-from-top-2 ${testResult.success ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                        {testResult.success ? <CheckCircle2 size={18} className="mt-0.5" /> : <AlertTriangle size={18} className="mt-0.5" />}
                        <p className="text-xs font-medium leading-relaxed">{testResult.message}</p>
                     </div>
                  )}
               </div>
               <button onClick={handleSaveAllSettings} className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-100 transition-all">
                  {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />} {t('saveSettings')}
               </button>
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
                  <div className="flex items-center justify-between">
                     <label className="text-xs font-bold text-slate-500 uppercase">Subject Line</label>
                     <label className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase"><input type="checkbox" className="rounded" checked={editingTemplate.enabled} onChange={e => setEditingTemplate({...editingTemplate, enabled: e.target.checked})} /> Enabled</label>
                  </div>
                  <input className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold" value={editingTemplate.subject} onChange={e => setEditingTemplate({...editingTemplate, subject: e.target.value})} />
                  <div className="flex-1 flex flex-col min-h-[300px]">
                     <label className="text-xs font-bold text-slate-500 uppercase mb-2">HTML Body Content</label>
                     <RichTextEditor value={editingTemplate.bodyHtml} onChange={val => setEditingTemplate({...editingTemplate, bodyHtml: val})} height="350px" />
                  </div>
                  <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100 mt-2">
                     <p className="text-[10px] font-bold text-indigo-700 uppercase mb-1">Available Merge Tags</p>
                     <div className="flex flex-wrap gap-2"><code className="text-[10px] bg-white text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-200">{"{{orgName}}"}</code><code className="text-[10px] bg-white text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-200">{"{{userName}}"}</code><code className="text-[10px] bg-white text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-200">{"{{code}}"}</code><code className="text-[10px] bg-white text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-200">{"{{inviteUrl}}"}</code><code className="text-[10px] bg-white text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-200">{"{{year}}"}</code></div>
                  </div>
               </div>
            </div>
         </div>
      )}

      {activeTab === 'security' && (
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
               <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                  <div className="p-2 bg-red-100 text-red-600 rounded-lg"><Shield size={20}/></div>
                  <h3 className="font-extrabold text-lg text-slate-900">{t('securitySettings')}</h3>
               </div>
               <div className="space-y-6">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                     <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                           <div className="p-2 bg-white rounded-lg border border-slate-200"><Star size={20} className="text-amber-500" /></div>
                           <div><h4 className="font-bold text-slate-900 text-sm">Google reCAPTCHA v2</h4><p className="text-xs text-slate-500">Protect login and registration from bots.</p></div>
                        </div>
                     </div>
                     <div className="space-y-4">
                        <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">{t('siteKey')}</label><input className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-mono" placeholder="6LeIxAcTAAAAAJc..." value={settings.recaptchaSiteKey || ''} onChange={e => setSettings({...settings, recaptchaSiteKey: e.target.value})} /></div>
                        <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">{t('secretKey')}</label><input type="password" placeholder="••••••••" className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-mono" value={settings.recaptchaSecretKey || ''} onChange={e => setSettings({...settings, recaptchaSecretKey: e.target.value})} /></div>
                     </div>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-slate-900 rounded-2xl text-white shadow-lg">
                     <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/10 rounded-xl"><Lock size={20} className="text-emerald-400" /></div>
                        <div><h4 className="font-bold text-sm">{t('enableMfa')}</h4><p className="text-[10px] text-slate-400 font-medium">Force security codes globally.</p></div>
                     </div>
                     <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={settings.enableMfa || false} onChange={e => setSettings({...settings, enableMfa: e.target.checked})} />
                        <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                     </label>
                  </div>
               </div>
               <button onClick={handleSaveAllSettings} className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-100 transition-all">
                  {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />} {t('saveSettings')}
               </button>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center items-center text-center space-y-4">
                <div className="w-20 h-20 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mb-2"><Database size={40} /></div>
                <h3 className="font-extrabold text-xl text-slate-900">{t('cacheManage')}</h3>
                <p className="text-slate-500 text-sm max-w-xs">Purge the offline local cache. This will force all browsers to re-download the latest data from the backend.</p>
                <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 flex gap-3 text-left">
                   <AlertTriangle className="text-amber-600 flex-shrink-0" size={20} />
                   <p className="text-xs text-amber-800 leading-relaxed">Warning: This affects all users. Data currently in sync buffers may be lost if not committed.</p>
                </div>
                <button onClick={() => { if(confirm("Force re-sync and clear local data?")) clearLocalCache(); }} className="px-8 py-3 bg-white border-2 border-slate-900 text-slate-900 hover:bg-slate-900 hover:text-white rounded-xl font-bold transition-all flex items-center gap-2"><RefreshCw size={18}/> {t('clearCacheBtn')}</button>
            </div>
         </div>
      )}

      {activeTab === 'settings' && (
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
               <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                  <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><Palette size={20}/></div>
                  <h3 className="font-extrabold text-lg text-slate-900">{t('theming')}</h3>
               </div>
               <div className="space-y-4">
                  <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">{t('primaryColor')}</label><div className="flex gap-4 items-center"><input type="color" className="w-12 h-12 rounded-lg cursor-pointer bg-transparent" value={settings.themePrimaryColor} onChange={e => setSettings({...settings, themePrimaryColor: e.target.value})} /><input className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono" value={settings.themePrimaryColor} onChange={e => setSettings({...settings, themePrimaryColor: e.target.value})} /></div></div>
                  <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">{t('appLogo')}</label><div className="flex items-center gap-4"><div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center overflow-hidden border border-slate-200">{settings.appLogoUrl ? <img src={settings.appLogoUrl} className="w-full h-full object-contain" /> : <ImageIcon size={32} className="text-slate-300" />}</div><label className="flex-1 px-4 py-3 bg-slate-900 hover:bg-black text-white text-center rounded-xl text-xs font-bold cursor-pointer transition-all uppercase tracking-widest">{t('uploadLogo')}<input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if(f) { const r = new FileReader(); r.onload = () => setSettings({...settings, appLogoUrl: r.result as string}); r.readAsDataURL(f); } }} /></label></div></div>
                  <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">{t('customCss')}</label><textarea className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono" rows={5} placeholder=".text-custom { ... }" value={settings.customCss} onChange={e => setSettings({...settings, customCss: e.target.value})} /></div>
               </div>
               <button onClick={handleSaveAllSettings} className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-100 transition-all">
                  {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />} {t('saveSettings')}
               </button>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
               <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                  <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><Layout size={20}/></div>
                  <h3 className="font-extrabold text-lg text-slate-900">Landing Page Editor</h3>
               </div>
               <div className="space-y-4">
                  <div className="space-y-1 border-b border-slate-50 pb-4">
                     <div className="flex items-center justify-between">
                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2"><UserPlus size={16} className="text-indigo-500"/> {t('enableRegistration')}</label>
                        <label className="relative inline-flex items-center cursor-pointer">
                           <input type="checkbox" className="sr-only peer" checked={settings.enableRegistration !== false} onChange={e => setSettings({...settings, enableRegistration: e.target.checked})} />
                           <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                        </label>
                     </div>
                  </div>
                  
                  <div className="space-y-1">
                     <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><MessageSquare size={14} className="text-blue-500"/> Registration Banner Message</label>
                     <textarea className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium" rows={3} placeholder="Important note: This is where you set up a new organisation..." value={settings.landingPageConfig?.registrationBanner || ''} onChange={e => setSettings({...settings, landingPageConfig: { ...settings.landingPageConfig, registrationBanner: e.target.value }})} />
                     <p className="text-[10px] text-slate-400 italic">This message appears at the top of the organization registration form.</p>
                  </div>

                  <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">{t('heroTitle')}</label><input className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold" value={settings.landingPageConfig?.heroTitle || ''} onChange={e => setSettings({...settings, landingPageConfig: { ...settings.landingPageConfig, heroTitle: e.target.value }})} /></div>
                  <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">{t('heroSubtitle')}</label><textarea className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium" rows={3} value={settings.landingPageConfig?.heroSubtitle || ''} onChange={e => setSettings({...settings, landingPageConfig: { ...settings.landingPageConfig, heroSubtitle: e.target.value }})} /></div>
                  
                  <div className="space-y-3 pt-4 border-t border-slate-50">
                     <div className="flex justify-between items-center"><h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">{t('featureCards')}</h4><button onClick={handleAddFeature} className="text-xs font-bold text-emerald-600 hover:underline flex items-center gap-1"><Plus size={14}/> {t('add')}</button></div>
                     <div className="space-y-3">
                        {(settings.landingPageConfig?.features || []).map(f => (
                           <div key={f.id} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                              <div className="flex justify-between items-center"><div className="flex items-center gap-2 text-slate-400 cursor-move"><GripVertical size={16}/><span className="text-[10px] font-black uppercase tracking-widest">Card ID: {f.id.split('-')[1] || 'Default'}</span></div><button onClick={() => handleRemoveFeature(f.id)} className="p-1 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded transition-colors"><X size={16}/></button></div>
                              <div className="grid grid-cols-2 gap-3"><input className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold" placeholder="Title" value={f.title} onChange={e => handleUpdateFeature(f.id, 'title', e.target.value)} /><input className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono" placeholder="Lucide Icon Name" value={f.icon} onChange={e => handleUpdateFeature(f.id, 'icon', e.target.value)} /></div>
                              <textarea className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs" placeholder="Description" rows={2} value={f.description} onChange={e => handleUpdateFeature(f.id, 'description', e.target.value)} />
                           </div>
                        ))}
                     </div>
                  </div>
                  <div className="space-y-3 pt-4 border-t border-slate-50">
                     <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">{t('staticPages')}</h4>
                     {['aboutPage', 'privacyPage', 'termsPage'].map(pKey => {
                        const pg = settings[pKey as keyof SystemSettings] as StaticPageConfig;
                        return (
                           <div key={pKey} className="space-y-2 border-b border-slate-50 pb-4 last:border-0">
                              <div className="flex items-center justify-between"><div className="flex items-center gap-2"><div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg"><FileText size={14}/></div><span className="text-xs font-bold text-slate-700">{pg.title || pKey}</span></div><label className="relative inline-flex items-center cursor-pointer scale-75"><input type="checkbox" className="sr-only peer" checked={pg.enabled} onChange={e => setSettings({...settings, [pKey]: { ...pg, enabled: e.target.checked }})} /><div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div></label></div>
                              {pg.enabled && (<div className="space-y-2 animate-in slide-in-from-top-1"><input className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold" placeholder="Custom Page Title" value={pg.title} onChange={e => setSettings({...settings, [pKey]: { ...pg, title: e.target.value }})} /><RichTextEditor value={pg.contentHtml} onChange={v => setSettings({...settings, [pKey]: { ...pg, contentHtml: v }})} height="150px" /></div>)}
                           </div>
                        );
                     })}
                  </div>
               </div>
               <button onClick={handleSaveAllSettings} className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-100 transition-all">
                  {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />} {t('saveSettings')}
               </button>
            </div>
         </div>
      )}

      {activeTab === 'languages' && (
         <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in">
            <div className="lg:col-span-4 space-y-6">
               <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4">
                  <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                     <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><Globe size={20}/></div>
                     <h3 className="font-extrabold text-lg text-slate-900">{t('supportedLanguages')}</h3>
                  </div>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 scrollbar-hide">
                     {languages.map(lang => (
                        <div key={lang.code} className={`p-4 rounded-xl border transition-all flex items-center justify-between cursor-pointer group ${editingLang?.code === lang.code ? 'bg-blue-600 border-blue-500 text-white shadow-lg' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-white hover:border-blue-300'}`} onClick={() => { setEditingLang(lang); setAiFillSuccess(false); }}>
                           <div className="flex items-center gap-3">
                              <span className="text-xl">{lang.code.includes('-') ? '🌐' : '🏳️'}</span>
                              <div className="flex flex-col">
                                 <span className="font-bold text-sm leading-tight">{lang.name}</span>
                                 <span className={`text-[10px] font-mono leading-tight ${editingLang?.code === lang.code ? 'text-blue-100' : 'text-slate-400'}`}>{lang.code}</span>
                              </div>
                           </div>
                           {lang.isDefault && (<span className={`text-[9px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded ${editingLang?.code === lang.code ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-600'}`}>DEFAULT</span>)}
                        </div>
                     ))}
                  </div>
                  <div className="pt-4 mt-2 border-t border-slate-50 space-y-3">
                     <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('addLanguage')}</h4>
                     <div className="grid grid-cols-2 gap-2"><input className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono" placeholder="Code (fr-CA)" value={newLangCode} onChange={e => setNewLangCode(e.target.value)} /><input className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" placeholder="Name (French)" value={newLangName} onChange={e => setNewLangName(e.target.value)} /></div>
                     <button onClick={handleAddLanguage} disabled={!newLangCode || !newLangName} className="w-full bg-slate-900 hover:bg-black text-white py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50">+ Create Language Profile</button>
                  </div>
               </div>
            </div>

            <div className="lg:col-span-8">
               {editingLang ? (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full min-h-[700px]">
                     <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center rounded-t-2xl">
                        <div className="flex items-center gap-4">
                           <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-2xl shadow-sm border border-slate-200">🏳️</div>
                           <div><h3 className="font-extrabold text-xl text-slate-900">{editingLang.name}</h3><p className="text-xs text-slate-500 font-medium">Localisation Dictionary for {editingLang.code}</p></div>
                        </div>
                        <div className="flex gap-2">
                           <button onClick={handleAiTranslate} disabled={isAutoFilling} className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-purple-100 transition-all disabled:opacity-50">
                              {isAutoFilling ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} {aiFillSuccess ? 'Dictionary Merged!' : 'Localise via Gemini AI'}
                           </button>
                           <button onClick={handleSaveLanguage} className="bg-slate-900 hover:bg-black text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg transition-all">
                              {isSavingLang ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Save Changes
                           </button>
                        </div>
                     </div>
                     <div className="p-4 bg-white border-b border-slate-50 flex gap-4 items-center">
                        <div className="relative flex-1">
                           <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                           <input className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-xs" placeholder="Search dictionary keys or English values..." value={translationSearch} onChange={e => setTranslationSearch(e.target.value)} />
                        </div>
                        <label className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase cursor-pointer"><input type="checkbox" className="rounded" checked={editingLang.isDefault} onChange={e => setEditingLang({...editingLang, isDefault: e.target.checked})} /> Set as System Default</label>
                     </div>
                     <div className="flex-1 overflow-y-auto p-6 space-y-4 max-h-[600px] scrollbar-hide">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                           {filteredTranslationKeys.map(key => (
                              <div key={key} className="space-y-1 group">
                                 <div className="flex justify-between items-center"><label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter truncate max-w-[150px]">{key}</label><span className="text-[9px] text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">ENG: {BASE_TRANSLATIONS[key as keyof typeof BASE_TRANSLATIONS].substring(0,25)}...</span></div>
                                 <textarea className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none transition-all" rows={1} value={editingLang.translations[key] || ''} onChange={e => { const updated = { ...editingLang.translations, [key]: e.target.value }; setEditingLang({ ...editingLang, translations: updated }); }} />
                              </div>
                           ))}
                        </div>
                     </div>
                  </div>
               ) : (
                  <div className="bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 h-full flex flex-col items-center justify-center p-12 text-center text-slate-400 min-h-[700px]">
                     <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-sm mb-6 border border-slate-100"><Globe size={40} className="opacity-20" /></div>
                     <h3 className="font-bold text-slate-900 mb-2">Localisation Hub</h3>
                     <p className="max-w-xs text-sm leading-relaxed">Select a language profile to start editing translations or use AI to generate a complete dictionary automatically.</p>
                  </div>
               )}
            </div>
         </div>
      )}

      {/* Permanently Delete Organization Modal */}
      {orgToDelete && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[3000] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-md p-8 text-center animate-in zoom-in duration-200 border-2 border-red-500">
               <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6"><AlertTriangle size={48}/></div>
               <h3 className="text-2xl font-black text-slate-900 mb-2">Permanent Removal</h3>
               <p className="text-slate-500 mb-8 leading-relaxed">This action will permanently destroy <strong>{orgToDelete.name}</strong> and all its associated species, individuals, and user accounts. This cannot be undone.</p>
               <div className="flex gap-3">
                  <button onClick={() => setOrgToDelete(null)} className="flex-1 py-3 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition-all">Cancel</button>
                  <button onClick={handlePermanentlyDelete} disabled={isDeleting} className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold shadow-lg shadow-red-100 transition-all flex items-center justify-center gap-2">
                     {isDeleting ? <Loader2 size={20} className="animate-spin" /> : <Trash2 size={20} />} Confirm Destruction
                  </button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default SuperAdmin;