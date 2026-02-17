import React, { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { getSpecies, getIndividuals, saveIndividuals, generatePattern, saveSpecies, getOrg, getEnclosures, getProjects, deleteIndividual } from '../services/storage';
import { fetchSpeciesData, generateSpeciesImage, fetchWikimediaImage, urlToBase64 } from '../services/geminiService';
import { Species, Individual, Sex, SpeciesType, Organization, Enclosure, Project, PlantClassification } from '../types';
import { Plus, Search, Dna, PawPrint, Pencil, X as XIcon, Trash2, MapPin, Users, LayoutGrid, List, Map as MapIcon, Maximize2, ArrowRight, ArrowLeft, RefreshCw, Sprout, Loader2, FileUp, FileSpreadsheet, Sparkles, Download, CheckCircle, CheckSquare, Square, Eye, EyeOff, Box, ChevronDown, Save, User as UserIcon, FolderOpen, Weight, Scale, Ruler, Trash, Camera, ImageIcon, Info, Crosshair } from 'lucide-react';
import { LanguageContext } from '../App';

declare const L: any;

type ViewMode = 'grid' | 'list';

interface IndividualManagerProps {
  currentProjectId: string;
}

const IndividualManager: React.FC<IndividualManagerProps> = ({ currentProjectId }) => {
  const { t } = useContext(LanguageContext);
  const navigate = useNavigate();
  const location = useLocation();
  const locState = location.state as any;

  const [allIndividuals, setAllIndividuals] = useState<Individual[]>([]);
  const [allSpecies, setAllSpecies] = useState<Species[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [allEnclosures, setAllEnclosures] = useState<Enclosure[]>([]);
  const [org, setOrg] = useState<Organization | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSpeciesId, setFilterSpeciesId] = useState<string>('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [speciesSearchQuery, setSpeciesSearchQuery] = useState('');
  const [isSpeciesDropdownOpen, setIsSpeciesDropdownOpen] = useState(false);
  const speciesDropdownRef = useRef<HTMLDivElement>(null);

  const formMapRef = useRef<HTMLDivElement>(null);
  const formMapInstance = useRef<any>(null);
  const formMarker = useRef<any>(null);

  const [showNewSpeciesForm, setShowNewSpeciesForm] = useState(false);
  const [newSpeciesData, setNewSpeciesData] = useState<Partial<Species>>({
    commonName: '',
    scientificName: '',
    type: 'Animal',
    conservationStatus: 'Unknown'
  });

  const [formData, setFormData] = useState<Partial<Individual>>({
    speciesId: '', projectId: currentProjectId === 'ALL_PROJECTS' ? '' : currentProjectId, enclosureId: '', studbookId: '', name: '', sex: Sex.UNKNOWN, birthDate: '', weightKg: 0, sireId: '', damId: '', notes: '', imageUrl: '', isDeceased: false, source: 'Bred in house', latitude: undefined, longitude: undefined
  });

  useEffect(() => {
    setAllIndividuals(getIndividuals());
    setAllSpecies(getSpecies());
    const projs = getProjects();
    setAllProjects(projs);
    setAllEnclosures(getEnclosures());
    setOrg(getOrg());

    if (!editingId && projs.length === 1 && !formData.projectId) {
       setFormData(prev => ({ ...prev, projectId: projs[0].id }));
    }
  }, [currentProjectId, editingId]);

  useEffect(() => {
    if (locState?.editId && allIndividuals.length > 0) {
      const indToEdit = allIndividuals.find(i => i.id === locState.editId);
      if (indToEdit) {
        setEditingId(indToEdit.id);
        setFormData({ ...indToEdit });
        const sp = allSpecies.find(s => s.id === indToEdit.speciesId);
        setSpeciesSearchQuery(sp?.commonName || '');
        setShowForm(true);
        window.history.replaceState({}, document.title);
      }
    }
  }, [locState, allIndividuals, allSpecies]);

  // Form Map Initialization
  useEffect(() => {
    if (showForm && formMapRef.current && !formMapInstance.current) {
        const initialLat = formData.latitude || org?.latitude || 0;
        const initialLng = formData.longitude || org?.longitude || 0;
        const map = L.map(formMapRef.current).setView([initialLat, initialLng], 18);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        formMapInstance.current = map;

        if (formData.latitude && formData.longitude) {
           formMarker.current = L.marker([formData.latitude, formData.longitude], { draggable: true }).addTo(map);
        }

        map.on('click', (e: any) => {
           const { lat, lng } = e.latlng;
           setFormData(prev => ({ ...prev, latitude: lat, longitude: lng }));
           if (formMarker.current) formMarker.current.setLatLng([lat, lng]);
           else formMarker.current = L.marker([lat, lng], { draggable: true }).addTo(map);
        });

        setTimeout(() => map.invalidateSize(), 300);
    }
    return () => { if (formMapInstance.current) { formMapInstance.current.remove(); formMapInstance.current = null; formMarker.current = null; } };
  }, [showForm, org]);

  const isAll = currentProjectId === 'ALL_PROJECTS';
  const filtered = (isAll ? allIndividuals : allIndividuals.filter(ind => ind.projectId === currentProjectId)).filter(ind => {
    const matchesSearch = (ind.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || (ind.studbookId || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSpecies = !filterSpeciesId || ind.speciesId === filterSpeciesId;
    return matchesSearch && matchesSpecies;
  });

  const availableSpeciesForForm = allSpecies.filter(s => isAll ? (formData.projectId ? s.projectId === formData.projectId : true) : s.projectId === currentProjectId);
  const selectedSpecies = allSpecies.find(s => s.id === formData.speciesId);
  const isPlant = selectedSpecies?.type === 'Plant';

  const handleOpenNewForm = () => {
    setEditingId(null);
    setFormData({ 
      studbookId: `SB-${new Date().getFullYear()}-${Math.random().toString(36).substring(7).toUpperCase()}`, 
      speciesId: '', 
      projectId: isAll ? (allProjects.length === 1 ? allProjects[0].id : '') : currentProjectId,
      enclosureId: '', 
      name: '', 
      sex: Sex.UNKNOWN, 
      weightKg: 0, 
      birthDate: new Date().toISOString().split('T')[0], 
      source: 'Bred in house', 
      notes: '', 
      imageUrl: '',
      latitude: org?.latitude,
      longitude: org?.longitude
    });
    setSpeciesSearchQuery('');
    setShowForm(true);
    setShowNewSpeciesForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.speciesId || !formData.studbookId) return;
    const targetProjectId = isAll ? formData.projectId : currentProjectId;
    if (!targetProjectId) { alert("Please select a project."); return; }

    setIsSubmitting(true);
    try {
        const entry: Individual = {
            ...formData as Individual,
            id: editingId || `ind-${Date.now()}`,
            projectId: targetProjectId,
            weightKg: Number(formData.weightKg || 0)
        };
        const updated = editingId ? allIndividuals.map(i => i.id === editingId ? entry : i) : [...allIndividuals, entry];
        setAllIndividuals(updated);
        await saveIndividuals(updated); 
        setShowForm(false);
        setEditingId(null);
    } catch (err) { alert("Database Error: Could not save specimen."); }
    finally { setIsSubmitting(false); }
  };

  const detectGps = () => {
     if (!navigator.geolocation) return;
     navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        setFormData(prev => ({ ...prev, latitude, longitude }));
        if (formMapInstance.current) {
           formMapInstance.current.flyTo([latitude, longitude], 19);
           if (formMarker.current) formMarker.current.setLatLng([latitude, longitude]);
           else formMarker.current = L.marker([latitude, longitude], { draggable: true }).addTo(formMapInstance.current);
        }
     });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t('individuals')}</h2>
          <p className="text-slate-500">{t('indivSubtitleAnimal')}</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex bg-white border border-slate-300 rounded-lg p-1 shadow-sm">
            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}><LayoutGrid size={18} /></button>
            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}><List size={18} /></button>
          </div>
          <button onClick={handleOpenNewForm} className="flex-1 md:flex-none flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-all"><Plus size={18} /><span>{t('add')}</span></button>
        </div>
      </div>

      <div className="relative w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white" placeholder={t('searchIndividuals')} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
      </div>

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filtered.map(ind => {
            const sp = allSpecies.find(s => s.id === ind.speciesId);
            const displayImg = ind.imageUrl || sp?.imageUrl || generatePattern(ind.name);
            return (
              <div key={ind.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all group flex flex-col">
                <Link to={`/individuals/${ind.id}`} className="h-48 bg-slate-100 relative overflow-hidden block">
                  <img src={displayImg} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt={ind.name} />
                  <div className={`absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-bold text-white uppercase ${ind.sex === Sex.MALE ? 'bg-blue-600' : ind.sex === Sex.FEMALE ? 'bg-pink-600' : 'bg-slate-600'}`}>{ind.sex}</div>
                </Link>
                <div className="p-4 flex-1">
                  <Link to={`/individuals/${ind.id}`} className="font-bold text-slate-900 group-hover:text-emerald-700 transition-colors truncate block">{ind.name}</Link>
                  <p className="text-xs text-slate-500 mb-2 truncate">{sp?.commonName}</p>
                  <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-50">
                    <span className="text-[10px] font-mono text-slate-400">{ind.studbookId}</span>
                    <button onClick={() => { setEditingId(ind.id); setFormData({...ind}); setSpeciesSearchQuery(sp?.commonName || ''); setShowForm(true); }} className="text-slate-400 hover:text-blue-600"><Pencil size={14}/></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
           <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                 <tr>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">Specimen</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">Species</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">ID</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase text-right">Actions</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                 {filtered.map(ind => {
                    const sp = allSpecies.find(s => s.id === ind.speciesId);
                    return (
                       <tr key={ind.id} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-6 py-4 font-bold text-slate-900">{ind.name}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{sp?.commonName}</td>
                          <td className="px-6 py-4 font-mono text-[10px] text-slate-400">{ind.studbookId}</td>
                          <td className="px-6 py-4 text-right">
                             <div className="flex justify-end gap-2">
                                <Link to={`/individuals/${ind.id}`} className="p-1.5 text-slate-400 hover:text-emerald-600"><Eye size={16}/></Link>
                                <button onClick={() => { setEditingId(ind.id); setFormData({...ind}); setSpeciesSearchQuery(sp?.commonName || ''); setShowForm(true); }} className="p-1.5 text-slate-400 hover:text-blue-600"><Pencil size={16}/></button>
                             </div>
                          </td>
                       </tr>
                    );
                 })}
              </tbody>
           </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-[4000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl animate-in zoom-in duration-200 flex flex-col my-8 max-h-[95vh]">
             <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
               <div className="flex items-center gap-3">
                 <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">{editingId ? <Pencil size={20}/> : <Plus size={20}/>}</div>
                 <h3 className="text-xl font-bold text-slate-900">{editingId ? t('updateIndividual') : t('registerIndividual')}</h3>
               </div>
               <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors"><XIcon size={24}/></button>
             </div>
             
             <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-8">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                   <div className="lg:col-span-8 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <div className="relative">
                            <label className="text-xs font-bold text-slate-500 uppercase">{t('species')} <span className="text-red-500">*</span></label>
                            <input className="w-full px-4 py-2 mt-1 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" value={speciesSearchQuery} onChange={e => { setSpeciesSearchQuery(e.target.value); setIsSpeciesDropdownOpen(true); }} onFocus={() => setIsSpeciesDropdownOpen(true)} placeholder="Search species..." required />
                            {isSpeciesDropdownOpen && (
                               <div className="absolute top-full left-0 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl mt-1 max-h-48 overflow-auto py-2">
                                  {availableSpeciesForForm.filter(s => s.commonName.toLowerCase().includes(speciesSearchQuery.toLowerCase())).map(s => (
                                     <button key={s.id} type="button" className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm flex justify-between items-center" onClick={() => { setFormData({...formData, speciesId: s.id}); setSpeciesSearchQuery(s.commonName); setIsSpeciesDropdownOpen(false); }}>
                                        <span className="font-bold">{s.commonName}</span>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-black tracking-widest ${s.type === 'Plant' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{s.type}</span>
                                     </button>
                                  ))}
                               </div>
                            )}
                         </div>
                         <div><label className="text-xs font-bold text-slate-500 uppercase">{t('studbookId')} <span className="text-red-500">*</span></label><input className="w-full px-4 py-2 mt-1 border border-slate-300 rounded-lg outline-none font-mono" value={formData.studbookId} onChange={e => setFormData({...formData, studbookId: e.target.value})} required /></div>
                         <div><label className="text-xs font-bold text-slate-500 uppercase">{t('name')} <span className="text-red-500">*</span></label><input className="w-full px-4 py-2 mt-1 border border-slate-300 rounded-lg outline-none font-bold" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required /></div>
                         <div><label className="text-xs font-bold text-slate-500 uppercase">{isPlant ? 'Sex / Genetic Group' : 'Sex'}</label><select className="w-full px-4 py-2 mt-1 border border-slate-300 rounded-lg outline-none bg-white" value={formData.sex} onChange={e => setFormData({...formData, sex: e.target.value as Sex})}><option value={Sex.UNKNOWN}>{t('unknownSex')}</option><option value={Sex.MALE}>{t('males')}</option><option value={Sex.FEMALE}>{t('females')}</option></select></div>
                         <div><label className="text-xs font-bold text-slate-500 uppercase">{isPlant ? 'Planted Date' : 'Birth Date'}</label><input type="date" className="w-full px-4 py-2 mt-1 border border-slate-300 rounded-lg outline-none" value={formData.birthDate} onChange={e => setFormData({...formData, birthDate: e.target.value})} /></div>
                         <div><label className="text-xs font-bold text-slate-500 uppercase">{isPlant ? 'Current Height (cm)' : 'Weight (kg)'}</label><input type="number" step="0.01" className="w-full px-4 py-2 mt-1 border border-slate-300 rounded-lg outline-none" value={formData.weightKg} onChange={e => setFormData({...formData, weightKg: parseFloat(e.target.value)})} /></div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                         <div><label className="text-xs font-bold text-slate-500 uppercase">{isPlant ? 'Source Propagation' : 'Acquisition Source'}</label><select className="w-full px-4 py-2 mt-1 border border-slate-300 rounded-lg outline-none bg-white" value={formData.source} onChange={e => setFormData({...formData, source: e.target.value as any})}><option value="Bred in house">Managed / In-house</option><option value="Captive Bred">Ex-situ / Partner</option><option value="Wild Caught">In-situ / Wild</option><option value="Other">Other / Unknown</option></select></div>
                         <div><label className="text-xs font-bold text-slate-500 uppercase">Enclosure / Area</label><select className="w-full px-4 py-2 mt-1 border border-slate-300 rounded-lg outline-none bg-white" value={formData.enclosureId} onChange={e => setFormData({...formData, enclosureId: e.target.value})}><option value="">None Assigned</option>{allEnclosures.filter(e => e.projectId === (isAll ? formData.projectId : currentProjectId)).map(enc => <option key={enc.id} value={enc.id}>{enc.name}</option>)}</select></div>
                      </div>

                      <div className="space-y-4 pt-4 border-t border-slate-100">
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div><label className="text-xs font-bold text-slate-500 uppercase">Sire ID / Lineage A</label><input className="w-full px-4 py-2 mt-1 border border-slate-300 rounded-lg outline-none" value={formData.sireId} onChange={e => setFormData({...formData, sireId: e.target.value})} placeholder="Parent ID or Source" /></div>
                            <div><label className="text-xs font-bold text-slate-500 uppercase">Dam ID / Lineage B</label><input className="w-full px-4 py-2 mt-1 border border-slate-300 rounded-lg outline-none" value={formData.damId} onChange={e => setFormData({...formData, damId: e.target.value})} placeholder="Parent ID or Source" /></div>
                         </div>
                      </div>

                      <div className="pt-4 border-t border-slate-100">
                         <label className="text-xs font-bold text-slate-500 uppercase">Notes & Biological History</label>
                         <textarea className="w-full px-4 py-2 mt-1 border border-slate-300 rounded-lg outline-none" rows={3} value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="Add any relevant history or specific traits..." />
                      </div>

                      {/* Image section moved to the bottom */}
                      <div className="pt-6 border-t border-slate-100 space-y-4">
                         <h4 className="font-bold text-slate-800 flex items-center gap-2"><ImageIcon size={18} className="text-purple-500"/> Representative Media</h4>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                            <div className="aspect-video w-full rounded-xl bg-slate-100 border-2 border-dashed border-slate-300 overflow-hidden relative group shadow-inner">
                               {formData.imageUrl ? <img src={formData.imageUrl} className="w-full h-full object-cover" /> : <div className="flex flex-col items-center justify-center h-full text-slate-400 p-6 text-center"><ImageIcon size={48} className="mb-2 opacity-20"/><p className="text-xs">{t('noImageProvided')}</p></div>}
                            </div>
                            <div className="space-y-3">
                               <p className="text-xs text-slate-500 leading-relaxed">Provide a reference image for this specimen. You can upload a photo of the actual individual or plant.</p>
                               <label className="cursor-pointer bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 text-xs font-bold shadow-sm w-full"><Camera size={14} /> {t('upload')}<input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if(f) { const r = new FileReader(); r.onload = () => setFormData({...formData, imageUrl: r.result as string}); r.readAsDataURL(f); } }} /></label>
                            </div>
                         </div>
                      </div>
                   </div>

                   <div className="lg:col-span-4 space-y-6">
                      <div className="space-y-4">
                         <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><MapPin size={14} className="text-red-500"/> Physical Location</h4>
                         <div className="h-64 rounded-xl border border-slate-200 overflow-hidden bg-slate-100 shadow-inner relative">
                            <div ref={formMapRef} className="h-full w-full z-0" />
                            <button type="button" onClick={detectGps} className="absolute bottom-2 right-2 z-10 bg-white/90 p-2 rounded-lg shadow-md text-emerald-600 hover:bg-white"><Crosshair size={16}/></button>
                         </div>
                         <div className="grid grid-cols-2 gap-2">
                            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                               <span className="text-[8px] font-black text-slate-400 uppercase block">Latitude</span>
                               <span className="text-xs font-mono text-slate-600">{formData.latitude?.toFixed(5) || 'Not Set'}</span>
                            </div>
                            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                               <span className="text-[8px] font-black text-slate-400 uppercase block">Longitude</span>
                               <span className="text-xs font-mono text-slate-600">{formData.longitude?.toFixed(5) || 'Not Set'}</span>
                            </div>
                         </div>
                         <p className="text-[10px] text-slate-400 italic">Click the map to precisely pin where this specimen is located on site.</p>
                      </div>
                   </div>
                </div>

                <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 shrink-0">
                   <button type="button" onClick={() => setShowForm(false)} className="px-8 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">Cancel</button>
                   <button type="submit" disabled={isSubmitting} className="bg-emerald-600 text-white px-10 py-3 rounded-xl font-bold shadow-lg hover:bg-emerald-700">
                     {isSubmitting ? <Loader2 size={20} className="animate-spin" /> : <Save size={20}/>} {editingId ? "Update Record" : "Register Specimen"}
                   </button>
                </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default IndividualManager;