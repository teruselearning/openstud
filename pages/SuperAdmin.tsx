import { useContext, useState, useEffect } from 'react';
import { getNetworkPartners, getUsers, switchOrganization, getSystemSettings, saveSystemSettings, getOrg, getProjects, getIndividuals, getBreedingEvents, getBreedingLoans, getPartnerships, getSpecies, syncPushOrg, syncPushUsers, syncPushProjects, syncPushSpecies, syncPushIndividuals, syncPushBreedingEvents, syncPushBreedingLoans, syncPushPartnerships, syncPushSettings, deleteOrganization, getLanguages, saveLanguages, deleteLanguage } from '../services/storage';
import { checkSupabaseConnection, isSupabaseConfigured, saveSupabaseConfig, getSupabaseConfig } from '../services/supabase';
import { SUPABASE_SCHEMA_SQL } from '../services/schemaTemplate';
import { translateDictionary } from '../services/geminiService';
import { testSmtpConnection } from '../services/emailService';
import * as LucideIcons from 'lucide-react';
import { Shield, Database, Layout, Settings, MapPin, Eye, Save, Copy, Check, AlertCircle, RefreshCw, UploadCloud, Code, FileText, X, Building2, EyeOff, LogIn, Trash2, Sparkles, Play, Globe, Star, Plus, Loader2, Lock, Unlock, ChevronDown, ChevronRight, Sprout, PawPrint, AlertTriangle, ExternalLink, PenLine, GripVertical, Mail, PenTool, Send, Palette, Image as ImageIcon, LayoutTemplate, HelpCircle, Monitor, Pencil, Sparkle, BrainCircuit, BarChart3 } from 'lucide-react';
import { LanguageContext } from '../App';
import { SystemSettings, LandingFeature, Organization, LanguageConfig, Sex, EmailTemplate, StaticPageConfig } from '../types';
import RichTextEditor from '../components/RichTextEditor';
import { BASE_TRANSLATIONS } from '../services/i18n';
import React from 'react';

