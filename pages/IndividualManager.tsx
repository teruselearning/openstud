
import React, { useState, useEffect, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getSpecies, getIndividuals, saveIndividuals, generatePattern, saveSpecies, sendMockNotification, getSession, getOrg } from '../services/storage';
import { fetchSpeciesData } from '../services/geminiService';
import { Species, Individual, Sex, AcquisitionSource, SpeciesType, Organization, WeightRecord, GrowthRecord } from '../types';
import { Plus, Camera, Search, Dna, PawPrint, Pencil, X, Filter, Trash2, AlertTriangle, MapPin, Users, LayoutGrid, List, ArrowRight, ArrowDownAZ, ArrowUpAZ, Calendar, Hash, Briefcase, RefreshCw, Sprout, Loader2, FileSpreadsheet, Download, Upload, CheckCircle, AlertCircle, Scale, FileText, ChevronDown } from 'lucide-react';
import { LanguageContext } from '../App';

type StatusFilter = 'current' | 'deceased' | 'all';
type SortField = 'name' | 'studbookId' | 'birthDate';

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
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // Import State
  const [showImportMenu, setShowImportMenu] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showLogImportModal, setShowLogImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importLogs, setImportLogs] = useState<string[]>([]);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSpeciesId, setFilterSpeciesId] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('current');
  const [highlightIds, setHighlightIds] = useState<string[]>([]);

  // Sorting
  const [sortBy, setSortBy] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [editingId, setEditingId] = useState<string | null>(null);
  
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

  // Form State
  const [formData, setFormData] = useState<Partial<Individual>>({
    speciesId: '',
    studbookId: '',
    name: '',
    sex: Sex.UNKNOWN,
    birthDate: '',
    weightKg: 0,
    notes: '',
    imageUrl: '',
    dnaSequence: undefined,
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

  // Handle External Edit Request (from Detail Page)
  useEffect(() => {
    if (location.state?.editId && allIndividuals.length > 0) {
      const ind = allIndividuals.find(i => i.id === location.state.editId);
      if (ind) {
        // Set return path if provided in state
        if (location.state.returnTo) {
           setReturnPath(location.state.returnTo);
        }
        
        handleEdit(ind);
        
        // Clear state to prevent re-opening on refresh, but keep edit mode
        navigate(location.pathname, { replace: true, state: {} });
      }
    } else if (location.state?.highlightIds) {
      setHighlightIds(location.state.highlightIds);
      setFilterStatus('all'); 
    }
  }, [location.state, allIndividuals]);

  // Filter Data by Project
  const projectIndividuals = allIndividuals.filter(ind => ind.projectId === currentProjectId);
  const projectSpecies = allSpecies.filter(s => s.projectId === currentProjectId);

  const clearHighlights = () => {
    setHighlightIds([]);
    setFilterStatus('current');
    window.history.replaceState({}, document.title);
  };

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
    setFormData({
      ...formData,
      studbookId: generateUniqueId(),
      speciesId: '',
      name: '',
      birthDate: new Date().toISOString().split('T')[0] // Default to today
    });
  };

  // --- CSV Import Functions ---

  const handleDownloadTemplate = () => {
    const headers = [
      'studbookId', 'commonName', 'type', 'name', 'imageUrl', 'scientificName', 'sex', 'birthDate', 'weightKg', 'sireStudbookId', 'damStudbookId', 'notes'
    ];
    const example = [
      'SB-2024-001', 'Sumatran Tiger', 'Animal', 'Raja', '', 'Panthera tigris sumatrae', 'Male', '2020-05-15', '120', '', '', 'Example Notes'
    ];
    const csvContent = [headers.join(','), example.join(',')].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'individual_import_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadLogTemplate = () => {
    const headers = ['studbookId', 'date', 'weightKg', 'heightCm', 'note'];
    const example = ['SB-1001', '2023-05-12', '130', '', 'Annual weigh-in'];
    const csvContent = [headers.join(','), example.join(',')].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'log_import_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Simple CSV parser that respects quotes
  const parseCSVLine = (text: string) => {
    const result = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        inQuote = !inQuote;
      } else if (char === ',' && !inQuote) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const processGoogleDriveLink = (url: string) => {
    if (!url) return '';
    
    // Normalize URL (handle missing protocol)
    let safeUrl = url.trim();
    if (!safeUrl.match(/^https?:\/\//i)) {
       if (safeUrl.startsWith('drive.google') || safeUrl.startsWith('google.com')) {
          safeUrl = 'https://' + safeUrl;
       }
    }

    try {
       const urlObj = new URL(safeUrl);
       
       // Case: ?id=ID (e.g., google.com/open?id=...)
       const idParam = urlObj.searchParams.get('id');
       if (idParam) {
          return `https://drive.google.com/uc?export=view&id=${idParam}`;
       }
       
       // Case: /file/d/ID/... (e.g., drive.google.com/file/d/...)
       const pathSegments = urlObj.pathname.split('/');
       const dIndex = pathSegments.indexOf('d');
       if (dIndex !== -1 && dIndex + 1 < pathSegments.length) {
          return `https://drive.google.com/uc?export=view&id=${pathSegments[dIndex + 1]}`;
       }
    } catch (e) {
       // Fallback to regex if URL parsing fails
       const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
       if (idMatch && idMatch[1]) return `https://drive.google.com/uc?export=view&id=${idMatch[1]}`;
       
       const idParamMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
       if (idParamMatch && idParamMatch[1]) return `https://drive.google.com/uc?export=view&id=${idParamMatch[1]}`;
    }
    
    return url;
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportLogs([]);
    
    const addLog = (msg: string) => setImportLogs(prev => [...prev, msg]);
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim() !== '');
        
        if (lines.length < 2) {
          addLog("Error: Empty or invalid CSV file.");
          setImporting(false);
          return;
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        
        // Map header names to keys
        const getIdx = (key: string) => headers.findIndex(h => h === key.toLowerCase());
        
        const colMap = {
          studbookId: getIdx('studbookId'),
          commonName: getIdx('commonName'),
          type: getIdx('type'),
          name: getIdx('name'),
          imageUrl: getIdx('imageUrl'),
          scientificName: getIdx('scientificName'),
          sex: getIdx('sex'),
          birthDate: getIdx('birthDate'),
          weightKg: getIdx('weightKg'),
          sireId: getIdx('sireStudbookId'),
          damId: getIdx('damStudbookId'),
          notes: getIdx('notes')
        };

        if (colMap.studbookId === -1 || colMap.commonName === -1 || colMap.type === -1) {
          addLog("Error: Missing required columns (studbookId, commonName, type). Please use the template.");
          setImporting(false);
          return;
        }

        // Working copies of data
        let currentSpecies = [...allSpecies];
        let currentIndividuals = [...allIndividuals];
        let newIndividualsCount = 0;

        // Iterate rows
        for (let i = 1; i < lines.length; i++) {
          const cols = parseCSVLine(lines[i]);
          if (cols.length < headers.length) continue; // Skip malformed lines

          const commonName = cols[colMap.commonName];
          const studbookId = cols[colMap.studbookId];
          const nameVal = colMap.name !== -1 ? cols[colMap.name] : '';
          // Default name to Studbook ID if empty
          const name = nameVal || studbookId;
          
          if (!commonName || !studbookId) continue;

          // Check if individual exists
          if (currentIndividuals.some(ind => ind.studbookId === studbookId)) {
            addLog(`Skipped: ${studbookId} (Already exists)`);
            continue;
          }

          // --- SPECIES HANDLING ---
          let speciesId = '';
          const existingSpecies = currentSpecies.find(s => 
             s.commonName.toLowerCase() === commonName.toLowerCase() && s.projectId === currentProjectId
          );

          if (existingSpecies) {
            speciesId = existingSpecies.id;
          } else {
            // Auto-Create Species
            addLog(`Auto-creating species: ${commonName}...`);
            const sciName = colMap.scientificName !== -1 ? cols[colMap.scientificName] : '';
            const typeStr = (colMap.type !== -1 ? cols[colMap.type] : 'Animal');
            const type = (typeStr === 'Plant' || typeStr === 'plant') ? 'Plant' : 'Animal';
            
            // Fetch AI Data
            const locationContext = org ? org.location : '';
            const aiData = await fetchSpeciesData(commonName, type, locationContext);
            
            const newSpecies: Species = {
               id: `sp-${Date.now()}-${i}`, // Add index to avoid collision in fast loop
               projectId: currentProjectId,
               commonName: commonName,
               scientificName: sciName || aiData?.scientificName || commonName,
               type: type,
               conservationStatus: aiData?.conservationStatus || 'Unknown',
               sexualMaturityAgeYears: aiData?.sexualMaturityAgeYears || 0,
               averageAdultWeightKg: aiData?.averageAdultWeightKg || 0,
               lifeExpectancyYears: aiData?.lifeExpectancyYears || 0,
               breedingSeasonStart: aiData?.breedingSeasonStart || 0,
               breedingSeasonEnd: aiData?.breedingSeasonEnd || 0,
               plantClassification: aiData?.plantClassification,
               imageUrl: aiData?.imageUrl || generatePattern(commonName)
            };
            
            currentSpecies.push(newSpecies);
            speciesId = newSpecies.id;
            addLog(`Created species: ${newSpecies.commonName}`);
          }

          // --- INDIVIDUAL CREATION ---
          const sireStudbookId = colMap.sireId !== -1 ? cols[colMap.sireId] : '';
          const damStudbookId = colMap.damId !== -1 ? cols[colMap.damId] : '';
          
          // Lookup parents (only if they exist in current DB - pass 1)
          const sire = sireStudbookId ? currentIndividuals.find(ind => ind.studbookId === sireStudbookId) : undefined;
          const dam = damStudbookId ? currentIndividuals.find(ind => ind.studbookId === damStudbookId) : undefined;

          const sexVal = colMap.sex !== -1 ? cols[colMap.sex] : 'Unknown';
          
          const rawImage = colMap.imageUrl !== -1 ? cols[colMap.imageUrl] : '';
          const imageUrl = processGoogleDriveLink(rawImage) || generatePattern(name);

          const newInd: Individual = {
             id: `ind-${Date.now()}-${i}`,
             projectId: currentProjectId,
             speciesId: speciesId,
             studbookId: studbookId,
             name: name,
             sex: (['Male','Female'].includes(sexVal) ? sexVal : 'Unknown') as Sex,
             birthDate: colMap.birthDate !== -1 ? cols[colMap.birthDate] : '',
             weightKg: colMap.weightKg !== -1 ? Number(cols[colMap.weightKg]) || 0 : 0,
             notes: colMap.notes !== -1 ? cols[colMap.notes] : '',
             imageUrl: imageUrl,
             sireId: sire?.id,
             damId: dam?.id,
             weightHistory: [],
             healthHistory: [],
             growthHistory: [],
             source: 'Other',
             sourceDetails: 'CSV Import'
          };

          currentIndividuals.push(newInd);
          newIndividualsCount++;
          addLog(`Imported: ${name} (${studbookId})`);
        }

        // Save Updates
        setAllSpecies(currentSpecies);
        saveSpecies(currentSpecies);
        setAllIndividuals(currentIndividuals);
        saveIndividuals(currentIndividuals);
        
        addLog(`--- Completed. Imported ${newIndividualsCount} individuals. ---`);

      } catch (err) {
        console.error(err);
        addLog("Critical Error during import.");
      } finally {
        setImporting(false);
        // Don't close modal immediately so user can read logs
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportLogs = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportLogs([]);
    
    const addLog = (msg: string) => setImportLogs(prev => [...prev, msg]);
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim() !== '');
        
        if (lines.length < 2) {
          addLog("Error: Empty or invalid CSV file.");
          setImporting(false);
          return;
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        
        // Map header names to keys
        const getIdx = (key: string) => headers.findIndex(h => h === key.toLowerCase());
        
        const colMap = {
          studbookId: getIdx('studbookid'),
          date: getIdx('date'),
          weightKg: getIdx('weightkg'),
          heightCm: getIdx('heightcm'),
          note: getIdx('note')
        };

        if (colMap.studbookId === -1 || colMap.date === -1) {
          addLog("Error: Missing required columns (studbookId, date). Please use the template.");
          setImporting(false);
          return;
        }

        let currentIndividuals = [...allIndividuals];
        let updatedCount = 0;

        // Iterate rows
        for (let i = 1; i < lines.length; i++) {
          const cols = parseCSVLine(lines[i]);
          if (cols.length < headers.length) continue; 

          const studbookId = cols[colMap.studbookId];
          const date = cols[colMap.date];
          
          if (!studbookId || !date) continue;

          // Find Individual
          const indIndex = currentIndividuals.findIndex(ind => ind.studbookId === studbookId && ind.projectId === currentProjectId);
          if (indIndex === -1) {
             addLog(`Skipped: ${studbookId} (Not found in this project)`);
             continue;
          }

          const ind = { ...currentIndividuals[indIndex] };
          const weightVal = colMap.weightKg !== -1 ? cols[colMap.weightKg] : null;
          const heightVal = colMap.heightCm !== -1 ? cols[colMap.heightCm] : null;
          const note = colMap.note !== -1 ? cols[colMap.note] : '';

          let updated = false;

          // Add Weight Record
          if (weightVal && !isNaN(Number(weightVal))) {
             const newWeight: WeightRecord = {
                id: `w-${Date.now()}-${i}`,
                date: date,
                weightKg: Number(weightVal),
                note: note
             };
             ind.weightHistory = [...(ind.weightHistory || []), newWeight].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
             // Update current weight if log is newer or equal to current records
             ind.weightKg = Number(weightVal); 
             updated = true;
          }

          // Add Growth Record
          if (heightVal && !isNaN(Number(heightVal))) {
             const newGrowth: GrowthRecord = {
                id: `g-${Date.now()}-${i}`,
                date: date,
                heightCm: Number(heightVal),
                note: note
             };
             ind.growthHistory = [...(ind.growthHistory || []), newGrowth].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
             updated = true;
          }

          if (updated) {
             currentIndividuals[indIndex] = ind;
             updatedCount++;
             addLog(`Updated: ${studbookId} (${date})`);
          }
        }

        setAllIndividuals(currentIndividuals);
        saveIndividuals(currentIndividuals);
        
        addLog(`--- Completed. Updated ${updatedCount} records. ---`);

      } catch (err) {
        console.error(err);
        addLog("Critical Error during import.");
      } finally {
        setImporting(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, imageUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDNAUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
     const file = e.target.files?.[0];
     if (file) {
        setFormData(prev => ({ ...prev, dnaSequence: file.name + ' (Uploaded)' }));
     }
  };

  const handleGetCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        setFormData(prev => ({
          ...prev,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        }));
      }, (error) => {
        alert("Error getting location: " + error.message);
      });
    } else {
      alert("Geolocation is not supported by this browser.");
    }
  };

  const handleEdit = (ind: Individual) => {
    setEditingId(ind.id);
    setIsAutoSpecies(false);
    
    // Check if parents are manual strings or IDs
    const sireExists = ind.sireId ? allIndividuals.some(i => i.id === ind.sireId) : false;
    const damExists = ind.damId ? allIndividuals.some(i => i.id === ind.damId) : false;
    
    setIsManualSire(!!ind.sireId && !sireExists);
    setIsManualDam(!!ind.damId && !damExists);

    setFormData({
      speciesId: ind.speciesId,
      studbookId: ind.studbookId,
      name: ind.name,
      sex: ind.sex,
      birthDate: ind.birthDate,
      weightKg: ind.weightKg,
      notes: ind.notes,
      imageUrl: ind.imageUrl,
      dnaSequence: ind.dnaSequence,
      isDeceased: ind.isDeceased || false,
      deathDate: ind.deathDate || '',
      latitude: ind.latitude,
      longitude: ind.longitude,
      source: ind.source || 'Bred in house',
      sourceDetails: ind.sourceDetails || '',
      sireId: ind.sireId,
      damId: ind.damId
    });
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
    setNewSpeciesName('');
    setNewSpeciesType('Animal');
    
    // Navigate back if a return path was set (e.g. from Detail page)
    if (returnPath) {
       navigate(returnPath);
       setReturnPath(null);
    }

    setFormData({
      speciesId: '',
      studbookId: '',
      name: '',
      sex: Sex.UNKNOWN,
      birthDate: '',
      weightKg: 0,
      notes: '',
      imageUrl: '',
      dnaSequence: undefined,
      isDeceased: false,
      deathDate: '',
      latitude: undefined,
      longitude: undefined,
      source: 'Bred in house',
      sourceDetails: '',
      sireId: undefined,
      damId: undefined
    });
  };

  const handleDelete = () => {
    if (!editingId) return;
    const updatedIndividuals = allIndividuals.filter(ind => ind.id !== editingId);
    setAllIndividuals(updatedIndividuals);
    saveIndividuals(updatedIndividuals);
    
    // If we deleted the item we came from, clearing returnPath prevents 404
    if (returnPath && returnPath.includes(editingId)) {
       setReturnPath(null);
       setShowForm(false);
       setEditingId(null);
    } else {
       handleCloseForm();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.studbookId) return;

    setIsSubmitting(true);
    let finalSpeciesId = formData.speciesId;
    let finalSpeciesType = isAutoSpecies ? newSpeciesType : allSpecies.find(s => s.id === formData.speciesId)?.type;

    // Handle Auto-Add Species
    if (isAutoSpecies && newSpeciesName) {
       try {
          // 1. Fetch Data
          const aiData = await fetchSpeciesData(newSpeciesName, newSpeciesType);
          
          // 2. Create Species
          const newSpecies: Species = {
             id: `sp-${Date.now()}`,
             projectId: currentProjectId,
             commonName: newSpeciesName,
             scientificName: aiData?.scientificName || newSpeciesName, // Fallback if AI fails
             type: newSpeciesType,
             conservationStatus: aiData?.conservationStatus || 'Unknown',
             sexualMaturityAgeYears: aiData?.sexualMaturityAgeYears || 0,
             averageAdultWeightKg: aiData?.averageAdultWeightKg || 0,
             lifeExpectancyYears: aiData?.lifeExpectancyYears || 0,
             breedingSeasonStart: aiData?.breedingSeasonStart || 0,
             breedingSeasonEnd: aiData?.breedingSeasonEnd || 0,
             plantClassification: aiData?.plantClassification,
             imageUrl: aiData?.imageUrl || generatePattern(newSpeciesName)
          };

          // 3. Save Species
          const updatedSpeciesList = [...allSpecies, newSpecies];
          setAllSpecies(updatedSpeciesList);
          saveSpecies(updatedSpeciesList);
          finalSpeciesId = newSpecies.id;
          finalSpeciesType = newSpeciesType;

          // 4. Notify
          const currentUser = getSession();
          if (currentUser) {
             sendMockNotification(
                currentUser.id,
                "Species Auto-Created",
                `The species "${newSpecies.commonName}" was created automatically during individual registration. Please review its biological details in the Species Manager.`,
                "System"
             );
          }

       } catch (error) {
          console.error("Auto-add species failed", error);
          alert("Failed to auto-create species. Please try adding it manually first.");
          setIsSubmitting(false);
          return;
       }
    }

    if (!finalSpeciesId) {
       alert("Please select or create a species.");
       setIsSubmitting(false);
       return;
    }

    const isPlant = finalSpeciesType === 'Plant';
    const nameToSave = (isPlant && !formData.name) ? formData.studbookId : formData.name;

    if (!nameToSave) {
      alert("Name is required for animals.");
      setIsSubmitting(false);
      return;
    }

    const imageToSave = formData.imageUrl || generatePattern(nameToSave!);

    let updatedIndividuals: Individual[];

    if (editingId) {
      updatedIndividuals = allIndividuals.map(ind => {
        if (ind.id === editingId) {
          return {
            ...ind,
            speciesId: finalSpeciesId!,
            studbookId: formData.studbookId!,
            name: nameToSave!,
            sex: formData.sex || Sex.UNKNOWN,
            birthDate: formData.birthDate || ind.birthDate,
            weightKg: Number(formData.weightKg),
            notes: formData.notes || '',
            imageUrl: imageToSave,
            dnaSequence: formData.dnaSequence,
            isDeceased: formData.isDeceased,
            deathDate: formData.isDeceased ? formData.deathDate : undefined,
            latitude: formData.latitude,
            longitude: formData.longitude,
            source: formData.source,
            sourceDetails: formData.sourceDetails,
            sireId: formData.sireId,
            damId: formData.damId
          };
        }
        return ind;
      });
    } else {
      const newInd: Individual = {
        id: `ind-${Date.now()}`,
        projectId: currentProjectId,
        speciesId: finalSpeciesId!,
        studbookId: formData.studbookId!,
        name: nameToSave!,
        sex: formData.sex || Sex.UNKNOWN,
        birthDate: formData.birthDate || new Date().toISOString().split('T')[0],
        weightKg: Number(formData.weightKg),
        notes: formData.notes || '',
        imageUrl: imageToSave,
        dnaSequence: formData.dnaSequence,
        weightHistory: [],
        healthHistory: [],
        growthHistory: [],
        isDeceased: formData.isDeceased,
        deathDate: formData.isDeceased ? formData.deathDate : undefined,
        latitude: formData.latitude,
        longitude: formData.longitude,
        loanStatus: 'None',
        source: formData.source,
        sourceDetails: formData.sourceDetails,
        sireId: formData.sireId,
        damId: formData.damId
      };
      updatedIndividuals = [...allIndividuals, newInd];
    }

    setAllIndividuals(updatedIndividuals);
    saveIndividuals(updatedIndividuals);
    setIsSubmitting(false);
    handleCloseForm();
  };

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const filteredIndividuals = projectIndividuals.filter(ind => {
    if (highlightIds.length > 0) {
      return highlightIds.includes(ind.id);
    }

    const matchesSearch = ind.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          ind.studbookId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSpecies = filterSpeciesId ? ind.speciesId === filterSpeciesId : true;
    let matchesStatus = true;
    if (filterStatus === 'current') {
      matchesStatus = !ind.isDeceased;
    } else if (filterStatus === 'deceased') {
      matchesStatus = !!ind.isDeceased;
    }
    return matchesSearch && matchesSpecies && matchesStatus;
  });

  const sortedIndividuals = [...filteredIndividuals].sort((a, b) => {
    let valA: string | number = '';
    let valB: string | number = '';

    if (sortBy === 'name') {
      valA = a.name.toLowerCase();
      valB = b.name.toLowerCase();
    } else if (sortBy === 'studbookId') {
      valA = a.studbookId.toLowerCase();
      valB = b.studbookId.toLowerCase();
    } else if (sortBy === 'birthDate') {
      valA = new Date(a.birthDate || 0).getTime();
      valB = new Date(b.birthDate || 0).getTime();
    }

    if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
    if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  // Determine effective plant state for the FORM (either selected species is plant, or auto-add type is plant)
  const selectedSpecies = allSpecies.find(s => s.id === formData.speciesId);
  const isPlant = isAutoSpecies ? newSpeciesType === 'Plant' : selectedSpecies?.type === 'Plant';
  const showSexField = !isPlant || (isPlant && (isAutoSpecies ? true : selectedSpecies?.plantClassification === 'Dioecious')); // Show sex for new plants by default, or specific if known

  // Helper to determine the best image to show
  const getDisplayImage = (ind: Individual) => {
    const sp = allSpecies.find(s => s.id === ind.speciesId);
    const isPattern = (url?: string) => !url || url.startsWith('data:image/svg+xml');
    
    // 1. Real Main Image (User uploaded)
    if (ind.imageUrl && !isPattern(ind.imageUrl)) return ind.imageUrl;
    
    // 2. Real History Image (from logs)
    const logs = [...(ind.weightHistory || []), ...(ind.growthHistory || [])]
      .filter(r => r.imageUrl && !isPattern(r.imageUrl))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    if (logs.length > 0) return logs[0].imageUrl!;

    // 3. Real Species Image
    if (sp?.imageUrl && !isPattern(sp.imageUrl)) return sp.imageUrl;

    // 4. Fallbacks: Main Pattern -> Species Pattern -> Generated
    return ind.imageUrl || sp?.imageUrl || generatePattern(ind.name);
  };

  return (
    <div className="space-y-6">
      {/* ... header code unchanged ... */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Individual Animals & Plants</h2>
          <p className="text-slate-500">Track specific individuals, genetics, and biometrics.</p>
        </div>
        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
          {/* ... sort buttons ... */}
          <div className="flex items-center bg-white border border-slate-300 rounded-lg p-1 mr-2 shadow-sm">
             <button 
                onClick={() => toggleSort('name')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${sortBy === 'name' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}
                title="Sort by Name"
             >
                {t('name')} {sortBy === 'name' && (sortOrder === 'asc' ? <ArrowDownAZ size={14}/> : <ArrowUpAZ size={14}/>)}
             </button>
             <div className="w-px h-4 bg-slate-200 mx-1"></div>
             <button 
                onClick={() => toggleSort('studbookId')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${sortBy === 'studbookId' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}
                title="Sort by ID"
             >
                <Hash size={14} className="mr-1"/> ID {sortBy === 'studbookId' && (sortOrder === 'asc' ? <ArrowDownAZ size={14}/> : <ArrowUpAZ size={14}/>)}
             </button>
             <div className="w-px h-4 bg-slate-200 mx-1"></div>
             <button 
                onClick={() => toggleSort('birthDate')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${sortBy === 'birthDate' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}
                title="Sort by Date"
             >
                <Calendar size={14} className="mr-1"/> Date {sortBy === 'birthDate' && (sortOrder === 'asc' ? <ArrowDownAZ size={14}/> : <ArrowUpAZ size={14}/>)}
             </button>
          </div>

          <div className="flex items-center bg-white border border-slate-300 rounded-lg p-1 mr-2 shadow-sm">
            <button 
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
              title="Grid View"
            >
              <LayoutGrid size={18} />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
              title="List View"
            >
              <List size={18} />
            </button>
          </div>
          
          <div className="flex gap-2">
             <div className="relative">
                <button 
                  onClick={() => setShowImportMenu(!showImportMenu)}
                  className="flex items-center space-x-2 bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 px-3 py-2 rounded-lg font-medium transition-colors shadow-sm"
                >
                  <Upload size={18} />
                  <span className="hidden lg:inline">{t('import')}</span>
                  <ChevronDown size={14} className="ml-1 text-slate-400" />
                </button>
                
                {showImportMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowImportMenu(false)}></div>
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-slate-100 overflow-hidden z-20 animate-in fade-in zoom-in duration-200 origin-top-right">
                      <button 
                        onClick={() => { setShowImportModal(true); setShowImportMenu(false); }}
                        className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                      >
                        <FileSpreadsheet size={16} className="text-emerald-600"/> 
                        <div>
                           <span className="font-bold block">Import Individuals</span>
                           <span className="text-xs text-slate-500">CSV with basic details</span>
                        </div>
                      </button>
                      <div className="border-t border-slate-100"></div>
                      <button 
                        onClick={() => { setShowLogImportModal(true); setShowImportMenu(false); }}
                        className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                      >
                        <Scale size={16} className="text-blue-600"/> 
                        <div>
                           <span className="font-bold block">Import Logs</span>
                           <span className="text-xs text-slate-500">Weight & Growth History</span>
                        </div>
                      </button>
                    </div>
                  </>
                )}
             </div>

             <button 
               onClick={handleOpenNewForm}
               className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
             >
               <Plus size={18} />
               <span className="hidden sm:inline">{t('registerIndividual')}</span>
               <span className="sm:hidden">{t('add')}</span>
             </button>
          </div>
        </div>
      </div>

      {/* ... Filters UI ... */}
      {highlightIds.length > 0 && (
        <div className="bg-purple-50 border border-purple-200 text-purple-800 px-4 py-3 rounded-lg flex justify-between items-center animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <Users size={18} />
            <span className="font-medium">Viewing selected individuals from dashboard recommendation.</span>
          </div>
          <button 
            onClick={clearHighlights}
            className="text-sm text-purple-600 hover:text-purple-900 font-semibold underline"
          >
            Clear Filter
          </button>
        </div>
      )}

      <div className={`flex flex-col lg:flex-row gap-4 transition-opacity ${highlightIds.length > 0 ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
        <div className="flex-1 bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3">
           <Search className="text-slate-400 ml-2" size={20} />
           <input 
              className="flex-1 outline-none text-slate-900 placeholder:text-slate-400 bg-white"
              placeholder={t('searchIndividuals')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
           />
        </div>
        
        <div className="flex gap-4">
          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-2 min-w-[200px]">
             <Filter size={18} className="text-slate-400 ml-2" />
             <select 
               className="bg-transparent outline-none text-slate-700 text-sm font-medium w-full"
               value={filterSpeciesId}
               onChange={(e) => setFilterSpeciesId(e.target.value)}
             >
               <option value="">All Species</option>
               {projectSpecies.map(s => (
                 <option key={s.id} value={s.id}>{s.commonName}</option>
               ))}
             </select>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-2 min-w-[160px]">
             <select 
               className="bg-transparent outline-none text-slate-700 text-sm font-medium w-full pl-2"
               value={filterStatus}
               onChange={(e) => setFilterStatus(e.target.value as StatusFilter)}
             >
               <option value="current">Current (Living)</option>
               <option value="deceased">Deceased</option>
               <option value="all">All Records</option>
             </select>
          </div>
        </div>
      </div>

      {/* Individual Import Modal */}
      {showImportModal && (
         <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
               <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                     <FileSpreadsheet size={20} className="text-emerald-600" />
                     Import Individuals
                  </h3>
                  <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
               </div>
               <div className="p-6 overflow-y-auto space-y-6">
                  
                  <div className="flex flex-col md:flex-row gap-6">
                     <div className="flex-1 space-y-4">
                        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-sm">
                           <h4 className="font-bold text-slate-800 mb-2">How it works</h4>
                           <p className="text-slate-600 mb-2">
                              Upload a CSV file containing your animal or plant records.
                           </p>
                           <ul className="list-disc list-inside text-slate-600 space-y-1 mb-2">
                              <li>We will auto-create any species that don't exist yet using our AI database.</li>
                              <li>Existing individuals with the same ID will be skipped.</li>
                              <li>Supports Google Drive links in the 'imageUrl' column.</li>
                           </ul>
                           <button 
                              onClick={handleDownloadTemplate}
                              className="mt-2 text-emerald-600 font-bold flex items-center gap-1 hover:underline"
                           >
                              <Download size={16} /> Download CSV Template
                           </button>
                        </div>

                        <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:bg-slate-50 transition-colors relative">
                           <input 
                              type="file" 
                              accept=".csv" 
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                              onChange={handleImportCSV}
                              disabled={importing}
                           />
                           <div className="flex flex-col items-center justify-center gap-2 text-slate-500">
                              {importing ? <Loader2 size={32} className="animate-spin text-emerald-500"/> : <Upload size={32} />}
                              <span className="font-medium">{importing ? 'Processing...' : 'Click or Drag CSV to Upload'}</span>
                           </div>
                        </div>
                     </div>

                     <div className="w-full md:w-64 bg-white border border-slate-200 rounded-lg p-4 text-xs">
                        <h4 className="font-bold text-slate-900 mb-3 border-b border-slate-100 pb-2">Field Key</h4>
                        <div className="space-y-2">
                           <div>
                              <span className="font-bold text-red-600">Required *</span>
                              <ul className="text-slate-600 mt-1 space-y-1 pl-2">
                                 <li>studbookId</li>
                                 <li>commonName <span className="text-slate-400">(Auto-creates Species)</span></li>
                                 <li>type <span className="text-slate-400">(Animal/Plant)</span></li>
                              </ul>
                           </div>
                           <div>
                              <span className="font-bold text-slate-700">Optional</span>
                              <ul className="text-slate-600 mt-1 space-y-1 pl-2">
                                 <li>name <span className="text-slate-400">(Defaults to ID)</span></li>
                                 <li>imageUrl <span className="text-slate-400">(Google Drive link ok)</span></li>
                                 <li>scientificName</li>
                                 <li>sex <span className="text-slate-400">(Male/Female)</span></li>
                                 <li>birthDate <span className="text-slate-400">(YYYY-MM-DD)</span></li>
                                 <li>weightKg</li>
                                 <li>sireStudbookId</li>
                                 <li>damStudbookId</li>
                                 <li>notes</li>
                              </ul>
                           </div>
                        </div>
                     </div>
                  </div>

                  {/* Console Logs */}
                  <div className="bg-slate-900 rounded-lg p-4 font-mono text-xs text-slate-300 h-48 overflow-y-auto">
                     {importLogs.length === 0 && <span className="opacity-50">Ready for import...</span>}
                     {importLogs.map((log, i) => (
                        <div key={i} className="mb-1">{log}</div>
                     ))}
                     {importing && <div className="animate-pulse">_</div>}
                  </div>

               </div>
            </div>
         </div>
      )}

      {/* Log Import Modal ... (unchanged code follows for other modals and view modes) ... */}
      {showLogImportModal && (
         <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
               <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                     <Scale size={20} className="text-emerald-600" />
                     Import Weight & Growth Logs
                  </h3>
                  <button onClick={() => setShowLogImportModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
               </div>
               <div className="p-6 overflow-y-auto space-y-6">
                  
                  <div className="flex flex-col md:flex-row gap-6">
                     <div className="flex-1 space-y-4">
                        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-sm">
                           <h4 className="font-bold text-slate-800 mb-2">How it works</h4>
                           <p className="text-slate-600 mb-2">
                              Bulk update history for existing individuals by matching <strong>Studbook ID</strong>.
                           </p>
                           <ul className="list-disc list-inside text-slate-600 space-y-1 mb-2">
                              <li>Adds a new entry to the history log.</li>
                              <li>Updates the "Current Weight" field if the log date is newer.</li>
                              <li>Supports both Animals (Weight) and Plants (Height).</li>
                           </ul>
                           <button 
                              onClick={handleDownloadLogTemplate}
                              className="mt-2 text-emerald-600 font-bold flex items-center gap-1 hover:underline"
                           >
                              <Download size={16} /> Download Log CSV Template
                           </button>
                        </div>

                        <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:bg-slate-50 transition-colors relative">
                           <input 
                              type="file" 
                              accept=".csv" 
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                              onChange={handleImportLogs}
                              disabled={importing}
                           />
                           <div className="flex flex-col items-center justify-center gap-2 text-slate-500">
                              {importing ? <Loader2 size={32} className="animate-spin text-emerald-500"/> : <Upload size={32} />}
                              <span className="font-medium">{importing ? 'Processing...' : 'Click or Drag CSV to Upload'}</span>
                           </div>
                        </div>
                     </div>

                     <div className="w-full md:w-64 bg-white border border-slate-200 rounded-lg p-4 text-xs">
                        <h4 className="font-bold text-slate-900 mb-3 border-b border-slate-100 pb-2">Field Key</h4>
                        <div className="space-y-2">
                           <div>
                              <span className="font-bold text-red-600">Required *</span>
                              <ul className="text-slate-600 mt-1 space-y-1 pl-2">
                                 <li>studbookId</li>
                                 <li>date <span className="text-slate-400">(YYYY-MM-DD)</span></li>
                              </ul>
                           </div>
                           <div>
                              <span className="font-bold text-slate-700">Optional</span>
                              <ul className="text-slate-600 mt-1 space-y-1 pl-2">
                                 <li>weightKg <span className="text-slate-400">(Animals)</span></li>
                                 <li>heightCm <span className="text-slate-400">(Plants)</span></li>
                                 <li>note</li>
                              </ul>
                           </div>
                        </div>
                     </div>
                  </div>

                  {/* Console Logs */}
                  <div className="bg-slate-900 rounded-lg p-4 font-mono text-xs text-slate-300 h-48 overflow-y-auto">
                     {importLogs.length === 0 && <span className="opacity-50">Ready for import...</span>}
                     {importLogs.map((log, i) => (
                        <div key={i} className="mb-1">{log}</div>
                     ))}
                     {importing && <div className="animate-pulse">_</div>}
                  </div>

               </div>
            </div>
         </div>
      )}

      {/* Edit Form... (unchanged) */}
      {showForm && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/50 backdrop-blur-sm">
          <div className="flex min-h-full items-start justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl animate-in fade-in zoom-in duration-200 my-8">
             <div className="p-6 border-b border-slate-100 flex justify-between items-center">
               <h3 className="text-lg font-bold text-slate-900">
                 {editingId ? t('updateIndividual') : t('registerIndividual')}
               </h3>
               <button onClick={handleCloseForm} className="text-slate-400 hover:text-slate-600">
                 <X size={24} />
               </button>
             </div>
             
             <form onSubmit={handleSubmit} className="p-6 space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Species Selection with Auto-Add Toggle */}
                  <div className="col-span-1 md:col-span-2 space-y-2">
                    <div className="flex justify-between items-end mb-1">
                       <label className="text-sm font-medium text-slate-700">{t('species')}</label>
                       {!editingId && (
                         <button 
                           type="button"
                           onClick={() => setIsAutoSpecies(!isAutoSpecies)}
                           className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
                         >
                           {isAutoSpecies ? "Select existing species" : "Auto-add new species?"}
                         </button>
                       )}
                    </div>
                    
                    {isAutoSpecies ? (
                       <div className="flex gap-3">
                          <input 
                             className="flex-1 px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                             placeholder="Common Name (e.g. Western Lowland Gorilla)"
                             value={newSpeciesName}
                             onChange={(e) => setNewSpeciesName(e.target.value)}
                             required={isAutoSpecies}
                             autoFocus
                          />
                          <select 
                             className="w-32 px-2 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                             value={newSpeciesType}
                             onChange={(e) => setNewSpeciesType(e.target.value as SpeciesType)}
                          >
                             <option value="Animal">{t('animal')}</option>
                             <option value="Plant">{t('plant')}</option>
                          </select>
                       </div>
                    ) : (
                      <select 
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                        value={formData.speciesId}
                        onChange={e => setFormData({...formData, speciesId: e.target.value})}
                        required
                        disabled={!!editingId} // Prevent changing species on edit to avoid data integrity issues
                      >
                        <option value="">Select Species...</option>
                        {projectSpecies.map(s => (
                          <option key={s.id} value={s.id}>{s.commonName} ({s.scientificName})</option>
                        ))}
                      </select>
                    )}
                    {isAutoSpecies && <p className="text-xs text-slate-500">We will automatically fetch biological data for this species. You can review it later.</p>}
                  </div>

                  <div className="space-y-2">
                     <label className="text-sm font-medium text-slate-700">{isPlant ? t('plantId') : t('studbookId')}</label>
                     <input 
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900 font-mono"
                        value={formData.studbookId}
                        onChange={e => setFormData({...formData, studbookId: e.target.value})}
                        placeholder="e.g., SB-2023-X9Y2"
                        required
                     />
                  </div>

                  {!isPlant && (
                    <div className="space-y-2">
                       <label className="text-sm font-medium text-slate-700">{t('name')}</label>
                       <input 
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                          value={formData.name}
                          onChange={e => setFormData({...formData, name: e.target.value})}
                          placeholder="e.g., Luna"
                          required={!isPlant}
                       />
                    </div>
                  )}

                  {showSexField && (
                    <div className="space-y-2">
                       <label className="text-sm font-medium text-slate-700">{t('sex')}</label>
                       <select 
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                          value={formData.sex}
                          onChange={e => setFormData({...formData, sex: e.target.value as Sex})}
                       >
                         {Object.values(Sex).map(s => <option key={s} value={s}>{s}</option>)}
                       </select>
                    </div>
                  )}

                  <div className="space-y-2">
                     <label className="text-sm font-medium text-slate-700">{isPlant ? t('datePlanted') : t('dateOfBirth')}</label>
                     <input 
                        type="date"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                        value={formData.birthDate}
                        onChange={e => setFormData({...formData, birthDate: e.target.value})}
                     />
                  </div>

                  {!isPlant && (
                    <div className="space-y-2">
                       <label className="text-sm font-medium text-slate-700">{t('weight')}</label>
                       <input 
                          type="number"
                          step="0.01"
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                          value={formData.weightKg}
                          onChange={e => setFormData({...formData, weightKg: Number(e.target.value)})}
                       />
                    </div>
                  )}
                  
                  <div className="space-y-2">
                     <label className="text-sm font-medium text-slate-700">{t('acquisitionSource')}</label>
                     <select 
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                        value={formData.source}
                        onChange={e => setFormData({...formData, source: e.target.value as AcquisitionSource})}
                     >
                       {(isPlant ? PLANT_SOURCES : ANIMAL_SOURCES).map(src => (
                          <option key={src} value={src}>{src}</option>
                       ))}
                     </select>
                  </div>
                  <div className="space-y-2">
                     <label className="text-sm font-medium text-slate-700">{t('sourceDetails')}</label>
                     <input 
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                        value={formData.sourceDetails}
                        onChange={e => setFormData({...formData, sourceDetails: e.target.value})}
                        placeholder={isPlant ? "e.g. Seed bank X" : "e.g. Received from Zoo X"}
                     />
                  </div>

                  {/* Parentage Section (Hide for Plants) */}
                  {!isPlant && (
                     <div className="col-span-1 md:col-span-2 border-t border-slate-100 pt-4">
                        <h4 className="text-sm font-bold text-slate-700 mb-3">{t('parentage')}</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           
                           {/* Sire Field */}
                           <div className="space-y-2">
                              <label className="text-sm font-medium text-slate-700">{t('sire')}</label>
                              {isManualSire ? (
                                 <div className="flex gap-2">
                                   <input 
                                     className="flex-1 px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                                     placeholder="Enter Name/ID manually"
                                     value={formData.sireId || ''}
                                     onChange={e => setFormData({...formData, sireId: e.target.value})}
                                   />
                                   <button 
                                     type="button"
                                     onClick={() => { setIsManualSire(false); setFormData({...formData, sireId: undefined}); }}
                                     className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg border border-slate-200"
                                     title="Switch to Dropdown"
                                   >
                                     <RefreshCw size={18} />
                                   </button>
                                 </div>
                              ) : (
                                 <select 
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                                    value={formData.sireId || ''}
                                    onChange={e => {
                                       if (e.target.value === "MANUAL") {
                                          setIsManualSire(true);
                                          setFormData({...formData, sireId: ''});
                                       } else {
                                          setFormData({...formData, sireId: e.target.value || undefined});
                                       }
                                    }}
                                 >
                                    <option value="">{t('unknown')}</option>
                                    {projectIndividuals
                                       .filter(i => i.speciesId === formData.speciesId && i.sex === Sex.MALE && i.id !== editingId)
                                       .map(male => (
                                          <option key={male.id} value={male.id}>{male.name} ({male.studbookId})</option>
                                       ))
                                    }
                                    <option disabled>──────────</option>
                                    <option value="MANUAL">Enter Name/ID Manually...</option>
                                 </select>
                              )}
                           </div>

                           {/* Dam Field */}
                           <div className="space-y-2">
                              <label className="text-sm font-medium text-slate-700">{t('dam')}</label>
                              {isManualDam ? (
                                 <div className="flex gap-2">
                                   <input 
                                     className="flex-1 px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                                     placeholder="Enter Name/ID manually"
                                     value={formData.damId || ''}
                                     onChange={e => setFormData({...formData, damId: e.target.value})}
                                   />
                                   <button 
                                     type="button"
                                     onClick={() => { setIsManualDam(false); setFormData({...formData, damId: undefined}); }}
                                     className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg border border-slate-200"
                                     title="Switch to Dropdown"
                                   >
                                     <RefreshCw size={18} />
                                   </button>
                                 </div>
                              ) : (
                                 <select 
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                                    value={formData.damId || ''}
                                    onChange={e => {
                                       if (e.target.value === "MANUAL") {
                                          setIsManualDam(true);
                                          setFormData({...formData, damId: ''});
                                       } else {
                                          setFormData({...formData, damId: e.target.value || undefined});
                                       }
                                    }}
                                 >
                                    <option value="">{t('unknown')}</option>
                                    {projectIndividuals
                                       .filter(i => i.speciesId === formData.speciesId && i.sex === Sex.FEMALE && i.id !== editingId)
                                       .map(female => (
                                          <option key={female.id} value={female.id}>{female.name} ({female.studbookId})</option>
                                       ))
                                    }
                                    <option disabled>──────────</option>
                                    <option value="MANUAL">Enter Name/ID Manually...</option>
                                 </select>
                              )}
                           </div>
                        </div>
                     </div>
                  )}

                  <div className="space-y-2 col-span-1 md:col-span-2">
                    <label className="text-sm font-medium text-slate-700">{t('uploadImage')}</label>
                    <div className="flex items-center space-x-3">
                      <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 border border-slate-300">
                         <Camera size={18} />
                         <span>{t('uploadImage')}</span>
                         <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
                      </label>
                      {formData.imageUrl && <span className="text-xs text-emerald-600 font-medium">{t('imageSelected')}</span>}
                    </div>
                  </div>

                  <div className="space-y-2 col-span-1 md:col-span-2">
                    <label className="text-sm font-medium text-slate-700">{t('genetics')}</label>
                    <div className="flex items-center space-x-3">
                      <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 border border-slate-300">
                         <Dna size={18} />
                         <span>{t('uploadImage')}</span>
                         <input type="file" className="hidden" onChange={handleDNAUpload} />
                      </label>
                      {formData.dnaSequence && <span className="text-xs text-emerald-600 font-medium truncate max-w-[150px]">{formData.dnaSequence}</span>}
                    </div>
                    <p className="text-xs text-slate-400">Supported formats: .fasta, .txt, .vcf</p>
                  </div>
               </div>

               {isPlant && (
                 <div className="border-t border-slate-100 pt-4 mt-2">
                    <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                      <MapPin size={16} /> {t('locationCoords')}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-700">{t('latitude')}</label>
                          <input 
                             type="number"
                             step="any"
                             className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                             value={formData.latitude || ''}
                             onChange={e => setFormData({...formData, latitude: parseFloat(e.target.value)})}
                             placeholder="e.g. 45.5152"
                          />
                       </div>
                       <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-700">{t('longitude')}</label>
                          <input 
                             type="number"
                             step="any"
                             className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                             value={formData.longitude || ''}
                             onChange={e => setFormData({...formData, longitude: parseFloat(e.target.value)})}
                             placeholder="e.g. -122.6784"
                          />
                       </div>
                    </div>
                    <div className="mt-3">
                       <button 
                         type="button"
                         onClick={handleGetCurrentLocation}
                         className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                       >
                         <MapPin size={14} /> {t('useCurrentLocation')}
                       </button>
                    </div>
                 </div>
               )}
               
               <div className="border-t border-slate-100 pt-4 mt-2 bg-slate-50 p-4 rounded-lg">
                  <div className="flex items-center space-x-3 mb-2">
                     <input 
                       type="checkbox" 
                       id="isDeceased"
                       className="w-5 h-5 rounded border-slate-300 text-red-600 focus:ring-red-500"
                       checked={formData.isDeceased}
                       onChange={e => setFormData({...formData, isDeceased: e.target.checked})}
                     />
                     <label htmlFor="isDeceased" className="text-sm font-bold text-slate-800">{isPlant ? t('markRemoved') : t('markDeceased')}</label>
                  </div>
                  <p className="text-xs text-slate-500 mb-3 ml-8">Check this box if the individual {isPlant ? 'has died or been removed' : 'has passed away'} to archive their record.</p>
                  
                  {formData.isDeceased && (
                    <div className="space-y-2 ml-8 animate-in fade-in slide-in-from-top-2 duration-200">
                       <label className="text-sm font-medium text-slate-700">{isPlant ? t('dateRemoved') : t('dateDeceased')}</label>
                       <input 
                          type="date"
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                          value={formData.deathDate}
                          onChange={e => setFormData({...formData, deathDate: e.target.value})}
                          required={formData.isDeceased}
                       />
                    </div>
                  )}
               </div>

               <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">{t('notes')}</label>
                  <textarea 
                     rows={3}
                     className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                     value={formData.notes}
                     onChange={e => setFormData({...formData, notes: e.target.value})}
                  />
               </div>

               <div className="flex justify-between pt-4 border-t border-slate-100 items-center">
                 {editingId ? (
                   <div>
                     {!showDeleteConfirm ? (
                        <button 
                          type="button" 
                          onClick={() => setShowDeleteConfirm(true)}
                          className="text-red-600 hover:text-red-700 text-sm font-medium flex items-center gap-1"
                        >
                          <Trash2 size={16} /> {t('delete')}
                        </button>
                     ) : (
                        <div className="flex items-center gap-2 animate-in fade-in">
                          <span className="text-xs text-red-600 font-medium">Confirm?</span>
                          <button 
                            type="button" 
                            onClick={handleDelete}
                            className="bg-red-600 text-white px-3 py-1 rounded text-xs hover:bg-red-700"
                          >
                            {t('delete')}
                          </button>
                          <button 
                            type="button" 
                            onClick={() => setShowDeleteConfirm(false)}
                            className="bg-slate-200 text-slate-600 px-3 py-1 rounded text-xs hover:bg-slate-300"
                          >
                            {t('cancel')}
                          </button>
                        </div>
                     )}
                   </div>
                 ) : <div></div>}

                 <div className="flex space-x-3">
                    <button type="button" onClick={handleCloseForm} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">{t('cancel')}</button>
                    <button 
                      type="submit" 
                      disabled={isSubmitting}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-2 rounded-lg font-medium transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
                    >
                      {isSubmitting && <Loader2 size={16} className="animate-spin"/>}
                      {editingId ? t('updateIndividual') : t('registerIndividual')}
                    </button>
                 </div>
               </div>
             </form>
           </div>
         </div>
        </div>
      )}

      {/* Grid/List View Rendering (unchanged) */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
           {sortedIndividuals.map(ind => {
             const species = allSpecies.find(s => s.id === ind.speciesId);
             const isIndPlant = species?.type === 'Plant';
             const showIndSex = !isIndPlant || (isIndPlant && species?.plantClassification === 'Dioecious');
             
             const displayImage = getDisplayImage(ind);

             return (
               <div 
                 key={ind.id} 
                 onClick={() => navigate(`/individuals/${ind.id}`)}
                 className={`rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative group cursor-pointer hover:shadow-md transition-all ${
                   ind.isDeceased ? 'bg-slate-50 grayscale-[0.5]' : 'bg-white'
                 } ${highlightIds.includes(ind.id) ? 'ring-2 ring-purple-500 shadow-md scale-[1.02]' : ''}`}
               >
                  {/* Edit Button */}
                  <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                     <button 
                        onClick={(e) => { e.stopPropagation(); handleEdit(ind); }}
                        className="bg-white/90 hover:bg-white text-slate-600 p-2 rounded-full shadow-sm transition-colors"
                        title={t('edit')}
                     >
                        <Pencil size={16} />
                     </button>
                  </div>

                  <div className="h-48 bg-slate-100 relative flex items-center justify-center text-slate-300 overflow-hidden">
                     {displayImage ? (
                       <img src={displayImage} alt={ind.name} className={`w-full h-full object-cover ${ind.isDeceased ? 'grayscale' : ''}`} />
                     ) : (
                       <div className="flex flex-col items-center space-y-2">
                         <PawPrint size={48} className="opacity-20" />
                         <span className="text-xs font-medium opacity-50">No Image</span>
                       </div>
                     )}
                     <div className="absolute top-2 left-2 bg-white/90 backdrop-blur text-slate-800 text-xs font-bold px-2 py-1 rounded shadow-sm">
                        {ind.name}
                     </div>
                     
                     {/* Badges */}
                     <div className="absolute bottom-2 right-2 flex gap-1 flex-wrap justify-end p-2">
                        {isIndPlant && (
                          <div className="bg-green-600 text-white p-1.5 px-2 rounded-md shadow-sm text-xs font-bold uppercase">
                            {t('plant')}
                          </div>
                        )}
                        {/* Loan Status Badges */}
                        {ind.loanStatus === 'Loaned Out' && (
                           <div className="bg-amber-500 text-white p-1.5 px-2 rounded-md shadow-sm text-xs font-bold uppercase flex items-center gap-1" title="Currently Loaned Out">
                              <Briefcase size={12} /> Loaned Out
                           </div>
                        )}
                        {ind.loanStatus === 'On Loan' && (
                           <div className="bg-purple-600 text-white p-1.5 px-2 rounded-md shadow-sm text-xs font-bold uppercase flex items-center gap-1" title="Currently On Loan">
                              <Briefcase size={12} /> On Loan
                           </div>
                        )}

                        {ind.isDeceased && (
                          <div className="bg-black text-white p-1.5 px-2 rounded-md shadow-sm text-xs font-bold uppercase flex items-center gap-1" title={`Deceased: ${ind.deathDate || 'Unknown Date'}`}>
                            <AlertTriangle size={12} /> Deceased
                          </div>
                        )}
                        {!ind.isDeceased && ind.dnaSequence && (
                          <div className="bg-blue-600 text-white p-1.5 rounded-full shadow-sm" title="DNA Sequenced">
                            <Dna size={16} />
                          </div>
                        )}
                     </div>
                  </div>
                  
                  <div className="p-5 flex-1 flex flex-col">
                     <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            {ind.studbookId}
                            {ind.isDeceased && <span className="text-slate-400 font-normal text-sm">(Deceased)</span>}
                          </h3>
                          <p className="text-sm text-slate-500">{species?.commonName}</p>
                        </div>
                        {showIndSex && (
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            ind.sex === Sex.MALE ? 'bg-blue-100 text-blue-700' : 
                            ind.sex === Sex.FEMALE ? 'bg-pink-100 text-pink-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {ind.sex}
                          </span>
                        )}
                     </div>
                     
                     <div className="space-y-2 mt-4 text-sm text-slate-600 flex-1">
                        <div className="flex justify-between border-b border-slate-50 pb-2">
                           <span>{isIndPlant ? 'Planted:' : 'Age:'}</span>
                           <span className="font-medium">
                              {isIndPlant 
                                ? ind.birthDate 
                                : (ind.birthDate 
                                    ? (new Date(ind.isDeceased && ind.deathDate ? ind.deathDate : Date.now()).getFullYear() - new Date(ind.birthDate).getFullYear()) + ' yrs' 
                                    : 'Unknown')}
                           </span>
                        </div>
                        <div className="flex justify-between border-b border-slate-50 pb-2">
                           {isIndPlant ? (
                             <>
                               <span>{t('location')}:</span>
                               <span className="font-medium">{ind.latitude ? `${ind.latitude.toFixed(4)}, ${ind.longitude?.toFixed(4)}` : 'Unknown'}</span>
                             </>
                           ) : (
                             <>
                               <span>{t('weight')}:</span>
                               <span className="font-medium">{ind.weightKg} kg</span>
                             </>
                           )}
                        </div>
                        <div className="pt-2">
                           <p className="text-slate-500 text-xs line-clamp-2">{ind.notes}</p>
                        </div>
                     </div>
                  </div>
               </div>
             );
           })}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
           <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                 <tr>
                    <th className="px-6 py-4 font-semibold text-slate-700 text-sm cursor-pointer hover:bg-slate-100" onClick={() => toggleSort('name')}>
                       <div className="flex items-center gap-1">
                         {t('name')} {sortBy === 'name' && (sortOrder === 'asc' ? <ArrowDownAZ size={14}/> : <ArrowUpAZ size={14}/>)}
                       </div>
                    </th>
                    <th className="px-6 py-4 font-semibold text-slate-700 text-sm cursor-pointer hover:bg-slate-100" onClick={() => toggleSort('studbookId')}>
                       <div className="flex items-center gap-1">
                         ID {sortBy === 'studbookId' && (sortOrder === 'asc' ? <ArrowDownAZ size={14}/> : <ArrowUpAZ size={14}/>)}
                       </div>
                    </th>
                    <th className="px-6 py-4 font-semibold text-slate-700 text-sm">{t('species')}</th>
                    <th className="px-6 py-4 font-semibold text-slate-700 text-sm">{t('sex')}</th>
                    <th className="px-6 py-4 font-semibold text-slate-700 text-sm cursor-pointer hover:bg-slate-100" onClick={() => toggleSort('birthDate')}>
                       <div className="flex items-center gap-1">
                         Age / Planted {sortBy === 'birthDate' && (sortOrder === 'asc' ? <ArrowDownAZ size={14}/> : <ArrowUpAZ size={14}/>)}
                       </div>
                    </th>
                    <th className="px-6 py-4 font-semibold text-slate-700 text-sm">{t('status')}</th>
                    <th className="px-6 py-4 font-semibold text-slate-700 text-sm text-right">{t('action')}</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                 {sortedIndividuals.map(ind => {
                    const species = allSpecies.find(s => s.id === ind.speciesId);
                    const isIndPlant = species?.type === 'Plant';
                    const displayImage = getDisplayImage(ind);

                    return (
                       <tr 
                          key={ind.id} 
                          onClick={() => navigate(`/individuals/${ind.id}`)}
                          className={`hover:bg-slate-50 transition-colors cursor-pointer group ${ind.isDeceased ? 'opacity-75 bg-slate-50/50' : ''}`}
                       >
                          <td className="px-6 py-4">
                             <div className="flex items-center gap-3">
                                {displayImage ? (
                                   <img src={displayImage} alt={ind.name} className={`w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm ${ind.isDeceased ? 'grayscale' : ''}`} />
                                ) : (
                                   <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-400">
                                      <PawPrint size={16} />
                                   </div>
                                )}
                                <div>
                                   <p className="font-bold text-slate-900">{ind.name}</p>
                                   {/* Loan Badges in List */}
                                   {ind.loanStatus === 'Loaned Out' && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold uppercase ml-1">Loaned Out</span>}
                                   {ind.loanStatus === 'On Loan' && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-bold uppercase ml-1">On Loan</span>}
                                </div>
                             </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500 font-mono">{ind.studbookId}</td>
                          <td className="px-6 py-4 text-sm text-slate-700">{species?.commonName}</td>
                          <td className="px-6 py-4">
                             {!isIndPlant || (species?.plantClassification === 'Dioecious') ? (
                                <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                  ind.sex === Sex.MALE ? 'bg-blue-100 text-blue-700' : 
                                  ind.sex === Sex.FEMALE ? 'bg-pink-100 text-pink-700' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {ind.sex}
                                </span>
                             ) : (
                                <span className="text-slate-400 text-xs">-</span>
                             )}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                             {isIndPlant 
                                ? ind.birthDate 
                                : (ind.birthDate 
                                    ? (new Date(ind.isDeceased && ind.deathDate ? ind.deathDate : Date.now()).getFullYear() - new Date(ind.birthDate).getFullYear()) + ' yrs' 
                                    : 'Unknown')}
                          </td>
                          <td className="px-6 py-4">
                             {ind.isDeceased ? (
                                <span className="inline-flex items-center gap-1 bg-slate-800 text-white px-2 py-1 rounded text-xs font-bold">
                                   <AlertTriangle size={10} /> {t('markDeceased')}
                                </span>
                             ) : (
                                <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-xs font-bold">{t('current')}</span>
                             )}
                          </td>
                          <td className="px-6 py-4 text-right">
                             <div className="flex items-center justify-end gap-2">
                                <button 
                                   onClick={(e) => { e.stopPropagation(); handleEdit(ind); }}
                                   className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                                   title={t('edit')}
                                >
                                   <Pencil size={16} />
                                </button>
                                <button 
                                   className="p-2 text-slate-300 group-hover:text-emerald-600 transition-colors"
                                >
                                   <ArrowRight size={18} />
                                </button>
                             </div>
                          </td>
                       </tr>
                    );
                 })}
                 {sortedIndividuals.length === 0 && (
                   <tr>
                     <td colSpan={7} className="px-6 py-8 text-center text-slate-400 italic">No individuals found in this project.</td>
                   </tr>
                 )}
              </tbody>
           </table>
        </div>
      )}
      
      {sortedIndividuals.length === 0 && viewMode === 'grid' && (
         <div className="text-center py-12">
            <p className="text-slate-500">No individuals found matching current filters.</p>
         </div>
      )}
    </div>
  );
};

export default IndividualManager;
