
import React, { useState, useEffect, useContext } from 'react';
import { getSpecies, saveSpecies, generatePattern, getOrg } from '../services/storage';
import { fetchSpeciesData, generateSpeciesImage, fetchWikimediaImage } from '../services/geminiService';
import { Species, SpeciesType, PlantClassification, NativeStatus, Organization } from '../types';
import { Plus, Sparkles, Loader2, Camera, Download, Upload, CheckCircle, AlertCircle, Pencil, Trash2, LayoutGrid, List, ArrowDownAZ, ArrowUpAZ, Search, MapPin, Check, X as XIcon, AlertTriangle, HelpCircle, ExternalLink, FolderOpen, ImageIcon, Info, Calendar, Weight, Activity, Dna, PawPrint } from 'lucide-react';
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
  const [loadingImage, setLoadingImage] = useState(false);
  const [imageStatus, setImageStatus] = useState<string>(''); // For multi-stage image feedback
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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
    breedingSeasonStart: 1,
    breedingSeasonEnd: 12,
    imageUrl: '',
    nativeStatusCountry: 'Unknown',
    nativeStatusLocal: 'Unknown'
  });

  useEffect(() => {
    setAllSpecies(getSpecies());
    setOrg(getOrg());
  }, []);

  const handleAutoFill = async () => {
    if (!formData.commonName) return;
    setLoadingAI(true);
    setLoadingImage(true);
    setImageStatus('FETCHING DATA...');
    
    try {
      const data = await fetchSpeciesData(formData.commonName, formData.type as SpeciesType, org?.location || '');
      let finalScientificName = formData.scientificName;
      let finalType = formData.type || 'Animal';

      if (data) {
        setFormData(prev => {
          finalScientificName = data.scientificName || prev.scientificName;
          finalType = data.type || prev.type || 'Animal';
          return { 
            ...prev, 
            ...data,
            type: finalType as SpeciesType,
            nativeStatusCountry: (data.nativeStatusCountry as any) || 'Unknown',
            nativeStatusLocal: (data.nativeStatusLocal as any) || 'Unknown',
            plantClassification: (data.plantClassification as any)
          };
        });
      }

      const searchQueryForImage = finalScientificName || formData.commonName;
      setImageStatus('SEARCHING WIKIMEDIA...');
      
      let finalImageUrl = await fetchWikimediaImage(searchQueryForImage);

      if (!finalImageUrl) {
        setImageStatus('GENERATING AI ILLUSTRATION...');
        finalImageUrl = await generateSpeciesImage(formData.commonName, finalScientificName || '', finalType as SpeciesType);
      }

      if (finalImageUrl) {
        setFormData(prev => ({ ...prev, imageUrl: finalImageUrl || prev.imageUrl }));
      }

    } catch (e: any) {
      alert("AI Service Error: " + e.message);
    } finally {
      setLoadingAI(false);
      setLoadingImage(false);
      setImageStatus('');
    }
  };

  const handleGenerateAIImage = async () => {
     if (!formData.commonName || !formData.scientificName) {
        alert("Please provide at least Common and Scientific names for the AI to generate an accurate image.");
        return;
     }
     setLoadingImage(true);
     setImageStatus('GENERATING...');
     try {
        const url = await generateSpeciesImage(formData.commonName, formData.scientificName, formData.type as SpeciesType);
        if (url) {
           setFormData(prev => ({ ...prev, imageUrl: url }));
        }
     } catch (e: any) {
        alert("Image generation failed: " + e.message);
     } finally {
        setImageStatus('');
        setLoadingImage(false);
     }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setFormData(prev => ({ ...prev, imageUrl: reader.result as string }));
      reader.readAsDataURL(file);
    }
  };

  const handleEdit = (species: Species) => {
    setEditingId(species.id);
    setFormData({ ...species });
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ 
      commonName: '', scientificName: '', type: 'Animal', plantClassification: undefined, 
      conservationStatus: '', sexualMaturityAgeYears: 0, averageAdultWeightKg: 0, 
      lifeExpectancyYears: 0, breedingSeasonStart: 1, breedingSeasonEnd: 12,
      imageUrl: '', nativeStatusCountry: 'Unknown', nativeStatusLocal: 'Unknown'
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
    if (!currentProjectId) return;
    if (!formData.commonName || !formData.scientificName) return;
    
    const imageToSave = formData.imageUrl || generatePattern(formData.commonName);

    const finalSpecies: Species = {
       ...formData as Species,
       id: editingId || `sp-${Date.now()}`,
       projectId: currentProjectId,
       imageUrl: imageToSave,
       sexualMaturityAgeYears: Number(formData.sexualMaturityAgeYears || 0),
       averageAdultWeightKg: Number(formData.averageAdultWeightKg || 0),
       lifeExpectancyYears: Number(formData.lifeExpectancyYears || 0),
       breedingSeasonStart: Number(formData.breedingSeasonStart || 1),
       breedingSeasonEnd: Number(formData.breedingSeasonEnd || 12)
    };

    let updatedSpeciesList = editingId 
       ? allSpecies.map(sp => sp.id === editingId ? finalSpecies : sp)
       : [...allSpecies, finalSpecies];

    setAllSpecies(updatedSpeciesList);
    saveSpecies(updatedSpeciesList);
    handleCloseForm();
  };

  const filteredSpecies = allSpecies.filter(sp => 
    sp.projectId === currentProjectId && 
    (sp.commonName.toLowerCase().includes(searchQuery.toLowerCase()) || sp.scientificName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const sortedSpecies = [...filteredSpecies].sort((a, b) => {
    const valA = (a[sortBy] || '').toString().toLowerCase();
    const valB = (b[sortBy] || '').toString().toLowerCase();
    return sortOrder === 'asc' ? (valA < valB ? -1 : 1) : (valA > valB ? -1 : 1);
  });

  const NativeStatusPill = ({ status, label }: { status?: NativeStatus, label: string }) => {
     if (!org?.showNativeStatus) return null;
     const colors = {
        'Native': 'bg-emerald-100 text-emerald-700 border-emerald-200',
        'Introduced': 'bg-blue-100 text-blue-700 border-blue-200',
        'Invasive': 'bg-red-100 text-red-700 border-red-200',
        'Unknown': 'bg-slate-100 text-slate-500 border-slate-200'
     };
     const currentStyle = colors[status || 'Unknown'];
     return (
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${currentStyle}`}>
           <span>{label}: {status || 'Unknown'}</span>
        </div>
     );
  };

  if (!currentProjectId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="bg-emerald-100 p-6 rounded-full text-emerald-600 mb-2"><FolderOpen size={48} /></div>
        <h2 className="text-2xl font-bold text-slate-900">No Project Active</h2>
        <p className="text-slate-500 max-w-md">Select or create a project to manage species.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Species Database</h2>
          <p className="text-slate-500">Biological profiles and population management.</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:flex-none">
            <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder={t('searchSpecies')} className="w-full md:w-64 pl-9 pr-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm outline-none focus:ring-2 focus:ring-emerald-500" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <button onClick={() => setShowForm(true)} className="flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-all"><Plus size={18} /><span>{t('add')}</span></button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden animate-in slide-in-from-top-4 duration-300 mb-6">
          <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
             <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg"><Plus size={20}/></div>
                <h3 className="font-bold text-slate-900">{editingId ? t('updateSpecies') : t('add')}</h3>
             </div>
             <button onClick={handleCloseForm} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors"><XIcon size={20} /></button>
          </div>
          
          <form onSubmit={handleSubmit} className="p-6 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
               <div className="md:col-span-4 space-y-6">
                  <div className="space-y-2">
                     <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Representative Image</label>
                     <div className="aspect-square w-full rounded-xl bg-slate-100 border-2 border-dashed border-slate-300 overflow-hidden relative group">
                        {formData.imageUrl ? (
                           <img src={formData.imageUrl} className="w-full h-full object-cover" alt="Species" />
                        ) : (
                           <div className="flex flex-col items-center justify-center h-full text-slate-400 p-6 text-center">
                              <ImageIcon size={48} className="mb-2 opacity-20"/>
                              <p className="text-xs">No image provided.</p>
                           </div>
                        )}
                        {loadingImage && (
                           <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 text-center p-4">
                              <Loader2 className="animate-spin text-emerald-600 mb-2" size={32}/>
                              <span className="text-[10px] font-bold text-slate-600 tracking-widest">{imageStatus || 'LOADING...'}</span>
                           </div>
                        )}
                     </div>
                     <div className="grid grid-cols-2 gap-2 mt-2">
                        <label className="cursor-pointer bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 text-xs font-medium shadow-sm">
                           <Camera size={14} /> Upload
                           <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                        </label>
                        <button 
                           type="button" 
                           onClick={handleGenerateAIImage}
                           disabled={loadingImage || !formData.commonName}
                           className="bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg transition-colors flex items-center justify-center gap-2 text-xs font-bold shadow-sm disabled:opacity-50"
                        >
                           <Sparkles size={14} /> AI Generate
                        </button>
                     </div>
                  </div>
               </div>

               <div className="md:col-span-8 space-y-6">
                  <div className="space-y-4">
                     <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <h4 className="font-bold text-slate-800 flex items-center gap-2"><Dna size={18} className="text-emerald-500"/> {t('coreTaxonomy')}</h4>
                        <button type="button" onClick={handleAutoFill} disabled={loadingAI || !formData.commonName} className="text-xs bg-purple-100 text-purple-700 hover:bg-purple-200 px-3 py-1.5 rounded-lg font-bold flex items-center gap-2 transition-all disabled:opacity-50">
                           {loadingAI ? <Loader2 className="animate-spin" size={14}/> : <Sparkles size={14}/>} {t('autofill')} Complete Profile
                        </button>
                     </div>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                           <label className="text-xs font-bold text-slate-500 uppercase">{t('commonName')}</label>
                           <input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.commonName} onChange={e => setFormData({...formData, commonName: e.target.value})} placeholder="e.g. Sumatran Tiger" required />
                        </div>
                        <div className="space-y-1">
                           <label className="text-xs font-bold text-slate-500 uppercase">{t('scientificName')}</label>
                           <input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none italic" value={formData.scientificName} onChange={e => setFormData({...formData, scientificName: e.target.value})} placeholder="e.g. Panthera tigris sumatrae" required />
                        </div>
                        <div className="space-y-1">
                           <label className="text-xs font-bold text-slate-500 uppercase">{t('type')}</label>
                           <select className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value as SpeciesType, plantClassification: e.target.value === 'Plant' ? 'Monoecious' : undefined})}>
                              <option value="Animal">{t('animal')}</option>
                              <option value="Plant">{t('plant')}</option>
                           </select>
                        </div>
                        <div className="space-y-1">
                           <label className="text-xs font-bold text-slate-500 uppercase">{t('conservationStatus')}</label>
                           <input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.conservationStatus} onChange={e => setFormData({...formData, conservationStatus: e.target.value})} placeholder="e.g. Critically Endangered" />
                        </div>
                     </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-slate-100">
                     <h4 className="font-bold text-slate-800 flex items-center gap-2"><Activity size={18} className="text-blue-500"/> {t('biologicalMetrics')}</h4>
                     <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-1">
                           <label className="text-xs font-bold text-slate-500 uppercase">{formData.type === 'Plant' ? t('maturityFlowering') : t('sexualMaturity')}</label>
                           <input type="number" step="0.1" className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.sexualMaturityAgeYears} onChange={e => setFormData({...formData, sexualMaturityAgeYears: parseFloat(e.target.value)})} />
                        </div>
                        <div className="space-y-1">
                           <label className="text-xs font-bold text-slate-500 uppercase">{t('lifeExpectancy')}</label>
                           <input type="number" step="1" className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.lifeExpectancyYears} onChange={e => setFormData({...formData, lifeExpectancyYears: parseFloat(e.target.value)})} />
                        </div>
                        {formData.type === 'Animal' ? (
                           <div className="space-y-1">
                              <label className="text-xs font-bold text-slate-500 uppercase">{t('adultWeight')} (Kg)</label>
                              <div className="relative">
                                 <Weight size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                 <input type="number" step="0.01" className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.averageAdultWeightKg} onChange={e => setFormData({...formData, averageAdultWeightKg: parseFloat(e.target.value)})} />
                              </div>
                           </div>
                        ) : (
                           <div className="space-y-1">
                              <label className="text-xs font-bold text-slate-500 uppercase">{t('classification')}</label>
                              <select className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.plantClassification} onChange={e => setFormData({...formData, plantClassification: e.target.value as PlantClassification})}>
                                 <option value="Monoecious">{t('monoecious')}</option>
                                 <option value="Dioecious">{t('dioecious')}</option>
                              </select>
                           </div>
                        )}
                     </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-slate-100">
                     <h4 className="font-bold text-slate-800 flex items-center gap-2"><Calendar size={18} className="text-amber-500"/> {formData.type === 'Plant' ? t('floweringSeason') : t('breedingSeason')}</h4>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                           <label className="text-xs font-bold text-slate-500 uppercase">Start Month</label>
                           <select className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.breedingSeasonStart} onChange={e => setFormData({...formData, breedingSeasonStart: parseInt(e.target.value)})}>
                              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{new Date(2024, m-1).toLocaleString('default', {month: 'long'})}</option>)}
                           </select>
                        </div>
                        <div className="space-y-1">
                           <label className="text-xs font-bold text-slate-500 uppercase">End Month</label>
                           <select className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.breedingSeasonEnd} onChange={e => setFormData({...formData, breedingSeasonEnd: parseInt(e.target.value)})}>
                              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{new Date(2024, m-1).toLocaleString('default', {month: 'long'})}</option>)}
                           </select>
                        </div>
                     </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-slate-100">
                    <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 space-y-3">
                      <h4 className="text-sm font-bold text-blue-900 flex items-center gap-2"><Info size={16}/> {t('nativeStatusRange')}</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] font-bold text-blue-700 uppercase block mb-1">In {org?.location || 'Country'}</label>
                            <select 
                                className="w-full p-2 border border-blue-200 rounded text-sm bg-white text-slate-900 outline-none focus:ring-1 focus:ring-blue-500"
                                value={formData.nativeStatusCountry}
                                onChange={e => setFormData({...formData, nativeStatusCountry: e.target.value as NativeStatus})}
                            >
                                <option value="Unknown">Unknown</option>
                                <option value="Native">Native</option>
                                <option value="Introduced">Introduced</option>
                                <option value="Invasive">Invasive</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-blue-700 uppercase block mb-1">Local Region Status</label>
                            <select 
                                className="w-full p-2 border border-blue-200 rounded text-sm bg-white text-slate-900 outline-none focus:ring-1 focus:ring-blue-500"
                                value={formData.nativeStatusLocal}
                                onChange={e => setFormData({...formData, nativeStatusLocal: e.target.value as NativeStatus})}
                            >
                                <option value="Unknown">Unknown</option>
                                <option value="Native">Native</option>
                                <option value="Introduced">Introduced</option>
                                <option value="Invasive">Invasive</option>
                            </select>
                          </div>
                      </div>
                    </div>
                  </div>
               </div>
            </div>

            <div className="flex justify-between pt-6 border-t border-slate-100 items-center">
              {editingId ? (
                 <button type="button" onClick={() => setShowDeleteConfirm(true)} className="text-red-600 hover:text-red-700 text-sm font-bold flex items-center gap-1.5 px-4 py-2 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16} /> {t('delete')}</button>
              ) : <div/>}
              <div className="flex space-x-3">
                <button type="button" onClick={handleCloseForm} className="px-6 py-2.5 text-slate-600 hover:bg-slate-100 rounded-lg font-bold transition-colors">{t('cancel')}</button>
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-10 py-2.5 rounded-lg font-bold shadow-lg transition-all transform active:scale-95">{editingId ? t('updateSpecies') : t('saveSpecies')}</button>
              </div>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sortedSpecies.map(species => (
          <div key={species.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-xl transition-all group relative flex flex-col h-full">
            <div className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-all flex gap-1">
              <button onClick={() => handleEdit(species)} className="bg-white/90 p-2.5 rounded-full text-slate-600 hover:text-emerald-600 shadow-lg hover:scale-110 transition-all"><Pencil size={16} /></button>
            </div>

            <div className="h-52 bg-slate-200 relative overflow-hidden">
               <img src={species.imageUrl} alt={species.commonName} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
               <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md text-white text-[10px] font-extrabold px-2.5 py-1 rounded-full border border-white/20 uppercase tracking-widest">
                  {species.conservationStatus || 'Unknown Status'}
               </div>
               <div className={`absolute bottom-3 left-3 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shadow-sm border ${species.type === 'Plant' ? 'bg-green-600 text-white border-green-400' : 'bg-blue-600 text-white border-blue-400'}`}>
                  {species.type}
               </div>
            </div>

            <div className="p-5 flex-1 flex flex-col">
              <h3 className="text-xl font-bold text-slate-900 leading-tight mb-1">{species.commonName}</h3>
              <p className="text-sm text-slate-500 italic mb-4 font-serif">{species.scientificName}</p>
              
              <div className="grid grid-cols-2 gap-3 mb-5">
                 <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">Maturity</span>
                    <span className="text-sm font-bold text-slate-700">{species.sexualMaturityAgeYears} {t('years')}</span>
                 </div>
                 <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">Lifespan</span>
                    <span className="text-sm font-bold text-slate-700">{species.lifeExpectancyYears} {t('years')}</span>
                 </div>
              </div>

              <div className="mt-auto space-y-2 border-t border-slate-100 pt-4">
                 <NativeStatusPill label="Country" status={species.nativeStatusCountry} />
                 <NativeStatusPill label="Local" status={species.nativeStatusLocal} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {sortedSpecies.length === 0 && (
         <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
            <PawPrint size={48} className="text-slate-300 mb-4 opacity-50"/>
            <p className="text-slate-500 font-medium">{t('noSpeciesFound')}</p>
            <button onClick={() => setShowForm(true)} className="mt-4 text-emerald-600 font-bold hover:underline">{t('addFirstSpecies')}</button>
         </div>
      )}

      {showDeleteConfirm && (
         <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-8 text-center animate-in zoom-in duration-200">
               <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <AlertTriangle size={40}/>
               </div>
               <h3 className="text-2xl font-bold text-slate-900 mb-2">Delete Species?</h3>
               <p className="text-slate-500 mb-8 leading-relaxed">This will permanently remove the species and all associated breeding history. This action cannot be undone.</p>
               <div className="flex gap-3">
                  <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors">{t('cancel')}</button>
                  <button onClick={handleDelete} className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-red-200">Yes, Delete</button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default SpeciesManager;
