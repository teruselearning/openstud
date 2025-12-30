
import { useContext, useState, useEffect } from 'react';
import { getNetworkPartners, getUsers, switchOrganization, getSystemSettings, saveSystemSettings, getOrg, getLanguages, saveLanguages } from '../services/storage';
import { Shield, Save, Loader2, Globe, Star, Mail, PenTool, LogIn } from 'lucide-react';
import { LanguageContext } from '../App';
import { SystemSettings, LanguageConfig, EmailTemplate, UserRole } from '../types';
import RichTextEditor from '../components/RichTextEditor';
import { BASE_TRANSLATIONS } from '../services/i18n';
import React from 'react';

const SuperAdmin: React.FC = () => {
  const { t, refreshTranslations } = useContext(LanguageContext);
  const [activeTab, setActiveTab] = useState<'overview' | 'email' | 'languages'>('overview');
  
  const partners = getNetworkPartners();
  const myOrg = getOrg();
  const allOrganizations = [myOrg, ...(partners || [])].filter(p => p && !p.deleted);

  const [settings, setSettings] = useState<SystemSettings>(getSystemSettings());
  const [settingsSaved, setSettingsSaved] = useState(false);
  
  // Email Template State
  const [selectedTemplate, setSelectedTemplate] = useState<string>('registration');
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate>({ subject: '', bodyHtml: '', enabled: true });
  
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
    
    // Default to Registration Template
    const tpl = current.emailTemplates?.registration || {
        subject: 'Verify your OpenStudbook account',
        bodyHtml: '<div style="font-family: sans-serif; padding: 20px;"><h2 style="color: #059669;">Welcome to OpenStudbook!</h2><p>Please enter this code to complete your registration:</p><div style="font-size: 24px; font-weight: bold; background: #f0fdf4; padding: 10px; text-align: center; border-radius: 5px; color: #166534;">{{code}}</div></div>',
        enabled: true
    };
    setEditingTemplate(tpl);
  }, []);

  const handleSaveEmailConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: SystemSettings = {
      ...settings,
      emailTemplates: {
         ...settings.emailTemplates,
         [selectedTemplate]: editingTemplate
      }
    };
    saveSystemSettings(updated);
    setSettings(updated);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 3000);
  };
  
  const handleTemplateChange = (type: string) => {
     // Cache current work into local settings object before switching
     const currentSettingsWithEdit = { 
        ...settings, 
        emailTemplates: { ...settings.emailTemplates, [selectedTemplate]: editingTemplate } 
     };
     setSettings(currentSettingsWithEdit);
     
     setSelectedTemplate(type);
     const nextTpl = currentSettingsWithEdit.emailTemplates?.[type] || { subject: '', bodyHtml: '', enabled: true };
     setEditingTemplate(nextTpl);
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
      alert("Translations saved.");
    } finally { setIsSavingLang(false); }
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Shield className="text-purple-600" /> System Administration</h2>
          <p className="text-slate-500">Global configuration and multi-tenant management.</p>
        </div>
        <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm overflow-x-auto whitespace-nowrap">
           <button onClick={() => setActiveTab('overview')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'overview' ? 'bg-purple-100 text-purple-700' : 'text-slate-600 hover:bg-slate-50'}`}>Network Overview</button>
           <button onClick={() => setActiveTab('email')} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'email' ? 'bg-purple-100 text-purple-700' : 'text-slate-600 hover:bg-slate-50'}`}><Mail size={16} /> Email Templates</button>
           <button onClick={() => setActiveTab('languages')} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'languages' ? 'bg-purple-100 text-purple-700' : 'text-slate-600 hover:bg-slate-50'}`}><Globe size={16} /> Localisation</button>
        </div>
      </div>

      {activeTab === 'overview' && (
         <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm animate-in fade-in">
            <table className="w-full text-left">
               <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                     <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Organization</th>
                     <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Focus</th>
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
                        <td className="px-6 py-4 text-sm text-slate-600 font-medium">
                           {/* Fix: Casting org to any to access 'focus' property which is present on Organization but not on ExternalPartner in this union array */}
                           {(org as any).focus || 'N/A'}
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
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
               <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><Mail size={24}/></div>
                  <h3 className="font-extrabold text-xl text-slate-900">SMTP Settings</h3>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Host</label><input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={settings.smtpHost || ''} onChange={e => setSettings({...settings, smtpHost: e.target.value})} placeholder="e.g. smtp.gmail.com" /></div>
                  <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Port</label><input type="number" className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 outline-none" value={settings.smtpPort || 587} onChange={e => setSettings({...settings, smtpPort: parseInt(e.target.value)})} /></div>
                  <div className="flex items-center pt-5"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={settings.smtpSecure || false} onChange={e => setSettings({...settings, smtpSecure: e.target.checked})} className="rounded text-blue-600" /> <span className="text-sm font-bold text-slate-600">Secure (TLS/SSL)</span></label></div>
                  <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">User</label><input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 outline-none" value={settings.smtpUser || ''} onChange={e => setSettings({...settings, smtpUser: e.target.value})} /></div>
                  <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Password</label><input type="password" name="password" autoComplete="new-password" className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 outline-none" value={settings.smtpPass || ''} onChange={e => setSettings({...settings, smtpPass: e.target.value})} /></div>
               </div>
               <p className="text-xs text-slate-400 bg-slate-50 p-3 rounded-lg leading-relaxed">Required for system notifications and account verification. If left empty, the server will try to use variables from the host environment (.env).</p>
            </div>

            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full min-h-[600px]">
               <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg"><PenTool size={24}/></div>
                  <h3 className="font-extrabold text-xl text-slate-900">System Templates</h3>
               </div>
               <div className="flex gap-2 mb-6 bg-slate-100 p-1.5 rounded-xl">
                  {['registration', 'mfa', 'invite', 'notification'].map(tKey => (
                     <button 
                        key={tKey} 
                        onClick={() => handleTemplateChange(tKey)} 
                        className={`flex-1 py-2 text-xs font-extrabold rounded-lg uppercase tracking-widest transition-all ${selectedTemplate === tKey ? 'bg-white shadow text-emerald-700' : 'text-slate-500 hover:text-slate-800'}`}
                     >
                        {tKey}
                     </button>
                  ))}
               </div>
               <div className="space-y-4 flex-1 flex flex-col">
                  <div className="flex items-center justify-between">
                     <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
                        <input type="checkbox" checked={editingTemplate.enabled} onChange={e => setEditingTemplate({...editingTemplate, enabled: e.target.checked})} className="rounded text-emerald-600" /> 
                        Enabled
                     </label>
                  </div>
                  <input className="w-full px-4 py-3 border border-slate-300 rounded-xl bg-slate-50 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Subject Line" value={editingTemplate.subject} onChange={e => setEditingTemplate({...editingTemplate, subject: e.target.value})} />
                  <div className="flex-1 min-h-[300px] rounded-xl overflow-hidden border border-slate-200"><RichTextEditor value={editingTemplate.bodyHtml} onChange={v => setEditingTemplate({...editingTemplate, bodyHtml: v})} height="100%"/></div>
                  <p className="text-[10px] text-slate-400 font-mono">Vars: {'{{orgName}}, {{userName}}, {{code}}, {{role}}'}</p>
               </div>
               <div className="mt-6 flex justify-end">
                  <button onClick={handleSaveEmailConfig} className="bg-slate-900 hover:bg-slate-800 text-white px-10 py-3 rounded-xl font-bold shadow-lg transition-all flex items-center gap-2 active:scale-95">
                     <Save size={18} /> {settingsSaved ? 'Configuration Saved' : 'Save Config'}
                  </button>
               </div>
            </div>
         </div>
      )}

      {activeTab === 'languages' && (
         <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[700px] animate-in fade-in overflow-hidden">
            <div className="p-8 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
               <div>
                  <h3 className="font-extrabold text-xl text-slate-900 tracking-tight">Translation & Localisation</h3>
                  <p className="text-xs text-slate-500 mt-1">Manage global dictionary and interface language settings.</p>
               </div>
               <div className="flex gap-2">
                  <input placeholder="Code (e.g. de)" className="border border-slate-300 px-4 py-2 rounded-xl text-sm w-28 bg-white outline-none focus:ring-2 focus:ring-purple-500" value={newLangCode} onChange={e => setNewLangCode(e.target.value)} />
                  <input placeholder="Name (e.g. German)" className="border border-slate-300 px-4 py-2 rounded-xl text-sm w-44 bg-white outline-none focus:ring-2 focus:ring-purple-500" value={newLangName} onChange={e => setNewLangName(e.target.value)} />
                  <button onClick={async () => {
                     if(!newLangCode || !newLangName) return;
                     const updated = [...languages, { code: newLangCode, name: newLangName, translations: { ...BASE_TRANSLATIONS }, isDefault: false }];
                     setLanguages(updated); await saveLanguages(updated); refreshTranslations();
                     setNewLangCode(''); setNewLangName('');
                  }} className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-xl text-sm font-bold transition-all shadow-sm"><Globe size={18} className="inline mr-1"/> Add</button>
               </div>
            </div>
            <div className="flex flex-1 overflow-hidden">
               <div className="w-72 border-r border-slate-200 bg-slate-50 overflow-y-auto p-4 space-y-2">
                  {languages.map(l => (
                     <button key={l.code} onClick={() => setEditingLang(l)} className={`w-full text-left p-4 rounded-xl flex justify-between items-center transition-all ${editingLang?.code === l.code ? 'bg-white shadow-md text-purple-700 font-extrabold ring-1 ring-purple-100' : 'hover:bg-white/60 text-slate-600 font-medium'}`}>
                        <span className="text-sm">{l.name}</span>
                        {l.isDefault && <Star size={12} className="fill-amber-500 text-amber-500" />}
                     </button>
                  ))}
               </div>
               <div className="flex-1 overflow-y-auto p-10 bg-white">
                  {editingLang ? (
                     <div className="max-w-4xl space-y-8 animate-in fade-in duration-200">
                        <div className="border-b border-slate-100 pb-6">
                           <h4 className="font-extrabold text-2xl text-slate-800 tracking-tight">Editing {editingLang.name} <span className="text-sm font-mono text-slate-400 ml-2">({editingLang.code})</span></h4>
                        </div>
                        <div className="grid gap-8">
                           {Object.keys(BASE_TRANSLATIONS).map(key => (
                              <div key={key} className="space-y-2">
                                 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">{key}</label>
                                 {key.toLowerCase().includes('body') ? (
                                    <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                                       <RichTextEditor value={editingLang.translations[key] || ''} onChange={v => handleUpdateTranslation(key, v)} height="250px" />
                                    </div>
                                 ) : (
                                    <input className="w-full border border-slate-200 px-5 py-3 rounded-xl text-sm font-bold bg-slate-50 focus:bg-white focus:ring-2 focus:ring-purple-500 outline-none transition-all shadow-inner" value={editingLang.translations[key] || ''} onChange={e => handleUpdateTranslation(key, e.target.value)} />
                                 )}
                              </div>
                           ))}
                        </div>
                     </div>
                  ) : (
                     <div className="flex flex-col items-center justify-center h-full text-slate-300 space-y-4 opacity-50">
                        <Globe size={100} strokeWidth={1} />
                        <p className="font-extrabold text-xl">Select a language to manage localisation</p>
                     </div>
                  )}
               </div>
            </div>
            {editingLang && (
               <div className="p-6 border-t border-slate-200 bg-slate-50 flex justify-end gap-4">
                  <button onClick={() => setEditingLang(null)} className="px-8 py-3 text-slate-600 font-bold hover:bg-slate-200 rounded-xl transition-all">Cancel</button>
                  <button onClick={handleSaveTranslations} className="bg-purple-600 hover:bg-purple-700 text-white px-12 py-3 rounded-xl font-bold shadow-lg shadow-purple-100 flex items-center gap-2 active:scale-95 transition-all">
                     {isSavingLang ? <Loader2 className="animate-spin" size={20}/> : <Save size={20}/>} Save All Translations
                  </button>
               </div>
            )}
         </div>
      )}
    </div>
  );
};

export default SuperAdmin;
