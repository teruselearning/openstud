import { useContext, useState, useEffect } from 'react';
import { getNetworkPartners, getUsers, switchOrganization, getSystemSettings, saveSystemSettings, getOrg, getProjects, getIndividuals, getBreedingEvents, getBreedingLoans, getPartnerships, getSpecies, syncPushOrg, syncPushUsers, syncPushProjects, syncPushSpecies, syncPushIndividuals, syncPushBreedingEvents, syncPushBreedingLoans, syncPushPartnerships, syncPushSettings, deleteOrganization, getLanguages, saveLanguages, deleteLanguage } from '../services/storage';
import * as LucideIcons from 'lucide-react';
import { Shield, Database, Layout, Settings, MapPin, Eye, Save, Check, AlertCircle, RefreshCw, X, Building2, EyeOff, LogIn, Trash2, Globe, Star, Plus, Loader2, Lock, ChevronDown, ChevronRight, Mail, PenTool } from 'lucide-react';
import { LanguageContext } from '../App';
import { SystemSettings, LandingFeature, Organization, LanguageConfig, Sex, EmailTemplate } from '../types';
import RichTextEditor from '../components/RichTextEditor';
import { BASE_TRANSLATIONS } from '../services/i18n';
import React from 'react';

const SuperAdmin: React.FC = () => {
  const { t, refreshTranslations } = useContext(LanguageContext);
  const [activeTab, setActiveTab] = useState<'overview' | 'settings' | 'languages' | 'email'>('overview');
  
  const partners = getNetworkPartners();
  const myOrg = getOrg();
  const allOrganizations = [myOrg, ...(partners || [])].filter(Boolean);

  const [settings, setSettings] = useState<SystemSettings>(getSystemSettings());
  const [settingsSaved, setSettingsSaved] = useState(false);
  
  // Email States
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
    
    // Load initial template (Registration)
    const tplKey = 'registration';
    const initialTpl = current.emailTemplates?.[tplKey] || {
        subject: 'Verify your OpenStudbook account',
        bodyHtml: '<div style="font-family: sans-serif; padding: 20px;"><h2 style="color: #059669;">Welcome to OpenStudbook!</h2><p>To complete your registration for <strong>{{orgName}}</strong>, please enter the following verification code:</p><div style="font-size: 32px; font-weight: bold; background: #f0fdf4; padding: 15px; text-align: center; border-radius: 8px; border: 1px solid #dcfce7; margin: 20px 0; color: #166534;">{{code}}</div><p style="color: #64748b; font-size: 12px;">This code will expire in 30 minutes.</p></div>',
        enabled: true
    };
    setEditingTemplate(initialTpl);
  }, []);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: SystemSettings = {
      ...settings,
      emailTemplates: {
         ...settings.emailTemplates,
         [selectedTemplate]: editingTemplate
      }
    };
    saveSystemSettings(updated);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 3000);
  };
  
  const handleTemplateChange = (type: string) => {
     // Current settings object with latest edits
     const updatedTemplates = { ...settings.emailTemplates, [selectedTemplate]: editingTemplate };
     setSettings(prev => ({ ...prev, emailTemplates: updatedTemplates }));
     
     setSelectedTemplate(type);
     
     // Determine next template content
     let nextTpl = updatedTemplates[type];
     if (!nextTpl) {
        if (type === 'registration') {
           nextTpl = { subject: 'Verify your OpenStudbook account', bodyHtml: '<p>Code: {{code}}</p>', enabled: true };
        } else if (type === 'mfa') {
           nextTpl = { subject: 'Verification Code', bodyHtml: '<p>Code: {{code}}</p>', enabled: true };
        } else {
           nextTpl = { subject: '', bodyHtml: '', enabled: true };
        }
     }
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
      alert("Translations saved successfully.");
    } finally { setIsSavingLang(false); }
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Shield className="text-purple-600" /> {t('saDashboard')}</h2>
          <p className="text-slate-500">{t('saSubtitle')}</p>
        </div>
        <div className="flex bg-white p-1 rounded-lg border border-slate-200 shadow-sm overflow-x-auto">
           <button onClick={() => setActiveTab('overview')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'overview' ? 'bg-purple-100 text-purple-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}>Overview</button>
           <button onClick={() => setActiveTab('email')} className={`px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-colors ${activeTab === 'email' ? 'bg-purple-100 text-purple-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}><Mail size={16} /> Email</button>
           <button onClick={() => setActiveTab('languages')} className={`px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-colors ${activeTab === 'languages' ? 'bg-purple-100 text-purple-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}><Globe size={16} /> Languages</button>
        </div>
      </div>

      {activeTab === 'overview' && (
         <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm animate-in fade-in">
            <table className="w-full text-left">
               <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                     <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('orgName')}</th>
                     <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Location</th>
                     <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">AI Usage</th>
                     <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-100">
                  {allOrganizations.map(org => (
                     <tr key={org.id} className="hover:bg-slate-50 group">
                        <td className="px-6 py-4">
                           <div className="font-bold text-slate-900">{org.name}</div>
                           <div className="text-[10px] font-mono text-slate-400">{org.id}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">{org.location}</td>
                        <td className="px-6 py-4 text-sm font-medium">{(org as any).aiUsageCount || 0} / {(org as any).aiUsageLimit || 100}</td>
                        <td className="px-6 py-4 text-right">
                           <button onClick={() => switchOrganization(org.id, org) && window.location.reload()} className="bg-slate-100 group-hover:bg-purple-600 group-hover:text-white text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ml-auto">
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
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
               <h3 className="font-bold text-slate-900 flex items-center gap-2 mb-2"><Mail size={20} className="text-blue-600"/> SMTP Configuration</h3>
               <div className="space-y-4">
                  <div><label className="text-xs font-bold text-slate-400 uppercase tracking-widest">SMTP Host</label><input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none transition-all" value={settings.smtpHost || ''} onChange={e => setSettings({...settings, smtpHost: e.target.value})} placeholder="smtp.sendgrid.net" /></div>
                  <div className="grid grid-cols-2 gap-4">
                     <div><label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Port</label><input type="number" className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 outline-none" value={settings.smtpPort || 587} onChange={e => setSettings({...settings, smtpPort: parseInt(e.target.value)})} /></div>
                     <div className="flex items-end"><label className="flex items-center gap-2 mb-2 cursor-pointer select-none"><input type="checkbox" checked={settings.smtpSecure || false} onChange={e => setSettings({...settings, smtpSecure: e.target.checked})} className="rounded text-blue-600" /> <span className="text-sm font-medium">Use TLS/SSL</span></label></div>
                  </div>
                  <div><label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Username</label><input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 outline-none" value={settings.smtpUser || ''} onChange={e => setSettings({...settings, smtpUser: e.target.value})} /></div>
                  <div><label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Password</label><input type="password" name="password" autoComplete="new-password" className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 outline-none" value={settings.smtpPass || ''} onChange={e => setSettings({...settings, smtpPass: e.target.value})} /></div>
               </div>
               <p className="text-[10px] text-slate-400 mt-4 leading-relaxed">System-wide outgoing mail. Changes apply immediately upon save. If host is empty, system falls back to environment variables (if set).</p>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col h-full">
               <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2"><PenTool size={20} className="text-emerald-600"/> System Email Templates</h3>
               <div className="flex gap-2 mb-4 bg-slate-100 p-1 rounded-lg">
                  {['registration', 'mfa', 'invite', 'notification'].map(tKey => (
                     <button 
                        key={tKey} 
                        onClick={() => handleTemplateChange(tKey)} 
                        className={`flex-1 py-1.5 text-xs font-bold rounded-md uppercase tracking-wider transition-all ${selectedTemplate === tKey ? 'bg-white shadow text-emerald-700' : 'text-slate-500 hover:text-slate-800'}`}
                     >
                        {tKey}
                     </button>
                  ))}
               </div>
               <div className="space-y-4 flex-1 flex flex-col">
                  <div className="flex items-center justify-between">
                     <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
                        <input type="checkbox" checked={editingTemplate.enabled} onChange={e => setEditingTemplate({...editingTemplate, enabled: e.target.checked})} className="rounded text-emerald-600" /> 
                        Enable Global Override
                     </label>
                     <span className="text-[10px] font-bold text-slate-400 uppercase">Key: {selectedTemplate}</span>
                  </div>
                  <input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500 transition-all" placeholder="Email Subject" value={editingTemplate.subject} onChange={e => setEditingTemplate({...editingTemplate, subject: e.target.value})} />
                  <div className="flex-1 min-h-[300px] border border-slate-300 rounded-lg overflow-hidden"><RichTextEditor value={editingTemplate.bodyHtml} onChange={v => setEditingTemplate({...editingTemplate, bodyHtml: v})} height="100%"/></div>
                  <p className="text-[10px] text-slate-500 italic">Available variables: {'{{orgName}}, {{userName}}, {{code}}, {{role}}'}</p>
               </div>
               <div className="mt-4 flex justify-end">
                  <button onClick={handleSaveSettings} className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-2.5 rounded-lg font-bold shadow-lg shadow-emerald-100 transition-all flex items-center gap-2 active:scale-95">
                     <Save size={18} /> {settingsSaved ? 'Changes Saved!' : 'Save Configuration'}
                  </button>
               </div>
            </div>
         </div>
      )}

      {activeTab === 'languages' && (
         <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-[700px] animate-in fade-in">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
               <div>
                  <h3 className="font-bold text-lg text-slate-900">Translation Management</h3>
                  <p className="text-xs text-slate-500">Edit core labels and localized email defaults.</p>
               </div>
               <div className="flex gap-2">
                  <input placeholder="Code (e.g. es)" className="border border-slate-300 px-3 py-1.5 rounded-lg text-sm w-24 bg-white outline-none focus:ring-2 focus:ring-purple-500" value={newLangCode} onChange={e => setNewLangCode(e.target.value)} />
                  <input placeholder="Name (e.g. Spanish)" className="border border-slate-300 px-3 py-1.5 rounded-lg text-sm w-40 bg-white outline-none focus:ring-2 focus:ring-purple-500" value={newLangName} onChange={e => setNewLangName(e.target.value)} />
                  <button onClick={async () => {
                     if(!newLangCode || !newLangName) return;
                     const updated = [...languages, { code: newLangCode, name: newLangName, translations: { ...BASE_TRANSLATIONS }, isDefault: false }];
                     setLanguages(updated); await saveLanguages(updated); refreshTranslations();
                     setNewLangCode(''); setNewLangName('');
                  }} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded-lg text-sm font-bold shadow-sm transition-all flex items-center gap-1"><Plus size={16}/> Add</button>
               </div>
            </div>
            <div className="flex flex-1 overflow-hidden">
               <div className="w-64 border-r border-slate-200 bg-slate-50 overflow-y-auto p-2 space-y-1">
                  {languages.map(l => (
                     <button key={l.code} onClick={() => setEditingLang(l)} className={`w-full text-left p-3 rounded-lg flex justify-between items-center transition-all ${editingLang?.code === l.code ? 'bg-white shadow-md text-purple-700 font-bold' : 'hover:bg-white/50 text-slate-600'}`}>
                        <div className="flex items-center gap-2">
                           <Globe size={14} className={editingLang?.code === l.code ? 'text-purple-600' : 'text-slate-400'}/>
                           <span className="text-sm">{l.name}</span>
                        </div>
                        {l.isDefault && <Star size={12} className="fill-amber-500 text-amber-500" />}
                     </button>
                  ))}
               </div>
               <div className="flex-1 overflow-y-auto p-8 bg-white">
                  {editingLang ? (
                     <div className="max-w-3xl space-y-8">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                           <h4 className="font-extrabold text-slate-800 uppercase tracking-widest text-sm flex items-center gap-2">
                              Editing: {editingLang.name} 
                              <span className="text-xs font-mono text-slate-400 lowercase font-normal">({editingLang.code})</span>
                           </h4>
                        </div>
                        <div className="grid gap-6">
                           {Object.keys(BASE_TRANSLATIONS).map(key => (
                              <div key={key} className="space-y-1.5">
                                 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">{key}</label>
                                 {key.toLowerCase().includes('body') ? (
                                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                                       <RichTextEditor value={editingLang.translations[key] || ''} onChange={v => handleUpdateTranslation(key, v)} height="200px" />
                                    </div>
                                 ) : (
                                    <input className="w-full border border-slate-300 px-4 py-2 rounded-lg text-sm font-medium bg-slate-50 focus:bg-white focus:ring-2 focus:ring-purple-500 outline-none transition-all" value={editingLang.translations[key] || ''} onChange={e => handleUpdateTranslation(key, e.target.value)} />
                                 )}
                              </div>
                           ))}
                        </div>
                     </div>
                  ) : (
                     <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-3 opacity-60">
                        <Globe size={64} strokeWidth={1} />
                        <p className="font-bold text-lg">Select a language to edit</p>
                        <p className="text-sm">Manage interface labels and localized email defaults.</p>
                     </div>
                  )}
               </div>
            </div>
            {editingLang && (
               <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
                  <button onClick={() => setEditingLang(null)} className="px-6 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-lg transition-colors">Close</button>
                  <button onClick={handleSaveTranslations} className="bg-purple-600 hover:bg-purple-700 text-white px-10 py-2 rounded-lg font-bold shadow-lg shadow-purple-100 flex items-center gap-2 active:scale-95 transition-all">
                     {isSavingLang ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>} Save All Translations
                  </button>
               </div>
            )}
         </div>
      )}
    </div>
  );
};

export default SuperAdmin;