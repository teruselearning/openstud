
import React, { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { getSpecies, getIndividuals, saveIndividuals, generatePattern, saveSpecies, getOrg, getEnclosures } from '../services/storage';
import { fetchSpeciesData } from '../services/geminiService';
import { Species, Individual, Sex, AcquisitionSource, SpeciesType, Organization, Enclosure } from '../types';
import { Plus, Camera, Search, Dna, PawPrint, Pencil, X as XIcon, Filter, Trash2, AlertTriangle, MapPin, Users, LayoutGrid, List, ArrowRight, Briefcase, RefreshCw, Sprout, Loader2, FileText, CheckCircle, Fingerprint, User as UserIcon, Upload, FileCode, Crosshair, Map as MapIcon, Maximize2, LocateFixed, Type as TypeIcon, Map as MapIcon2, ChevronDown, Calendar, Weight, Info, Box } from 'lucide-react';
import { LanguageContext } from '../App';

declare const L: any; // Leaflet global

type StatusFilter = 'current' | 'deceased' | 'all';
type SortField = 'name' | 'studbookId' | 'birthDate';
type ViewMode = 'grid' | 'list' | 'map';

interface IndividualManagerProps {
  currentProjectId: string;
}

const ANIMAL_SOURCES: AcquisitionSource[] = ['Bred in house', 'Captive Bred', 'Wild Caught', 'Other'];
const PLANT_SOURCES = ['Propagated in house', 'Seed Collection', 'Cutting/Graft', 'Wild Harvest', 'Exchange', 'Other'];

const IndividualManager: React.FC<IndividualManagerProps> = ({ currentProjectId }) => {
  const { t } = useContext(LanguageContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [allIndividuals, setAllIndividuals] = useState<Individual[]>([]);
  const [allSpecies, setAllSpecies] = useState<Species[]>([]);
  const [allEnclosures, setAllEnclosures] = useState<Enclosure[]>([]);
  const [org, setOrg] = useState<Organization | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  
  // Map References
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const hasInitialFit = useRef<boolean>(false);
  const [selectedMapInd, setSelectedMapInd] = useState<Individual | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [userCoords, setUserCoords] = useState<{lat: number, lng: number} | null>(null);

  // Map Picker State
  const [showMapPicker, setShowMapPicker] = useState(false);
  const mapPickerRef = useRef<HTMLDivElement>(null);
  const mapPickerInstance = useRef<any>(null);
  const pickerMarkerRef = useRef<any>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSpeciesId, setFilterSpeciesId] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('current');
  const [highlightIds, setHighlightIds] = useState<string[]>([]);

  // Sorting
  const [sortBy, setSortBy] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [locatingId, setLocatingId] = useState<string | null>(null);
  
  // Navigation State
  const [returnPath, setReturnPath] = useState<string | null>(null);
  
  // Manual Parent Entry State
  const [isManualSire, setIsManualSire] = useState(false);
  const [isManualDam, setIsManualDam] = useState(false);

  // Searchable Species Dropdown State
  const [speciesSearchQuery, setSpeciesSearchQuery] = useState('');
  const [isSpeciesDropdownOpen, setIsSpeciesDropdownOpen] = useState(false);
  const speciesDropdownRef = useRef<HTMLDivElement>(null);

  // Auto-Add Species State
  const [isAutoSpecies, setIsAutoSpecies] = useState(false);
  const [newSpeciesName, setNewSpeciesName] = useState('');
  const [newSpeciesType, setNewSpeciesType] = useState<SpeciesType>('Animal');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocatingForm, setIsLocatingForm] = useState(false);

  // Form State
  const [formData, setFormData] = useState<Partial<Individual>>({
    speciesId: '',
    enclosureId: '',
    studbookId: '',
    name: '',
    sex: Sex.UNKNOWN,
    birthDate: '',
    weightKg: 0,
    sireId: '',
    damId: '',
    notes: '',
    imageUrl: '',
    dnaSequence: '',
    dnaFileName: '',
    dnaFileType: '',
    isDeceased: false,
    deathDate: '',
    latitude: undefined,
    longitude: undefined,
    source: 'Bred in house',
    sourceDetails: ''
  });

  useEffect(() => {
    setAllIndividuals(getIndividuals());
    setAllSpecies(getSpecies());
    setAllEnclosures(getEnclosures());
    setOrg(getOrg());
  }, []);

  // Watch user position for map view
  useEffect(() => {
    if (viewMode === 'map' && navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        (err) => console.warn("User location watch failed", err),
        { enableHighAccuracy: true }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [viewMode]);

  // Handle click outside for searchable dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (speciesDropdownRef.current && !speciesDropdownRef.current.contains(event.target as Node)) {
        setIsSpeciesDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (location.state?.editId && allIndividuals.length > 0) {
      const ind = allIndividuals.find(i => i.id === location.state.editId);
      if (ind) {
        if (location.state.returnTo) setReturnPath(location.state.returnTo);
        handleEdit(ind);
        navigate(location.pathname, { replace: true, state: {} });
      }
    } else if (location.state?.highlightIds) {
      setHighlightIds(location.state.highlightIds);
      setFilterStatus('all'); 
    }
  }, [location.state, allIndividuals]);

  const projectIndividuals = allIndividuals.filter(ind => ind.projectId === currentProjectId);
  const projectSpecies = allSpecies.filter(s => s.id && s.projectId === currentProjectId);
  const hasMappedIndividuals = projectIndividuals.some(i => i.latitude !== undefined && i.longitude !== undefined);

  // 1. Map View Component Lifecycle & Initial Load
  useEffect(() => {
    if (viewMode === 'map' && mapContainerRef.current && !mapInstanceRef.current) {
      const currentOrg = getOrg();
      const initialLat = (typeof currentOrg.latitude === 'number') ? currentOrg.latitude : 0;
      const initialLng = (typeof currentOrg.longitude === 'number') ? currentOrg.longitude : 0;
      const initialZoom = (typeof currentOrg.latitude === 'number' && typeof currentOrg.longitude === 'number') ? 15 : 2;

      const map = L.map(mapContainerRef.current, { 
        zoomControl: false,
        maxZoom: 22
      }).setView([initialLat, initialLng], initialZoom);
      
      L.control.zoom({ position: 'topright' }).addTo(map);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
        attribution: '© OpenStreetMap contributors',
        maxZoom: 22,
        maxNativeZoom: 19
      }).addTo(map);
      
      const markersLayer = L.layerGroup().addTo(map);
      markersLayerRef.current = markersLayer;
      mapInstanceRef.current = map;

      setTimeout(() => map.invalidateSize(), 200);
    }
    
    // Reset initial fit flag if we switch project
    hasInitialFit.current = false;
  }, [viewMode, currentProjectId]);

  // 2. Separate User Marker Update (Prevents Zoom Resets)
  useEffect(() => {
    if (viewMode === 'map' && mapInstanceRef.current && userCoords) {
      const map = mapInstanceRef.current;
      const userIcon = L.divIcon({
        className: 'user-location-marker',
        html: `<div style="background-color: #3b82f6; width: 18px; height: 18px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.3);"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      });
      if (userMarkerRef.current) {
        userMarkerRef.current.setLatLng([userCoords.lat, userCoords.lng]);
      } else {
        userMarkerRef.current = L.marker([userCoords.lat, userCoords.lng], { icon: userIcon, zIndexOffset: 2000 })
          .addTo(map)
          .bindTooltip("You are here", { direction: 'top', offset: [0, -10] });
      }
    }
  }, [viewMode, userCoords]);

  // 3. Update Markers and Fit Bounds once
  useEffect(() => {
    if (viewMode === 'map' && mapInstanceRef.current && markersLayerRef.current) {
      const map = mapInstanceRef.current;
      const markersLayer = markersLayerRef.current;
      markersLayer.clearLayers();

      const mappedInds = projectIndividuals.filter(i => typeof i.latitude === 'number' && typeof i.longitude === 'number');
      const leafletMarkers: any[] = [];

      mappedInds.forEach(ind => {
        const sp = allSpecies.find(s => s.id === ind.speciesId);
        const iconColor = sp?.type === 'Plant' ? '#16a34a' : '#2563eb';
        const customIcon = L.divIcon({
          className: 'custom-div-icon',
          html: `<div style="background-color: ${iconColor}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        });

        const marker = L.marker([ind.latitude, ind.longitude], { icon: customIcon });
        
        if (showLabels) {
          marker.bindTooltip(sp?.commonName || ind.name, {
            permanent: true,
            direction: 'right',
            className: 'bg-white/90 border-none shadow-sm px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-700 cursor-pointer',
            interactive: true
          });
        }

        const handleSelect = () => {
          setSelectedMapInd(ind);
          map.flyTo([ind.latitude, ind.longitude], 20, { animate: true, duration: 1.5 });
        };

        marker.on('click', handleSelect);
        marker.on('tooltipclick', handleSelect);
        marker.addTo(markersLayer);
        leafletMarkers.push(marker);
      });

      if (leafletMarkers.length > 0 && !hasInitialFit.current) {
        const group = L.featureGroup(leafletMarkers);
        const bounds = group.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds.pad(0.2));
          hasInitialFit.current = true;
        }
      }
    }
  }, [viewMode, projectIndividuals, allSpecies, showLabels]);

  // Picker Map Initialization
  useEffect(() => {
    if (showMapPicker && mapPickerRef.current && !mapPickerInstance.current) {
       const initialLat = formData.latitude || org?.latitude || 0;
       const initialLng = formData.longitude || org?.longitude || 0;
       
       const map = L.map(mapPickerRef.current, {
         maxZoom: 22
       }).setView([initialLat, initialLng], 15);
       L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
         attribution: '© OSM',
         maxZoom: 22,
         maxNativeZoom: 19
       }).addTo(map);
       
       const marker = L.marker([initialLat, initialLng], { draggable: true }).addTo(map);
       pickerMarkerRef.current = marker;
       mapPickerInstance.current = map;

       map.on('click', (e: any) => {
          marker.setLatLng(e.latlng);
       });

       setTimeout(() => map.invalidateSize(), 200);
    }
    
    if (!showMapPicker && mapPickerInstance.current) {
       mapPickerInstance.current.remove();
       mapPickerInstance.current = null;
    }
  }, [showMapPicker]);

  const generateUniqueId = () => {
    const year = new Date().getFullYear();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `SB-${year}-${random}`;
  };

  const handleOpenNewForm = () => {
    setEditingId(null);
    setShowForm(true);
    setShowDeleteConfirm(false);
    setIsAutoSpecies(false);
    setIsManualSire(false);
    setIsManualDam(false);
    setSpeciesSearchQuery('');
    setFormData({
      studbookId: generateUniqueId(),
      speciesId: '',
      enclosureId: '',
      name: '',
      sex: Sex.UNKNOWN,
      weightKg: 0,
      sireId: '',
      damId: '',
      birthDate: new Date().toISOString().split('T')[0],
      source: 'Bred in house',
      notes: '',
      imageUrl: '',
      dnaSequence: '',
      dnaFileName: '',
      dnaFileType: '',
      latitude: undefined,
      longitude: undefined
    });
  };

  const handleEdit = (ind: Individual) => {
    setEditingId(ind.id);
    setIsAutoSpecies(false);
    const sireExists = ind.sireId ? allIndividuals.some(i => i.id === ind.sireId) : false;
    const damExists = ind.damId ? allIndividuals.some(i => i.id === ind.damId) : false;
    setIsManualSire(!!ind.sireId && !sireExists);
    setIsManualDam(!!ind.damId && !damExists);
    setFormData({ ...ind });
    
    // Set the search query to the current species name for clarity
    const currentSp = allSpecies.find(s => s.id === ind.speciesId);
    setSpeciesSearchQuery(currentSp ? currentSp.commonName : '');
    
    setShowForm(true);
    setShowDeleteConfirm(false);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingId(null);
    setShowDeleteConfirm(false);
    setIsManualSire(false);
    setIsManualDam(false);
    setIsAutoSpecies(false);
    setSpeciesSearchQuery('');
    if (returnPath) { navigate(returnPath); setReturnPath(null); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.studbookId) return;
    setIsSubmitting(true);
    
    let finalSpeciesId = formData.speciesId;
    let finalSpeciesType = isAutoSpecies ? newSpeciesType : allSpecies.find(s => s.id === formData.speciesId)?.type;

    if (isAutoSpecies && newSpeciesName) {
       try {
          const aiData = await fetchSpeciesData(newSpeciesName, newSpeciesType);
          const newSpecies: Species = {
             id: `sp-${Date.now()}`, 
             projectId: currentProjectId, 
             commonName: newSpeciesName, 
             scientificName: aiData?.scientificName || newSpeciesName, 
             type: newSpeciesType,
             conservationStatus: aiData?.conservationStatus || 'Unknown', 
             sexualMaturityAgeYears: aiData?.sexualMaturityAgeYears || 0, 
             averageAdultWeightKg: aiData?.averageAdultWeightKg || 0, 
             lifeExpectancyYears: aiData?.lifeExpectancyYears || 0, 
             breedingSeasonStart: aiData?.breedingSeasonStart || 1,
             breedingSeasonEnd: aiData?.breedingSeasonEnd || 12,
             imageUrl: aiData?.imageUrl || generatePattern(newSpeciesName)
          };
          const updatedSpeciesList = [...allSpecies, newSpecies];
          setAllSpecies(updatedSpeciesList);
          saveSpecies(updatedSpeciesList);
          finalSpeciesId = newSpecies.id;
          finalSpeciesType = newSpeciesType;
       } catch (error) {
          alert("Failed to auto-create species."); setIsSubmitting(false); return;
       }
    }

    if (!finalSpeciesId) { alert("Please select or create a species."); setIsSubmitting(false); return; }
    
    const isPlant = finalSpeciesType === 'Plant';
    const nameToSave = (isPlant && !formData.name) ? formData.studbookId : formData.name;
    if (!isPlant && !nameToSave) { alert("Name is required for animals."); setIsSubmitting(false); return; }
    
    const entry: Individual = {
        ...formData as Individual,
        id: editingId || `ind-${Date.now()}`,
        projectId: currentProjectId,
        speciesId: finalSpeciesId!,
        enclosureId: formData.enclosureId,
        name: nameToSave!,
        weightKg: Number(formData.weightKg || 0),
        sireId: isPlant ? undefined : formData.sireId,
        damId: isPlant ? undefined : formData.damId,
        latitude: formData.latitude ? Number(formData.latitude) : undefined,
        longitude: formData.longitude ? Number(formData.longitude) : undefined
    };

    let updatedIndividuals = editingId 
      ? allIndividuals.map(ind => ind.id === editingId ? entry : ind)
      : [...allIndividuals, entry];

    setAllIndividuals(updatedIndividuals);
    saveIndividuals(updatedIndividuals);
    setIsSubmitting(false);
    handleCloseForm();
  };

  const selectedSpeciesObject = allSpecies.find(s => s.id === formData.speciesId);
  const isPlantMode = isAutoSpecies ? newSpeciesType === 'Plant' : selectedSpeciesObject?.type === 'Plant';
  const showSexField = !isPlantMode || (isPlantMode && (isAutoSpecies ? true : selectedSpeciesObject?.plantClassification === 'Dioecious'));

  // Search results for searchable species dropdown
  const speciesSearchResults = projectSpecies.filter(s => 
    s.commonName.toLowerCase().includes(speciesSearchQuery.toLowerCase()) || 
    s.scientificName.toLowerCase().includes(speciesSearchQuery.toLowerCase())
  );

  const enclosureLabel = org?.focus === 'Plants' ? 'Area' : 'Enclosure';

  return (
    <div className="space-y-6">
      {/* ... header ... */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t('individuals')}</h2>
          <p className="text-slate-500">{org?.focus === 'Plants' ? t('indivSubtitlePlant') : t('indivSubtitleAnimal')}</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center bg-white border border-slate-300 rounded-lg p-1 shadow-sm">
            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`} title="Grid View"><LayoutGrid size={18} /></button>
            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`} title="List View"><List size={18} /></button>
            {hasMappedIndividuals && (
              <button onClick={() => setViewMode('map')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'map' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`} title="Map View"><MapIcon size={18} /></button>
            )}
          </div>
          <button onClick={handleOpenNewForm} className="flex-1 md:flex-none flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-all">
            <Plus size={18} />
            <span>{t('add')}</span>
          </button>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[2000] overflow-y-auto bg-black/60 backdrop-blur-sm">
          <div className="flex min-h-full items-start justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl animate-in fade-in zoom-in duration-200 my-8">
             <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
               <h3 className="text-xl font-bold text-slate-900">{editingId ? t('updateIndividual') : t('registerIndividual')}</h3>
               <button onClick={handleCloseForm} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors">
                  <XIcon size={24} />
               </button>
             </div>
             
             <form onSubmit={handleSubmit} className="p-8 space-y-8">
               <div className="space-y-4">
                  <div className="flex items-center gap-2 text-emerald-700 border-b border-emerald-50 pb-2">
                     <Dna size={20}/>
                     <h4 className="font-bold uppercase tracking-wider text-sm">{t('classificationTitle')}</h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <div className="flex justify-between items-end mb-1">
                         <label className="text-sm font-bold text-slate-700">{t('species')}</label>
                         {!editingId && (
                           <button type="button" onClick={() => setIsAutoSpecies(!isAutoSpecies)} className="text-xs text-emerald-600 hover:underline font-bold flex items-center gap-1">
                              {isAutoSpecies ? t('selectFromList') : t('createSpeciesAuto')}
                           </button>
                         )}
                      </div>
                      {isAutoSpecies ? (
                         <div className="flex gap-3 animate-in slide-in-from-top-2">
                            <input className="flex-1 px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" placeholder={t('autoCreateSpeciesHint')} value={newSpeciesName} onChange={(e) => setNewSpeciesName(e.target.value)} required />
                            <select className="w-32 px-2 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900 font-bold" value={newSpeciesType} onChange={(e) => setNewSpeciesType(e.target.value as SpeciesType)}>
                               <option value="Animal">{t('animal')}</option>
                               <option value="Plant">{t('plant')}</option>
                            </select>
                         </div>
                      ) : (
                        <div className="relative" ref={speciesDropdownRef}>
                           <div className="relative">
                              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
                              <input 
                                 type="text"
                                 className="w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                                 placeholder={t('searchSpeciesPlaceholder')}
                                 value={speciesSearchQuery}
                                 onChange={(e) => {
                                    setSpeciesSearchQuery(e.target.value);
                                    setIsSpeciesDropdownOpen(true);
                                 }}
                                 onFocus={() => setIsSpeciesDropdownOpen(true)}
                                 disabled={!!editingId}
                              />
                              <ChevronDown className={`absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 transition-transform ${isSpeciesDropdownOpen ? 'rotate-180' : ''}`} size={16} />
                           </div>
                           
                           {isSpeciesDropdownOpen && !editingId && (
                              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-[110] max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-1">
                                 {speciesSearchResults.length > 0 ? (
                                    speciesSearchResults.map(s => (
                                       <button
                                          key={s.id}
                                          type="button"
                                          className={`w-full text-left px-4 py-3 hover:bg-emerald-50 flex flex-col transition-colors border-b border-slate-50 last:border-0 ${formData.speciesId === s.id ? 'bg-emerald-50' : ''}`}
                                          onClick={() => {
                                             setFormData({...formData, speciesId: s.id});
                                             setSpeciesSearchQuery(s.commonName);
                                             setIsSpeciesDropdownOpen(false);
                                          }}
                                       >
                                          <span className="font-bold text-slate-900">{s.commonName}</span>
                                          <span className="text-xs text-slate-500 italic">{s.scientificName}</span>
                                       </button>
                                    ))
                                 ) : (
                                    <div className="p-4 text-center text-slate-500 flex flex-col items-center gap-2">
                                       <p className="text-sm">No matching species found in this project.</p>
                                       <button type="button" onClick={() => setIsAutoSpecies(true)} className="text-xs font-bold text-emerald-600 hover:underline">Click here to create it automatically</button>
                                    </div>
                                 )}
                              </div>
                           )}
                        </div>
                      )}
                    </div>

                    {org?.enableEnclosures && (
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">{enclosureLabel}</label>
                        <select className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" value={formData.enclosureId} onChange={e => setFormData({...formData, enclosureId: e.target.value})}>
                          <option value="">No {enclosureLabel}</option>
                          {allEnclosures.map(enc => <option key={enc.id} value={enc.id}>{enc.name}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
               </div>

               <div className="space-y-4">
                  <div className="flex items-center gap-2 text-blue-700 border-b border-blue-50 pb-2">
                     <Briefcase size={20}/>
                     <h4 className="font-bold uppercase tracking-wider text-sm">{t('identityStatusTitle')}</h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                       <label className="text-sm font-bold text-slate-700">{isPlantMode ? t('plantId') : t('studbookId')}</label>
                       <input className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900 font-mono" value={formData.studbookId} onChange={e => setFormData({...formData, studbookId: e.target.value})} placeholder="e.g. SB-2024-A1" required />
                    </div>
                    <div className="space-y-2">
                       <label className="text-sm font-bold text-slate-700">{t('name')} {isPlantMode && <span className="text-xs text-slate-400 font-normal">(Optional for plants)</span>}</label>
                       <input className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder={isPlantMode ? "e.g. Greenhouse Plot 4" : "e.g. Luna"} required={!isPlantMode} />
                    </div>
                    {showSexField && (
                      <div className="space-y-2">
                         <label className="text-sm font-bold text-slate-700">{t('sex')}</label>
                         <select className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" value={formData.sex} onChange={e => setFormData({...formData, sex: e.target.value as Sex})}>
                           {Object.values(Sex).map(s => <option key={s} value={s}>{s}</option>)}
                         </select>
                      </div>
                    )}
                    <div className="space-y-2">
                       <label className="text-sm font-bold text-slate-700">{isPlantMode ? t('datePlanted') : t('dateOfBirth')}</label>
                       <input type="date" className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" value={formData.birthDate} onChange={e => setFormData({...formData, birthDate: e.target.value})} />
                    </div>
                  </div>
               </div>

               {/* ... remaining form fields ... */}
               <div className="flex flex-col sm:flex-row justify-between pt-8 border-t border-slate-100 gap-4">
                 {editingId ? (
                    <button type="button" onClick={() => setShowDeleteConfirm(true)} className="w-full sm:w-auto text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors">
                       <Trash2 size={18} /> {t('delete')}
                    </button>
                 ) : <div/>}
                 <div className="flex flex-col sm:flex-row gap-3 w-full sm:auto">
                    <button type="button" onClick={handleCloseForm} className="w-full sm:w-auto px-6 py-2.5 text-slate-600 hover:bg-slate-100 rounded-lg font-bold order-2 sm:order-1">{t('cancel')}</button>
                    <button type="submit" disabled={isSubmitting} className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-10 py-2.5 rounded-lg font-bold transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2 disabled:opacity-50 order-1 sm:order-2">
                       {isSubmitting && <Loader2 size={18} className="animate-spin"/>}
                       {editingId ? t('updateIndividual') : t('registerIndividual')}
                    </button>
                 </div>
               </div>
             </form>
            </div>
          </div>
        </div>
      )}
      
      {/* ... rest of component ... */}
    </div>
  );
};

export default IndividualManager;
