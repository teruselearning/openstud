import React, { useState, useEffect, useContext, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getSpecies, saveSpecies, generatePattern, getOrg, getProjects, getIndividuals, getAiUsageInfo, deleteSpecies } from '../services/storage';
import { Individual } from '../types';
import { fetchSpeciesData, generateSpeciesImage, fetchWikimediaImage, urlToBase64, ensureApiKeySelection } from '../services/geminiService';
import { Species, SpeciesType, PlantClassification, Organization, Project } from '../types';
import { Plus, Sparkles, Loader2, Camera, Download, Pencil, LayoutGrid, List, Search, X as XIcon, ImageIcon, Dna, PawPrint, FileSpreadsheet, FileUp, Activity, Weight, FolderOpen, PartyPopper, ArrowRight, Users, Trash2, Square, CheckSquare, MapPin, Info } from 'lucide-react';
import { LanguageContext } from '../App';
import ConfirmModal from '../components/ConfirmModal';
import LazyImage from '../components/LazyImage';

interface SpeciesManagerProps {
  currentProjectId: string;
  syncVersion?: number;
}

/** Returns Tailwind classes for a NativeStatus value */
const nativeStatusStyle = (status: string) => {
  switch (status) {
    case 'Native':     return 'bg-green-100 text-green-700 border-green-200';
    case 'Non-Native':
    case 'Introduced': return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'Invasive':   return 'bg-red-100 text-red-700 border-red-200';
    case 'Endemic':    return 'bg-blue-100 text-blue-700 border-blue-200';
    default:           return 'bg-slate-100 text-slate-500 border-slate-200';
  }
};

/** Display label: "Introduced" becomes "Non-Native" for backward compatibility */
const nativeStatusLabel = (status: string) =>
  status === 'Introduced' ? 'Non-Native' : status;

