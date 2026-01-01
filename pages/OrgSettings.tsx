
import React, { useState, useEffect, useRef, useContext } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { getOrg, saveOrg, exportFullData, importFullData, getUsers, getProjects, saveProjects, getSpecies, saveSpecies, getIndividuals, saveIndividuals, getCurrentProjectId, saveCurrentProjectId, exportDataAsCSV, getSession } from '../services/storage';
import { reverseGeocode } from '../services/geminiService';
import { Organization, User, Project, Species, Individual, UserRole } from '../types';
// Fix: Added missing Dna, PawPrint, Database imports
import { Save, Download, Upload, AlertCircle, Check, MapPin, Lock, HeartHandshake, EyeOff, LayoutTemplate, Briefcase, Trash2, Pencil, FolderOpen, ArrowRightLeft, AlertTriangle, CheckSquare, Square, X, Copy, Users, Plus, Globe, FileSpreadsheet, Shield, Settings, Loader2, ShieldAlert, Box, Dna, PawPrint, Database } from 'lucide-react';
import RichTextEditor from '../components/RichTextEditor';
import { LanguageContext } from '../App';
import UserManager from './UserManager';
import SuperAdmin from './SuperAdmin';

declare const L: any; // Leaflet global

type Tab = 'general' | 'users' | 'system';

