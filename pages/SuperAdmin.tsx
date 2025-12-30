
import { useContext, useState, useEffect } from 'react';
import { getNetworkPartners, getUsers, switchOrganization, getSystemSettings, saveSystemSettings, getOrg, getLanguages, saveLanguages } from '../services/storage';
import { testSmtpConnection } from '../services/emailService';
import { 
  Shield, Save, Loader2, Globe, Star, Mail, PenTool, LogIn, CheckCircle2, 
  Send, AlertCircle, Trash2, X, RefreshCw, Plus, Layout, Palette, 
  Lock, FileText, Type, Image as ImageIcon, Sparkles, UserPlus
} from 'lucide-react';
import { LanguageContext } from '../App';
import { SystemSettings, LanguageConfig, EmailTemplate, UserRole, StaticPageConfig } from '../types';
import RichTextEditor from '../components/RichTextEditor';
import { BASE_TRANSLATIONS } from '../services/i18n';
import React from 'react';

type AdminTab = 'overview' | 'email' | 'settings' | 'languages';

const SuperAdmin: React.FC = () => {
  const { t, refreshTranslations } = useContext(LanguageContext);
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  
  const partners = getNetworkPartners();
  const myOrg = getOrg();
  const allOrganizations = [myOrg, ...(partners || [])].filter(p => p && !p.deleted);

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

  useEffect(() => {
    const current = getSystemSettings();
    setSettings(current);
    setLanguages(getLanguages());
    
    const initialTpl = current.emailTemplates?.[selectedTemplate as keyof typeof current.emailTemplates];
    if (initialTpl) {
       setEditingTemplate(initialTpl);
    }
  }, [selectedTemplate]);

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
    
    // CRITICAL: Ensure settings are saved to backend before testing
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

  const updateStaticPage = (key: 'aboutPage' | 'privacyPage' | 'termsPage', field: keyof StaticPageConfig, value: any) => {
    setSettings({
      ...settings,
      [key]: { ...settings[key], [field]: value }
    });
  };

  const handleUpdateTranslation = (key: string, value: string) => {
    if (!editingLang) return;
    setEditingLang({
      ...editingLang,
      translations: { ...editingLang.translations, [key]: value }
    });
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
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Shield className="text-purple-600" /> Super Administration</h2>
          <p className="text-slate-500">Global system settings, app configuration, and network oversight.</p>
        </div>
        <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm overflow-x-auto whitespace-nowrap scrollbar-hide">
           <button onClick={() => setActiveTab('overview')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'overview' ? 'bg-purple-100 text-purple-700' : 'text-slate-600 hover:bg-slate-50'}`}>Network</button>
           <button onClick={() => setActiveTab('email')} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'email' ? 'bg-purple-100 text-purple-700' : 'text-slate-600 hover:bg-slate-50'}`}><Mail size={16} /> Email</button>
           <button onClick={() => setActiveTab('settings')} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'settings' ? 'bg-purple-100 text-purple-700' : 'text-slate-600 hover:bg-slate-50'}`}><Layout size={16} /> App Settings</button>
           <button onClick={() => setActiveTab('languages')} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'languages' ? 'bg-purple-100 text-purple-700' : 'text-slate-600 hover:bg-slate-50'}`}><Globe size={16} /> Localisation</button>
        </div>
      </div>

      {activeTab === 'overview' && (
         <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm animate-in fade-in">
            <table className="w-full text-left">
               <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                     <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Organisation</th>
                     <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-100">
                  {allOrganizations.map(org => (
                     <tr key={org.id} className="hover:bg-slate-50 group transition-colors">
                        <td className="px-6 py-4">
                           <div className="font-bold text-slate-900">{org.name}</div>
                           <div className="text-[10px] font-mono text-slate-400">{org.location} • {org.id}</div>
                        </td>
                        <td className="px-6 py-4 text-right">
                           <button onClick={() => switchOrganization(org.id, org) && window.location.reload()} className="bg-slate-100 group-hover:bg-purple-600 group-hover:text-white text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1">
                              <LogIn size={12}/> Login As
                           </button>
                        </td>
                     </tr>
                  ))}
               </tbody>
            </table>
         </div>
      )}

      {activeTab === 'email' && (
         <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 animate-in fade-in">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 flex flex-col h-fit">
               <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                  <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><Mail size={20}/></div>
                  <h3 className="font-extrabold text-lg text-slate-900">SMTP Server</h3>
               </div>
               
               <form onSubmit={handleSaveAllSettings} className="grid grid-cols-1 gap-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase block">Host</label>
                      <input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm" value={settings.smtpHost || ''} onChange={e => setSettings({...settings, smtpHost: e.target.value})} placeholder="e.g. smtp.example.com" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase block">Port</label>
                      <input type="number" className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 outline-none text-sm" value={settings.smtpPort || 587} onChange={e => setSettings({...settings, smtpPort: parseInt(e.target.value)})} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase block">Username</label>
                      <input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 outline-none text-sm" value={settings.smtpUser || ''} onChange={e => setSettings({...settings, smtpUser: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase block">Password</label>
                      <input type="password" name="password" autoComplete="new-password" className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 outline-none text-sm" value={settings.smtpPass || ''} onChange={e => setSettings({...settings, smtpPass: e.target.value})} />
                    </div>
                  </div>

                  <div className="flex items-center gap-4 py-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={settings.smtpSecure || false} onChange={e => setSettings({...settings, smtpSecure: e.target.checked})} className="rounded text-blue-600" /> 
                      <span className="text-[11px] font-bold text-slate-600">Secure (TLS/SSL)</span>
                    </label>
                  </div>

                  <div className="mt-2 pt-4 border-t border-slate-100 space-y-3">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2"><Send size={12}/> Test Connection</h4>
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
                     <span>{settingsSaved ? 'Saved Successfully' : 'Save Mail Config'}</span>
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
                     <span>Available Variables: {'{{orgName}}, {{userName}}, {{code}}, {{message}}'}</span>
                  </div>
               </div>
               <div className="mt-6">
                  <button onClick={handleSaveAllSettings} disabled={isSaving} className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95">
                     {isSaving ? <Loader2 size={16} className="animate-spin" /> : settingsSaved ? <CheckCircle2 size={16}/> : <Save size={16} />}
                     <span>{settingsSaved ? 'Saved Successfully' : 'Save Email Config'}</span>
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
                  <h3 className="font-extrabold text-lg text-slate-900">Branding & Theming</h3>
               </div>
               
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                     <label className="text-[10px] font-bold text-slate-400 uppercase block">Primary Color</label>
                     <div className="flex gap-2">
                        <input type="color" className="h-10 w-12 rounded border border-slate-200 cursor-pointer" value={settings.themePrimaryColor} onChange={e => setSettings({...settings, themePrimaryColor: e.target.value})} />
                        <input className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono" value={settings.themePrimaryColor} onChange={e => setSettings({...settings, themePrimaryColor: e.target.value})} />
                     </div>
                  </div>
                  <div className="space-y-1">
                     <label className="text-[10px] font-bold text-slate-400 uppercase block">Secondary Color</label>
                     <div className="flex gap-2">
                        <input type="color" className="h-10 w-12 rounded border border-slate-200 cursor-pointer" value={settings.themeSecondaryColor} onChange={e => setSettings({...settings, themeSecondaryColor: e.target.value})} />
                        <input className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono" value={settings.themeSecondaryColor} onChange={e => setSettings({...settings, themeSecondaryColor: e.target.value})} />
                     </div>
                  </div>
               </div>

               <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase block">App Logo URL</label>
                  <div className="flex gap-3">
                     <div className="h-10 w-10 bg-slate-100 rounded border border-slate-200 flex items-center justify-center overflow-hidden">
                        {settings.appLogoUrl ? <img src={settings.appLogoUrl} className="max-h-full max-w-full object-contain" /> : <ImageIcon size={16} className="text-slate-400"/>}
                     </div>
                     <input className="flex-1 px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-emerald-500" placeholder="https://..." value={settings.appLogoUrl || ''} onChange={e => setSettings({...settings, appLogoUrl: e.target.value})} />
                  </div>
               </div>

               <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase block">Custom CSS Injection</label>
                  <textarea rows={4} className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-900 text-emerald-400 font-mono text-xs outline-none focus:ring-2 focus:ring-emerald-500" placeholder="/* Custom CSS */" value={settings.customCss || ''} onChange={e => setSettings({...settings, customCss: e.target.value})} />
               </div>
            </div>

            {/* LANDING PAGE */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
               <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                  <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><Layout size={20}/></div>
                  <h3 className="font-extrabold text-lg text-slate-900">Landing Page Content</h3>
               </div>
               
               <div className="space-y-4">
                  <div className="space-y-1 border-b border-slate-50 pb-4">
                     <div className="flex items-center justify-between">
                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                           <UserPlus size={16} className="text-indigo-500"/> Enable Public Registration
                        </label>
                        <label className="relative inline-flex items-center cursor-pointer">
                           <input type="checkbox" className="sr-only peer" checked={settings.enableRegistration !== false} onChange={e => setSettings({...settings, enableRegistration: e.target.checked})} />
                           <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                        </label>
                     </div>
                     <p className="text-[10px] text-slate-400 mt-1">Allows anyone to create a new organization from the landing page. If disabled, new organizations can only be created by an administrator.</p>
                  </div>

                  <div className="space-y-1">
                     <label className="text-[10px] font-bold text-slate-400 uppercase block">Hero Title</label>
                     <input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" value={settings.landingPageConfig?.heroTitle || ''} onChange={e => setSettings({...settings, landingPageConfig: {...settings.landingPageConfig, heroTitle: e.target.value}})} />
                  </div>
                  <div className="space-y-1">
                     <label className="text-[10px] font-bold text-slate-400 uppercase block">Hero Subtitle</label>
                     <textarea className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-indigo-500" rows={2} value={settings.landingPageConfig?.heroSubtitle || ''} onChange={e => setSettings({...settings, landingPageConfig: {...settings.landingPageConfig, heroSubtitle: e.target.value}})} />
                  </div>
                  <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200">
                     <span className="text-sm font-bold text-slate-700">Show Features Section</span>
                     <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={settings.landingPageConfig?.showFeatures !== false} onChange={e => setSettings({...settings, landingPageConfig: {...settings.landingPageConfig, showFeatures: e.target.checked}})} />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                     </label>
                  </div>
               </div>
            </div>

            <div className="pt-6 lg:col-span-2 flex justify-end">
               <button onClick={handleSaveAllSettings} disabled={isSaving} className="bg-slate-900 hover:bg-slate-800 text-white px-10 py-3 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95">
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : settingsSaved ? <CheckCircle2 size={16}/> : <Save size={16} />}
                  <span>{settingsSaved ? 'All Settings Saved' : 'Save System Configuration'}</span>
               </button>
            </div>
         </div>
      )}

      {activeTab === 'languages' && (
         <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[700px] animate-in fade-in overflow-hidden">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
               <div>
                  <h3 className="font-extrabold text-lg text-slate-900 tracking-tight">System Localisation</h3>
               </div>
               <div className="flex gap-2">
                  <input placeholder="Code" className="border border-slate-300 px-3 py-1.5 rounded-xl text-sm w-20 bg-white outline-none focus:ring-2 focus:ring-purple-500" value={newLangCode} onChange={e => setNewLangCode(e.target.value)} />
                  <input placeholder="Name" className="border border-slate-300 px-3 py-1.5 rounded-xl text-sm w-32 bg-white outline-none focus:ring-2 focus:ring-purple-500" value={newLangName} onChange={e => setNewLangName(e.target.value)} />
                  <button onClick={async () => {
                     if(!newLangCode || !newLangName) return;
                     const updated = [...languages, { code: newLangCode, name: newLangName, translations: { ...BASE_TRANSLATIONS }, isDefault: false }];
                     setLanguages(updated); await saveLanguages(updated); refreshTranslations();
                     setNewLangCode(''); setNewLangName('');
                  }} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2"><Plus size={14}/> Add</button>
               </div>
            </div>
            <div className="flex flex-1 overflow-hidden">
               <div className="w-64 border-r border-slate-200 bg-slate-50 overflow-y-auto p-4 space-y-1">
                  {languages.map(l => (
                     <button key={l.code} onClick={() => setEditingLang(l)} className={`w-full text-left p-3 rounded-lg flex justify-between items-center transition-all ${editingLang?.code === l.code ? 'bg-white shadow text-purple-700 font-extrabold ring-1 ring-purple-100' : 'hover:bg-white/60 text-slate-600 font-medium text-sm'}`}>
                        <span>{l.name}</span>
                        {l.isDefault && <Star size={10} className="fill-amber-500 text-amber-500" />}
                     </button>
                  ))}
               </div>
               <div className="flex-1 overflow-y-auto p-8 bg-white">
                  {editingLang ? (
                     <div className="max-w-3xl space-y-6 animate-in fade-in duration-200">
                        <div className="border-b border-slate-100 pb-4">
                           <h4 className="font-extrabold text-xl text-slate-800 tracking-tight">Editing {editingLang.name}</h4>
                        </div>
                        <div className="grid gap-6">
                           {Object.keys(BASE_TRANSLATIONS).map(key => (
                              <div key={key} className="space-y-1">
                                 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">{key}</label>
                                 {key.toLowerCase().includes('body') ? (
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
                  <button onClick={() => setEditingLang(null)} className="px-6 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-xl transition-all text-sm">Cancel</button>
                  <button onClick={handleSaveTranslations} className="bg-purple-600 hover:bg-purple-700 text-white px-10 py-2 rounded-xl font-bold shadow-lg shadow-purple-100 flex items-center gap-2 active:scale-95 transition-all text-sm">
                     {isSavingLang ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>} Save Translations
                  </button>
               </div>
            )}
         </div>
      )}
    </div>
  );
};

export default SuperAdmin;
