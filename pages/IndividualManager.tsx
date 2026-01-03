
import React, { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { getSpecies, getIndividuals, saveIndividuals, generatePattern, saveSpecies, getOrg, getEnclosures } from '../services/storage';
import { fetchSpeciesData } from '../services/geminiService';
import { Species, Individual, Sex, AcquisitionSource, SpeciesType, Organization, Enclosure } from '../types';
import { Plus, Camera, Search, Dna, PawPrint, Pencil, X as XIcon, Filter, Trash2, AlertTriangle, MapPin, Users, LayoutGrid, List, ArrowRight, Briefcase, RefreshCw, Sprout, Loader2, FileText, CheckCircle, Fingerprint, User as UserIcon, Upload, FileCode, Crosshair, Map as MapIcon, Maximize2, LocateFixed, Type as TypeIcon, Map as MapIcon2, ChevronDown, Calendar, Weight, Info, Box } from 'lucide-react';
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
  const [allEnclosures, setAllEnclosures] = useState<Enclosure[]>([]);
  const [org, setOrg] = useState<Organization | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  
  // Map References
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSpeciesId, setFilterSpeciesId] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('current');

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [speciesSearchQuery, setSpeciesSearchQuery] = useState('');
  const [isSpeciesDropdownOpen, setIsSpeciesDropdownOpen] = useState(false);
  const speciesDropdownRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState<Partial<Individual>>({
    speciesId: '', enclosureId: '', studbookId: '', name: '', sex: Sex.UNKNOWN, birthDate: '', weightKg: 0, sireId: '', damId: '', notes: '', imageUrl: '', isDeceased: false, source: 'Bred in house'
  });

  useEffect(() => {
    setAllIndividuals(getIndividuals());
    setAllSpecies(getSpecies());
    setAllEnclosures(getEnclosures());
    setOrg(getOrg());
  }, []);

  useEffect(() => {
    if (viewMode === 'map' && mapContainerRef.current && !mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, { maxZoom: 22 }).setView([org?.latitude || 0, org?.longitude || 0], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
      markersLayerRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
      setTimeout(() => map.invalidateSize(), 200);
    }
  }, [viewMode, org]);

  const handleOpenNewForm = () => {
    setEditingId(null);
    setFormData({ studbookId: `SB-${new Date().getFullYear()}-${Math.random().toString(36).substring(7).toUpperCase()}`, speciesId: '', enclosureId: '', name: '', sex: Sex.UNKNOWN, weightKg: 0, birthDate: new Date().toISOString().split('T')[0], source: 'Bred in house', notes: '', imageUrl: '' });
    setSpeciesSearchQuery('');
    setShowForm(true);
  };

  const handleEdit = (ind: Individual) => {
    setEditingId(ind.id);
    setFormData({ ...ind });
    const sp = allSpecies.find(s => s.id === ind.speciesId);
    setSpeciesSearchQuery(sp?.commonName || '');
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.speciesId || !formData.studbookId) return;
    setIsSubmitting(true);
    const entry: Individual = {
        ...formData as Individual,
        id: editingId || `ind-${Date.now()}`,
        projectId: currentProjectId,
        weightKg: Number(formData.weightKg || 0)
    };
    const updated = editingId ? allIndividuals.map(i => i.id === editingId ? entry : i) : [...allIndividuals, entry];
    setAllIndividuals(updated);
    saveIndividuals(updated);
    setIsSubmitting(false);
    setShowForm(false);
    setEditingId(null);
  };

  const projectIndividuals = allIndividuals.filter(ind => ind.projectId === currentProjectId);
  const filtered = projectIndividuals.filter(ind => {
    const matchesSearch = ind.name.toLowerCase().includes(searchTerm.toLowerCase()) || ind.studbookId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSpecies = !filterSpeciesId || ind.speciesId === filterSpeciesId;
    const matchesStatus = filterStatus === 'all' || (filterStatus === 'deceased' ? ind.isDeceased : !ind.isDeceased);
    return matchesSearch && matchesSpecies && matchesStatus;
  });

  const projectSpecies = allSpecies.filter(s => s.projectId === currentProjectId);
  const speciesSearchResults = projectSpecies.filter(s => s.commonName.toLowerCase().includes(speciesSearchQuery.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t('individuals')}</h2>
          <p className="text-slate-500">{t('indivSubtitleAnimal')}</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center bg-white border border-slate-300 rounded-lg p-1 shadow-sm">
            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md ${viewMode === 'grid' ? 'bg-slate-100' : ''}`}><LayoutGrid size={18} /></button>
            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md ${viewMode === 'list' ? 'bg-slate-100' : ''}`}><List size={18} /></button>
            <button onClick={() => setViewMode('map')} className={`p-1.5 rounded-md ${viewMode === 'map' ? 'bg-slate-100' : ''}`}><MapIcon size={18} /></button>
          </div>
          <button onClick={handleOpenNewForm} className="flex-1 md:flex-none flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm">
            <Plus size={18} /><span>{t('add')}</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white" placeholder={t('searchIndividuals')} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <select className="px-4 py-2 border border-slate-300 rounded-lg bg-white" value={filterSpeciesId} onChange={e => setFilterSpeciesId(e.target.value)}>
          <option value="">{t('allSpeciesFilter')}</option>
          {projectSpecies.map(s => <option key={s.id} value={s.id}>{s.commonName}</option>)}
        </select>
        <select className="px-4 py-2 border border-slate-300 rounded-lg bg-white" value={filterStatus} onChange={e => setFilterStatus(e.target.value as StatusFilter)}>
          <option value="current">{t('statusCurrent')}</option>
          <option value="deceased">{t('statusDeceased')}</option>
          <option value="all">{t('statusAll')}</option>
        </select>
      </div>

      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filtered.map(ind => {
            const sp = allSpecies.find(s => s.id === ind.speciesId);
            return (
              <div key={ind.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all group flex flex-col">
                <div className="h-48 bg-slate-100 relative overflow-hidden">
                  <img src={ind.imageUrl || sp?.imageUrl || generatePattern(ind.name)} className="w-full h-full object-cover" />
                  <div className={`absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold text-white uppercase ${ind.sex === Sex.MALE ? 'bg-blue-600' : ind.sex === Sex.FEMALE ? 'bg-pink-600' : 'bg-slate-600'}`}>{ind.sex}</div>
                </div>
                <div className="p-4 flex-1">
                  <h3 className="font-bold text-slate-900 group-hover:text-emerald-700 transition-colors truncate">{ind.name}</h3>
                  <p className="text-xs text-slate-500 mb-2 truncate">{sp?.commonName}</p>
                  <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-50">
                    <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-widest">{ind.studbookId}</span>
                    <Link to={`/individuals/${ind.id}`} className="text-emerald-600 hover:text-emerald-700"><ArrowRight size={16} /></Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewMode === 'list' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                <th className="px-6 py-4">Individual</th>
                <th className="px-6 py-4">Species</th>
                <th className="px-6 py-4">Sex</th>
                <th className="px-6 py-4">Studbook ID</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(ind => (
                <tr key={ind.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4 font-bold text-slate-900">{ind.name}</td>
                  <td className="px-6 py-4 text-sm text-slate-500">{allSpecies.find(s => s.id === ind.speciesId)?.commonName}</td>
                  <td className="px-6 py-4 text-sm">{ind.sex}</td>
                  <td className="px-6 py-4 text-xs font-mono text-slate-400">{ind.studbookId}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                       <button onClick={() => handleEdit(ind)} className="p-1.5 text-slate-400 hover:text-emerald-600 transition-colors"><Pencil size={16}/></button>
                       <Link to={`/individuals/${ind.id}`} className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors"><Maximize2 size={16}/></Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewMode === 'map' && <div ref={mapContainerRef} className="h-[600px] w-full rounded-xl border border-slate-200" />}

      {showForm && (
        <div className="fixed inset-0 z-[2000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in zoom-in duration-200">
             <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
               <h3 className="text-xl font-bold">{editingId ? t('updateIndividual') : t('registerIndividual')}</h3>
               <button onClick={() => setShowForm(false)} className="text-slate-400"><XIcon size={24}/></button>
             </div>
             <form onSubmit={handleSubmit} className="p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="relative" ref={speciesDropdownRef}>
                      <label className="text-sm font-bold text-slate-700 block mb-1">Species</label>
                      <input className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none" value={speciesSearchQuery} onChange={e => { setSpeciesSearchQuery(e.target.value); setIsSpeciesDropdownOpen(true); }} onFocus={() => setIsSpeciesDropdownOpen(true)} placeholder="Search species..." />
                      {isSpeciesDropdownOpen && (
                         <div className="absolute top-full left-0 right-0 z-50 bg-white border border-slate-200 rounded-lg shadow-xl mt-1 max-h-48 overflow-auto">
                            {speciesSearchResults.map(s => <button key={s.id} type="button" className="w-full text-left p-3 hover:bg-slate-50 border-b last:border-0" onClick={() => { setFormData({...formData, speciesId: s.id}); setSpeciesSearchQuery(s.commonName); setIsSpeciesDropdownOpen(false); }}>{s.commonName}</button>)}
                         </div>
                      )}
                   </div>
                   <div>
                      <label className="text-sm font-bold text-slate-700 block mb-1">Studbook ID</label>
                      <input className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none font-mono" value={formData.studbookId} onChange={e => setFormData({...formData, studbookId: e.target.value})} required />
                   </div>
                   <div>
                      <label className="text-sm font-bold text-slate-700 block mb-1">Name</label>
                      <input className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
                   </div>
                   <div>
                      <label className="text-sm font-bold text-slate-700 block mb-1">Sex</label>
                      <select className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white" value={formData.sex} onChange={e => setFormData({...formData, sex: e.target.value as Sex})}>
                        {Object.values(Sex).map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                   </div>
                </div>
                <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                   <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2 text-slate-600">Cancel</button>
                   <button type="submit" disabled={isSubmitting} className="bg-emerald-600 text-white px-8 py-2 rounded-lg font-bold flex items-center gap-2">
                     {isSubmitting && <Loader2 size={18} className="animate-spin"/>} {t('save')}
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
