
import React, { useState, useEffect, useContext, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { getEnclosures, saveEnclosures, getSpecies, getIndividuals, getOrg, getCurrentProjectId, saveIndividuals } from '../services/storage';
import { Enclosure, Species, Individual, EnclosurePoint, Sex } from '../types';
// Added AlertCircle to imports
import { Plus, Search, MapPin, Box, Trash2, Pencil, X, Map as MapIcon, List, Eye, Info, Save, ChevronRight, Dna, Activity, LocateFixed, Trash, MousePointer2, Users, CheckCircle, ArrowRight, ExternalLink, AlertTriangle, AlertCircle, ArrowRightLeft, Move } from 'lucide-react';
import { LanguageContext } from '../App';

declare const L: any;

const EnclosureManager: React.FC = () => {
  const { t } = useContext(LanguageContext);
  const location = useLocation();
  const org = getOrg();
  const currentProjectId = getCurrentProjectId();
  const isPlantOrg = org.focus === 'Plants';
  const label = isPlantOrg ? 'Area' : 'Enclosure';
  const labelsPlural = isPlantOrg ? 'Areas' : 'Enclosures';

  const [enclosures, setEnclosures] = useState<Enclosure[]>([]);
  const [allSpecies, setAllSpecies] = useState<Species[]>([]);
  const [allIndividuals, setAllIndividuals] = useState<Individual[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedEnclosure, setSelectedEnclosure] = useState<Enclosure | null>(null);
  const [enclosureToDelete, setEnclosureToDelete] = useState<Enclosure | null>(null);
  
  // Batch Move State
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveSourceId, setMoveSourceId] = useState('');
  const [moveDestId, setMoveDestId] = useState('');
  const [selectedIndsForMove, setSelectedIndsForMove] = useState<Set<string>>(new Set());

  // Selection step in Form
  const [selectedSpeciesId, setSelectedSpeciesId] = useState<string>('');

  const [formData, setFormData] = useState<Partial<Enclosure>>({
    name: '',
    description: '',
    boundary: [],
    individualIds: []
  });

  const [showMapPicker, setShowMapPicker] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const pickerMapRef = useRef<HTMLDivElement>(null);
  const pickerInstance = useRef<any>(null);
  const pickerPolygon = useRef<any>(null);
  const pickerMarkers = useRef<any[]>([]);

  useEffect(() => {
    const encls = getEnclosures();
    setEnclosures(encls);
    setAllSpecies(getSpecies());
    setAllIndividuals(getIndividuals());

    // Handle incoming navigation for editing a specific enclosure
    if (location.state?.editId) {
      const found = encls.find(e => e.id === location.state.editId);
      if (found) {
        setEditingId(found.id);
        setFormData(found);
        setShowForm(true);
        // Clear history state
        window.history.replaceState({}, document.title);
      }
    }
  }, [location.state]);

  // Main Map View Effect
  useEffect(() => {
    if (viewMode === 'map' && mapContainerRef.current && !mapInstanceRef.current) {
      const initialLat = typeof org.latitude === 'number' ? org.latitude : 0;
      const initialLng = typeof org.longitude === 'number' ? org.longitude : 0;
      
      const map = L.map(mapContainerRef.current, { 
        maxZoom: 22,
        zoomControl: false 
      }).setView([initialLat, initialLng], 16);
      
      L.control.zoom({ position: 'topright' }).addTo(map);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 22 }).addTo(map);
      
      const layer = L.layerGroup().addTo(map);
      markersLayerRef.current = layer;
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

  useEffect(() => {
    if (viewMode === 'map' && mapInstanceRef.current && markersLayerRef.current) {
      const layer = markersLayerRef.current;
      const map = mapInstanceRef.current;
      layer.clearLayers();
      
      enclosures.forEach(enc => {
        if (enc.boundary && Array.isArray(enc.boundary) && enc.boundary.length > 0) {
          const validPoints = enc.boundary.filter(p => p && typeof p.lat === 'number' && typeof p.lng === 'number');
          
          if (validPoints.length >= 3) {
            const isSelected = selectedEnclosure?.id === enc.id;
            const poly = L.polygon(validPoints.map(p => [p.lat, p.lng]), {
              color: isSelected ? '#3b82f6' : '#9333ea',
              fillColor: isSelected ? '#3b82f6' : '#9333ea',
              fillOpacity: isSelected ? 0.4 : 0.2,
              weight: isSelected ? 3 : 2
            }).addTo(layer);
            
            poly.on('click', (e: any) => {
               L.DomEvent.stopPropagation(e);
               setSelectedEnclosure(enc);
               map.flyToBounds(poly.getBounds(), { padding: [50, 50], duration: 1 });
            });

            if (!isSelected) {
              poly.bindTooltip(enc.name, {
                permanent: true,
                direction: 'center',
                className: 'bg-white/90 border-none shadow-sm px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-700 cursor-pointer'
              });
            }
          }
        }
      });
    }
  }, [viewMode, enclosures, selectedEnclosure]);

  // Picker Map Effect (Polygon Drawing)
  useEffect(() => {
    if (showMapPicker && pickerMapRef.current && !pickerInstance.current) {
       const initialLat = (formData.boundary && typeof formData.boundary[0]?.lat === 'number') ? formData.boundary[0].lat : (typeof org.latitude === 'number' ? org.latitude : 0);
       const initialLng = (formData.boundary && typeof formData.boundary[0]?.lng === 'number') ? formData.boundary[0].lng : (typeof org.longitude === 'number' ? org.longitude : 0);
       
       const map = L.map(pickerMapRef.current).setView([initialLat, initialLng], 18);
       L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 22, maxNativeZoom: 19 }).addTo(map);
       
       pickerInstance.current = map;
       pickerMarkers.current = [];

       const updatePolygon = () => {
         const points = pickerMarkers.current.map(m => m.getLatLng());
         if (pickerPolygon.current) {
            pickerPolygon.current.setLatLngs(points);
         } else if (points.length >= 2) {
            pickerPolygon.current = L.polygon(points, { color: '#9333ea' }).addTo(map);
         }
       };

       if (formData.boundary && Array.isArray(formData.boundary) && formData.boundary.length > 0) {
          formData.boundary.forEach(p => {
             if (p && typeof p.lat === 'number' && typeof p.lng === 'number') {
                const marker = L.marker([p.lat, p.lng], { draggable: true }).addTo(map);
                marker.on('drag', updatePolygon);
                pickerMarkers.current.push(marker);
             }
          });
          updatePolygon();
       }

       map.on('click', (e: any) => {
          const marker = L.marker(e.latlng, { draggable: true }).addTo(map);
          marker.on('drag', updatePolygon);
          pickerMarkers.current.push(marker);
          updatePolygon();
       });

       setTimeout(() => map.invalidateSize(), 200);
    }
  }, [showMapPicker, org, formData.boundary]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const newEnc: Enclosure = {
      ...formData as Enclosure,
      id: editingId || `enc-${Date.now()}`,
      orgId: org.id,
      individualIds: formData.individualIds || []
    };
    
    const updatedEnclosures = editingId 
      ? enclosures.map(enc => enc.id === editingId ? newEnc : enc)
      : [...enclosures, newEnc];
      
    setEnclosures(updatedEnclosures);
    saveEnclosures(updatedEnclosures);

    const updatedInds = allIndividuals.map(ind => {
       if (newEnc.individualIds.includes(ind.id)) {
          return { ...ind, enclosureId: newEnc.id };
       }
       if (ind.enclosureId === newEnc.id && !newEnc.individualIds.includes(ind.id)) {
          return { ...ind, enclosureId: undefined };
       }
       return ind;
    });

    setAllIndividuals(updatedInds);
    saveIndividuals(updatedInds);

    setShowForm(false);
    setEditingId(null);
    setSelectedEnclosure(null); 
    setFormData({ name: '', description: '', individualIds: [], boundary: [] });
  };

  const handleEdit = (enc: Enclosure) => {
    setEditingId(enc.id);
    setFormData(enc);
    setShowForm(true);
  };

  const handleBatchMove = () => {
     if (!moveDestId) return;
     
     const movingIds = Array.from(selectedIndsForMove);
     let updatedInds = [...allIndividuals];
     let updatedEncls = [...enclosures];

     // 1. Update Individuals
     updatedInds = updatedInds.map(ind => {
        if (movingIds.includes(ind.id)) {
           return { ...ind, enclosureId: moveDestId === 'NONE' ? undefined : moveDestId };
        }
        return ind;
     });

     // 2. Update Enclosures (IndividualIds arrays)
     updatedEncls = updatedEncls.map(enc => {
        // Remove from everywhere they currently are
        let newIds = enc.individualIds.filter(id => !movingIds.includes(id));
        // Add to destination if this IS the destination
        if (enc.id === moveDestId) {
           newIds = Array.from(new Set([...newIds, ...movingIds]));
        }
        return { ...enc, individualIds: newIds };
     });

     setAllIndividuals(updatedInds);
     setEnclosures(updatedEncls);
     saveIndividuals(updatedInds);
     saveEnclosures(updatedEncls);
     
     setShowMoveModal(false);
     setMoveSourceId('');
     setMoveDestId('');
     setSelectedIndsForMove(new Set());
  };

  const confirmDelete = () => {
    if (!enclosureToDelete) return;
    const id = enclosureToDelete.id;
    const updated = enclosures.filter(e => e.id !== id);
    setEnclosures(updated);
    saveEnclosures(updated);
    
    const updatedInds = allIndividuals.map(ind => ind.enclosureId === id ? { ...ind, enclosureId: undefined } : ind);
    setAllIndividuals(updatedInds);
    saveIndividuals(updatedInds);
    
    setSelectedEnclosure(null);
    setEnclosureToDelete(null);
  };

  const toggleIndividual = (id: string) => {
    const current = formData.individualIds || [];
    if (current.includes(id)) setFormData({ ...formData, individualIds: current.filter(cid => cid !== id) });
    else setFormData({ ...formData, individualIds: [...current, id] });
  };

  const filteredEnclosures = enclosures.filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const projectSpecies = allSpecies.filter(s => s.projectId === currentProjectId);
  const speciesIndividuals = allIndividuals.filter(i => i.speciesId === selectedSpeciesId && i.projectId === currentProjectId);

  const getGroupedOccupants = (enclosure: Enclosure) => {
     const occupantIds = enclosure.individualIds || [];
     const grouped: Record<string, { species: Species, inds: Individual[] }> = {};

     occupantIds.forEach(id => {
        const ind = allIndividuals.find(i => i.id === id);
        if (ind) {
           const sp = allSpecies.find(s => s.id === ind.speciesId);
           if (sp) {
              if (!grouped[sp.id]) grouped[sp.id] = { species: sp, inds: [] };
              grouped[sp.id].inds.push(ind);
           }
        }
     });

     return Object.values(grouped);
  };

  const moveSourceIndividuals = allIndividuals.filter(i => {
     if (moveSourceId === 'UNASSIGNED') return !i.enclosureId && i.projectId === currentProjectId;
     return i.enclosureId === moveSourceId;
  });

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{labelsPlural}</h2>
          <p className="text-slate-500">Physical management of {labelsPlural.toLowerCase()} and animal locations.</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button onClick={() => setShowMoveModal(true)} className="flex items-center justify-center space-x-2 bg-purple-50 text-purple-700 border border-purple-200 px-4 py-2 rounded-lg font-medium hover:bg-purple-100 transition-all">
            <ArrowRightLeft size={18}/>
            <span className="hidden sm:inline">Batch Transfer</span>
          </button>
          <div className="flex bg-white border border-slate-300 rounded-lg p-1 shadow-sm">
            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}><List size={18} /></button>
            <button onClick={() => setViewMode('map')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'map' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}><MapIcon size={18} /></button>
          </div>
          <button onClick={() => { setEditingId(null); setFormData({name: '', description: '', individualIds: [], boundary: []}); setShowForm(true); }} className="flex-1 md:flex-none flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-all">
            <Plus size={18} />
            <span>Add {label}</span>
          </button>
        </div>
      </div>

      {viewMode === 'list' && (
        <div className="space-y-4 animate-in fade-in duration-300 overflow-y-auto pb-8">
           <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3">
             <Search className="text-slate-400 ml-2" size={20} />
             <input className="flex-1 outline-none text-slate-900 placeholder:text-slate-400 bg-white" placeholder={`Search ${labelsPlural.toLowerCase()}...`} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEnclosures.map(enc => (
              <div key={enc.id} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col group">
                <div className="p-5 flex-1">
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                      <Box size={24} />
                    </div>
                    <div className="flex gap-2">
                       <button onClick={() => handleEdit(enc)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Pencil size={16} /></button>
                       <button onClick={() => setEnclosureToDelete(enc)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1">{enc.name}</h3>
                  <p className="text-sm text-slate-500 mb-4 line-clamp-2">{enc.description || 'No description provided.'}</p>
                  
                  <div className="space-y-3 pt-4 border-t border-slate-50">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-400 uppercase tracking-widest">Occupants</span>
                      <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{enc.individualIds.length}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {enc.individualIds.slice(0, 5).map(id => {
                        const ind = allIndividuals.find(i => i.id === id);
                        return <span key={id} className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold border border-slate-200">{ind?.name || 'Unknown'}</span>;
                      })}
                      {enc.individualIds.length > 5 && <span className="text-[10px] text-slate-400 font-bold flex items-center pl-1">+{enc.individualIds.length - 5} more</span>}
                      {enc.individualIds.length === 0 && <span className="text-[10px] text-slate-300 italic">Unoccupied</span>}
                    </div>
                  </div>
                </div>
                {enc.boundary && enc.boundary.length > 0 && (
                   <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                     <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                       <MapIcon size={12} className="text-purple-500"/> Boundary Plotted
                     </div>
                     <button onClick={() => { setViewMode('map'); setSelectedEnclosure(enc); }} className="text-[10px] font-bold text-emerald-600 hover:underline">View on Map</button>
                   </div>
                )}
              </div>
            ))}
          </div>
          {filteredEnclosures.length === 0 && (
            <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-300">
               <Box className="mx-auto text-slate-200 mb-4" size={64} />
               <p className="text-slate-500 font-medium">No {labelsPlural.toLowerCase()} found.</p>
               <button onClick={() => setShowForm(true)} className="mt-4 text-emerald-600 font-bold hover:underline">Add your first {label.toLowerCase()}</button>
            </div>
          )}
        </div>
      )}

      {viewMode === 'map' && (
        <div className="flex-1 relative bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in duration-300">
          <div ref={mapContainerRef} className="w-full h-full z-0" />
          
          {selectedEnclosure && (
             <div className="absolute right-4 top-4 bottom-4 w-96 bg-white rounded-xl shadow-2xl border border-slate-200 z-[1000] flex flex-col overflow-hidden animate-in slide-in-from-right-10 duration-300">
                <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50">
                   <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                         <div className="p-1.5 bg-purple-100 text-purple-600 rounded-lg"><Box size={20}/></div>
                         <h3 className="text-xl font-bold text-slate-900">{selectedEnclosure.name}</h3>
                      </div>
                      <p className="text-sm text-slate-500 line-clamp-2">{selectedEnclosure.description || 'No description provided.'}</p>
                   </div>
                   <button onClick={() => setSelectedEnclosure(null)} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors"><X size={24} /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                   <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Individuals</p>
                         <p className="text-2xl font-black text-slate-800">{selectedEnclosure.individualIds.length}</p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Species</p>
                         <p className="text-2xl font-black text-slate-800">{getGroupedOccupants(selectedEnclosure).length}</p>
                      </div>
                   </div>

                   <div className="space-y-4">
                      <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-2"><Users size={14}/> Occupant Breakdown</h4>
                      {getGroupedOccupants(selectedEnclosure).map(({ species, inds }) => (
                         <div key={species.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                            <div className="p-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                               <div className="flex items-center gap-2">
                                  {species.imageUrl ? <img src={species.imageUrl} className="w-6 h-6 rounded-full object-cover" /> : <Dna size={16} className="text-emerald-500" />}
                                  <span className="text-sm font-bold text-slate-800">{species.commonName}</span>
                               </div>
                               <span className="text-xs font-bold text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">{inds.length}</span>
                            </div>
                            <div className="divide-y divide-slate-50">
                               {inds.map(ind => (
                                  <div key={ind.id} className="p-3 flex justify-between items-center hover:bg-slate-50 transition-colors group/row">
                                     <div className="flex items-center gap-3">
                                        <div className={`w-2 h-2 rounded-full ${ind.sex === Sex.MALE ? 'bg-blue-400' : ind.sex === Sex.FEMALE ? 'bg-pink-400' : 'bg-slate-300'}`}></div>
                                        <div>
                                           <p className="text-sm font-bold text-slate-700">{ind.name}</p>
                                           <p className="text-[10px] font-mono text-slate-400">{ind.studbookId}</p>
                                        </div>
                                     </div>
                                     <a href={`#/individuals/${ind.id}`} target="_blank" className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg opacity-0 group-hover/row:opacity-100 transition-all"><ExternalLink size={14}/></a>
                                  </div>
                               ))}
                            </div>
                         </div>
                      ))}
                      {selectedEnclosure.individualIds.length === 0 && (
                         <div className="text-center py-10 opacity-30">
                            <Activity size={48} className="mx-auto text-slate-300 mb-2"/>
                            <p className="text-sm font-medium">Currently Unoccupied</p>
                         </div>
                      )}
                   </div>
                </div>

                <div className="p-4 border-t border-slate-100 bg-slate-50 grid grid-cols-2 gap-3">
                   <button onClick={() => setEnclosureToDelete(selectedEnclosure)} className="flex items-center justify-center gap-2 px-4 py-2.5 text-red-600 hover:bg-red-50 rounded-xl font-bold text-sm transition-all"><Trash size={18}/> Delete</button>
                   <button onClick={() => handleEdit(selectedEnclosure)} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white hover:bg-slate-800 rounded-xl font-bold text-sm shadow-lg transition-all"><Pencil size={18}/> Edit {label}</button>
                </div>
             </div>
          )}
        </div>
      )}

      {/* Move Animals Modal */}
      {showMoveModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[2500] flex items-center justify-center p-4">
           <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in duration-200 flex flex-col max-h-[90vh]">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-purple-50">
                 <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 text-purple-700 rounded-lg"><Move size={20}/></div>
                    <h3 className="text-xl font-bold text-purple-900">Batch Transfer Animals</h3>
                 </div>
                 <button onClick={() => setShowMoveModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={24}/></button>
              </div>
              
              <div className="flex-1 overflow-hidden flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-100">
                 {/* Step 1: Source */}
                 <div className="flex-1 p-6 space-y-4 overflow-y-auto">
                    <div className="space-y-1">
                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">1. Select Source Location</label>
                       <select className="w-full p-3 border border-slate-200 rounded-xl text-sm font-bold bg-white outline-none focus:ring-2 focus:ring-purple-200" value={moveSourceId} onChange={e => { setMoveSourceId(e.target.value); setSelectedIndsForMove(new Set()); }}>
                          <option value="">Choose source...</option>
                          <option value="UNASSIGNED">Unassigned Individuals</option>
                          {enclosures.map(e => <option key={e.id} value={e.id}>{e.name} ({e.individualIds.length} inds)</option>)}
                       </select>
                    </div>
                    
                    {moveSourceId && (
                       <div className="space-y-2">
                          <div className="flex justify-between items-center">
                             <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">2. Select Animals to Move</label>
                             <button onClick={() => { if(selectedIndsForMove.size === moveSourceIndividuals.length) setSelectedIndsForMove(new Set()); else setSelectedIndsForMove(new Set(moveSourceIndividuals.map(i=>i.id))); }} className="text-[10px] font-bold text-purple-600 hover:underline">Toggle All</button>
                          </div>
                          <div className="border border-slate-200 rounded-xl bg-slate-50 divide-y divide-slate-100 max-h-96 overflow-y-auto">
                             {moveSourceIndividuals.length === 0 ? (
                                <p className="p-8 text-center text-xs text-slate-400 italic">No animals found in this location.</p>
                             ) : (
                                moveSourceIndividuals.map(ind => (
                                   <label key={ind.id} className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-white transition-colors ${selectedIndsForMove.has(ind.id) ? 'bg-purple-50/50' : ''}`}>
                                      <input type="checkbox" checked={selectedIndsForMove.has(ind.id)} onChange={() => { const s = new Set(selectedIndsForMove); if(s.has(ind.id)) s.delete(ind.id); else s.add(ind.id); setSelectedIndsForMove(s); }} className="rounded text-purple-600" />
                                      <div className="flex-1 overflow-hidden">
                                         <p className="text-sm font-bold text-slate-800 truncate">{ind.name}</p>
                                         <p className="text-[10px] text-slate-400 font-mono">{ind.studbookId} • {allSpecies.find(s=>s.id===ind.speciesId)?.commonName}</p>
                                      </div>
                                   </label>
                                ))
                             )}
                          </div>
                       </div>
                    )}
                 </div>

                 {/* Step 2: Destination */}
                 <div className="md:w-80 p-6 bg-slate-50/50 flex flex-col justify-between">
                    <div className="space-y-6">
                       <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">3. Target Destination</label>
                          <select className="w-full p-3 border-2 border-purple-500 rounded-xl text-sm font-bold bg-white shadow-md outline-none focus:ring-4 focus:ring-purple-100" value={moveDestId} onChange={e => setMoveDestId(e.target.value)}>
                             <option value="">Select target...</option>
                             <option value="NONE">Unassign from Enclosure</option>
                             {enclosures.filter(e => e.id !== moveSourceId).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                          </select>
                       </div>
                       
                       {selectedIndsForMove.size > 0 && moveDestId && (
                          <div className="bg-white p-4 rounded-xl border border-purple-200 shadow-sm animate-in slide-in-from-right-2">
                             <h4 className="text-xs font-bold text-slate-800 mb-3 uppercase tracking-wider border-b border-slate-50 pb-2">Movement Summary</h4>
                             <p className="text-xs text-slate-600 leading-relaxed">
                                You are moving <strong className="text-purple-700">{selectedIndsForMove.size}</strong> individuals to <strong>{moveDestId === 'NONE' ? 'Unassigned' : enclosures.find(e=>e.id===moveDestId)?.name}</strong>.
                             </p>
                             <div className="mt-4 p-3 bg-amber-50 rounded-lg text-[10px] text-amber-800 font-medium border border-amber-100 flex gap-2">
                                <AlertCircle size={14} className="shrink-0"/>
                                This will update the enclosure IDs on all selected individual records automatically.
                             </div>
                          </div>
                       )}
                    </div>

                    <div className="pt-6">
                       <button onClick={handleBatchMove} disabled={selectedIndsForMove.size === 0 || !moveDestId} className="w-full bg-purple-600 hover:bg-purple-700 text-white py-4 rounded-xl font-bold shadow-lg shadow-purple-200 transition-all flex items-center justify-center gap-2 transform active:scale-95 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed">
                          <Move size={20}/>
                          Confirm Movement
                       </button>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-[2000] overflow-y-auto bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl animate-in zoom-in duration-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
               <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg"><Pencil size={20}/></div>
                  <h3 className="text-xl font-bold text-slate-900">{editingId ? `Edit ${label}` : `Add New ${label}`}</h3>
               </div>
               <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors"><X size={24} /></button>
            </div>
            
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-bold text-slate-700 block mb-1">{label} Name</label>
                      <input className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900 font-bold" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder={`e.g. ${isPlantOrg ? 'South Greenhouse' : 'Lion Habitat'}`} required />
                    </div>
                    <div>
                      <label className="text-sm font-bold text-slate-700 block mb-1">Description</label>
                      <textarea className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" rows={3} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Location, climate, or special notes..." />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100">
                    <div className="flex justify-between items-center mb-3">
                       <label className="text-sm font-bold text-slate-700 flex items-center gap-2"><MapIcon size={16} className="text-purple-600"/> Boundary Plot</label>
                       <button type="button" onClick={() => setShowMapPicker(true)} className="text-xs font-bold text-emerald-600 hover:underline flex items-center gap-1"><Pencil size={12}/> {formData.boundary?.length ? 'Edit Polygon' : 'Draw Boundary'}</button>
                    </div>
                    <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 min-h-[100px] flex flex-col items-center justify-center text-center">
                       {formData.boundary && Array.isArray(formData.boundary) && formData.boundary.length > 0 ? (
                          <div className="w-full">
                            <p className="text-xs font-bold text-purple-700 mb-2">{formData.boundary.length} Coordinate Points Defined</p>
                            <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                               {formData.boundary.map((p, i) => (
                                  <span key={i} className="text-[9px] font-mono bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-500">P{i+1}</span>
                               ))}
                            </div>
                          </div>
                       ) : (
                          <div className="space-y-1">
                            <MapPin size={24} className="mx-auto text-slate-300 mb-1" />
                            <p className="text-xs text-slate-500">No boundary defined yet. Click 'Draw Boundary' to plot the area on the map.</p>
                          </div>
                       )}
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                   <div>
                      <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-4"><Users size={18} className="text-blue-600"/> Occupants</h4>
                      <div className="space-y-4">
                         <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">1. Filter Occupants by Species</label>
                            <select 
                               className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                               value={selectedSpeciesId}
                               onChange={(e) => setSelectedSpeciesId(e.target.value)}
                            >
                               <option value="">Choose a species...</option>
                               {projectSpecies.map(s => (
                                  <option key={s.id} value={s.id}>{s.commonName} ({allIndividuals.filter(i => i.speciesId === s.id && i.projectId === currentProjectId).length} total)</option>
                               ))}
                            </select>
                         </div>

                         <div className="space-y-2">
                            <div className="flex justify-between items-center">
                               <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">2. Assign Individuals</label>
                               {selectedSpeciesId && <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{speciesIndividuals.length} available</span>}
                            </div>
                            <div className="border border-slate-200 rounded-xl bg-slate-50 min-h-[200px] max-h-[300px] overflow-y-auto">
                               {!selectedSpeciesId ? (
                                  <div className="h-[200px] flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                                     <MousePointer2 size={24} className="mb-2 opacity-30" />
                                     <p className="text-xs">Select a species above to browse individuals.</p>
                                  </div>
                               ) : speciesIndividuals.length === 0 ? (
                                  <div className="h-[200px] flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                                     <Info size={24} className="mb-2 opacity-30" />
                                     <p className="text-xs">No individuals found for this species in this project.</p>
                                  </div>
                               ) : (
                                  <div className="divide-y divide-slate-100">
                                     {speciesIndividuals.map(ind => {
                                        const isSelected = formData.individualIds?.includes(ind.id);
                                        const inOtherEnclosure = ind.enclosureId && ind.enclosureId !== editingId;
                                        const otherEncName = inOtherEnclosure ? enclosures.find(e => e.id === ind.enclosureId)?.name : null;

                                        return (
                                           <label key={ind.id} className={`flex items-center gap-4 p-3 transition-colors cursor-pointer hover:bg-white group ${isSelected ? 'bg-blue-50/50' : ''}`}>
                                              <input 
                                                type="checkbox" 
                                                className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4" 
                                                checked={isSelected || false} 
                                                onChange={() => toggleIndividual(ind.id)}
                                              />
                                              <div className="flex-1 overflow-hidden">
                                                 <div className="flex items-center gap-2">
                                                    <span className={`font-bold text-sm ${isSelected ? 'text-blue-900' : 'text-slate-700'}`}>{ind.name}</span>
                                                    <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 rounded">{ind.studbookId}</span>
                                                 </div>
                                                 <div className="flex items-center gap-2 mt-0.5">
                                                    <span className={`text-[10px] font-bold ${ind.sex === Sex.MALE ? 'text-blue-500' : ind.sex === Sex.FEMALE ? 'text-pink-500' : 'text-slate-400'}`}>{ind.sex}</span>
                                                    {inOtherEnclosure && (
                                                       <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">Moving from {otherEncName}</span>
                                                    )}
                                                 </div>
                                              </div>
                                              {isSelected && <CheckCircle className="text-blue-500" size={16}/>}
                                           </label>
                                        );
                                     })}
                                  </div>
                               )}
                            </div>
                         </div>
                         
                         <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl">
                            <h5 className="text-[10px] font-extrabold text-blue-800 uppercase tracking-widest mb-3 flex items-center gap-1"><Info size={12}/> Current Selection Summary</h5>
                            <div className="flex flex-wrap gap-2">
                               {(formData.individualIds || []).length > 0 ? (
                                  (formData.individualIds || []).map(id => {
                                     const ind = allIndividuals.find(i => i.id === id);
                                     return (
                                        <div key={id} className="bg-white border border-blue-200 text-blue-700 px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1.5 pr-1 animate-in zoom-in duration-150">
                                           {ind?.name || 'Unknown'}
                                           <button type="button" onClick={() => toggleIndividual(id)} className="p-0.5 hover:bg-red-50 hover:text-red-500 rounded transition-colors"><X size={10}/></button>
                                        </div>
                                     );
                                  })
                               ) : (
                                  <span className="text-[10px] text-blue-400 italic">No individuals selected for this {label.toLowerCase()}.</span>
                               )}
                            </div>
                         </div>
                      </div>
                   </div>
                </div>
              </div>

              <div className="pt-8 flex justify-end gap-4 border-t border-slate-100">
                 <button type="button" onClick={() => setShowForm(false)} className="px-8 py-3 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition-all">Cancel</button>
                 <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-12 py-3 rounded-xl font-bold shadow-lg shadow-emerald-100 flex items-center justify-center gap-2 transform active:scale-95 transition-all"><Save size={20}/> Save {label}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showMapPicker && (
         <div className="fixed inset-0 z-[3000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in duration-200">
               <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                  <div className="flex items-center gap-3">
                     <div className="p-2 bg-purple-100 text-purple-600 rounded-lg"><MapIcon size={20}/></div>
                     <div>
                        <h3 className="font-bold text-slate-900">Define {label} Boundaries</h3>
                        <p className="text-xs text-slate-500">Click points on the map to create the enclosure perimeter.</p>
                     </div>
                  </div>
                  <button onClick={() => setShowMapPicker(false)} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors"><X size={20}/></button>
               </div>
               <div className="h-[500px] w-full relative" ref={pickerMapRef}>
                  <div className="absolute top-4 left-4 z-[1000] space-y-2">
                     <div className="bg-white p-3 rounded-lg shadow-md border border-slate-200 max-w-[200px]">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Instructions</p>
                        <ul className="text-[10px] text-slate-600 space-y-1.5">
                           <li className="flex items-start gap-1.5"><ChevronRight size={10} className="mt-0.5 flex-shrink-0" /> Click anywhere to add a corner</li>
                           <li className="flex items-start gap-1.5"><ChevronRight size={10} className="mt-0.5 flex-shrink-0" /> Drag markers to adjust</li>
                        </ul>
                     </div>
                  </div>
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] flex gap-2">
                     <button 
                        type="button" 
                        onClick={() => {
                           if (pickerInstance.current) {
                              pickerMarkers.current.forEach(m => pickerInstance.current.removeLayer(m));
                           }
                           pickerMarkers.current = [];
                           if (pickerPolygon.current && pickerInstance.current) {
                              pickerInstance.current.removeLayer(pickerPolygon.current);
                              pickerPolygon.current = null;
                           }
                        }}
                        className="bg-white border border-slate-200 text-red-600 px-4 py-2 rounded-full text-xs font-bold shadow-lg hover:bg-red-50 flex items-center gap-1.5"
                     >
                        <Trash size={14}/> Clear All Points
                     </button>
                  </div>
               </div>
               <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center px-6">
                  <span className="text-xs font-bold text-slate-500">
                     {formData.boundary?.length || 0} Points Defined
                  </span>
                  <div className="flex gap-3">
                     <button onClick={() => setShowMapPicker(false)} className="px-6 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-lg">Cancel</button>
                     <button onClick={() => {
                        const points = pickerMarkers.current.map(m => {
                           const ll = m.getLatLng();
                           return { lat: ll.lat, lng: ll.lng };
                        });
                        setFormData({...formData, boundary: points});
                        setShowMapPicker(false);
                     }} className="bg-purple-600 text-white px-8 py-2 rounded-lg font-bold shadow-md hover:bg-purple-700 transition-all">Confirm Boundary</button>
                  </div>
               </div>
            </div>
         </div>
      )}

      {/* Confirmation Modal for Deletion */}
      {enclosureToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[3000] flex items-center justify-center p-4">
           <div className="bg-white rounded-2xl shadow-2xl max-md w-full overflow-hidden animate-in zoom-in duration-200">
              <div className="p-6 border-b border-red-50 bg-red-50 flex items-center gap-3 text-red-800">
                 <div className="p-2 bg-white rounded-lg shadow-sm">
                    <AlertTriangle size={24} className="text-red-600" />
                 </div>
                 <h3 className="text-xl font-bold">Delete {label}?</h3>
              </div>
              <div className="p-6 space-y-4">
                 <p className="text-slate-600 leading-relaxed">
                    Are you sure you want to delete <span className="font-bold text-slate-900">{enclosureToDelete.name}</span>? 
                    This action will unassign all {enclosureToDelete.individualIds.length} current occupants.
                 </p>
                 <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 text-xs text-amber-800 font-medium">
                    Note: This only deletes the {label.toLowerCase()} definition. All individual animal or plant records will be preserved but marked as unassigned.
                 </div>
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-100 grid grid-cols-2 gap-3">
                 <button onClick={() => setEnclosureToDelete(null)} className="px-4 py-2.5 text-slate-600 hover:bg-slate-200 rounded-xl font-bold transition-all">Cancel</button>
                 <button onClick={confirmDelete} className="px-4 py-2.5 bg-red-600 text-white hover:bg-red-700 rounded-xl font-bold shadow-lg shadow-red-100 transition-all">Delete Forever</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default EnclosureManager;
