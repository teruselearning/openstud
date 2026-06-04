import React, { useState, useEffect, useRef, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getIndividuals, saveIndividuals, getSpecies, saveSpecies, generatePattern, getBreedingLoans, sendMockNotification, getBreedingEvents, getNetworkPartners, getPartnerships, getOrg, getEnclosures, getSession } from '../services/storage';
import { fetchIndividualImage, fetchSpeciesImage } from '../services/syncService';
import { compressImageFileDual, compressImageFile } from '../services/imageUtils';
import { Individual, Species, WeightRecord, HealthRecord, GrowthRecord, BreedingEvent, ExternalPartner, Partnership, Enclosure, Sex } from '../types';
import { ArrowLeft, Scale, Activity, Syringe, Calendar, Plus, Stethoscope, Sprout, Camera, MapPin, Navigation, X, ChevronLeft, ChevronRight, Maximize2, Briefcase, Archive, Edit, Baby, Heart, ArrowRightLeft, ExternalLink, Fingerprint, Download, FileCode, Box, Trash2, Loader2, Upload, ImageIcon, Info } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { LanguageContext } from '../App';
import ConfirmModal from '../components/ConfirmModal';

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
  const locationMarkerRef = useRef<any>(null);
  const userDotRef = useRef<any>(null);
  const locWatchRef = useRef<number | null>(null);

  // Location state
  const [isSettingLocation, setIsSettingLocation] = useState(false);
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);
  const [pendingLatLng, setPendingLatLng] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Modals
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [showHealthModal, setShowHealthModal] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState<number>(-1);
  const [showDnaDeleteConfirm, setShowDnaDeleteConfirm] = useState(false);

  // Form Media State
  const [pendingLogImage, setPendingLogImage] = useState<string>('');
  const [useAsCardImage, setUseAsCardImage] = useState(true);

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

  // Lazy-load full images (not included in sync payload)
  useEffect(() => {
    if (!individual || !id) return;
    // Individual image
    if (!individual.imageUrl) {
      fetchIndividualImage(id).then(imageUrl => {
        if (imageUrl) {
          const updated = { ...individual, imageUrl };
          setIndividual(updated);
          // Cache back to localStorage so subsequent visits are instant
          const all = getIndividuals().map(i => i.id === id ? { ...i, imageUrl } : i);
          saveIndividuals(all);
        }
      });
    }
    // Species image
    if (species && !species.imageUrl) {
      fetchSpeciesImage(species.id).then(imageUrl => {
        if (imageUrl) {
          setSpecies(prev => prev ? { ...prev, imageUrl } : prev);
          // Cache back to localStorage
          const all = getSpecies().map(s => s.id === species.id ? { ...s, imageUrl } : s);
          saveSpecies(all);
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, individual?.id, species?.id]);

  // Map Initialization
  useEffect(() => {
    if (activeTab === 'overview' && individual?.latitude && mapRef.current && !leafletMap.current) {
      const map = L.map(mapRef.current, { zoomControl: false, maxZoom: 22 }).setView([individual.latitude, individual.longitude], 16);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, maxNativeZoom: 19 }).addTo(map);
      locationMarkerRef.current = L.marker([individual.latitude, individual.longitude]).addTo(map);
      leafletMap.current = map;
      setTimeout(() => map.invalidateSize(), 200);
    }
  }, [activeTab, individual?.latitude]);

  // Live "you are here" dot + map click to place pin while update mode is active
  useEffect(() => {
    if (!isUpdatingLocation || !leafletMap.current) return;
    const map = leafletMap.current;
    const userIcon = L.divIcon({
      className: '',
      iconSize: [20, 20], iconAnchor: [10, 10],
      html: `<div style="width:14px;height:14px;border-radius:50%;background:#3b82f6;border:2.5px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4);margin:3px;"></div>`,
    });
    const ACCURACY_TARGET = 20;
    let settled = false;

    const handleMapClick = (e: any) => {
      const { lat, lng } = e.latlng;
      setPendingLatLng({ lat, lng });
      locationMarkerRef.current?.setLatLng([lat, lng]);
    };
    map.on('click', handleMapClick);

    locWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        // Always show where the user is
        if (userDotRef.current) userDotRef.current.setLatLng([lat, lng]);
        else { userDotRef.current = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 500 }).addTo(map); }
        // Once accurate enough, move the pending pin and store for save
        if (accuracy <= ACCURACY_TARGET && !settled) {
          settled = true;
          setPendingLatLng({ lat, lng });
          locationMarkerRef.current?.setLatLng([lat, lng]);
          map.panTo([lat, lng]);
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 0 }
    );
    return () => {
      map.off('click', handleMapClick);
      if (locWatchRef.current !== null) { navigator.geolocation.clearWatch(locWatchRef.current); locWatchRef.current = null; }
      if (userDotRef.current) { userDotRef.current.remove(); userDotRef.current = null; }
      setPendingLatLng(null);
    };
  }, [isUpdatingLocation]);

  const handleSetLocation = () => {
    if (!individual) return;
    setLocationError(null);
    setIsSettingLocation(true);

    const ACCURACY_TARGET = 20; // metres — same quality threshold as the map tracker
    const TIMEOUT_MS = 15000;
    let watchId: number | null = null;
    let settled = false;

    const accept = async (pos: GeolocationPosition) => {
      if (settled) return;
      settled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      const { latitude, longitude } = pos.coords;
      const updated = { ...individual, latitude, longitude };
      setIndividual(updated);
      const all = getIndividuals().map(i => i.id === individual.id ? updated : i);
      await saveIndividuals(all);
      setIsSettingLocation(false);
    };

    // Safety fallback — accept whatever we have after TIMEOUT_MS
    const fallback = setTimeout(() => {
      if (!settled) {
        navigator.geolocation.getCurrentPosition(accept, (err) => {
          if (!settled) {
            settled = true;
            if (watchId !== null) navigator.geolocation.clearWatch(watchId);
            setLocationError('Could not get location: ' + err.message);
            setIsSettingLocation(false);
          }
        }, { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 });
      }
    }, TIMEOUT_MS);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (pos.coords.accuracy <= ACCURACY_TARGET) {
          clearTimeout(fallback);
          accept(pos);
        }
        // else keep watching — accuracy still improving
      },
      (err) => {
        clearTimeout(fallback);
        if (!settled) {
          settled = true;
          setLocationError('Could not get location: ' + err.message);
          setIsSettingLocation(false);
        }
      },
      { enableHighAccuracy: true, maximumAge: 0 }
    );
  };

  const handleSaveLocation = async () => {
    if (!individual || !pendingLatLng) return;
    const { lat: latitude, lng: longitude } = pendingLatLng;
    const updated = { ...individual, latitude, longitude };
    setIndividual(updated);
    const all = getIndividuals().map(i => i.id === individual.id ? updated : i);
    await saveIndividuals(all);
    setIsUpdatingLocation(false);
  };

  const handleCancelUpdate = () => {
    // Restore marker to original position
    if (individual?.latitude && locationMarkerRef.current) {
      locationMarkerRef.current.setLatLng([individual.latitude, individual.longitude]);
      leafletMap.current?.panTo([individual.latitude, individual.longitude]);
    }
    setIsUpdatingLocation(false);
  };

  const handleLogPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const compressed = await compressImageFile(file, 1200, 0.8);
      setPendingLogImage(compressed);
    }
  };

  const handleAddWeight = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!individual) return;
    const formData = new FormData(e.currentTarget);
    const date = formData.get('date') as string;
    const value = Number(formData.get('weight'));
    const note = formData.get('note') as string;

    const newRecord: WeightRecord = {
      id: `w-${Date.now()}`,
      date,
      weightKg: value,
      note,
      imageUrl: pendingLogImage || undefined
    };

    // For plants: also create a health history entry so it appears on the History tab
    const newHealthEntry: HealthRecord | null = isPlant ? {
      id: `h-${Date.now()}`,
      date,
      type: 'Growth Measurement' as any,
      description: `Height recorded: ${value} cm${note ? ` — ${note}` : ''}`,
      performedBy: '',
      imageUrl: pendingLogImage || undefined
    } : null;

    const updatedInd = {
      ...individual,
      weightHistory: [newRecord, ...(individual.weightHistory || [])],
      ...(newHealthEntry ? { healthHistory: [newHealthEntry, ...(individual.healthHistory || [])] } : {})
    };

    const allInds = getIndividuals().map(i => i.id === individual.id ? updatedInd : i);
    saveIndividuals(allInds);
    setIndividual(updatedInd);
    setShowWeightModal(false);
    setPendingLogImage('');
  };

  const getDisplayImage = () => {
    const latestObs = individual?.healthHistory?.find(h => h.imageUrl)?.imageUrl
      || individual?.weightHistory?.find(w => w.imageUrl)?.imageUrl;
    if (latestObs) return latestObs;
    if (individual?.imageUrl && !individual.imageUrl.startsWith('data:image/svg+xml')) return individual.imageUrl;
    if (species?.imageUrl && !species.imageUrl.startsWith('data:image/svg+xml')) return species.imageUrl;
    return generatePattern(individual?.name || 'Individual');
  };

  if (!individual) return <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-emerald-600" /></div>;

  const isPlant = species?.type === 'Plant';
  const weightData = (individual.weightHistory || []).map(w => ({ date: w.date, value: w.weightKg })).reverse();

  const allObsImages = [
    ...(individual.healthHistory || []).filter(h => h.imageUrl).map(h => h.imageUrl!),
    ...(individual.weightHistory || []).filter(w => w.imageUrl).map(w => w.imageUrl!),
  ];
  const originalProfileImg = (individual.imageUrl && !individual.imageUrl.startsWith('data:image/svg+xml'))
    ? individual.imageUrl
    : (species?.imageUrl && !species.imageUrl.startsWith('data:image/svg+xml'))
      ? species.imageUrl
      : null;
  const galleryImages = [...allObsImages, ...(originalProfileImg ? [originalProfileImg] : [])];

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
        <button onClick={() => setActiveTab('history')} className={`py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'history' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{isPlant ? 'History' : 'Health & History'}</button>
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
                  {(!(isPlant && individual.sex === Sex.UNKNOWN)) && (
                    <div className="flex items-center justify-between py-2 border-b border-slate-50">
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Sex</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${individual.sex === Sex.MALE ? 'bg-blue-100 text-blue-700' : individual.sex === Sex.FEMALE ? 'bg-pink-100 text-pink-700' : 'bg-slate-100 text-slate-700'}`}>{individual.sex}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between py-2 border-b border-slate-50">
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">{isPlant ? 'Planted' : 'Birth Date'}</span>
                    <span className="text-sm font-bold text-slate-700">{individual.birthDate || 'Unknown'}</span>
                  </div>
                  {individual.isDeceased && individual.deathDate && (
                    <div className="flex items-center justify-between py-2 border-b border-slate-50">
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">{isPlant ? 'Removed' : 'Death Date'}</span>
                      <span className="text-sm font-bold text-red-600">{individual.deathDate}</span>
                    </div>
                  )}
                  {individual.source && (
                    <div className="flex items-center justify-between py-2 border-b border-slate-50">
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Source</span>
                      <span className="text-sm font-bold text-slate-700">{individual.source}</span>
                    </div>
                  )}
                  {individual.sourceDetails && (
                    <div className="py-2 border-b border-slate-50">
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest block mb-1">Source Details</span>
                      <p className="text-sm text-slate-700 leading-relaxed">{individual.sourceDetails}</p>
                    </div>
                  )}
                  {individual.loanStatus && individual.loanStatus !== 'None' && (
                    <div className="flex items-center justify-between py-2 border-b border-slate-50">
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Loan Status</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${individual.loanStatus === 'Loaned Out' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{individual.loanStatus}</span>
                    </div>
                  )}
                  {individual.transferDate && (
                    <div className="flex items-center justify-between py-2 border-b border-slate-50">
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Transferred</span>
                      <span className="text-sm font-bold text-slate-700">{individual.transferDate}</span>
                    </div>
                  )}
                  {individual.transferNote && (
                    <div className="py-2 border-b border-slate-50">
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest block mb-1">Transfer Note</span>
                      <p className="text-sm text-slate-700 leading-relaxed">{individual.transferNote}</p>
                    </div>
                  )}
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

            {/* Notes card */}
            {individual.notes && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center gap-2">
                  <Archive size={15} className="text-slate-400" />
                  <h3 className="font-bold text-slate-800 text-sm">Notes</h3>
                </div>
                <div className="p-4">
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{individual.notes}</p>
                </div>
              </div>
            )}

          </div>

          {/* Center Column: Charts & Maps */}
          <div className="lg:col-span-2 space-y-6">
             {/* Species card appears here when no growth data */}
             {species && weightData.length <= 1 && (
               <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                 <div className="p-4 border-b border-slate-100 flex items-center gap-2">
                   <Info size={16} className="text-emerald-600" />
                   <h3 className="font-bold text-slate-800 text-sm">Species: {species.commonName}</h3>
                   <span className="italic text-slate-400 text-xs ml-1">{species.scientificName}</span>
                   {species.conservationStatus && species.conservationStatus !== 'Unknown' && (
                     <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 uppercase tracking-wide">{species.conservationStatus}</span>
                   )}
                 </div>
                 <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                   {species.lifeExpectancyYears > 0 && (
                     <div className="bg-slate-50 rounded-lg p-3">
                       <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Life Expectancy</p>
                       <p className="font-bold text-slate-800 text-sm">{species.lifeExpectancyYears} yrs</p>
                     </div>
                   )}
                   {species.sexualMaturityAgeYears > 0 && (
                     <div className="bg-slate-50 rounded-lg p-3">
                       <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Sexual Maturity</p>
                       <p className="font-bold text-slate-800 text-sm">{species.sexualMaturityAgeYears} yrs</p>
                     </div>
                   )}
                   {species.averageAdultWeightKg > 0 && (
                     <div className="bg-slate-50 rounded-lg p-3">
                       <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Avg Adult {isPlant ? 'Height' : 'Weight'}</p>
                       <p className="font-bold text-slate-800 text-sm">{species.averageAdultWeightKg} {isPlant ? 'cm' : 'kg'}</p>
                     </div>
                   )}
                   {species.breedingSeasonStart && species.breedingSeasonEnd && (
                     <div className="bg-slate-50 rounded-lg p-3">
                       <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Breeding Season</p>
                       <p className="font-bold text-slate-800 text-sm">
                         {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][species.breedingSeasonStart - 1]} – {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][species.breedingSeasonEnd - 1]}
                       </p>
                     </div>
                   )}
                   {species.nativeStatusCountry && species.nativeStatusCountry !== 'Unknown' && (
                     <div className="bg-slate-50 rounded-lg p-3">
                       <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Native Status</p>
                       <p className="font-bold text-slate-800 text-sm">{species.nativeStatusCountry}</p>
                     </div>
                   )}
                 </div>
                 <div className="px-4 pb-4 flex gap-2 flex-wrap">
                   <a href={`https://en.wikipedia.org/wiki/${encodeURIComponent(species.scientificName)}`} target="_blank" rel="noopener noreferrer"
                     className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors">
                     <ExternalLink size={12}/> Wikipedia
                   </a>
                   <a href={`https://www.iucnredlist.org/search?query=${encodeURIComponent(species.scientificName)}`} target="_blank" rel="noopener noreferrer"
                     className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors">
                     <ExternalLink size={12}/> IUCN Red List
                   </a>
                 </div>
               </div>
             )}

             {/* Growth trend — always shown when data exists, or if no species card */}
             {(weightData.length > 1 || (!species || weightData.length > 1)) && (
             <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                   <h3 className="font-bold text-slate-800 flex items-center gap-2"><Activity size={20} className="text-emerald-500" />{isPlant ? 'Growth Trend' : 'Weight Trend'}</h3>
                   <div className="flex items-center gap-2">
                     {isPlant && weightData.length > 0 && (
                       <button onClick={() => { setShowWeightModal(true); setPendingLogImage(''); }} className="text-xs text-slate-500 px-2 py-1 rounded-lg hover:bg-slate-100 flex items-center gap-1"><Plus size={12}/> Log height</button>
                     )}
                     <button onClick={() => { isPlant ? (setShowHealthModal(true), setPendingLogImage('')) : (setShowWeightModal(true), setPendingLogImage('')); }} className="text-xs bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 hover:bg-emerald-100"><Plus size={14}/> {isPlant ? 'Add Observation' : 'Log Weight'}</button>
                   </div>
                </div>
                {isPlant && weightData.length === 0 ? (
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Species Info</p>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="bg-slate-50 rounded-lg p-3">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Scientific Name</p>
                        <p className="font-medium text-slate-700 italic">{species?.scientificName || '—'}</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-3">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Classification</p>
                        <p className="font-medium text-slate-700">{species?.plantClassification || '—'}</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-3">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Conservation Status</p>
                        <p className="font-medium text-slate-700">{species?.conservationStatus || '—'}</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-3">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Native Status</p>
                        <p className="font-medium text-slate-700">{species?.nativeStatusLocal || species?.nativeStatusCountry || '—'}</p>
                      </div>
                    </div>
                  </div>
                ) : (
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
                )}
             </div>
             )}

             {/* Species card shown here when growth data exists */}
             {species && weightData.length > 1 && (
               <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                 <div className="p-4 border-b border-slate-100 flex items-center gap-2">
                   <Info size={16} className="text-emerald-600" />
                   <h3 className="font-bold text-slate-800 text-sm">Species: {species.commonName}</h3>
                   <span className="italic text-slate-400 text-xs ml-1">{species.scientificName}</span>
                   {species.conservationStatus && species.conservationStatus !== 'Unknown' && (
                     <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 uppercase tracking-wide">{species.conservationStatus}</span>
                   )}
                 </div>
                 <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                   {species.lifeExpectancyYears > 0 && (
                     <div className="bg-slate-50 rounded-lg p-3">
                       <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Life Expectancy</p>
                       <p className="font-bold text-slate-800 text-sm">{species.lifeExpectancyYears} yrs</p>
                     </div>
                   )}
                   {species.sexualMaturityAgeYears > 0 && (
                     <div className="bg-slate-50 rounded-lg p-3">
                       <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Sexual Maturity</p>
                       <p className="font-bold text-slate-800 text-sm">{species.sexualMaturityAgeYears} yrs</p>
                     </div>
                   )}
                   {species.averageAdultWeightKg > 0 && (
                     <div className="bg-slate-50 rounded-lg p-3">
                       <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Avg Adult {isPlant ? 'Height' : 'Weight'}</p>
                       <p className="font-bold text-slate-800 text-sm">{species.averageAdultWeightKg} {isPlant ? 'cm' : 'kg'}</p>
                     </div>
                   )}
                   {species.breedingSeasonStart && species.breedingSeasonEnd && (
                     <div className="bg-slate-50 rounded-lg p-3">
                       <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Breeding Season</p>
                       <p className="font-bold text-slate-800 text-sm">
                         {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][species.breedingSeasonStart - 1]} – {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][species.breedingSeasonEnd - 1]}
                       </p>
                     </div>
                   )}
                   {species.nativeStatusCountry && species.nativeStatusCountry !== 'Unknown' && (
                     <div className="bg-slate-50 rounded-lg p-3">
                       <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Native Status</p>
                       <p className="font-bold text-slate-800 text-sm">{species.nativeStatusCountry}</p>
                     </div>
                   )}
                 </div>
                 <div className="px-4 pb-4 flex gap-2 flex-wrap">
                   <a href={`https://en.wikipedia.org/wiki/${encodeURIComponent(species.scientificName)}`} target="_blank" rel="noopener noreferrer"
                     className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors">
                     <ExternalLink size={12}/> Wikipedia
                   </a>
                   <a href={`https://www.iucnredlist.org/search?query=${encodeURIComponent(species.scientificName)}`} target="_blank" rel="noopener noreferrer"
                     className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors">
                     <ExternalLink size={12}/> IUCN Red List
                   </a>
                 </div>
               </div>
             )}

             {(species?.type === 'Animal' || individual.sireId || individual.damId) && (
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
             )}

             {/* Location — full width */}
             <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4"><MapPin size={20} className="text-red-500" /> Location</h3>
                <div className="h-64 w-full rounded-lg bg-slate-100 overflow-hidden relative border border-slate-200">
                   {individual.latitude
                     ? (
                       <>
                         <div ref={mapRef} className="h-full w-full" />
                         {/* Controls overlaid on map */}
                         {!isUpdatingLocation ? (
                           <button
                             onClick={() => setIsUpdatingLocation(true)}
                             className="absolute bottom-3 right-3 z-[1000] flex items-center gap-1.5 bg-white/90 hover:bg-white shadow-md text-slate-700 hover:text-emerald-700 text-xs font-bold px-3 py-2 rounded-lg transition-all"
                           >
                             <Navigation size={13}/> Update Location
                           </button>
                         ) : (
                           <div className="absolute bottom-3 left-3 right-3 z-[1000] flex items-center gap-2">
                             <div className="flex-1 bg-white/95 rounded-lg shadow-md px-3 py-2 text-xs font-medium text-slate-600 flex items-center gap-2">
                               {pendingLatLng
                                 ? <><MapPin size={12} className="text-emerald-600"/>{pendingLatLng.lat.toFixed(5)}, {pendingLatLng.lng.toFixed(5)}</>
                                 : <><Loader2 size={12} className="animate-spin text-blue-500"/> Acquiring GPS fix… or tap map to place pin</>
                               }
                             </div>
                             <button onClick={handleCancelUpdate} className="bg-white/95 hover:bg-white shadow-md text-slate-600 text-xs font-bold px-3 py-2 rounded-lg transition-all">Cancel</button>
                             <button onClick={handleSaveLocation} disabled={!pendingLatLng} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-bold px-3 py-2 rounded-lg shadow-md transition-all">Save</button>
                           </div>
                         )}
                       </>
                     )
                     : (
                       <div className="h-full flex flex-col items-center justify-center gap-3">
                         <p className="text-slate-400 italic text-xs">No coordinates assigned</p>
                         <button
                           onClick={handleSetLocation}
                           disabled={isSettingLocation}
                           className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors shadow-sm"
                         >
                           {isSettingLocation
                             ? <><Loader2 size={13} className="animate-spin"/> Detecting…</>
                             : <><Navigation size={13}/> Set Location</>
                           }
                         </button>
                         {locationError && <p className="text-[10px] text-red-500 text-center px-2">{locationError}</p>}
                       </div>
                     )
                   }
                </div>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-6 animate-in fade-in duration-300">
           <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                 <h3 className="font-bold text-slate-800">{isPlant ? 'Observations & History' : 'Medical & Health Logs'}</h3>
                 <button onClick={() => { setShowHealthModal(true); setPendingLogImage(''); }} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm">+ {isPlant ? 'Add Observation' : 'New Log'}</button>
              </div>
              <div className="divide-y divide-slate-100">
                 {(individual.healthHistory || []).length > 0 ? (
                    individual.healthHistory?.map(log => (
                       <div key={log.id} className="p-6 hover:bg-slate-50 transition-colors flex gap-6">
                          <div className={`p-2 rounded-lg h-fit flex-shrink-0 ${log.type === 'Growth Measurement' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                            {log.type === 'Growth Measurement' ? <Activity size={20}/> : <Stethoscope size={20}/>}
                          </div>
                          <div className="flex-1 min-w-0">
                             <div className="flex justify-between items-start mb-1">
                                <h4 className="font-bold text-slate-900">{log.type}</h4>
                                <span className="text-xs font-bold text-slate-400">{log.date}</span>
                             </div>
                             <p className="text-sm text-slate-600 leading-relaxed mb-3">{log.description}</p>
                             {log.performedBy && <p className="text-[10px] text-slate-400 font-bold uppercase mb-3">Performed by: {log.performedBy}</p>}
                             
                             {log.imageUrl && (
                               <div className="w-32 h-32 rounded-lg overflow-hidden border border-slate-200 cursor-pointer hover:opacity-90 transition-opacity" onClick={() => {
                                 const imgs = (individual.healthHistory || []).filter(h => h.imageUrl);
                                 setGalleryIndex(imgs.findIndex(h => h.id === log.id));
                               }}>
                                  <img src={log.imageUrl} className="w-full h-full object-cover" />
                               </div>
                             )}
                          </div>
                       </div>
                    ))
                 ) : (
                    <div className="p-12 text-center text-slate-400 opacity-50 flex flex-col items-center">
                       <Archive size={48} strokeWidth={1} className="mb-2" />
                       <p>{isPlant ? 'No observations recorded yet.' : 'No health records found.'}</p>
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
                         <button onClick={() => setShowDnaDeleteConfirm(true)} className="text-slate-400 hover:text-red-400 transition-colors"><Trash2 size={16}/></button>
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
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
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
                    <input type="number" step="0.01" name="weight" className="w-full mt-1 px-4 py-2 border border-slate-300 rounded-lg outline-none" autoFocus />
                 </div>
                 <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">Note</label>
                    <input type="text" name="note" className="w-full mt-1 px-4 py-2 border border-slate-300 rounded-lg outline-none" placeholder="e.g. Regular checkup" />
                 </div>
                 
                 <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Attach Observation Photo</label>
                    <div className="flex items-center gap-3">
                       <label className="flex-1 flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer transition-all">
                          {pendingLogImage ? (
                             <img src={pendingLogImage} className="h-16 w-16 object-cover rounded shadow-sm" />
                          ) : (
                             <>
                                <Camera size={24} className="text-slate-300 mb-1" />
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Click to Upload</span>
                             </>
                          )}
                          <input type="file" accept="image/*" className="hidden" onChange={handleLogPhotoUpload} />
                       </label>
                       {pendingLogImage && (
                          <button type="button" onClick={() => setPendingLogImage('')} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={18}/></button>
                       )}
                    </div>
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
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
           <div className="bg-white rounded-xl shadow-xl w-full max-md overflow-hidden animate-in zoom-in duration-200">
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                 <h3 className="font-bold">{isPlant ? 'New Observation' : 'New Medical Record'}</h3>
                 <button onClick={() => { setShowHealthModal(false); setPendingLogImage(''); setUseAsCardImage(true); }} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
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
                    performedBy: fd.get('who') as string,
                    imageUrl: pendingLogImage || undefined
                 };

                 const updated = {
                    ...individual,
                    ...(pendingLogImage && useAsCardImage ? { imageUrl: pendingLogImage } : {}),
                    healthHistory: [log, ...(individual.healthHistory || [])]
                 };

                 const all = getIndividuals().map(i => i.id === individual.id ? updated : i);
                 saveIndividuals(all);
                 setIndividual(updated);
                 setShowHealthModal(false);
                 setPendingLogImage('');
                 setUseAsCardImage(true);
              }} className="p-6 space-y-4">
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                       <label className="text-[10px] font-bold text-slate-400 uppercase">Date</label>
                       <input type="date" name="date" className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" defaultValue={new Date().toISOString().split('T')[0]} required />
                    </div>
                    <div>
                       <label className="text-[10px] font-bold text-slate-400 uppercase">Type</label>
                       <select name="type" className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white" required>
                          {isPlant ? <>
                            <option value="Observation">Observation</option>
                            <option value="Flowering">Flowering</option>
                            <option value="Fruiting">Fruiting</option>
                            <option value="Pruning">Pruning</option>
                            <option value="Pest/Disease">Pest / Disease</option>
                            <option value="Fertilising">Fertilising</option>
                            <option value="Watering">Watering</option>
                            <option value="Repotting">Repotting</option>
                            <option value="Dormancy">Dormancy</option>
                            <option value="Other">Other</option>
                          </> : <>
                            <option value="Checkup">Checkup</option>
                            <option value="Vaccination">Vaccination</option>
                            <option value="Treatment">Treatment</option>
                            <option value="Injury">Injury</option>
                            <option value="Other">Other</option>
                          </>}
                       </select>
                    </div>
                 </div>
                 <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">{isPlant ? 'Recorded By' : 'Performed By'}</label>
                    <input type="text" name="who" className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder={isPlant ? 'Your name' : 'Veterinarian Name'} defaultValue={getSession()?.name || ''} />
                 </div>
                 <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Description</label>
                    <textarea name="desc" className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" rows={4} placeholder="Detailed notes..." />
                 </div>
                 
                 <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">{isPlant ? 'Attach Photo' : 'Attach Medical Photo'}</label>
                    <div className="flex items-center gap-3">
                       <label className="flex-1 flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer transition-all">
                          {pendingLogImage ? (
                             <img src={pendingLogImage} className="h-20 w-20 object-cover rounded shadow-sm" />
                          ) : (
                             <>
                                <ImageIcon size={24} className="text-slate-300 mb-1" />
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Capture Observation</span>
                             </>
                          )}
                          <input type="file" accept="image/*" className="hidden" onChange={handleLogPhotoUpload} />
                       </label>
                       {pendingLogImage && (
                          <button type="button" onClick={() => { setPendingLogImage(''); setUseAsCardImage(true); }} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={18}/></button>
                       )}
                    </div>
                    {pendingLogImage && (
                       <label className="flex items-center gap-2.5 cursor-pointer mt-1 select-none">
                          <input
                             type="checkbox"
                             checked={useAsCardImage}
                             onChange={e => setUseAsCardImage(e.target.checked)}
                             className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="text-sm text-slate-600">Use this image on this individual's card</span>
                       </label>
                    )}
                 </div>

                 <div className="pt-4 flex gap-2">
                    <button type="button" onClick={() => { setShowHealthModal(false); setPendingLogImage(''); setUseAsCardImage(true); }} className="flex-1 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-bold">Cancel</button>
                    <button type="submit" className="flex-1 py-2 bg-emerald-600 text-white rounded-lg font-bold shadow-md hover:bg-emerald-700">Save Record</button>
                 </div>
              </form>
           </div>
        </div>
      )}
      {/* Image Gallery Lightbox */}
      {galleryIndex >= 0 && (() => {
        const galleryImages = (individual.healthHistory || [])
          .filter(h => h.imageUrl)
          .map(h => ({ url: h.imageUrl!, label: h.type, date: h.date }));
        if (galleryImages.length === 0) return null;
        const current = galleryImages[galleryIndex] || galleryImages[0];
        return (
          <div className="fixed inset-0 z-[99999] bg-black/95 flex flex-col items-center justify-center" onClick={() => setGalleryIndex(-1)}>
            {/* Close */}
            <button className="absolute top-4 right-4 text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors z-10" onClick={() => setGalleryIndex(-1)}>
              <X size={28} />
            </button>
            {/* Counter */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/50 text-sm font-bold tracking-widest">
              {galleryIndex + 1} / {galleryImages.length}
            </div>
            {/* Prev */}
            {galleryIndex > 0 && (
              <button className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-3 rounded-full hover:bg-white/10 transition-colors z-10"
                onClick={e => { e.stopPropagation(); setGalleryIndex(i => i - 1); }}>
                <ChevronLeft size={36} />
              </button>
            )}
            {/* Next */}
            {galleryIndex < galleryImages.length - 1 && (
              <button className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-3 rounded-full hover:bg-white/10 transition-colors z-10"
                onClick={e => { e.stopPropagation(); setGalleryIndex(i => i + 1); }}>
                <ChevronRight size={36} />
              </button>
            )}
            {/* Image */}
            <img
              src={current.url}
              className="max-h-[80vh] max-w-[90vw] object-contain rounded-xl shadow-2xl"
              onClick={e => e.stopPropagation()}
            />
            {/* Caption */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center">
              <p className="text-white font-bold text-sm">{current.label}</p>
              <p className="text-white/50 text-xs mt-0.5">{current.date}</p>
            </div>
          </div>
        );
      })()}

      <ConfirmModal
        isOpen={showDnaDeleteConfirm}
        title="Remove DNA Data"
        message="Permanently remove the stored DNA sequence for this individual? This cannot be undone."
        confirmLabel="Remove"
        onConfirm={() => {
          if (individual) setIndividual({ ...individual, dnaSequence: undefined });
          setShowDnaDeleteConfirm(false);
        }}
        onCancel={() => setShowDnaDeleteConfirm(false)}
      />
    </div>
  );
};

export default IndividualDetail;