const SuperAdmin: React.FC = () => {
  const { t, refreshTranslations } = useContext(LanguageContext);
  const [activeTab, setActiveTab] = useState<'overview' | 'database' | 'settings' | 'content' | 'languages' | 'email'>('overview');
  
  // Data Stats
  const partners = getNetworkPartners();
  const myOrg = getOrg();
  const allOrganizations = [myOrg, ...(partners || [])].filter(Boolean);

  // Database State
  const [dbConfig, setDbConfig] = useState(getSupabaseConfig());
  const [dbCheckResult, setDbCheckResult] = useState<{success: boolean, message: string} | null>(null);
  const [isCheckingDb, setIsCheckingDb] = useState(false);
  const [seedLogs, setSeedLogs] = useState<string[]>([]);
  const [isSeeding, setIsSeeding] = useState(false);
  const [showSchemaModal, setShowSchemaModal] = useState(false);

  // AI Key Status Check
  const aiKeyDetected = !!(typeof process !== 'undefined' && process.env?.API_KEY && process.env.API_KEY !== 'undefined' && process.env.API_KEY !== '');

  // Org Expansion State
  const [expandedOrgId, setExpandedOrgId] = useState<string | null>(null);
  const [orgBreakdown, setOrgBreakdown] = useState<any[]>([]);

  // Usage Limit Modal
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [orgToLimit, setOrgToLimit] = useState<Organization | null>(null);
  const [newLimit, setNewLimit] = useState(100);

  // Settings State
  const [settings, setSettings] = useState<SystemSettings>(getSystemSettings());
  const [landingConfig, setLandingConfig] = useState(settings.landingPageConfig || {});
  const [pagesConfig, setPagesConfig] = useState({
     about: settings.aboutPage || { enabled: true, title: 'About', contentHtml: '' },
     privacy: settings.privacyPage || { enabled: true, title: 'Privacy', contentHtml: '' },
     terms: settings.termsPage || { enabled: true, title: 'Terms', contentHtml: '' }
  });
  
  // Email State
  const [testEmail, setTestEmail] = useState('');
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('registration');
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

  // Static Pages Selection
  const [selectedPage, setSelectedPage] = useState<'about' | 'privacy' | 'terms'>('about');

  useEffect(() => {
    const current = getSystemSettings();
    setSettings(current);
    setLandingConfig(current.landingPageConfig || {});
    setFeatures(current.landingPageConfig?.features || []);
    setPagesConfig({
       about: current.aboutPage || { enabled: true, title: 'About', contentHtml: '' },
       privacy: current.privacyPage || { enabled: true, title: 'Privacy', contentHtml: '' },
       terms: current.termsPage || { enabled: true, title: 'Terms', contentHtml: '' }
    });
    setDbConfig(getSupabaseConfig());
    setLanguages(getLanguages());
    
    // Ensure we have a default template for the prefilled UI
    const defaultTpl = current.emailTemplates?.[selectedTemplate] || {
        subject: selectedTemplate === 'registration' ? 'Verify your OpenStudbook account' : '',
        bodyHtml: selectedTemplate === 'registration' ? 'Your code: {{code}}' : '',
        enabled: true
    };
    setEditingTemplate(defaultTpl);
  }, []);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: SystemSettings = {
      ...settings,
      landingPageConfig: { ...landingConfig, features: features },
      aboutPage: pagesConfig.about,
      privacyPage: pagesConfig.privacy,
      termsPage: pagesConfig.terms,
      emailTemplates: {
         ...settings.emailTemplates,
         [selectedTemplate]: editingTemplate || settings.emailTemplates?.[selectedTemplate]
      }
    };
    saveSystemSettings(updated);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 3000);
  };
  
  const handleTemplateChange = (type: string) => {
     if (editingTemplate) {
        setSettings(prev => ({
           ...prev,
           emailTemplates: { ...prev.emailTemplates, [selectedTemplate]: editingTemplate }
        }));
     }
     setSelectedTemplate(type);
     const nextTpl = settings.emailTemplates?.[type] || { subject: '', bodyHtml: '', enabled: true };
     setEditingTemplate(nextTpl);
  };

  const handleLoginAs = (orgId: string, orgObj: Organization) => {
     if(switchOrganization(orgId, orgObj)) window.location.reload();
  };
  
  const triggerDeleteOrg = (orgId: string, orgName: string) => {
     setDeleteTarget({ type: 'org', id: orgId, name: orgName });
  };

  const triggerDeleteLang = (code: string, name: string) => {
     setDeleteTarget({ type: 'lang', id: code, name: name });
  };

  const confirmDelete = async () => {
     if (!deleteTarget) return;
     if (deleteTarget.type === 'org') {
        setIsDeletingOrg(deleteTarget.id);
        try {
           await deleteOrganization(deleteTarget.id);
           setDeleteTarget(null);
           window.location.reload();
        } catch (e) {
           alert("Failed to delete organization.");
        } finally {
           setIsDeletingOrg(null);
        }
     } else {
        try {
           await deleteLanguage(deleteTarget.id);
           setLanguages(getLanguages());
           setDeleteTarget(null);
           refreshTranslations();
        } catch (e) {
           alert("Failed to delete language.");
        }
     }
  };

  const handleToggleExpandOrg = (orgId: string) => {
     if (expandedOrgId === orgId) {
        setExpandedOrgId(null);
        setOrgBreakdown([]);
     } else {
        setExpandedOrgId(orgId);
        const allProjects = getProjects();
        const allSpecies = getSpecies();
        const allIndividuals = getIndividuals();
        const orgProjectIds = allProjects.filter(p => (p.orgId || (p as any).org_id) === orgId).map(p => p.id);
        const orgSpecies = allSpecies.filter(s => orgProjectIds.includes(s.projectId));
        const breakdown = orgSpecies.map(s => {
           const inds = allIndividuals.filter(i => i.speciesId === s.id && !i.isDeceased);
           const m = inds.filter(i => i.sex === Sex.MALE).length;
           const f = inds.filter(i => i.sex === Sex.FEMALE).length;
           const u = inds.filter(i => i.sex === Sex.UNKNOWN || !i.sex).length;
           return { id: s.id, name: s.commonName, scientific: s.scientificName, type: s.type, count: `${m}.${f}.${u}` };
        });
        setOrgBreakdown(breakdown);
     }
  };

  // Fix for SuperAdmin.tsx: Added missing handleUpdateTranslation function
  const handleUpdateTranslation = (key: string, value: string) => {
    if (!editingLang) return;
    setEditingLang({
      ...editingLang,
      translations: {
        ...editingLang.translations,
        [key]: value
      }
    });
  };

  // Fix for SuperAdmin.tsx: Added missing handleSaveTranslations function
  const handleSaveTranslations = async () => {
    if (!editingLang) return;
    setIsSavingLang(true);
    try {
      const updated = languages.map(l => l.code === editingLang.code ? editingLang : l);
      setLanguages(updated);
      await saveLanguages(updated, false);
      refreshTranslations();
      alert("Translations saved successfully.");
    } catch (e) {
      alert("Failed to save translations.");
    } finally {
      setIsSavingLang(false);
    }
  };

  const renderIcon = (name: string, props: any) => {
     const IconComp = (LucideIcons as any)[name] || (LucideIcons as any).HelpCircle || HelpCircle;
     return <IconComp {...props} />;
  };

  return (
    <div className="space-y-8 pb-12 relative">
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
                          <th className="px-6 py-4 font-semibold text-slate-700 text-sm">AI Usage</th>
                          <th className="px-6 py-4 font-semibold text-slate-700 text-sm text-right">Actions</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {allOrganizations.map((org, index) => {
                          if (!org) return null;
                          const isSelf = org.id === myOrg?.id;
                          const isExpanded = expandedOrgId === org.id;
                          const usage = (org as any).aiUsageCount || 0;
                          const limit = (org as any).aiUsageLimit || 100;
                          const usagePct = Math.min(100, (usage / limit) * 100);

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
                                   <td className="px-6 py-4 min-w-[150px]">
                                      <div className="flex flex-col gap-1">
                                         <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                            <span>{usage} / {limit}</span>
                                            <span>{Math.round(usagePct)}%</span>
                                         </div>
                                         <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                            <div className={`h-full transition-all duration-500 ${usagePct > 90 ? 'bg-red-500' : usagePct > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${usagePct}%` }}></div>
                                         </div>
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
                             </React.Fragment>
                          );
                       })}
                    </tbody>
                 </table>
              </div>
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
                        <input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900" value={settings.smtpHost || ''} onChange={e => setSettings({...settings, smtpHost: e.target.value})} placeholder="smtp.gmail.com" />
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div>
                           <label className="block text-sm font-medium text-slate-700 mb-1">{t('port')}</label>
                           <input type="number" className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900" value={settings.smtpPort || 587} onChange={e => setSettings({...settings, smtpPort: parseInt(e.target.value)})} placeholder="587" />
                        </div>
                        <div className="flex items-end">
                           <label className="flex items-center space-x-2 bg-slate-50 px-3 py-2.5 rounded-lg border border-slate-200 w-full cursor-pointer">
                              <input type="checkbox" className="rounded text-blue-600 focus:ring-blue-500" checked={settings.smtpSecure || false} onChange={e => setSettings({...settings, smtpSecure: e.target.checked})} />
                              <span className="text-sm text-slate-700">{t('secureConnection')}</span>
                           </label>
                        </div>
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{t('username')}</label>
                        <input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900" value={settings.smtpUser || ''} onChange={e => setSettings({...settings, smtpUser: e.target.value})} placeholder="user@example.com" />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{t('password')}</label>
                        <input type="password" name="password" autoComplete="new-password" className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900" value={settings.smtpPass || ''} onChange={e => setSettings({...settings, smtpPass: e.target.value})} placeholder="••••••••" />
                     </div>
                  </div>
               </div>
               <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col h-full">
                  <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2"><PenTool size={20} className="text-emerald-600" /> Email Templates (Global Defaults)</h3>
                  <div className="flex gap-2 mb-4 bg-slate-50 p-1 rounded-lg">
                     <button onClick={() => handleTemplateChange('registration')} className={`flex-1 py-1.5 text-sm font-medium rounded transition-all ${selectedTemplate === 'registration' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}>Registration</button>
                     <button onClick={() => handleTemplateChange('mfa')} className={`flex-1 py-1.5 text-sm font-medium rounded transition-all ${selectedTemplate === 'mfa' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}>MFA Code</button>
                     <button onClick={() => handleTemplateChange('invite')} className={`flex-1 py-1.5 text-sm font-medium rounded transition-all ${selectedTemplate === 'invite' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}>User Invite</button>
                  </div>
                  {editingTemplate && (
                     <div className="space-y-4 flex-1 flex flex-col">
                        <p className="text-xs text-slate-500 mb-2">Note: Localized versions can be customized per language in the <strong>Languages</strong> tab using <code>emailVerifyBody</code>, etc.</p>
                        <label className="flex items-center gap-2 text-sm text-slate-700 font-medium cursor-pointer">
                           <input type="checkbox" checked={editingTemplate.enabled || false} onChange={e => setEditingTemplate({...editingTemplate, enabled: e.target.checked})} className="rounded text-emerald-600" />
                           Enable Global Overrides
                        </label>
                        <input className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900" value={editingTemplate.subject || ''} onChange={e => setEditingTemplate({...editingTemplate, subject: e.target.value})} placeholder="Subject" />
                        <div className="flex-1 min-h-[200px]"><RichTextEditor value={editingTemplate.bodyHtml || ''} onChange={val => setEditingTemplate({...editingTemplate, bodyHtml: val})} height="100%" /></div>
                     </div>
                  )}
               </div>
            </div>
            <div className="flex justify-end pt-4"><button onClick={handleSaveSettings} className="bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-bold hover:bg-emerald-700 flex items-center gap-2 shadow-sm"><Save size={18} /> {settingsSaved ? 'Settings Saved!' : 'Save Configurations'}</button></div>
         </div>
      )}
      
      {/* LANGUAGES TAB - Users can use this to localize email templates per language */}
      {activeTab === 'languages' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-[700px] animate-in fade-in">
           <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <div>
                 <h3 className="text-lg font-bold text-slate-900">{t('manageLanguages')}</h3>
                 <p className="text-sm text-slate-500">Edit translations, including localized email templates.</p>
              </div>
              <div className="flex gap-2">
                 <input className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-900 w-24" placeholder="Code (de)" value={newLangCode} onChange={e => setNewLangCode(e.target.value)} maxLength={5} />
                 <input className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-900 w-32" placeholder="Name (German)" value={newLangName} onChange={e => setNewLangName(e.target.value)} />
                 <button onClick={async () => {
                     if (!newLangCode || !newLangName) return;
                     const newLang: LanguageConfig = { code: newLangCode, name: newLangName, isDefault: false, translations: { ...BASE_TRANSLATIONS }, manualOverrides: [] };
                     const updated = [...languages, newLang];
                     setLanguages(updated);
                     await saveLanguages(updated, false);
                     setNewLangCode(''); setNewLangName('');
                     refreshTranslations();
                 }} disabled={!newLangCode || isSavingLang} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-emerald-700 flex items-center gap-2">
                    <Plus size={16} /> Add
                 </button>
              </div>
           </div>
           
           <div className="flex flex-1 overflow-hidden">
              <div className="w-64 border-r border-slate-200 bg-slate-50 overflow-y-auto p-2">
                 {languages.map(lang => (
                    <div key={lang.code} className={`flex justify-between items-center p-3 rounded-lg cursor-pointer mb-1 ${editingLang?.code === lang.code ? 'bg-white shadow text-purple-700 font-bold' : 'hover:bg-white text-slate-600'}`} onClick={() => setEditingLang(lang)}>
                       <div className="flex items-center gap-2"><span>{lang.name}</span>{lang.isDefault && <Star size={12} className="text-amber-500 fill-amber-500" />}</div>
                    </div>
                 ))}
              </div>
              
              <div className="flex-1 flex flex-col overflow-hidden bg-white">
                 {editingLang ? (
                    <>
                       <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center flex-wrap gap-2">
                          <span className="font-bold text-slate-700 uppercase flex items-center gap-2"><Globe size={16} /> {editingLang.name}</span>
                       </div>
                       <div className="flex-1 overflow-y-auto p-6 space-y-4">
                          {Object.keys(BASE_TRANSLATIONS).map(key => (
                             <div key={key} className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">{key}</label>
                                <div className="flex gap-2">
                                   {key.toLowerCase().includes('body') ? (
                                      <div className="flex-1">
                                         <RichTextEditor value={editingLang.translations?.[key] || ''} onChange={val => handleUpdateTranslation(key, val)} height="150px" />
                                      </div>
                                   ) : (
                                      <input className="flex-1 border border-slate-300 rounded px-3 py-2 text-sm bg-white text-slate-900" value={editingLang.translations?.[key] || ''} onChange={e => handleUpdateTranslation(key, e.target.value)} />
                                   )}
                                </div>
                             </div>
                          ))}
                       </div>
                       <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
                          <button onClick={handleSaveTranslations} disabled={isSavingLang} className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-emerald-700 flex items-center gap-2">
                             {isSavingLang ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Save All
                          </button>
                       </div>
                    </>
                 ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50">
                       <Globe size={48} className="mb-4 opacity-20" />
                       <p>Select a language to edit translations and localized emails.</p>
                    </div>
                 )}
              </div>
           </div>
        </div>
      )}
      
      {/* Delete Modal */}
      {deleteTarget && (
         <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
               <h3 className="text-lg font-bold mb-4">Confirm Delete</h3>
               <p className="text-sm mb-6">Delete {deleteTarget.name}?</p>
               <div className="flex gap-3"><button onClick={() => setDeleteTarget(null)} className="flex-1 px-4 py-2 bg-slate-100 rounded-lg">Cancel</button><button onClick={confirmDelete} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg">Delete</button></div>
            </div>
         </div>
      )}
    </div>
  );
};

export default SuperAdmin;