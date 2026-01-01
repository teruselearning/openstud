
import { useContext, useState, useEffect } from 'react';
import { getNetworkPartners, getUsers, switchOrganization, getSystemSettings, saveSystemSettings, getOrg, getLanguages, saveLanguages, permanentDeleteOrganization, clearLocalCache } from '../services/storage';
import { testSmtpConnection } from '../services/emailService';
import { translateDictionary } from '../services/geminiService';
import { 
  Shield, Save, Loader2, Globe, Star, Mail, PenTool, LogIn, CheckCircle2, 
  Send, AlertCircle, Trash2, X, RefreshCw, Plus, Layout, Palette, 
  Lock, FileText, Type, Image as ImageIcon, Sparkles, UserPlus, AlertTriangle, Wand2,
  Building2, Briefcase, MapPin, GripVertical, Info, Database, Zap, Check
} from 'lucide-react';
import { LanguageContext } from '../App';
import { SystemSettings, LanguageConfig, EmailTemplate, UserRole, StaticPageConfig, Organization, OrganizationFocus, LandingFeature } from '../types';
import RichTextEditor from '../components/RichTextEditor';
import { BASE_TRANSLATIONS } from '../services/i18n';
import React from 'react';

type AdminTab = 'overview' | 'email' | 'settings' | 'security' | 'languages';

