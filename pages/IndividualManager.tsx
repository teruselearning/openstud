import React, { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { getSpecies, getIndividuals, saveIndividuals, generatePattern, saveSpecies, getOrg } from '../services/storage';
import { fetchSpeciesData } from '../services/geminiService';
import { Species, Individual, Sex, AcquisitionSource, SpeciesType, Organization } from '../types';
import { Plus, Camera, Search, Dna, PawPrint, Pencil, X, Filter, Trash2, AlertTriangle, MapPin, Users, LayoutGrid, List, ArrowRight, Briefcase, RefreshCw, Sprout, Loader2, FileText, CheckCircle, Fingerprint, User as UserIcon, Upload, FileCode, Crosshair, Map as MapIcon, Maximize2, LocateFixed, Type as TypeIcon, Map as MapIcon2 } from 'lucide-react';
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
  const [org, setOrg] = useState<Organization | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  
  // Map References
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const [selectedMapInd, setSelectedMapInd] = useState<Individual | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [showLabels, setShowLabels] = useState(true);

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

  // Auto-Add Species State
  const [isAutoSpecies, setIsAutoSpecies] = useState(false);
  const [newSpeciesName, setNewSpeciesName] = useState('');
  const [newSpeciesType, setNewSpeciesType] = useState<SpeciesType>('Animal');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocatingForm, setIsLocatingForm] = useState(false);

  // Form State
  const [formData, setFormData] = useState<Partial<Individual>>({
    speciesId: '',
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
    setOrg(getOrg());
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

  // Map Initialization logic
  useEffect(() => {
    if (viewMode === 'map' && mapContainerRef.current && !mapInstanceRef.current) {
      const currentOrg = getOrg();
      const initialLat = (typeof currentOrg.latitude === 'number') ? currentOrg.latitude : 0;
      const initialLng = (typeof currentOrg.longitude === 'number') ? currentOrg.longitude : 0;
      const initialZoom = (typeof currentOrg.latitude === 'number' && typeof currentOrg.longitude === 'number') ? 15 : 2;

      const map = L.map(mapContainerRef.current, { zoomControl: false }).setView([initialLat, initialLng], initialZoom);
      L.control.zoom({ position: 'topright' }).addTo(map);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(map);
      
      const markersLayer = L.layerGroup().addTo(map);
      markersLayerRef.current = markersLayer;
      mapInstanceRef.current = map;

      setTimeout(() => map.invalidateSize(), 200);
    }

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
        
        // Add permanent label if enabled
        if (showLabels) {
          marker.bindTooltip(sp?.commonName || ind.name, {
            permanent: true,
            direction: 'right',
            className: 'bg-white/90 border-none shadow-sm px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-700'
          });
        }

        marker.on('click', () => {
          setSelectedMapInd(ind);
          map.flyTo([ind.latitude, ind.longitude], 18, { animate: true, duration: 1.5 });
        });
        marker.addTo(markersLayer);
        leafletMarkers.push(marker);
      });

      if (leafletMarkers.length > 0) {
        const group = L.featureGroup(leafletMarkers);
        const bounds = group.getBounds();
        if (bounds.isValid()) map.fitBounds(bounds.pad(0.2));
      }
    }
  }, [viewMode, currentProjectId, projectIndividuals, allSpecies, showLabels]);

  // Picker Map Initialization
  useEffect(() => {
    if (showMapPicker && mapPickerRef.current && !mapPickerInstance.current) {
       const initialLat = formData.latitude || org?.latitude || 0;
       const initialLng = formData.longitude || org?.longitude || 0;
       
       const map = L.map(mapPickerRef.current).setView([initialLat, initialLng], 15);
       L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(map);
       
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
    setFormData({
      studbookId: generateUniqueId(),
      speciesId: '',
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

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setFormData(prev => ({ ...prev, imageUrl: reader.result as string }));
      reader.readAsDataURL(file);
    }
  };

  const handleDnaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    const extension = file.name.split('.').pop()?.toUpperCase() || 'DNA';
    
    const textFormats = ['FASTA', 'FA', 'FASTQ', 'FQ', 'VCF', 'GB', 'GBK', 'SAM', 'TXT'];
    const isText = textFormats.includes(extension);

    reader.onload = (event) => {
      const content = event.target?.result as string;
      setFormData(prev => ({
        ...prev,
        dnaSequence: content,
        dnaFileName: file.name,
        dnaFileType: extension
      }));
    };

    if (isText) reader.readAsText(file);
    else reader.readAsDataURL(file);
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    setIsLocatingForm(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFormData(prev => ({
          ...prev,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        }));
        setIsLocatingForm(false);
      },
      (error) => {
        alert("Failed to get location: " + error.message);
        setIsLocatingForm(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleQuickSetLocation = (ind: Individual) => {
    if (!navigator.geolocation) return;
    setLocatingId(ind.id);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const updated = allIndividuals.map(i => i.id === ind.id ? { 
          ...i, 
          latitude: position.coords.latitude, 
          longitude: position.coords.longitude 
        } : i);
        setAllIndividuals(updated);
        saveIndividuals(updated);
        setLocatingId(null);
      },
      (err) => {
        alert("Location acquisition failed.");
        setLocatingId(null);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleConfirmPicker = () => {
     if (pickerMarkerRef.current) {
        const { lat, lng } = pickerMarkerRef.current.getLatLng();
        setFormData(prev => ({ ...prev, latitude: lat, longitude: lng }));
     }
     setShowMapPicker(false);
  };

  const handleLocateMeMap = () => {
    if (!mapInstanceRef.current || !navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition((pos) => {
      const map = mapInstanceRef.current;
      map.flyTo([pos.coords.latitude, pos.coords.longitude], 16, { animate: true, duration: 1.5 });
      L.popup().setLatLng([pos.coords.latitude, pos.coords.longitude]).setContent("📍 You are here").openOn(map);
      setIsLocating(false);
    }, (err) => {
      alert("Could not retrieve location.");
      setIsLocating(false);
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
    if (returnPath) { navigate(returnPath); setReturnPath(null); }
  };

  const handleDelete = () => {
    if (!editingId) return;
    const updatedIndividuals = allIndividuals.filter(ind => ind.id !== editingId);
    setAllIndividuals(updatedIndividuals);
    saveIndividuals(updatedIndividuals);
    handleCloseForm();
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

  const filteredIndividuals = projectIndividuals.filter(ind => {
    if (highlightIds.length > 0) return highlightIds.includes(ind.id);
    const matchesSearch = ind.name.toLowerCase().includes(searchTerm.toLowerCase()) || ind.studbookId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSpecies = filterSpeciesId ? ind.speciesId === filterSpeciesId : true;
    let matchesStatus = true;
    if (filterStatus === 'current') matchesStatus = !ind.isDeceased;
    else if (filterStatus === 'deceased') matchesStatus = !!ind.isDeceased;
    return matchesSearch && matchesSpecies && matchesStatus;
  });

  const sortedIndividuals = [...filteredIndividuals].sort((a, b) => {
    let valA: any = a[sortBy]; let valB: any = b[sortBy];
    if (typeof valA === 'string') { valA = valA.toLowerCase(); valB = valB.toLowerCase(); }
    if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
    if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const selectedSpecies = allSpecies.find(s => s.id === formData.speciesId);
  const isPlant = isAutoSpecies ? newSpeciesType === 'Plant' : selectedSpecies?.type === 'Plant';
  const showSexField = !isPlant || (isPlant && (isAutoSpecies ? true : selectedSpecies?.plantClassification === 'Dioecious'));

  const eligibleSires = allIndividuals.filter(i => i.speciesId === formData.speciesId && i.sex === Sex.MALE && i.id !== editingId);
  const eligibleDams = allIndividuals.filter(i => i.speciesId === formData.speciesId && i.sex === Sex.FEMALE && i.id !== editingId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Individual Records</h2>
          <p className="text-slate-500">Track {org?.focus === 'Plants' ? 'botanical collection' : 'animal populations'} and lineage.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white border border-slate-300 rounded-lg p-1 shadow-sm">
            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`} title="Grid View"><LayoutGrid size={18} /></button>
            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`} title="List View"><List size={18} /></button>
            {hasMappedIndividuals && (
              <button onClick={() => setViewMode('map')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'map' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`} title="Map View"><MapIcon size={18} /></button>
            )}
          </div>
          <button onClick={handleOpenNewForm} className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-all">
            <Plus size={18} />
            <span>{t('add')}</span>
          </button>
        </div>
      </div>

      {viewMode !== 'map' && (
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3">
             <Search className="text-slate-400 ml-2" size={20} />
             <input className="flex-1 outline-none text-slate-900 placeholder:text-slate-400 bg-white" placeholder={t('searchIndividuals')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex gap-4">
            <select className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500" value={filterSpeciesId} onChange={(e) => setFilterSpeciesId(e.target.value)}>
              <option value="">All Species</option>
              {projectSpecies.map(s => <option key={s.id} value={s.id}>{s.commonName}</option>)}
            </select>
            <select className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as StatusFilter)}>
              <option value="current">Current</option>
              <option value="deceased">Deceased/Removed</option>
              <option value="all">All</option>
            </select>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/60 backdrop-blur-sm">
          <div className="flex min-h-full items-start justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl animate-in fade-in zoom-in duration-200 my-8">
             <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
               <h3 className="text-xl font-bold text-slate-900">{editingId ? t('updateIndividual') : t('registerIndividual')}</h3>
               <button onClick={handleCloseForm} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors"><X size={24} /></button>
             </div>
             
             <form onSubmit={handleSubmit} className="p-8 space-y-8">
               <div className="space-y-4">
                  <div className="flex items-center gap-2 text-emerald-700 border-b border-emerald-50 pb-2">
                     <Dna size={20}/>
                     <h4 className="font-bold uppercase tracking-wider text-sm">Classification</h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="col-span-1 md:col-span-2 space-y-2">
                      <div className="flex justify-between items-end mb-1">
                         <label className="text-sm font-bold text-slate-700">{t('species')}</label>
                         {!editingId && (
                           <button type="button" onClick={() => setIsAutoSpecies(!isAutoSpecies)} className="text-xs text-emerald-600 hover:underline font-bold flex items-center gap-1">
                              {isAutoSpecies ? "Select from list" : "+ Create species automatically"}
                           </button>
                         )}
                      </div>
                      {isAutoSpecies ? (
                         <div className="flex gap-3">
                            <input className="flex-1 px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" placeholder="Enter common name (e.g. Red Oak)" value={newSpeciesName} onChange={(e) => setNewSpeciesName(e.target.value)} required />
                            <select className="w-32 px-2 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900 font-bold" value={newSpeciesType} onChange={(e) => setNewSpeciesType(e.target.value as SpeciesType)}>
                               <option value="Animal">{t('animal')}</option>
                               <option value="Plant">{t('plant')}</option>
                            </select>
                         </div>
                      ) : (
                        <select className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" value={formData.speciesId} onChange={e => setFormData({...formData, speciesId: e.target.value})} required disabled={!!editingId}>
                          <option value="">Select Species...</option>
                          {projectSpecies.map(s => <option key={s.id} value={s.id}>{s.commonName} ({s.scientificName})</option>)}
                        </select>
                      )}
                    </div>
                  </div>
               </div>

               <div className="space-y-4">
                  <div className="flex items-center gap-2 text-blue-700 border-b border-blue-50 pb-2">
                     <Briefcase size={20}/>
                     <h4 className="font-bold uppercase tracking-wider text-sm">Identity & Status</h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                       <label className="text-sm font-bold text-slate-700">{isPlant ? t('plantId') : t('studbookId')}</label>
                       <input className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900 font-mono" value={formData.studbookId} onChange={e => setFormData({...formData, studbookId: e.target.value})} placeholder="e.g. SB-2024-A1" required />
                    </div>
                    <div className="space-y-2">
                       <label className="text-sm font-bold text-slate-700">{t('name')} {isPlant && <span className="text-xs text-slate-400 font-normal">(Optional for plants)</span>}</label>
                       <input className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder={isPlant ? "e.g. Greenhouse Plot 4" : "e.g. Luna"} required={!isPlant} />
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
                       <label className="text-sm font-bold text-slate-700">{isPlant ? t('datePlanted') : t('dateOfBirth')}</label>
                       <input type="date" className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" value={formData.birthDate} onChange={e => setFormData({...formData, birthDate: e.target.value})} />
                    </div>
                    {!isPlant && (
                      <div className="space-y-2">
                         <label className="text-sm font-bold text-slate-700">{t('weight')} (kg)</label>
                         <input type="number" step="0.01" className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" value={formData.weightKg} onChange={e => setFormData({...formData, weightKg: Number(e.target.value)})} />
                      </div>
                    )}
                    <div className="space-y-2">
                       <label className="text-sm font-bold text-slate-700">{t('acquisitionSource')}</label>
                       <select className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" value={formData.source} onChange={e => setFormData({...formData, source: e.target.value as AcquisitionSource})}>
                         {(isPlant ? PLANT_SOURCES : ANIMAL_SOURCES).map(src => <option key={src} value={src}>{src}</option>)}
                       </select>
                    </div>
                  </div>
               </div>

               <div className="space-y-4">
                  <div className="flex items-center gap-2 text-green-700 border-b border-green-50 pb-2">
                     <MapPin size={20}/>
                     <h4 className="font-bold uppercase tracking-wider text-sm">Geo-Location</h4>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                     <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                        <p className="text-xs text-slate-500 max-w-md">Assign specific coordinates for tracking the individual in the project's Plant Map.</p>
                        <div className="flex gap-2">
                          <button 
                             type="button" 
                             onClick={handleGetCurrentLocation}
                             disabled={isLocatingForm}
                             className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
                          >
                             {isLocatingForm ? <Loader2 size={14} className="animate-spin" /> : <Crosshair size={14} />}
                             Use GPS
                          </button>
                          <button 
                             type="button" 
                             onClick={() => setShowMapPicker(true)}
                             className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-2 whitespace-nowrap"
                          >
                             <MapIcon2 size={14} />
                             Pick on Map
                          </button>
                        </div>
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                           <label className="text-[10px] font-bold text-slate-400 uppercase">Latitude</label>
                           <input 
                              type="number" 
                              step="any" 
                              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white text-sm outline-none focus:ring-2 focus:ring-emerald-500" 
                              value={formData.latitude || ''} 
                              onChange={e => setFormData({...formData, latitude: e.target.value === '' ? undefined : parseFloat(e.target.value)})} 
                              placeholder="e.g. 45.5152"
                           />
                        </div>
                        <div className="space-y-1">
                           <label className="text-[10px] font-bold text-slate-400 uppercase">Longitude</label>
                           <input 
                              type="number" 
                              step="any" 
                              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white text-sm outline-none focus:ring-2 focus:ring-emerald-500" 
                              value={formData.longitude || ''} 
                              onChange={e => setFormData({...formData, longitude: e.target.value === '' ? undefined : parseFloat(e.target.value)})} 
                              placeholder="e.g. -122.6784"
                           />
                        </div>
                     </div>
                  </div>
               </div>

               {!isPlant && (
                 <div className="space-y-4">
                    <div className="flex items-center gap-2 text-purple-700 border-b border-purple-50 pb-2">
                       <Users size={20}/>
                       <h4 className="font-bold uppercase tracking-wider text-sm">Parentage / Lineage</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       <div className="space-y-2">
                          <div className="flex justify-between items-center mb-1">
                             <label className="text-sm font-bold text-slate-700">{t('sire')}</label>
                             <button type="button" onClick={() => setIsManualSire(!isManualSire)} className="text-[10px] text-purple-600 hover:underline font-bold">
                                {isManualSire ? "Select from collection" : "Manual Entry (External ID)"}
                             </button>
                          </div>
                          {isManualSire ? (
                             <input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900" placeholder="Enter Sire ID" value={formData.sireId} onChange={e => setFormData({...formData, sireId: e.target.value})} />
                          ) : (
                             <select className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900" value={formData.sireId} onChange={e => setFormData({...formData, sireId: e.target.value})}>
                                <option value="">Unknown / None</option>
                                {eligibleSires.map(s => <option key={s.id} value={s.id}>{s.name} ({s.studbookId})</option>)}
                             </select>
                          )}
                       </div>
                       <div className="space-y-2">
                          <div className="flex justify-between items-center mb-1">
                             <label className="text-sm font-bold text-slate-700">{t('dam')}</label>
                             <button type="button" onClick={() => setIsManualDam(!isManualDam)} className="text-[10px] text-purple-600 hover:underline font-bold">
                                {isManualDam ? "Select from collection" : "Manual Entry (External ID)"}
                             </button>
                          </div>
                          {isManualDam ? (
                             <input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900" placeholder="Enter Dam ID" value={formData.damId} onChange={e => setFormData({...formData, damId: e.target.value})} />
                          ) : (
                             <select className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900" value={formData.damId} onChange={e => setFormData({...formData, damId: e.target.value})}>
                                <option value="">Unknown / None</option>
                                {eligibleDams.map(s => <option key={s.id} value={s.id}>{s.name} ({s.studbookId})</option>)}
                             </select>
                          )}
                       </div>
                    </div>
                 </div>
               )}

               <div className="space-y-4">
                  <div className="flex items-center gap-2 text-indigo-700 border-b border-indigo-50 pb-2">
                     <Fingerprint size={20}/>
                     <h4 className="font-bold uppercase tracking-wider text-sm">Genetic Data</h4>
                  </div>
                  <div className="space-y-4">
                     <label className="text-sm font-bold text-slate-700 block">DNA Data File (FASTA, FASTQ, VCF, BAM, GBK, etc.)</label>
                     <div className="flex flex-col gap-4">
                        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-indigo-200 rounded-xl bg-indigo-50/30 cursor-pointer hover:bg-indigo-50 transition-all group">
                           <div className="flex flex-col items-center justify-center pt-5 pb-6">
                              <Upload className="w-8 h-8 mb-3 text-indigo-400 group-hover:scale-110 transition-transform" />
                              <p className="mb-1 text-sm text-indigo-600 font-bold">Click to upload DNA sequence</p>
                              <p className="text-xs text-indigo-400">FASTA, FASTQ, VCF, BAM, GBK, SAM, TXT</p>
                           </div>
                           <input type="file" className="hidden" accept=".fasta,.fa,.fastq,.fq,.vcf,.bam,.sam,.gb,.gbk,.txt" onChange={handleDnaUpload} />
                        </label>

                        {formData.dnaFileName && (
                           <div className="bg-white border border-indigo-100 rounded-lg p-3 flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-2">
                              <div className="flex items-center gap-3">
                                 <div className="p-2 bg-indigo-100 text-indigo-600 rounded">
                                    <FileCode size={20} />
                                 </div>
                                 <div>
                                    <p className="text-sm font-bold text-slate-900">{formData.dnaFileName}</p>
                                    <p className="text-[10px] text-indigo-500 font-mono uppercase">{formData.dnaFileType} File Loaded</p>
                                 </div>
                              </div>
                              <button type="button" onClick={() => setFormData(prev => ({...prev, dnaSequence: '', dnaFileName: '', dnaFileType: ''}))} className="text-slate-400 hover:text-red-500 p-1">
                                 <X size={16} />
                              </button>
                           </div>
                        )}
                     </div>
                     <p className="text-[10px] text-slate-400 italic">Upload raw genetic data for analysis and long-term storage.</p>
                  </div>
               </div>

               <div className="space-y-4">
                  <div className="flex items-center gap-2 text-slate-700 border-b border-slate-50 pb-2">
                     <FileText size={20}/>
                     <h4 className="font-bold uppercase tracking-wider text-sm">Notes & Media</h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2 md:col-span-2">
                       <label className="text-sm font-bold text-slate-700">{t('notes')}</label>
                       <textarea className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" rows={3} value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                       <label className="text-sm font-bold text-slate-700">Photo</label>
                       <div className="flex items-center space-x-3">
                         <label className="cursor-pointer bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 shadow-sm">
                           <Camera size={18} />
                           <span>{formData.imageUrl ? 'Change Photo' : 'Upload Photo'}</span>
                           <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                         </label>
                         {formData.imageUrl && <span className="text-xs text-emerald-600 font-bold flex items-center gap-1"><CheckCircle size={14}/> Image Ready</span>}
                       </div>
                    </div>
                  </div>
               </div>

               <div className="flex justify-between pt-8 border-t border-slate-100">
                 {editingId ? (
                    <button type="button" onClick={() => setShowDeleteConfirm(true)} className="text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors">
                       <Trash2 size={18} /> {t('delete')}
                    </button>
                 ) : <div/>}
                 <div className="flex space-x-3">
                    <button type="button" onClick={handleCloseForm} className="px-6 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-bold">{t('cancel')}</button>
                    <button type="submit" disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white px-10 py-2 rounded-lg font-bold transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2 disabled:opacity-50">
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

      {/* Map Picker Modal */}
      {showMapPicker && (
         <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden">
               <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2"><MapIcon2 size={18} className="text-emerald-600"/> Fine-tune Location</h3>
                  <button onClick={() => setShowMapPicker(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
               </div>
               <div className="h-[400px] w-full" ref={mapPickerRef}></div>
               <div className="p-4 bg-white border-t border-slate-100 flex justify-between items-center">
                  <p className="text-xs text-slate-500 italic">Drag the marker or click on the map to set the exact coordinates.</p>
                  <div className="flex gap-2">
                     <button onClick={() => setShowMapPicker(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-bold">Cancel</button>
                     <button onClick={handleConfirmPicker} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg text-sm font-bold shadow-md">Confirm Location</button>
                  </div>
               </div>
            </div>
         </div>
      )}

      {viewMode === 'map' ? (
        <div className="h-[calc(100vh-250px)] flex flex-col relative bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in">
          <div ref={mapContainerRef} className="w-full h-full z-0" />
          
          <div className="absolute bottom-6 right-6 z-[1000] flex flex-col gap-3">
             <button 
               onClick={() => setShowLabels(!showLabels)} 
               className={`p-3 rounded-full shadow-lg border transition-all ${showLabels ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
               title={showLabels ? "Hide Labels" : "Show Labels"}
             >
               <TypeIcon size={24} />
             </button>
             <button 
               onClick={handleLocateMeMap} 
               className="bg-white p-3 rounded-full shadow-lg text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 transition-colors border border-slate-200" 
               title="Locate Me"
             >
               <Crosshair size={24} className={isLocating ? 'animate-spin' : ''} />
             </button>
          </div>
          
          {selectedMapInd && (
            <div className="absolute right-4 top-4 bottom-4 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 z-[1000] flex flex-col overflow-hidden animate-in slide-in-from-right-10 duration-300">
              <div className="relative h-40 bg-slate-100">
                {selectedMapInd.imageUrl ? <img src={selectedMapInd.imageUrl} className="w-full h-full object-cover" alt={selectedMapInd.name} /> : <div className="w-full h-full flex items-center justify-center text-slate-400">No Image</div>}
                <button onClick={() => setSelectedMapInd(null)} className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full hover:bg-black/70 transition-colors"><X size={16} /></button>
              </div>
              <div className="p-4 flex-1 overflow-y-auto">
                <h3 className="font-bold text-slate-900">{selectedMapInd.name}</h3>
                <p className="text-xs text-slate-500 font-mono mb-2">{selectedMapInd.studbookId}</p>
                <p className="text-xs text-emerald-700 font-medium">{allSpecies.find(s => s.id === selectedMapInd.speciesId)?.commonName}</p>
                <div className="mt-4 flex gap-2">
                  <button onClick={() => handleEdit(selectedMapInd)} className="flex-1 bg-slate-100 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-200">Edit</button>
                  <Link to={`/individuals/${selectedMapInd.id}`} className="flex-1 bg-emerald-600 py-1.5 rounded-lg text-xs font-bold text-white hover:bg-emerald-700 text-center">Details</Link>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' : 'space-y-4'}>
          {sortedIndividuals.map(ind => {
             const sp = allSpecies.find(s => s.id === ind.speciesId);
             const isIndPlant = sp?.type === 'Plant';
             const displayImg = ind.imageUrl || sp?.imageUrl;
             const isLocatingThis = locatingId === ind.id;
             const isMapped = ind.latitude !== undefined && ind.longitude !== undefined;
             
             if (viewMode === 'grid') {
               return (
                  <div key={ind.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden group hover:shadow-xl transition-all flex flex-col h-full">
                     <div className="relative h-48 bg-slate-100">
                        {displayImg ? (
                          <img src={displayImg} alt={ind.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-300 bg-slate-50"><PawPrint size={40} /></div>
                        )}
                        <div className="absolute top-3 right-3 flex gap-2">
                          {!isMapped && (
                            <button 
                              onClick={(e) => { e.preventDefault(); handleQuickSetLocation(ind); }}
                              className={`p-2 bg-white/90 rounded-full shadow-lg transition-all opacity-0 group-hover:opacity-100 ${isLocatingThis ? 'text-emerald-600 animate-pulse' : 'text-slate-600 hover:text-emerald-600'}`}
                              title="Set Current Location"
                              disabled={isLocatingThis}
                            >
                              {isLocatingThis ? <Loader2 size={14} className="animate-spin" /> : <LocateFixed size={14} />}
                            </button>
                          )}
                          <button onClick={() => handleEdit(ind)} className="p-2 bg-white/90 hover:bg-white text-slate-600 hover:text-emerald-600 rounded-full shadow-lg transition-all opacity-0 group-hover:opacity-100"><Pencil size={14} /></button>
                          <Link to={`/individuals/${ind.id}`} className="p-2 bg-emerald-600 text-white rounded-full shadow-lg transition-all opacity-0 group-hover:opacity-100"><ArrowRight size={14} /></Link>
                        </div>
                        <div className={`absolute bottom-3 left-3 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border shadow-sm ${isIndPlant ? 'bg-green-600 border-green-400 text-white' : 'bg-blue-600 border-blue-400 text-white'}`}>
                          {sp?.commonName || 'Unknown'}
                        </div>
                     </div>
                     <div className="p-5 flex-1 flex flex-col">
                        <div className="flex justify-between items-start mb-2">
                           <div>
                              <h3 className="text-lg font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">{ind.name || ind.studbookId}</h3>
                              <p className="text-xs font-mono text-slate-400">{ind.studbookId}</p>
                           </div>
                           {!isIndPlant && ind.sex !== Sex.UNKNOWN && (
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${ind.sex === Sex.MALE ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>{ind.sex}</span>
                           )}
                        </div>
                        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-50">
                           <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{isIndPlant ? 'Planted' : 'Birth Date'}</p>
                              <p className="text-xs font-medium text-slate-700">{ind.birthDate || 'Not recorded'}</p>
                           </div>
                           <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{isIndPlant ? 'Metric' : 'Current Weight'}</p>
                              <p className="text-xs font-medium text-slate-700">{isIndPlant ? '--' : `${ind.weightKg} kg`}</p>
                           </div>
                        </div>
                        <div className="mt-auto pt-4 flex gap-2">
                          {ind.isDeceased && <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded">Deceased</span>}
                          {ind.loanStatus !== 'None' && <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded">{ind.loanStatus}</span>}
                          {ind.dnaSequence && <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1"><Fingerprint size={10}/> DNA</span>}
                          {isMapped && <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1"><MapPin size={10}/> Mapped</span>}
                        </div>
                     </div>
                  </div>
               );
             }
             
             return (
                <div key={ind.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 group hover:border-emerald-200 hover:shadow-md transition-all">
                   <div className="w-12 h-12 rounded-lg bg-slate-100 flex-shrink-0 overflow-hidden">
                      {displayImg ? <img src={displayImg} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-300"><PawPrint size={20}/></div>}
                   </div>
                   <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                         <h4 className="font-bold text-slate-900">{ind.name || ind.studbookId}</h4>
                         <p className="text-xs text-slate-500 font-mono">{ind.studbookId}</p>
                      </div>
                      <div>
                         <p className="text-[10px] font-bold text-slate-400 uppercase">Species</p>
                         <p className="text-sm font-medium text-slate-700">{sp?.commonName}</p>
                      </div>
                      <div className="hidden md:block">
                         <p className="text-[10px] font-bold text-slate-400 uppercase">{isIndPlant ? 'Planted' : 'Sex / Birth'}</p>
                         <p className="text-sm font-medium text-slate-700">{isIndPlant ? ind.birthDate : `${ind.sex} • ${ind.birthDate}`}</p>
                      </div>
                      <div className="hidden md:block">
                         <p className="text-[10px] font-bold text-slate-400 uppercase">Status</p>
                         <div className="flex gap-1 items-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${ind.isDeceased ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{ind.isDeceased ? 'Dead' : 'Active'}</span>
                            {isMapped && <span className="text-emerald-600" title="GPS Location Set"><MapPin size={14} fill="currentColor" fillOpacity={0.2} /></span>}
                            {ind.loanStatus !== 'None' && <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded">{ind.loanStatus}</span>}
                         </div>
                      </div>
                   </div>
                   <div className="flex gap-2">
                      {!isMapped && (
                        <button 
                           onClick={(e) => { e.preventDefault(); handleQuickSetLocation(ind); }}
                           className={`p-2 transition-colors ${isLocatingThis ? 'text-emerald-600 animate-spin' : 'text-slate-400 hover:text-emerald-600'}`}
                           title="Set Current Location"
                           disabled={isLocatingThis}
                        >
                           {isLocatingThis ? <Loader2 size={18} /> : <LocateFixed size={18}/>}
                        </button>
                      )}
                      <button onClick={() => handleEdit(ind)} className="p-2 text-slate-400 hover:text-blue-600 transition-colors"><Pencil size={18}/></button>
                      <Link to={`/individuals/${ind.id}`} className="p-2 text-slate-400 hover:text-emerald-600 transition-colors"><ArrowRight size={18}/></Link>
                   </div>
                </div>
             );
          })}
        </div>
      )}

      {(sortedIndividuals.length === 0 && viewMode !== 'map') && (
         <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
            <UserIcon size={48} className="text-slate-300 mb-4 opacity-50"/>
            <p className="text-slate-500 font-medium">No individual records found.</p>
            <button onClick={handleOpenNewForm} className="mt-4 text-emerald-600 font-bold hover:underline">Register your first individual</button>
         </div>
      )}

      {showDeleteConfirm && (
         <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl max-sm w-full p-8 text-center">
               <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <AlertTriangle size={40}/>
               </div>
               <h3 className="text-2xl font-bold text-slate-900 mb-2">Delete Record?</h3>
               <p className="text-slate-500 mb-8 leading-relaxed">This will permanently remove this individual and all their historical logs. This action cannot be undone.</p>
               <div className="flex gap-3">
                  <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors">Cancel</button>
                  <button onClick={handleDelete} className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-red-200">Yes, Delete</button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default IndividualManager;
