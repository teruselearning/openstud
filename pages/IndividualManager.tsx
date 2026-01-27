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
    const count = selectedIds.size;
    if (!confirm(`Are you sure you want to permanently delete ${count} specimen records?`)) return;
    
    setIsSubmitting(true);
    console.log(`[BULK DELETE] Starting deletion of ${count} records:`, Array.from(selectedIds));
    
    try {
      // 1. Process deletions
      for (const id of Array.from(selectedIds)) {
         await deleteIndividual(id);
      }
      
      // 2. Synchronize local state
      const remaining = allIndividuals.filter(i => !selectedIds.has(i.id));
      setAllIndividuals(remaining);
      setSelectedIds(new Set());
      
      console.log(`[BULK DELETE] Success. ${remaining.length} specimens remaining.`);
    } catch (e) {
      console.error("[BULK DELETE] Failed during execution:", e);
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
        await saveSpecies(updated); 
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
        await saveIndividuals(updated); 
        
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
    console.log(`[BULK IMPORT] Started for project: ${targetProjectId}`);

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
        console.log(`[BULK IMPORT] Row ${i+1}: ${name} (${sbookId})`);

        try {
          let kingdom: SpeciesType = 'Animal';
          const rawKingdom = (data.kingdom || data.type || '').toLowerCase();
          if (rawKingdom.includes('flora') || rawKingdom.includes('plant')) kingdom = 'Plant';

          const sciName = data.scientificname;
          const commonNameRaw = data.commonname || data.speciesname || data.species;
          // Fix: Ensure commonName is treated as string for toLowerCase() calls.
          const commonName = String(commonNameRaw || '');
          
          let foundSpecies = updatedSpeciesList.find(s => 
             s.projectId === targetProjectId && 
             ((sciName && String(s.scientificName).toLowerCase() === String(sciName).toLowerCase()) || 
              (commonName && String(s.commonName).toLowerCase() === commonName.toLowerCase()))
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
          const urlStrRaw = data.imageurl || data.image;
          if (urlStrRaw) {
            setBulkStatus(`Processing media for ${name}...`);
            // Fix: Ensure urlStr is a string when passed to urlToBase64 to avoid "Argument of type 'unknown' is not assignable" error.
            const processed = await urlToBase64(String(urlStrRaw));
            if (processed) profileImg = processed;
          }
          if (!profileImg) profileImg = generatePattern(name);

          // IDEMPOTENCY CHECK: Find existing by Studbook ID
          const existingIdx = localIndividuals.findIndex(ind => ind.studbookId === sbookId && ind.projectId === targetProjectId);
          
          const