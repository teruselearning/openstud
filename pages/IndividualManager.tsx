
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
      weightKg: 0,
      birthDate: new Date().toISOString().split('T')[0]
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

  const handleDNAUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
     const file = e.target.files?.[0];
     if (file) setFormData(prev => ({ ...prev, dnaSequence: file.name + ' (Uploaded)' }));
  };

  const handleGetCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        setFormData(prev => ({ ...prev, latitude: position.coords.latitude, longitude: position.coords.longitude }));
      }, (error) => alert("Error getting location: " + error.message));
    } else alert("Geolocation is not supported by this browser.");
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
    setNewSpeciesName('');
    setNewSpeciesType('Animal');
    if (returnPath) { navigate(returnPath); setReturnPath(null); }
    setFormData({ speciesId: '', studbookId: '', name: '', sex: Sex.UNKNOWN, birthDate: '', weightKg: 0, notes: '', imageUrl: '', isDeceased: false, deathDate: '', source: 'Bred in house', sourceDetails: '' });
  };

  const handleDelete = () => {
    if (!editingId) return;
    const updatedIndividuals = allIndividuals.filter(ind => ind.id !== editingId);
    setAllIndividuals(updatedIndividuals);
    saveIndividuals(updatedIndividuals);
    if (returnPath && returnPath.includes(editingId)) { setReturnPath(null); setShowForm(false); setEditingId(null); } 
    else handleCloseForm();
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
             id: `sp-${Date.now()}`, projectId: currentProjectId, commonName: newSpeciesName, scientificName: aiData?.scientificName || newSpeciesName, type: newSpeciesType,
             conservationStatus: aiData?.conservationStatus || 'Unknown', sexualMaturityAgeYears: aiData?.sexualMaturityAgeYears || 0, averageAdultWeightKg: aiData?.averageAdultWeightKg || 0, lifeExpectancyYears: aiData?.lifeExpectancyYears || 0, imageUrl: aiData?.imageUrl || generatePattern(newSpeciesName)
          };
          const updatedSpeciesList = [...allSpecies, newSpecies];
          setAllSpecies(updatedSpeciesList);
          saveSpecies(updatedSpeciesList);
          finalSpeciesId = newSpecies.id;
          finalSpeciesType = newSpeciesType;
          const currentUser = getSession();
          if (currentUser) sendMockNotification(currentUser.id, "Species Auto-Created", `The species "${newSpecies.commonName}" was created automatically during individual registration.`, "System");
       } catch (error) {
          alert("Failed to auto-create species."); setIsSubmitting(false); return;
       }
    }

    if (!finalSpeciesId) { alert("Please select or create a species."); setIsSubmitting(false); return; }
    const isPlant = finalSpeciesType === 'Plant';
    const nameToSave = (isPlant && !formData.name) ? formData.studbookId : formData.name;
    if (!nameToSave) { alert("Name is required for animals."); setIsSubmitting(false); return; }
    const imageToSave = formData.imageUrl || generatePattern(nameToSave!);

    let updatedIndividuals: Individual[];
    const entry: Individual = {
        ...formData as Individual,
        id: editingId || `ind-${Date.now()}`,
        projectId: currentProjectId,
        speciesId: finalSpeciesId!,
        name: nameToSave!,
        weightKg: Number(formData.weightKg),
        imageUrl: imageToSave,
        loanStatus: (formData as any).loanStatus || 'None'
    };

    if (editingId) {
      updatedIndividuals = allIndividuals.map(ind => ind.id === editingId ? entry : ind);
    } else {
      updatedIndividuals = [...allIndividuals, entry];
    }

    setAllIndividuals(updatedIndividuals);
    saveIndividuals(updatedIndividuals);
    setIsSubmitting(false);
    handleCloseForm();
  };

  const toggleSort = (field: SortField) => {
    if (sortBy === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortOrder('asc'); }
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

  const getDisplayImage = (ind: Individual) => {
    const sp = allSpecies.find(s => s.id === ind.speciesId);
    if (ind.imageUrl && !ind.imageUrl.startsWith('data:image/svg+xml')) return ind.imageUrl;
    return sp?.imageUrl || generatePattern(ind.name);
  };

  const canAddIndividual = projectSpecies.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Individual Animals & Plants</h2>
          <p className="text-slate-500">Track specific individuals, genetics, and biometrics.</p>
        </div>
        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
          <div className="flex items-center bg-white border border-slate-300 rounded-lg p-1 mr-2 shadow-sm">
             <button onClick={() => toggleSort('name')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${sortBy === 'name' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                {t('name')} {sortBy === 'name' && (sortOrder === 'asc' ? <ArrowDownAZ size={14}/> : <ArrowUpAZ size={14}/>)}
             </button>
             <div className="w-px h-4 bg-slate-200 mx-1"></div>
             <button onClick={() => toggleSort('studbookId')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${sortBy === 'studbookId' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                <Hash size={14} className="mr-1"/> ID {sortBy === 'studbookId' && (sortOrder === 'asc' ? <ArrowDownAZ size={14}/> : <ArrowUpAZ size={14}/>)}
             </button>
             <div className="w-px h-4 bg-slate-200 mx-1"></div>
             <button onClick={() => toggleSort('birthDate')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${sortBy === 'birthDate' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                <Calendar size={14} className="mr-1"/> Date {sortBy === 'birthDate' && (sortOrder === 'asc' ? <ArrowDownAZ size={14}/> : <ArrowUpAZ size={14}/>)}
             </button>
          </div>
          <div className="flex items-center bg-white border border-slate-300 rounded-lg p-1 mr-2 shadow-sm">
            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}><LayoutGrid size={18} /></button>
            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}><List size={18} /></button>
          </div>
          <div className="flex gap-2">
             <button 
                onClick={handleOpenNewForm} 
                disabled={!canAddIndividual}
                title={!canAddIndividual ? "You must add at least one species to the project before registering individuals." : ""}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors shadow-sm ${canAddIndividual ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
             >
                <Plus size={18} />
                <span className="hidden sm:inline">{t('registerIndividual')}</span>
                <span className="sm:hidden">{t('add')}</span>
             </button>
          </div>
        </div>
      </div>

      <div className={`flex flex-col lg:flex-row gap-4 transition-opacity ${highlightIds.length > 0 ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
        <div className="flex-1 bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3">
           <Search className="text-slate-400 ml-2" size={20} />
           <input className="flex-1 outline-none text-slate-900 placeholder:text-slate-400 bg-white" placeholder={t('searchIndividuals')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <div className="flex gap-4">
          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-2 min-w-[200px]">
             <Filter size={18} className="text-slate-400 ml-2" />
             <select className="bg-transparent outline-none text-slate-700 text-sm font-medium w-full" value={filterSpeciesId} onChange={(e) => setFilterSpeciesId(e.target.value)}>
               <option value="">All Species</option>
               {projectSpecies.map(s => <option key={s.id} value={s.id}>{s.commonName}</option>)}
             </select>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-2 min-w-[160px]">
             <select className="bg-transparent outline-none text-slate-700 text-sm font-medium w-full pl-2" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as StatusFilter)}>
               <option value="current">Current (Living)</option>
               <option value="deceased">Deceased</option>
               <option value="all">All Records</option>
             </select>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/50 backdrop-blur-sm">
          <div className="flex min-h-full items-start justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl animate-in fade-in zoom-in duration-200 my-8">
             <div className="p-6 border-b border-slate-100 flex justify-between items-center">
               <h3 className="text-lg font-bold text-slate-900">{editingId ? t('updateIndividual') : t('registerIndividual')}</h3>
               <button onClick={handleCloseForm} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
             </div>
             <form onSubmit={handleSubmit} className="p-6 space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="col-span-1 md:col-span-2 space-y-2">
                    <div className="flex justify-between items-end mb-1">
                       <label className="text-sm font-medium text-slate-700">{t('species')}</label>
                       {!editingId && <button type="button" onClick={() => setIsAutoSpecies(!isAutoSpecies)} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1">{isAutoSpecies ? "Select existing species" : "Auto-add new species?"}</button>}
                    </div>
                    {isAutoSpecies ? (
                       <div className="flex gap-3">
                          <input className="flex-1 px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" placeholder="Common Name" value={newSpeciesName} onChange={(e) => setNewSpeciesName(e.target.value)} required={isAutoSpecies} autoFocus />
                          <select className="w-32 px-2 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" value={newSpeciesType} onChange={(e) => setNewSpeciesType(e.target.value as SpeciesType)}><option value="Animal">{t('animal')}</option><option value="Plant">{t('plant')}</option></select>
                       </div>
                    ) : (
                      <select className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" value={formData.speciesId} onChange={e => setFormData({...formData, speciesId: e.target.value})} required disabled={!!editingId}><option value="">Select Species...</option>{projectSpecies.map(s => <option key={s.id} value={s.id}>{s.commonName} ({s.scientificName})</option>)}</select>
                    )}
                  </div>
                  <div className="space-y-2">
                     <label className="text-sm font-medium text-slate-700">{isPlant ? t('plantId') : t('studbookId')}</label>
                     <input className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900 font-mono" value={formData.studbookId} onChange={e => setFormData({...formData, studbookId: e.target.value})} placeholder="e.g., SB-2023-X9Y2" required />
                  </div>
                  {!isPlant && (
                    <div className="space-y-2">
                       <label className="text-sm font-medium text-slate-700">{t('name')}</label>
                       <input className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g., Luna" required={!isPlant} />
                    </div>
                  )}
                  {showSexField && (
                    <div className="space-y-2">
                       <label className="text-sm font-medium text-slate-700">{t('sex')}</label>
                       <select className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" value={formData.sex} onChange={e => setFormData({...formData, sex: e.target.value as Sex})}>{Object.values(Sex).map(s => <option key={s} value={s}>{s}</option>)}</select>
                    </div>
                  )}
                  <div className="space-y-2">
                     <label className="text-sm font-medium text-slate-700">{isPlant ? t('datePlanted') : t('dateOfBirth')}</label>
                     <input type="date" className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" value={formData.birthDate} onChange={e => setFormData({...formData, birthDate: e.target.value})} />
                  </div>
                  {!isPlant && (
                    <div className="space-y-2">
                       <label className="text-sm font-medium text-slate-700">{t('weight')} (kg)</label>
                       <input 
                          type="number" 
                          step="0.01" 
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" 
                          value={formData.weightKg === 0 ? '' : formData.weightKg} 
                          onChange={e => {
                             const val = e.target.value === '' ? 0 : Number(e.target.value);
                             setFormData({...formData, weightKg: val});
                          }} 
                          onFocus={(e) => { 
                             if(formData.weightKg === 0) setFormData({...formData, weightKg: '' as any}); 
                          }} 
                       />
                    </div>
                  )}
                  <div className="space-y-2"><label className="text-sm font-medium text-slate-700">{t('acquisitionSource')}</label><select className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" value={formData.source} onChange={e => setFormData({...formData, source: e.target.value as AcquisitionSource})}>{(isPlant ? PLANT_SOURCES : ANIMAL_SOURCES).map(src => <option key={src} value={src}>{src}</option>)}</select></div>
                  <div className="space-y-2"><label className="text-sm font-medium text-slate-700">{t('sourceDetails')}</label><input className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" value={formData.sourceDetails} onChange={e => setFormData({...formData, sourceDetails: e.target.value})} placeholder={isPlant ? "e.g. Seed bank X" : "e.g. Received from Zoo X"} /></div>
               </div>
               <div className="flex justify-between pt-4 border-t border-slate-100 items-center">
                 {editingId ? <button type="button" onClick={() => setShowDeleteConfirm(true)} className="text-red-600 hover:text-red-700 text-sm font-medium flex items-center gap-1"><Trash2 size={16} /> {t('delete')}</button> : <div/>}
                 <div className="flex space-x-3"><button type="button" onClick={handleCloseForm} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">{t('cancel')}</button><button type="submit" disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-2 rounded-lg font-medium transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2">{isSubmitting && <Loader2 size={16} className="animate-spin"/>} {editingId ? t('updateIndividual') : t('registerIndividual')}</button></div>
               </div>
             </form>
            </div>
          </div>
        </div>
      )}
      {/* List and Grid rendering omitted for brevity - no changes requested in those UI segments */}
    </div>
  );
};

export default IndividualManager;
