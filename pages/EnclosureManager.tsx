
import React, { useState, useEffect, useContext, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { getEnclosures, saveEnclosures, getSpecies, getIndividuals, getOrg, getCurrentProjectId, saveIndividuals, getProjects } from '../services/storage';
import { Enclosure, Species, Individual, EnclosurePoint, Sex, Project } from '../types';
import { Plus, Search, MapPin, Box, Trash2, Pencil, X, Map as MapIcon, List, Eye, Info, Save, ChevronRight, Dna, Activity, LocateFixed, Trash, MousePointer2, Users, CheckCircle, ArrowRight, ExternalLink, AlertTriangle, AlertCircle, ArrowRightLeft, Move, Navigation, Loader2, Layers, FolderOpen } from 'lucide-react';
import { LanguageContext } from '../App';

declare const L: any;

interface EnclosureManagerProps {
  currentProjectId: string;
}

const EnclosureManager: React.FC<EnclosureManagerProps> = ({ currentProjectId }) => {
  const { t } = useContext(LanguageContext);
  const location = useLocation();
  const org = getOrg();
  const isPlantOrg = org.focus === 'Plants';
  const label = isPlantOrg ? 'Area' : 'Enclosure';
  const labelsPlural = isPlantOrg ? 'Areas' : 'Enclosures';

  const [enclosures, setEnclosures] = useState<Enclosure[]>([]);
  const [allSpecies, setAllSpecies] = useState<Species[]>([]);
  const [allIndividuals, setAllIndividuals] = useState<Individual[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedEnclosure, setSelectedEnclosure] = useState<Enclosure | null>(null);
  const [enclosureToDelete, setEnclosureToDelete] = useState<Enclosure | null>(null);
  
  const [selectedSpeciesId, setSelectedSpeciesId] = useState<string>('');

  const [formData, setFormData] = useState<Partial<Enclosure>>({
    name: '',
    description: '',
    boundary: [],
    individualIds: [],
    projectId: currentProjectId === 'ALL_PROJECTS' ? '' : currentProjectId
  });

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);

  useEffect(() => {
    const encls = getEnclosures();
    setEnclosures(encls);
    setAllSpecies(getSpecies());
    setAllIndividuals(getIndividuals());
    setProjects(getProjects());

    if (location.state?.editId) {
      const found = encls.find(e => e.id === location.state.editId);
      if (found) {
        setEditingId(found.id);
        setFormData(found);
        setShowForm(true);
        window.history.replaceState({}, document.title);
      }
    }
  }, [location.state, currentProjectId]);

  const isAll = currentProjectId === 'ALL_PROJECTS';
  const filteredEnclosures = enclosures.filter(e => {
    const matchesProject = isAll || (e.projectId === currentProjectId);
    const matchesSearch = e.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesProject && matchesSearch;
  });

  // Main Map View Effect
  useEffect(() => {
    if (viewMode === 'map' && mapContainerRef.current && !mapInstanceRef.current) {
      const initialLat = typeof org.latitude === 'number' ? org.latitude : 0;
      const initialLng = typeof org.longitude === 'number' ? org.longitude : 0;
      const map = L.map(mapContainerRef.current, { maxZoom: 22, zoomControl: false }).setView([initialLat, initialLng], 16);
      L.control.zoom({ position: 'topright' }).addTo(map);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 22 }).addTo(map);
      markersLayerRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
      setTimeout(() => map.invalidateSize(), 200);
    }
    return () => { if (mapInstanceRef.current && viewMode !== 'map') { mapInstanceRef.current.remove(); mapInstanceRef.current = null; } };
  }, [viewMode, org]);

  useEffect(() => {
    if (viewMode === 'map' && mapInstanceRef.current && markersLayerRef.current) {
      const layer = markersLayerRef.current;
      const map = mapInstanceRef.current;
      layer.clearLayers();
      filteredEnclosures.forEach(enc => {
        if (enc.boundary && enc.boundary.length >= 3) {
          const isSelected = selectedEnclosure?.id === enc.id;
          const poly = L.polygon(enc.boundary.map(p => [p.lat, p.lng]), { color: isSelected ? '#3b82f6' : '#9333ea', fillColor: isSelected ? '#3b82f6' : '#9333ea', fillOpacity: isSelected ? 0.4 : 0.2, weight: isSelected ? 3 : 2 }).addTo(layer);
          poly.on('click', (e: any) => { L.DomEvent.stopPropagation(e); setSelectedEnclosure(enc); map.flyToBounds(poly.getBounds(), { padding: [50, 50], duration: 1 }); });
          if (!isSelected) poly.bindTooltip(enc.name, { permanent: true, direction: 'center', className: 'bg-white/90 border-none shadow-sm px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-700 cursor-pointer' });
        }
      });
    }
  }, [viewMode, filteredEnclosures, selectedEnclosure]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const newEnc: Enclosure = {
      ...formData as Enclosure,
      id: editingId || `enc-${Date.now()}`,
      orgId: org.id,
      individualIds: formData.individualIds || [],
      projectId: formData.projectId || (isAll ? '' : currentProjectId)
    };
    const updated = editingId ? enclosures.map(enc => enc.id === editingId ? newEnc : enc) : [...enclosures, newEnc];
    setEnclosures(updated);
    saveEnclosures(updated);
    setShowForm(false);
    setEditingId(null);
    setSelectedEnclosure(null);
  };

  const toggleIndividual = (id: string) => {
    const current = formData.individualIds || [];
    if (current.includes(id)) setFormData({ ...formData, individualIds: current.filter(cid => cid !== id) });
    else setFormData({ ...formData, individualIds: [...current, id] });
  };

  const projectSpecies = allSpecies.filter(s => isAll ? true : s.projectId === currentProjectId);
  const speciesIndividuals = allIndividuals.filter(i => i.speciesId === selectedSpeciesId && (isAll ? true : i.projectId === currentProjectId));

  const getEnclosureProjectName = (enc: Enclosure) => {
     if(!enc.projectId) return 'Global/Organization-Wide';
     return projects.find(p => p.id === enc.projectId)?.name || 'Unknown Project';
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 flex-shrink-0">
        <div>
          <div className="flex items-center gap-3 mb-1">
             <h2 className="text-2xl font-bold text-slate-900">{labelsPlural}</h2>
             <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border border-purple-200">
               {isAll ? <Layers size={14}/> : <FolderOpen size={14} />}
               {isAll ? 'Organization-Wide View' : (projects.find(p=>p.id===currentProjectId)?.name || 'Project')}
             </span>
          </div>
          <p className="text-slate-500">Physical management of collections by site location.</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button 
             onClick={() => { 
                setEditingId(null); 
                setFormData({
                   name: '', 
                   description: '', 
                   individualIds: [], 
                   boundary: [], 
                   projectId: isAll ? '' : currentProjectId
                }); 
                setShowForm(true); 
             }} 
             className="flex-1 md:flex-none flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-all"
          >
            <Plus size={18} /><span>Add {label}</span>
          </button>
          <div className="flex bg-white border border-slate-300 rounded-lg p-1 shadow-sm">
            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}><List size={18} /></button>
            <button onClick={() => setViewMode('map')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'map' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}><MapIcon size={18} /></button>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white" placeholder={`Search ${labelsPlural.toLowerCase()}...`} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
      </div>

      {viewMode === 'list' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto">
          {filteredEnclosures.map(enc => (
            <div key={enc.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col group">
               <div className="flex justify-between items-start mb-4">
                  <div className="p-2.5 bg-purple-100 text-purple-600 rounded-lg"><Box size={24} /></div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setEditingId(enc.id); setFormData(enc); setShowForm(true); }} className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg"><Pencil size={16}/></button>
                    <button onClick={() => setEnclosureToDelete(enc)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg"><Trash2 size={16}/></button>
                  </div>
               </div>
               <h3 className="text-lg font-bold text-slate-900 mb-1">{enc.name}</h3>
               <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-2 flex items-center gap-1"><FolderOpen size={10}/> {getEnclosureProjectName(enc)}</p>
               <p className="text-sm text-slate-500 mb-4 line-clamp-2">{enc.description || 'No description provided.'}</p>
               <div className="mt-auto pt-4 border-t border-slate-50 flex items-center justify-between text-xs font-bold text-slate-400">
                  <span className="uppercase tracking-widest">{enc.individualIds.length} Occupants</span>
                  <button onClick={() => { setSelectedEnclosure(enc); setViewMode('map'); }} className="text-emerald-600 uppercase hover:underline">View on Map →</button>
               </div>
            </div>
          ))}
          {filteredEnclosures.length === 0 && (
             <div className="col-span-full py-20 bg-white border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400">
                <Box size={48} className="mb-4 opacity-20" />
                <p className="text-lg font-bold">No {labelsPlural.toLowerCase()} found.</p>
                <p className="text-sm">Try selecting 'All Projects' or create a new {label.toLowerCase()}.</p>
             </div>
          )}
        </div>
      )}

      {viewMode === 'map' && <div className="flex-1 relative bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"><div ref={mapContainerRef} className="w-full h-full" /></div>}

      {showForm && (
        <div className="fixed inset-0 z-[2000] bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl animate-in zoom-in duration-200 flex flex-col max-h-[90vh]">
            <div className="p-6 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-xl text-slate-900">{editingId ? `Edit ${label}` : `Add ${label}`}</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X size={24}/></button>
            </div>
            <form onSubmit={handleSave} className="p-8 space-y-6 flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">{label} Name</label>
                    <input className="w-full px-4 py-2 border border-slate-300 rounded-lg" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Project Assignment</label>
                    <select className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white" value={formData.projectId} onChange={e => setFormData({...formData, projectId: e.target.value})} required>
                      <option value="">Select Scoped Project...</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Description</label>
                    <textarea className="w-full px-4 py-2 border border-slate-300 rounded-lg" rows={3} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
                  </div>
                </div>
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Users size={18} className="text-blue-600"/> Assign Individuals</h4>
                  <p className="text-xs text-slate-500">Only individuals from the selected project (or all if unassigned) will appear here.</p>
                  <select className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-sm" value={selectedSpeciesId} onChange={(e) => setSelectedSpeciesId(e.target.value)}>
                     <option value="">Choose species...</option>
                     {projectSpecies.map(s => <option key={s.id} value={s.id}>{s.commonName}</option>)}
                  </select>
                  <div className="border border-slate-200 rounded-xl bg-slate-50 max-h-48 overflow-y-auto divide-y divide-slate-100">
                    {speciesIndividuals.map(ind => (
                      <label key={ind.id} className="flex items-center gap-3 p-3 cursor-pointer hover:bg-white transition-colors">
                        <input type="checkbox" checked={formData.individualIds?.includes(ind.id)} onChange={() => toggleIndividual(ind.id)} className="rounded text-blue-600" />
                        <span className="text-sm font-bold text-slate-700">{ind.name}</span>
                        <span className="text-[10px] font-mono text-slate-400">{ind.studbookId}</span>
                      </label>
                    ))}
                    {selectedSpeciesId && speciesIndividuals.length === 0 && (
                      <p className="p-4 text-xs text-slate-400 italic">No individuals of this species found in the current scope.</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="pt-6 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-bold">Cancel</button>
                <button type="submit" className="bg-emerald-600 text-white px-10 py-2 rounded-lg font-bold shadow-lg">Save {label}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {enclosureToDelete && (
         <div className="fixed inset-0 z-[3000] bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-8 text-center animate-in zoom-in duration-200">
               <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6"><AlertTriangle size={32}/></div>
               <h3 className="text-xl font-bold text-slate-900 mb-2">Delete {label}?</h3>
               <p className="text-slate-500 mb-8">Are you sure you want to remove <strong>{enclosureToDelete.name}</strong>? Individuals will remain but their location assignment will be cleared.</p>
               <div className="flex gap-3">
                  <button onClick={() => setEnclosureToDelete(null)} className="flex-1 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-bold">Cancel</button>
                  <button onClick={() => {
                     const updated = enclosures.filter(e => e.id !== enclosureToDelete.id);
                     setEnclosures(updated);
                     saveEnclosures(updated);
                     setEnclosureToDelete(null);
                  }} className="flex-1 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 shadow-md">Delete</button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};
export default EnclosureManager;
