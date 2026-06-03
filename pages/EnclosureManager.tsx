
import React, { useState, useEffect, useContext, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { getEnclosures, saveEnclosures, getSpecies, getIndividuals, getOrg, getCurrentProjectId, saveIndividuals, getProjects } from '../services/storage';
import { Enclosure, Species, Individual, EnclosurePoint, Sex, Project, FeedSchedule, FeedIngredient, FeedUnit, FeedFrequency } from '../types';
import { Plus, Search, MapPin, Box, Trash2, Pencil, X, Map as MapIcon, List, Eye, Info, Save, ChevronRight, Dna, Activity, LocateFixed, Trash, MousePointer2, Users, CheckCircle, ArrowRight, ExternalLink, AlertTriangle, AlertCircle, ArrowRightLeft, Move, Navigation, Loader2, Layers, FolderOpen, Crosshair, ShoppingCart, ChevronDown, ChevronUp, UtensilsCrossed, Beef } from 'lucide-react';
import { LanguageContext } from '../App';

declare const L: any;

const FEED_UNITS: FeedUnit[] = ['g', 'kg', 'mL', 'L', 'units', 'portions'];
const FREQ_MULTIPLIERS: Record<FeedFrequency, number> = { daily: 30, weekly: 4.33, monthly: 1 };

interface EnclosureManagerProps {
  currentProjectId: string;
}

const EnclosureManager: React.FC<EnclosureManagerProps> = ({ currentProjectId }) => {
  const { t } = useContext(LanguageContext);
  const location = useLocation();
  const org = getOrg();
  const isPlantOrg = org.focus === 'Flora';
  const label = isPlantOrg ? t('area') : t('enclosure');
  const labelsPlural = isPlantOrg ? t('areas') : t('enclosures');

  const [enclosures, setEnclosures] = useState<Enclosure[]>([]);
  const [allSpecies, setAllSpecies] = useState<Species[]>([]);
  const [allIndividuals, setAllIndividuals] = useState<Individual[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'map' | 'shopping'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedEnclosure, setSelectedEnclosure] = useState<Enclosure | null>(null);
  const [enclosureToDelete, setEnclosureToDelete] = useState<Enclosure | null>(null);
  const [isLocatingGps, setIsLocatingGps] = useState(false);
  const [selectedSpeciesId, setSelectedSpeciesId] = useState<string>('');
  const [activeDietTab, setActiveDietTab] = useState<string | null>(null); // which schedule is expanded

  const [formData, setFormData] = useState<Partial<Enclosure>>({
    name: '', description: '', boundary: [], individualIds: [],
    projectId: currentProjectId === 'ALL_PROJECTS' ? '' : currentProjectId,
    feedSchedules: []
  });

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const formMapRef = useRef<HTMLDivElement>(null);
  const formMapInstanceRef = useRef<any>(null);
  const formBoundaryLayerRef = useRef<any>(null);

  useEffect(() => {
    const encls = getEnclosures();
    setEnclosures(encls);
    setAllSpecies(getSpecies());
    setAllIndividuals(getIndividuals());
    setProjects(getProjects());
    if (location.state?.editId) {
      const found = encls.find(e => e.id === location.state.editId);
      if (found) { setEditingId(found.id); setFormData(found); setShowForm(true); window.history.replaceState({}, document.title); }
    }
  }, [location.state, currentProjectId]);

  const isAll = currentProjectId === 'ALL_PROJECTS';
  const filteredEnclosures = enclosures.filter(e => {
    const matchesProject = isAll || (e.projectId === currentProjectId);
    const matchesSearch = e.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesProject && matchesSearch;
  });

  // ── Main map ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (viewMode === 'map' && mapContainerRef.current && !mapInstanceRef.current) {
      const lat = typeof org.latitude === 'number' ? org.latitude : 0;
      const lng = typeof org.longitude === 'number' ? org.longitude : 0;
      const map = L.map(mapContainerRef.current, { maxZoom: 22, zoomControl: false }).setView([lat, lng], 16);
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
      let selectedPoly: any = null;
      filteredEnclosures.forEach(enc => {
        if (enc.boundary && enc.boundary.length >= 3) {
          const isSelected = selectedEnclosure?.id === enc.id;
          const poly = L.polygon(enc.boundary.map(p => [p.lat, p.lng]), { color: isSelected ? '#3b82f6' : '#9333ea', fillColor: isSelected ? '#3b82f6' : '#9333ea', fillOpacity: isSelected ? 0.4 : 0.2, weight: isSelected ? 3 : 2 }).addTo(layer);
          poly.on('click', (e: any) => { L.DomEvent.stopPropagation(e); setSelectedEnclosure(enc); });
          if (!isSelected) poly.bindTooltip(enc.name, { permanent: true, direction: 'center', className: 'bg-white/90 border-none shadow-sm px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-700 cursor-pointer' });
          if (isSelected) selectedPoly = poly;
        }
      });
      // Fly to selected enclosure whenever it changes (including "View on Map" from list)
      if (selectedPoly) {
        setTimeout(() => map.flyToBounds(selectedPoly.getBounds(), { padding: [60, 60], duration: 1 }), 250);
      }
    }
  }, [viewMode, filteredEnclosures, selectedEnclosure]);

  // ── Form map ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (showForm && formMapRef.current && !formMapInstanceRef.current) {
      const lat = typeof org.latitude === 'number' ? org.latitude : 0;
      const lng = typeof org.longitude === 'number' ? org.longitude : 0;
      const map = L.map(formMapRef.current, { maxZoom: 22 }).setView([lat, lng], 18);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 22 }).addTo(map);
      formBoundaryLayerRef.current = L.featureGroup().addTo(map);
      formMapInstanceRef.current = map;
      map.on('click', (e: any) => {
        const newPoint = { lat: e.latlng.lat, lng: e.latlng.lng };
        setFormData(prev => ({ ...prev, boundary: [...(prev.boundary || []), newPoint] }));
      });
      if (formData.boundary && formData.boundary.length > 0) {
        const poly = L.polygon(formData.boundary.map((p: any) => [p.lat, p.lng]), { color: '#9333ea' });
        map.fitBounds(poly.getBounds(), { padding: [20, 20] });
      }
      setTimeout(() => map.invalidateSize(), 300);
    }
    return () => { if (formMapInstanceRef.current) { formMapInstanceRef.current.remove(); formMapInstanceRef.current = null; formBoundaryLayerRef.current = null; } };
  }, [showForm]);

  useEffect(() => {
    if (formMapInstanceRef.current && formBoundaryLayerRef.current) {
      const layer = formBoundaryLayerRef.current;
      layer.clearLayers();
      if (formData.boundary && formData.boundary.length > 0) {
        formData.boundary.forEach((p, idx) => {
          L.circleMarker([p.lat, p.lng], { radius: 5, color: '#9333ea', fillColor: '#fff', fillOpacity: 1 }).addTo(layer).bindTooltip(`Point ${idx + 1}`);
        });
        if (formData.boundary.length >= 2) L.polyline(formData.boundary.map(p => [p.lat, p.lng]), { color: '#9333ea', weight: 2, dashArray: '5, 5' }).addTo(layer);
        if (formData.boundary.length >= 3) L.polygon(formData.boundary.map(p => [p.lat, p.lng]), { color: '#9333ea', fillColor: '#9333ea', fillOpacity: 0.2 }).addTo(layer);
      }
    }
  }, [formData.boundary]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const targetProjectId = isAll ? formData.projectId : currentProjectId;
    if (!targetProjectId) { alert("Please select a project for this " + label.toLowerCase()); return; }
    const newEnc: Enclosure = { ...formData as Enclosure, id: editingId || `enc-${Date.now()}`, orgId: org.id, individualIds: formData.individualIds || [], projectId: targetProjectId };
    const updatedEnclosures = (editingId ? enclosures.map(enc => enc.id === editingId ? newEnc : enc) : [...enclosures, newEnc])
      .map(enc => enc.id === newEnc.id ? enc : { ...enc, individualIds: enc.individualIds.filter(id => !newEnc.individualIds.includes(id)) });
    const updatedIndividuals = allIndividuals.map(ind => {
      if (newEnc.individualIds.includes(ind.id)) return { ...ind, enclosureId: newEnc.id };
      if (ind.enclosureId === newEnc.id && !newEnc.individualIds.includes(ind.id)) return { ...ind, enclosureId: undefined };
      return ind;
    });
    setEnclosures(updatedEnclosures); saveEnclosures(updatedEnclosures);
    setAllIndividuals(updatedIndividuals); saveIndividuals(updatedIndividuals);
    setShowForm(false); setEditingId(null); setSelectedEnclosure(null);
  };

  const clearBoundary = () => setFormData(prev => ({ ...prev, boundary: [] }));

  const addPointViaGps = () => {
    if (!navigator.geolocation) { alert("Geolocation is not supported by your browser"); return; }
    setIsLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude, longitude } }) => {
        setFormData(prev => ({ ...prev, boundary: [...(prev.boundary || []), { lat: latitude, lng: longitude }] }));
        if (formMapInstanceRef.current) formMapInstanceRef.current.flyTo([latitude, longitude], 19);
        setIsLocatingGps(false);
      },
      (err) => { alert("Unable to retrieve location: " + err.message); setIsLocatingGps(false); },
      { enableHighAccuracy: true }
    );
  };

  const toggleIndividual = (id: string) => {
    const current = formData.individualIds || [];
    setFormData({ ...formData, individualIds: current.includes(id) ? current.filter(cid => cid !== id) : [...current, id] });
  };

  // ── Feed schedule helpers ─────────────────────────────────────────────────
  const addSchedule = () => {
    const newSchedule: FeedSchedule = { id: `fs-${Date.now()}`, name: 'New Feed Schedule', frequency: 'daily', ingredients: [] };
    setFormData(prev => ({ ...prev, feedSchedules: [...(prev.feedSchedules || []), newSchedule] }));
    setActiveDietTab(newSchedule.id);
  };

  const updateSchedule = (scheduleId: string, updates: Partial<FeedSchedule>) => {
    setFormData(prev => ({
      ...prev,
      feedSchedules: (prev.feedSchedules || []).map(s => s.id === scheduleId ? { ...s, ...updates } : s)
    }));
  };

  const removeSchedule = (scheduleId: string) => {
    setFormData(prev => ({ ...prev, feedSchedules: (prev.feedSchedules || []).filter(s => s.id !== scheduleId) }));
    if (activeDietTab === scheduleId) setActiveDietTab(null);
  };

  const addIngredient = (scheduleId: string) => {
    const newIng: FeedIngredient = { id: `fi-${Date.now()}`, name: '', amount: 0, unit: 'kg' };
    updateSchedule(scheduleId, { ingredients: [...((formData.feedSchedules || []).find(s => s.id === scheduleId)?.ingredients || []), newIng] });
  };

  const updateIngredient = (scheduleId: string, ingId: string, updates: Partial<FeedIngredient>) => {
    setFormData(prev => ({
      ...prev,
      feedSchedules: (prev.feedSchedules || []).map(s =>
        s.id === scheduleId ? { ...s, ingredients: s.ingredients.map(i => i.id === ingId ? { ...i, ...updates } : i) } : s
      )
    }));
  };

  const removeIngredient = (scheduleId: string, ingId: string) => {
    setFormData(prev => ({
      ...prev,
      feedSchedules: (prev.feedSchedules || []).map(s =>
        s.id === scheduleId ? { ...s, ingredients: s.ingredients.filter(i => i.id !== ingId) } : s
      )
    }));
  };

  // ── Shopping list calculation ─────────────────────────────────────────────
  type ShoppingItem = { name: string; unit: FeedUnit; monthlyAmount: number; enclosures: string[] };

  const computeShoppingList = (): ShoppingItem[] => {
    const map = new Map<string, ShoppingItem>();
    filteredEnclosures.forEach(enc => {
      (enc.feedSchedules || []).forEach(sched => {
        const mult = FREQ_MULTIPLIERS[sched.frequency];
        sched.ingredients.forEach(ing => {
          if (!ing.name.trim() || ing.amount <= 0) return;
          const key = `${ing.name.trim().toLowerCase()}__${ing.unit}`;
          if (map.has(key)) {
            const existing = map.get(key)!;
            existing.monthlyAmount += ing.amount * mult;
            if (!existing.enclosures.includes(enc.name)) existing.enclosures.push(enc.name);
          } else {
            map.set(key, { name: ing.name.trim(), unit: ing.unit, monthlyAmount: ing.amount * mult, enclosures: [enc.name] });
          }
        });
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  };

  const projectSpecies = allSpecies.filter(s => isAll ? (formData.projectId ? s.projectId === formData.projectId : true) : s.projectId === currentProjectId);
  const speciesIndividuals = allIndividuals.filter(i => i.speciesId === selectedSpeciesId && (isAll ? (formData.projectId ? i.projectId === formData.projectId : true) : i.projectId === currentProjectId));
  const getEnclosureProjectName = (enc: Enclosure) => enc.projectId ? (projects.find(p => p.id === enc.projectId)?.name || 'Unknown') : 'Global/Org-Wide';

  const shoppingList = viewMode === 'shopping' ? computeShoppingList() : [];

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 flex-shrink-0">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-2xl font-bold text-slate-900">{labelsPlural}</h2>
            <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border border-purple-200">
              {isAll ? <Layers size={14}/> : <FolderOpen size={14} />}
              {isAll ? t('orgWideView') : (projects.find(p => p.id === currentProjectId)?.name || t('projectScope'))}
            </span>
          </div>
          <p className="text-slate-500">{t('enclosuresDescription')}</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={() => { setEditingId(null); setFormData({ name: '', description: '', individualIds: [], boundary: [], feedSchedules: [], projectId: isAll ? '' : currentProjectId }); setShowForm(true); }}
            className="flex-1 md:flex-none flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-all"
          >
            <Plus size={18} /><span>Add {label}</span>
          </button>
          <div className="flex bg-white border border-slate-300 rounded-lg p-1 shadow-sm">
            <button onClick={() => setViewMode('list')} title="List view" className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}><List size={18} /></button>
            <button onClick={() => setViewMode('map')} title="Map view" className={`p-1.5 rounded-md transition-colors ${viewMode === 'map' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}><MapIcon size={18} /></button>
            <button onClick={() => setViewMode('shopping')} title="Monthly shopping list" className={`p-1.5 rounded-md transition-colors ${viewMode === 'shopping' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}><ShoppingCart size={18} /></button>
          </div>
        </div>
      </div>

      {viewMode !== 'shopping' && (
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white" placeholder={`Search ${labelsPlural.toLowerCase()}...`} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto">
          {filteredEnclosures.map(enc => {
            const scheduleCount = (enc.feedSchedules || []).length;
            return (
              <div key={enc.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col group">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-2.5 bg-purple-100 text-purple-600 rounded-lg"><Box size={24} /></div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setEditingId(enc.id); setFormData({ ...enc, feedSchedules: enc.feedSchedules || [] }); setShowForm(true); }} className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg"><Pencil size={16}/></button>
                    <button onClick={() => setEnclosureToDelete(enc)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg"><Trash2 size={16}/></button>
                  </div>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">{enc.name}</h3>
                <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-2 flex items-center gap-1"><FolderOpen size={10}/> {getEnclosureProjectName(enc)}</p>
                <p className="text-sm text-slate-500 mb-4 line-clamp-2">{enc.description || 'No description provided.'}</p>
                <div className="mt-auto pt-4 border-t border-slate-50 flex items-center justify-between text-xs font-bold text-slate-400">
                  <span className="uppercase tracking-widest">{enc.individualIds.length} Occupants</span>
                  <div className="flex items-center gap-3">
                    {scheduleCount > 0 && (
                      <span className="text-amber-600 flex items-center gap-1"><UtensilsCrossed size={12}/> {scheduleCount} diet{scheduleCount !== 1 ? 's' : ''}</span>
                    )}
                    <button onClick={() => { setSelectedEnclosure(enc); setViewMode('map'); }} className="text-emerald-600 uppercase hover:underline">View on Map →</button>
                  </div>
                </div>
              </div>
            );
          })}
          {filteredEnclosures.length === 0 && (
            <div className="col-span-full py-20 bg-white border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400">
              <Box size={48} className="mb-4 opacity-20" />
              <p className="text-lg font-bold">No {labelsPlural.toLowerCase()} found.</p>
              <p className="text-sm">Try selecting 'All Projects' or create a new {label.toLowerCase()}.</p>
            </div>
          )}
        </div>
      )}

      {/* Map View */}
      {viewMode === 'map' && (
        <div className="flex-1 relative bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden" style={{ minHeight: '480px' }}>
          <div ref={mapContainerRef} className="w-full h-full" />

          {/* Info panel — slides in when an enclosure is selected */}
          {selectedEnclosure && (
            <div className="absolute top-3 right-3 z-[1000] w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in slide-in-from-right duration-200">
              <div className="bg-purple-600 p-4 text-white">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Box size={18} className="shrink-0"/>
                    <h3 className="font-bold text-base leading-tight truncate">{selectedEnclosure.name}</h3>
                  </div>
                  <button onClick={() => setSelectedEnclosure(null)} className="text-purple-200 hover:text-white shrink-0 mt-0.5"><X size={18}/></button>
                </div>
                <p className="text-[10px] text-purple-200 mt-1 flex items-center gap-1">
                  <FolderOpen size={10}/> {getEnclosureProjectName(selectedEnclosure)}
                </p>
              </div>

              <div className="p-4 space-y-3">
                {selectedEnclosure.description && (
                  <p className="text-sm text-slate-600 leading-relaxed">{selectedEnclosure.description}</p>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                    <p className="text-2xl font-black text-slate-800">{selectedEnclosure.individualIds.length}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Occupants</p>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-3 text-center border border-amber-100">
                    <p className="text-2xl font-black text-amber-700">{(selectedEnclosure.feedSchedules || []).length}</p>
                    <p className="text-[10px] text-amber-500 font-bold uppercase tracking-widest mt-0.5">Diets</p>
                  </div>
                </div>

                {selectedEnclosure.individualIds.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Occupants</p>
                    <div className="space-y-1 max-h-28 overflow-y-auto">
                      {selectedEnclosure.individualIds.map(id => {
                        const ind = allIndividuals.find(i => i.id === id);
                        const sp = ind ? allSpecies.find(s => s.id === ind.speciesId) : null;
                        return ind ? (
                          <div key={id} className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-2.5 py-1.5">
                            <span className="font-semibold text-slate-700 truncate">{ind.name}</span>
                            <span className="text-slate-400 shrink-0 ml-2">{sp?.commonName}</span>
                          </div>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}

                {(selectedEnclosure.feedSchedules || []).length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Feed Schedules</p>
                    {selectedEnclosure.feedSchedules!.map(s => (
                      <div key={s.id} className="flex items-center justify-between text-xs bg-amber-50 rounded-lg px-2.5 py-1.5">
                        <span className="font-semibold text-amber-800 truncate">{s.name}</span>
                        <span className="text-amber-500 capitalize shrink-0 ml-2">{s.frequency} · {s.ingredients.length} ing.</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => { setEditingId(selectedEnclosure.id); setFormData({ ...selectedEnclosure, feedSchedules: selectedEnclosure.feedSchedules || [] }); setShowForm(true); }}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 rounded-xl transition-colors"
                  >
                    <Pencil size={13}/> Edit
                  </button>
                  <button
                    onClick={() => setEnclosureToDelete(selectedEnclosure)}
                    className="flex items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold px-3 py-2 rounded-xl transition-colors border border-red-100"
                  >
                    <Trash2 size={13}/>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Hint when nothing is selected */}
          {!selectedEnclosure && filteredEnclosures.some(e => e.boundary && e.boundary.length >= 3) && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-white/90 backdrop-blur-sm text-slate-600 text-xs font-medium px-4 py-2 rounded-full shadow border border-slate-200 pointer-events-none">
              Click an enclosure on the map to see details
            </div>
          )}
        </div>
      )}

      {/* Shopping List View */}
      {viewMode === 'shopping' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-1">
              <ShoppingCart size={20} className="text-amber-600" />
              <h3 className="text-lg font-bold text-slate-900">Monthly Feed Shopping List</h3>
            </div>
            <p className="text-sm text-slate-500 mb-6">
              Aggregated monthly requirements across {filteredEnclosures.length} {labelsPlural.toLowerCase()}.
              Daily schedules × 30, weekly × 4.33, monthly × 1.
            </p>

            {shoppingList.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                <UtensilsCrossed size={40} className="mb-3 opacity-20" />
                <p className="font-bold">No feed schedules configured yet.</p>
                <p className="text-sm mt-1">Edit an {label.toLowerCase()} and add feed schedules under the Diet tab.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase">Ingredient</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase text-right">Monthly Amount</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase">Used In</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {shoppingList.map((item, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-800 capitalize">{item.name}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-black text-emerald-700 text-base">{item.monthlyAmount % 1 === 0 ? item.monthlyAmount : item.monthlyAmount.toFixed(2)}</span>
                          <span className="text-slate-400 text-sm ml-1">{item.unit}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {item.enclosures.map(name => (
                              <span key={name} className="text-[10px] bg-purple-100 text-purple-700 font-bold px-2 py-0.5 rounded-full">{name}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Per-enclosure breakdown */}
          {shoppingList.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2"><Beef size={16} className="text-amber-600"/> Per-{label} Breakdown</h4>
              <div className="space-y-4">
                {filteredEnclosures.filter(enc => (enc.feedSchedules || []).length > 0).map(enc => (
                  <div key={enc.id} className="border border-slate-100 rounded-xl p-4">
                    <p className="font-bold text-slate-800 mb-3 flex items-center gap-2"><Box size={14} className="text-purple-500"/> {enc.name}</p>
                    <div className="space-y-2">
                      {(enc.feedSchedules || []).map(sched => (
                        <div key={sched.id} className="ml-4">
                          <p className="text-xs font-bold text-slate-500 uppercase mb-1">{sched.name} <span className="text-amber-500 capitalize">({sched.frequency})</span></p>
                          <div className="flex flex-wrap gap-2">
                            {sched.ingredients.filter(i => i.name && i.amount > 0).map(ing => (
                              <span key={ing.id} className="text-xs bg-slate-50 border border-slate-100 text-slate-600 px-2 py-1 rounded-lg">
                                {ing.name}: <strong>{(ing.amount * FREQ_MULTIPLIERS[sched.frequency]).toFixed(1)} {ing.unit}</strong>/mo
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-[2000] bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl animate-in zoom-in duration-200 flex flex-col max-h-[95vh]">
            <div className="p-6 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-xl text-slate-900">{editingId ? `Edit ${label}` : `Add ${label}`}</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X size={24}/></button>
            </div>
            <form onSubmit={handleSave} className="p-8 space-y-8 flex-1 overflow-y-auto">
              {/* Main details + individual assignment */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase">{label} Name</label>
                      <input className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
                    </div>
                    {isAll && (
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">Project Assignment</label>
                        <select className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-emerald-500" value={formData.projectId} onChange={e => setFormData({...formData, projectId: e.target.value})} required>
                          <option value="">Select Scoped Project...</option>
                          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                    )}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase">Description</label>
                      <textarea className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" rows={3} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><MapPin size={14}/> Define Boundary</label>
                      <div className="flex gap-3">
                        <button type="button" onClick={addPointViaGps} className="text-[10px] font-bold text-emerald-600 uppercase hover:underline flex items-center gap-1">
                          {isLocatingGps ? <Loader2 size={12} className="animate-spin"/> : <Crosshair size={12}/>} Add Point via GPS
                        </button>
                        <button type="button" onClick={clearBoundary} className="text-[10px] font-bold text-red-600 uppercase hover:underline">Clear Map</button>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 italic">Click on the map or use GPS to define the polygon vertices for this {label.toLowerCase()}.</p>
                    <div className="h-64 rounded-xl border border-slate-200 overflow-hidden bg-slate-100">
                      <div ref={formMapRef} className="h-full w-full" />
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 bg-slate-50 p-2 rounded">Points: {(formData.boundary || []).length} vertices defined.</div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Users size={18} className="text-blue-600"/> Assign Individuals</h4>
                  <p className="text-xs text-slate-500">Only individuals from the selected project will appear here.</p>
                  <select className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-sm outline-none focus:ring-2 focus:ring-emerald-500" value={selectedSpeciesId} onChange={e => setSelectedSpeciesId(e.target.value)} disabled={isAll && !formData.projectId}>
                    <option value="">{isAll && !formData.projectId ? 'Choose project first...' : 'Choose species...'}</option>
                    {projectSpecies.map(s => <option key={s.id} value={s.id}>{s.commonName}</option>)}
                  </select>
                  <div className="border border-slate-200 rounded-xl bg-slate-50 max-h-72 overflow-y-auto divide-y divide-slate-100">
                    {speciesIndividuals.map(ind => {
                      const otherEnc = enclosures.find(e => e.id !== editingId && e.individualIds.includes(ind.id));
                      const isUnassigned = !ind.enclosureId && !otherEnc;
                      return (
                        <label key={ind.id} className="flex items-center gap-3 p-3 cursor-pointer hover:bg-white transition-colors relative group">
                          <input type="checkbox" checked={formData.individualIds?.includes(ind.id)} onChange={() => toggleIndividual(ind.id)} className="rounded text-blue-600 focus:ring-blue-500" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-bold truncate ${isUnassigned ? 'text-emerald-700' : 'text-slate-700'}`}>{ind.name}</span>
                              {isUnassigned && <span className="text-[8px] bg-emerald-100 text-emerald-700 px-1 rounded-sm font-black uppercase">Unassigned</span>}
                            </div>
                            <span className="text-[10px] font-mono text-slate-400">{ind.studbookId}</span>
                          </div>
                          {otherEnc && <div className="flex items-center gap-1 text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100"><AlertCircle size={10}/> In: {otherEnc.name}</div>}
                        </label>
                      );
                    })}
                    {selectedSpeciesId && speciesIndividuals.length === 0 && <p className="p-4 text-xs text-slate-400 italic">No individuals of this species found.</p>}
                    {!selectedSpeciesId && <div className="p-8 text-center text-slate-300"><Users size={32} className="mx-auto mb-2 opacity-20" /><p className="text-xs uppercase font-bold tracking-widest">Select species to assign</p></div>}
                  </div>
                </div>
              </div>

              {/* Diet / Feed Schedules */}
              <div className="border-t border-slate-100 pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2"><UtensilsCrossed size={16} className="text-amber-600"/> Diet &amp; Feed Schedules</h4>
                  <button type="button" onClick={addSchedule} className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3 py-1.5 rounded-lg transition-colors">
                    <Plus size={13}/> Add Schedule
                  </button>
                </div>
                <p className="text-xs text-slate-400">Define daily, weekly, or monthly feed schedules with ingredients. Used to generate the monthly shopping list.</p>

                {(formData.feedSchedules || []).length === 0 && (
                  <div className="py-8 text-center text-slate-300 border border-dashed border-slate-200 rounded-xl">
                    <UtensilsCrossed size={28} className="mx-auto mb-2 opacity-30"/>
                    <p className="text-xs font-bold uppercase tracking-widest">No feed schedules yet</p>
                  </div>
                )}

                <div className="space-y-3">
                  {(formData.feedSchedules || []).map(sched => (
                    <div key={sched.id} className="border border-slate-200 rounded-xl overflow-hidden">
                      {/* Schedule header */}
                      <div
                        className="flex items-center gap-3 p-3 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors"
                        onClick={() => setActiveDietTab(activeDietTab === sched.id ? null : sched.id)}
                      >
                        <UtensilsCrossed size={14} className="text-amber-500 shrink-0"/>
                        <input
                          className="flex-1 bg-transparent text-sm font-bold text-slate-800 outline-none focus:underline min-w-0"
                          value={sched.name}
                          onChange={e => { e.stopPropagation(); updateSchedule(sched.id, { name: e.target.value }); }}
                          onClick={e => e.stopPropagation()}
                          placeholder="Schedule name..."
                        />
                        <select
                          className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white outline-none focus:ring-2 focus:ring-amber-400"
                          value={sched.frequency}
                          onChange={e => { e.stopPropagation(); updateSchedule(sched.id, { frequency: e.target.value as FeedFrequency }); }}
                          onClick={e => e.stopPropagation()}
                        >
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                        </select>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">{sched.ingredients.length} ingredient{sched.ingredients.length !== 1 ? 's' : ''}</span>
                        <button type="button" onClick={e => { e.stopPropagation(); removeSchedule(sched.id); }} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={14}/></button>
                        {activeDietTab === sched.id ? <ChevronUp size={14} className="text-slate-400"/> : <ChevronDown size={14} className="text-slate-400"/>}
                      </div>

                      {/* Expanded ingredient list */}
                      {activeDietTab === sched.id && (
                        <div className="p-4 space-y-3">
                          {sched.ingredients.length === 0 && (
                            <p className="text-xs text-slate-400 italic text-center py-2">No ingredients yet. Add one below.</p>
                          )}
                          {sched.ingredients.map(ing => (
                            <div key={ing.id} className="flex items-center gap-2">
                              <input
                                className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-400"
                                placeholder="Ingredient name..."
                                value={ing.name}
                                onChange={e => updateIngredient(sched.id, ing.id, { name: e.target.value })}
                              />
                              <input
                                type="number"
                                min="0"
                                step="any"
                                className="w-24 px-3 py-1.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-400 text-right"
                                placeholder="Amount"
                                value={ing.amount || ''}
                                onChange={e => updateIngredient(sched.id, ing.id, { amount: parseFloat(e.target.value) || 0 })}
                              />
                              <select
                                className="w-24 px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-amber-400"
                                value={ing.unit}
                                onChange={e => updateIngredient(sched.id, ing.id, { unit: e.target.value as FeedUnit })}
                              >
                                {FEED_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                              </select>
                              <button type="button" onClick={() => removeIngredient(sched.id, ing.id)} className="text-slate-300 hover:text-red-500 transition-colors shrink-0"><X size={16}/></button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => addIngredient(sched.id)}
                            className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-amber-600 transition-colors"
                          >
                            <Plus size={13}/> Add ingredient
                          </button>
                          <div className="mt-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Notes</label>
                            <textarea
                              className="w-full mt-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-amber-400"
                              rows={2}
                              placeholder="Any feeding notes..."
                              value={sched.notes || ''}
                              onChange={e => updateSchedule(sched.id, { notes: e.target.value })}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-bold">Cancel</button>
                <button type="submit" className="bg-emerald-600 text-white px-10 py-2 rounded-lg font-bold shadow-lg hover:bg-emerald-700 active:scale-95 transition-all">Save {label}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {enclosureToDelete && (
        <div className="fixed inset-0 z-[3000] bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-8 text-center animate-in zoom-in duration-200">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6"><AlertTriangle size={40}/></div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Delete {label}?</h3>
            <p className="text-slate-500 mb-8">Are you sure you want to remove <strong>{enclosureToDelete.name}</strong>? Individuals will remain but their location assignment will be cleared.</p>
            <div className="flex gap-3">
              <button onClick={() => setEnclosureToDelete(null)} className="flex-1 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-bold">Cancel</button>
              <button onClick={() => {
                const updatedInds = allIndividuals.map(i => i.enclosureId === enclosureToDelete.id ? { ...i, enclosureId: undefined } : i);
                setAllIndividuals(updatedInds); saveIndividuals(updatedInds);
                const updated = enclosures.filter(e => e.id !== enclosureToDelete.id);
                setEnclosures(updated); saveEnclosures(updated); setEnclosureToDelete(null);
              }} className="flex-1 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 shadow-md">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default EnclosureManager;
