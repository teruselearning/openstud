
import React, { useState, useEffect, useRef, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getIndividuals, saveIndividuals, getSpecies, generatePattern, getBreedingLoans, sendMockNotification, getBreedingEvents, getNetworkPartners, getPartnerships, getOrg, getEnclosures } from '../services/storage';
import { Individual, Species, WeightRecord, HealthRecord, GrowthRecord, BreedingEvent, ExternalPartner, Partnership, Enclosure, Sex } from '../types';
// Added Loader2 and Upload to imports
import { ArrowLeft, Scale, Activity, Syringe, Calendar, Plus, Stethoscope, Sprout, Camera, MapPin, Navigation, X, ChevronLeft, ChevronRight, Maximize2, Briefcase, Archive, Edit, Baby, Heart, ArrowRightLeft, ExternalLink, Fingerprint, Download, FileCode, Box, Trash2, Loader2, Upload } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { LanguageContext } from '../App';

declare const L: any;

const IndividualDetail: React.FC = () => {
  const { t } = useContext(LanguageContext);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [individual, setIndividual] = useState<Individual | null>(null);
  const [species, setSpecies] = useState<Species | null>(null);
  const [enclosure, setEnclosure] = useState<Enclosure | null>(null);
  const [breedingHistory, setBreedingHistory] = useState<BreedingEvent[]>([]);
  
  // Tabs
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'genetics'>('overview');

  // Map state
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);

  // Modals
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [showHealthModal, setShowHealthModal] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState<number>(-1);

  useEffect(() => {
    if (!id) return;
    const inds = getIndividuals();
    const ind = inds.find(i => i.id === id);
    if (ind) {
      setIndividual(ind);
      const allSpecies = getSpecies();
      const sp = allSpecies.find(s => s.id === ind.speciesId);
      setSpecies(sp || null);

      if (ind.enclosureId) {
        const allEnclosures = getEnclosures();
        setEnclosure(allEnclosures.find(e => e.id === ind.enclosureId) || null);
      }

      const allEvents = getBreedingEvents();
      const relevantEvents = allEvents.filter(e => e.sireId === ind.id || e.damId === ind.id)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setBreedingHistory(relevantEvents);
    }
  }, [id]);

  // Map Initialization
  useEffect(() => {
    if (activeTab === 'overview' && individual?.latitude && mapRef.current && !leafletMap.current) {
      const map = L.map(mapRef.current, { zoomControl: false }).setView([individual.latitude, individual.longitude], 16);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
      L.marker([individual.latitude, individual.longitude]).addTo(map);
      leafletMap.current = map;
      setTimeout(() => map.invalidateSize(), 200);
    }
  }, [activeTab, individual]);

  const handleAddWeight = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!individual) return;
    const formData = new FormData(e.currentTarget);
    const newRecord: WeightRecord = {
      id: `w-${Date.now()}`,
      date: formData.get('date') as string,
      weightKg: Number(formData.get('weight')),
      note: formData.get('note') as string
    };
    const updatedInd = { ...individual, weightHistory: [newRecord, ...(individual.weightHistory || [])] };
    const allInds = getIndividuals().map(i => i.id === individual.id ? updatedInd : i);
    saveIndividuals(allInds);
    setIndividual(updatedInd);
    setShowWeightModal(false);
  };

  const getDisplayImage = () => {
    if (individual?.imageUrl && !individual.imageUrl.startsWith('data:image/svg+xml')) return individual.imageUrl;
    if (species?.imageUrl && !species.imageUrl.startsWith('data:image/svg+xml')) return species.imageUrl;
    return generatePattern(individual?.name || 'Individual');
  };

  if (!individual) return <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-emerald-600" /></div>;

  const isPlant = species?.type === 'Plant';
  const weightData = (individual.weightHistory || []).map(w => ({ date: w.date, value: w.weightKg })).reverse();

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start md:items-center space-x-4">
          <button onClick={() => navigate('/individuals')} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-600">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              {individual.name}
              {individual.isDeceased && <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full uppercase font-bold tracking-widest">{isPlant ? 'Removed' : 'Deceased'}</span>}
            </h1>
            <p className="text-slate-500 font-medium">
               {species?.commonName} • <span className="font-serif italic">{species?.scientificName}</span>
            </p>
          </div>
        </div>
        <button onClick={() => navigate('/individuals', { state: { editId: individual.id, fromId: individual.id } })} className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg font-bold shadow-sm transition-all">
          <Edit size={18} />
          <span>Edit Profile</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 space-x-8">
        <button onClick={() => setActiveTab('overview')} className={`py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'overview' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Overview</button>
        <button onClick={() => setActiveTab('history')} className={`py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'history' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Health & History</button>
        <button onClick={() => setActiveTab('genetics')} className={`py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'genetics' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Genetics</button>
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-bottom-2 duration-300">
          {/* Card Left: Identity */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
               <div className="aspect-square w-full bg-slate-100 relative group cursor-pointer" onClick={() => setGalleryIndex(0)}>
                  <img src={getDisplayImage()} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                     <Maximize2 className="text-white" size={32} />
                  </div>
               </div>
               <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-slate-50">
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Studbook ID</span>
                    <span className="text-sm font-mono font-bold text-slate-700">{individual.studbookId}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-slate-50">
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Sex</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${individual.sex === Sex.MALE ? 'bg-blue-100 text-blue-700' : individual.sex === Sex.FEMALE ? 'bg-pink-100 text-pink-700' : 'bg-slate-100 text-slate-700'}`}>{individual.sex}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">{isPlant ? 'Planted' : 'Birth Date'}</span>
                    <span className="text-sm font-bold text-slate-700">{individual.birthDate || 'Unknown'}</span>
                  </div>
                  {enclosure && (
                    <div className="bg-purple-50 p-3 rounded-lg border border-purple-100 mt-2 flex items-center gap-3">
                      <Box size={20} className="text-purple-600" />
                      <div>
                        <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">Enclosure</p>
                        <p className="text-sm font-bold text-purple-900">{enclosure.name}</p>
                      </div>
                    </div>
                  )}
               </div>
            </div>
          </div>

          {/* Center Column: Charts & Maps */}
          <div className="lg:col-span-2 space-y-6">
             <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                   <h3 className="font-bold text-slate-800 flex items-center gap-2"><Activity size={20} className="text-emerald-500" /> Growth Trend</h3>
                   <button onClick={() => setShowWeightModal(true)} className="text-xs bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 hover:bg-emerald-100"><Plus size={14}/> Log {isPlant ? 'Height' : 'Weight'}</button>
                </div>
                <div className="h-64">
                   {weightData.length > 1 ? (
                     <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={weightData}>
                           <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                           <XAxis dataKey="date" hide />
                           <YAxis hide domain={['auto', 'auto']} />
                           <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                           <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981', r: 4 }} activeDot={{ r: 6 }} />
                        </LineChart>
                     </ResponsiveContainer>
                   ) : (
                     <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-2 italic">
                        <Scale size={48} className="opacity-20" />
                        <p>Insufficient historical data for chart</p>
                     </div>
                   )}
                </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                   <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4"><Baby size={20} className="text-blue-500" /> Parentage</h3>
                   <div className="space-y-4 flex-1">
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-center gap-3">
                         <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">S</div>
                         <div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sire</p><p className="text-sm font-bold text-slate-900">{individual.sireId || 'Unknown'}</p></div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-center gap-3">
                         <div className="w-8 h-8 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center font-bold">D</div>
                         <div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dam</p><p className="text-sm font-bold text-slate-900">{individual.damId || 'Unknown'}</p></div>
                      </div>
                   </div>
                </div>
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                   <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4"><MapPin size={20} className="text-red-500" /> Location</h3>
                   <div className="h-40 w-full rounded-lg bg-slate-100 overflow-hidden relative border border-slate-200">
                      {individual.latitude ? <div ref={mapRef} className="h-full w-full" /> : <div className="h-full flex items-center justify-center text-slate-400 italic text-xs">No coordinates assigned</div>}
                   </div>
                </div>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-6 animate-in fade-in duration-300">
           <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                 <h3 className="font-bold text-slate-800">Medical & Health Logs</h3>
                 <button onClick={() => setShowHealthModal(true)} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm">+ New Log</button>
              </div>
              <div className="divide-y divide-slate-100">
                 {(individual.healthHistory || []).length > 0 ? (
                    individual.healthHistory?.map(log => (
                       <div key={log.id} className="p-6 hover:bg-slate-50 transition-colors flex gap-4">
                          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg h-fit"><Stethoscope size={20}/></div>
                          <div className="flex-1">
                             <div className="flex justify-between items-start mb-1">
                                <h4 className="font-bold text-slate-900">{log.type}</h4>
                                <span className="text-xs font-bold text-slate-400">{log.date}</span>
                             </div>
                             <p className="text-sm text-slate-600">{log.description}</p>
                             {log.performedBy && <p className="text-[10px] text-slate-400 font-bold uppercase mt-2">Performed by: {log.performedBy}</p>}
                          </div>
                       </div>
                    ))
                 ) : (
                    <div className="p-12 text-center text-slate-400 opacity-50 flex flex-col items-center">
                       <Archive size={48} strokeWidth={1} className="mb-2" />
                       <p>No health records found.</p>
                    </div>
                 )}
              </div>
           </div>
        </div>
      )}

      {activeTab === 'genetics' && (
        <div className="space-y-6 animate-in fade-in duration-300">
           <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mb-6">
                 <Fingerprint size={48} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Genomic Profile</h3>
              <p className="text-slate-500 max-w-lg mb-8 leading-relaxed">
                 Manage DNA sequences and molecular data for this individual. This information is used for advanced genetic diversity analysis and kinship verification.
              </p>
              
              {individual.dnaSequence ? (
                <div className="w-full text-left bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-inner">
                   <div className="flex justify-between items-center mb-4">
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Sequence Detected: {individual.dnaFileType || 'FASTA'}</span>
                      <div className="flex gap-2">
                         <button className="text-slate-400 hover:text-white transition-colors" title="Download Sequence"><Download size={16}/></button>
                         <button onClick={() => { if(confirm("Remove DNA data?")) setIndividual({...individual, dnaSequence: undefined}); }} className="text-slate-400 hover:text-red-400 transition-colors"><Trash2 size={16}/></button>
                      </div>
                   </div>
                   <div className="bg-black/30 p-4 rounded font-mono text-[10px] text-emerald-600 break-all h-32 overflow-y-auto">
                      {individual.dnaSequence}
                   </div>
                </div>
              ) : (
                <button className="flex items-center gap-2 bg-slate-900 text-white px-8 py-4 rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg active:scale-95">
                   <Upload size={20} />
                   Upload DNA Sequence
                </button>
              )}
           </div>
        </div>
      )}

      {/* Weight Modal */}
      {showWeightModal && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
           <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-200">
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                 <h3 className="font-bold">Log {isPlant ? 'Measurement' : 'Weight'}</h3>
                 <button onClick={() => setShowWeightModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
              </div>
              <form onSubmit={handleAddWeight} className="p-6 space-y-4">
                 <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">Date</label>
                    <input type="date" name="date" className="w-full mt-1 px-4 py-2 border border-slate-300 rounded-lg outline-none" defaultValue={new Date().toISOString().split('T')[0]} required />
                 </div>
                 <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">{isPlant ? 'Height (cm)' : 'Weight (kg)'}</label>
                    <input type="number" step="0.01" name="weight" className="w-full mt-1 px-4 py-2 border border-slate-300 rounded-lg outline-none" required autoFocus />
                 </div>
                 <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">Note</label>
                    <input type="text" name="note" className="w-full mt-1 px-4 py-2 border border-slate-300 rounded-lg outline-none" placeholder="e.g. Regular checkup" />
                 </div>
                 <div className="pt-4 flex gap-2">
                    <button type="button" onClick={() => setShowWeightModal(false)} className="flex-1 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-bold">Cancel</button>
                    <button type="submit" className="flex-1 py-2 bg-emerald-600 text-white rounded-lg font-bold shadow-md hover:bg-emerald-700">Save Log</button>
                 </div>
              </form>
           </div>
        </div>
      )}

      {/* Health Modal */}
      {showHealthModal && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
           <div className="bg-white rounded-xl shadow-xl w-full max-md overflow-hidden animate-in zoom-in duration-200">
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                 <h3 className="font-bold">New Medical Record</h3>
                 <button onClick={() => setShowHealthModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
              </div>
              <form onSubmit={(e) => {
                 e.preventDefault();
                 if(!individual) return;
                 const fd = new FormData(e.currentTarget);
                 const log: HealthRecord = {
                    id: `h-${Date.now()}`,
                    date: fd.get('date') as string,
                    type: fd.get('type') as any,
                    description: fd.get('desc') as string,
                    performedBy: fd.get('who') as string
                 };
                 const updated = {...individual, healthHistory: [log, ...(individual.healthHistory || [])]};
                 const all = getIndividuals().map(i => i.id === individual.id ? updated : i);
                 saveIndividuals(all);
                 setIndividual(updated);
                 setShowHealthModal(false);
              }} className="p-6 space-y-4">
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                       <label className="text-[10px] font-bold text-slate-400 uppercase">Date</label>
                       <input type="date" name="date" className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" defaultValue={new Date().toISOString().split('T')[0]} required />
                    </div>
                    <div>
                       <label className="text-[10px] font-bold text-slate-400 uppercase">Type</label>
                       <select name="type" className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white" required>
                          <option value="Checkup">Checkup</option>
                          <option value="Vaccination">Vaccination</option>
                          <option value="Treatment">Treatment</option>
                          <option value="Injury">Injury</option>
                          <option value="Other">Other</option>
                       </select>
                    </div>
                 </div>
                 <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Performed By</label>
                    <input type="text" name="who" className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="Veterinarian Name" />
                 </div>
                 <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Description</label>
                    <textarea name="desc" className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" rows={4} placeholder="Detailed notes..." required />
                 </div>
                 <div className="pt-4 flex gap-2">
                    <button type="button" onClick={() => setShowHealthModal(false)} className="flex-1 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-bold">Cancel</button>
                    <button type="submit" className="flex-1 py-2 bg-emerald-600 text-white rounded-lg font-bold shadow-md hover:bg-emerald-700">Save Record</button>
                 </div>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default IndividualDetail;
