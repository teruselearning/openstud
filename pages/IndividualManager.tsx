import React, { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { getSpecies, getIndividuals, saveIndividuals, generatePattern, saveSpecies, getOrg, getEnclosures, getProjects, deleteIndividual } from '../services/storage';
import { fetchSpeciesData, generateSpeciesImage, fetchWikimediaImage, urlToBase64 } from '../services/geminiService';
import { Species, Individual, Sex, AcquisitionSource, SpeciesType, Organization, Enclosure, Project, PlantClassification } from '../types';
import { Plus, Camera, Search, Dna, PawPrint, Pencil, X as XIcon, Filter, Trash2, AlertTriangle, MapPin, Users, LayoutGrid, List, ArrowRight, Briefcase, RefreshCw, Sprout, Loader2, FileText, CheckCircle, Fingerprint, User as UserIcon, Upload, FileCode, Crosshair, Map as MapIcon, Maximize2, LocateFixed, Type as TypeIcon, Map as MapIcon2, ChevronDown, Calendar, Weight, Info, Box, Save, Anchor, Layers, Eye, EyeOff, FolderOpen, UserCheck, FileUp, FileSpreadsheet, Sparkles, Download, Leaf, CheckSquare, Square, Trash } from 'lucide-react';
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
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [allEnclosures, setAllEnclosures] = useState<Enclosure[]>([]);
  const [org, setOrg] = useState<Organization | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  
  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk Upload State
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkTotal, setBulkTotal] = useState(0);
  const [bulkStatus, setBulkStatus] = useState('');
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);

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

  // Inline Species Creation State
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
    if (location.state?.editId && allIndividuals.length > 0) {
      const indToEdit = allIndividuals.find(i => i.id === location.state.editId);
      if (indToEdit) {
        setEditingId(indToEdit.id);
        setReturnToId(location.state.fromId || null);
        setFormData({ ...indToEdit });
        const sp = allSpecies.find(s => s.id === indToEdit.speciesId);
        setSpeciesSearchQuery(sp?.commonName || '');
        setShowForm(true);
        window.history.replaceState({}, document.title);
      }
    }
  }, [location.state, allIndividuals, allSpecies]);

  // Main Map Controller
  useEffect(() => {
    if (viewMode === 'map' && mapContainerRef.current && !mapInstanceRef.current) {
      const initialLat = typeof org?.latitude === 'number' ? org.latitude : 0;
      const initialLng = typeof org?.longitude === 'number' ? org.longitude : 0;
      
      const map = L.map(mapContainerRef.current, { 
        maxZoom: 22,
        zoomControl: false 
      }).setView([initialLat, initialLng], 15);
      
      L.control.zoom({ position: 'topright' }).addTo(map);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 22 }).addTo(map);
      
      markersLayerRef.current = L.layerGroup().addTo(map);
      enclosuresLayerRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
      
      setTimeout(() => map.invalidateSize(), 200);
    }

    return () => {
       if (mapInstanceRef.current && viewMode !== 'map') {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
          markersLayerRef.current = null;
          enclosuresLayerRef.current = null;
       }
    };
  }, [viewMode, org]);

  const isAll = currentProjectId === 'ALL_PROJECTS';
  const projectIndividuals = isAll ? allIndividuals : allIndividuals.filter(ind => ind.projectId === currentProjectId);
  const filtered = projectIndividuals.filter(ind => {
    const matchesSearch = (ind.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || (ind.studbookId || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSpecies = !filterSpeciesId || ind.speciesId === filterSpeciesId;
    const matchesStatus = filterStatus === 'all' || (filterStatus === 'deceased' ? ind.isDeceased : !ind.isDeceased);
    return matchesSearch && matchesSpecies && matchesStatus;
  });

  const availableSpeciesForForm = allSpecies.filter(s => {
    if (allProjects.length === 1) return s.projectId === allProjects[0].id;
    return isAll ? (formData.projectId ? s.projectId === formData.projectId : true) : s.projectId === currentProjectId;
  });
  const speciesSearchResults = availableSpeciesForForm.filter(s => s.commonName.toLowerCase().includes(speciesSearchQuery.toLowerCase()));

  // Map Data Updater
  useEffect(() => {
    if (viewMode === 'map' && mapInstanceRef.current) {
      const map = mapInstanceRef.current;
      const markersLayer = markersLayerRef.current;
      const enclosuresLayer = enclosuresLayerRef.current;
      
      if (markersLayer) markersLayer.clearLayers();
      if (enclosuresLayer) enclosuresLayer.clearLayers();

      // Draw Individuals
      filtered.forEach(ind => {
        if (typeof ind.latitude === 'number' && typeof ind.longitude === 'number') {
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
      if (showEnclosuresOnMap && enclosuresLayer) {
        allEnclosures.forEach(enc => {
          if (enc.boundary && Array.isArray(enc.boundary) && enc.boundary.length > 0) {
            const validPoints = enc.boundary.filter(p => p && typeof p.lat === 'number' && typeof p.lng === 'number');
            
            if (validPoints.length >= 3) {
               const poly = L.polygon(validPoints.map(p => [p.lat, p.lng]), {
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
          }
        });
      }
    }
  }, [viewMode, filtered, allEnclosures, showEnclosuresOnMap]);

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(i => i.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Are you sure you want to permanently delete ${selectedIds.size} specimen records? This will also remove them from the database.`)) return;
    
    setIsSubmitting(true);
    try {
      // Loop through and delete each one explicitly to ensure sync removal
      const idsToDelete = Array.from(selectedIds);
      for (const id of idsToDelete) {
         await deleteIndividual(id);
      }
      
      const remaining = allIndividuals.filter(i => !selectedIds.has(i.id));
      setAllIndividuals(remaining);
      setSelectedIds(new Set());
    } catch (e) {
      alert("Delete failed on some records. Please check connection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenNewForm = () => {
    setEditingId(null);
    setReturnToId(null);
    setFormData({ 
      studbookId: `SB-${new Date().getFullYear()}-${Math.random().toString(36).substring(7).toUpperCase()}`, 
      speciesId: '', 
      projectId: currentProjectId === 'ALL_PROJECTS' ? (allProjects.length === 1 ? allProjects[0].id : '') : currentProjectId,
      enclosureId: '', 
      name: '', 
      sex: Sex.UNKNOWN, 
      weightKg: 0, 
      birthDate: new Date().toISOString().split('T')[0], 
      source: 'Bred in house', 
      notes: '', 
      imageUrl: '',
      latitude: typeof org?.latitude === 'number' ? org.latitude : undefined,
      longitude: typeof org?.longitude === 'number' ? org.longitude : undefined
    });
    setSpeciesSearchQuery('');
    setShowForm(true);
    setShowNewSpeciesForm(false);
  };

  const handleEdit = (ind: Individual) => {
    setEditingId(ind.id);
    setReturnToId(null);
    setFormData({ ...ind });
    const sp = allSpecies.find(s => s.id === ind.speciesId);
    setSpeciesSearchQuery(sp?.commonName || '');
    setShowForm(true);
    setShowNewSpeciesForm(false);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    if (returnToId) navigate(`/individuals/${returnToId}`);
    setEditingId(null);
    setReturnToId(null);
  };

  const handleCreateNewSpecies = async () => {
    if (!newSpeciesData.commonName || !newSpeciesData.scientificName) {
        alert("Please fill in common and scientific names for the new species.");
        return;
    }
    
    setIsSubmitting(true);
    const targetProjectId = allProjects.length === 1 ? allProjects[0].id : (isAll ? formData.projectId : currentProjectId);
    
    try {
        const newSp: Species = {
            id: `sp-${Date.now()}`,
            projectId: targetProjectId as string,
            commonName: newSpeciesData.commonName,
            scientificName: newSpeciesData.scientificName,
            type: newSpeciesData.type as SpeciesType,
            conservationStatus: newSpeciesData.conservationStatus || 'Unknown',
            sexualMaturityAgeYears: 0,
            averageAdultWeightKg: 0,
            lifeExpectancyYears: 0,
            imageUrl: generatePattern(newSpeciesData.commonName)
        };
        
        const updated = [...allSpecies, newSp];
        await saveSpecies(updated); // CRITICAL: Await the sync here
        setAllSpecies(updated);
        
        setFormData({ ...formData, speciesId: newSp.id });
        setSpeciesSearchQuery(newSp.commonName);
        setShowNewSpeciesForm(false);
    } catch (e) {
        console.error(e);
        alert("Failed to save new species. Please check connection.");
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.speciesId || !formData.studbookId) return;
    
    const targetProjectId = allProjects.length === 1 ? allProjects[0].id : (isAll ? formData.projectId : currentProjectId);
    
    if (!targetProjectId) {
      alert("Please select a project for this specimen.");
      return;
    }

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
        await saveIndividuals(updated); // Syncing
        
        if (returnToId) navigate(`/individuals/${returnToId}`);
        else setShowForm(false);
        
        setEditingId(null);
        setReturnToId(null);
    } catch (err: any) {
        alert("Database Error: Could not save individual. Ensure the species is registered first.");
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const targetProjectId = allProjects.length === 1 ? allProjects[0].id : (currentProjectId === 'ALL_PROJECTS' ? '' : currentProjectId);
    if (!targetProjectId) {
      alert("Please select a specific project in the navigator before uploading.");
      return;
    }

    setIsProcessingBulk(true);
    setBulkStatus('Initializing data engine...');

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim().length > 0);
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      
      const rows = lines.slice(1);
      setBulkTotal(rows.length);
      setBulkProgress(0);

      const localIndividuals = [...getIndividuals()];
      const updatedSpeciesList = [...getSpecies()];

      for (let i = 0; i < rows.length; i++) {
        const values = rows[i].split(',').map(v => v.trim());
        const data: any = {};
        headers.forEach((h, idx) => { data[h] = values[idx]; });

        const name = data.name || `Indiv ${i + 1}`;
        const sbookId = data.studbookid || `SB-BULK-${Date.now()}-${i}`;
        setBulkStatus(`Processing: ${name}`);
        setBulkProgress(i + 1);

        try {
          let kingdom: SpeciesType = 'Animal';
          const rawKingdom = (data.kingdom || data.type || '').toLowerCase();
          if (rawKingdom.includes('flora') || rawKingdom.includes('plant')) kingdom = 'Plant';

          const sciName = data.scientificname;
          const commonName = data.commonname || data.speciesname || data.species;
          
          let foundSpecies = updatedSpeciesList.find(s => 
             s.projectId === targetProjectId && 
             ((sciName && s.scientificName.toLowerCase() === sciName.toLowerCase()) || 
              (commonName && s.commonName.toLowerCase() === commonName.toLowerCase()))
          );

          if (!foundSpecies) {
            const lookupName = commonName || sciName;
            if (!lookupName) throw new Error("Missing species identifier in row " + (i + 1));

            setBulkStatus(`AI Resolving Species: ${lookupName}`);
            const aiData = await fetchSpeciesData(lookupName, kingdom, org?.location || '');
            let spImg = await fetchWikimediaImage(aiData?.scientificName || lookupName);
            if (!spImg) spImg = await generateSpeciesImage(lookupName, aiData?.scientificName || '', kingdom);
            
            const newSp: Species = {
              id: `sp-auto-${Date.now()}-${i}`,
              projectId: targetProjectId,
              commonName: commonName || aiData?.commonName || sciName || lookupName,
              scientificName: sciName || aiData?.scientificName || '',
              type: kingdom,
              conservationStatus: aiData?.conservationStatus || 'Unknown',
              sexualMaturityAgeYears: Number(aiData?.sexualMaturityAgeYears || 0),
              averageAdultWeightKg: Number(aiData?.averageAdultWeightKg || 0),
              lifeExpectancyYears: Number(aiData?.lifeExpectancyYears || 0),
              imageUrl: spImg || generatePattern(lookupName)
            } as Species;

            updatedSpeciesList.push(newSp);
            foundSpecies = newSp;
          }

          let profileImg = '';
          const url = data.imageurl || data.image;
          if (url) {
            setBulkStatus(`Processing media for ${name}...`);
            // Fix: Cast the URL to string as urlToBase64 expects a string
            const processed = await urlToBase64(url as string);
            if (processed) profileImg = processed;
          }
          if (!profileImg) profileImg = generatePattern(name);

          // IDEMPOTENCY CHECK: Find existing by Studbook ID
          const existingIdx = localIndividuals.findIndex(ind => ind.studbookId === sbookId && ind.projectId === targetProjectId);
          
          const indEntry: Individual = {
            id: existingIdx !== -1 ? localIndividuals[existingIdx].id : `ind-${Date.now()}-${i}`,
            projectId: targetProjectId,
            speciesId: foundSpecies.id,
            studbookId: sbookId,
            name,
            sex: (data.sex || Sex.UNKNOWN) as Sex,
            birthDate: data.birthdate || data.planteddate || '',
            weightKg: Number(data.weightkg || data.weight || 0),
            notes: data.notes || '',
            imageUrl: profileImg,
            source: 'Bred in house'
          };

          if (existingIdx !== -1) {
             localIndividuals[existingIdx] = { ...localIndividuals[existingIdx], ...indEntry };
          } else {
             localIndividuals.push(indEntry);
          }
        } catch (err) {
          console.error(`Failed to process row ${i}`, err);
        }
      }

      // CRITICAL: Sync species first to satisfy FK constraints in DB
      await saveSpecies(updatedSpeciesList);
      setAllSpecies(updatedSpeciesList);
      
      // Then sync the specimens
      await saveIndividuals(localIndividuals);
      setAllIndividuals(localIndividuals);

      setIsProcessingBulk(false);
      setShowBulkModal(false);
      setBulkProgress(0);
    };
    reader.readAsText(file);
  };

  const downloadTemplate = () => {
    const csv = "name,studbookId,kingdom,scientificName,commonName,sex,birthDate,weightKg,imageUrl,notes\nLeo,SB-X1,Fauna,Panthera leo,Lion,Male,2022-01-01,150,https://drive.google.com/uc?export=view&id=1jPKQXrAy4iK0CGjdLfgCiOfc-BUtWMrQ,GDrive Link Test\nDaisy,SB-P1,Flora,Bellis perennis,English Daisy,Unknown,2023-05-10,0.2,,Test specimen";
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'openstudbook_specimens_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const potentialParents = allIndividuals.filter(i => i.speciesId === formData.speciesId && i.id !== editingId && !i.isDeceased);
  const potentialSires = potentialParents.filter(i => i.sex === Sex.MALE || i.sex === Sex.UNKNOWN);
  const potentialDams = potentialParents.filter(i => i.sex === Sex.FEMALE || i.sex === Sex.UNKNOWN);

  const shouldShowEmptyMapOverlay = filtered.length === 0 || (!filtered.some(ind => typeof ind.latitude === 'number' && typeof ind.longitude === 'number') && !allEnclosures.some(enc => enc.boundary && enc.boundary.length >= 3));

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

  const selectedSpecies = allSpecies.find(s => s.id === formData.speciesId);
  const isFlora = selectedSpecies?.type === 'Plant';

  return (
    <div className="space-y-6 relative pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t('individuals')}</h2>
          <p className="text-slate-500">{org?.focus === 'Plants' ? t('indivSubtitlePlant') : t('indivSubtitleAnimal')}</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center bg-white border border-slate-300 rounded-lg p-1 shadow-sm">
            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`} title="Grid view"><LayoutGrid size={18} /></button>
            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`} title="List view"><List size={18} /></button>
            <button onClick={() => setViewMode('map')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'map' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`} title="Map view"><MapIcon size={18} /></button>
          </div>
          <button onClick={() => setShowBulkModal(true)} className="flex items-center justify-center space-x-2 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg font-bold border border-slate-300 shadow-sm transition-all"><FileUp size={18} className="text-emerald-600" /><span>Import</span></button>
          <button onClick={handleOpenNewForm} className="flex-1 md:flex-none flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm">
            <Plus size={18} /><span>{t('add')}</span>
          </button>
        </div>
      </div>

      {/* Selection Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[3000] animate-in slide-in-from-bottom-10 duration-500">
           <div className="bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-8 border border-white/10">
              <div className="flex items-center gap-3">
                 <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center font-bold">{selectedIds.size}</div>
                 <span className="text-sm font-bold uppercase tracking-widest text-slate-300">Specimens Selected</span>
              </div>
              <div className="flex gap-2">
                 <button onClick={handleBulkDelete} disabled={isSubmitting} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50">
                    {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18}/>}
                    {isSubmitting ? 'Deleting...' : 'Delete Selection'}
                 </button>
                 <button onClick={() => setSelectedIds(new Set())} className="px-4 py-2 text-slate-400 hover:text-white transition-colors text-sm font-bold">Cancel</button>
              </div>
           </div>
        </div>
      )}

      {showBulkModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2"><FileSpreadsheet size={24} className="text-emerald-600" /> Bulk Import Specimens</h3>
              <button onClick={() => !isProcessingBulk && setShowBulkModal(false)} className="text-slate-400 hover:text-slate-600"><XIcon size={24} /></button>
            </div>
            
            {!isProcessingBulk ? (
              <div className="space-y-6">
                <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl">
                  <h4 className="text-sm font-bold text-indigo-800 mb-1">Update Policy:</h4>
                  <p className="text-xs text-indigo-700 mb-4 italic">If a specimen with the same Studbook ID exists in this project, it will be updated with the spreadsheet data.</p>
                  <h4 className="text-sm font-bold text-indigo-800 mb-1">Required Columns (*):</h4>
                  <ul className="text-xs text-indigo-700 list-disc list-inside mb-4 space-y-1">
                    <li><strong>Name</strong>* (Specimen name)</li>
                    <li><strong>Kingdom</strong>* (Fauna or Flora)</li>
                    <li><strong>Common Name</strong> OR <strong>Scientific Name</strong>*</li>
                  </ul>
                  <button onClick={downloadTemplate} className="text-xs font-bold text-indigo-700 flex items-center gap-1.5 hover:underline"><Download size={14}/> Download Template</button>
                </div>
                
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl p-10 bg-slate-50 hover:bg-white transition-all group relative">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm text-slate-400 mb-4 group-hover:text-emerald-600 transition-colors"><FileUp size={32} /></div>
                  <p className="font-bold text-slate-800 mb-1">Upload CSV</p>
                  <p className="text-xs text-slate-400">or drag and drop file here</p>
                  <input type="file" accept=".csv" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleCsvUpload} />
                </div>
              </div>
            ) : (
              <div className="py-10 text-center space-y-6">
                <div className="relative w-24 h-24 mx-auto">
                   <Loader2 className="w-full h-full text-indigo-600 animate-spin" />
                   <div className="absolute inset-0 flex items-center justify-center">
                      <Sparkles className="text-emerald-500 animate-pulse" size={32} />
                   </div>
                </div>
                <div>
                   <h4 className="font-bold text-slate-900 text-lg">Processing Records</h4>
                   <p className="text-sm text-slate-500">{bulkStatus}</p>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5">
                   <div className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500" style={{ width: `${(bulkProgress / bulkTotal) * 100}%` }}></div>
                </div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{bulkProgress} / {bulkTotal} Completed</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white" placeholder={t('searchIndividuals')} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <select className="px-4 py-2 border border-slate-300 rounded-lg bg-white" value={filterSpeciesId} onChange={e => setFilterSpeciesId(e.target.value)}>
          <option value="">{t('allSpeciesFilter')}</option>
          {allSpecies.filter(s => {
            if (allProjects.length === 1) return s.projectId === allProjects[0].id;
            return isAll ? true : s.projectId === currentProjectId;
          }).map(s => <option key={s.id} value={s.id}>{s.commonName}</option>)}
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
            const isPlant = sp?.type === 'Plant';
            const displayImg = ind.imageUrl || sp?.imageUrl || generatePattern(ind.name);
            const isSelected = selectedIds.has(ind.id);
            
            return (
              <div key={ind.id} className={`bg-white rounded-2xl border transition-all group flex flex-col relative ${isSelected ? 'ring-4 ring-emerald-500 border-emerald-500 shadow-xl' : 'border-slate-200 shadow-sm hover:shadow-md'}`}>
                <div className="absolute top-2 right-2 z-20">
                   <button onClick={() => toggleSelection(ind.id)} className={`p-1.5 rounded-lg border transition-all ${isSelected ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white/80 border-slate-200 text-slate-400 group-hover:opacity-100 opacity-0 backdrop-blur-sm'}`}>
                      <CheckCircle size={18} />
                   </button>
                </div>
                <Link to={`/individuals/${ind.id}`} className="h-48 bg-slate-100 relative overflow-hidden block">
                  <img src={displayImg} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt={ind.name} />
                  {(!(isPlant && ind.sex === Sex.UNKNOWN)) && (
                    <div className={`absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold text-white uppercase ${ind.sex === Sex.MALE ? 'bg-blue-600' : ind.sex === Sex.FEMALE ? 'bg-pink-600' : 'bg-slate-600'}`}>{ind.sex}</div>
                  )}
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
                <th className="px-4 py-4 w-10">
                   <button onClick={toggleSelectAll} className="p-1 hover:bg-slate-200 rounded transition-colors">
                      {selectedIds.size === filtered.length && filtered.length > 0 ? <CheckSquare size={18} className="text-emerald-600"/> : <Square size={18}/>}
                   </button>
                </th>
                <th className="px-6 py-4">Specimen</th>
                <th className="px-6 py-4">Species</th>
                <th className="px-6 py-4">Sex</th>
                <th className="px-6 py-4">Studbook ID</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(ind => (
                <tr key={ind.id} className={`hover:bg-slate-50 transition-colors group ${selectedIds.has(ind.id) ? 'bg-emerald-50/50' : ''}`}>
                  <td className="px-4 py-4">
                     <button onClick={() => toggleSelection(ind.id)} className={`p-1 rounded transition-colors ${selectedIds.has(ind.id) ? 'text-emerald-600' : 'text-slate-300'}`}>
                        {selectedIds.has(ind.id) ? <CheckSquare size={18}/> : <Square size={18}/>}
                     </button>
                  </td>
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
          <div ref={mapContainerRef} className={`w-full h-[600px] ${shouldShowEmptyMapOverlay ? 'opacity-30' : ''}`} />
          
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
                     onClick={() => navigate('/enclosures', { state: { editId: activeEnclosureFromMap.id } })}
                     className="w-full text-center py-2 bg-slate-900 text-white text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                   >
                     Manage {org?.focus === 'Plants' ? 'Area' : 'Enclosure'} <ChevronDown size={14} className="-rotate-90" />
                   </button>
                </div>
             </div>
          )}

          {shouldShowEmptyMapOverlay && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center pointer-events-none">
               <div className="w-16 h-16 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center text-slate-400 mb-4 shadow-xl border border-slate-100">
                  <MapPin size={32} />
               </div>
               <p className="text-slate-700 bg-white/90 backdrop-blur-sm px-6 py-2 rounded-full font-bold shadow-lg border border-slate-100">
                  {filtered.length === 0 ? "No specimens match your filters" : t('noLocationDataMessage')}
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
                {isAll && allProjects.length > 1 && (
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <FolderOpen size={16}/> Project Selection
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="md:col-span-2">
                        <label className="text-xs font-bold text-slate-700 block mb-1">Target Project <span className="text-red-500">*</span></label>
                        <select 
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-emerald-500" 
                          value={formData.projectId} 
                          onChange={e => setFormData({...formData, projectId: e.target.value, speciesId: '', enclosureId: ''})} 
                          required
                        >
                          <option value="">Select Project...</option>
                          {allProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <UserIcon size={16}/> Identity & Species
                    </h4>
                    {!editingId && (
                      <button 
                        type="button" 
                        onClick={() => setShowNewSpeciesForm(!showNewSpeciesForm)} 
                        className={`text-xs font-bold px-3 py-1 rounded-full transition-colors ${showNewSpeciesForm ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}
                      >
                        {showNewSpeciesForm ? 'Select Existing Species' : '+ Add New Species'}
                      </button>
                    )}
                  </div>

                  {showNewSpeciesForm ? (
                    <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100 space-y-4 animate-in slide-in-from-top-2">
                       <h5 className="text-xs font-black text-indigo-700 uppercase">Quick Species Registration</h5>
                       <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                             <label className="text-[10px] font-bold text-indigo-400 uppercase">Common Name</label>
                             <input className="w-full px-3 py-2 border border-indigo-200 rounded-lg text-sm" value={newSpeciesData.commonName} onChange={e => setNewSpeciesData({...newSpeciesData, commonName: e.target.value})} placeholder="e.g. Red Panda" />
                          </div>
                          <div>
                             <label className="text-[10px] font-bold text-indigo-400 uppercase">Scientific Name</label>
                             <input className="w-full px-3 py-2 border border-indigo-200 rounded-lg text-sm italic" value={newSpeciesData.scientificName} onChange={e => setNewSpeciesData({...newSpeciesData, scientificName: e.target.value})} placeholder="e.g. Ailurus fulgens" />
                          </div>
                          <div>
                             <label className="text-[10px] font-bold text-indigo-400 uppercase">Kingdom</label>
                             <select className="w-full px-3 py-2 border border-indigo-200 rounded-lg text-sm bg-white" value={newSpeciesData.type} onChange={e => setNewSpeciesData({...newSpeciesData, type: e.target.value as SpeciesType})}>
                                <option value="Animal">Fauna</option>
                                <option value="Plant">Flora</option>
                             </select>
                          </div>
                       </div>
                       <button type="button" onClick={handleCreateNewSpecies} className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-xs font-bold hover:bg-indigo-700 shadow-sm transition-all">Register Species</button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="relative" ref={speciesDropdownRef}>
                          <label className="text-xs font-bold text-slate-700 block mb-1">Species <span className="text-red-500">*</span></label>
                          <input 
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white disabled:bg-slate-100 disabled:text-slate-400" 
                            value={speciesSearchQuery} 
                            onChange={e => { setSpeciesSearchQuery(e.target.value); setIsSpeciesDropdownOpen(true); }} 
                            onFocus={() => setIsSpeciesDropdownOpen(true)} 
                            placeholder={(isAll && allProjects.length > 1 && !formData.projectId) ? "Select project first" : "Search species..."} 
                            required 
                            disabled={isAll && allProjects.length > 1 && !formData.projectId}
                          />
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
                          <input className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Specimen name" required />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-700 block mb-1">{isFlora ? 'Classification' : 'Sex'}</label>
                          {isFlora ? (
                             <div className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600 font-medium">
                                {selectedSpecies?.plantClassification || 'Unknown'}
                             </div>
                          ) : (
                            <select className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white" value={formData.sex} onChange={e => setFormData({...formData, sex: e.target.value as Sex})}>
                              {Object.values(Sex).map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          )}
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-700 block mb-1">{isFlora ? 'Date Planted' : 'Birth Date'}</label>
                          <input type="date" className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none" value={formData.birthDate} onChange={e => setFormData({...formData, birthDate: e.target.value})} />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-700 block mb-1">Current Weight (Kg)</label>
                          <input type="number" step="0.01" className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none" value={formData.weightKg} onChange={e => setFormData({...formData, weightKg: parseFloat(e.target.value)})} />
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-4 pt-6 border-t border-slate-100">
                  <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <MapPin size={16}/> Environment & Geolocation
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">Current {org?.focus === 'Plants' ? 'Area' : 'Enclosure'}</label>
                        <select 
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white outline-none" 
                          value={formData.enclosureId} 
                          onChange={e => setFormData({...formData, enclosureId: e.target.value})}
                          disabled={isAll && allProjects.length > 1 && !formData.projectId}
                        >
                          <option value="">Unassigned</option>
                          {allEnclosures.filter(enc => {
                            if (allProjects.length === 1) return enc.projectId === allProjects[0].id;
                            return isAll ? enc.projectId === formData.projectId : enc.projectId === currentProjectId;
                          }).map(encl => <option key={encl.id} value={encl.id}>{encl.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">Latitude</label>
                        <input type="number" step="any" className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none" value={formData.latitude ?? ''} onChange={e => setFormData({...formData, latitude: e.target.value === '' ? undefined : parseFloat(e.target.value)})} placeholder="e.g. 45.123" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">Longitude</label>
                        <input type="number" step="any" className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none" value={formData.longitude ?? ''} onChange={e => setFormData({...formData, longitude: e.target.value === '' ? undefined : parseFloat(e.target.value)})} placeholder="e.g. -122.456" />
                    </div>
                  </div>
                </div>

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

                <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                   <button type="button" onClick={handleCloseForm} className="px-8 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-all">Cancel</button>
                   <button type="submit" disabled={isSubmitting} className="bg-emerald-600 text-white px-10 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-100 transform active:scale-95 transition-all">
                     {isSubmitting ? <Loader2 size={20} className="animate-spin"/> : <Save size={20}/>} 
                     {editingId ? "Update Record" : "Register Specimen"}
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