const SpeciesManager: React.FC<SpeciesManagerProps> = ({ currentProjectId, syncVersion = 0 }) => {
  const { t } = useContext(LanguageContext);
  const location = useLocation();
  const navigate = useNavigate();
  const [allSpecies, setAllSpecies] = useState<Species[]>([]);
  const [allIndividuals, setAllIndividuals] = useState<Individual[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [org, setOrg] = useState<Organization | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);
  const [imageStatus, setImageStatus] = useState<string>(''); 
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'commonName' | 'scientificName'>('commonName');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkTotal, setBulkTotal] = useState(0);
  const [bulkStatus, setBulkStatus] = useState('');
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [aiLimitInfo, setAiLimitInfo] = useState(() => getAiUsageInfo());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const editIdConsumed = useRef(false);

  // Delete confirmation modal state
  type DeleteTarget = { ids: string[]; label: string } | null;
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [formData, setFormData] = useState<Partial<Species>>({
    commonName: '',
    scientificName: '',
    type: 'Animal',
    projectId: currentProjectId === 'ALL_PROJECTS' ? '' : currentProjectId,
    plantClassification: undefined,
    conservationStatus: '',
    sexualMaturityAgeYears: 0,
    averageAdultWeightKg: 0,
    lifeExpectancyYears: 0,
    breedingSeasonStart: 1,
    breedingSeasonEnd: 12,
    imageUrl: '',
    nativeStatusCountry: 'Unknown',
    nativeStatusLocal: 'Unknown',
    isGenerallyPresent: false
  });

  useEffect(() => {
    const species = getSpecies();
    const projs = getProjects();
    console.log(`[SpeciesManager] useEffect: syncVersion=${syncVersion}, currentProjectId="${currentProjectId}", cache=${species.length} species, ${projs.length} projects`);
    setAllSpecies(species);
    setAllIndividuals(getIndividuals());
    setOrg(getOrg());
    setAllProjects(projs);

    if (location.state?.onboarding) {
       setShowOnboarding(true);
       window.history.replaceState({}, document.title);
    }

    if (!editIdConsumed.current && location.state?.editId && species.length > 0) {
       const spToEdit = species.find(s => s.id === location.state.editId);
       if (spToEdit) {
          editIdConsumed.current = true;
          setEditingId(spToEdit.id);
          setFormData({ ...spToEdit });
          setShowForm(true);
          window.history.replaceState({}, document.title);
       }
    }

    if (!editingId && projs.length === 1 && !formData.projectId) {
       setFormData(prev => ({ ...prev, projectId: projs[0].id }));
    }
  }, [currentProjectId, editingId, location.state, syncVersion]);

  // Reload data whenever a background sync completes — handles the case where the
  // component was already mounted before sync finished (e.g. session restored while
  // IndexedDB was empty), so the dep-based useEffect above wouldn't re-fire.
  useEffect(() => {
    const onDataRefreshed = () => {
      setAllSpecies(getSpecies());
      setAllIndividuals(getIndividuals());
      setOrg(getOrg());
      setAllProjects(getProjects());
      setAiLimitInfo(getAiUsageInfo());
    };
    window.addEventListener('os-data-refreshed', onDataRefreshed);
    return () => window.removeEventListener('os-data-refreshed', onDataRefreshed);
  }, []);

  const handleAutoFill = async () => {
    if (!formData.commonName && !formData.scientificName) return;
    const lookupName = formData.commonName || formData.scientificName || '';
    setLoadingAI(true);
    setLoadingImage(true);
    setImageStatus('RESEARCHING BIOLOGY...');
    
    try {
      const data = await fetchSpeciesData(lookupName, formData.type as SpeciesType, org?.location || '');
      if (data) {
        setFormData(prev => ({ 
          ...prev, ...data, type: (data.type || prev.type || 'Animal') as SpeciesType,
          nativeStatusCountry: (data.nativeStatusCountry as any) || 'Unknown',
          nativeStatusLocal: (data.nativeStatusLocal as any) || 'Unknown'
        }));
      }

      setImageStatus('WIKIMEDIA (LATIN)...');
      let finalImageUrl = await fetchWikimediaImage(data?.scientificName || formData.scientificName || '');
      
      if (!finalImageUrl) {
        setImageStatus('WIKIMEDIA (COMMON)...');
        finalImageUrl = await fetchWikimediaImage(data?.commonName || formData.commonName || lookupName);
      }
      
      if (!finalImageUrl) {
        setImageStatus('GEMINI AI DRAWING...');
        finalImageUrl = await generateSpeciesImage(lookupName, data?.scientificName || '', (data?.type || formData.type) as SpeciesType);
      }
      
      if (finalImageUrl) setFormData(prev => ({ ...prev, imageUrl: finalImageUrl || prev.imageUrl }));
    } catch (e: any) {
        console.error("AI Error:", e);
        const isLimitError = String(e.message).startsWith('INTERNAL_LIMIT');
        if (isLimitError) {
          setAiLimitInfo(getAiUsageInfo());
          alert("Monthly AI usage limit reached. Go to Organisation Settings → AI Integration to add your own Gemini API key and remove the cap.");
        } else {
          alert("AI enrichment failed: " + e.message);
        }
    } finally { setLoadingAI(false); setLoadingImage(false); setImageStatus(''); }
  };

  const handleGenerateAIImage = async () => {
     const lookupName = formData.commonName || formData.scientificName;
     if (!lookupName) return;
     setLoadingImage(true);
     setImageStatus('GENERATING...');
     try {
        const url = await generateSpeciesImage(lookupName, formData.scientificName || lookupName, formData.type as SpeciesType);
        if (url) setFormData(prev => ({ ...prev, imageUrl: url }));
     } catch (e: any) {
        const isLimitError = String((e as any).message).startsWith('INTERNAL_LIMIT');
        setAiLimitInfo(getAiUsageInfo());
        alert(isLimitError ? "Monthly AI usage limit reached. An administrator can increase or remove the limit in Organisation Settings." : "Image generation failed: " + (e as any).message);
     } finally { setImageStatus(''); setLoadingImage(false); }
  };

  const handleEdit = (species: Species) => { setEditingId(species.id); setFormData({ ...species }); setShowForm(true); };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ 
      commonName: '', scientificName: '', type: 'Animal', conservationStatus: '', sexualMaturityAgeYears: 0, 
      averageAdultWeightKg: 0, lifeExpectancyYears: 0, breedingSeasonStart: 1, breedingSeasonEnd: 12, 
      imageUrl: '', nativeStatusCountry: 'Unknown', nativeStatusLocal: 'Unknown',
      isGenerallyPresent: false,
      projectId: currentProjectId === 'ALL_PROJECTS' ? (allProjects.length === 1 ? allProjects[0].id : '') : currentProjectId
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isAll = currentProjectId === 'ALL_PROJECTS';
    const targetProjectId = allProjects.length === 1 ? allProjects[0].id : (isAll ? formData.projectId : currentProjectId);
    
    if (!targetProjectId) {
       alert("Please select a specific project for this species.");
       return;
    }

    if (!formData.commonName && !formData.scientificName) {
       alert("Please provide at least a Common Name or a Scientific Name.");
       return;
    }

    setIsSaving(true);
    try {
      const primaryName = formData.commonName || formData.scientificName || 'Unknown';
      const finalSpecies: Species = {
         ...formData as Species,
         id: editingId || `sp-${Date.now()}`,
         projectId: targetProjectId,
         commonName: primaryName,
         scientificName: formData.scientificName || primaryName,
         imageUrl: formData.imageUrl || generatePattern(primaryName),
         sexualMaturityAgeYears: Number(formData.sexualMaturityAgeYears || 0),
         averageAdultWeightKg: Number(formData.averageAdultWeightKg || 0),
         lifeExpectancyYears: Number(formData.lifeExpectancyYears || 0)
      };
      const updated = editingId ? allSpecies.map(sp => sp.id === editingId ? finalSpecies : sp) : [...allSpecies, finalSpecies];
      setAllSpecies(updated);
      handleCloseForm();
      // Fire-and-forget: upload images + sync to server in background
      saveSpecies(updated).catch(e => {
        console.error('Species save failed:', e);
        window.dispatchEvent(new CustomEvent('os-sync-error', { detail: 'Species could not be saved to the server.' }));
      });
    } catch (err) {
      alert("Database Error: Could not save species.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSpecies = (id: string) => {
    const sp = allSpecies.find(s => s.id === id);
    const label = sp ? (sp.commonName || sp.scientificName || 'this species') : 'this species';
    setDeleteTarget({ ids: [id], label });
  };

  const handleBulkDeleteSpecies = () => {
    setDeleteTarget({ ids: [...selectedIds], label: `${selectedIds.size} species` });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      for (const id of deleteTarget.ids) {
        await deleteSpecies(id);
      }
      setAllSpecies(getSpecies());
      setSelectedIds(new Set());
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const isAll = currentProjectId === 'ALL_PROJECTS';
  const filteredSpecies = allSpecies.filter(sp => 
    (isAll || sp.projectId === currentProjectId) && 
    (sp.commonName.toLowerCase().includes(searchQuery.toLowerCase()) || sp.scientificName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const sortedSpecies = [...filteredSpecies].sort((a, b) => {
    const valA = (a[sortBy] || '').toString().toLowerCase();
    const valB = (b[sortBy] || '').toString().toLowerCase();
    return sortOrder === 'asc' ? (valA < valB ? -1 : 1) : (valA > valB ? -1 : 1);
  });

  const speciesImageCache: Record<string, string> = {};
  for (const ind of allIndividuals) {
    if (ind.imageUrl && !speciesImageCache[ind.speciesId]) {
      speciesImageCache[ind.speciesId] = ind.imageUrl;
    }
  }

  return (
    <div className="space-y-6">
      {/* AI Usage limit banner */}
      {aiLimitInfo.isAtLimit && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <span className="text-amber-500 mt-0.5">⚠️</span>
          <div>
            <p className="font-semibold">Monthly AI usage limit reached ({aiLimitInfo.count} / {aiLimitInfo.limit} calls used)</p>
            <p className="text-amber-700">AI Auto-Fill and AI image generation are unavailable until next month's reset. To remove the cap entirely, go to <strong>Organisation Settings → AI Integration</strong> and add your own Gemini API key — this makes AI unlimited for your organisation.</p>
          </div>
        </div>
      )}
      {!aiLimitInfo.isAtLimit && !aiLimitInfo.isUnlimited && aiLimitInfo.percentUsed >= 80 && (
        <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-800">
          <span className="mt-0.5">ℹ️</span>
          <p>AI usage is at <strong>{aiLimitInfo.percentUsed}%</strong> of this month's limit ({aiLimitInfo.count} / {aiLimitInfo.limit} calls). Consider increasing the limit in Organisation Settings if you need more.</p>
        </div>
      )}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t('speciesDatabase')}</h2>
          <p className="text-slate-500">{t('speciesSubtitle')}</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:flex-none">
            <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder={t('searchSpecies')} className="w-full md:w-64 pl-9 pr-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm outline-none focus:ring-2 focus:ring-emerald-500" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          {selectedIds.size > 0 && (
            <button
              onClick={handleBulkDeleteSpecies}
              disabled={isDeletingBulk}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-all disabled:opacity-60"
            >
              {isDeletingBulk ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              <span>Delete {selectedIds.size}</span>
            </button>
          )}
          <button onClick={() => setShowForm(true)} className="flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-all"><Plus size={18} /><span>{t('add')}</span></button>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[3000] bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl animate-in zoom-in duration-200 flex flex-col my-8 max-h-[90vh]">
            <div className="p-6 bg-slate-50 border-b border-slate-200 flex justify-between items-center rounded-t-2xl shrink-0">
               <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg"><Plus size={20}/></div>
                  <h3 className="font-bold text-xl text-slate-900">{editingId ? t('updateSpecies') : t('add')}</h3>
               </div>
               <button onClick={handleCloseForm} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors"><XIcon size={24} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-8 space-y-8 overflow-y-auto">
              <div className="space-y-8">
                 <div className="space-y-6">
                    <div className="space-y-4">
                       <h4 className="font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2"><Dna size={18} className="text-emerald-500"/> Scientific Taxonomy</h4>
                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase">{t('commonName')}</label>
                            <input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.commonName} onChange={e => setFormData({...formData, commonName: e.target.value})} placeholder={t('commonNamePlaceholder')} />
                            {/* Autofill button now under common name */}
                            <button type="button" onClick={handleAutoFill} disabled={loadingAI || (!formData.commonName && !formData.scientificName)} className="w-full justify-center text-xs bg-purple-100 text-purple-700 hover:bg-purple-200 px-3 py-2 rounded-lg font-bold flex items-center gap-2 transition-all disabled:opacity-50">
                                {loadingAI ? <Loader2 className="animate-spin" size={14}/> : <Sparkles size={14}/>} {t('autofill')} Species Profile
                            </button>
                          </div>
                          <div className="space-y-2"><label className="text-xs font-bold text-slate-500 uppercase">{t('scientificName')}</label><input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 outline-none italic" value={formData.scientificName} onChange={e => setFormData({...formData, scientificName: e.target.value})} placeholder={t('scientificNamePlaceholder')} /></div>
                          <div className="space-y-2"><label className="text-xs font-bold text-slate-500 uppercase">{t('type')}</label><select className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value as SpeciesType, plantClassification: e.target.value === 'Plant' ? 'Monoecious' : undefined})}><option value="Animal">{t('animal')}</option><option value="Plant">{t('plant')}</option></select></div>
                          <div className="space-y-2"><label className="text-xs font-bold text-slate-500 uppercase">{t('conservationStatus')}</label><input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.conservationStatus} onChange={e => setFormData({...formData, conservationStatus: e.target.value})} placeholder="e.g. Critically Endangered" /></div>
                       </div>
                    </div>
                    <div className="space-y-4 pt-4 border-t border-slate-100">
                       <h4 className="font-bold text-slate-800 flex items-center gap-2"><Activity size={18} className="text-blue-500"/> Biological Metrics</h4>
                       <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                          <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">{formData.type === 'Plant' ? t('maturityFlowering') : t('sexualMaturity')}</label><input type="number" step="0.1" className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white outline-none" value={formData.sexualMaturityAgeYears} onChange={e => setFormData({...formData, sexualMaturityAgeYears: parseFloat(e.target.value)})} /></div>
                          <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">{t('lifeExpectancy')}</label><input type="number" step="1" className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white outline-none" value={formData.lifeExpectancyYears} onChange={e => setFormData({...formData, lifeExpectancyYears: parseFloat(e.target.value)})} /></div>
                          {formData.type === 'Animal' ? (
                             <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">{t('adultWeight')} (Kg)</label><div className="relative"><Weight size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="number" step="0.01" className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg bg-white outline-none" value={formData.averageAdultWeightKg} onChange={e => setFormData({...formData, averageAdultWeightKg: parseFloat(e.target.value)})} /></div></div>
                          ) : (
                             <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">{t('classification')}</label><select className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.plantClassification} onChange={e => setFormData({...formData, plantClassification: e.target.value as PlantClassification})}><option value="Monoecious">{t('monoecious')}</option><option value="Dioecious">{t('dioecious')}</option></select></div>
                          )}
                       </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-slate-100">
                       <h4 className="font-bold text-slate-800 flex items-center gap-2"><Info size={18} className="text-slate-400"/> Description</h4>
                       <textarea
                         rows={4}
                         className="w-full px-4 py-3 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 outline-none text-sm leading-relaxed resize-none"
                         placeholder="Describe the species — appearance, reproductive behaviour, native distribution. This is filled automatically when you use Autofill."
                         value={formData.description || ''}
                         onChange={e => setFormData({...formData, description: e.target.value})}
                       />
                    </div>

                    {/* Native Status override */}
                    <div className="space-y-3 pt-4 border-t border-slate-100">
                      <h4 className="font-bold text-slate-800 flex items-center gap-2"><MapPin size={18} className="text-green-500"/> Native Status</h4>
                      <p className="text-xs text-slate-500">Is this species native to your organisation's location? AI autofill determines this automatically — override it here if needed.</p>
                      <div className="flex flex-wrap gap-2">
                        {(['Unknown', 'Native', 'Non-Native', 'Invasive', 'Endemic'] as const).map(status => {
                          const isActive = (formData.nativeStatusLocal || 'Unknown') === status;
                          return (
                            <button
                              key={status}
                              type="button"
                              onClick={() => setFormData({ ...formData, nativeStatusLocal: status })}
                              className={`px-4 py-1.5 rounded-full text-sm font-bold border transition-all ${
                                isActive
                                  ? status === 'Unknown'
                                    ? 'bg-slate-200 text-slate-700 border-slate-400'
                                    : `${nativeStatusStyle(status)} border-2`
                                  : 'bg-white text-slate-400 border-slate-200 hover:border-slate-400 hover:text-slate-600'
                              }`}
                            >
                              {status}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Presence toggle */}
                    <div className="space-y-3 pt-4 border-t border-slate-100">
                      <h4 className="font-bold text-slate-800 flex items-center gap-2"><PawPrint size={18} className="text-teal-500"/> Presence</h4>
                      <p className="text-xs text-slate-500">Mark this species as generally present in your collection or facility.</p>
                      <label className="flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors bg-white border-slate-200 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          className="mt-0.5 accent-emerald-600 shrink-0"
                          checked={!!formData.isGenerallyPresent}
                          onChange={(e) => setFormData({ ...formData, isGenerallyPresent: e.target.checked })}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-semibold text-slate-700 block">Generally present</span>
                          <span className="text-[11px] text-slate-400">Species is present at your facility (no specific individual tracked)</span>
                        </div>
                      </label>
                    </div>

                    {/* Image section moved to the bottom */}
                    <div className="space-y-4 pt-6 border-t border-slate-100">
                       <h4 className="font-bold text-slate-800 flex items-center gap-2"><ImageIcon size={18} className="text-purple-500"/> Representative Media</h4>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                          <div className="aspect-video w-full rounded-xl bg-slate-100 border-2 border-dashed border-slate-300 overflow-hidden relative group shadow-inner">
                             {formData.imageUrl ? <img src={formData.imageUrl} className="w-full h-full object-cover" /> : <div className="flex flex-col items-center justify-center h-full text-slate-400 p-6 text-center"><ImageIcon size={48} className="mb-2 opacity-20"/><p className="text-xs">{t('noImageProvided')}</p></div>}
                             {loadingImage && <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 text-center p-4"><Loader2 className="animate-spin text-emerald-600 mb-2" size={32}/><span className="text-[10px] font-bold text-slate-600 tracking-widest">{imageStatus || 'LOADING...'}</span></div>}
                          </div>
                          <div className="space-y-3">
                             <p className="text-xs text-slate-500 leading-relaxed">Provide a high-quality reference image for this species. You can upload a custom file or use our AI to generate a scientific illustration.</p>
                             <div className="grid grid-cols-1 gap-2">
                                <label className="cursor-pointer bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 text-xs font-bold shadow-sm"><Camera size={14} /> {t('upload')}<input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if(f) { const r = new FileReader(); r.onload = () => setFormData({...formData, imageUrl: r.result as string}); r.readAsDataURL(f); } }} /></label>
                                <button type="button" onClick={handleGenerateAIImage} disabled={loadingImage || (!formData.commonName && !formData.scientificName)} className="bg-purple-600 hover:bg-purple-700 text-white py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 text-xs font-bold shadow-sm disabled:opacity-50"><Sparkles size={14} /> {t('aiGenerate')}</button>
                             </div>
                          </div>
                       </div>
                    </div>
                 </div>
              </div>
              <div className="flex justify-end pt-6 border-t border-slate-100 space-x-3 shrink-0">
                <button type="button" onClick={handleCloseForm} className="px-6 py-2.5 text-slate-600 hover:bg-slate-100 rounded-lg font-bold">{t('cancel')}</button>
                <button type="submit" disabled={isSaving} className="bg-emerald-600 hover:bg-emerald-700 text-white px-10 py-2.5 rounded-lg font-bold shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                  {isSaving ? <Loader2 size={18} className="animate-spin" /> : null}
                  {isSaving ? (editingId ? t('updating') : t('saving')) : (editingId ? t('updateSpecies') : t('saveSpecies'))}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showOnboarding && (
        <div className="fixed inset-0 z-[5000] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
           <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-300">
             <div className="p-8 text-center flex flex-col items-center">
               <div className="mb-6 p-6 bg-emerald-50 rounded-full">
                  <Dna className="text-emerald-500" size={48} />
               </div>
               <h3 className="text-2xl font-black text-slate-900 mb-3">{t('species')}</h3>
               <p className="text-slate-500 mb-8 leading-relaxed px-4">{t('onboardingSpeciesTask')}</p>
               <button onClick={() => setShowOnboarding(false)} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100 flex items-center justify-center gap-2">
                 Start Adding <ArrowRight size={20} />
               </button>
             </div>
           </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sortedSpecies.map(species => {
          const indCount = allIndividuals.filter(i => i.speciesId === species.id).length;
          const isSelected = selectedIds.has(species.id);
          const canDelete = indCount === 0;
          return (
            <div key={species.id} onClick={() => navigate(`/species/${species.id}`)} className={`bg-white rounded-2xl shadow-sm border overflow-hidden hover:shadow-xl transition-all group relative flex flex-col h-full cursor-pointer ${isSelected ? 'border-red-400 ring-2 ring-red-200' : 'border-slate-200'}`}>
              {/* Checkbox (top-left) */}
              <button
                onClick={(e) => { e.stopPropagation(); canDelete && toggleSelect(species.id); }}
                title={canDelete ? (isSelected ? 'Deselect' : 'Select for deletion') : 'Cannot delete: has individuals'}
                className={`absolute top-3 left-3 z-10 p-1 rounded-full transition-all shadow ${canDelete ? 'cursor-pointer opacity-0 group-hover:opacity-100' : 'cursor-not-allowed opacity-0 group-hover:opacity-40'} ${isSelected ? '!opacity-100' : ''}`}
              >
                {isSelected
                  ? <CheckSquare size={20} className="text-red-500 drop-shadow" />
                  : <Square size={20} className={`${canDelete ? 'text-white drop-shadow' : 'text-slate-300'}`} />
                }
              </button>
              {/* Edit + Delete buttons (top-right) */}
              <div className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-all flex gap-1.5">
                <button onClick={(e) => { e.stopPropagation(); handleEdit(species); }} className="bg-white/90 p-2.5 rounded-full text-slate-600 hover:text-emerald-600 shadow-lg hover:scale-110 transition-all" title="Edit species"><Pencil size={16} /></button>
                {canDelete && (
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteSpecies(species.id); }} className="bg-white/90 p-2.5 rounded-full text-slate-600 hover:text-red-600 shadow-lg hover:scale-110 transition-all" title="Delete species"><Trash2 size={16} /></button>
                )}
              </div>
<div className="h-52 bg-slate-200 relative overflow-hidden">
                  <LazyImage
                    src={species.imageUrl || speciesImageCache[species.id] || generatePattern(species.commonName)}
                    alt={species.commonName}
                    placeholder={generatePattern(species.commonName)}
                    className="w-full h-full"
                    imgClassName="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                 <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md text-white text-[10px] font-extrabold px-2.5 py-1 rounded-full border border-white/20 uppercase tracking-widest">{species.conservationStatus || 'Unknown'}</div>
                 <div className={`absolute bottom-3 left-3 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shadow-sm border ${species.type === 'Plant' ? 'bg-green-600 text-white border-green-400' : 'bg-blue-600 text-white border-blue-400'}`}>{species.type === 'Plant' ? 'Flora' : 'Fauna'}</div>
              </div>
              <div className="p-5 flex-1 flex flex-col">
                <h3 className="text-xl font-bold text-slate-900 leading-tight mb-1">{species.commonName}</h3>
                <p className="text-sm text-slate-500 italic mb-2 font-serif">{species.scientificName}</p>
                {species.description && (
                  <p className="text-xs text-slate-500 leading-relaxed mb-3 line-clamp-2">{species.description}</p>
                )}
                <div className="grid grid-cols-2 gap-3">
                   <div className="bg-slate-50 p-2 rounded-lg border border-slate-100"><span className="text-[10px] font-bold text-slate-400 uppercase block">{t('maturity')}</span><span className="text-sm font-bold text-slate-700">{species.sexualMaturityAgeYears} years</span></div>
                   <div className="bg-slate-50 p-2 rounded-lg border border-slate-100"><span className="text-[10px] font-bold text-slate-400 uppercase block">{t('lifespan')}</span><span className="text-sm font-bold text-slate-700">{species.lifeExpectancyYears} years</span></div>
                </div>
                {/* Native status badge — single pill showing local status (falls back to national) */}
                {(() => {
                  const status =
                    (species.nativeStatusLocal && species.nativeStatusLocal !== 'Unknown')
                      ? species.nativeStatusLocal
                      : (species.nativeStatusCountry && species.nativeStatusCountry !== 'Unknown')
                        ? species.nativeStatusCountry
                        : null;
                  if (!status) return null;
                  return (
                    <div className="mt-3 flex items-center gap-1.5">
                      <MapPin size={11} className="text-slate-400 shrink-0" />
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${nativeStatusStyle(status)}`}>
                        {nativeStatusLabel(status)}
                      </span>
                    </div>
                  );
                })()}
                {indCount > 0 ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate('/individuals', { state: { filterSpeciesId: species.id } }); }}
                    className="mt-4 w-full flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-sm px-4 py-2.5 rounded-xl border border-emerald-100 transition-colors"
                  >
                    <Users size={15} />
                    {`View ${indCount} individual${indCount === 1 ? '' : 's'}`}
                  </button>
                ) : species.isGenerallyPresent ? (
                  <div className="mt-4 w-full flex items-center justify-center gap-2 bg-teal-50 text-teal-700 font-bold text-sm px-4 py-2.5 rounded-xl border border-teal-100">
                    <PawPrint size={15} />
                    Generally present
                  </div>
                ) : (
                  <div className="mt-4 w-full flex items-center justify-center gap-2 bg-slate-50 text-slate-400 font-medium text-sm px-4 py-2.5 rounded-xl border border-slate-100">
                    <Users size={15} />
                    No individuals yet
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {sortedSpecies.length === 0 && <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-dashed border-slate-300"><PawPrint size={48} className="text-slate-300 mb-4 opacity-50"/><p className="text-slate-500 font-medium">{t('noSpeciesFound')}</p></div>}

      <ConfirmModal
        isOpen={!!deleteTarget}
        title={deleteTarget?.ids.length === 1 ? 'Delete Species' : `Delete ${deleteTarget?.ids.length} Species`}
        message={
          <>
            Permanently delete <strong>{deleteTarget?.label}</strong>? This cannot be undone and will remove all associated records.
          </>
        }
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
        isLoading={isDeleting}
      />
    </div>
  );
};
export default SpeciesManager;