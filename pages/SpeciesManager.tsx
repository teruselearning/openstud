
import React, { useState, useEffect, useContext } from 'react';
import { getSpecies, saveSpecies, generatePattern, getOrg, getProjects } from '../services/storage';
import { fetchSpeciesData, generateSpeciesImage, fetchWikimediaImage, urlToBase64, ensureApiKeySelection } from '../services/geminiService';
import { Species, SpeciesType, PlantClassification, Organization, Project } from '../types';
// Added FolderOpen to lucide-react imports to fix the error on line 341
import { Plus, Sparkles, Loader2, Camera, Download, Pencil, LayoutGrid, List, Search, X as XIcon, ImageIcon, Dna, PawPrint, FileSpreadsheet, FileUp, Activity, Weight, FolderOpen } from 'lucide-react';
import { LanguageContext } from '../App';

interface SpeciesManagerProps {
  currentProjectId: string;
}

const SpeciesManager: React.FC<SpeciesManagerProps> = ({ currentProjectId }) => {
  const { t } = useContext(LanguageContext);
  const [allSpecies, setAllSpecies] = useState<Species[]>([]);
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
    nativeStatusLocal: 'Unknown'
  });

  useEffect(() => {
    setAllSpecies(getSpecies());
    setOrg(getOrg());
    const projs = getProjects();
    setAllProjects(projs);

    if (!editingId && projs.length === 1 && !formData.projectId) {
       setFormData(prev => ({ ...prev, projectId: projs[0].id }));
    }
  }, [currentProjectId, editingId]);

  const handleAutoFill = async () => {
    if (!formData.commonName && !formData.scientificName) return;
    const lookupName = formData.commonName || formData.scientificName || '';
    setLoadingAI(true);
    setLoadingImage(true);
    setImageStatus('FETCHING DATA...');
    try {
      const data = await fetchSpeciesData(lookupName, formData.type as SpeciesType, org?.location || '');
      if (data) {
        setFormData(prev => ({ 
          ...prev, ...data, type: (data.type || prev.type || 'Animal') as SpeciesType,
          nativeStatusCountry: (data.nativeStatusCountry as any) || 'Unknown',
          nativeStatusLocal: (data.nativeStatusLocal as any) || 'Unknown'
        }));
      }
      setImageStatus('SEARCHING WIKIMEDIA...');
      let finalImageUrl = await fetchWikimediaImage(data?.scientificName || lookupName);
      if (!finalImageUrl) {
        setImageStatus('GENERATING AI ILLUSTRATION...');
        await ensureApiKeySelection();
        finalImageUrl = await generateSpeciesImage(lookupName, data?.scientificName || '', (data?.type || formData.type) as SpeciesType);
      }
      if (finalImageUrl) setFormData(prev => ({ ...prev, imageUrl: finalImageUrl || prev.imageUrl }));
    } catch (e: any) { 
        console.error("AI Error:", e);
        alert(e.message);
    } finally { setLoadingAI(false); setLoadingImage(false); setImageStatus(''); }
  };

  const handleGenerateAIImage = async () => {
     const lookupName = formData.commonName || formData.scientificName;
     if (!lookupName) return;
     setLoadingImage(true);
     setImageStatus('GENERATING...');
     try {
        await ensureApiKeySelection();
        const url = await generateSpeciesImage(lookupName, formData.scientificName || lookupName, formData.type as SpeciesType);
        if (url) setFormData(prev => ({ ...prev, imageUrl: url }));
     } catch (e: any) { alert("Image generation failed: " + e.message); } finally { setImageStatus(''); setLoadingImage(false); }
  };

  const handleEdit = (species: Species) => { setEditingId(species.id); setFormData({ ...species }); setShowForm(true); };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ 
      commonName: '', scientificName: '', type: 'Animal', conservationStatus: '', sexualMaturityAgeYears: 0, 
      averageAdultWeightKg: 0, lifeExpectancyYears: 0, breedingSeasonStart: 1, breedingSeasonEnd: 12, 
      imageUrl: '', nativeStatusCountry: 'Unknown', nativeStatusLocal: 'Unknown',
      projectId: currentProjectId === 'ALL_PROJECTS' ? (allProjects.length === 1 ? allProjects[0].id : '') : currentProjectId
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
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
    saveSpecies(updated);
    handleCloseForm();
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
    setBulkStatus('Reading file...');

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim().length > 0);
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[\s_]/g, ''));
      const rows = lines.slice(1);
      setBulkTotal(rows.length);
      setBulkProgress(0);

      const newSpecies: Species[] = [];
      const currentList = getSpecies();
      
      for (let i = 0; i < rows.length; i++) {
        const values = rows[i].split(',').map(v => v.trim());
        const data: any = {};
        headers.forEach((h, idx) => { data[h] = values[idx]; });

        const commonName = data.commonname || data.name;
        const scientificName = data.scientificname;
        const primaryIdentifier = commonName || scientificName;
        if (!primaryIdentifier) continue;

        setBulkStatus(`Researching: ${primaryIdentifier}`);
        setBulkProgress(i + 1);

        let kingdom: SpeciesType = 'Animal';
        const rawKingdom = (data.kingdom || data.type || '').toLowerCase();
        if (rawKingdom.includes('flora') || rawKingdom.includes('plant')) kingdom = 'Plant';

        try {
          const aiData = await fetchSpeciesData(primaryIdentifier, kingdom, org?.location || '');
          let finalImageUrl = await fetchWikimediaImage(aiData?.scientificName || primaryIdentifier);
          if (!finalImageUrl) {
            finalImageUrl = await generateSpeciesImage(primaryIdentifier, aiData?.scientificName || '', kingdom);
          }

          const speciesEntry: Species = {
            id: `sp-${Date.now()}-${i}`,
            projectId: targetProjectId,
            commonName: commonName || aiData?.commonName || scientificName || 'Unknown Species',
            scientificName: scientificName || aiData?.scientificName || commonName || 'Unknown',
            type: kingdom,
            plantClassification: (aiData?.plantClassification as PlantClassification) || data.plantclassification,
            conservationStatus: aiData?.conservationStatus || data.conservationstatus || 'Unknown',
            sexualMaturityAgeYears: Number(aiData?.sexualMaturityAgeYears || data.sexualmaturity || 0),
            averageAdultWeightKg: Number(aiData?.averageAdultWeightKg || data.weight || 0),
            lifeExpectancyYears: Number(aiData?.lifeExpectancyYears || data.lifeexpectancy || 0),
            breedingSeasonStart: aiData?.breedingSeasonStart || 1,
            breedingSeasonEnd: aiData?.breedingSeasonEnd || 12,
            imageUrl: finalImageUrl || generatePattern(primaryIdentifier),
            nativeStatusCountry: (aiData?.nativeStatusCountry as any) || 'Unknown',
            nativeStatusLocal: (aiData?.nativeStatusLocal as any) || 'Unknown'
          };
          newSpecies.push(speciesEntry);
        } catch (err) {
          console.error(`Failed to enrich ${primaryIdentifier}`, err);
        }
      }
      const updated = [...currentList, ...newSpecies];
      saveSpecies(updated);
      setAllSpecies(updated);
      setIsProcessingBulk(false);
      setShowBulkModal(false);
    };
    reader.readAsText(file);
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

  return (
    <div className="space-y-6">
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
          <button onClick={() => setShowBulkModal(true)} className="flex items-center justify-center space-x-2 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg font-bold border border-slate-300 shadow-sm transition-all"><FileUp size={18} className="text-emerald-600" /><span>Bulk</span></button>
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
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                 <div className="lg:col-span-4 space-y-6">
                    <div className="space-y-2">
                       <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('representativeImage')}</label>
                       <div className="aspect-square w-full rounded-xl bg-slate-100 border-2 border-dashed border-slate-300 overflow-hidden relative group shadow-inner">
                          {formData.imageUrl ? <img src={formData.imageUrl} className="w-full h-full object-cover" /> : <div className="flex flex-col items-center justify-center h-full text-slate-400 p-6 text-center"><ImageIcon size={48} className="mb-2 opacity-20"/><p className="text-xs">{t('noImageProvided')}</p></div>}
                          {loadingImage && <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 text-center p-4"><Loader2 className="animate-spin text-emerald-600 mb-2" size={32}/><span className="text-[10px] font-bold text-slate-600 tracking-widest">{imageStatus || 'LOADING...'}</span></div>}
                       </div>
                       <div className="grid grid-cols-2 gap-2 mt-2">
                          <label className="cursor-pointer bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 text-xs font-medium shadow-sm"><Camera size={14} /> {t('upload')}<input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if(f) { const r = new FileReader(); r.onload = () => setFormData({...formData, imageUrl: r.result as string}); r.readAsDataURL(f); } }} /></label>
                          <button type="button" onClick={handleGenerateAIImage} disabled={loadingImage || (!formData.commonName && !formData.scientificName)} className="bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg transition-colors flex items-center justify-center gap-2 text-xs font-bold shadow-sm disabled:opacity-50"><Sparkles size={14} /> {t('aiGenerate')}</button>
                       </div>
                    </div>
                 </div>
                 <div className="lg:col-span-8 space-y-6">
                    <div className="space-y-4">
                       <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <h4 className="font-bold text-slate-800 flex items-center gap-2"><Dna size={18} className="text-emerald-500"/> Scientific Taxonomy</h4>
                          <button type="button" onClick={handleAutoFill} disabled={loadingAI || (!formData.commonName && !formData.scientificName)} className="text-xs bg-purple-100 text-purple-700 hover:bg-purple-200 px-3 py-1.5 rounded-lg font-bold flex items-center gap-2 transition-all disabled:opacity-50">{loadingAI ? <Loader2 className="animate-spin" size={14}/> : <Sparkles size={14}/>} {t('autofill')} Species Profile</button>
                       </div>
                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">{t('commonName')}</label><input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.commonName} onChange={e => setFormData({...formData, commonName: e.target.value})} placeholder={t('commonNamePlaceholder')} /></div>
                          <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">{t('scientificName')}</label><input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 outline-none italic" value={formData.scientificName} onChange={e => setFormData({...formData, scientificName: e.target.value})} placeholder={t('scientificNamePlaceholder')} /></div>
                          {isAll && allProjects.length > 1 && (
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-slate-500 uppercase">Project Assignment</label>
                              <select className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.projectId} onChange={e => setFormData({...formData, projectId: e.target.value})} required>
                                <option value="">Select Project...</option>
                                {allProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </select>
                            </div>
                          )}
                          <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">{t('type')}</label><select className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value as SpeciesType, plantClassification: e.target.value === 'Plant' ? 'Monoecious' : undefined})}><option value="Animal">{t('animal')}</option><option value="Plant">{t('plant')}</option></select></div>
                          <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">{t('conservationStatus')}</label><input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.conservationStatus} onChange={e => setFormData({...formData, conservationStatus: e.target.value})} placeholder="e.g. Critically Endangered" /></div>
                       </div>
                    </div>
                    <div className="space-y-4 pt-4 border-t border-slate-100">
                       <h4 className="font-bold text-slate-800 flex items-center gap-2"><Activity size={18} className="text-blue-500"/> Biological Metrics</h4>
                       <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">{formData.type === 'Plant' ? t('maturityFlowering') : t('sexualMaturity')}</label><input type="number" step="0.1" className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white outline-none" value={formData.sexualMaturityAgeYears} onChange={e => setFormData({...formData, sexualMaturityAgeYears: parseFloat(e.target.value)})} /></div>
                          <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">{t('lifeExpectancy')}</label><input type="number" step="1" className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white outline-none" value={formData.lifeExpectancyYears} onChange={e => setFormData({...formData, lifeExpectancyYears: parseFloat(e.target.value)})} /></div>
                          {formData.type === 'Animal' ? (
                             <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">{t('adultWeight')} (Kg)</label><div className="relative"><Weight size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="number" step="0.01" className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg bg-white outline-none" value={formData.averageAdultWeightKg} onChange={e => setFormData({...formData, averageAdultWeightKg: parseFloat(e.target.value)})} /></div></div>
                          ) : (
                             <div className="space-y-1"><label className="text-xs font-bold text-slate-500 uppercase">{t('classification')}</label><select className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.plantClassification} onChange={e => setFormData({...formData, plantClassification: e.target.value as PlantClassification})}><option value="Monoecious">{t('monoecious')}</option><option value="Dioecious">{t('dioecious')}</option></select></div>
                          )}
                       </div>
                    </div>
                 </div>
              </div>
              <div className="flex justify-end pt-6 border-t border-slate-100 space-x-3 shrink-0">
                <button type="button" onClick={handleCloseForm} className="px-6 py-2.5 text-slate-600 hover:bg-slate-100 rounded-lg font-bold">{t('cancel')}</button>
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-10 py-2.5 rounded-lg font-bold shadow-lg transition-all">{editingId ? t('updateSpecies') : t('saveSpecies')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sortedSpecies.map(species => (
          <div key={species.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-xl transition-all group relative flex flex-col h-full">
            <div className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-all">
              <button onClick={() => handleEdit(species)} className="bg-white/90 p-2.5 rounded-full text-slate-600 hover:text-emerald-600 shadow-lg hover:scale-110 transition-all"><Pencil size={16} /></button>
            </div>
            <div className="h-52 bg-slate-200 relative overflow-hidden">
               <img src={species.imageUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt={species.commonName} />
               <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md text-white text-[10px] font-extrabold px-2.5 py-1 rounded-full border border-white/20 uppercase tracking-widest">{species.conservationStatus || t('unknownStatus')}</div>
               <div className={`absolute bottom-3 left-3 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shadow-sm border ${species.type === 'Plant' ? 'bg-green-600 text-white border-green-400' : 'bg-blue-600 text-white border-blue-400'}`}>{species.type === 'Plant' ? 'Flora' : 'Fauna'}</div>
            </div>
            <div className="p-5 flex-1 flex flex-col">
              <h3 className="text-xl font-bold text-slate-900 leading-tight mb-1">{species.commonName}</h3>
              <p className="text-sm text-slate-500 italic mb-4 font-serif">{species.scientificName}</p>
              {allProjects.length > 1 && (
                <div className="mb-4 text-[10px] font-bold text-indigo-600 uppercase flex items-center gap-1.5"><FolderOpen size={12}/> {allProjects.find(p => p.id === species.projectId)?.name || 'Unknown Project'}</div>
              )}
              <div className="grid grid-cols-2 gap-3 mt-auto">
                 <div className="bg-slate-50 p-2 rounded-lg border border-slate-100"><span className="text-[10px] font-bold text-slate-400 uppercase block">{t('maturity')}</span><span className="text-sm font-bold text-slate-700">{species.sexualMaturityAgeYears} {t('years')}</span></div>
                 <div className="bg-slate-50 p-2 rounded-lg border border-slate-100"><span className="text-[10px] font-bold text-slate-400 uppercase block">{t('lifespan')}</span><span className="text-sm font-bold text-slate-700">{species.lifeExpectancyYears} {t('years')}</span></div>
              </div>
            </div>
          </div>
        ))}
      </div>
      {sortedSpecies.length === 0 && <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-dashed border-slate-300"><PawPrint size={48} className="text-slate-300 mb-4 opacity-50"/><p className="text-slate-500 font-medium">{t('noSpeciesFound')}</p></div>}
    </div>
  );
};
export default SpeciesManager;
