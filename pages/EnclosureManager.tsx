
import React, { useState, useEffect, useContext, useRef } from 'react';
import { getEnclosures, saveEnclosures, getSpecies, getIndividuals, getOrg, getCurrentProjectId } from '../services/storage';
import { Enclosure, Species, Individual, Organization } from '../types';
import { Plus, Search, MapPin, Box, Trash2, Pencil, X, Map as MapIcon, List, Eye, Info, LayoutGrid, Loader2, Save, ChevronRight, Dna, Activity, LocateFixed } from 'lucide-react';
import { LanguageContext } from '../App';

declare const L: any;

const EnclosureManager: React.FC = () => {
  const { t } = useContext(LanguageContext);
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
  
  const [formData, setFormData] = useState<Partial<Enclosure>>({
    name: '',
    description: '',
    latitude: undefined,
    longitude: undefined,
    speciesIds: []
  });

  const [showMapPicker, setShowMapPicker] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const pickerMapRef = useRef<HTMLDivElement>(null);
  const pickerInstance = useRef<any>(null);
  const pickerMarker = useRef<any>(null);

  useEffect(() => {
    setEnclosures(getEnclosures());
    setAllSpecies(getSpecies());
    setAllIndividuals(getIndividuals());
  }, []);

  // Main Map View Effect
  useEffect(() => {
    if (viewMode === 'map' && mapContainerRef.current && !mapInstanceRef.current) {
      const initialLat = org.latitude || 0;
      const initialLng = org.longitude || 0;
      
      const map = L.map(mapContainerRef.current, { maxZoom: 22 }).setView([initialLat, initialLng], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 22 }).addTo(map);
      
      const layer = L.layerGroup().addTo(map);
      markersLayerRef.current = layer;
      mapInstanceRef.current = map;
      
      setTimeout(() => map.invalidateSize(), 200);
    }
  }, [viewMode]);

  useEffect(() => {
    if (viewMode === 'map' && mapInstanceRef.current && markersLayerRef.current) {
      const layer = markersLayerRef.current;
      layer.clearLayers();
      
      enclosures.forEach(enc => {
        if (enc.latitude && enc.longitude) {
          const icon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="background-color: #9333ea; width: 18px; height: 18px; border-radius: 4px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9]
          });
          
          const marker = L.marker([enc.latitude, enc.longitude], { icon }).addTo(layer);
          marker.bindPopup(`<b>${enc.name}</b><br>${enc.description || ''}`);
        }
      });
    }
  }, [viewMode, enclosures]);

  // Picker Map Effect
  useEffect(() => {
    if (showMapPicker && pickerMapRef.current && !pickerInstance.current) {
       const initialLat = formData.latitude || org.latitude || 0;
       const initialLng = formData.longitude || org.longitude || 0;
       const map = L.map(pickerMapRef.current).setView([initialLat, initialLng], 16);
       L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
       const marker = L.marker([initialLat, initialLng], { draggable: true }).addTo(map);
       pickerMarker.current = marker;
       pickerInstance.current = map;
       map.on('click', (e: any) => marker.setLatLng(e.latlng));
       setTimeout(() => map.invalidateSize(), 200);
    }
    return () => {
       if (!showMapPicker && pickerInstance.current) {
          pickerInstance.current.remove();
          pickerInstance.current = null;
       }
    };
  }, [showMapPicker]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const newEnc: Enclosure = {
      ...formData as Enclosure,
      id: editingId || `enc-${Date.now()}`,
      orgId: org.id,
      speciesIds: formData.speciesIds || []
    };
    
    const updated = editingId 
      ? enclosures.map(e => e.id === editingId ? newEnc : e)
      : [...enclosures, newEnc];
      
    setEnclosures(updated);
    saveEnclosures(updated);
    setShowForm(false);
    setEditingId(null);
    setFormData({ name: '', description: '', speciesIds: [], latitude: undefined, longitude: undefined });
  };

  const handleEdit = (enc: Enclosure) => {
    setEditingId(enc.id);
    setFormData(enc);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    if (confirm(`Are you sure you want to delete this ${label.toLowerCase()}?`)) {
      const updated = enclosures.filter(e => e.id !== id);
      setEnclosures(updated);
      saveEnclosures(updated);
    }
  };

  const toggleSpecies = (sid: string) => {
    const current = formData.speciesIds || [];
    if (current.includes(sid)) setFormData({ ...formData, speciesIds: current.filter(id => id !== sid) });
    else setFormData({ ...formData, speciesIds: [...current, sid] });
  };

  const filteredEnclosures = enclosures.filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{labelsPlural}</h2>
          <p className="text-slate-500">Manage physical {labelsPlural.toLowerCase()} and assign species to them.</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex bg-white border border-slate-300 rounded-lg p-1 shadow-sm">
            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}><List size={18} /></button>
            <button onClick={() => setViewMode('map')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'map' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}><MapIcon size={18} /></button>
          </div>
          <button onClick={() => setShowForm(true)} className="flex-1 md:flex-none flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-all">
            <Plus size={18} />
            <span>Add {label}</span>
          </button>
        </div>
      </div>

      {viewMode === 'list' && (
        <div className="space-y-4">
           <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3">
             <Search className="text-slate-400 ml-2" size={20} />
             <input className="flex-1 outline-none text-slate-900 placeholder:text-slate-400 bg-white" placeholder={`Search ${labelsPlural.toLowerCase()}...`} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEnclosures.map(enc => (
              <div key={enc.id} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col">
                <div className="p-5 flex-1">
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center flex-shrink-0">
                      <Box size={24} />
                    </div>
                    <div className="flex gap-2">
                       <button onClick={() => handleEdit(enc)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Pencil size={16} /></button>
                       <button onClick={() => handleDelete(enc.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1">{enc.name}</h3>
                  <p className="text-sm text-slate-500 mb-4 line-clamp-2">{enc.description || 'No description provided.'}</p>
                  
                  <div className="space-y-3 pt-4 border-t border-slate-50">
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span className="text-slate-400 uppercase tracking-wider">Associated Species</span>
                      <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{enc.speciesIds.length}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {enc.speciesIds.slice(0, 3).map(sid => {
                        const sp = allSpecies.find(s => s.id === sid);
                        return <span key={sid} className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-100">{sp?.commonName || 'Unknown'}</span>;
                      })}
                      {enc.speciesIds.length > 3 && <span className="text-[10px] text-slate-400 font-bold flex items-center pl-1">+{enc.speciesIds.length - 3} more</span>}
                      {enc.speciesIds.length === 0 && <span className="text-[10px] text-slate-300 italic">No species assigned</span>}
                    </div>
                  </div>
                </div>
                {enc.latitude && enc.longitude && (
                   <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                     <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                       <MapPin size={12} className="text-purple-500"/> Mapped
                     </div>
                     <span className="text-[10px] font-mono text-slate-400">{enc.latitude.toFixed(3)}, {enc.longitude.toFixed(3)}</span>
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
        <div className="h-[calc(100vh-250px)] relative bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div ref={mapContainerRef} className="w-full h-full z-0" />
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-[2000] overflow-y-auto bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl animate-in zoom-in duration-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
               <h3 className="text-xl font-bold text-slate-900">{editingId ? `Edit ${label}` : `Add New ${label}`}</h3>
               <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors"><X size={24} /></button>
            </div>
            <form onSubmit={handleSave} className="p-8 space-y-6">
              <div className="space-y-4">
                 <div>
                   <label className="text-sm font-bold text-slate-700 block mb-1">{label} Name</label>
                   <input className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900 font-bold" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder={`e.g. ${isPlantOrg ? 'South Greenhouse' : 'Lion Habitat'}`} required />
                 </div>
                 <div>
                   <label className="text-sm font-bold text-slate-700 block mb-1">Description</label>
                   <textarea className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" rows={3} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Location, climate, or special notes..." />
                 </div>
                 
                 <div className="pt-4 border-t border-slate-100">
                    <div className="flex justify-between items-center mb-3">
                       <label className="text-sm font-bold text-slate-700 flex items-center gap-2"><MapPin size={16} className="text-purple-600"/> Plot Location</label>
                       <button type="button" onClick={() => setShowMapPicker(true)} className="text-xs font-bold text-emerald-600 hover:underline">Open Map Picker</button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                       <div><label className="text-[10px] font-bold text-slate-400 uppercase">Latitude</label><input type="number" step="any" className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-slate-50" value={formData.latitude || ''} readOnly /></div>
                       <div><label className="text-[10px] font-bold text-slate-400 uppercase">Longitude</label><input type="number" step="any" className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-slate-50" value={formData.longitude || ''} readOnly /></div>
                    </div>
                 </div>

                 <div className="pt-4 border-t border-slate-100">
                    <label className="text-sm font-bold text-slate-700 block mb-2">Species in this {label}</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                      {allSpecies.filter(s => s.projectId === currentProjectId).map(sp => (
                        <label key={sp.id} className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-all ${formData.speciesIds?.includes(sp.id) ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200 hover:border-emerald-100'}`}>
                          <input type="checkbox" className="rounded text-emerald-600 focus:ring-emerald-500" checked={formData.speciesIds?.includes(sp.id)} onChange={() => toggleSpecies(sp.id)} />
                          <div className="overflow-hidden">
                             <p className="text-xs font-bold text-slate-900 truncate">{sp.commonName}</p>
                             <p className="text-[9px] text-slate-500 italic truncate">{sp.scientificName}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                 </div>
              </div>
              <div className="pt-6 flex justify-end gap-3 border-t border-slate-100">
                 <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-bold">Cancel</button>
                 <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-2 rounded-lg font-bold shadow-lg shadow-emerald-100 flex items-center justify-center gap-2"><Save size={18}/> Save {label}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showMapPicker && (
         <div className="fixed inset-0 z-[3000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
               <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2"><MapPin size={18} className="text-emerald-600"/> Plot {label} Location</h3>
                  <button onClick={() => setShowMapPicker(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
               </div>
               <div className="h-[400px] w-full" ref={pickerMapRef} />
               <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                  <button onClick={() => setShowMapPicker(false)} className="px-4 py-2 text-slate-600 font-bold">Cancel</button>
                  <button onClick={() => {
                     const { lat, lng } = pickerMarker.current.getLatLng();
                     setFormData({...formData, latitude: lat, longitude: lng});
                     setShowMapPicker(false);
                  }} className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-bold shadow-md">Confirm Location</button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default EnclosureManager;