const SuperAdmin: React.FC = () => {
  const { t, refreshTranslations } = useContext(LanguageContext);
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  
  const [partners, setPartners] = useState<Organization[]>([]);
  const [myOrg, setMyOrg] = useState<Organization | null>(null);
  const [orgToDelete, setOrgToDelete] = useState<Organization | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [settings, setSettings] = useState<SystemSettings>(getSystemSettings());
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Email Template State
  const [selectedTemplate, setSelectedTemplate] = useState<string>('registration');
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate>({ subject: '', bodyHtml: '', enabled: true });
  
  // SMTP Test State
  const [testEmail, setTestEmail] = useState('');
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);
  const [testResult, setTestResult] = useState<{success: boolean, message: string} | null>(null);

  // Language States
  const [languages, setLanguages] = useState<LanguageConfig[]>([]);
  const [editingLang, setEditingLang] = useState<LanguageConfig | null>(null);
  const [newLangCode, setNewLangCode] = useState('');
  const [newLangName, setNewLangName] = useState('');
  const [isSavingLang, setIsSavingLang] = useState(false);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [aiFillSuccess, setAiFillSuccess] = useState(false);

  // New Org Creation State
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
    setPartners(getNetworkPartners() as unknown as Organization[]);
    setMyOrg(getOrg());
    
    const initialTpl = current.emailTemplates?.[selectedTemplate as keyof typeof current.emailTemplates];
    if (initialTpl) {
       setEditingTemplate(initialTpl);
    }
  }, [selectedTemplate]);

  const allOrganizations = [myOrg, ...(partners || [])].filter(p => p && !p.deleted) as Organization[];

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
    
    // Ensure settings are saved to backend before testing
    await handleSaveAllSettings();

    try {
      await testSmtpConnection(testEmail);
      setTestResult({ success: true, message: "Test email sent successfully! Please check your inbox." });
    } catch (e: any) {
      setTestResult({ success: false, message: e.message || "SMTP Connection Failed" });
    } finally {
      setIsTestingSmtp(false);
    }
  };

  const handleDeleteOrg = async () => {
      if (!orgToDelete) return;
      setIsDeleting(true);
      try {
          await permanentDeleteOrganization(orgToDelete.id);
          setPartners(prev => prev.filter(p => p.id !== orgToDelete.id));
          setOrgToDelete(null);
          alert("Organization deleted successfully.");
      } catch (e: any) {
          alert("Error: " + e.message);
      } finally {
          setIsDeleting(false);
      }
  };

  const handleCreateOrgSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsCreatingOrg(true);
      const token = localStorage.getItem('os_token');
      try {
          const response = await fetch('/api/super-admin/organizations', {
              method: 'POST',
              headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify(newOrgData)
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Creation failed");
          
          alert(`Organisation Created!\nTemporary Password for ${newOrgData.adminName}: ${data.tempPassword}`);
          setShowCreateOrg(false);
          setNewOrgData({ orgName: '', adminName: '', adminEmail: '', focus: 'Animals', location: '' });
          
          // Refresh list
          const result = await fetch('/api/sync', { headers: { 'Authorization': `Bearer ${token}` } });
          const syncData = await result.json();
          if (syncData.success) {
             setPartners(syncData.data.partners.filter((p: any) => p.id !== myOrg?.id));
          }
      } catch (err: any) {
          alert("Error: " + err.message);
      } finally {
          setIsCreatingOrg(false);
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

  const handleUpdateTranslation = (key: string, value: string) => {
    setEditingLang(prev => {
      if (!prev) return null;
      return {
        ...prev,
        translations: { ...prev.translations, [key]: value }
      };
    });
  };

  const handleAutoFillTranslations = async () => {
    if (!editingLang) return;

    // Identify keys that are missing or empty to only translate those
    const missingKeysDict: Record<string, string> = {};
    Object.keys(BASE_TRANSLATIONS).forEach(key => {
      const currentVal = editingLang.translations[key];
      // Defensive check: Only attempt trim() if the value is actually a string
      // This prevents the "trim is not a function" TypeError if values are null or objects
      const isMissing = !currentVal || (typeof currentVal !== 'string') || currentVal.trim() === '';
      if (isMissing) {
        missingKeysDict[key] = (BASE_TRANSLATIONS as any)[key];
      }
    });

    const keysToTranslateCount = Object.keys(missingKeysDict).length;

    if (keysToTranslateCount === 0) {
      alert("All translations are already present.");
      return;
    }

    setIsAutoFilling(true);
    setAiFillSuccess(false);
    try {
      // The service returns an array of { k: string, v: string } objects
      const translatedItems = await translateDictionary(missingKeysDict, editingLang.name);
      
      if (translatedItems && Array.isArray(translatedItems)) {
        // Merge AI results back into existing translations, preserving what's already there
        setEditingLang(prev => {
          if (!prev) return null;
          
          const mergedTranslations = { ...prev.translations };
          translatedItems.forEach(item => {
            // Only update if we originally identified it as missing to prevent data loss
            if (missingKeysDict[item.k]) {
               mergedTranslations[item.k] = item.v;
            }
          });

          return {
            ...prev,
            translations: mergedTranslations
          };
        });
        setAiFillSuccess(true);
        setTimeout(() => setAiFillSuccess(false), 5000);
      }
    } catch (e: any) {
      console.error("AI translation error:", e);
      alert("AI translation failed: " + e.message);
    } finally {
      setIsAutoFilling(false);
    }
  };

  const handleSaveTranslations = async () => {
    if (!editingLang) return;
    setIsSavingLang(true);
    try {
      const updated = languages.map(l => l.code === editingLang.code ? editingLang : l);
      setLanguages(updated);
      await saveLanguages(updated, false);
      refreshTranslations();
      alert("Localisation data updated.");
    } finally { setIsSavingLang(false); }
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
         <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in">
            <div className="lg:col-span-2 space-y-4">
               <div className="flex justify-between items-center">
                  <h3 className="text-lg font-extrabold text-slate-900">{t('manageOrgs')}</h3>
                  <button onClick={() => setShowCreateOrg(true)} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-purple-100 flex items-center gap-2 transition-all">
                     <Plus size={18}/> {t('createOrgBtn')}
                  </button>
               </div>
               
               <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                  <table className="w-full text-left">
                     <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                           <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">{t('organization')}</th>
                           <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">{t('action')}</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100">
                        {allOrganizations.map(org => (
                           <tr key={org.id} className="hover:bg-slate-50 group transition-colors">
                              <td className="px-6 py-4">
                                 <div className="font-bold text-slate-900 flex items-center gap-2">
                                    {org.name}
                                    {org.id === myOrg?.id && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">{t('hostTag')}</span>}
                                 </div>
                                 <div className="text-[10px] font-mono text-slate-400">{org.location} • {org.id}</div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                 <div className="flex justify-end gap-2">
                                   <button onClick={() => switchOrganization(org.id, org) && window.location.reload()} className="bg-slate-100 group-hover:bg-purple-600 group-hover:text-white text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1">
                                      <LogIn size={12}/> {t('loginAs')}
                                   </button>
                                   {org.id !== myOrg?.id && (
                                      <button onClick={() => setOrgToDelete(org)} className="bg-red-50 text-red-600 hover:bg-red-600 hover:text-white p-1.5 rounded-lg transition-all" title={t('delete')}>
                                         <Trash2 size={14}/>
                                      </button>
                                   )}
                                 </div>
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </div>

            <div className="space-y-4">
               <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2"><Database size={20} className="text-blue-500"/> {t('systemHealth')}</h3>
               <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                  <div className="flex items-center gap-3">
                     <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><Zap size={20}/></div>
                     <div>
                        <h4 className="font-bold text-slate-900">{t('cacheManage')}</h4>
                        <p className="text-xs text-slate-500">{t('cachePurgeDesc')}</p>
                     </div>
                  </div>
                  <div className="bg-amber-50 border-l-4 border-amber-400 p-3">
                     <p className="text-[10px] text-amber-800 leading-relaxed font-medium">{t('cachePurgeWarning')}</p>
                  </div>
                  <button 
                     onClick={() => {
                        if(confirm("This will clear the local browser cache for all species and individuals. Essential data will remain and non-essential data will be re-synced from the server. Continue?")) {
                           clearLocalCache();
                        }
                     }}
                     className="w-full bg-slate-900 hover:bg-red-600 text-white py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                  >
                     <RefreshCw size={14}/> {t('clearCacheBtn')}
                  </button>
               </div>
            </div>
         </div>
      )}

      {activeTab === 'security' && (
         <div className="max-w-4xl space-y-6 animate-in fade-in">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
               <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                  <div className="p-2 bg-red-100 text-red-600 rounded-lg"><Shield size={20}/></div>
                  <h3 className="font-extrabold text-lg text-slate-900">{t('securitySettings')}</h3>
               </div>
               
               <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                     <div className="max-w-md">
                        <h4 className="font-bold text-slate-900 flex items-center gap-2">{t('enableMfa')}</h4>
                        <p className="text-xs text-slate-500 leading-relaxed">{t('enableMfaDesc')}</p>
                     </div>
                     <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={settings.enableMfa} onChange={e => setSettings({...settings, enableMfa: e.target.checked})} />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                     </label>
                  </div>

                  <div className="pt-4 space-y-4">
                     <h4 className="text-sm font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2"><Lock size={16} className="text-blue-500" /> {t('securitySubtitle')}</h4>
                     <p className="text-xs text-slate-500">{t('recaptchaHelp')}</p>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                           <label className="text-[10px] font-bold text-slate-400 uppercase">{t('siteKey')}</label>
                           <input className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500" value={settings.recaptchaSiteKey || ''} onChange={e => setSettings({...settings, recaptchaSiteKey: e.target.value})} />
                        </div>
                        <div className="space-y-1">
                           <label className="text-[10px] font-bold text-slate-400 uppercase">{t('secretKey')}</label>
                           <input type="password" name="password" className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500" value={settings.recaptchaSecretKey || ''} onChange={e => setSettings({...settings, recaptchaSecretKey: e.target.value})} />
                        </div>
                     </div>
                  </div>
               </div>

               <div className="pt-6 border-t border-slate-100 flex justify-end">
                  <button onClick={handleSaveAllSettings} disabled={isSaving} className="bg-slate-900 hover:bg-slate-800 text-white px-10 py-3 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95">
                     {isSaving ? <Loader2 size={16} className="animate-spin" /> : settingsSaved ? <CheckCircle2 size={16}/> : <Save size={16} />}
                     <span>{settingsSaved ? t('saved') : t('saveSettings')}</span>
                  </button>
               </div>
            </div>
         </div>
      )}

      {activeTab === 'email' && (
         <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 animate-in fade-in">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 flex flex-col h-fit">
               <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                  <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><Mail size={20}/></div>
                  <h3 className="font-extrabold text-lg text-slate-900">{t('smtpSettings')}</h3>
               </div>
               
               <form onSubmit={handleSaveAllSettings} className="grid grid-cols-1 gap-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase block">{t('smtpHost')}</label>
                      <input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm" value={settings.smtpHost || ''} onChange={e => setSettings({...settings, smtpHost: e.target.value})} placeholder="e.g. smtp.example.com" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase block">{t('port')}</label>
                      <input type="number" className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 outline-none text-sm" value={settings.smtpPort || 587} onChange={e => setSettings({...settings, smtpPort: parseInt(e.target.value)})} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase block">{t('username')}</label>
                      <input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 outline-none text-sm" value={settings.smtpUser || ''} onChange={e => setSettings({...settings, smtpUser: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase block">{t('password')}</label>
                      <input type="password" name="password" autoComplete="new-password" className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 outline-none text-sm" value={settings.smtpPass || ''} onChange={e => setSettings({...settings, smtpPass: e.target.value})} />
                    </div>
                  </div>

                  <div className="flex items-center gap-4 py-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={settings.smtpSecure || false} onChange={e => setSettings({...settings, smtpSecure: e.target.checked})} className="rounded text-blue-600" /> 
                      <span className="text-[11px] font-bold text-slate-600">{t('secureConnection')}</span>
                    </label>
                  </div>

                  <div className="mt-2 pt-4 border-t border-slate-100 space-y-3">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2"><Send size={12}/> {t('sendCode')}</h4>
                    <div className="flex gap-2">
                       <input 
                         className="flex-1 px-4 py-1.5 border border-slate-300 rounded-lg bg-white text-xs outline-none focus:ring-1 focus:ring-blue-500"
                         placeholder="Recipient email..."
                         value={testEmail}
                         onChange={e => setTestEmail(e.target.value)}
                       />
                       <button 
                         type="button" 
                         onClick={handleRunSmtpTest}
                         disabled={isTestingSmtp || !testEmail}
                         className="bg-slate-800 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                       >
                          {isTestingSmtp ? <Loader2 className="animate-spin" size={14}/> : <RefreshCw size={14}/>}
                          Test
                       </button>
                    </div>
                    {testResult && (
                       <div className={`p-2 rounded-lg border flex items-start gap-2 text-[11px] animate-in fade-in slide-in-from-top-1 ${testResult.success ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-800'}`}>
                          {testResult.success ? <CheckCircle2 size={14} className="mt-0.5" /> : <AlertCircle size={14} className="mt-0.5" />}
                          <p className="flex-1">{testResult.message}</p>
                          <button onClick={() => setTestResult(null)} className="opacity-50 hover:opacity-100"><X size={12}/></button>
                       </div>
                    )}
                  </div>
               </form>
               <div className="mt-4 pt-4 border-t border-slate-100">
                  <button onClick={handleSaveAllSettings} disabled={isSaving} className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95">
                     {isSaving ? <Loader2 size={16} className="animate-spin" /> : settingsSaved ? <CheckCircle2 size={16}/> : <Save size={16} />}
                     <span>{settingsSaved ? t('saved') : t('saveSettings')}</span>
                  </button>
               </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-fit min-h-[600px]">
               <div className="flex items-center gap-3 mb-4 border-b border-slate-50 pb-4">
                  <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg"><PenTool size={20}/></div>
                  <h3 className="font-extrabold text-lg text-slate-900">Email Templates</h3>
               </div>
               <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-xl">
                  {['registration', 'mfa', 'invite', 'notification'].map(tKey => (
                     <button 
                        key={tKey} 
                        onClick={() => handleTemplateChange(tKey)} 
                        className={`flex-1 py-1 text-[10px] font-extrabold rounded-lg uppercase tracking-wider transition-all ${selectedTemplate === tKey ? 'bg-white shadow text-emerald-700' : 'text-slate-500 hover:text-slate-800'}`}
                     >
                        {tKey}
                     </button>
                  ))}
               </div>
               <div className="space-y-3 flex-1 flex flex-col">
                  <div className="flex items-center justify-between">
                     <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                        <input type="checkbox" checked={editingTemplate.enabled} onChange={e => setEditingTemplate({...editingTemplate, enabled: e.target.checked})} className="rounded text-emerald-600" /> 
                        Template Enabled
                     </label>
                  </div>
                  <div className="space-y-1">
                     <label className="text-[10px] font-bold text-slate-400 uppercase block">Subject Line</label>
                     <input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Email Subject" value={editingTemplate.subject} onChange={e => setEditingTemplate({...editingTemplate, subject: e.target.value})} />
                  </div>
                  <div className="flex-1 min-h-[250px] rounded-xl overflow-hidden border border-slate-200 shadow-inner">
                     <RichTextEditor value={editingTemplate.bodyHtml} onChange={v => setEditingTemplate({...editingTemplate, bodyHtml: v})} height="100%"/>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono bg-slate-50 p-2 rounded">
                     <span>Available Variables: {'{{orgName}}, {{userName}}, {{code}}, {{message}}, {{year}}'}</span>
                  </div>
               </div>
               <div className="mt-6">
                  <button onClick={handleSaveAllSettings} disabled={isSaving} className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95">
                     {isSaving ? <Loader2 size={16} className="animate-spin" /> : settingsSaved ? <CheckCircle2 size={16}/> : <Save size={16} />}
                     <span>{settingsSaved ? t('saved') : t('saveSettings')}</span>
                  </button>
               </div>
            </div>
         </div>
      )}

      {activeTab === 'settings' && (
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in">
            {/* BRANDING */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
               <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                  <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg"><Palette size={20}/></div>
                  <h3 className="font-extrabold text-lg text-slate-900">{t('theming')}</h3>
               </div>
               
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                     <label className="text-[10px] font-bold text-slate-400 uppercase block">{t('primaryColor')}</label>
                     <div className="flex gap-2">
                        <input type="color" className="h-10 w-12 rounded border border-slate-200 cursor-pointer" value={settings.themePrimaryColor} onChange={e => setSettings({...settings, themePrimaryColor: e.target.value})} />
                        <input className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono" value={settings.themePrimaryColor} onChange={e => setSettings({...settings, themePrimaryColor: e.target.value})} />
                     </div>
                  </div>
                  <div className="space-y-1">
                     <label className="text-[10px] font-bold text-slate-400 uppercase block">{t('secondaryColor')}</label>
                     <div className="flex gap-2">
                        <input type="color" className="h-10 w-12 rounded border border-slate-200 cursor-pointer" value={settings.themeSecondaryColor} onChange={e => setSettings({...settings, themeSecondaryColor: e.target.value})} />
                        <input className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono" value={settings.themeSecondaryColor} onChange={e => setSettings({...settings, themeSecondaryColor: e.target.value})} />
                     </div>
                  </div>
               </div>

               <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase block">{t('appLogo')}</label>
                  <div className="flex gap-3">
                     <div className="h-10 w-10 bg-slate-100 rounded border border-slate-200 flex items-center justify-center overflow-hidden">
                        {settings.appLogoUrl ? <img src={settings.appLogoUrl} className="max-h-full max-w-full object-contain" /> : <ImageIcon size={16} className="text-slate-400"/>}
                     </div>
                     <input className="flex-1 px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-emerald-500" placeholder="https://..." value={settings.appLogoUrl || ''} onChange={e => setSettings({...settings, appLogoUrl: e.target.value})} />
                  </div>
               </div>

               <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase block">{t('customCss')}</label>
                  <textarea rows={4} className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-900 text-emerald-400 font-mono text-xs outline-none focus:ring-2 focus:ring-emerald-500" placeholder="/* Custom CSS */" value={settings.customCss || ''} onChange={e => setSettings({...settings, customCss: e.target.value})} />
               </div>
            </div>

            {/* LANDING PAGE CONTENT */}
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

                  <div className="space-y-1">
                     <label className="text-[10px] font-bold text-slate-400 uppercase block">{t('heroTitle')}</label>
                     <input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" value={settings.landingPageConfig?.heroTitle || ''} onChange={e => setSettings({...settings, landingPageConfig: {...settings.landingPageConfig, heroTitle: e.target.value}})} />
                  </div>
                  <div className="space-y-1">
                     <label className="text-[10px] font-bold text-slate-400 uppercase block">{t('heroSubtitle')}</label>
                     <textarea className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-indigo-500" rows={2} value={settings.landingPageConfig?.heroSubtitle || ''} onChange={e => setSettings({...settings, landingPageConfig: {...settings.landingPageConfig, heroSubtitle: e.target.value}})} />
                  </div>
                  
                  {/* DYNAMIC FEATURE CARDS */}
                  <div className="pt-4 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-4">
                       <h4 className="text-sm font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2"><Sparkles size={16} className="text-amber-500" /> {t('featureCards')}</h4>
                       <button onClick={handleAddFeature} className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg font-bold hover:bg-indigo-100 transition-colors flex items-center gap-1"><Plus size={14}/> {t('add')}</button>
                    </div>
                    
                    <div className="space-y-3">
                       {(settings.landingPageConfig?.features || []).map((feature, idx) => (
                          <div key={feature.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 group/feat">
                             <div className="flex justify-between items-center">
                                <span className="text-[10px] font-mono text-slate-400">#Feature {idx + 1}</span>
                                <button onClick={() => handleRemoveFeature(feature.id)} className="text-slate-400 hover:text-red-600 transition-colors"><Trash2 size={14}/></button>
                             </div>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                   <label className="text-[9px] font-bold text-slate-400 uppercase">Title</label>
                                   <input className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white" value={feature.title} onChange={e => handleUpdateFeature(feature.id, 'title', e.target.value)} />
                                </div>
                                <div className="space-y-1">
                                   <label className="text-[9px] font-bold text-slate-400 uppercase">Icon (Lucide name)</label>
                                   <input className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-mono bg-white" value={feature.icon} onChange={e => handleUpdateFeature(feature.id, 'icon', e.target.value)} placeholder="Shield, Sprout, Heart..." />
                                </div>
                             </div>
                             <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase">Description</label>
                                <textarea className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white" rows={2} value={feature.description} onChange={e => handleUpdateFeature(feature.id, 'description', e.target.value)} />
                             </div>
                          </div>
                       ))}
                       {(!settings.landingPageConfig?.features || settings.landingPageConfig.features.length === 0) && (
                          <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs italic">No feature cards defined. Landing page will use defaults.</div>
                       )}
                    </div>
                  </div>
               </div>
            </div>

            <div className="pt-6 lg:col-span-2 flex justify-end">
               <button onClick={handleSaveAllSettings} disabled={isSaving} className="bg-slate-900 hover:bg-slate-800 text-white px-10 py-3 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95">
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : settingsSaved ? <CheckCircle2 size={16}/> : <Save size={16} />}
                  <span>{settingsSaved ? t('saved') : t('saveSettings')}</span>
               </button>
            </div>
         </div>
      )}

      {activeTab === 'languages' && (
         <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[700px] animate-in fade-in overflow-hidden">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
               <div>
                  <h3 className="font-extrabold text-lg text-slate-900 tracking-tight">{t('manageLanguages')}</h3>
               </div>
               <div className="flex gap-2">
                  <input placeholder={t('langCode')} className="border border-slate-300 px-3 py-1.5 rounded-xl text-sm w-20 bg-white outline-none focus:ring-2 focus:ring-purple-500" value={newLangCode} onChange={e => setNewLangCode(e.target.value)} />
                  <input placeholder={t('name')} className="border border-slate-300 px-3 py-1.5 rounded-xl text-sm w-32 bg-white outline-none focus:ring-2 focus:ring-purple-500" value={newLangName} onChange={e => setNewLangName(e.target.value)} />
                  <button onClick={async () => {
                     if(!newLangCode || !newLangName) return;
                     const updated = [...languages, { code: newLangCode, name: newLangName, translations: { ...BASE_TRANSLATIONS }, isDefault: false }];
                     setLanguages(updated); await saveLanguages(updated); refreshTranslations();
                     setNewLangCode(''); setNewLangName('');
                  }} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2"><Plus size={14}/> {t('add')}</button>
               </div>
            </div>
            <div className="flex flex-1 overflow-hidden">
               <div className="w-64 border-r border-slate-200 bg-slate-50 overflow-y-auto p-4 space-y-1">
                  {languages.map(l => (
                     <button key={l.code} onClick={() => {
                        setEditingLang(l);
                        setAiFillSuccess(false);
                     }} className={`w-full text-left p-3 rounded-lg flex justify-between items-center transition-all ${editingLang?.code === l.code ? 'bg-white shadow text-purple-700 font-extrabold ring-1 ring-purple-100' : 'hover:bg-white/60 text-slate-600 font-medium text-sm'}`}>
                        <span>{l.name}</span>
                        {l.isDefault && <Star size={10} className="fill-amber-500 text-amber-500" />}
                     </button>
                  ))}
               </div>
               <div className="flex-1 overflow-y-auto p-8 bg-white">
                  {editingLang ? (
                     <div className="max-w-3xl space-y-6 animate-in fade-in duration-200">
                        <div className="border-b border-slate-100 pb-4 flex justify-between items-center">
                           <h4 className="font-extrabold text-xl text-slate-800 tracking-tight">{t('editLanguage')} {editingLang.name}</h4>
                           <div className="flex items-center gap-3">
                             {aiFillSuccess && (
                                <div className="flex items-center gap-1.5 text-emerald-600 font-bold text-xs animate-in slide-in-from-right-2">
                                   <Check size={14} /> {t('localisation')} {t('autofill')}
                                </div>
                             )}
                             <button 
                               onClick={handleAutoFillTranslations}
                               disabled={isAutoFilling}
                               className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-50"
                             >
                               {isAutoFilling ? <Loader2 className="animate-spin" size={14}/> : <Wand2 size={14}/>}
                               {t('autofill')}
                             </button>
                           </div>
                        </div>
                        <div className="grid gap-6">
                           {Object.keys(BASE_TRANSLATIONS).map(key => (
                              <div key={key} className="space-y-1">
                                 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">{key}</label>
                                 {key.toLowerCase().includes('body') || key.toLowerCase().includes('html') ? (
                                    <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                                       <RichTextEditor value={editingLang.translations[key] || ''} onChange={v => handleUpdateTranslation(key, v)} height="200px" />
                                    </div>
                                 ) : (
                                    <input className="w-full border border-slate-200 px-4 py-2 rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-purple-500 outline-none transition-all" value={editingLang.translations[key] || ''} onChange={e => handleUpdateTranslation(key, e.target.value)} />
                                 )}
                              </div>
                           ))}
                        </div>
                     </div>
                  ) : (
                     <div className="flex flex-col items-center justify-center h-full text-slate-300 space-y-4 opacity-50">
                        <Globe size={80} strokeWidth={1} />
                        <p className="font-extrabold text-lg">Select a language</p>
                     </div>
                  )}
               </div>
            </div>
            {editingLang && (
               <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
                  <button onClick={() => setEditingLang(null)} className="px-6 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-xl transition-all text-sm">{t('cancel')}</button>
                  <button onClick={handleSaveTranslations} className="bg-purple-600 hover:bg-purple-700 text-white px-10 py-2 rounded-xl font-bold shadow-lg shadow-purple-100 flex items-center gap-2 active:scale-95 transition-all text-sm">
                     {isSavingLang ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>} {t('save')}
                  </button>
               </div>
            )}
         </div>
      )}

      {/* Form: Create Organization Modal */}
      {showCreateOrg && (
         <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full flex flex-col overflow-hidden animate-in zoom-in duration-200">
               <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                     <div className="p-2 bg-purple-100 text-purple-600 rounded-lg"><Building2 size={24}/></div>
                     <div>
                        <h3 className="text-xl font-extrabold text-slate-900">{t('createOrgBtn')}</h3>
                        <p className="text-xs text-slate-500">Create an org and its primary admin user.</p>
                     </div>
                  </div>
                  <button onClick={() => setShowCreateOrg(false)} className="text-slate-400 hover:text-slate-600"><X size={24}/></button>
               </div>
               
               <form onSubmit={handleCreateOrgSubmit} className="p-8 space-y-6">
                  <div className="space-y-4">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                           <label className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">{t('orgName')}</label>
                           <input 
                              className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 bg-white text-slate-900 text-sm font-bold"
                              placeholder="e.g. Island Sanctuary"
                              value={newOrgData.orgName}
                              onChange={e => setNewOrgData({...newOrgData, orgName: e.target.value})}
                              required
                           />
                        </div>
                        <div className="space-y-1">
                           <label className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">Org Focus</label>
                           <select 
                              className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 bg-white text-slate-900 text-sm font-bold"
                              value={newOrgData.focus}
                              onChange={e => setNewOrgData({...newOrgData, focus: e.target.value as OrganizationFocus})}
                           >
                              <option value="Animals">{t('animal')}</option>
                              <option value="Plants">{t('plant')}</option>
                           </select>
                        </div>
                        <div className="col-span-1 md:col-span-2 space-y-1">
                           <label className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">{t('location')}</label>
                           <div className="relative">
                              <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                              <input 
                                 className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 bg-white text-slate-900 text-sm"
                                 placeholder="e.g. Victoria, Seychelles"
                                 value={newOrgData.location}
                                 onChange={e => setNewOrgData({...newOrgData, location: e.target.value})}
                                 required
                              />
                           </div>
                        </div>
                     </div>
                  </div>

                  <div className="space-y-4 pt-6 border-t border-slate-50">
                     <h4 className="text-xs font-extrabold text-slate-800 uppercase flex items-center gap-2 tracking-widest"><UserPlus size={14} className="text-emerald-500" /> {t('adminName')}</h4>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                           <label className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">{t('name')}</label>
                           <input 
                              className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 bg-white text-slate-900 text-sm"
                              placeholder="John Smith"
                              value={newOrgData.adminName}
                              onChange={e => setNewOrgData({...newOrgData, adminName: e.target.value})}
                              required
                           />
                        </div>
                        <div className="space-y-1">
                           <label className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">{t('emailAddr')}</label>
                           <input 
                              type="email"
                              className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 bg-white text-slate-900 text-sm"
                              placeholder="john@island-sanctuary.org"
                              value={newOrgData.adminEmail}
                              onChange={e => setNewOrgData({...newOrgData, adminEmail: e.target.value})}
                              required
                           />
                        </div>
                     </div>
                  </div>

                  <div className="flex gap-3 pt-6">
                     <button type="button" onClick={() => setShowCreateOrg(false)} disabled={isCreatingOrg} className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors">{t('cancel')}</button>
                     <button type="submit" disabled={isCreatingOrg} className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-purple-200 flex items-center justify-center gap-2">
                        {isCreatingOrg ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                        Confirm & Send Invite
                     </button>
                  </div>
               </form>
            </div>
         </div>
      )}

      {/* Org Deletion Confirmation Modal */}
      {orgToDelete && (
          <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
             <div className="bg-white rounded-xl shadow-2xl max-md w-full p-8 text-center animate-in zoom-in duration-200">
                <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                   <AlertTriangle size={40}/>
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-2">{t('delete')} {t('organization')}?</h3>
                <p className="text-slate-500 mb-2 font-bold">{orgToDelete.name}</p>
                <div className="text-slate-500 mb-8 leading-relaxed text-sm text-left">
                    <p className="mb-2">This action is <span className="text-red-600 font-bold">permanent</span> and will delete all:</p>
                    <ul className="list-disc px-8 space-y-1">
                        <li>Users and accounts</li>
                        <li>All projects and species data</li>
                        <li>Individual records and breeding logs</li>
                        <li>Genetic data and photos</li>
                    </ul>
                </div>
                <div className="flex gap-3">
                   <button onClick={() => setOrgToDelete(null)} disabled={isDeleting} className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors disabled:opacity-50">{t('cancel')}</button>
                   <button onClick={handleDeleteOrg} disabled={isDeleting} className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-red-200 flex items-center justify-center gap-2 disabled:opacity-50">
                      {isDeleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                      {t('delete')}
                   </button>
                </div>
             </div>
          </div>
       )}
    </div>
  );
};

export default SuperAdmin;
