import React, { useState, useEffect, useRef, useContext } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { getOrg, saveOrg, exportFullData, importFullData, getUsers, getProjects, saveProjects, getSpecies, saveSpecies, getIndividuals, saveIndividuals, getCurrentProjectId, saveCurrentProjectId, exportDataAsCSV, getSession } from '../services/storage';
import { reverseGeocode } from '../services/geminiService';
import { Organization, User, Project, Species, Individual, UserRole } from '../types';
import { Save, Download, Upload, AlertCircle, Check, MapPin, Lock, HeartHandshake, EyeOff, LayoutTemplate, Briefcase, Trash2, Pencil, FolderOpen, ArrowRightLeft, AlertTriangle, CheckSquare, Square, X, Copy, Users, Plus, Globe, FileSpreadsheet, Shield, Settings, Loader2, ShieldAlert, Box, Dna, PawPrint, Database, Crosshair, Sparkles, PartyPopper, ArrowRight } from 'lucide-react';
import RichTextEditor from '../components/RichTextEditor';
import { LanguageContext } from '../App';
import UserManager from './UserManager';
import SuperAdmin from './SuperAdmin';

declare const L: any; // Leaflet global

type Tab = 'general' | 'users' | 'system';

const OrgSettings: React.FC = () => {
  const { t } = useContext(LanguageContext);
  const locationState = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [org, setOrg] = useState<Organization | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [species, setSpecies] = useState<Species[]>([]);
  const [individuals, setIndividuals] = useState<Individual[]>([]);
  const [isSaved, setIsSaved] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);

  // Project management state
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState('');
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<Project | null>(null);
  const [migrationProjectId, setMigrationProjectId] = useState<string>('');

  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const projectsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const currentOrg = getOrg();
    setOrg(currentOrg);
    setUsers(getUsers());
    
    const allProjects = getProjects();
    const filteredProjects = allProjects.filter(p => {
       const projectOrgId = p.orgId || (p as any).org_id;
       return projectOrgId === currentOrg.id;
    });
    setProjects(filteredProjects);
    
    const allSpecies = getSpecies();
    setSpecies(allSpecies);
    setIndividuals(getIndividuals());

    // Trigger onboarding if it's a new org (0 species)
    const isNew = allSpecies.length === 0;
    const hasBeenPrompted = localStorage.getItem('os_onboarding_prompted');
    if (isNew && !hasBeenPrompted) {
      setShowOnboarding(true);
      localStorage.setItem('os_onboarding_prompted', 'true');
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'general') return;
    if (!org || !mapRef.current) return;
    if (leafletMap.current) return;

    const initialLat = (typeof org.latitude === 'number') ? org.latitude : 0;
    const initialLng = (typeof org.longitude === 'number') ? org.longitude : 0;

    const map = L.map(mapRef.current).setView([initialLat, initialLng], 10);
    leafletMap.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    if (typeof org.latitude === 'number' && typeof org.longitude === 'number') {
      markerRef.current = L.marker([org.latitude, org.longitude]).addTo(map);
    }

    map.on('click', async (e: any) => {
      const session = getSession();
      if (org?.id === 'org-1' && session?.role !== UserRole.SUPER_ADMIN) return; 
      updateMapMarker(e.latlng.lat, e.latlng.lng);
    });
    
    setTimeout(() => map.invalidateSize(), 100);
  }, [org, activeTab]);

  const updateMapMarker = async (lat: number, lng: number) => {
    if (!org || !leafletMap.current) return;
    setOrg(prev => prev ? ({ ...prev, latitude: lat, longitude: lng }) : null);
    if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
    else markerRef.current = L.marker([lat, lng]).addTo(leafletMap.current);
    leafletMap.current.panTo([lat, lng]);

    setIsGeocoding(true);
    try {
      const locationName = await reverseGeocode(lat, lng);
      if (locationName && locationName !== "Unknown Location") {
          setOrg(prev => prev ? ({ ...prev, location: locationName }) : null);
      }
    } catch (err) { console.error("Auto-location failed:", err); }
    finally { setIsGeocoding(false); }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (org) {
      saveOrg(org);
      setIsSaved(true);
      
      const isNew = species.length === 0;
      if (isNew) {
        // First save during onboarding - redirect to species
        setTimeout(() => {
          navigate('/species', { state: { onboarding: true } });
        }, 1200);
      } else {
        setTimeout(() => setIsSaved(false), 3000);
      }
    }
  };

  const handleDashboardBlockChange = (field: string, value: any) => {
     if(!org) return;
     setOrg({ ...org, dashboardBlock: { ...org.dashboardBlock, [field]: value } as any });
  };

  const handleRenameProject = (p: Project) => {
    setEditingProjectId(p.id);
    setEditingProjectName(p.name);
  };

  const handleSaveProjectName = () => {
    if (!editingProjectId || !editingProjectName.trim()) return;
    const updated = projects.map(p => p.id === editingProjectId ? { ...p, name: editingProjectName.trim() } : p);
    const allProjects = getProjects().map(p => p.id === editingProjectId ? { ...p, name: editingProjectName.trim() } : p);
    saveProjects(allProjects);
    setProjects(updated);
    setEditingProjectId(null);
  };

  const handleDeleteProject = () => {
    if (!deleteProjectTarget) return;
    const pid = deleteProjectTarget.id;
    if (migrationProjectId) {
      const updatedSpecies = species.map(s => s.projectId === pid ? { ...s, projectId: migrationProjectId } : s);
      const updatedInds = individuals.map(i => i.projectId === pid ? { ...i, projectId: migrationProjectId } : i);
      saveSpecies(updatedSpecies);
      saveIndividuals(updatedInds);
      setSpecies(updatedSpecies);
      setIndividuals(updatedInds);
    } else {
      saveSpecies(species.filter(s => s.projectId !== pid));
      saveIndividuals(individuals.filter(i => i.projectId !== pid));
      setSpecies(species.filter(s => s.projectId !== pid));
      setIndividuals(individuals.filter(i => i.projectId !== pid));
    }
    const allProjects = getProjects().filter(p => p.id !== pid);
    saveProjects(allProjects);
    setProjects(projects.filter(p => p.id !== pid));
    setDeleteProjectTarget(null);
    setMigrationProjectId('');
  };

  const session = getSession();
  const isSuperAdmin = session?.role === UserRole.SUPER_ADMIN || (session?.role as string) === 'Super Admin';
  const isDemoOrg = org?.id === 'org-1' && !isSuperAdmin;

  if (!org) return <div>Loading...</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <div>
           <h2 className="text-2xl font-bold text-slate-900">{t('orgSettings')}</h2>
           <p className="text-slate-500">{t('orgSettingsSubtitle')}</p>
        </div>
      </div>
      
      <div className="flex space-x-1 bg-slate-100 p-1 rounded-lg w-fit">
        <button onClick={() => setActiveTab('general')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'general' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}><Settings size={16} /> General</button>
        <button onClick={() => setActiveTab('users')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'users' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}><Users size={16} /> Users & Roles</button>
        {isSuperAdmin && (<button onClick={() => setActiveTab('system')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'system' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}><Shield size={16} /> System Admin</button>)}
      </div>
      
      {activeTab === 'general' && (
         <div className="space-y-8 animate-in fade-in">
            <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-slate-700">{t('orgName')}</label>
                  <input type="text" name="name" value={org.name} onChange={(e) => setOrg({...org, name: e.target.value})} disabled={isDemoOrg} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white text-slate-900 disabled:bg-slate-100" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-slate-700">{t('locationName')}</label>
                  <div className="relative">
                    <input type="text" name="location" value={org.location} onChange={(e) => setOrg({...org, location: e.target.value})} disabled={isDemoOrg || isGeocoding} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none bg-white text-slate-900 disabled:bg-slate-100" />
                    {isGeocoding && <div className="absolute right-3 top-1/2 -translate-y-1/2"><Loader2 size={16} className="animate-spin text-emerald-600"/></div>}
                  </div>
                </div>
                <div className="md:col-span-2 space-y-2">
                   <div className="flex justify-between items-center">
                     <label className="text-sm font-medium text-slate-700">{t('geoLocation')}</label>
                     <div className="flex items-center gap-4">
                        {(typeof org.latitude === 'number') && <span className="text-xs text-slate-500 font-mono">Location coordinates locked.</span>}
                     </div>
                   </div>
                   <div className="h-[300px] w-full rounded-lg border border-slate-300 overflow-hidden relative z-0">
                     <div id="map" ref={mapRef} className="h-full w-full"></div>
                   </div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-6 space-y-4">
                 <h3 className="font-medium text-slate-900 flex items-center gap-2"><Lock size={18}/> Features & Modules</h3>
                 
                 <div className="flex items-center justify-between bg-emerald-50 p-4 rounded-lg border border-emerald-100">
                    <div>
                      <h4 className="font-medium text-slate-900 flex items-center gap-2"><Box size={16} className="text-emerald-600"/> {org.focus === 'Flora' ? 'Enable Areas' : 'Enable Enclosures'}</h4>
                      <p className="text-sm text-slate-500">Enable advanced mapping and species grouping by physical location.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={org.enableEnclosures || false} onChange={() => setOrg({...org, enableEnclosures: !org.enableEnclosures})} disabled={isDemoOrg} />
                      <div className={`w-11 h-6 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${isDemoOrg ? 'bg-slate-100 opacity-50' : 'bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 peer-checked:bg-emerald-600'}`}></div>
                    </label>
                 </div>

                 <div className="flex items-center justify-between bg-red-50 p-4 rounded-lg border border-red-100">
                    <div>
                      <h4 className="font-medium text-slate-900 flex items-center gap-2"><Shield size={16} className="text-red-600"/> {t('enableOrgMfa')}</h4>
                      <p className="text-sm text-slate-500">{t('enableOrgMfaDesc')}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={org.enableMfa || false} onChange={() => setOrg({...org, enableMfa: !org.enableMfa})} disabled={isDemoOrg} />
                      <div className={`w-11 h-6 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${isDemoOrg ? 'bg-slate-100 opacity-50' : 'bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 peer-checked:bg-red-600'}`}></div>
                    </label>
                 </div>
              </div>

              <div className="border-t border-slate-100 pt-6 space-y-4">
                 <h3 className="font-medium text-slate-900 flex items-center gap-2"><LayoutTemplate size={18}/> {t('customDashBlock')}</h3>
                 <p className="text-xs text-slate-500">{t('customDashBlockDesc')}</p>
                 <div className="flex items-center gap-4 mb-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                       <input type="checkbox" className="rounded text-emerald-600" checked={org.dashboardBlock?.enabled || false} onChange={e => handleDashboardBlockChange('enabled', e.target.checked)} disabled={isDemoOrg} />
                       {t('enablePage')}
                    </label>
                 </div>
                 {org.dashboardBlock?.enabled && (
                    <div className="grid grid-cols-1 gap-4 animate-in slide-in-from-top-2">
                       <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-500 uppercase">{t('dashBlockTitle')}</label>
                          <input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900" placeholder="e.g. Weekly Sanctuary Update" value={org.dashboardBlock?.title || ''} onChange={e => handleDashboardBlockChange('title', e.target.value)} disabled={isDemoOrg} />
                       </div>
                       <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-500 uppercase">{t('dashBlockContent')}</label>
                          <RichTextEditor value={org.dashboardBlock?.content || ''} onChange={v => handleDashboardBlockChange('content', v)} height="200px" />
                       </div>
                    </div>
                 )}
              </div>

              {!isDemoOrg && (<div className="flex justify-end pt-4"><button type="submit" className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors shadow-sm"><Save size={18} /><span>{isSaved ? (species.length === 0 ? 'Proceeding...' : t('saved')) : (species.length === 0 ? t('onboardingSaveAndNext') : t('saveChanges'))}</span></button></div>)}
            </form>
         </div>
      )}

      {activeTab === 'general' && projects.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-4 animate-in fade-in">
          <h3 className="font-medium text-slate-900 flex items-center gap-2"><FolderOpen size={18}/> Project Management</h3>
          <p className="text-sm text-slate-500">Rename or delete projects. Deleting a project lets you migrate its records to another project first.</p>
          <div className="space-y-2">
            {projects.map(p => {
              const spCount = species.filter(s => s.projectId === p.id).length;
              const indCount = individuals.filter(i => i.projectId === p.id).length;
              return (
                <div key={p.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  {editingProjectId === p.id ? (
                    <input
                      className="flex-1 px-3 py-1.5 border border-emerald-400 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                      value={editingProjectName}
                      onChange={e => setEditingProjectName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveProjectName(); if (e.key === 'Escape') setEditingProjectId(null); }}
                      autoFocus
                    />
                  ) : (
                    <span className="flex-1 font-medium text-slate-800 text-sm">{p.name}</span>
                  )}
                  <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">{spCount} sp · {indCount} ind</span>
                  {editingProjectId === p.id ? (
                    <button onClick={handleSaveProjectName} className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-lg hover:bg-emerald-200">Save</button>
                  ) : (
                    <button onClick={() => handleRenameProject(p)} className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors"><Pencil size={14}/></button>
                  )}
                  <button onClick={() => { setDeleteProjectTarget(p); setMigrationProjectId(''); }} className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"><Trash2 size={14}/></button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'general' && !isDemoOrg && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-4 animate-in fade-in">
          <h3 className="font-medium text-slate-900 flex items-center gap-2"><Database size={18}/> Data Management</h3>
          <p className="text-sm text-slate-500">Export a full backup of your organisation data, or restore from a previously exported file.</p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => {
                const data = exportFullData();
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `openstudbook-backup-${new Date().toISOString().split('T')[0]}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-lg font-medium text-sm shadow-sm transition-colors"
            >
              <Download size={16}/> Export Backup
            </button>
            <label className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-5 py-2.5 rounded-lg font-medium text-sm shadow-sm transition-colors cursor-pointer">
              <Upload size={16} className="text-emerald-600"/> Import Backup
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    try {
                      const data = JSON.parse(ev.target?.result as string);
                      importFullData(data);
                      window.location.reload();
                    } catch {
                      alert('Invalid backup file. Please select a valid OpenStudBook JSON export.');
                    }
                  };
                  reader.readAsText(file);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          <p className="text-xs text-amber-600 flex items-center gap-1.5"><AlertTriangle size={12}/> Importing will overwrite all current organisation data.</p>
        </div>
      )}

      {showOnboarding && (
        <div className="fixed inset-0 z-[5000] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
           <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-300">
             <div className="p-8 text-center flex flex-col items-center">
               <div className="mb-6 p-6 bg-emerald-50 rounded-full">
                  <PartyPopper className="text-emerald-500" size={48} />
               </div>
               <h3 className="text-2xl font-black text-slate-900 mb-3">{t('onboardingWelcome')}!</h3>
               <p className="text-slate-500 mb-8 leading-relaxed px-4">{t('onboardingSettingsTask')}</p>
               <button onClick={() => setShowOnboarding(false)} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100 flex items-center justify-center gap-2">
                 Got it <ArrowRight size={20} />
               </button>
             </div>
           </div>
        </div>
      )}

      {deleteProjectTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-in zoom-in duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 text-red-600 rounded-xl"><Trash2 size={20}/></div>
              <h3 className="text-lg font-bold text-slate-900">Delete "{deleteProjectTarget.name}"?</h3>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              This project contains <strong>{species.filter(s => s.projectId === deleteProjectTarget.id).length} species</strong> and <strong>{individuals.filter(i => i.projectId === deleteProjectTarget.id).length} individuals</strong>.
              Choose what to do with them:
            </p>
            <div className="space-y-3 mb-6">
              <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input type="radio" name="migrate" checked={migrationProjectId === ''} onChange={() => setMigrationProjectId('')} className="text-red-600" />
                <div>
                  <p className="text-sm font-bold text-red-700">Delete all records</p>
                  <p className="text-xs text-slate-400">All species and individuals in this project will be permanently removed.</p>
                </div>
              </label>
              {projects.filter(p => p.id !== deleteProjectTarget.id).map(p => (
                <label key={p.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                  <input type="radio" name="migrate" checked={migrationProjectId === p.id} onChange={() => setMigrationProjectId(p.id)} className="text-emerald-600" />
                  <div>
                    <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5"><ArrowRightLeft size={13} className="text-emerald-600"/> Move to "{p.name}"</p>
                    <p className="text-xs text-slate-400">All records will be reassigned to this project.</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteProjectTarget(null)} className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold">Cancel</button>
              <button onClick={handleDeleteProject} className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold">
                {migrationProjectId ? 'Move & Delete' : 'Delete Everything'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
         <div className="animate-in fade-in">
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
               <UserManager />
            </div>
         </div>
      )}

      {activeTab === 'system' && isSuperAdmin && (
         <div className="animate-in fade-in">
            <SuperAdmin />
         </div>
      )}
    </div>
  );
};

export default OrgSettings;