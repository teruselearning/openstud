
import React, { useState, useEffect, useRef, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getIndividuals, saveIndividuals, getSpecies, generatePattern, getBreedingLoans, sendMockNotification, getBreedingEvents, getNetworkPartners, getPartnerships, getOrg } from '../services/storage';
import { Individual, Species, WeightRecord, HealthRecord, GrowthRecord, BreedingEvent, ExternalPartner, Partnership } from '../types';
import { ArrowLeft, Scale, Activity, Syringe, Calendar, Plus, Stethoscope, Sprout, Camera, MapPin, Navigation, X, ChevronLeft, ChevronRight, Maximize2, Briefcase, Archive, Edit, Baby, Heart, ArrowRightLeft, ExternalLink, Fingerprint, Download, FileCode } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { LanguageContext } from '../App';

declare const L: any; // Leaflet global

const IndividualDetail: React.FC = () => {
  const { t } = useContext(LanguageContext);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [individual, setIndividual] = useState<Individual | null>(null);
  const [species, setSpecies] = useState<Species | null>(null);
  const [breedingHistory, setBreedingHistory] = useState<BreedingEvent[]>([]);
  
  // Map state for plants
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const hasInitialFit = useRef<boolean>(false);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);

  // Modals
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [showGrowthModal, setShowGrowthModal] = useState(false);
  const [showHealthModal, setShowHealthModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);

  // Data for Transfer
  const [partners, setPartners] = useState<ExternalPartner[]>([]);
  const [myPartnerships, setMyPartnerships] = useState<Partnership[]>([]);

  // Gallery State
  const [galleryIndex, setGalleryIndex] = useState<number>(-1);

  // Forms
  const [weightForm, setWeightForm] = useState({
    date: new Date().toISOString().split('T')[0],
    weightKg: '',
    note: '',
    imageUrl: ''
  });

  const [growthForm, setGrowthForm] = useState({
    date: new Date().toISOString().split('T')[0],
    heightCm: '',
    note: '',
    imageUrl: ''
  });

  const [healthForm, setHealthForm] = useState({
    date: new Date().toISOString().split('T')[0],
    type: 'Checkup',
    description: '',
    performedBy: ''
  });

  const [transferForm, setTransferForm] = useState({
    partnerId: '',
    date: new Date().toISOString().split('T')[0],
    note: ''
  });

  useEffect(() => {
    if (!id) return;
    const inds = getIndividuals();
    const ind = inds.find(i => i.id === id);
    if (ind) {
      setIndividual(ind);
      const allSpecies = getSpecies();
      const sp = allSpecies.find(s => s.id === ind.speciesId);
      setSpecies(sp || null);

      const allEvents = getBreedingEvents();
      const relevantEvents = allEvents.filter(e => e.sireId === ind.id || e.damId === ind.id)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setBreedingHistory(relevantEvents);
    }
    
    setPartners(getNetworkPartners());
    setMyPartnerships(getPartnerships());
  }, [id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (galleryIndex === -1) return;
      if (e.key === 'Escape') setGalleryIndex(-1);
      if (e.key === 'ArrowLeft') navigateGallery(-1);
      if (e.key === 'ArrowRight') navigateGallery(1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [galleryIndex]); 

  useEffect(() => {
    if (species?.type === 'Plant' && navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => console.error("Error watching location:", error.message),
        { enableHighAccuracy: true }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [species]);

  // 1. Map Initialization and Marker Setup
  useEffect(() => {
    if (species?.type !== 'Plant' || !individual?.latitude || !individual?.longitude || !mapRef.current) return;

    if (!leafletMap.current) {
      const map = L.map(mapRef.current, {
        maxZoom: 22
      }).setView([individual.latitude, individual.longitude], 18);
      leafletMap.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 22,
        maxNativeZoom: 19
      }).addTo(map);
    }

    const map = leafletMap.current;
    
    map.eachLayer((layer: any) => {
      if (layer instanceof L.Marker && layer !== userMarkerRef.current) map.removeLayer(layer);
    });

    const plantIcon = L.divIcon({
      className: 'custom-div-icon',
      html: `<div style="background-color: #16a34a; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    L.marker([individual.latitude, individual.longitude], { icon: plantIcon })
      .addTo(map)
      .bindPopup(`<b>${individual.name}</b><br>Plant Location`);

    if (!hasInitialFit.current) {
        if (userLocation) {
          const bounds = L.latLngBounds([
            [individual.latitude, individual.longitude],
            [userLocation.lat, userLocation.lng]
          ]);
          map.fitBounds(bounds.pad(0.3));
        } else {
          map.setView([individual.latitude, individual.longitude], 18);
        }
        hasInitialFit.current = true;
    }
    
    setTimeout(() => map.invalidateSize(), 200);
  }, [individual, species]);

  useEffect(() => {
    if (!leafletMap.current || !userLocation) return;
    const map = leafletMap.current;

    const userIcon = L.divIcon({
      className: 'custom-div-icon',
      html: `<div style="background-color: #2563eb; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.3);"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng]);
    } else {
      userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon, zIndexOffset: 1000 })
        .addTo(map)
        .bindPopup("You are here");
    }
  }, [userLocation]);

  const handleLocateMe = () => {
    if (!leafletMap.current || !userLocation) return;
    leafletMap.current.flyTo([userLocation.lat, userLocation.lng], 20);
  };

  const saveUpdate = (updatedInd: Individual) => {
    const inds = getIndividuals();
    const newInds = inds.map(i => i.id === updatedInd.id ? updatedInd : i);
    saveIndividuals(newInds);
    setIndividual(updatedInd);
  };
  
  const checkAndNotifyLoanRecipient = (ind: Individual, logType: string, detail: string) => {
     const loans = getBreedingLoans();
     const activeLoan = loans.find(l => 
        l.individualIds.includes(ind.id) && 
        l.status === 'Active' && 
        l.notificationRecipientId
     );
     if (activeLoan && activeLoan.notificationRecipientId) {
        sendMockNotification(activeLoan.notificationRecipientId, `Update: ${ind.name} (${ind.studbookId})`, `A new ${logType} record was added.\nDetails: ${detail}`, 'LoanUpdate');
     }
  };

  const handleWeightImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setWeightForm(prev => ({ ...prev, imageUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddWeight = (e: React.FormEvent) => {
    e.preventDefault();
    if (!individual) return;
    const hasWeight = weightForm.weightKg !== '';
    const newRecord: WeightRecord = {
      id: `w-${Date.now()}`,
      date: weightForm.date,
      weightKg: hasWeight ? Number(weightForm.weightKg) : undefined,
      note: weightForm.note,
      imageUrl: weightForm.imageUrl
    };
    const currentHistory = Array.isArray(individual.weightHistory) ? individual.weightHistory : [];
    const newHistory = [...currentHistory, newRecord].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const updatedInd = { ...individual, weightKg: hasWeight ? Number(weightForm.weightKg) : individual.weightKg, weightHistory: newHistory };
    saveUpdate(updatedInd);
    checkAndNotifyLoanRecipient(updatedInd, 'Weight Log', `${newRecord.weightKg} kg recorded on ${newRecord.date}`);
    setShowWeightModal(false);
    setWeightForm({ date: new Date().toISOString().split('T')[0], weightKg: '', note: '', imageUrl: '' });
  };

  const handleAddGrowth = (e: React.FormEvent) => {
    e.preventDefault();
    if (!individual || !growthForm.heightCm) return;
    const newRecord: GrowthRecord = { id: `g-${Date.now()}`, date: growthForm.date, heightCm: Number(growthForm.heightCm), imageUrl: growthForm.heightCm, note: growthForm.note };
    const currentHistory = Array.isArray(individual.growthHistory) ? individual.growthHistory : [];
    const newHistory = [...currentHistory, newRecord].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const updatedInd = { ...individual, growthHistory: newHistory };
    saveUpdate(updatedInd);
    checkAndNotifyLoanRecipient(updatedInd, 'Growth Log', `${newRecord.heightCm} cm recorded on ${newRecord.date}`);
    setShowGrowthModal(false);
    setGrowthForm({ date: new Date().toISOString().split('T')[0], heightCm: '', note: '', imageUrl: '' });
  };

  const handleAddHealth = (e: React.FormEvent) => {
    e.preventDefault();
    if (!individual || !healthForm.description) return;
    const newRecord: HealthRecord = { id: `h-${Date.now()}`, date: healthForm.date, type: healthForm.type as any, description: healthForm.description, performedBy: healthForm.performedBy };
    const currentHistory = Array.isArray(individual.healthHistory) ? individual.healthHistory : [];
    const newHistory = [...currentHistory, newRecord].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const updatedInd = { ...individual, healthHistory: newHistory };
    saveUpdate(updatedInd);
    checkAndNotifyLoanRecipient(updatedInd, 'Health Record', `${newRecord.type}: ${newRecord.description}`);
    setShowHealthModal(false);
    setHealthForm({ date: new Date().toISOString().split('T')[0], type: 'Checkup', description: '', performedBy: '' });
  };

  const handleTransfer = (e: React.FormEvent) => {
     e.preventDefault();
     if (!individual || !transferForm.partnerId) return;
     const updatedInd = { ...individual, transferredToOrgId: transferForm.partnerId, transferDate: transferForm.date, transferNote: transferForm.note };
     saveUpdate(updatedInd);
     setShowTransferModal(false);
  };

  const handleGrowthImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setGrowthForm(prev => ({ ...prev, imageUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEditProfile = () => {
    if (individual) {
      navigate('/individuals', { state: { editId: individual.id, returnTo: window.location.hash.substring(1) } });
    }
  };

  const handleDownloadDna = () => {
    if (!individual?.dnaSequence) return;
    const blob = new Blob([individual.dnaSequence], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = individual.dnaFileName || `${individual.studbookId}_genetic_data.dna`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getDisplayImage = () => {
    if (!individual) return '';
    const sp = species;
    const isPattern = (url?: string) => !url || url.startsWith('data:image/svg+xml');
    if (individual.imageUrl && !isPattern(individual.imageUrl)) return individual.imageUrl;
    
    const weightHistory = Array.isArray(individual.weightHistory) ? individual.weightHistory : [];
    const growthHistory = Array.isArray(individual.growthHistory) ? individual.growthHistory : [];
    
    const logs = [...weightHistory, ...growthHistory]
      .filter(r => r.imageUrl && !isPattern(r.imageUrl))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (logs.length > 0) return logs[0].imageUrl!;
    if (sp?.imageUrl && !isPattern(sp.imageUrl)) return sp.imageUrl;
    return individual.imageUrl || sp?.imageUrl || generatePattern(individual.name);
  };

  if (!individual) return <div className="p-8 text-center">Loading...</div>;

  const isPlant = species?.type === 'Plant';
  const showSexBadge = !isPlant || (isPlant && species?.plantClassification === 'Dioecious');
  const displayImage = getDisplayImage();
  const myOrg = getOrg();
  const myActivePartners = partners.filter(p => myPartnerships.some(rel => (rel.orgId1 === myOrg.id && rel.orgId2 === p.id) || (rel.orgId1 === p.id && rel.orgId2 === myOrg.id)));

  const weightHistory = Array.isArray(individual.weightHistory) ? individual.weightHistory : [];
  const growthHistory = Array.isArray(individual.growthHistory) ? individual.growthHistory : [];
  const healthHistory = Array.isArray(individual.healthHistory) ? individual.healthHistory : [];

  const weightData = weightHistory.filter(w => w.weightKg !== undefined && w.weightKg !== null).map(w => ({ date: w.date, value: w.weightKg })) || [];
  const growthData = growthHistory.map(g => ({ date: g.date, value: g.heightCm })) || [];
  const chartData = isPlant ? growthData : weightData;
  const showGraph = chartData.length >= 2;
  const historySource = isPlant ? growthHistory : weightHistory;
  const galleryRecords = [...(historySource || [])].reverse().filter(rec => rec.imageUrl); 

  const openGallery = (recordId: string) => {
    const index = galleryRecords.findIndex(r => r.id === recordId);
    if (index !== -1) setGalleryIndex(index);
  };

  const navigateGallery = (direction: number) => {
    const newIndex = galleryIndex + direction;
    if (newIndex >= 0 && newIndex < galleryRecords.length) setGalleryIndex(newIndex);
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start md:items-center space-x-4">
          <button onClick={() => navigate('/individuals')} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-600 flex-shrink-0 mt-1 md:mt-0">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex flex-wrap items-center gap-2">
              {individual.name}
              {individual.loanStatus === 'Loaned Out' && <span className="text-[10px] bg-amber-500 text-white px-2 py-0.5 rounded-full uppercase font-bold flex items-center gap-1"><Briefcase size={10} /> {t('logWeight')}</span>}
              {individual.loanStatus === 'On Loan' && <span className="text-[10px] bg-purple-600 text-white px-2 py-0.5 rounded-full uppercase font-bold flex items-center gap-1"><Briefcase size={10} /> {t('onLoan')}</span>}
              {individual.transferredToOrgId && <span className="text-[10px] bg-slate-700 text-white px-2 py-0.5 rounded-full uppercase font-bold flex items-center gap-1"><ArrowRightLeft size={10} /> {t('transferredOut')}</span>}
            </h1>
            <div className="text-slate-500 text-sm flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mt-1">
              <span className="font-mono text-xs">{individual.studbookId}</span>
              <span className="hidden sm:inline">•</span>
              <div className="flex items-center gap-2">
                <span className="italic">
                  {species?.commonName} ({species?.scientificName})
                </span>
                {species?.scientificName && (
                  <a 
                    href={`https://www.inaturalist.org/search?q=${encodeURIComponent(species.scientificName)}`} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-emerald-600 hover:text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1"
                    title="View on iNaturalist"
                  >
                    iNat <ExternalLink size={10} />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:flex gap-2 w-full md:w-auto">
           {myActivePartners.length > 0 && (
             <button onClick={() => setShowTransferModal(true)} className="flex items-center justify-center gap-2 text-slate-600 hover:text-purple-600 bg-white border border-slate-200 hover:border-purple-200 px-4 py-2.5 rounded-lg font-bold transition-colors shadow-sm text-sm">
               <ArrowRightLeft size={18} />
               <span>{t('transferToPartner')}</span>
             </button>
           )}
           <button onClick={handleEditProfile} className="flex items-center justify-center gap-2 text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 rounded-lg font-bold transition-all shadow-md shadow-emerald-100 text-sm">
             <Edit size={18} />
             <span>{t('editProfile')}</span>
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
             <div className="h-64 bg-slate-100 relative">
               {displayImage ? <img src={displayImage} alt={individual.name} className={`w-full h-full object-cover ${individual.isDeceased ? 'grayscale' : ''}`} /> : <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-300">No Image</div>}
               <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
                 <div className="flex justify-between items-end text-white">
                    <div>
                      <p className="text-xs opacity-80 uppercase tracking-wider">{isPlant ? t('location') : t('adultWeight')}</p>
                      <p className="text-lg font-bold truncate max-w-[200px]">{isPlant ? (individual.latitude ? `${individual.latitude.toFixed(3)}, ${individual.longitude?.toFixed(3)}` : t('unknown')) : `${individual.weightKg} kg`}</p>
                    </div>
                    {showSexBadge && <div className={`px-3 py-1 rounded-full text-xs font-bold ${individual.sex === 'Male' ? 'bg-blue-500' : individual.sex === 'Female' ? 'bg-pink-500' : 'bg-slate-500'}`}>{individual.sex}</div>}
                    {isPlant && <div className="px-3 py-1 rounded-full text-xs font-bold bg-green-600">{t('plant')}</div>}
                 </div>
               </div>
             </div>
             <div className="p-4 space-y-3">
                {individual.transferredToOrgId && <div className="bg-slate-100 p-3 rounded-lg border border-slate-200 mb-2"><p className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1 mb-1"><ArrowRightLeft size={12}/> {t('transferToPartner')}</p><p className="text-sm text-slate-900 font-bold">To: {partners.find(p => p.id === individual.transferredToOrgId)?.name || t('unknown')}</p><p className="text-xs text-slate-500">Date: {individual.transferDate}</p></div>}
                <div className="flex justify-between py-2 border-b border-slate-50"><span className="text-slate-500 text-sm">{isPlant ? t('datePlanted') : t('dateOfBirth')}</span><span className="text-slate-900 font-medium text-sm">{individual.birthDate}</span></div>
                <div className="flex justify-between py-2 border-b border-slate-50"><span className="text-slate-500 text-sm">Age</span><span className="text-slate-900 font-medium text-sm">{individual.birthDate ? (new Date(individual.isDeceased && individual.deathDate ? individual.deathDate : Date.now()).getFullYear() - new Date(individual.birthDate).getFullYear()) + ' years' : t('unknown')}</span></div>
                {individual.isDeceased && <div className="flex justify-between py-2 border-b border-slate-50 text-red-600"><span className="text-sm font-medium">{t('dateDeceased')}</span><span className="text-sm">{individual.deathDate}</span></div>}
                {individual.source && <div className="flex justify-between py-2 border-b border-slate-50"><span className="text-slate-500 text-sm flex items-center gap-1"><Archive size={14}/> {t('acquisitionSource')}</span><span className="text-slate-900 font-medium text-sm text-right">{individual.source}{individual.sourceDetails && <span className="block text-xs text-slate-500">{individual.sourceDetails}</span>}</span></div>}
                <div className="pt-2"><span className="text-slate-500 text-xs uppercase tracking-wider block mb-1">{t('notes')}</span><p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg">{individual.notes || "No notes recorded."}</p></div>
             </div>
          </div>

          {individual.dnaSequence && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
               <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-indigo-700">
                     <Fingerprint size={20} />
                     <h3 className="font-bold text-lg">{t('geneticsTitle')}</h3>
                  </div>
                  <button onClick={handleDownloadDna} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Download Genetic Data">
                     <Download size={18} />
                  </button>
               </div>
               <div className="bg-slate-900 rounded-lg p-3 overflow-hidden border border-slate-800">
                  <div className="flex items-center justify-between border-b border-indigo-900/50 pb-2 mb-2">
                     <div className="flex items-center gap-2">
                        <FileCode size={14} className="text-indigo-400"/>
                        <p className="text-[10px] text-indigo-400 font-mono uppercase tracking-widest">{individual.dnaFileName || t('geneticsTitle')}</p>
                     </div>
                     <span className="text-[9px] font-bold text-indigo-500/50 uppercase">{individual.dnaFileType || 'DATA'}</span>
                  </div>
                  <pre className="text-[11px] text-indigo-200 font-mono whitespace-pre-wrap break-all max-h-40 overflow-y-auto custom-scrollbar">
                     {individual.dnaSequence.length > 5000 ? `${individual.dnaSequence.substring(0, 5000)}... [File Truncated for View]` : individual.dnaSequence}
                  </pre>
               </div>
               <p className="text-[9px] text-slate-400 mt-2 text-center uppercase tracking-tighter">Secure Genomic Storage</p>
            </div>
          )}

          {isPlant && individual.latitude && individual.longitude && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
               <div className="flex items-center gap-2 mb-3 text-slate-900 font-bold text-sm"><Navigation size={16} className="text-blue-600" /><span>{t('liveTracking')}</span></div>
               <div className="h-48 w-full rounded-lg border border-slate-200 overflow-hidden relative z-0 flex flex-col gap-2">
                  <div ref={mapRef} className="flex-1 w-full rounded shadow-inner"></div>
                  <button onClick={handleLocateMe} className="bg-white border border-slate-200 rounded p-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-1"><Navigation size={10}/> {t('centerMyLocation')}</button>
               </div>
               <div className="mt-2 text-xs text-slate-500 flex items-center gap-4"><div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-600"></div> {t('plant')}</div><div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-600"></div> You</div></div>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
             <div className="flex justify-between items-center mb-6"><div className="flex items-center space-x-2 text-emerald-700">{isPlant ? <Sprout size={20} /> : <Scale size={20} />}<h3 className="font-bold text-lg">{isPlant ? t('growthHistory') : t('historyTitle')}</h3></div><button onClick={() => isPlant ? setShowGrowthModal(true) : setShowWeightModal(true)} className="text-sm bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1"><Plus size={16} /> {isPlant ? t('add') : t('add')}</button></div>
             <div className="h-64 w-full mb-6">
                {showGraph ? <ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" /><XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} /><YAxis stroke="#94a3b8" fontSize={12} tickLine={false} unit={isPlant ? "cm" : "kg"} /><Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} /><Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981', r: 4 }} activeDot={{ r: 6 }} /></LineChart></ResponsiveContainer> : <div className="flex items-center justify-center h-full text-slate-400 text-sm italic">{isPlant ? (chartData.length === 0 ? 'No growth history recorded.' : 'Need at least 2 logs to visualize growth.') : (chartData.length === 0 ? 'No history yet' : 'Need at least 2 logs to visualize weight trend.')}</div>}
             </div>
             <div className="max-h-64 overflow-y-auto border-t border-slate-100 pt-4">
                <div className="space-y-3">
                  {[...(historySource || [])].reverse().map(rec => (
                    <div key={rec.id} className="flex gap-4 items-start p-3 hover:bg-slate-50 rounded-lg border border-transparent hover:border-slate-100 transition-all">
                       <div className="relative group">{rec.imageUrl ? <img src={rec.imageUrl} className="w-16 h-16 rounded-lg object-cover bg-slate-200 cursor-pointer shadow-sm group-hover:shadow-md transition-all group-hover:scale-105" alt="Log Image" onClick={() => openGallery(rec.id)} /> : <div className="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center text-slate-300">{isPlant ? <Sprout size={20}/> : <Scale size={20} />}</div>}{rec.imageUrl && <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 rounded-lg text-white"><Maximize2 size={16}/></div>}</div>
                       <div><div className="flex items-center gap-2"><span className="font-bold text-slate-900">{isPlant ? (rec as GrowthRecord).heightCm + ' cm' : (rec as WeightRecord).weightKg + ' kg'}</span><span className="text-xs text-slate-500">• {rec.date}</span></div><p className="text-sm text-slate-600 mt-1">{rec.note}</p></div>
                    </div>
                  ))}
                </div>
             </div>
          </div>

          {!isPlant && (
             <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center gap-2 text-pink-600 mb-6"><Heart size={20} /><h3 className="font-bold text-lg">{t('breedingHistory')}</h3></div>
                <div className="space-y-4">
                   {breedingHistory.length === 0 ? <p className="text-center text-slate-400 italic py-4">No breeding events recorded.</p> : breedingHistory.map(evt => (
                      <div key={evt.id} className="flex gap-4 p-4 bg-slate-50 rounded-lg border border-slate-100"><div className="mt-1 p-2 rounded-full flex-shrink-0 bg-pink-100 text-pink-600"><Baby size={16} /></div><div className="flex-1"><div className="flex justify-between items-start"><h4 className="font-bold text-slate-900">{evt.successfulBirths} {t('offspring')}{individual.loanStatus === 'Loaned Out' && <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">Off-Site</span>}</h4><span className="text-xs text-slate-500 flex items-center"><Calendar size={12} className="mr-1"/> {evt.date}</span></div><p className="text-xs text-slate-500 mt-1">Role: {evt.sireId === individual.id ? 'Sire' : 'Dam'}</p>{evt.notes && <p className="text-sm text-slate-700 mt-1 italic">"{evt.notes}"</p>}</div></div>
                   ))}
                </div>
             </div>
          )}

          {!isPlant && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
               <div className="flex justify-between items-center mb-6"><div className="flex items-center space-x-2 text-blue-700"><Stethoscope size={20} /><h3 className="font-bold text-lg">{t('healthRecords')}</h3></div><button onClick={() => setShowHealthModal(true)} className="text-sm bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1"><Plus size={16} /> {t('addRecord')}</button></div>
               <div className="space-y-4">
                 {healthHistory.length === 0 ? <p className="text-center text-slate-400 italic py-4">No health records found.</p> : healthHistory.map(rec => (
                     <div key={rec.id} className="flex gap-4 p-4 bg-slate-50 rounded-lg border border-slate-100"><div className={`mt-1 p-2 rounded-full flex-shrink-0 ${rec.type === 'Vaccination' ? 'bg-purple-100 text-purple-600' : rec.type === 'Injury' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>{rec.type === 'Vaccination' ? <Syringe size={16} /> : <Activity size={16} />}</div><div className="flex-1"><div className="flex justify-between items-start"><h4 className="font-semibold text-slate-900">{rec.type}</h4><span className="text-xs text-slate-500 flex items-center"><Calendar size={12} className="mr-1"/> {rec.date}</span></div><p className="text-sm text-slate-700 mt-1">{rec.description}</p>{rec.performedBy && <p className="text-xs text-slate-500 mt-2">Performed by: {rec.performedBy}</p>}</div></div>
                 ))}
               </div>
            </div>
          )}
        </div>
      </div>
      {/* ... Modals ... */}
    </div>
  );
};

export default IndividualDetail;
