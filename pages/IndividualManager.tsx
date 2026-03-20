import React, { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { getSpecies, getIndividuals, saveIndividuals, generatePattern, saveSpecies, getOrg, getEnclosures, getProjects, deleteIndividual } from '../services/storage';
import { fetchSpeciesData, generateSpeciesImage, fetchWikimediaImage } from '../services/geminiService';
import { Species, Individual, Sex, SpeciesType, Organization, Enclosure, Project, PlantClassification } from '../types';
import { Plus, Search, Dna, PawPrint, Pencil, X as XIcon, MapPin, LayoutGrid, List, Box, ChevronDown, Save, Camera, ImageIcon, Info, Crosshair, Map as MapIcon2, Sparkles, Loader2, Upload, CheckCircle2, AlertTriangle, AlertCircle, FileSpreadsheet } from 'lucide-react';
import { LanguageContext } from '../App';

declare const L: any;

type ViewMode = 'grid' | 'list' | 'map';

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
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSpeciesId, setFilterSpeciesId] = useState<string>('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [speciesSearchQuery, setSpeciesSearchQuery] = useState('');
  const [isSpeciesDropdownOpen, setIsSpeciesDropdownOpen] = useState(false);
  const [addLocation, setAddLocation] = useState(false);

  // Quick Add Species State
  const [showQuickSpeciesModal, setShowQuickSpeciesModal] = useState(false);
  const [isQuickSpeciesLoading, setIsQuickSpeciesLoading] = useState(false);
  const [quickSpeciesStatus, setQuickSpeciesStatus] = useState('');
  const [quickSpeciesData, setQuickSpeciesData] = useState<Partial<Species>>({
    commonName: '',
    scientificName: '',
    type: 'Animal',
    conservationStatus: 'Least Concern',
    sexualMaturityAgeYears: 0,
    lifeExpectancyYears: 0,
    averageAdultWeightKg: 0
  });

  const formMapRef = useRef<HTMLDivElement>(null);
  const formMapInstance = useRef<any>(null);
  const formMarker = useRef<any>(null);
  const overviewMapRef = useRef<HTMLDivElement>(null);
  const overviewMapInstance = useRef<any>(null);

  // Import state
  const [showImport, setShowImport] = useState(false);
  const [importPhase, setImportPhase] = useState<'upload' | 'preview'>('upload');
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const TEMPLATE_CSV = `Studbook ID,Common Name,Scientific Name,Name,Sex,Birth Date,Weight(kg),Notes,Source,Source Details,Latitude,Longitude,Deceased,Death Date,Image URL
SB-2024-001,African Elephant,Loxodonta africana,Ellie,Female,2018-03-12,2800,Healthy adult,,,,,,,https://drive.google.com/file/d/YOUR_FILE_ID/view
SB-2024-002,African Elephant,Loxodonta africana,Babar,Male,2015-07-04,3200,,,,,,,,`;

  const FIELD_REFERENCE = [
    { col: 'Studbook ID',      required: false, notes: 'Auto-generated if omitted' },
    { col: 'Common Name',      required: 'either', notes: 'At least one of Common Name or Scientific Name is required' },
    { col: 'Scientific Name',  required: 'either', notes: 'At least one of Common Name or Scientific Name is required' },
    { col: 'Name',             required: false, notes: 'Auto-set to "Species #ID" for plants' },
    { col: 'Sex',              required: false, notes: 'Male / Female / Unknown' },
    { col: 'Birth Date',       required: false, notes: 'YYYY-MM-DD format' },
    { col: 'Weight(kg)',       required: false, notes: 'Numeric, in kilograms' },
    { col: 'Notes',            required: false, notes: 'Free text' },
    { col: 'Source',           required: false, notes: 'e.g. "Bred in house", "External"' },
    { col: 'Source Details',   required: false, notes: 'Free text' },
    { col: 'Latitude',         required: false, notes: 'Decimal degrees' },
    { col: 'Longitude',        required: false, notes: 'Decimal degrees' },
    { col: 'Deceased',         required: false, notes: 'true / false' },
    { col: 'Death Date',       required: false, notes: 'YYYY-MM-DD format' },
    { col: 'Image URL',        required: false, notes: 'Google Drive share link or any direct image URL — fetched and saved as base64' },
  ];

  // ── CSV helpers ────────────────────────────────────────────────────────────
  const parseCSV = (text: string): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (inQuotes && text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        row.push(field.trim()); field = '';
      } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field.trim()); field = '';
        if (row.some(c => c !== '')) rows.push(row);
        row = [];
      } else { field += ch; }
    }
    if (field || row.length) { row.push(field.trim()); if (row.some(c => c !== '')) rows.push(row); }
    return rows;
  };

  const normalise = (s: string) => s.toLowerCase().replace(/[\s_()\-]/g, '');

  const COL_MAP: Record<string, string> = {
    name: 'name', individualname: 'name',
    studbookid: 'studbookId', id: 'studbookId',
    commonname: 'commonName', species: 'commonName',
    scientificname: 'scientificName',
    sex: 'sex',
    birthdate: 'birthDate', dob: 'birthDate', dateofbirth: 'birthDate',
    weightkg: 'weightKg', 'weightkg': 'weightKg', weight: 'weightKg',
    notes: 'notes',
    source: 'source', sourcedetails: 'sourceDetails',
    latitude: 'latitude', lat: 'latitude',
    longitude: 'longitude', lon: 'longitude', lng: 'longitude',
    deceased: 'isDeceased', isdeceased: 'isDeceased',
    deathdate: 'deathDate',
    imageurl: 'imageUrl', image: 'imageUrl', img: 'imageUrl', photo: 'imageUrl', photourl: 'imageUrl', pictureurl: 'imageUrl', imgurl: 'imageUrl',
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const raw = parseCSV(text);
      if (raw.length < 2) { setImportErrors(['File appears empty or has no data rows.']); setImportRows([]); setImportPhase('preview'); return; }

      const headers = raw[0].map(h => normalise(h));
      const colFields = headers.map(h => COL_MAP[h] || null);
      const errors: string[] = [];
      const hasSpecies = colFields.includes('commonName') || colFields.includes('scientificName');
      if (!hasSpecies) errors.push('No species column found — add at least one of "Common Name" or "Scientific Name".');

      const seen = new Set<string>();
      const rows = raw.slice(1).map((cols, rowIdx) => {
        const obj: Record<string, string> = {};
        colFields.forEach((field, ci) => { if (field) obj[field] = cols[ci] || ''; });
        if (obj['studbookId']?.toLowerCase() === 'studbook id') return null;

        const speciesLabel = obj.commonName || obj.scientificName || '';
        const sp = allSpecies.find(s =>
          (obj.commonName && s.commonName.toLowerCase() === obj.commonName.toLowerCase()) ||
          (obj.scientificName && s.scientificName.toLowerCase() === obj.scientificName.toLowerCase())
        );

        const studbookId = obj.studbookId || `SB-${new Date().getFullYear()}-${(rowIdx + 1).toString().padStart(3, '0')}`;
        // Warn about duplicate studbook IDs
        if (seen.has(studbookId)) errors.push(`Duplicate Studbook ID on row ${rowIdx + 2}: "${studbookId}"`);
        seen.add(studbookId);

        return {
          _row: rowIdx + 2,
          _speciesMatch: sp || null,
          _speciesLabel: speciesLabel,
          _isNewSpecies: !sp && !!speciesLabel,
          studbookId,
          name: obj.name || '',
          sex: obj.sex || Sex.UNKNOWN,
          birthDate: obj.birthDate || '',
          weightKg: parseFloat(obj.weightKg) || 0,
          notes: obj.notes || '',
          source: obj.source || 'External',
          sourceDetails: obj.sourceDetails || '',
          latitude: obj.latitude ? parseFloat(obj.latitude) : undefined,
          longitude: obj.longitude ? parseFloat(obj.longitude) : undefined,
          isDeceased: ['true','yes','1'].includes((obj.isDeceased||'').toLowerCase()),
          deathDate: obj.deathDate || '',
          _imageUrl: obj.imageUrl || '',
        };
      }).filter(Boolean);

      setImportErrors(errors);
      setImportRows(rows as any[]);
      setImportPhase('preview');
    };
    reader.readAsText(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) processFile(file);
    else setImportErrors(['Please drop a .csv file.']);
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'individuals_template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const fetchImageViaProxy = async (url: string): Promise<string | null> => {
    try {
      const token = localStorage.getItem('os_token');
      const res = await fetch('/api/proxy-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) return null;
      const { base64, mimeType } = await res.json();
      return `data:${mimeType};base64,${base64}`;
    } catch { return null; }
  };

  const handleConfirmImport = async () => {
    setIsImporting(true);
    const targetProjectId = isAll ? (allProjects[0]?.id || '') : currentProjectId;
    let currentSpecies = [...allSpecies];

    try {
      // ── Step 1: Auto-create missing species via AI ─────────────────────────
      const newSpeciesNames = [...new Set(
        importRows.filter(r => r._isNewSpecies && !r._speciesMatch).map(r => r._speciesLabel)
      )];

      for (const speciesName of newSpeciesNames) {
        setImportStatus(`Creating species: ${speciesName}…`);
        try {
          const aiData = await fetchSpeciesData(speciesName, 'Animal', org?.location || '');
          const newSpecies: Species = {
            id: `sp-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,
            projectId: targetProjectId,
            commonName: speciesName,
            scientificName: aiData?.scientificName || speciesName,
            type: (aiData?.type as SpeciesType) || 'Animal',
            conservationStatus: aiData?.conservationStatus || 'Unknown',
            sexualMaturityAgeYears: aiData?.sexualMaturityAgeYears || 0,
            lifeExpectancyYears: aiData?.lifeExpectancyYears || 0,
            averageAdultWeightKg: aiData?.averageAdultWeightKg || 0,
            breedingSeasonStart: aiData?.breedingSeasonStart,
            breedingSeasonEnd: aiData?.breedingSeasonEnd,
            nativeStatusCountry: aiData?.nativeStatusCountry as any,
            nativeStatusLocal: aiData?.nativeStatusLocal as any,
            imageUrl: generatePattern(speciesName),
          };
          currentSpecies = [...currentSpecies, newSpecies];
          // Mark matching rows with the new species
          setImportRows(prev => prev.map(r =>
            r._speciesLabel.toLowerCase() === speciesName.toLowerCase()
              ? { ...r, _speciesMatch: newSpecies, _isNewSpecies: true }
              : r
          ));
        } catch (e) {
          console.warn(`AI species creation failed for "${speciesName}":`, e);
        }
      }

      // ── Step 2: Fetch individual images ───────────────────────────────────
      const rowsWithUrls = importRows.filter(x => x._imageUrl);
      const rowsWithImages = await Promise.all(importRows.map(async (r, idx) => {
        if (!r._imageUrl) return r;
        setImportStatus(`Fetching image ${rowsWithUrls.indexOf(r) + 1} of ${rowsWithUrls.length}…`);
        const base64Image = await fetchImageViaProxy(r._imageUrl);
        return base64Image ? { ...r, _resolvedImage: base64Image } : r;
      }));

      // ── Step 2b: Set species image — use individual photo or AI-generate ──
      const updatedSpecies = await Promise.all(currentSpecies.map(async sp => {
        // Only process newly-created species (ones without a real image yet)
        const isNew = newSpeciesNames.some(n => n.toLowerCase() === sp.commonName.toLowerCase());
        if (!isNew) return sp;

        // Check if any imported individual for this species has a resolved image
        const indWithImage = rowsWithImages.find(r => r._speciesMatch?.id === sp.id && r._resolvedImage);
        if (indWithImage) {
          return { ...sp, imageUrl: indWithImage._resolvedImage };
        }

        // No individual image — AI-generate one
        try {
          setImportStatus(`Generating image for ${sp.commonName}…`);
          const aiImage = await generateSpeciesImage(sp.commonName, sp.scientificName, sp.type as SpeciesType);
          if (aiImage) return { ...sp, imageUrl: aiImage };
        } catch (e) {
          console.warn(`AI image generation failed for "${sp.commonName}":`, e);
        }
        return sp;
      }));
      currentSpecies = updatedSpecies;
      await saveSpecies(currentSpecies);
      setAllSpecies(currentSpecies);

      // ── Step 3: Save individuals ───────────────────────────────────────────
      setImportStatus('Saving individuals…');
      const latestRows = rowsWithImages.map(r => {
        if (r._speciesMatch) return r;
        const matched = currentSpecies.find(s =>
          s.commonName.toLowerCase() === r._speciesLabel.toLowerCase() ||
          s.scientificName.toLowerCase() === r._speciesLabel.toLowerCase()
        );
        return matched ? { ...r, _speciesMatch: matched } : r;
      });

      const newInds: Individual[] = latestRows
        .filter(r => r._speciesMatch)
        .map(r => ({
          id: `ind-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
          projectId: targetProjectId,
          speciesId: r._speciesMatch.id,
          studbookId: r.studbookId,
          name: r.name || `${r._speciesMatch.commonName} #${r.studbookId}`,
          sex: r.sex as Sex,
          birthDate: r.birthDate,
          weightKg: r.weightKg,
          notes: r.notes,
          source: r.source,
          sourceDetails: r.sourceDetails,
          latitude: r.latitude,
          longitude: r.longitude,
          isDeceased: r.isDeceased,
          deathDate: r.deathDate,
          imageUrl: r._resolvedImage || undefined,
        } as Individual));

      const updated = [...allIndividuals, ...newInds];
      setAllIndividuals(updated);
      await saveIndividuals(updated);

      setShowImport(false);
      setImportRows([]);
      setImportPhase('upload');
    } finally {
      setIsImporting(false);
      setImportStatus('');
    }
  };

  useEffect(() => {
    setAllIndividuals(getIndividuals());
    setAllSpecies(getSpecies());
    const projs = getProjects();
    setAllProjects(projs);
    setAllEnclosures(getEnclosures());
    const currentOrg = getOrg();
    setOrg(currentOrg);

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
        setAddLocation(!!(indToEdit.latitude || indToEdit.longitude));
        setShowForm(true);
        window.history.replaceState({}, document.title);
      }
    }
  }, [locState, allIndividuals, allSpecies]);

  // Form Map Initialization
  useEffect(() => {
    if (showForm && addLocation && formMapRef.current && !formMapInstance.current) {
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
  }, [showForm, addLocation, org]);

  const [formData, setFormData] = useState<Partial<Individual>>({
    speciesId: '', projectId: currentProjectId === 'ALL_PROJECTS' ? '' : currentProjectId, enclosureId: '', studbookId: '', name: '', sex: Sex.UNKNOWN, birthDate: '', weightKg: 0, sireId: '', damId: '', notes: '', imageUrl: '', isDeceased: false, source: 'Bred in house', latitude: undefined, longitude: undefined
  });

  const isAll = currentProjectId === 'ALL_PROJECTS';
  const filtered = (isAll ? allIndividuals : allIndividuals.filter(ind => ind.projectId === currentProjectId)).filter(ind => {
    const matchesSearch = (ind.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || (ind.studbookId || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSpecies = !filterSpeciesId || ind.speciesId === filterSpeciesId;
    return matchesSearch && matchesSpecies;
  });

  useEffect(() => {
    if (viewMode !== 'map' || !overviewMapRef.current) return;
    if (overviewMapInstance.current) { overviewMapInstance.current.remove(); overviewMapInstance.current = null; }
    const located = filtered.filter(i => i.latitude != null && i.longitude != null);
    const map = L.map(overviewMapRef.current);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(map);
    overviewMapInstance.current = map;
    if (located.length > 0) {
      const bounds: any[] = [];
      located.forEach(ind => {
        const sp = allSpecies.find(s => s.id === ind.speciesId);
        const marker = L.marker([ind.latitude, ind.longitude]).addTo(map);
        marker.bindPopup(`<strong>${ind.name}</strong><br/><em>${sp?.commonName || ''}</em><br/><span style="font-size:10px;color:#64748b">${ind.studbookId}</span>`);
        bounds.push([ind.latitude, ind.longitude]);
      });
      map.fitBounds(bounds, { padding: [40, 40] });
    } else {
      map.setView([20, 0], 2);
    }
    setTimeout(() => map.invalidateSize(), 100);
    return () => { if (overviewMapInstance.current) { overviewMapInstance.current.remove(); overviewMapInstance.current = null; } };
  }, [viewMode, filtered.length]);

  const availableSpeciesForForm = allSpecies.filter(s => isAll ? (formData.projectId ? s.projectId === formData.projectId : true) : s.projectId === currentProjectId);
  const selectedSpecies = allSpecies.find(s => s.id === formData.speciesId);
  const isPlant = selectedSpecies?.type === 'Plant';
  const isDioecious = selectedSpecies?.plantClassification === 'Dioecious';
  const showSexField = !isPlant || isDioecious;
  const showEnclosureField = !!org?.enableEnclosures;

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
      latitude: undefined,
      longitude: undefined
    });
    setSpeciesSearchQuery('');
    setAddLocation(false);
    setShowForm(true);
  };

  const handleQuickSpeciesSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickSpeciesData.commonName) return;
    
    setIsQuickSpeciesLoading(true);
    setQuickSpeciesStatus('Researching biology...');
    try {
        const targetProjectId = isAll ? formData.projectId : currentProjectId;
        if (!targetProjectId) throw new Error("Select a project first.");

        // AI Enrichment in the background
        let enrichedData: Partial<Species> = {};
        try {
            const aiResult = await fetchSpeciesData(quickSpeciesData.commonName, quickSpeciesData.type as SpeciesType, org?.location || '');
            if (aiResult) enrichedData = aiResult;
        } catch (e) {
            console.warn("AI enrichment failed for quick add, falling back to manual input.");
        }

        // Image enrichment
        setQuickSpeciesStatus('Finding scientific illustration...');
        let enrichedImage = '';
        try {
            const searchName = enrichedData.scientificName || quickSpeciesData.scientificName || quickSpeciesData.commonName!;
            enrichedImage = await fetchWikimediaImage(searchName) || '';
            if (!enrichedImage) {
                enrichedImage = await generateSpeciesImage(quickSpeciesData.commonName!, searchName, quickSpeciesData.type as SpeciesType) || '';
            }
        } catch (e) {
            console.warn("Image retrieval failed for quick add.");
        }

        const newSpecies: Species = {
          ...quickSpeciesData as Species,
          ...enrichedData,
          id: `sp-${Date.now()}`,
          projectId: targetProjectId,
          scientificName: quickSpeciesData.scientificName || enrichedData.scientificName || quickSpeciesData.commonName!,
          imageUrl: enrichedImage || generatePattern(quickSpeciesData.commonName!),
          sexualMaturityAgeYears: Number(enrichedData.sexualMaturityAgeYears || quickSpeciesData.sexualMaturityAgeYears || 0),
          lifeExpectancyYears: Number(enrichedData.lifeExpectancyYears || quickSpeciesData.lifeExpectancyYears || 0),
          averageAdultWeightKg: Number(enrichedData.averageAdultWeightKg || quickSpeciesData.averageAdultWeightKg || 0)
        };

        const updatedSpecies = [...allSpecies, newSpecies];
        await saveSpecies(updatedSpecies);
        setAllSpecies(updatedSpecies);
        
        // Auto-select the newly created species
        setFormData(prev => ({ ...prev, speciesId: newSpecies.id }));
        setSpeciesSearchQuery(newSpecies.commonName);
        setShowQuickSpeciesModal(false);
    } catch (err: any) {
        alert(err.message);
    } finally {
        setIsQuickSpeciesLoading(false);
        setQuickSpeciesStatus('');
    }
  };

  const handleQuickSpeciesAutofill = async () => {
    if (!quickSpeciesData.commonName) return;
    setIsQuickSpeciesLoading(true);
    setQuickSpeciesStatus('Analyzing species taxonomy...');
    try {
      const data = await fetchSpeciesData(quickSpeciesData.commonName, quickSpeciesData.type as SpeciesType, org?.location || '');
      if (data) {
        setQuickSpeciesData(prev => ({ ...prev, ...data }));
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsQuickSpeciesLoading(false);
      setQuickSpeciesStatus('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.speciesId || !formData.studbookId) return;
    
    let finalName = formData.name || '';
    if (isPlant && !finalName) {
      finalName = formData.studbookId || `plant-${Date.now()}`;
    }

    if (!finalName && !isPlant) {
      alert("Name is required for Fauna records.");
      return;
    }

    const targetProjectId = isAll ? formData.projectId : currentProjectId;
    if (!targetProjectId) { alert("Please select a project."); return; }

    setIsSubmitting(true);
    try {
        const entry: Individual = {
            ...formData as Individual,
            name: finalName,
            id: editingId || `ind-${Date.now()}`,
            projectId: targetProjectId,
            weightKg: Number(formData.weightKg || 0),
            latitude: addLocation ? formData.latitude : undefined,
            longitude: addLocation ? formData.longitude : undefined
        };
        const updated = editingId ? allIndividuals.map(i => i.id === editingId ? entry : i) : [...allIndividuals, entry];
        setAllIndividuals(updated);
        await saveIndividuals(updated); 
        setShowForm(false);
        setEditingId(null);
    } catch (err) { alert("Database Error: Could not save individual."); }
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
            {filtered.some(i => i.latitude != null && i.longitude != null) && (
              <button onClick={() => setViewMode('map')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'map' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}><MapIcon2 size={18} /></button>
            )}
          </div>
          <input ref={importFileRef} type="file" accept=".csv" className="hidden" onChange={handleFileSelect} />
          <button onClick={() => { setImportPhase('upload'); setImportRows([]); setImportErrors([]); setShowImport(true); }} className="flex items-center justify-center gap-2 bg-white border border-slate-300 hover:border-emerald-400 hover:text-emerald-700 text-slate-600 px-4 py-2 rounded-lg font-medium shadow-sm transition-all" title="Import individuals from CSV"><Upload size={18} /><span className="hidden sm:inline">Import</span></button>
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
            const isPlantInd = sp?.type === 'Plant';
            const displayName = isPlantInd ? ind.studbookId : ind.name;
            const displayImg = ind.imageUrl || sp?.imageUrl || generatePattern(ind.name);
            return (
              <div key={ind.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all group flex flex-col">
                <Link to={`/individuals/${ind.id}`} className="h-48 bg-slate-100 relative overflow-hidden block">
                  <img src={displayImg} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt={displayName} />
                  {!isPlantInd && <div className={`absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-bold text-white uppercase ${ind.sex === Sex.MALE ? 'bg-blue-600' : ind.sex === Sex.FEMALE ? 'bg-pink-600' : 'bg-slate-600'}`}>{ind.sex}</div>}
                </Link>
                <div className="p-4 flex-1">
                  <Link to={`/individuals/${ind.id}`} className="font-bold text-slate-900 group-hover:text-emerald-700 transition-colors truncate block">{displayName}</Link>
                  <p className="text-xs text-slate-500 mb-2 truncate">{sp?.commonName}</p>
                  <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-50">
                    {!isPlantInd && <span className="text-[10px] font-mono text-slate-400">{ind.studbookId}</span>}
                    <button onClick={() => { setEditingId(ind.id); setFormData({...ind}); setSpeciesSearchQuery(sp?.commonName || ''); setShowForm(true); }} className="ml-auto text-slate-400 hover:text-blue-600"><Pencil size={14}/></button>
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
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">Individual</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">Species</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">ID</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase text-right">Actions</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                 {filtered.map(ind => {
                    const sp = allSpecies.find(s => s.id === ind.speciesId);
                    const isPlantInd = sp?.type === 'Plant';
                    const displayName = isPlantInd ? ind.studbookId : ind.name;
                    return (
                       <tr key={ind.id} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-6 py-4 font-bold text-slate-900">{displayName}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{sp?.commonName}</td>
                          <td className="px-6 py-4 font-mono text-[10px] text-slate-400">{isPlantInd ? '' : ind.studbookId}</td>
                          <td className="px-6 py-4 text-right">
                             <div className="flex justify-end gap-2">
                                <Link to={`/individuals/${ind.id}`} className="p-1.5 text-slate-400 hover:text-emerald-600"><Plus size={16}/></Link>
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

      {viewMode === 'map' && (
        <div ref={overviewMapRef} className="w-full rounded-xl overflow-hidden border border-slate-200 shadow-sm" style={{ height: '520px' }} />
      )}

      {/* ── Import Modal ─────────────────────────────────────────────────── */}
      {showImport && (
        <div className="fixed inset-0 z-[4500] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8 flex flex-col animate-in zoom-in duration-200">

            {/* Header */}
            <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg"><FileSpreadsheet size={20}/></div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Import Individuals</h3>
                  <p className="text-sm text-slate-500">
                    {importPhase === 'upload' ? 'Upload a CSV file to bulk-import individuals' : `${importRows.length} row${importRows.length !== 1 ? 's' : ''} detected`}
                  </p>
                </div>
              </div>
              <button onClick={() => { setShowImport(false); setImportPhase('upload'); setImportRows([]); setImportErrors([]); }} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full"><XIcon size={24}/></button>
            </div>

            <div className="p-6 space-y-5 flex-1 overflow-y-auto max-h-[70vh]">

              {/* ── Upload phase ─────────────────────────────────────────── */}
              {importPhase === 'upload' && (<>

                {/* Drag-and-drop zone */}
                <input ref={importFileRef} type="file" accept=".csv" className="hidden" onChange={handleFileSelect} />
                <div
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => importFileRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all
                    ${isDragging ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:border-emerald-300 hover:bg-emerald-50/50'}`}
                >
                  <div className={`p-4 rounded-full transition-colors ${isDragging ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                    <Upload size={32} className={isDragging ? 'text-emerald-600' : 'text-slate-400'} />
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-slate-700">{isDragging ? 'Drop your CSV here' : 'Drag & drop your CSV file here'}</p>
                    <p className="text-sm text-slate-400 mt-1">or <span className="text-emerald-600 font-semibold">click to browse</span></p>
                  </div>
                  <p className="text-[11px] text-slate-400">.csv files only</p>
                </div>

                {/* Template download */}
                <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl p-4">
                  <div>
                    <p className="font-semibold text-blue-800 text-sm">Need a template?</p>
                    <p className="text-xs text-blue-600 mt-0.5">Download our pre-formatted CSV template with example rows</p>
                  </div>
                  <button onClick={downloadTemplate} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors shrink-0">
                    <FileSpreadsheet size={15}/> Download Template
                  </button>
                </div>

                {/* Field reference */}
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Field Reference</p>
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-[10px] font-black text-slate-400 uppercase">Column Name</th>
                          <th className="px-4 py-2.5 text-left text-[10px] font-black text-slate-400 uppercase">Required?</th>
                          <th className="px-4 py-2.5 text-left text-[10px] font-black text-slate-400 uppercase">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {FIELD_REFERENCE.map(f => (
                          <tr key={f.col} className="hover:bg-slate-50">
                            <td className="px-4 py-2 font-mono text-xs font-semibold text-slate-700">{f.col}</td>
                            <td className="px-4 py-2">
                              {f.required === true
                                ? <span className="text-[10px] font-black bg-red-100 text-red-600 px-2 py-0.5 rounded-full uppercase">Required</span>
                                : f.required === 'either'
                                  ? <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full uppercase">Either*</span>
                                  : <span className="text-[10px] font-black bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full uppercase">Optional</span>
                              }
                            </td>
                            <td className="px-4 py-2 text-xs text-slate-500">{f.notes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
                    <Sparkles size={12} className="text-emerald-500"/>
                    If a species isn't found in your database, it will be <strong>auto-created using AI</strong> — no manual setup needed.
                  </p>
                </div>
              </>)}

              {/* ── Preview phase ─────────────────────────────────────────── */}
              {importPhase === 'preview' && (<>

                {importErrors.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1">
                    {importErrors.map((e, i) => (
                      <p key={i} className="text-sm text-amber-800 flex items-center gap-2"><AlertTriangle size={14} className="shrink-0"/>{e}</p>
                    ))}
                  </div>
                )}

                {/* Summary badges */}
                <div className="flex flex-wrap gap-3">
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 text-emerald-700 px-3 py-2 rounded-xl text-sm font-bold">
                    <CheckCircle2 size={15}/>
                    {importRows.filter(r => r._speciesMatch).length} matched
                  </div>
                  {importRows.filter(r => r._isNewSpecies && !r._speciesMatch).length > 0 && (
                    <div className="flex items-center gap-2 bg-purple-50 border border-purple-100 text-purple-700 px-3 py-2 rounded-xl text-sm font-bold">
                      <Sparkles size={15}/>
                      {[...new Set(importRows.filter(r => r._isNewSpecies && !r._speciesMatch).map(r => r._speciesLabel))].length} new species — AI will create
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase">#</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase">Status</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase">Name / ID</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase">Species</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase">Sex</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase">Birth Date</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase">Weight</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase">Image</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {importRows.map((row, i) => {
                        const matched = !!row._speciesMatch;
                        const isNew = row._isNewSpecies && !matched;
                        return (
                          <tr key={i} className={`transition-colors ${isNew ? 'bg-purple-50 hover:bg-purple-100' : 'hover:bg-slate-50'}`}>
                            <td className="px-4 py-2.5 text-[10px] text-slate-400 font-mono">{row._row}</td>
                            <td className="px-4 py-2.5">
                              {matched
                                ? <CheckCircle2 size={15} className="text-emerald-500"/>
                                : <span title="Species not found — AI will create it"><Sparkles size={15} className="text-purple-500"/></span>
                              }
                            </td>
                            <td className="px-4 py-2.5">
                              <p className="font-semibold text-slate-800 truncate max-w-[140px]">{row.name || <em className="text-slate-400 not-italic text-xs">auto</em>}</p>
                              <p className="text-[10px] font-mono text-slate-400">{row.studbookId}</p>
                            </td>
                            <td className="px-4 py-2.5">
                              {matched
                                ? <span className="text-emerald-700 font-medium">{row._speciesMatch.commonName}</span>
                                : <span className="text-purple-600 text-xs font-medium flex items-center gap-1"><Sparkles size={11}/> {row._speciesLabel}</span>
                              }
                            </td>
                            <td className="px-4 py-2.5 text-slate-600">{row.sex || '—'}</td>
                            <td className="px-4 py-2.5 text-slate-600">{row.birthDate || '—'}</td>
                            <td className="px-4 py-2.5 text-slate-600">{row.weightKg > 0 ? `${row.weightKg} kg` : '—'}</td>
                            <td className="px-4 py-2.5">
                              {row._imageUrl
                                ? <span className="flex items-center gap-1 text-[10px] text-blue-600 font-semibold"><ImageIcon size={12}/> Linked</span>
                                : <span className="text-[10px] text-slate-300">—</span>
                              }
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {importRows.some(r => r._isNewSpecies && !r._speciesMatch) && (
                  <p className="text-xs text-purple-600 flex items-start gap-1.5">
                    <Sparkles size={13} className="shrink-0 mt-0.5"/>
                    Rows marked with <Sparkles size={11} className="inline mx-0.5"/> have unrecognised species — they will be <strong>automatically created using AI</strong> and added to your species list before the individuals are imported.
                  </p>
                )}

                {isImporting && importStatus && (
                  <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                    <Loader2 size={18} className="animate-spin text-emerald-600 shrink-0"/>
                    <p className="text-sm font-medium text-emerald-800">{importStatus}</p>
                  </div>
                )}
              </>)}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-100 flex justify-between items-center shrink-0">
              {importPhase === 'preview' ? (
                <>
                  <button onClick={() => { setImportPhase('upload'); setImportRows([]); setImportErrors([]); }} className="text-sm text-slate-500 hover:text-slate-700 font-medium flex items-center gap-1.5">← Choose a different file</button>
                  <div className="flex gap-3">
                    <button onClick={() => { setShowImport(false); setImportPhase('upload'); setImportRows([]); }} className="px-5 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold">Cancel</button>
                    <button
                      onClick={handleConfirmImport}
                      disabled={isImporting || importRows.length === 0}
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-xl font-bold shadow-sm disabled:opacity-50 transition-all"
                    >
                      {isImporting
                        ? <><Loader2 size={16} className="animate-spin"/> Working…</>
                        : <><Upload size={16}/> Import {importRows.length} Individual{importRows.length !== 1 ? 's' : ''}</>
                      }
                    </button>
                  </div>
                </>
              ) : (
                <button onClick={() => { setShowImport(false); }} className="ml-auto px-5 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold">Close</button>
              )}
            </div>

          </div>
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
                            <div className="flex gap-2">
                               <div className="relative flex-1">
                                  <input className="w-full px-4 py-2 mt-1 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" value={speciesSearchQuery} onChange={e => { setSpeciesSearchQuery(e.target.value); setIsSpeciesDropdownOpen(true); }} onFocus={() => setIsSpeciesDropdownOpen(true)} placeholder="Search species..." required />
                                  {isSpeciesDropdownOpen && (
                                     <div className="absolute top-full left-0 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl mt-1 max-h-48 overflow-auto py-2">
                                        <button type="button" onClick={() => setShowQuickSpeciesModal(true)} className="w-full text-left px-4 py-2 hover:bg-emerald-50 text-emerald-700 text-sm font-bold flex items-center gap-2 border-b border-slate-100">
                                           <Plus size={14}/> Create New Species...
                                        </button>
                                        {availableSpeciesForForm.filter(s => s.commonName.toLowerCase().includes(speciesSearchQuery.toLowerCase())).map(s => (
                                           <button key={s.id} type="button" className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm flex justify-between items-center" onClick={() => { setFormData({...formData, speciesId: s.id}); setSpeciesSearchQuery(s.commonName); setIsSpeciesDropdownOpen(false); }}>
                                              <span className="font-bold">{s.commonName}</span>
                                              <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-black tracking-widest ${s.type === 'Plant' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{s.type}</span>
                                           </button>
                                        ))}
                                     </div>
                                  )}
                               </div>
                               <button type="button" onClick={() => setShowQuickSpeciesModal(true)} title="Quick Add Species" className="mt-1 p-2 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-200 hover:bg-emerald-100 transition-colors"><Plus size={20}/></button>
                            </div>
                         </div>
                         <div><label className="text-xs font-bold text-slate-500 uppercase">{t('studbookId')} <span className="text-red-500">*</span></label><input className="w-full px-4 py-2 mt-1 border border-slate-300 rounded-lg outline-none font-mono" value={formData.studbookId} onChange={e => setFormData({...formData, studbookId: e.target.value})} required /></div>
                         <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">{t('name')} {!isPlant && <span className="text-red-500">*</span>}</label>
                            <input className="w-full px-4 py-2 mt-1 border border-slate-300 rounded-lg outline-none font-bold placeholder:font-normal" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder={isPlant ? "(Optional for plants)" : "Full Name"} required={!isPlant} />
                         </div>
                         {showSexField && (
                            <div><label className="text-xs font-bold text-slate-500 uppercase">{isPlant ? 'Genetic Sex' : 'Sex'}</label><select className="w-full px-4 py-2 mt-1 border border-slate-300 rounded-lg outline-none bg-white" value={formData.sex} onChange={e => setFormData({...formData, sex: e.target.value as Sex})}><option value={Sex.UNKNOWN}>{t('unknownSex')}</option><option value={Sex.MALE}>{t('males')}</option><option value={Sex.FEMALE}>{t('females')}</option></select></div>
                         )}
                         <div><label className="text-xs font-bold text-slate-500 uppercase">{isPlant ? 'Planted Date' : 'Birth Date'}</label><input type="date" className="w-full px-4 py-2 mt-1 border border-slate-300 rounded-lg outline-none" value={formData.birthDate} onChange={e => setFormData({...formData, birthDate: e.target.value})} /></div>
                         <div><label className="text-xs font-bold text-slate-500 uppercase">{isPlant ? 'Current Height (cm)' : 'Weight (kg)'}</label><input type="number" step="0.01" className="w-full px-4 py-2 mt-1 border border-slate-300 rounded-lg outline-none" value={formData.weightKg} onChange={e => setFormData({...formData, weightKg: parseFloat(e.target.value)})} /></div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                         <div><label className="text-xs font-bold text-slate-500 uppercase">{isPlant ? 'Propagation Method' : 'Acquisition Source'}</label><select className="w-full px-4 py-2 mt-1 border border-slate-300 rounded-lg outline-none bg-white" value={formData.source} onChange={e => setFormData({...formData, source: e.target.value as any})}><option value="Bred in house">{isPlant ? 'In-house Propagation' : 'Bred in house'}</option><option value="Captive Bred">{isPlant ? 'Gifted / Exchange' : 'Captive Bred'}</option><option value="Wild Caught">{isPlant ? 'Wild Collected' : 'Wild Caught'}</option><option value="Other">Other / Unknown</option></select></div>
                         {showEnclosureField && (
                            <div><label className="text-xs font-bold text-slate-500 uppercase">{isPlant ? 'Assigned Area' : 'Enclosure / Area'}</label><select className="w-full px-4 py-2 mt-1 border border-slate-300 rounded-lg outline-none bg-white" value={formData.enclosureId} onChange={e => setFormData({...formData, enclosureId: e.target.value})}><option value="">None Assigned</option>{allEnclosures.filter(e => e.projectId === (isAll ? formData.projectId : currentProjectId)).map(enc => <option key={enc.id} value={enc.id}>{enc.name}</option>)}</select></div>
                         )}
                      </div>

                      <div className="space-y-4 pt-4 border-t border-slate-100">
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div><label className="text-xs font-bold text-slate-500 uppercase">{isPlant ? 'Lineage A (Parent)' : 'Sire ID'}</label><input className="w-full px-4 py-2 mt-1 border border-slate-300 rounded-lg outline-none" value={formData.sireId} onChange={e => setFormData({...formData, sireId: e.target.value})} placeholder="Parent ID or Source" /></div>
                            <div><label className="text-xs font-bold text-slate-500 uppercase">{isPlant ? 'Lineage B (Parent)' : 'Dam ID'}</label><input className="w-full px-4 py-2 mt-1 border border-slate-300 rounded-lg outline-none" value={formData.damId} onChange={e => setFormData({...formData, damId: e.target.value})} placeholder="Parent ID or Source" /></div>
                         </div>
                      </div>

                      <div className="pt-4 border-t border-slate-100">
                         <label className="text-xs font-bold text-slate-500 uppercase">Notes & Biological History</label>
                         <textarea className="w-full px-4 py-2 mt-1 border border-slate-300 rounded-lg outline-none" rows={3} value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="Add any relevant history or specific traits..." />
                      </div>

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
                         <div className="flex items-center justify-between">
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><MapPin size={14} className="text-red-500"/> Physical Mapping</h4>
                            <label className="flex items-center gap-2 cursor-pointer">
                               <span className="text-[10px] font-bold text-slate-400 uppercase">Pin to map</span>
                               <div className="relative inline-flex items-center">
                                  <input type="checkbox" className="sr-only peer" checked={addLocation} onChange={(e) => setAddLocation(e.target.checked)} />
                                  <div className="w-9 h-5 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                               </div>
                            </label>
                         </div>
                         
                         {addLocation ? (
                            <div className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-4">
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
                         ) : (
                            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-8 text-center">
                               <MapIcon2 className="mx-auto mb-2 text-slate-300 opacity-50" size={32} />
                               <p className="text-xs text-slate-400 font-medium">Location data is disabled for this record.</p>
                            </div>
                         )}
                      </div>
                   </div>
                </div>

                <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 shrink-0">
                   <button type="button" onClick={() => setShowForm(false)} className="px-8 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">Cancel</button>
                   <button type="submit" disabled={isSubmitting} className="bg-emerald-600 text-white px-10 py-3 rounded-xl font-bold shadow-lg hover:bg-emerald-700">
                     {isSubmitting ? <Loader2 size={20} className="animate-spin" /> : <Save size={20}/>} {editingId ? "Update Record" : "Register Individual"}
                   </button>
                </div>
             </form>
          </div>
        </div>
      )}

      {/* Quick Add Species Modal */}
      {showQuickSpeciesModal && (
        <div className="fixed inset-0 z-[5000] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
           <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-200 border border-slate-200">
              <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                 <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl"><Dna size={24}/></div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">Quick Add Species</h3>
                 </div>
                 <button onClick={() => setShowQuickSpeciesModal(false)} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors"><XIcon size={24}/></button>
              </div>
              <form onSubmit={handleQuickSpeciesSubmit} className="p-8 space-y-6">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1">
                       <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">Common Name</label>
                       <div className="flex gap-2">
                          <input className="flex-1 px-4 py-2 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold" value={quickSpeciesData.commonName} onChange={e => setQuickSpeciesData({...quickSpeciesData, commonName: e.target.value})} placeholder="e.g. Red Panda" required />
                          <button type="button" onClick={handleQuickSpeciesAutofill} disabled={!quickSpeciesData.commonName || isQuickSpeciesLoading} className="p-2 bg-purple-50 text-purple-600 border border-purple-100 rounded-xl hover:bg-purple-100 transition-all shadow-sm">
                             {isQuickSpeciesLoading ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20}/>}
                          </button>
                       </div>
                    </div>
                    <div className="space-y-1">
                       <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">Scientific Name</label>
                       <input className="w-full px-4 py-2 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 italic font-serif" value={quickSpeciesData.scientificName} onChange={e => setQuickSpeciesData({...quickSpeciesData, scientificName: e.target.value})} placeholder="e.g. Ailurus fulgens" />
                    </div>
                    <div className="space-y-1">
                       <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">Kingdom</label>
                       <select className="w-full px-4 py-2 border border-slate-300 rounded-xl outline-none bg-white font-bold" value={quickSpeciesData.type} onChange={e => setQuickSpeciesData({...quickSpeciesData, type: e.target.value as SpeciesType})}>
                          <option value="Animal">Fauna</option>
                          <option value="Plant">Flora</option>
                       </select>
                    </div>
                    <div className="space-y-1">
                       <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">Conservation Status</label>
                       <input className="w-full px-4 py-2 border border-slate-300 rounded-xl outline-none" value={quickSpeciesData.conservationStatus} onChange={e => setQuickSpeciesData({...quickSpeciesData, conservationStatus: e.target.value})} placeholder="e.g. Endangered" />
                    </div>
                 </div>
                 
                 <div className="pt-6 border-t border-slate-100 flex flex-col gap-4">
                    {isQuickSpeciesLoading && (
                       <div className="flex items-center justify-center gap-3 py-2 text-emerald-600 font-bold animate-pulse">
                          <Loader2 size={20} className="animate-spin" />
                          <span className="text-xs uppercase tracking-widest">{quickSpeciesStatus || 'Processing...'}</span>
                       </div>
                    )}
                    <div className="flex gap-3">
                       <button type="button" onClick={() => setShowQuickSpeciesModal(false)} className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-2xl transition-all">Cancel</button>
                       <button type="submit" disabled={isQuickSpeciesLoading || !quickSpeciesData.commonName} className="flex-[2] py-3 bg-slate-900 text-white font-bold rounded-2xl shadow-xl hover:bg-black transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                          {isQuickSpeciesLoading ? <Loader2 size={20} className="animate-spin" /> : <Save size={20}/>} Create & Use Species
                       </button>
                    </div>
                 </div>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};
export default IndividualManager;