const OrgSettings: React.FC = () => {
  const { t } = useContext(LanguageContext);
  const locationState = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [org, setOrg] = useState<Organization | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [species, setSpecies] = useState<Species[]>([]);
  const [individuals, setIndividuals] = useState<Individual[]>([]);
  const [isSaved, setIsSaved] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  
  // Project Management State
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  // Fix: Added missing editingId and setEditingId for project row inline editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [transferTargetId, setTransferTargetId] = useState<string>('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectData, setNewProjectData] = useState({ name: '', description: '' });

  // Data Transfer Modal State
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferSourceId, setTransferSourceId] = useState<string | null>(null);
  const [transferTargetIdModal, setTransferTargetIdModal] = useState<string>('');
  const [transferMode, setTransferMode] = useState<'species' | 'individuals'>('species');
  const [selectedTransferItems, setSelectedTransferItems] = useState<Set<string>>(new Set());

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
    
    setSpecies(getSpecies());
    setIndividuals(getIndividuals());
  }, []);

  useEffect(() => {
    if (locationState.state?.scrollTo === 'projects' && projectsRef.current) {
      setActiveTab('general');
      setTimeout(() => {
         projectsRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 500);
    }
  }, [locationState, projects]);

  useEffect(() => {
    if (activeTab !== 'general') return;
    if (!org || !mapRef.current) return;
    
    if (leafletMap.current) return;

    const initialLat = (typeof org.latitude === 'number') ? org.latitude : 45.5152;
    const initialLng = (typeof org.longitude === 'number') ? org.longitude : -122.6784;

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
      const isSuperAdmin = session?.role === UserRole.SUPER_ADMIN;
      if (org?.id === 'org-1' && !isSuperAdmin) return; 

      if (!e || !e.latlng) return;
      const { lat, lng } = e.latlng;
      
      setOrg(prev => prev ? ({ ...prev, latitude: lat, longitude: lng }) : null);

      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        markerRef.current = L.marker([lat, lng]).addTo(map);
      }

      setIsGeocoding(true);
      try {
        const locationName = await reverseGeocode(lat, lng);
        setOrg(prev => prev ? ({ ...prev, location: locationName }) : null);
      } catch (err) {
        console.error("Auto-location failed:", err);
      } finally {
        setIsGeocoding(false);
      }
    });
    
    setTimeout(() => map.invalidateSize(), 100);

  }, [org, activeTab]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    if (!org) return;
    setOrg({
      ...org,
      [e.target.name]: e.target.value
    });
  };

  const handleDashboardBlockChange = (field: string, value: any) => {
     if(!org) return;
     setOrg({
        ...org,
        dashboardBlock: {
           enabled: org.dashboardBlock?.enabled || false,
           title: org.dashboardBlock?.title || '',
           content: org.dashboardBlock?.content || '',
           ...{ [field]: value }
        }
     });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (org) {
      saveOrg(org);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    }
  };

  const handleExport = () => {
    const data = exportFullData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openstudbook-full-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    const csvContent = exportDataAsCSV();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openstudbook-export-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        importFullData(json);
        setImportSuccess(true);
        setImportError(null);
        setTimeout(() => window.location.reload(), 1500);
      } catch (err) {
        setImportError('Failed to import data. Invalid file format.');
        setImportSuccess(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };
  
  const handleCreateProject = () => {
     if(!newProjectData.name || !org) return;
     const newProject: Project = {
        id: `p-${Date.now()}`,
        name: newProjectData.name,
        description: newProjectData.description,
        orgId: org.id
     };
     const allProjects = [...getProjects(), newProject];
     saveProjects(allProjects);
     setProjects(allProjects.filter(p => (p.orgId || (p as any).org_id) === org.id));
     setNewProjectData({ name: '', description: '' });
     setIsCreatingProject(false);
  };

  const handleUpdateProject = (id: string, name: string, description: string) => {
     const allProjects = getProjects().map(p => p.id === id ? { ...p, name, description } : p);
     saveProjects(allProjects);
     if (org) {
       setProjects(allProjects.filter(p => (p.orgId || (p as any).org_id) === org.id));
     }
     setEditingId(null);
  };

  const handleProjectDeleteFlow = (project: Project) => {
     setProjectToDelete(project);
     const sCount = species.filter(s => s.projectId === project.id).length;
     const iCount = individuals.filter(i => i.projectId === project.id).length;
     if (sCount > 0 || iCount > 0) {
        const target = projects.find(p => p.id !== project.id);
        if (target) setTransferTargetId(target.id);
        else setTransferTargetId('');
     } else {
        setTransferTargetId('');
     }
  };

  const confirmDeleteProject = (transferData: boolean) => {
     if (!projectToDelete || !org) return;
     const isDeletingActive = projectToDelete.id === getCurrentProjectId();
     if (transferData && transferTargetId) {
        const updatedSpecies = getSpecies().map(s => s.projectId === projectToDelete.id ? { ...s, projectId: transferTargetId } : s);
        saveSpecies(updatedSpecies);
        setSpecies(updatedSpecies);
        const updatedInds = getIndividuals().map(i => i.projectId === projectToDelete.id ? { ...i, projectId: transferTargetId } : i);
        saveIndividuals(updatedInds);
        setIndividuals(updatedInds);
     } else if (!transferData) {
        const updatedSpecies = getSpecies().filter(s => s.projectId !== projectToDelete.id);
        saveSpecies(updatedSpecies);
        setSpecies(updatedSpecies);
        const updatedInds = getIndividuals().filter(i => i.projectId !== projectToDelete.id);
        saveIndividuals(updatedInds);
        setIndividuals(updatedInds);
     }
     const allProjects = getProjects().filter(p => p.id !== projectToDelete.id);
     saveProjects(allProjects);
     setProjects(allProjects.filter(p => (p.orgId || (p as any).org_id) === org.id));
     if (isDeletingActive) {
        const remainingForOrg = allProjects.filter(p => (p.orgId || (p as any).org_id) === org.id);
        if (remainingForOrg.length > 0) saveCurrentProjectId(remainingForOrg[0].id);
        else saveCurrentProjectId('');
        window.location.reload();
        return;
     }
     setProjectToDelete(null);
     setTransferTargetId('');
  };

  const openTransferModal = (projectId: string) => {
    setTransferSourceId(projectId);
    const targets = projects.filter(p => p.id !== projectId);
    if(targets.length > 0) setTransferTargetIdModal(targets[0].id);
    setTransferMode('species');
    setSelectedTransferItems(new Set());
    setShowTransferModal(true);
  };

  const toggleTransferItem = (id: string) => {
    const newSet = new Set(selectedTransferItems);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedTransferItems(newSet);
  };
  
  const toggleAllTransferItems = (items: {id: string}[]) => {
     if (selectedTransferItems.size === items.length) setSelectedTransferItems(new Set());
     else setSelectedTransferItems(new Set(items.map(i => i.id)));
  };

  const handleExecuteTransfer = () => {
     if (!transferSourceId || !transferTargetIdModal) return;
     if (selectedTransferItems.size === 0) return;
     let updatedSpecies = getSpecies();
     let updatedIndividuals = getIndividuals();
     if (transferMode === 'species') {
        updatedSpecies = updatedSpecies.map(s => {
           if (selectedTransferItems.has(s.id)) return { ...s, projectId: transferTargetIdModal };
           return s;
        });
        updatedIndividuals = updatedIndividuals.map(i => {
           if (selectedTransferItems.has(i.speciesId)) return { ...i, projectId: transferTargetIdModal };
           return i;
        });
     } else {
        const indsToMove = updatedIndividuals.filter(i => selectedTransferItems.has(i.id));
        const speciesGroups = new Set(indsToMove.map(i => i.speciesId));
        speciesGroups.forEach(sourceSpeciesId => {
           const sourceSpecies = updatedSpecies.find(s => s.id === sourceSpeciesId);
           if (!sourceSpecies) return;
           const targetSpeciesMatch = updatedSpecies.find(s => s.projectId === transferTargetIdModal && s.scientificName === sourceSpecies.scientificName);
           let finalSpeciesId = targetSpeciesMatch?.id;
           if (!finalSpeciesId) {
              const newSpeciesId = `sp-${Date.now()}-${Math.floor(Math.random()*1000)}`;
              const newSpecies: Species = { ...sourceSpecies, id: newSpeciesId, projectId: transferTargetIdModal };
              updatedSpecies.push(newSpecies);
              finalSpeciesId = newSpeciesId;
           }
           updatedIndividuals = updatedIndividuals.map(i => {
              if (i.speciesId === sourceSpeciesId && selectedTransferItems.has(i.id)) return { ...i, projectId: transferTargetIdModal, speciesId: finalSpeciesId! };
              return i;
           });
        });
     }
     saveSpecies(updatedSpecies);
     setSpecies(updatedSpecies);
     saveIndividuals(updatedIndividuals);
     setIndividuals(updatedIndividuals);
     setShowTransferModal(false);
     setSelectedTransferItems(new Set());
  };

  if (!org) return <div>Loading...</div>;

  const speciesInDeleteTarget = projectToDelete ? species.filter(s => s.projectId === projectToDelete.id).length : 0;
  const indsInDeleteTarget = projectToDelete ? individuals.filter(i => i.projectId === projectToDelete.id).length : 0;
  const hasDataToDelete = speciesInDeleteTarget > 0 || indsInDeleteTarget > 0;
  const transferListSpecies = transferSourceId ? species.filter(s => s.projectId === transferSourceId) : [];
  const transferListInds = transferSourceId ? individuals.filter(i => i.projectId === transferSourceId) : [];
  const session = getSession();
  const isSuperAdmin = session?.role === UserRole.SUPER_ADMIN || (session?.role as string) === 'Super Admin';
  const isDemoOrg = org.id === 'org-1' && !isSuperAdmin;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <div>
           <h2 className="text-2xl font-bold text-slate-900">{t('orgSettings')}</h2>
           <p className="text-slate-500">Manage your organization details, users, and system configuration.</p>
        </div>
      </div>
      
      <div className="flex space-x-1 bg-slate-100 p-1 rounded-lg w-fit">
        <button onClick={() => setActiveTab('general')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'general' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}><Settings size={16} /> General</button>
        <button onClick={() => setActiveTab('users')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'users' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}><Users size={16} /> Users & Roles</button>
        {isSuperAdmin && (<button onClick={() => setActiveTab('system')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'system' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}><Shield size={16} /> System Admin</button>)}
      </div>
      
      {isDemoOrg && (
         <div className="bg-amber-50 text-amber-800 p-4 rounded-lg border border-amber-200 flex items-start gap-3">
            <AlertTriangle className="flex-shrink-0 mt-0.5" size={20} />
            <div>
               <h3 className="font-bold">Demo Mode: Read Only</h3>
               <p className="text-sm">You are viewing the shared demo organization. Settings cannot be modified here.</p>
            </div>
         </div>
      )}

      {activeTab === 'general' && (
         <div className="space-y-8 animate-in fade-in">
            <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">{t('orgName')}</label>
                  <input type="text" name="name" value={org.name} onChange={handleChange} disabled={isDemoOrg} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all bg-white text-slate-900 disabled:bg-slate-100 disabled:text-slate-500" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">{t('foundedYear')}</label>
                  <input type="number" name="foundedYear" value={org.foundedYear} onChange={handleChange} disabled={isDemoOrg} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all bg-white text-slate-900 disabled:bg-slate-100 disabled:text-slate-500" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-slate-700">{t('locationName')}</label>
                  <div className="relative">
                    <input type="text" name="location" value={org.location} onChange={handleChange} disabled={isDemoOrg || isGeocoding} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all bg-white text-slate-900 disabled:bg-slate-100 disabled:text-slate-500" />
                    {isGeocoding && <div className="absolute right-3 top-1/2 -translate-y-1/2"><Loader2 size={16} className="animate-spin text-emerald-600"/></div>}
                  </div>
                </div>
                <div className="md:col-span-2 space-y-2">
                   <div className="flex justify-between items-center">
                     <label className="text-sm font-medium text-slate-700">{t('geoLocation')}</label>
                     {(typeof org.latitude === 'number') && <span className="text-xs text-slate-500 font-mono">Lat: {org.latitude.toFixed(4)}, Lng: {org.longitude?.toFixed(4)}</span>}
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
                      <h4 className="font-medium text-slate-900 flex items-center gap-2"><Box size={16} className="text-emerald-600"/> {org.focus === 'Plants' ? 'Enable Areas' : 'Enable Enclosures'}</h4>
                      <p className="text-sm text-slate-500">Enable advanced mapping and species grouping by physical location.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={org.enableEnclosures || false} onChange={() => setOrg({...org, enableEnclosures: !org.enableEnclosures})} disabled={isDemoOrg} />
                      <div className={`w-11 h-6 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${isDemoOrg ? 'bg-slate-100 opacity-50' : 'bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 peer-checked:bg-emerald-600'}`}></div>
                    </label>
                 </div>

                 <div className="flex items-center justify-between bg-red-50 p-4 rounded-lg border border-red-100">
                    <div>
                      <h4 className="font-medium text-slate-900 flex items-center gap-2"><ShieldAlert size={16} className="text-red-600"/> {t('enableOrgMfa')}</h4>
                      <p className="text-sm text-slate-500">{t('enableOrgMfaDesc')}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={org.enableMfa || false} onChange={() => setOrg({...org, enableMfa: !org.enableMfa})} disabled={isDemoOrg} />
                      <div className={`w-11 h-6 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${isDemoOrg ? 'bg-slate-100 opacity-50' : 'bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 peer-checked:bg-red-600'}`}></div>
                    </label>
                 </div>
              </div>

              <div className="border-t border-slate-100 pt-6 space-y-4">
                <h3 className="font-medium text-slate-900 flex items-center gap-2"><HeartHandshake size={18}/> {t('breedingLoanPolicy')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <div>
                        <h4 className="font-medium text-slate-900">{t('allowBreedingRequests')}</h4>
                        <p className="text-xs text-slate-500">{t('allowBreedingRequestsDesc')}</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={org.allowBreedingRequests} onChange={() => setOrg({...org, allowBreedingRequests: !org.allowBreedingRequests})} disabled={isDemoOrg} />
                        <div className={`w-11 h-6 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${isDemoOrg ? 'bg-slate-100 opacity-50' : 'bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 peer-checked:bg-emerald-600'}`}></div>
                      </label>
                   </div>
                   {org.allowBreedingRequests && (
                     <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">{t('whoReceivesRequests')}</label>
                        <select className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900" value={org.breedingRequestContactId} name="breedingRequestContactId" onChange={handleChange} disabled={isDemoOrg}>
                           <option value="">Select User...</option>
                           {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                        </select>
                        <p className="text-[10px] text-slate-400">{t('whoReceivesRequestsDesc')}</p>
                     </div>
                   )}
                </div>
              </div>

              <div className="border-t border-slate-100 pt-6 space-y-4">
                <h3 className="font-medium text-slate-900 flex items-center gap-2"><EyeOff size={18}/> {t('visibilityPrivacy')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex-1">
                        <h4 className="font-medium text-slate-900">{t('orgVisibility')}</h4>
                        <p className="text-xs text-slate-500">{t('orgVisibilityDesc')}</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer ml-4">
                        <input type="checkbox" className="sr-only peer" checked={org.isOrgPublic} onChange={() => setOrg({...org, isOrgPublic: !org.isOrgPublic})} disabled={isDemoOrg} />
                        <div className={`w-11 h-6 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${isDemoOrg ? 'bg-slate-100 opacity-50' : 'bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 peer-checked:bg-emerald-600'}`}></div>
                      </label>
                   </div>
                   <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex-1">
                        <h4 className="font-medium text-slate-900">{t('obscureLocation')}</h4>
                        <p className="text-xs text-slate-500">{t('obscureLocationDesc')}</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer ml-4">
                        <input type="checkbox" className="sr-only peer" checked={org.obscureLocation} onChange={() => setOrg({...org, obscureLocation: !org.obscureLocation})} disabled={isDemoOrg} />
                        <div className={`w-11 h-6 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${isDemoOrg ? 'bg-slate-100 opacity-50' : 'bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 peer-checked:bg-emerald-600'}`}></div>
                      </label>
                   </div>
                   <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex-1">
                        <h4 className="font-medium text-slate-900">{t('speciesListVisibility')}</h4>
                        <p className="text-xs text-slate-500">{t('speciesListVisibilityDesc')}</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer ml-4">
                        <input type="checkbox" className="sr-only peer" checked={org.isSpeciesPublic} onChange={() => setOrg({...org, isSpeciesPublic: !org.isSpeciesPublic})} disabled={isDemoOrg} />
                        <div className={`w-11 h-6 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${isDemoOrg ? 'bg-slate-100 opacity-50' : 'bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 peer-checked:bg-emerald-600'}`}></div>
                      </label>
                   </div>
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

              {!isDemoOrg && (<div className="flex justify-end pt-4"><button type="submit" className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors shadow-sm"><Save size={18} /><span>{isSaved ? t('saved') : t('saveChanges')}</span></button></div>)}
            </form>

            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-6" ref={projectsRef}>
               <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="font-bold text-lg text-slate-900">{t('projectManagement')}</h3>
                    <p className="text-sm text-slate-500">{t('projectManagementDesc')}</p>
                  </div>
                  {!isDemoOrg && (<button onClick={() => setIsCreatingProject(true)} className="flex items-center gap-1.5 text-sm font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-4 py-2 rounded-lg transition-colors"><Plus size={18}/> {t('createProject')}</button>)}
               </div>

               <div className="grid gap-4">
                  {isCreatingProject && (
                    <div className="border-2 border-emerald-500 border-dashed rounded-xl p-6 bg-emerald-50 space-y-4 animate-in zoom-in duration-200">
                       <h4 className="font-bold text-emerald-800">New Project Definition</h4>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1"><label className="text-xs font-bold text-emerald-700 uppercase">Project Name</label><input className="w-full px-4 py-2 border border-emerald-300 rounded-lg bg-white" placeholder="e.g. Forest Sanctuary" value={newProjectData.name} onChange={e => setNewProjectData({...newProjectData, name: e.target.value})} autoFocus /></div>
                          <div className="space-y-1"><label className="text-xs font-bold text-emerald-700 uppercase">Description</label><input className="w-full px-4 py-2 border border-emerald-300 rounded-lg bg-white" placeholder="Purpose of this collection" value={newProjectData.description} onChange={e => setNewProjectData({...newProjectData, description: e.target.value})} /></div>
                       </div>
                       <div className="flex justify-end gap-3"><button onClick={() => setIsCreatingProject(false)} className="px-4 py-2 text-slate-600 hover:bg-white rounded-lg">Cancel</button><button onClick={handleCreateProject} disabled={!newProjectData.name} className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-bold shadow-md hover:bg-emerald-700 disabled:opacity-50">Confirm & Create</button></div>
                    </div>
                  )}

                  {projects.map(p => (
                    <div key={p.id} className="border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row justify-between items-center gap-4 hover:shadow-md transition-all group">
                       <div className="flex items-center gap-4 flex-1">
                          <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors"><Briefcase size={24}/></div>
                          <div>
                             {editingId === p.id ? (
                                <div className="flex gap-2">
                                   <input className="px-3 py-1 border border-emerald-500 rounded text-sm font-bold" value={p.name} onChange={e => handleUpdateProject(p.id, e.target.value, p.description || '')} />
                                   <button onClick={() => setEditingId(null)} className="p-1 text-slate-400"><X size={16}/></button>
                                </div>
                             ) : (
                                <h4 className="font-bold text-slate-900 flex items-center gap-2">{p.name} {p.id === getCurrentProjectId() && <span className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0.5 rounded font-extrabold uppercase tracking-widest">{t('current')}</span>}</h4>
                             )}
                             <p className="text-xs text-slate-500">{p.description || "Project collection manager"}</p>
                             <div className="flex gap-4 mt-2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1"><Dna size={10}/> {species.filter(s => s.projectId === p.id).length} Species</span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1"><PawPrint size={10}/> {individuals.filter(i => i.projectId === p.id).length} Individuals</span>
                             </div>
                          </div>
                       </div>
                       <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {!isDemoOrg && (
                            <>
                              <button onClick={() => openTransferModal(p.id)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title={t('transferData')}><ArrowRightLeft size={18}/></button>
                              <button onClick={() => handleProjectDeleteFlow(p)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title={t('deleteProject')}><Trash2 size={18}/></button>
                            </>
                          )}
                       </div>
                    </div>
                  ))}
               </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-6">
              <div>
                <h3 className="font-bold text-lg text-slate-900">{t('dataManagement')}</h3>
                <p className="text-sm text-slate-500">{t('dataManagementDesc')}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-5 border border-slate-200 rounded-xl space-y-4 hover:border-emerald-200 hover:shadow-md transition-all group">
                   <div className="flex items-start justify-between">
                     <div className="p-3 bg-emerald-50 rounded-lg text-emerald-600"><Database size={24}/></div>
                     <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded uppercase tracking-widest group-hover:bg-emerald-600 group-hover:text-white transition-colors">Safety First</span>
                   </div>
                   <div>
                     <h4 className="font-bold text-slate-900">{t('fullBackup')}</h4>
                     <p className="text-sm text-slate-500 leading-relaxed">{t('fullBackupDesc')}</p>
                   </div>
                   <div className="flex gap-3 pt-2">
                     <button onClick={handleExport} className="flex-1 flex items-center justify-center space-x-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-lg font-medium transition-all shadow-sm"><Download size={18} /><span>{t('downloadJson')}</span></button>
                     <button onClick={() => document.getElementById('import-file')?.click()} className="flex items-center justify-center p-2.5 bg-white border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-emerald-600 transition-colors shadow-sm" title={t('importBackup')}><Upload size={20} /></button>
                     <input id="import-file" type="file" accept=".json" onChange={handleImport} className="hidden" />
                   </div>
                   {importSuccess && <div className="p-3 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-1"><Check size={16} /> Import successful! Reloading...</div>}
                   {importError && <div className="p-3 bg-red-50 text-red-700 text-xs font-medium rounded-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-1"><AlertCircle size={16} /> {importError}</div>}
                </div>

                <div className="p-5 border border-slate-200 rounded-xl space-y-4 hover:border-blue-200 hover:shadow-md transition-all group">
                   <div className="flex items-start justify-between">
                     <div className="p-3 bg-blue-50 rounded-lg text-blue-600"><FileSpreadsheet size={24}/></div>
                     <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded uppercase tracking-widest group-hover:bg-blue-600 group-hover:text-white transition-colors">Analysis</span>
                   </div>
                   <div>
                     <h4 className="font-bold text-slate-900">{t('dataExport')}</h4>
                     <p className="text-sm text-slate-500 leading-relaxed">{t('dataExportDesc')}</p>
                   </div>
                   <div className="pt-2">
                      <button onClick={handleExportCSV} className="w-full flex items-center justify-center space-x-2 bg-white border-2 border-slate-900 text-slate-900 hover:bg-slate-50 px-4 py-2.5 rounded-lg font-bold transition-all"><Download size={18} /><span>{t('downloadCsv')}</span></button>
                   </div>
                </div>
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

      {/* Delete Project Modal */}
      {projectToDelete && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-md w-full overflow-hidden animate-in zoom-in duration-200">
               <div className="p-6 border-b border-red-100 bg-red-50 flex items-center gap-3 text-red-800">
                  <AlertTriangle size={28} />
                  <h3 className="text-xl font-bold">{t('deleteProject')}?</h3>
               </div>
               <div className="p-6 space-y-4">
                  <p className="text-slate-700 font-medium">You are about to delete the project: <strong className="text-red-600">{projectToDelete.name}</strong></p>
                  
                  {hasDataToDelete ? (
                     <div className="space-y-4">
                        <div className="p-4 bg-amber-50 rounded-lg border border-amber-200 space-y-2">
                           <p className="text-sm text-amber-900 font-bold">Data found in this project:</p>
                           <ul className="text-xs text-amber-800 space-y-1 list-disc list-inside">
                              <li>{speciesInDeleteTarget} Species definitions</li>
                              <li>{indsInDeleteTarget} Individual records</li>
                           </ul>
                        </div>

                        <div className="space-y-3">
                           <p className="text-sm font-bold text-slate-900">What would you like to do with this data?</p>
                           {projects.length > 1 ? (
                              <div className="space-y-3">
                                 <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                                    <input type="radio" name="deleteMode" value="transfer" checked={transferTargetId !== ''} onChange={() => setTransferTargetId(projects.find(p => p.id !== projectToDelete.id)?.id || '')} className="text-emerald-600" />
                                    <div>
                                       <span className="text-sm font-bold block">Transfer data to another project</span>
                                       <select className="mt-1 text-xs border border-slate-300 rounded px-2 py-1 outline-none" value={transferTargetId} onChange={e => setTransferTargetId(e.target.value)} disabled={transferTargetId === ''}>
                                          {projects.filter(p => p.id !== projectToDelete.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                       </select>
                                    </div>
                                 </label>
                                 <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-red-50 transition-colors">
                                    <input type="radio" name="deleteMode" value="destroy" checked={transferTargetId === ''} onChange={() => setTransferTargetId('')} className="text-red-600" />
                                    <span className="text-sm font-bold text-red-600">Permanently destroy all data in this project</span>
                                 </label>
                              </div>
                           ) : (
                              <p className="text-xs text-red-600 font-bold bg-red-50 p-3 rounded border border-red-100 italic">This is your only project. Deleting it will permanently destroy all associated data records.</p>
                           )}
                        </div>
                     </div>
                  ) : (
                     <p className="text-sm text-slate-500">This project is empty. It can be safely removed.</p>
                  )}
               </div>
               <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                  <button onClick={() => setProjectToDelete(null)} className="px-6 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-bold">Cancel</button>
                  <button onClick={() => confirmDeleteProject(transferTargetId !== '')} className="px-6 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 shadow-md">Confirm Delete</button>
               </div>
            </div>
         </div>
      )}

      {/* Transfer Data Modal */}
      {showTransferModal && transferSourceId && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in duration-200">
               <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><ArrowRightLeft size={20} className="text-blue-600"/> {t('transferData')}</h3>
                  <button onClick={() => setShowTransferModal(false)} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors"><X size={24}/></button>
               </div>
               
               <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-400 uppercase">From Project</label>
                        <div className="px-4 py-2 bg-slate-100 rounded-lg text-sm font-bold text-slate-600">{projects.find(p => p.id === transferSourceId)?.name}</div>
                     </div>
                     <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-400 uppercase">To Project</label>
                        <select className="w-full px-4 py-2 border border-blue-500 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-blue-200" value={transferTargetIdModal} onChange={e => setTransferTargetIdModal(e.target.value)}>
                           {projects.filter(p => p.id !== transferSourceId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                     </div>
                  </div>

                  <div className="space-y-4">
                     <div className="flex bg-slate-100 p-1 rounded-lg w-fit">
                        <button onClick={() => { setTransferMode('species'); setSelectedTransferItems(new Set()); }} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${transferMode === 'species' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>Species Mode</button>
                        <button onClick={() => { setTransferMode('individuals'); setSelectedTransferItems(new Set()); }} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${transferMode === 'individuals' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>Individual Mode</button>
                     </div>

                     <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                           <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">{transferMode === 'species' ? 'Select Species to Move' : 'Select Individuals to Move'}</span>
                           <button onClick={() => toggleAllTransferItems(transferMode === 'species' ? transferListSpecies : transferListInds)} className="text-[10px] font-bold text-blue-600 hover:underline">Select All</button>
                        </div>
                        <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
                           {transferMode === 'species' ? (
                              transferListSpecies.length === 0 ? <p className="p-8 text-center text-slate-400 text-sm">No species in source project.</p> : (
                                 transferListSpecies.map(s => (
                                    <label key={s.id} className="flex items-center gap-4 p-4 hover:bg-slate-50 cursor-pointer transition-colors group">
                                       <input type="checkbox" checked={selectedTransferItems.has(s.id)} onChange={() => toggleTransferItem(s.id)} className="rounded text-blue-600" />
                                       <div className="flex-1">
                                          <p className="text-sm font-bold text-slate-900">{s.commonName}</p>
                                          <p className="text-xs text-slate-500 italic">{s.scientificName}</p>
                                       </div>
                                       <span className="text-[10px] font-bold bg-slate-100 text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-600 px-2 py-1 rounded transition-colors">{individuals.filter(i => i.speciesId === s.id).length} INDS</span>
                                    </label>
                                 ))
                              )
                           ) : (
                              transferListInds.length === 0 ? <p className="p-8 text-center text-slate-400 text-sm">No individuals in source project.</p> : (
                                 transferListInds.map(i => {
                                    const sp = species.find(s => s.id === i.speciesId);
                                    return (
                                       <label key={i.id} className="flex items-center gap-4 p-4 hover:bg-slate-50 cursor-pointer transition-colors group">
                                          <input type="checkbox" checked={selectedTransferItems.has(i.id)} onChange={() => toggleTransferItem(i.id)} className="rounded text-blue-600" />
                                          <div className="flex-1">
                                             <p className="text-sm font-bold text-slate-900">{i.name}</p>
                                             <p className="text-[10px] text-slate-500 uppercase tracking-widest">{sp?.commonName || 'Unknown'}</p>
                                          </div>
                                          <span className="text-[10px] font-mono text-slate-400">{i.studbookId}</span>
                                       </label>
                                    );
                                 })
                              )
                           )}
                        </div>
                     </div>
                     <p className="text-[10px] text-slate-400 italic"><strong>Note:</strong> Transferring a species also transfers all associated individuals automatically. Transferring an individual will auto-create the species record in the target project if it doesn't already exist.</p>
                  </div>
               </div>
               
               <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-600">{selectedTransferItems.size} items selected</span>
                  <div className="flex gap-3">
                     <button onClick={() => setShowTransferModal(false)} className="px-6 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-bold">Cancel</button>
                     <button onClick={handleExecuteTransfer} disabled={selectedTransferItems.size === 0} className="px-8 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-md disabled:opacity-50 disabled:cursor-not-allowed">Execute Transfer</button>
                  </div>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default OrgSettings;
