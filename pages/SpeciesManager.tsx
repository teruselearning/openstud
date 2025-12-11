
import React, { useState, useEffect, useContext } from 'react';
import { getSpecies, saveSpecies, exportSpeciesData, importSpeciesData, generatePattern, getOrg } from '../services/storage';
import { fetchSpeciesData } from '../services/geminiService';
import { Species, SpeciesType, PlantClassification, NativeStatus, Organization } from '../types';
import { Plus, Sparkles, Loader2, Camera, Image as ImageIcon, Download, Upload, CheckCircle, AlertCircle, Pencil, Trash2, LayoutGrid, List, ArrowDownAZ, ArrowUpAZ, Search, MapPin, Check, X as XIcon, AlertTriangle, HelpCircle, ExternalLink } from 'lucide-react';
import { LanguageContext } from '../App';

interface SpeciesManagerProps {
  currentProjectId: string;
}

const SpeciesManager: React.FC<SpeciesManagerProps> = ({ currentProjectId }) => {
  const { t } = useContext(LanguageContext);
  const [allSpecies, setAllSpecies] = useState<Species[]>([]);
  const [org, setOrg] = useState<Organization | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [importStatus, setImportStatus] = useState<{type: 'success'|'error', msg: string} | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // Sorting & Searching State
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'commonName' | 'scientificName'>('commonName');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  const [formData, setFormData] = useState<Partial<Species>>({
    commonName: '',
    scientificName: '',
    type: 'Animal',
    plantClassification: undefined,
    conservationStatus: '',
    sexualMaturityAgeYears: 0,
    averageAdultWeightKg: 0,
    lifeExpectancyYears: 0,
    breedingSeasonStart: 0,
    breedingSeasonEnd: 0,
    imageUrl: '',
    nativeStatusCountry: 'Unknown',
    nativeStatusLocal: 'Unknown'
  });

  const MONTHS = [
    { val: 1, label: 'January' },
    { val: 2, label: 'February' },
    { val: 3, label: 'March' },
    { val: 4, label: 'April' },
    { val: 5, label: 'May' },
    { val: 6, label: 'June' },
    { val: 7, label: 'July' },
    { val: 8, label: 'August' },
    { val: 9, label: 'September' },
    { val: 10, label: 'October' },
    { val: 11, label: 'November' },
    { val: 12, label: 'December' }
  ];

  const getMonthName = (val?: number) => {
    if (!val || val < 1 || val > 12) return null;
    return MONTHS[val - 1].label.substring(0, 3);
  };

  useEffect(() => {
    setAllSpecies(getSpecies());
    setOrg(getOrg());
  }, []);

  const handleAutoFill = async () => {
    if (!formData.commonName) return;
    setLoadingAI(true);
    
    // Get Org Location for Native Status Context
    const locationContext = org ? org.location : '';

    const data = await fetchSpeciesData(formData.commonName, formData.type as SpeciesType, locationContext);
    setLoadingAI(false);
    if (data) {
      setFormData(prev => ({ ...prev, ...data }));
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, imageUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEdit = (species: Species) => {
    setEditingId(species.id);
    setFormData({
      commonName: species.commonName,
      scientificName: species.scientificName,
      type: species.type || 'Animal',
      plantClassification: species.plantClassification,
      conservationStatus: species.conservationStatus,
      sexualMaturityAgeYears: species.sexualMaturityAgeYears,
      averageAdultWeightKg: species.averageAdultWeightKg,
      lifeExpectancyYears: species.lifeExpectancyYears,
      breedingSeasonStart: species.breedingSeasonStart || 0,
      breedingSeasonEnd: species.breedingSeasonEnd || 0,
      imageUrl: species.imageUrl,
      nativeStatusCountry: species.nativeStatusCountry || 'Unknown',
      nativeStatusLocal: species.nativeStatusLocal || 'Unknown'
    });
    setShowForm(true);
    setShowDeleteConfirm(false);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingId(null);
    setShowDeleteConfirm(false);
    setFormData({ 
      commonName: '', 
      scientificName: '', 
      type: 'Animal', 
      plantClassification: undefined, 
      conservationStatus: '', 
      sexualMaturityAgeYears: 0, 
      averageAdultWeightKg: 0, 
      lifeExpectancyYears: 0, 
      breedingSeasonStart: 0,
      breedingSeasonEnd: 0,
      imageUrl: '',
      nativeStatusCountry: 'Unknown',
      nativeStatusLocal: 'Unknown'
    });
  };

  const handleDelete = () => {
    if (!editingId) return;
    const updatedList = allSpecies.filter(sp => sp.id !== editingId);
    setAllSpecies(updatedList);
    saveSpecies(updatedList);
    handleCloseForm();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.commonName || !formData.scientificName) return;
    
    // Generate image if missing. Use scientific name for plants, common for animals (or user preference)
    const nameForPattern = (formData.type === 'Plant' && formData.scientificName) 
        ? formData.scientificName 
        : formData.commonName;

    const imageToSave = formData.imageUrl || generatePattern(nameForPattern);

    let updatedSpeciesList = [...allSpecies];

    if (editingId) {
       updatedSpeciesList = updatedSpeciesList.map(sp => {
         if (sp.id === editingId) {
           return {
              ...sp,
              commonName: formData.commonName!,
              scientificName: formData.scientificName!,
              type: formData.type as SpeciesType,
              plantClassification: formData.type === 'Plant' ? formData.plantClassification : undefined,
              conservationStatus: formData.conservationStatus || 'Unknown',
              sexualMaturityAgeYears: Number(formData.sexualMaturityAgeYears),
              averageAdultWeightKg: formData.type === 'Animal' ? Number(formData.averageAdultWeightKg) : 0,
              lifeExpectancyYears: Number(formData.lifeExpectancyYears),
              breedingSeasonStart: Number(formData.breedingSeasonStart),
              breedingSeasonEnd: Number(formData.breedingSeasonEnd),
              imageUrl: imageToSave,
              nativeStatusCountry: formData.nativeStatusCountry,
              nativeStatusLocal: formData.nativeStatusLocal
           };
         }
         return sp;
       });
    } else {
       const newSpecies: Species = {
          id: `sp-${Date.now()}`,
          projectId: currentProjectId, 
          commonName: formData.commonName,
          scientificName: formData.scientificName,
          type: (formData.type as SpeciesType) || 'Animal',
          plantClassification: formData.type === 'Plant' ? formData.plantClassification : undefined,
          conservationStatus: formData.conservationStatus || 'Unknown',
          sexualMaturityAgeYears: Number(formData.sexualMaturityAgeYears),
          averageAdultWeightKg: formData.type === 'Animal' ? Number(formData.averageAdultWeightKg) : 0,
          lifeExpectancyYears: Number(formData.lifeExpectancyYears),
          breedingSeasonStart: Number(formData.breedingSeasonStart),
          breedingSeasonEnd: Number(formData.breedingSeasonEnd),
          imageUrl: imageToSave,
          nativeStatusCountry: formData.nativeStatusCountry,
          nativeStatusLocal: formData.nativeStatusLocal
       };
       updatedSpeciesList.push(newSpecies);
    }

    setAllSpecies(updatedSpeciesList);
    saveSpecies(updatedSpeciesList);
    handleCloseForm();
  };

  const handleExportSpecies = () => {
    if (!editingId || !formData.commonName) return;
    
    const data = exportSpeciesData(editingId);
    if (!data) return;
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${formData.commonName.replace(/\s+/g, '_').toLowerCase()}_backup.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportSpecies = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        importSpeciesData(json);
        setAllSpecies(getSpecies());
        setImportStatus({ type: 'success', msg: `Successfully imported ${json.species?.commonName || 'species'} data.` });
        setTimeout(() => setImportStatus(null), 3000);
      } catch (err) {
        setImportStatus({ type: 'error', msg: 'Failed to import species. Invalid file.' });
        setTimeout(() => setImportStatus(null), 3000);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const toggleSort = (field: 'commonName' | 'scientificName') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  // Filter first by Project
  const projectSpecies = allSpecies.filter(sp => sp.projectId === currentProjectId);

  // Then by Search
  const filteredSpecies = projectSpecies.filter(sp => 
    sp.commonName.toLowerCase().includes(searchQuery.toLowerCase()) || 
    sp.scientificName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Then sort
  const sortedSpecies = [...filteredSpecies].sort((a, b) => {
    const valA = (a[sortBy] || '').toString().toLowerCase();
    const valB = (b[sortBy] || '').toString().toLowerCase();
    
    if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
    if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const isPlant = formData.type === 'Plant';

  const NativeStatusPill = ({ status, context }: { status?: NativeStatus, context: 'Country' | 'Area' }) => {
     if (!org?.showNativeStatus) return null; // Respect Organization Settings

     if (!status || status === 'Unknown') {
        return (
           <span className="flex items-center gap-1 bg-slate-100 text-slate-500 px-2 py-1 rounded-full text-[10px] font-medium border border-slate-200">
              <HelpCircle size={10} /> {t('unknown')}
           </span>
        );
     }
     
     if (status === 'Native') {
        return (
           <span className="flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full text-[10px] font-bold border border-emerald-200">
              <Check size={10} /> {t('native')} ({context === 'Country' ? t('inCountry') : t('inLocalArea')})
           </span>
        );
     }

     if (status === 'Invasive') {
        return (
           <span className="flex items-center gap-1 bg-red-100 text-red-700 px-2 py-1 rounded-full text-[10px] font-bold border border-red-200">
              <AlertTriangle size={10} /> {t('invasive')} ({context === 'Country' ? t('inCountry') : t('inLocalArea')})
           </span>
        );
     }

     // Introduced
     return (
        <span className="flex items-center gap-1 bg-amber-100 text-amber-700 px-2 py-1 rounded-full text-[10px] font-medium border border-amber-200">
           <XIcon size={10} /> {t('introduced')} ({context === 'Country' ? t('inCountry') : t('inLocalArea')})
        </span>
     );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Species Database</h2>
          <p className="text-slate-500">Manage species profiles and biological data.</p>
        </div>
        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 items-center flex-wrap gap-y-2 w-full md:w-auto">
          
          {/* Search Bar */}
          <div className="relative w-full sm:w-auto">
            <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input 
              type="text"
              placeholder={t('searchSpecies')}
              className="w-full sm:w-48 pl-9 pr-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex flex-row space-x-2">
            {/* Sorting Controls */}
            <div className="flex items-center bg-white border border-slate-300 rounded-lg p-1 shadow-sm">
              <button 
                onClick={() => toggleSort('commonName')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${sortBy === 'commonName' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}
                title="Sort by Common Name"
              >
                {t('commonName')} {sortBy === 'commonName' && (sortOrder === 'asc' ? <ArrowDownAZ size={14}/> : <ArrowUpAZ size={14}/>)}
              </button>
              <div className="w-px h-4 bg-slate-200 mx-1"></div>
              <button 
                onClick={() => toggleSort('scientificName')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${sortBy === 'scientificName' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}
                title="Sort by Scientific Name"
              >
                {t('scientificName')} {sortBy === 'scientificName' && (sortOrder === 'asc' ? <ArrowDownAZ size={14}/> : <ArrowUpAZ size={14}/>)}
              </button>
            </div>

            <div className="flex items-center bg-white border border-slate-300 rounded-lg p-1 shadow-sm">
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
          </div>

          <div className="flex flex-row space-x-2 w-full sm:w-auto">
            <label className="flex items-center justify-center space-x-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-medium transition-colors shadow-sm cursor-pointer hover:bg-slate-50 flex-1 sm:flex-none">
              <Upload size={18} />
              <span className="inline">{t('import')}</span>
              <input type="file" accept=".json" className="hidden" onChange={handleImportSpecies} />
            </label>
            <button 
              onClick={() => { setEditingId(null); setShowForm(true); setShowDeleteConfirm(false); }}
              className="flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm flex-1 sm:flex-none"
            >
              <Plus size={18} />
              <span className="inline">{t('add')}</span>
            </button>
          </div>
        </div>
      </div>

      {importStatus && (
        <div className={`p-4 rounded-lg flex items-center space-x-2 ${importStatus.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {importStatus.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <span>{importStatus.msg}</span>
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-xl border border-emerald-100 shadow-lg p-6 animate-in slide-in-from-top-4 duration-300 mb-6">
          <div className="flex justify-between items-start mb-6">
             <div className="flex items-center gap-4">
                <h3 className="text-lg font-bold text-slate-900">{editingId ? t('updateSpecies') : t('add')}</h3>
                {editingId && (
                   <button 
                     onClick={handleExportSpecies}
                     className="flex items-center space-x-1 text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 transition-colors"
                     title="Export this species and all related individuals"
                   >
                      <Download size={14} />
                      <span>{t('exportData')}</span>
                   </button>
                )}
             </div>
             <button onClick={handleCloseForm} className="text-slate-400 hover:text-slate-600">{t('cancel')}</button>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">{t('type')}</label>
                <select 
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                  value={formData.type}
                  onChange={e => setFormData({...formData, type: e.target.value as SpeciesType})}
                >
                  <option value="Animal">{t('animal')}</option>
                  <option value="Plant">{t('plant')}</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">{t('commonName')}</label>
                <div className="flex space-x-2">
                  <input 
                    className="flex-1 px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                    value={formData.commonName}
                    onChange={e => setFormData({...formData, commonName: e.target.value})}
                    placeholder="e.g., Red Panda"
                    required
                  />
                  <button 
                    type="button"
                    onClick={handleAutoFill}
                    disabled={loadingAI || !formData.commonName}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm flex items-center space-x-2 disabled:opacity-50"
                  >
                    {loadingAI ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                    <span className="hidden sm:inline">{t('autofill')}</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">{t('scientificName')}</label>
                <input 
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                  value={formData.scientificName}
                  onChange={e => setFormData({...formData, scientificName: e.target.value})}
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">{t('conservationStatus')}</label>
                <input 
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                  value={formData.conservationStatus}
                  onChange={e => setFormData({...formData, conservationStatus: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                 <label className="text-sm font-medium text-slate-700">
                    {isPlant ? t('maturityFlowering') : t('sexualMaturity')}
                 </label>
                 <input 
                    type="number"
                    step="0.1"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                    value={formData.sexualMaturityAgeYears}
                    onChange={e => setFormData({...formData, sexualMaturityAgeYears: Number(e.target.value)})}
                 />
              </div>

              {isPlant ? (
                 <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">{t('classification')}</label>
                    <select 
                       className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                       value={formData.plantClassification || 'Monoecious'}
                       onChange={e => setFormData({...formData, plantClassification: e.target.value as PlantClassification})}
                    >
                       <option value="Monoecious">{t('monoecious')}</option>
                       <option value="Dioecious">{t('dioecious')}</option>
                    </select>
                 </div>
              ) : (
                <div className="space-y-2">
                   <label className="text-sm font-medium text-slate-700">{t('adultWeight')}</label>
                   <input 
                      type="number"
                      step="0.1"
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                      value={formData.averageAdultWeightKg}
                      onChange={e => setFormData({...formData, averageAdultWeightKg: Number(e.target.value)})}
                   />
                </div>
              )}

              {/* Life Expectancy - Only for Animals */}
              {!isPlant && (
                <div className="space-y-2">
                   <label className="text-sm font-medium text-slate-700">{t('lifeExpectancy')}</label>
                   <input 
                      type="number"
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                      value={formData.lifeExpectancyYears}
                      onChange={e => setFormData({...formData, lifeExpectancyYears: Number(e.target.value)})}
                   />
                </div>
              )}
              
              {/* Seasonality */}
              <div className="space-y-2 col-span-1 md:col-span-2">
                 <label className="text-sm font-medium text-slate-700">{isPlant ? t('floweringSeason') : t('breedingSeason')}</label>
                 <div className="flex gap-4 items-center">
                    <select 
                       className="flex-1 px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                       value={formData.breedingSeasonStart}
                       onChange={e => setFormData({...formData,breedingSeasonStart: Number(e.target.value)})}
                    >
                       <option value={0}>{t('unknown')}</option>
                       {MONTHS.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
                    </select>
                    <span className="text-slate-500">to</span>
                    <select 
                       className="flex-1 px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                       value={formData.breedingSeasonEnd}
                       onChange={e => setFormData({...formData, breedingSeasonEnd: Number(e.target.value)})}
                    >
                       <option value={0}>{t('unknown')}</option>
                       {MONTHS.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
                    </select>
                 </div>
              </div>

              <div className="space-y-2 col-span-1 md:col-span-2">
                  <label className="text-sm font-medium text-slate-700">{t('uploadImage')}</label>
                  <div className="flex items-center space-x-3">
                    <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 border border-slate-300">
                       <Camera size={18} />
                       <span>{t('uploadImage')}</span>
                       <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    </label>
                    {formData.imageUrl ? (
                      <div className="flex items-center space-x-2">
                        <img src={formData.imageUrl} alt="Preview" className="w-12 h-12 rounded object-cover border border-slate-200" />
                        <span className="text-xs text-emerald-600 font-medium">{t('imageSelected')}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">Auto-generated pattern used if none uploaded.</span>
                    )}
                  </div>
              </div>
              
              {/* Native Status Manual Override */}
              {org?.showNativeStatus !== false && (
                 <div className="col-span-1 md:col-span-2 border-t border-slate-100 pt-4">
                    <h4 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
                       <MapPin size={16} /> {t('nativeStatusRange')}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg">
                       <div className="space-y-2">
                          <label className="text-xs font-medium text-slate-600">{t('inCountry')}</label>
                          <select 
                             className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded outline-none bg-white text-slate-900"
                             value={formData.nativeStatusCountry || 'Unknown'}
                             onChange={(e) => setFormData({...formData, nativeStatusCountry: e.target.value as NativeStatus})}
                          >
                             <option value="Unknown">{t('unknown')}</option>
                             <option value="Native">{t('native')}</option>
                             <option value="Introduced">{t('introduced')}</option>
                             <option value="Invasive">{t('invasive')}</option>
                          </select>
                       </div>
                       <div className="space-y-2">
                          <label className="text-xs font-medium text-slate-600">{t('inLocalArea')}</label>
                          <select 
                             className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded outline-none bg-white text-slate-900"
                             value={formData.nativeStatusLocal || 'Unknown'}
                             onChange={(e) => setFormData({...formData, nativeStatusLocal: e.target.value as NativeStatus})}
                          >
                             <option value="Unknown">{t('unknown')}</option>
                             <option value="Native">{t('native')}</option>
                             <option value="Introduced">{t('introduced')}</option>
                             <option value="Invasive">{t('invasive')}</option>
                          </select>
                       </div>
                    </div>
                 </div>
              )}
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
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-2.5 rounded-lg font-medium transition-colors shadow-sm">
                  {editingId ? t('updateSpecies') : t('saveSpecies')}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedSpecies.map(species => (
            <div key={species.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow group relative">
              
              <div className="absolute top-2 right-2 z-10 flex space-x-2 opacity-0 group-hover:opacity-100 transition-all">
                <button 
                   onClick={() => handleEdit(species)}
                   className="bg-white/90 p-2 rounded-full text-slate-600 hover:text-emerald-600 shadow-sm"
                   title={t('edit')}
                >
                   <Pencil size={16} />
                </button>
              </div>

              <div className="h-48 bg-slate-200 relative overflow-hidden">
                 <img src={species.imageUrl} alt={species.commonName} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                 <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-full flex items-center gap-2">
                    <span>{species.conservationStatus}</span>
                    {species.type === 'Plant' && <span className="bg-green-500 text-white text-[10px] px-1.5 py-0.5 rounded">{t('plant')}</span>}
                 </div>
              </div>
              <div className="p-5">
                <h3 className="text-xl font-bold text-slate-900">{species.commonName}</h3>
                <p className="text-sm text-slate-500 italic mb-2 flex items-center gap-1">
                    {species.scientificName}
                    <a 
                        href={`https://www.inaturalist.org/search?q=${encodeURIComponent(species.scientificName)}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-emerald-600 hover:text-emerald-800 inline-flex items-center ml-1"
                        title="View on iNaturalist"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <ExternalLink size={12} />
                    </a>
                </p>
                
                {/* Native Status Pills */}
                {org?.showNativeStatus !== false && (
                   <div className="flex flex-wrap gap-2 mb-4">
                      <NativeStatusPill status={species.nativeStatusCountry} context="Country" />
                      <NativeStatusPill status={species.nativeStatusLocal} context="Area" />
                   </div>
                )}
                
                <div className="space-y-2 text-sm text-slate-600">
                  <div className="flex justify-between">
                     <span>Maturity:</span>
                     <span className="font-medium text-slate-900">{species.sexualMaturityAgeYears} yrs</span>
                  </div>
                  {species.type === 'Plant' ? (
                     <div className="flex justify-between">
                        <span>Classification:</span>
                        <span className="font-medium text-slate-900">{species.plantClassification || 'Monoecious'}</span>
                     </div>
                  ) : (
                     <div className="flex justify-between">
                        <span>Avg Weight:</span>
                        <span className="font-medium text-slate-900">{species.averageAdultWeightKg} kg</span>
                     </div>
                  )}
                  {species.type !== 'Plant' && (
                     <div className="flex justify-between">
                        <span>Lifespan:</span>
                        <span className="font-medium text-slate-900">{species.lifeExpectancyYears} yrs</span>
                     </div>
                  )}
                  {species.breedingSeasonStart && species.breedingSeasonEnd ? (
                     <div className="flex justify-between">
                        <span>{species.type === 'Plant' ? 'Flowering' : 'Breeding'}:</span>
                        <span className="font-medium text-slate-900">
                           {getMonthName(species.breedingSeasonStart)} - {getMonthName(species.breedingSeasonEnd)}
                        </span>
                     </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
          {sortedSpecies.length === 0 && (
            <div className="col-span-full text-center py-12 text-slate-400">
               No species found in this project matching your criteria.
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left">
             <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                   <th className="px-6 py-4 font-semibold text-slate-700 text-sm cursor-pointer hover:bg-slate-100" onClick={() => toggleSort('commonName')}>
                      <div className="flex items-center gap-1">
                        {t('species')} {sortBy === 'commonName' && (sortOrder === 'asc' ? <ArrowDownAZ size={14}/> : <ArrowUpAZ size={14}/>)}
                      </div>
                   </th>
                   <th className="px-6 py-4 font-semibold text-slate-700 text-sm cursor-pointer hover:bg-slate-100" onClick={() => toggleSort('scientificName')}>
                      <div className="flex items-center gap-1">
                        {t('scientificName')} {sortBy === 'scientificName' && (sortOrder === 'asc' ? <ArrowDownAZ size={14}/> : <ArrowUpAZ size={14}/>)}
                      </div>
                   </th>
                   {org?.showNativeStatus !== false && (
                      <th className="px-6 py-4 font-semibold text-slate-700 text-sm">{t('nativeStatusRange')}</th>
                   )}
                   <th className="px-6 py-4 font-semibold text-slate-700 text-sm">{t('status')}</th>
                   <th className="px-6 py-4 font-semibold text-slate-700 text-sm">Statistics</th>
                   <th className="px-6 py-4 font-semibold text-slate-700 text-sm text-right">{t('action')}</th>
                </tr>
             </thead>
             <tbody className="divide-y divide-slate-100">
                {sortedSpecies.map(species => (
                   <tr key={species.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4">
                         <div className="flex items-center gap-3">
                            <img src={species.imageUrl} alt={species.commonName} className="w-10 h-10 rounded-lg object-cover bg-slate-200" />
                            <span className="font-bold text-slate-900">{species.commonName}</span>
                         </div>
                      </td>
                      <td className="px-6 py-4 italic text-slate-600">
                        <div className="flex items-center gap-2">
                            {species.scientificName}
                            <a 
                                href={`https://www.inaturalist.org/search?q=${encodeURIComponent(species.scientificName)}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-emerald-600 hover:text-emerald-800"
                                title="View on iNaturalist"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <ExternalLink size={14} />
                            </a>
                        </div>
                      </td>
                      {org?.showNativeStatus !== false && (
                         <td className="px-6 py-4">
                            <div className="flex flex-col gap-1">
                               <NativeStatusPill status={species.nativeStatusCountry} context="Country" />
                               <NativeStatusPill status={species.nativeStatusLocal} context="Area" />
                            </div>
                         </td>
                      )}
                      <td className="px-6 py-4">
                         <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs font-medium border border-slate-200 block w-fit mb-1">
                            {species.conservationStatus}
                         </span>
                         {species.type === 'Plant' ? (
                            <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-bold">{t('plant')}</span>
                         ) : (
                            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-bold">{t('animal')}</span>
                         )}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                         <div className="flex flex-col">
                            <span>Maturity: {species.sexualMaturityAgeYears} yrs</span>
                            {species.breedingSeasonStart && species.breedingSeasonEnd && (
                               <span className="text-xs text-slate-500">
                                 Season: {getMonthName(species.breedingSeasonStart)} - {getMonthName(species.breedingSeasonEnd)}
                               </span>
                            )}
                         </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                         <button 
                            onClick={() => handleEdit(species)}
                            className="text-slate-400 hover:text-emerald-600 transition-colors p-2 rounded-full hover:bg-emerald-50"
                            title={t('edit')}
                         >
                            <Pencil size={18} />
                         </button>
                      </td>
                   </tr>
                ))}
                {sortedSpecies.length === 0 && (
                  <tr>
                    <td colSpan={org?.showNativeStatus !== false ? 6 : 5} className="px-6 py-8 text-center text-slate-400 italic">No species found in this project.</td>
                  </tr>
                )}
             </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default SpeciesManager;
