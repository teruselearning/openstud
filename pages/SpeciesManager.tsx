
import React, { useState, useEffect, useContext } from 'react';
import { getSpecies, saveSpecies, exportSpeciesData, importSpeciesData, generatePattern, getOrg } from '../services/storage';
import { fetchSpeciesData } from '../services/geminiService';
import { Species, SpeciesType, PlantClassification, NativeStatus, Organization } from '../types';
import { Plus, Sparkles, Loader2, Camera, Download, Upload, CheckCircle, AlertCircle, Pencil, Trash2, LayoutGrid, List, ArrowDownAZ, ArrowUpAZ, Search, MapPin, Check, X as XIcon, AlertTriangle, HelpCircle, ExternalLink, FolderOpen } from 'lucide-react';
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'commonName' | 'scientificName'>('commonName');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  const [formData, setFormData] = useState<Partial<Species>>({
    commonName: '', scientificName: '', type: 'Animal', plantClassification: undefined,
    conservationStatus: '', sexualMaturityAgeYears: 0, averageAdultWeightKg: 0,
    lifeExpectancyYears: 0, breedingSeasonStart: 0, breedingSeasonEnd: 0,
    imageUrl: '', nativeStatusCountry: 'Unknown', nativeStatusLocal: 'Unknown'
  });

  useEffect(() => {
    setAllSpecies(getSpecies());
    setOrg(getOrg());
  }, []);

  const handleAutoFill = async () => {
    if (!formData.commonName) return;
    setLoadingAI(true);
    try {
      const data = await fetchSpeciesData(formData.commonName, formData.type as SpeciesType, org?.location || '');
      setLoadingAI(false);
      if (data) {
        setFormData(prev => ({ ...prev, ...data }));
      } else {
        alert("Autofill: Could not find biological data for this species. Please fill details manually.");
      }
    } catch (e) {
      setLoadingAI(false);
      alert("AI Service Error. Please try again later or fill manually.");
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
    setFormData({
      commonName: species.commonName, scientificName: species.scientificName,
      type: species.type || 'Animal', plantClassification: species.plantClassification,
      conservationStatus: species.conservationStatus, sexualMaturityAgeYears: species.sexualMaturityAgeYears,
      averageAdultWeightKg: species.averageAdultWeightKg, lifeExpectancyYears: species.lifeExpectancyYears,
      breedingSeasonStart: species.breedingSeasonStart || 0, breedingSeasonEnd: species.breedingSeasonEnd || 0,
      imageUrl: species.imageUrl, nativeStatusCountry: species.nativeStatusCountry || 'Unknown',
      nativeStatusLocal: species.nativeStatusLocal || 'Unknown'
    });
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ 
      commonName: '', scientificName: '', type: 'Animal', plantClassification: undefined, 
      conservationStatus: '', sexualMaturityAgeYears: 0, averageAdultWeightKg: 0, 
      lifeExpectancyYears: 0, breedingSeasonStart: 0, breedingSeasonEnd: 0,
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
    if (!currentProjectId) { alert("Error: No active project."); return; }
    if (!formData.commonName) { alert("Common name is required."); return; }
    if (!formData.scientificName) { alert("Scientific name is required for taxonomy tracking."); return; }
    
    const nameForPattern = (formData.type === 'Plant' && formData.scientificName) ? formData.scientificName : formData.commonName;
    const imageToSave = formData.imageUrl || generatePattern(nameForPattern || '');

    let updatedSpeciesList = [...allSpecies];
    if (editingId) {
       updatedSpeciesList = updatedSpeciesList.map(sp => sp.id === editingId ? {
          ...sp,
          commonName: formData.commonName!, scientificName: formData.scientificName!,
          type: formData.type as SpeciesType, plantClassification: formData.type === 'Plant' ? formData.plantClassification : undefined,
          conservationStatus: formData.conservationStatus || 'Unknown', sexualMaturityAgeYears: Number(formData.sexualMaturityAgeYears),
          averageAdultWeightKg: formData.type === 'Animal' ? Number(formData.averageAdultWeightKg) : 0,
          lifeExpectancyYears: Number(formData.lifeExpectancyYears), breedingSeasonStart: Number(formData.breedingSeasonStart),
          breedingSeasonEnd: Number(formData.breedingSeasonEnd), imageUrl: imageToSave,
          nativeStatusCountry: formData.nativeStatusCountry as NativeStatus, nativeStatusLocal: formData.nativeStatusLocal as NativeStatus
       } : sp);
    } else {
       updatedSpeciesList.push({
          id: `sp-${Date.now()}`, projectId: currentProjectId, 
          commonName: formData.commonName!, scientificName: formData.scientificName!,
          type: (formData.type as SpeciesType) || 'Animal', plantClassification: formData.type === 'Plant' ? formData.plantClassification : undefined,
          conservationStatus: formData.conservationStatus || 'Unknown', sexualMaturityAgeYears: Number(formData.sexualMaturityAgeYears),
          averageAdultWeightKg: formData.type === 'Animal' ? Number(formData.averageAdultWeightKg) : 0,
          lifeExpectancyYears: Number(formData.lifeExpectancyYears), breedingSeasonStart: Number(formData.breedingSeasonStart),
          breedingSeasonEnd: Number(formData.breedingSeasonEnd), imageUrl: imageToSave,
          nativeStatusCountry: formData.nativeStatusCountry as NativeStatus, nativeStatusLocal: formData.nativeStatusLocal as NativeStatus
       });
    }
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

  const NativeStatusPill = ({ status }: { status?: NativeStatus }) => {
     if (!org?.showNativeStatus) return null;
     if (!status || status === 'Unknown') return <span className="flex items-center gap-1 bg-slate-100 text-slate-500 px-2 py-1 rounded-full text-[10px] font-medium border border-slate-200"><HelpCircle size={10} /> {t('unknown')}</span>;
     if (status === 'Native') return <span className="flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full text-[10px] font-bold border border-emerald-200"><Check size={10} /> {t('native')}</span>;
     if (status === 'Invasive') return <span className="flex items-center gap-1 bg-red-100 text-red-700 px-2 py-1 rounded-full text-[10px] font-bold border border-red-200"><AlertTriangle size={10} /> {t('invasive')}</span>;
     return <span className="flex items-center gap-1 bg-amber-100 text-amber-700 px-2 py-1 rounded-full text-[10px] font-medium border border-amber-200"><XIcon size={10} /> {t('introduced')}</span>;
  };

  if (!currentProjectId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="bg-emerald-100 p-6 rounded-full text-emerald-600 mb-2"><FolderOpen size={48} /></div>
        <h2 className="text-2xl font-bold text-slate-900">No Project Active</h2>
        <p className="text-slate-500 max-w-md">Species must be assigned to a project. Please select or create a project in the sidebar to continue.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Species Database</h2>
          <p className="text-slate-500">Manage species profiles and biological data.</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:flex-none">
            <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder={t('searchSpecies')} className="w-full md:w-64 pl-9 pr-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <button onClick={() => setShowForm(true)} className="flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm"><Plus size={18} /><span>{t('add')}</span></button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-emerald-100 shadow-lg p-6 animate-in slide-in-from-top-4 duration-300 mb-6">
          <div className="flex justify-between items-start mb-6">
             <h3 className="text-lg font-bold text-slate-900">{editingId ? t('updateSpecies') : t('add')}</h3>
             <button onClick={handleCloseForm} className="text-slate-400 hover:text-slate-600">{t('cancel')}</button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">{t('type')}</label>
                <select className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value as SpeciesType})}><option value="Animal">{t('animal')}</option><option value="Plant">{t('plant')}</option></select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">{t('commonName')}</label>
                <div className="flex space-x-2">
                  <input className="flex-1 px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900" value={formData.commonName} onChange={e => setFormData({...formData, commonName: e.target.value})} placeholder="e.g., Red Panda" required />
                  <button type="button" onClick={handleAutoFill} disabled={loadingAI || !formData.commonName} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50" title="Autofill with AI">{loadingAI ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}</button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">{t('scientificName')}</label>
                <input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900" value={formData.scientificName} onChange={e => setFormData({...formData, scientificName: e.target.value})} required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">{t('conservationStatus')}</label>
                <input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900" value={formData.conservationStatus} onChange={e => setFormData({...formData, conservationStatus: e.target.value})} />
              </div>
              <div className="space-y-2 col-span-1 md:col-span-2">
                  <label className="text-sm font-medium text-slate-700">{t('uploadImage')}</label>
                  <div className="flex items-center space-x-3">
                    <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 border border-slate-300"><Camera size={18} /><span>{t('uploadImage')}</span><input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} /></label>
                    {formData.imageUrl && <img src={formData.imageUrl} alt="Preview" className="w-12 h-12 rounded object-cover border border-slate-200" />}
                  </div>
              </div>
            </div>
            <div className="flex justify-between pt-4 border-t border-slate-100 items-center">
              {editingId ? <button type="button" onClick={() => setShowDeleteConfirm(true)} className="text-red-600 hover:text-red-700 text-sm font-medium flex items-center gap-1"><Trash2 size={16} /> {t('delete')}</button> : <div/>}
              <div className="flex space-x-3">
                <button type="button" onClick={handleCloseForm} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">{t('cancel')}</button>
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-2.5 rounded-lg font-medium shadow-sm">{editingId ? t('updateSpecies') : t('saveSpecies')}</button>
              </div>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sortedSpecies.map(species => (
          <div key={species.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow group relative">
            <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-all">
              <button onClick={() => handleEdit(species)} className="bg-white/90 p-2 rounded-full text-slate-600 hover:text-emerald-600 shadow-sm"><Pencil size={16} /></button>
            </div>
            <div className="h-48 bg-slate-200 relative overflow-hidden">
               <img src={species.imageUrl} alt={species.commonName} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
               <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-full">{species.conservationStatus}</div>
            </div>
            <div className="p-5">
              <h3 className="text-xl font-bold text-slate-900">{species.commonName}</h3>
              <p className="text-sm text-slate-500 italic mb-2">{species.scientificName}</p>
              <div className="flex flex-wrap gap-2 mb-4">
                 <NativeStatusPill status={species.nativeStatusCountry} />
              </div>
            </div>
          </div>
        ))}
      </div>
      {sortedSpecies.length === 0 && (
         <div className="text-center py-12 text-slate-400">No species found in this project. Click Add to begin.</div>
      )}
    </div>
  );
};

export default SpeciesManager;
