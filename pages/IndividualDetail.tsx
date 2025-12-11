


import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getIndividuals, saveIndividuals, getSpecies, generatePattern, getBreedingLoans, sendMockNotification, getBreedingEvents, getNetworkPartners, getPartnerships, getOrg } from '../services/storage';
import { Individual, Species, WeightRecord, HealthRecord, GrowthRecord, BreedingEvent, ExternalPartner, Partnership } from '../types';
import { ArrowLeft, Scale, Activity, Syringe, Calendar, Save, Plus, Stethoscope, Sprout, Camera, MapPin, Navigation, X, ChevronLeft, ChevronRight, Maximize2, Briefcase, Archive, Edit, Baby, Heart, ArrowRightLeft, Building2, ExternalLink } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

declare const L: any; // Leaflet global

const IndividualDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [individual, setIndividual] = useState<Individual | null>(null);
  const [species, setSpecies] = useState<Species | null>(null);
  const [breedingHistory, setBreedingHistory] = useState<BreedingEvent[]>([]);
  
  // Map state for plants
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);
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

      // Load Breeding History
      const allEvents = getBreedingEvents();
      const relevantEvents = allEvents.filter(e => e.sireId === ind.id || e.damId === ind.id)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setBreedingHistory(relevantEvents);
    }
    
    // Load Partners for Transfer Modal
    setPartners(getNetworkPartners());
    setMyPartnerships(getPartnerships());
  }, [id]);

  // Gallery Keyboard Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (galleryIndex === -1) return;
      if (e.key === 'Escape') setGalleryIndex(-1);
      if (e.key === 'ArrowLeft') navigateGallery(-1);
      if (e.key === 'ArrowRight') navigateGallery(1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [galleryIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Geolocation for Plants
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

  // Initialize Map for Plants
  useEffect(() => {
    if (species?.type !== 'Plant' || !individual?.latitude || !individual?.longitude || !mapRef.current) return;

    if (!leafletMap.current) {
      const map = L.map(mapRef.current).setView([individual.latitude, individual.longitude], 15);
      leafletMap.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(map);
    }

    const map = leafletMap.current;
    
    // Clear existing layers to avoid duplicates on re-renders
    map.eachLayer((layer: any) => {
      if (layer instanceof L.Marker) {
        map.removeLayer(layer);
      }
    });

    // Plant Marker (Green)
    const plantIcon = L.divIcon({
      className: 'custom-div-icon',
      html: `<div style="background-color: #16a34a; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    const plantMarker = L.marker([individual.latitude, individual.longitude], { icon: plantIcon })
      .addTo(map)
      .bindPopup(`<b>${individual.name}</b><br>Plant Location`);

    // User Marker (Blue Pulse) if available
    if (userLocation) {
      const userIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="background-color: #2563eb; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.3);"></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const userMarker = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
        .addTo(map)
        .bindPopup("You are here");

      // Fit bounds to show both
      const bounds = L.latLngBounds([
        [individual.latitude, individual.longitude],
        [userLocation.lat, userLocation.lng]
      ]);
      map.fitBounds(bounds.pad(0.2));
    } else {
      // Just center on plant if no user loc yet
      map.setView([individual.latitude, individual.longitude], 15);
    }

    // Fix rendering issues
    setTimeout(() => map.invalidateSize(), 200);

  }, [individual, userLocation, species]);


  const saveUpdate = (updatedInd: Individual) => {
    const inds = getIndividuals();
    const newInds = inds.map(i => i.id === updatedInd.id ? updatedInd : i);
    saveIndividuals(newInds);
    setIndividual(updatedInd);
  };
  
  // Helper to send notification if individual is part of a loan with a nominated recipient
  const checkAndNotifyLoanRecipient = (ind: Individual, logType: string, detail: string) => {
     const loans = getBreedingLoans();
     // Find active loan where this individual is included AND a recipient is set
     const activeLoan = loans.find(l => 
        l.individualIds.includes(ind.id) && 
        l.status === 'Active' && 
        l.notificationRecipientId
     );
     
     if (activeLoan && activeLoan.notificationRecipientId) {
        sendMockNotification(
           activeLoan.notificationRecipientId,
           `Update: ${ind.name} (${ind.studbookId})`,
           `A new ${logType} record was added.\nDetails: ${detail}`,
           'LoanUpdate'
        );
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

    // Sort chronologically
    const newHistory = [...(individual.weightHistory || []), newRecord].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    const updatedInd = {
      ...individual,
      // Only update current weight if a new weight was provided
      weightKg: hasWeight ? Number(weightForm.weightKg) : individual.weightKg,
      weightHistory: newHistory
    };

    saveUpdate(updatedInd);
    
    // Notify if needed
    checkAndNotifyLoanRecipient(updatedInd, 'Weight Log', `${newRecord.weightKg} kg recorded on ${newRecord.date}`);
    
    setShowWeightModal(false);
    setWeightForm({ date: new Date().toISOString().split('T')[0], weightKg: '', note: '', imageUrl: '' });
  };

  const handleAddGrowth = (e: React.FormEvent) => {
    e.preventDefault();
    if (!individual || !growthForm.heightCm) return;

    const newRecord: GrowthRecord = {
      id: `g-${Date.now()}`,
      date: growthForm.date,
      heightCm: Number(growthForm.heightCm),
      imageUrl: growthForm.imageUrl,
      note: growthForm.note
    };

    const newHistory = [...(individual.growthHistory || []), newRecord].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const updatedInd = {
      ...individual,
      growthHistory: newHistory
    };

    saveUpdate(updatedInd);
    
    // Notify
    checkAndNotifyLoanRecipient(updatedInd, 'Growth Log', `${newRecord.heightCm} cm recorded on ${newRecord.date}`);

    setShowGrowthModal(false);
    setGrowthForm({ date: new Date().toISOString().split('T')[0], heightCm: '', note: '', imageUrl: '' });
  };

  const handleAddHealth = (e: React.FormEvent) => {
    e.preventDefault();
    if (!individual || !healthForm.description) return;

    const newRecord: HealthRecord = {
      id: `h-${Date.now()}`,
      date: healthForm.date,
      type: healthForm.type as any,
      description: healthForm.description,
      performedBy: healthForm.performedBy
    };

    const newHistory = [...(individual.healthHistory || []), newRecord].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const updatedInd = {
      ...individual,
      healthHistory: newHistory
    };

    saveUpdate(updatedInd);
    
    // Notify
    checkAndNotifyLoanRecipient(updatedInd, 'Health Record', `${newRecord.type}: ${newRecord.description}`);

    setShowHealthModal(false);
    setHealthForm({ date: new Date().toISOString().split('T')[0], type: 'Checkup', description: '', performedBy: '' });
  };

  const handleTransfer = (e: React.FormEvent) => {
     e.preventDefault();
     if (!individual || !transferForm.partnerId) return;
     
     const updatedInd = {
        ...individual,
        transferredToOrgId: transferForm.partnerId,
        transferDate: transferForm.date,
        transferNote: transferForm.note
     };
     
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
      // Pass returnTo path in state so IndividualManager knows where to send us back
      navigate('/individuals', { 
        state: { 
          editId: individual.id, 
          returnTo: window.location.hash.substring(1) // Get current hash path
        } 
      });
    }
  };

  // Helper to determine the best image to show
  const getDisplayImage = () => {
    if (!individual) return '';
    const sp = species;
    const isPattern = (url?: string) => !url || url.startsWith('data:image/svg+xml');
    
    // 1. Real Main Image (User uploaded)
    if (individual.imageUrl && !isPattern(individual.imageUrl)) return individual.imageUrl;
    
    // 2. Real History Image (from logs)
    const logs = [...(individual.weightHistory || []), ...(individual.growthHistory || [])]
      .filter(r => r.imageUrl && !isPattern(r.imageUrl))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    if (logs.length > 0) return logs[0].imageUrl!;

    // 3. Real Species Image
    if (sp?.imageUrl && !isPattern(sp.imageUrl)) return sp.imageUrl;

    // 4. Fallbacks: Main Pattern -> Species Pattern -> Generated
    return individual.imageUrl || sp?.imageUrl || generatePattern(individual.name);
  };

  if (!individual) return <div className="p-8 text-center">Loading...</div>;

  const isPlant = species?.type === 'Plant';
  const showSexBadge = !isPlant || (isPlant && species?.plantClassification === 'Dioecious');
  const displayImage = getDisplayImage();
  const myOrg = getOrg();

  // Filter my partners for transfer dropdown
  const myActivePartners = partners.filter(p => 
     myPartnerships.some(rel => 
        (rel.orgId1 === myOrg.id && rel.orgId2 === p.id) || 
        (rel.orgId1 === p.id && rel.orgId2 === myOrg.id)
     )
  );

  // Prepare chart data
  const weightData = individual.weightHistory
      ?.filter(w => w.weightKg !== undefined && w.weightKg !== null)
      .map(w => ({ date: w.date, value: w.weightKg })) || [];

  const growthData = individual.growthHistory?.map(g => ({ date: g.date, value: g.heightCm })) || [];
  const chartData = isPlant ? growthData : weightData;
  const showGraph = chartData.length >= 2;

  // Prepare Gallery Data
  const historySource = isPlant ? individual.growthHistory : individual.weightHistory;
  const galleryRecords = [...(historySource || [])]
    .reverse() 
    .filter(rec => rec.imageUrl); 

  const openGallery = (recordId: string) => {
    const index = galleryRecords.findIndex(r => r.id === recordId);
    if (index !== -1) setGalleryIndex(index);
  };

  const navigateGallery = (direction: number) => {
    const newIndex = galleryIndex + direction;
    if (newIndex >= 0 && newIndex < galleryRecords.length) {
      setGalleryIndex(newIndex);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button onClick={() => navigate('/individuals')} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-600">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
              {individual.name}
              {individual.loanStatus === 'Loaned Out' && (
                  <span className="text-xs bg-amber-500 text-white px-2 py-1 rounded-full uppercase font-bold flex items-center gap-1">
                    <Briefcase size={12} /> Loaned Out
                  </span>
              )}
              {individual.loanStatus === 'On Loan' && (
                  <span className="text-xs bg-purple-600 text-white px-2 py-1 rounded-full uppercase font-bold flex items-center gap-1">
                    <Briefcase size={12} /> On Loan
                  </span>
              )}
              {individual.transferredToOrgId && (
                  <span className="text-xs bg-slate-700 text-white px-2 py-1 rounded-full uppercase font-bold flex items-center gap-1">
                    <ArrowRightLeft size={12} /> Transferred
                  </span>
              )}
            </h1>
            <p className="text-slate-500 text-sm flex items-center gap-2">
              <span>{individual.studbookId}</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                {species?.commonName} ({species?.scientificName})
                {species?.scientificName && (
                    <a 
                        href={`https://www.inaturalist.org/search?q=${encodeURIComponent(species.scientificName)}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-emerald-600 hover:text-emerald-800 inline-flex items-center ml-1"
                        title="More info on iNaturalist"
                    >
                        <ExternalLink size={12} />
                    </a>
                )}
              </span>
            </p>
          </div>
        </div>
        <div className="flex gap-2">
           <button 
             onClick={() => setShowTransferModal(true)}
             className="flex items-center gap-2 text-slate-600 hover:text-purple-600 bg-white border border-slate-200 hover:border-purple-200 px-3 py-2 rounded-lg font-medium transition-colors shadow-sm"
             title="Transfer to Partner"
           >
             <ArrowRightLeft size={16} />
             <span className="hidden sm:inline">Transfer</span>
           </button>
           <button 
             onClick={handleEditProfile}
             className="flex items-center gap-2 text-slate-600 hover:text-emerald-600 bg-white border border-slate-200 hover:border-emerald-200 px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
           >
             <Edit size={16} />
             <span className="hidden sm:inline">Edit Profile</span>
           </button>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Stats & Profile */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
             <div className="h-64 bg-slate-100 relative">
               {displayImage ? (
                 <img src={displayImage} alt={individual.name} className={`w-full h-full object-cover ${individual.isDeceased ? 'grayscale' : ''}`} />
               ) : (
                 <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-300">No Image</div>
               )}
               <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
                 <div className="flex justify-between items-end text-white">
                    <div>
                      <p className="text-xs opacity-80 uppercase tracking-wider">
                        {isPlant ? 'Location' : 'Current Weight'}
                      </p>
                      <p className="text-lg font-bold truncate max-w-[200px]">
                        {isPlant 
                          ? (individual.latitude ? `${individual.latitude.toFixed(3)}, ${individual.longitude?.toFixed(3)}` : 'Unknown')
                          : `${individual.weightKg} kg`
                        }
                      </p>
                    </div>
                    {showSexBadge && (
                      <div className={`px-3 py-1 rounded-full text-xs font-bold ${individual.sex === 'Male' ? 'bg-blue-500' : individual.sex === 'Female' ? 'bg-pink-500' : 'bg-slate-500'}`}>
                        {individual.sex}
                      </div>
                    )}
                    {isPlant && <div className="px-3 py-1 rounded-full text-xs font-bold bg-green-600">Plant</div>}
                 </div>
               </div>
             </div>
             <div className="p-4 space-y-3">
                {individual.transferredToOrgId && (
                   <div className="bg-slate-100 p-3 rounded-lg border border-slate-200 mb-2">
                      <p className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1 mb-1">
                         <ArrowRightLeft size={12}/> Transferred Out
                      </p>
                      <p className="text-sm text-slate-900 font-bold">
                         To: {partners.find(p => p.id === individual.transferredToOrgId)?.name || 'Unknown Partner'}
                      </p>
                      <p className="text-xs text-slate-500">Date: {individual.transferDate}</p>
                   </div>
                )}
             
                <div className="flex justify-between py-2 border-b border-slate-50">
                   <span className="text-slate-500 text-sm">{isPlant ? 'Planted' : 'Born'}</span>
                   <span className="text-slate-900 font-medium text-sm">{individual.birthDate}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-50">
                   <span className="text-slate-500 text-sm">Age</span>
                   <span className="text-slate-900 font-medium text-sm">
                     {individual.birthDate 
                       ? (new Date(individual.isDeceased && individual.deathDate ? individual.deathDate : Date.now()).getFullYear() - new Date(individual.birthDate).getFullYear()) + ' yrs' 
                       : 'Unknown'}
                   </span>
                </div>
                {individual.isDeceased && (
                  <div className="flex justify-between py-2 border-b border-slate-50 text-red-600">
                     <span className="text-sm font-medium">Died</span>
                     <span className="text-sm">{individual.deathDate}</span>
                  </div>
                )}
                {individual.source && (
                  <div className="flex justify-between py-2 border-b border-slate-50">
                     <span className="text-slate-500 text-sm flex items-center gap-1"><Archive size={14}/> Source</span>
                     <span className="text-slate-900 font-medium text-sm text-right">
                        {individual.source}
                        {individual.sourceDetails && <span className="block text-xs text-slate-500">{individual.sourceDetails}</span>}
                     </span>
                  </div>
                )}
                <div className="pt-2">
                   <span className="text-slate-500 text-xs uppercase tracking-wider block mb-1">Notes</span>
                   <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg">{individual.notes || "No notes recorded."}</p>
                </div>
             </div>
          </div>

          {/* Location Map for Plants */}
          {isPlant && individual.latitude && individual.longitude && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
               <div className="flex items-center gap-2 mb-3 text-slate-900 font-bold text-sm">
                  <Navigation size={16} className="text-blue-600" />
                  <span>Live Tracking</span>
               </div>
               <div className="h-48 w-full rounded-lg border border-slate-200 overflow-hidden relative z-0">
                  <div ref={mapRef} className="h-full w-full"></div>
                  {!userLocation && (
                    <div className="absolute bottom-2 left-2 bg-white/90 px-2 py-1 text-[10px] rounded shadow z-[1000] text-slate-500">
                      Locating you...
                    </div>
                  )}
               </div>
               <div className="mt-2 text-xs text-slate-500 flex items-center gap-4">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-green-600"></div> Plant
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-blue-600"></div> You
                  </div>
               </div>
            </div>
          )}
        </div>

        {/* Center/Right: Charts & Logs */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Weight / Growth Section */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
             <div className="flex justify-between items-center mb-6">
                <div className="flex items-center space-x-2 text-emerald-700">
                   {isPlant ? <Sprout size={20} /> : <Scale size={20} />}
                   <h3 className="font-bold text-lg">{isPlant ? 'Growth History' : 'History'}</h3>
                </div>
                <button 
                  onClick={() => isPlant ? setShowGrowthModal(true) : setShowWeightModal(true)}
                  className="text-sm bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1"
                >
                  <Plus size={16} /> {isPlant ? 'Log' : 'Add Log / Weigh-in'}
                </button>
             </div>

             <div className="h-64 w-full mb-6">
                {showGraph ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} unit={isPlant ? "cm" : "kg"} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981', r: 4 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-400 text-sm italic">
                     {isPlant 
                        ? (chartData.length === 0 ? 'No growth history recorded.' : 'Need at least 2 logs to visualize growth.') 
                        : (chartData.length === 0 ? 'No history yet' : 'Need at least 2 logs to visualize weight trend.')}
                  </div>
                )}
             </div>

             <div className="max-h-64 overflow-y-auto border-t border-slate-100 pt-4">
                {isPlant ? (
                  // Plant Growth List
                  <div className="space-y-3">
                    {[...(individual.growthHistory || [])].reverse().map(rec => (
                      <div key={rec.id} className="flex gap-4 items-start p-3 hover:bg-slate-50 rounded-lg border border-transparent hover:border-slate-100 transition-all">
                         <div className="relative group">
                           {rec.imageUrl ? (
                             <img 
                               src={rec.imageUrl} 
                               className="w-16 h-16 rounded-lg object-cover bg-slate-200 cursor-pointer shadow-sm group-hover:shadow-md transition-all group-hover:scale-105" 
                               alt="Growth Log" 
                               onClick={() => openGallery(rec.id)}
                             />
                           ) : (
                             <div className="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center text-slate-300">
                               <Camera size={20} />
                             </div>
                           )}
                           {rec.imageUrl && <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 rounded-lg text-white"><Maximize2 size={16}/></div>}
                         </div>
                         <div>
                            <div className="flex items-center gap-2">
                               <span className="font-bold text-slate-900">{rec.heightCm} cm</span>
                               <span className="text-xs text-slate-500">• {rec.date}</span>
                            </div>
                            <p className="text-sm text-slate-600 mt-1">{rec.note}</p>
                         </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  // Animal Weight List
                  <div className="space-y-3">
                    {[...(individual.weightHistory || [])].reverse().map(rec => (
                      <div key={rec.id} className="flex gap-4 items-start p-3 hover:bg-slate-50 rounded-lg border border-transparent hover:border-slate-100 transition-all">
                         <div className="relative group">
                           {rec.imageUrl ? (
                             <img 
                               src={rec.imageUrl} 
                               className="w-16 h-16 rounded-lg object-cover bg-slate-200 cursor-pointer shadow-sm group-hover:shadow-md transition-all group-hover:scale-105" 
                               alt="Weight Log" 
                               onClick={() => openGallery(rec.id)}
                             />
                           ) : (
                             <div className="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center text-slate-300">
                               <Scale size={20} />
                             </div>
                           )}
                           {rec.imageUrl && <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 rounded-lg text-white"><Maximize2 size={16}/></div>}
                         </div>
                         <div>
                            <div className="flex items-center gap-2">
                               {rec.weightKg !== undefined && rec.weightKg !== null ? (
                                   <span className="font-bold text-slate-900">{rec.weightKg} kg</span>
                               ) : (
                                   <span className="font-bold text-slate-500 italic">Log Entry</span>
                               )}
                               <span className="text-xs text-slate-500">• {rec.date}</span>
                            </div>
                            <p className="text-sm text-slate-600 mt-1">{rec.note}</p>
                         </div>
                      </div>
                    ))}
                  </div>
                )}
             </div>
          </div>

          {/* Breeding History Card */}
          {!isPlant && (
             <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center gap-2 text-pink-600 mb-6">
                   <Heart size={20} />
                   <h3 className="font-bold text-lg">Breeding History</h3>
                </div>
                
                <div className="space-y-4">
                   {breedingHistory.length === 0 ? (
                      <p className="text-center text-slate-400 italic py-4">No breeding events recorded.</p>
                   ) : (
                      breedingHistory.map(evt => {
                         const partner = partners.find(p => p.speciesIds.includes(evt.speciesId)); // Basic inference, technically event should store loc
                         const isLoanEvent = individual.loanStatus === 'Loaned Out'; 
                         
                         return (
                            <div key={evt.id} className="flex gap-4 p-4 bg-slate-50 rounded-lg border border-slate-100">
                               <div className="mt-1 p-2 rounded-full flex-shrink-0 bg-pink-100 text-pink-600">
                                  <Baby size={16} />
                               </div>
                               <div className="flex-1">
                                  <div className="flex justify-between items-start">
                                     <h4 className="font-bold text-slate-900">
                                        {evt.successfulBirths} Offspring
                                        {isLoanEvent && <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">Off-Site</span>}
                                     </h4>
                                     <span className="text-xs text-slate-500 flex items-center"><Calendar size={12} className="mr-1"/> {evt.date}</span>
                                  </div>
                                  <p className="text-xs text-slate-500 mt-1">Role: {evt.sireId === individual.id ? 'Sire' : 'Dam'}</p>
                                  {evt.notes && <p className="text-sm text-slate-700 mt-1 italic">"{evt.notes}"</p>}
                               </div>
                            </div>
                         );
                      })
                   )}
                </div>
             </div>
          )}

          {/* Health Section - Only for Animals */}
          {!isPlant && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
               <div className="flex justify-between items-center mb-6">
                  <div className="flex items-center space-x-2 text-blue-700">
                     <Stethoscope size={20} />
                     <h3 className="font-bold text-lg">Health Records</h3>
                  </div>
                  <button 
                    onClick={() => setShowHealthModal(true)}
                    className="text-sm bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1"
                  >
                    <Plus size={16} /> Add Record
                  </button>
               </div>

               <div className="space-y-4">
                 {(individual.healthHistory || []).length === 0 ? (
                   <p className="text-center text-slate-400 italic py-4">No health records found.</p>
                 ) : (
                   (individual.healthHistory || []).map(rec => (
                     <div key={rec.id} className="flex gap-4 p-4 bg-slate-50 rounded-lg border border-slate-100">
                        <div className={`mt-1 p-2 rounded-full flex-shrink-0 ${
                          rec.type === 'Vaccination' ? 'bg-purple-100 text-purple-600' : 
                          rec.type === 'Injury' ? 'bg-red-100 text-red-600' : 
                          'bg-blue-100 text-blue-600'
                        }`}>
                          {rec.type === 'Vaccination' ? <Syringe size={16} /> : <Activity size={16} />}
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between items-start">
                            <h4 className="font-semibold text-slate-900">{rec.type}</h4>
                            <span className="text-xs text-slate-500 flex items-center"><Calendar size={12} className="mr-1"/> {rec.date}</span>
                          </div>
                          <p className="text-sm text-slate-700 mt-1">{rec.description}</p>
                          {rec.performedBy && (
                            <p className="text-xs text-slate-500 mt-2">Performed by: {rec.performedBy}</p>
                          )}
                        </div>
                     </div>
                   ))
                 )}
               </div>
            </div>
          )}

        </div>
      </div>

      {/* Gallery Modal */}
      {galleryIndex !== -1 && galleryRecords[galleryIndex] && (
        <div className="fixed inset-0 bg-black/95 z-[3000] flex flex-col justify-center items-center animate-in fade-in duration-200">
           {/* Close Button */}
           <button 
             onClick={() => setGalleryIndex(-1)}
             className="absolute top-4 right-4 text-white/70 hover:text-white bg-white/10 p-2 rounded-full backdrop-blur transition-colors z-[3010]"
           >
             <X size={24} />
           </button>

           {/* Navigation Buttons */}
           <button 
             onClick={() => navigateGallery(-1)}
             disabled={galleryIndex === 0}
             className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed bg-black/20 hover:bg-black/50 p-3 rounded-full backdrop-blur transition-all z-[3010]"
           >
             <ChevronLeft size={32} />
           </button>

           <button 
             onClick={() => navigateGallery(1)}
             disabled={galleryIndex === galleryRecords.length - 1}
             className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed bg-black/20 hover:bg-black/50 p-3 rounded-full backdrop-blur transition-all z-[3010]"
           >
             <ChevronRight size={32} />
           </button>

           {/* Main Image */}
           <div className="w-full h-full flex items-center justify-center p-4 md:p-12">
              <img 
                src={galleryRecords[galleryIndex].imageUrl} 
                alt="History Record" 
                className="max-h-full max-w-full object-contain rounded-lg shadow-2xl"
              />
           </div>

           {/* Caption / Details */}
           <div className="absolute bottom-6 bg-black/60 backdrop-blur-md text-white px-6 py-4 rounded-xl max-w-md text-center border border-white/10 z-[3010]">
              <div className="font-bold text-lg mb-1">
                 {galleryRecords[galleryIndex].date}
              </div>
              <div className="text-emerald-400 font-mono font-bold text-xl mb-1">
                 {isPlant 
                    ? `${(galleryRecords[galleryIndex] as GrowthRecord).heightCm} cm` 
                    : (
                      (galleryRecords[galleryIndex] as WeightRecord).weightKg 
                      ? `${(galleryRecords[galleryIndex] as WeightRecord).weightKg} kg`
                      : 'Log Entry'
                    )
                 }
              </div>
              {galleryRecords[galleryIndex].note && (
                <p className="text-white/80 text-sm mt-2 italic">
                  "{galleryRecords[galleryIndex].note}"
                </p>
              )}
              <div className="text-xs text-white/40 mt-3 uppercase tracking-widest">
                Image {galleryRecords.length - galleryIndex} of {galleryRecords.length}
              </div>
           </div>
        </div>
      )}

      {/* Transfer Modal */}
      {showTransferModal && (
         <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
               <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-purple-100 text-purple-600 rounded-lg"><ArrowRightLeft size={20}/></div>
                  <h3 className="text-lg font-bold text-slate-900">Transfer to Partner</h3>
               </div>
               <p className="text-sm text-slate-500 mb-6">
                  This will mark the individual as transferred to another organization. It will remain in your records for historical purposes.
               </p>
               
               <form onSubmit={handleTransfer} className="space-y-4">
                  <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1">Partner Organization</label>
                     {myActivePartners.length === 0 ? (
                        <div className="p-3 bg-amber-50 text-amber-800 rounded-lg text-sm border border-amber-200">
                           No active partnerships found. Please add a partner in the Network Map first.
                        </div>
                     ) : (
                        <select 
                           className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 bg-white text-slate-900"
                           value={transferForm.partnerId}
                           onChange={e => setTransferForm({...transferForm, partnerId: e.target.value})}
                           required
                        >
                           <option value="">Select Partner...</option>
                           {myActivePartners.map(p => (
                              <option key={p.id} value={p.id}>{p.name} ({p.location})</option>
                           ))}
                        </select>
                     )}
                  </div>
                  <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1">Date of Transfer</label>
                     <input 
                        type="date"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 bg-white text-slate-900"
                        value={transferForm.date}
                        onChange={e => setTransferForm({...transferForm, date: e.target.value})}
                        required
                     />
                  </div>
                  <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                     <textarea 
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 bg-white text-slate-900"
                        rows={3}
                        placeholder="Reason for transfer, transport details, etc."
                        value={transferForm.note}
                        onChange={e => setTransferForm({...transferForm, note: e.target.value})}
                     />
                  </div>
                  
                  <div className="flex justify-end gap-3 pt-2">
                     <button type="button" onClick={() => setShowTransferModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
                     <button 
                        type="submit" 
                        disabled={!transferForm.partnerId}
                        className="bg-purple-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50"
                     >
                        Confirm Transfer
                     </button>
                  </div>
               </form>
            </div>
         </div>
      )}

      {/* Weight Modal */}
      {showWeightModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Record History</h3>
            <form onSubmit={handleAddWeight} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                <input 
                  type="date"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                  value={weightForm.date}
                  onChange={e => setWeightForm({...weightForm, date: e.target.value})}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Weight (kg) <span className="text-slate-400 font-normal">(Optional)</span></label>
                <input 
                  type="number"
                  step="0.01"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                  value={weightForm.weightKg}
                  onChange={e => setWeightForm({...weightForm, weightKg: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Photo (Optional)</label>
                <div className="flex items-center space-x-3">
                  <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 border border-slate-300 w-full justify-center">
                      <Camera size={18} />
                      <span>Take Photo / Upload</span>
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleWeightImageUpload} />
                  </label>
                </div>
                {weightForm.imageUrl && <p className="text-xs text-emerald-600 mt-1 text-center">Image selected</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Note (Optional)</label>
                <input 
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                  value={weightForm.note}
                  onChange={e => setWeightForm({...weightForm, note: e.target.value})}
                />
              </div>
              <div className="flex justify-end space-x-3 pt-2">
                <button type="button" onClick={() => setShowWeightModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                <button type="submit" className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Growth Modal */}
      {showGrowthModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Log Plant Growth</h3>
            <form onSubmit={handleAddGrowth} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                <input 
                  type="date"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                  value={growthForm.date}
                  onChange={e => setGrowthForm({...growthForm, date: e.target.value})}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Height (cm)</label>
                <input 
                  type="number"
                  step="0.1"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                  value={growthForm.heightCm}
                  onChange={e => setGrowthForm({...growthForm, heightCm: e.target.value})}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Photo (Optional)</label>
                <div className="flex items-center space-x-3">
                  <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 border border-slate-300 w-full justify-center">
                      <Camera size={18} />
                      <span>Take Photo / Upload</span>
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleGrowthImageUpload} />
                  </label>
                </div>
                {growthForm.imageUrl && <p className="text-xs text-emerald-600 mt-1 text-center">Image selected</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Note (Optional)</label>
                <input 
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                  value={growthForm.note}
                  onChange={e => setGrowthForm({...growthForm, note: e.target.value})}
                />
              </div>
              <div className="flex justify-end space-x-3 pt-2">
                <button type="button" onClick={() => setShowGrowthModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                <button type="submit" className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700">Save Log</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Health Modal */}
      {showHealthModal && !isPlant && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Add Health Record</h3>
            <form onSubmit={handleAddHealth} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                <input 
                  type="date"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                  value={healthForm.date}
                  onChange={e => setHealthForm({...healthForm, date: e.target.value})}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                <select 
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                  value={healthForm.type}
                  onChange={e => setHealthForm({...healthForm, type: e.target.value})}
                >
                  <option value="Checkup">General Checkup</option>
                  <option value="Vaccination">Vaccination</option>
                  <option value="Injury">Injury</option>
                  <option value="Treatment">Treatment</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea 
                  rows={3}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                  value={healthForm.description}
                  onChange={e => setHealthForm({...healthForm, description: e.target.value})}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Performed By</label>
                <input 
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                  value={healthForm.performedBy}
                  onChange={e => setHealthForm({...healthForm, performedBy: e.target.value})}
                  placeholder="e.g. Dr. Smith"
                />
              </div>
              <div className="flex justify-end space-x-3 pt-2">
                <button type="button" onClick={() => setShowHealthModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                <button type="submit" className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700">Save Record</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default IndividualDetail;
