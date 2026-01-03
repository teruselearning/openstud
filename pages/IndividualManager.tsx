
import React, { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { getSpecies, getIndividuals, saveIndividuals, generatePattern, saveSpecies, getOrg, getEnclosures } from '../services/storage';
import { fetchSpeciesData } from '../services/geminiService';
import { Species, Individual, Sex, AcquisitionSource, SpeciesType, Organization, Enclosure } from '../types';
import { Plus, Camera, Search, Dna, PawPrint, Pencil, X as XIcon, Filter, Trash2, AlertTriangle, MapPin, Users, LayoutGrid, List, ArrowRight, Briefcase, RefreshCw, Sprout, Loader2, FileText, CheckCircle, Fingerprint, User as UserIcon, Upload, FileCode, Crosshair, Map as MapIcon, Maximize2, LocateFixed, Type as TypeIcon, Map as MapIcon2, ChevronDown, Calendar, Weight, Info, Box, Save, Anchor, Layers, Eye, EyeOff } from 'lucide-react';
import { LanguageContext } from '../App';

declare const L: any;

type StatusFilter = 'current' | 'deceased' | 'all';
type ViewMode = 'grid' | 'list' | 'map';

interface IndividualManagerProps {
  currentProjectId: string;
}

const IndividualManager: React.FC<IndividualManagerProps> = ({ currentProjectId }) => {
  const { t } = useContext(LanguageContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [allIndividuals, setAllIndividuals] = useState<Individual[]>([]);
  const [allSpecies, setAllSpecies] = useState<Species[]>([]);
  const [allEnclosures, setAllEnclosures] = useState<Enclosure[]>([]);
  const [org, setOrg] = useState<Organization | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  
  // Map State
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const enclosuresLayerRef = useRef<any>(null);
  const [showEnclosuresOnMap, setShowEnclosuresOnMap] = useState(true);
  const [activeEnclosureFromMap, setActiveEnclosureFromMap] = useState<Enclosure | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSpeciesId, setFilterSpeciesId] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('current');

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [returnToId, setReturnToId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [speciesSearchQuery, setSpeciesSearchQuery] = useState('');
  const [isSpeciesDropdownOpen, setIsSpeciesDropdownOpen] = useState(false);
  const speciesDropdownRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState<Partial<Individual>>({
    speciesId: '', enclosureId: '', studbookId: '', name: '', sex: Sex.UNKNOWN, birthDate: '', weightKg: 0, sireId: '', damId: '', notes: '', imageUrl: '', isDeceased: false, source: 'Bred in house', latitude: undefined, longitude: undefined
  });

  useEffect(() => {
    setAllIndividuals(getIndividuals());
    setAllSpecies(getSpecies());
    setAllEnclosures(getEnclosures());
    setOrg(getOrg());
  }, []);

  // Handle Edit Redirection from Detail Page
  useEffect(() => {
    if (location.state?.editId && allIndividuals.length > 0) {
      const indToEdit = allIndividuals.find(i => i.id === location.state.editId);
      if (indToEdit) {
        setEditingId(indToEdit.id);
        setReturnToId(location.state.fromId || null);
        setFormData({ ...indToEdit });
        const sp = allSpecies.find(s => s.id === indToEdit.speciesId);
        setSpeciesSearchQuery(sp?.commonName || '');
        setShowForm(true);
        // Clear history state to avoid re-opening on refresh
        window.history.replaceState({}, document.title);
      }
    }
  }, [location.state, allIndividuals, allSpecies]);

  // Main Map Controller
  useEffect(() => {
    if (viewMode === 'map' && mapContainerRef.current && !mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, { maxZoom: 22, zoomControl: false }).setView([org?.latitude || 0, org?.longitude || 0], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
      L.control.zoom({ position: 'topright' }).addTo(map);
      
      markersLayerRef.current = L.layerGroup().addTo(map);
      enclosuresLayerRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
      setTimeout(() => map.invalidateSize(), 200);
    }

    return () => {
       if (mapInstanceRef.current && viewMode !== 'map') {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
       }
    };
  }, [viewMode, org]);

  // Map Data Updater
  useEffect(() => {
    if (viewMode === 'map' && mapInstanceRef.current) {
      const map = mapInstanceRef.current;
      const markersLayer = markersLayerRef.current;
      const enclosuresLayer = enclosuresLayerRef.current;
      
      markersLayer.clearLayers();
      enclosuresLayer.clearLayers();

      // Draw Individuals
      filtered.forEach(ind => {
        if (ind.latitude !== undefined && ind.longitude !== undefined) {
          const sp = allSpecies.find(s => s.id === ind.speciesId);
          const icon = L.divIcon({
            html: `<div class="w-4 h-4 rounded-full border-2 border-white shadow-md" style="background-color: ${ind.sex === Sex.MALE ? '#3b82f6' : ind.sex === Sex.FEMALE ? '#ec4899' : '#64748b'}"></div>`,
            className: '',
            iconSize: [16, 16]
          });
          
          const marker = L.marker([ind.latitude, ind.longitude], { icon }).addTo(markersLayer);
          marker.bindPopup(`
            <div class="p-1">
              <h4 class="font-bold text-sm m-0">${ind.name}</h4>
              <p class="text-[10px] text-slate-500 m-0 uppercase font-mono">${ind.studbookId}</p>
              <button onclick="window.location.hash='#/individuals/${ind.id}'" class="mt-2 w-full text-[10px] bg-emerald-600 text-white py-1 rounded font-bold uppercase tracking-widest">View Profile</button>
            </div>
          `);
        }
      });

      // Draw Enclosures
      if (showEnclosuresOnMap) {
        allEnclosures.forEach(enc => {
          if (enc.boundary && enc.boundary.length > 0) {
            const poly = L.polygon(enc.boundary.map(p => [p.lat, p.lng]), {
              color: '#9333ea',
              fillColor: '#9333ea',
              fillOpacity: 0.15,
              weight: 2,
              dashArray: '5, 5'
            }).addTo(enclosuresLayer);

            poly.on('click', (e: any) => {
               L.DomEvent.stopPropagation(e);
               setActiveEnclosureFromMap(enc);
               map.flyToBounds(poly.getBounds(), { padding: [50, 50], duration: 1 });
            });

            poly.bindTooltip(enc.name, {
              permanent: false,
              direction: 'center',
              className: 'bg-white/90 border-none shadow-sm px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-700'
            });
          }
        });
      }
    }
  }, [viewMode, allIndividuals, allEnclosures, showEnclosuresOnMap, filterSpeciesId, filterStatus, searchTerm]);

  const handleOpenNewForm = () => {
    setEditingId(null);
    setReturnToId(null);
    setFormData({ 
      studbookId: `SB-${new Date().getFullYear()}-${Math.random().toString(36).substring(7).toUpperCase()}`, 
      speciesId: '', 
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
  };

  const handleEdit = (ind: Individual) => {
    setEditingId(ind.id);
    setReturnToId(null);
    setFormData({ ...ind });
    const sp = allSpecies.find(s => s.id === ind.speciesId);
    setSpeciesSearchQuery(sp?.commonName || '');
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    if (returnToId) {
      navigate(`/individuals/${returnToId}`);
    }
    setEditingId(null);
    setReturnToId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.speciesId || !formData.studbookId) return;
    setIsSubmitting(true);
    
    const entry: Individual = {
        ...formData as Individual,
        id: editingId || `ind-${Date.now()}`,
        projectId: currentProjectId,
        weightKg: Number(formData.weightKg || 0)
    };
    
    const updated = editingId ? allIndividuals.map(i => i.id === editingId ? entry : i) : [...allIndividuals, entry];
    setAllIndividuals(updated);
    saveIndividuals(updated);
    setIsSubmitting(false);
    
    if (returnToId) {
      navigate(`/individuals/${returnToId}`);
    } else {
      setShowForm(false);
    }
    setEditingId(null);
    setReturnToId(null);
  };

  const projectIndividuals = allIndividuals.filter(ind => ind.projectId === currentProjectId);
  const filtered = projectIndividuals.filter(ind => {
    const matchesSearch = ind.name.toLowerCase().includes(searchTerm.toLowerCase()) || ind.studbookId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSpecies = !filterSpeciesId || ind.speciesId === filterSpeciesId;
    const matchesStatus = filterStatus === 'all' || (filterStatus === 'deceased' ? ind.isDeceased : !ind.isDeceased);
    return matchesSearch && matchesSpecies && matchesStatus;
  });

  const projectSpecies = allSpecies.filter(s => s.projectId === currentProjectId);
  const speciesSearchResults = projectSpecies.filter(s => s.commonName.toLowerCase().includes(speciesSearchQuery.toLowerCase()));

  // Filters for parentage selection
  const potentialParents = allIndividuals.filter(i => i.speciesId === formData.speciesId && i.id !== editingId && !i.isDeceased);
  const potentialSires = potentialParents.filter(i => i.sex === Sex.MALE || i.sex === Sex.UNKNOWN);
  const potentialDams = potentialParents.filter(i => i.sex === Sex.FEMALE || i.sex === Sex.UNKNOWN);

  const hasMappedIndividuals = filtered.some(ind => ind.latitude !== undefined && ind.longitude !== undefined);

  const getResidentsOfEnclosure = (enc: Enclosure) => {
     const residents = allIndividuals.filter(i => enc.individualIds.includes(i.id) && !i.isDeceased);
     const grouped: Record<string, { species: Species, count: number }> = {};
     residents.forEach(res => {
        const sp = allSpecies.find(s => s.id === res.speciesId);
        if (sp) {
           if (!grouped[sp.id]) grouped[sp.id] = { species: sp, count: 0 };
           grouped[sp.id].count++;
        }
     });
     return { residents, grouped: Object.values(grouped) };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t('individuals')}</h2>
          <p className="text-slate-500">{t('indivSubtitleAnimal')}</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center bg-white border border-slate-300 rounded-lg p-1 shadow-sm">
            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}><LayoutGrid size={18} /></button>
            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}><List size={18} /></button>
            <button onClick={() => setViewMode('map')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'map' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}><MapIcon size={18} /></button>
          </div>
          <button onClick={handleOpenNewForm} className="flex-1 md:flex-none flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm">
            <Plus size={18} /><span>{t('add')}</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white" placeholder={t('searchIndividuals')} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <select className="px-4 py-2 border border-slate-300 rounded-lg bg-white" value={filterSpeciesId} onChange={e => setFilterSpeciesId(e.target.value)}>
          <option value="">{t('allSpeciesFilter')}</option>
          {projectSpecies.map(s => <option key={s.id} value={s.id}>{s.commonName}</option>)}
        </select>
        <select className="px-4 py-2 border border-slate-300 rounded-lg bg-white" value={filterStatus} onChange={e => setFilterStatus(e.target.value as StatusFilter)}>
          <option value="current">{t('statusCurrent')}</option>
          <option value="deceased">{t('statusDeceased')}</option>
          <option value="all">{t('statusAll')}</option>
        </select>
      </div>

      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filtered.map(ind => {
            const sp = allSpecies.find(s => s.id === ind.speciesId);
            return (
              <div key={ind.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all group flex flex-col">
                <Link to={`/individuals/${ind.id}`} className="h-48 bg-slate-100 relative overflow-hidden block">
                  <img src={ind.imageUrl || sp?.imageUrl || generatePattern(ind.name)} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className={`absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold text-white uppercase ${ind.sex === Sex.MALE ? 'bg-blue-600' : ind.sex === Sex.FEMALE ? 'bg-pink-600' : 'bg-slate-600'}`}>{ind.sex}</div>
                </Link>
                <div className="p-4 flex-1">
                  <Link to={`/individuals/${ind.id}`} className="block">
                    <h3 className="font-bold text-slate-900 group-hover:text-emerald-700 transition-colors truncate">{ind.name}</h3>
                  </Link>
                  <p className="text-xs text-slate-500 mb-2 truncate">{sp?.commonName}</p>
                  <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-50">
                    <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-widest">{ind.studbookId}</span>
                    <Link to={`/individuals/${ind.id}`} className="text-emerald-600 hover:text-emerald-700"><ArrowRight size={16} /></Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewMode === 'list' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                <th className="px-6 py-4">Individual</th>
                <th className="px-6 py-4">Species</th>
                <th className="px-6 py-4">Sex</th>
                <th className="px-6 py-4">Studbook ID</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(ind => (
                <tr key={ind.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4">
                    <Link to={`/individuals/${ind.id}`} className="font-bold text-slate-900 hover:text-emerald-700 transition-colors">
                      {ind.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">{allSpecies.find(s => s.id === ind.speciesId)?.commonName}</td>
                  <td className="px-6 py-4 text-sm">{ind.sex}</td>
                  <td className="px-6 py-4 text-xs font-mono text-slate-400">{ind.studbookId}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                       <button onClick={() => handleEdit(ind)} className="p-1.5 text-slate-400 hover:text-emerald-600 transition-colors"><Pencil size={16}/></button>
                       <Link to={`/individuals/${ind.id}`} className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors"><Maximize2 size={16}/></Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewMode === 'map' && (
        <div className="relative flex-1 min-h-[600px] rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div ref={mapContainerRef} className={`w-full h-[600px] ${!hasMappedIndividuals ? 'opacity-30' : ''}`} />
          
          <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
             <button 
                onClick={() => setShowEnclosuresOnMap(!showEnclosuresOnMap)} 
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold shadow-lg transition-all border ${showEnclosuresOnMap ? 'bg-purple-600 text-white border-purple-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
             >
                {showEnclosuresOnMap ? <Eye size={16}/> : <EyeOff size={16}/>}
                {t('showEnclosuresToggle')}
             </button>
          </div>

          {activeEnclosureFromMap && (
             <div className="absolute left-4 bottom-4 z-[1000] w-72 bg-white rounded-xl shadow-2xl border border-slate-200 animate-in slide-in-from-left-4 duration-300 overflow-hidden">
                <div className="p-4 bg-purple-50 border-b border-purple-100 flex justify-between items-center">
                   <div className="flex items-center gap-2">
                      <Box size={16} className="text-purple-600"/>
                      <h4 className="font-bold text-slate-900 truncate">{activeEnclosureFromMap.name}</h4>
                   </div>
                   <button onClick={() => setActiveEnclosureFromMap(null)} className="text-slate-400 hover:text-slate-600"><XIcon size={18}/></button>
                </div>
                <div className="p-4 space-y-4">
                   <div className="space-y-2">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resident Species</p>
                      {getResidentsOfEnclosure(activeEnclosureFromMap).grouped.length > 0 ? (
                         <div className="space-y-1.5">
                            {getResidentsOfEnclosure(activeEnclosureFromMap).grouped.map(({ species, count }) => (
                               <div key={species.id} className="flex justify-between items-center bg-slate-50 p-2 rounded-lg">
                                  <span className="text-xs font-bold text-slate-700">{species.commonName}</span>
                                  <span className="text-[10px] font-bold bg-white text-purple-600 px-1.5 py-0.5 rounded shadow-sm border border-purple-100">x{count}</span>
                               </div>
                            ))}
                         </div>
                      ) : (
                         <p className="text-xs text-slate-400 italic">No current residents recorded.</p>
                      )}
                   </div>
                   <button 
                     onClick={() => navigate('/enclosures')}
                     className="w-full text-center py-2 bg-slate-900 text-white text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                   >
                     Manage {org?.focus === 'Plants' ? 'Area' : 'Enclosure'} <ChevronDown size={14} className="-rotate-90" />
                   </button>
                </div>
             </div>
          )}

          {!hasMappedIndividuals && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center pointer-events-none">
               <div className="w-16 h-16 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center text-slate-400 mb-4 shadow-xl border border-slate-100">
                  <MapPin size={32} />
               </div>
               <p className="text-slate-700 bg-white/90 backdrop-blur-sm px-6 py-2 rounded-full font-bold shadow-lg border border-slate-100">
                  {t('noLocationDataMessage')}
               </p>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-[2000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in duration-200">
             <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
               <div className="flex items-center gap-3">
                 <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                   {editingId ? <Pencil size={20}/> : <Plus size={20}/>}
                 </div>
                 <h3 className="text-xl font-bold text-slate-900">{editingId ? t('updateIndividual') : t('registerIndividual')}</h3>
               </div>
               <button onClick={handleCloseForm} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors"><XIcon size={24}/></button>
             </div>
             
             <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-8">
                {/* Section 1: Identity */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <UserIcon size={16}/> {t('identityStatusTitle')}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="relative" ref={speciesDropdownRef}>
                        <label className="text-xs font-bold text-slate-700 block mb-1">Species <span className="text-red-500">*</span></label>
                        <input className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white" value={speciesSearchQuery} onChange={e => { setSpeciesSearchQuery(e.target.value); setIsSpeciesDropdownOpen(true); }} onFocus={() => setIsSpeciesDropdownOpen(true)} placeholder="Search species..." required />
                        {isSpeciesDropdownOpen && (
                          <div className="absolute top-full left-0 right-0 z-50 bg-white border border-slate-200 rounded-lg shadow-xl mt-1 max-h-48 overflow-auto">
                              {speciesSearchResults.map(s => <button key={s.id} type="button" className="w-full text-left p-3 hover:bg-slate-50 border-b last:border-0" onClick={() => { setFormData({...formData, speciesId: s.id}); setSpeciesSearchQuery(s.commonName); setIsSpeciesDropdownOpen(false); }}>{s.commonName}</button>)}
                          </div>
                        )}
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">Studbook ID <span className="text-red-500">*</span></label>
                        <input className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none font-mono text-sm" value={formData.studbookId} onChange={e => setFormData({...formData, studbookId: e.target.value})} required />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">Name <span className="text-red-500">*</span></label>
                        <input className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Individual name" required />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">Sex</label>
                        <select className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white" value={formData.sex} onChange={e => setFormData({...formData, sex: e.target.value as Sex})}>
                          {Object.values(Sex).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">Birth Date</label>
                        <input type="date" className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none" value={formData.birthDate} onChange={e => setFormData({...formData, birthDate: e.target.value})} />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">Current Weight (Kg)</label>
                        <input type="number" step="0.01" className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none" value={formData.weightKg} onChange={e => setFormData({...formData, weightKg: parseFloat(e.target.value)})} />
                    </div>
                  </div>
                </div>

                {/* Section 2: Environment & Location */}
                <div className="space-y-4 pt-6 border-t border-slate-100">
                  <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <MapPin size={16}/> Environment & Geolocation
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">Current Enclosure</label>
                        <select className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white" value={formData.enclosureId} onChange={e => setFormData({...formData, enclosureId: e.target.value})}>
                          <option value="">Unassigned</option>
                          {allEnclosures.map(encl => <option key={encl.id} value={encl.id}>{encl.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">Latitude</label>
                        <input type="number" step="any" className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none" value={formData.latitude || ''} onChange={e => setFormData({...formData, latitude: parseFloat(e.target.value)})} placeholder="e.g. 45.123" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">Longitude</label>
                        <input type="number" step="any" className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none" value={formData.longitude || ''} onChange={e => setFormData({...formData, longitude: parseFloat(e.target.value)})} placeholder="e.g. -122.456" />
                    </div>
                  </div>
                </div>

                {/* Section 3: Lineage */}
                <div className="space-y-4 pt-6 border-t border-slate-100">
                  <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Dna size={16}/> {t('parentageTitle')}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">{t('sire')}</label>
                        <select 
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white" 
                          value={formData.sireId} 
                          onChange={e => setFormData({...formData, sireId: e.target.value})}
                          disabled={!formData.speciesId}
                        >
                          <option value="">Unknown</option>
                          {potentialSires.map(i => <option key={i.id} value={i.id}>{i.name} ({i.studbookId})</option>)}
                        </select>
                        {!formData.speciesId && <p className="text-[10px] text-amber-600 mt-1 italic">Select a species first to browse potential sires.</p>}
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">{t('dam')}</label>
                        <select 
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white" 
                          value={formData.damId} 
                          onChange={e => setFormData({...formData, damId: e.target.value})}
                          disabled={!formData.speciesId}
                        >
                          <option value="">Unknown</option>
                          {potentialDams.map(i => <option key={i.id} value={i.id}>{i.name} ({i.studbookId})</option>)}
                        </select>
                        {!formData.speciesId && <p className="text-[10px] text-amber-600 mt-1 italic">Select a species first to browse potential dams.</p>}
                    </div>
                  </div>
                </div>

                {/* Section 4: Acquisition & Status */}
                <div className="space-y-4 pt-6 border-t border-slate-100">
                  <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Anchor size={16}/> {t('acquisitionSource')}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">Source Type</label>
                        <select className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white" value={formData.source} onChange={e => setFormData({...formData, source: e.target.value as AcquisitionSource})}>
                          <option value="Bred in house">Bred in house</option>
                          <option value="Captive Bred">Captive Bred (Transfer)</option>
                          <option value="Wild Caught">Wild Caught</option>
                          <option value="Other">Other</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">Status</label>
                        <div className="flex items-center gap-4 h-10">
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input type="checkbox" className="rounded text-red-600" checked={formData.isDeceased || false} onChange={e => setFormData({...formData, isDeceased: e.target.checked})} />
                            Deceased / Removed
                          </label>
                        </div>
                    </div>
                  </div>
                </div>

                {/* Section 5: Notes & Media */}
                <div className="space-y-4 pt-6 border-t border-slate-100">
                  <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <FileText size={16}/> {t('notes')}
                  </h4>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Observations / Clinical Notes</label>
                    <textarea rows={4} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="Detailed notes about behavior, health status, or transfer details..." />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                   <button type="button" onClick={handleCloseForm} className="px-8 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-all">Cancel</button>
                   <button type="submit" disabled={isSubmitting} className="bg-emerald-600 text-white px-10 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-100 transform active:scale-95 transition-all">
                     {isSubmitting ? <Loader2 size={20} className="animate-spin"/> : <Save size={20}/>} 
                     {editingId ? "Update Record" : "Register Individual"}
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
