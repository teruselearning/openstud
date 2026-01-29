import React, { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { getSpecies, getIndividuals, saveIndividuals, generatePattern, saveSpecies, getOrg, getEnclosures, getProjects, deleteIndividual } from '../services/storage';
import { fetchSpeciesData, generateSpeciesImage, fetchWikimediaImage, urlToBase64 } from '../services/geminiService';
import { Species, Individual, Sex, SpeciesType, Organization, Enclosure, Project, PlantClassification } from '../types';
import { Plus, Search, Dna, PawPrint, Pencil, X as XIcon, Trash2, MapPin, Users, LayoutGrid, List, Map as MapIcon, Maximize2, ArrowRight, ArrowLeft, RefreshCw, Sprout, Loader2, FileUp, FileSpreadsheet, Sparkles, Download, CheckCircle, CheckSquare, Square, Eye, EyeOff, Box, ChevronDown, Save, User as UserIcon, FolderOpen, Weight, Scale, Ruler } from 'lucide-react';
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
  const locState = location.state as any;

  const [allIndividuals, setAllIndividuals] = useState<Individual[]>([]);
  const [allSpecies, setAllSpecies] = useState<Species[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [allEnclosures, setAllEnclosures] = useState<Enclosure[]>([]);
  const [org, setOrg] = useState<Organization | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSpeciesId, setFilterSpeciesId] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('current');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [returnToId, setReturnToId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [speciesSearchQuery, setSpeciesSearchQuery] = useState('');
  const [isSpeciesDropdownOpen, setIsSpeciesDropdownOpen] = useState(false);
  const speciesDropdownRef = useRef<HTMLDivElement>(null);

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
    if (locState?.editId && allIndividuals.length > 0) {
      const indToEdit = allIndividuals.find(i => i.id === locState.editId);
      if (indToEdit) {
        setEditingId(indToEdit.id);
        setReturnToId(locState.fromId || null);
        setFormData({ ...indToEdit });
        const sp = allSpecies.find(s => s.id === indToEdit.speciesId);
        setSpeciesSearchQuery(sp?.commonName || '');
        setShowForm(true);
        window.history.replaceState({}, document.title);
      }
    }
  }, [locState, allIndividuals, allSpecies]);

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

  const handleCloseForm = () => {
    setShowForm(false);
    if (returnToId) navigate(`/individuals/${returnToId}`);
    setEditingId(null);
    setReturnToId(null);
  };

  const handleCreateNewSpecies = async () => {
    if (!newSpeciesData.commonName && !newSpeciesData.scientificName) {
        alert("Please fill in at least the common or scientific name for the new species.");
        return;
    }
    
    setIsAiLoading(true);
    const targetProjectId = allProjects.length === 1 ? allProjects[0].id : (isAll ? formData.projectId : currentProjectId);
    
    try {
        const primaryName = (newSpeciesData.commonName || newSpeciesData.scientificName) as string;
        const kingdom = newSpeciesData.type as SpeciesType;
        const aiData = await fetchSpeciesData(primaryName, kingdom, org?.location || '');

        let spImg = await fetchWikimediaImage(aiData?.scientificName || primaryName) || '';
        if (!spImg) spImg = await generateSpeciesImage(primaryName, aiData?.scientificName || '', kingdom) || '';

        const newSp: Species = {
            id: `sp-${Date.now()}`,
            projectId: targetProjectId as string,
            commonName: newSpeciesData.commonName || aiData?.commonName || newSpeciesData.scientificName || 'Unknown',
            scientificName: newSpeciesData.scientificName || aiData?.scientificName || newSpeciesData.commonName || 'Unknown',
            type: kingdom,
            conservationStatus: aiData?.conservationStatus || newSpeciesData.conservationStatus || 'Unknown',
            sexualMaturityAgeYears: Number(aiData?.sexualMaturityAgeYears || 0),
            averageAdultWeightKg: Number(aiData?.averageAdultWeightKg || 0),
            lifeExpectancyYears: Number(aiData?.lifeExpectancyYears || 0),
            plantClassification: (aiData?.plantClassification as PlantClassification) || (kingdom === 'Plant' ? 'Monoecious' : undefined),
            imageUrl: spImg || generatePattern(primaryName),
            nativeStatusCountry: (aiData?.nativeStatusCountry as any) || 'Unknown',
            nativeStatusLocal: (aiData?.nativeStatusLocal as any) || 'Unknown'
        };
        
        const updated = [...allSpecies, newSp];
        await saveSpecies(updated); 
        setAllSpecies(updated);
        setFormData({ ...formData, speciesId: newSp.id });
        setSpeciesSearchQuery(newSp.commonName);
        setShowNewSpeciesForm(false);
    } catch (e: any) {
        alert("Failed to register species: " + e.message);
    } finally {
        setIsAiLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.speciesId || !formData.studbookId) return;
    const targetProjectId = allProjects.length === 1 ? allProjects[0].id : (isAll ? formData.projectId : currentProjectId);
    if (!targetProjectId) { alert("Please select a project."); return; }

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
    } catch (err: any) {
        alert("Database Error: Could not save specimen.");
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 relative pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t('individuals')}</h2>
          <p className="text-slate-500">{t('indivSubtitleAnimal')}</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex bg-white border border-slate-300 rounded-lg p-1 shadow-sm">
            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}><LayoutGrid size={18} /></button>
            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}><List size={18} /></button>
          </div>
          <button onClick={handleOpenNewForm} className="flex-1 md:flex-none flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-all"><Plus size={18} /><span>{t('add')}</span></button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white" placeholder={t('searchIndividuals')} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
      </div>

      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filtered.map(ind => {
            const sp = allSpecies.find(s => s.id === ind.speciesId);
            const displayImg = ind.imageUrl || sp?.imageUrl || generatePattern(ind.name);
            return (
              <div key={ind.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all group flex flex-col relative">
                <Link to={`/individuals/${ind.id}`} className="h-48 bg-slate-100 relative overflow-hidden block">
                  <img src={displayImg} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt={ind.name} />
                  <div className={`absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold text-white uppercase ${ind.sex === Sex.MALE ? 'bg-blue-600' : ind.sex === Sex.FEMALE ? 'bg-pink-600' : 'bg-slate-600'}`}>{ind.sex}</div>
                </Link>
                <div className="p-4 flex-1">
                  <Link to={`/individuals/${ind.id}`} className="block">
                    <h3 className="font-bold text-slate-900 group-hover:text-emerald-700 transition-colors truncate">{ind.name}</h3>
                  </Link>
                  <p className="text-xs text-slate-500 mb-2 truncate">{sp?.commonName}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-[4000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl animate-in zoom-in duration-200 flex flex-col my-8 max-h-[90vh]">
             <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
               <div className="flex items-center gap-3">
                 <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                   {editingId ? <Pencil size={20}/> : <Plus size={20}/>}
                 </div>
                 <h3 className="text-xl font-bold text-slate-900">{editingId ? t('updateIndividual') : t('registerIndividual')}</h3>
               </div>
               <button onClick={handleCloseForm} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors"><XIcon size={24}/></button>
             </div>
             
             <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-8">
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
                    <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100 space-y-4">
                       <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                             <label className="text-[10px] font-bold text-indigo-400 uppercase">{t('commonName')}</label>
                             <input className="w-full px-3 py-2 border border-indigo-200 rounded-lg text-sm" value={newSpeciesData.commonName} onChange={e => setNewSpeciesData({...newSpeciesData, commonName: e.target.value})} placeholder={t('commonNamePlaceholder')} />
                          </div>
                          <div>
                             <label className="text-[10px] font-bold text-indigo-400 uppercase">{t('scientificName')}</label>
                             <input className="w-full px-3 py-2 border border-indigo-200 rounded-lg text-sm italic" value={newSpeciesData.scientificName} onChange={e => setNewSpeciesData({...newSpeciesData, scientificName: e.target.value})} placeholder={t('scientificNamePlaceholder')} />
                          </div>
                          <div>
                             <label className="text-[10px] font-bold text-indigo-400 uppercase">{t('type')}</label>
                             <select className="w-full px-3 py-2 border border-indigo-200 rounded-lg text-sm bg-white" value={newSpeciesData.type} onChange={e => setNewSpeciesData({...newSpeciesData, type: e.target.value as SpeciesType})}>
                                <option value="Animal">{t('animal')}</option>
                                <option value="Plant">{t('plant')}</option>
                             </select>
                          </div>
                       </div>
                       <button type="button" onClick={handleCreateNewSpecies} disabled={isAiLoading} className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-xs font-bold hover:bg-indigo-700 shadow-sm flex items-center gap-2">
                         {isAiLoading ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14}/>}
                         Register Species
                       </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="relative" ref={speciesDropdownRef}>
                          <label className="text-xs font-bold text-slate-700 block mb-1">{t('species')} <span className="text-red-500">*</span></label>
                          <input 
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white" 
                            value={speciesSearchQuery} 
                            onChange={e => { setSpeciesSearchQuery(e.target.value); setIsSpeciesDropdownOpen(true); }} 
                            onFocus={() => setIsSpeciesDropdownOpen(true)} 
                            placeholder={t('searchSpecies')} 
                            required 
                          />
                          {isSpeciesDropdownOpen && (
                            <div className="absolute top-full left-0 right-0 z-50 bg-white border border-slate-200 rounded-lg shadow-xl mt-1 max-h-48 overflow-auto">
                                {speciesSearchResults.map(s => <button key={s.id} type="button" className="w-full text-left p-3 hover:bg-slate-50 border-b last:border-0" onClick={() => { setFormData({...formData, speciesId: s.id}); setSpeciesSearchQuery(s.commonName); setIsSpeciesDropdownOpen(false); }}>{s.commonName}</button>)}
                            </div>
                          )}
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-700 block mb-1">{t('studbookId')} <span className="text-red-500">*</span></label>
                          <input className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none font-mono text-sm" value={formData.studbookId} onChange={e => setFormData({...formData, studbookId: e.target.value})} required />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-700 block mb-1">{t('name')} <span className="text-red-500">*</span></label>
                          <input className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Specimen name" required />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 shrink-0">
                   <button type="button" onClick={handleCloseForm} className="px-8 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-all">Cancel</button>
                   <button type="submit" disabled={isSubmitting} className="bg-emerald-600 text-white px-10 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-emerald-700 transition-all">
                     {isSubmitting ? <Loader2 size={20} className="animate-spin" /> : <Save size={20}/>} 
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