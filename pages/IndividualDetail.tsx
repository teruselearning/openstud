import React, { useState, useEffect, useRef, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getIndividuals, saveIndividuals, getSpecies, saveSpecies, generatePattern, getBreedingLoans, sendMockNotification, getBreedingEvents, getNetworkPartners, getPartnerships, getOrg, getEnclosures, getSession } from '../services/storage';
import { fetchIndividualImage, fetchSpeciesImage } from '../services/syncService';
import { compressImageFileDual, compressImageFile, compressDataUrl } from '../services/imageUtils';
import { Individual, Species, WeightRecord, HealthRecord, GrowthRecord, BreedingEvent, ExternalPartner, Partnership, Enclosure, Sex } from '../types';
import { ArrowLeft, Scale, Activity, Syringe, Calendar, Plus, Stethoscope, Sprout, Camera, MapPin, Navigation, X, ChevronLeft, ChevronRight, Maximize2, Briefcase, Archive, Edit, Baby, Heart, ArrowRightLeft, ExternalLink, Fingerprint, Download, FileCode, Box, Trash2, Loader2, Upload, ImageIcon, Info, Pencil } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { LanguageContext } from '../App';
import ConfirmModal from '../components/ConfirmModal';
import SpeciesModal from '../components/SpeciesModal';

declare const L: any;

const nativeStatusStyle = (status: string) => {
  switch (status) {
    case 'Native':     return 'bg-green-100 text-green-700';
    case 'Non-Native':
    case 'Introduced': return 'bg-amber-100 text-amber-700';
    case 'Invasive':   return 'bg-red-100 text-red-600';
    case 'Endemic':    return 'bg-blue-100 text-blue-700';
    default:           return 'bg-slate-100 text-slate-400';
  }
};
const nativeStatusLabel = (status: string) =>
  status === 'Introduced' ? 'Non-Native' : status;

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
  const [editingHealthId, setEditingHealthId] = useState<string | null>(null);
  const [editingWeightId, setEditingWeightId] = useState<string | null>(null);
  const [deleteRecordTarget, setDeleteRecordTarget] = useState<{ id: string; type: 'health' | 'weight' } | null>(null);
  const [galleryIndex, setGalleryIndex] = useState<number>(-1);
  const [showDnaDeleteConfirm, setShowDnaDeleteConfirm] = useState(false);
  const [showSpeciesModal, setShowSpeciesModal] = useState(false);

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
          saveIndividuals(all, true); // already on the server: don't push it all back
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
          saveSpecies(all, true);
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, individual?.id, species?.id]);

  // Map Initialization
  useEffect(() => {
    if (activeTab !== 'overview' || !mapRef.current || leafletMap.current) return;
    if (individual?.latitude) {
      const map = L.map(mapRef.current, { zoomControl: false, maxZoom: 22 }).setView([individual.latitude, individual.longitude], 16);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, maxNativeZoom: 19 }).addTo(map);
      locationMarkerRef.current = L.marker([individual.latitude, individual.longitude]).addTo(map);
      leafletMap.current = map;
      setTimeout(() => map.invalidateSize(), 200);
    } else if (isUpdatingLocation) {
      const map = L.map(mapRef.current, { zoomControl: false, maxZoom: 22 }).setView([0, 0], 2);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, maxNativeZoom: 19 }).addTo(map);
      leafletMap.current = map;
      locationMarkerRef.current = L.marker([0, 0]).addTo(map);
      setTimeout(() => map.invalidateSize(), 200);
    }
  }, [activeTab, individual?.latitude, isUpdatingLocation]);

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
    setIsUpdatingLocation(true);
  };

  const handleSaveLocation = async () => {
    if (!individual || !pendingLatLng) return;
    try {
      const { lat: latitude, lng: longitude } = pendingLatLng;
      const updated = { ...individual, latitude, longitude, lastModified: new Date().toISOString() };
      setIndividual(updated);
      const all = getIndividuals().map(i => i.id === individual.id ? updated : i);
      await saveIndividuals(all, true);
      if (leafletMap.current) {
        leafletMap.current.setView([latitude, longitude], 16);
      }
    } catch (e) {
      console.error('Failed to save location:', e);
      setLocationError('Failed to save location. Please try again.');
    } finally {
      setIsUpdatingLocation(false);
    }
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
      ...(newHealthEntry ? { healthHistory: [newHealthEntry, ...(individual.healthHistory || [])] } : {}),
      lastModified: new Date().toISOString()
    };

    const allInds = getIndividuals().map(i => i.id === individual.id ? updatedInd : i);
    saveIndividuals(allInds);
    setIndividual(updatedInd);
    setShowWeightModal(false);
    setPendingLogImage('');
  };

  const handleEditHealth = (record: HealthRecord) => {
    setEditingHealthId(record.id);
    setPendingLogImage(record.imageUrl || '');
    setShowHealthModal(true);
  };

  const handleEditWeight = (record: WeightRecord) => {
    setEditingWeightId(record.id);
    setPendingLogImage(record.imageUrl || '');
    setShowWeightModal(true);
  };

  const handleDeleteRecord = () => {
    if (!individual || !deleteRecordTarget) return;
    let updated = { ...individual, lastModified: new Date().toISOString() };
    if (deleteRecordTarget.type === 'health') {
      updated.healthHistory = (individual.healthHistory || []).filter(h => h.id !== deleteRecordTarget.id);
    } else {
      updated.weightHistory = (individual.weightHistory || []).filter(w => w.id !== deleteRecordTarget.id);
    }
    const all = getIndividuals().map(i => i.id === individual.id ? updated : i);
    saveIndividuals(all);
    setIndividual(updated);
    setDeleteRecordTarget(null);
  };

  if (!individual) return <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-emerald-600" /></div>;

  const isPlant = species?.type === 'Plant';
  const weightData = (individual.weightHistory || []).map(w => ({ date: w.date, value: w.weightKg })).reverse();

  // Newest first. Records are ordered by date, then by creation time (the id embeds a
  // Date.now() timestamp) so same-day entries keep a stable newest-first order.
  // "Previous profile photo" entries are archived copies, so they always sort last.
  const recordTime = (id: string) => { const m = id.match(/(\d{10,})$/); return m ? Number(m[1]) : 0; };
  const isArchivedPhoto = (id: string) => id.startsWith('h-pfp-');
  const newestFirst = (a: { date: string; id: string }, b: { date: string; id: string }) => {
    const aOld = isArchivedPhoto(a.id), bOld = isArchivedPhoto(b.id);
    if (aOld !== bOld) return aOld ? 1 : -1;
    const byDate = new Date(b.date).getTime() - new Date(a.date).getTime();
    return byDate || recordTime(b.id) - recordTime(a.id);
  };
  const sortedHealth = [...(individual.healthHistory || [])].sort(newestFirst);
  const sortedWeight = [...(individual.weightHistory || [])].sort(newestFirst);

  const realImage = (url?: string | null) => (url && !url.startsWith('data:image/svg+xml') ? url : null);

  // The profile/card image is the individual's own imageUrl (set by "use as card image").
  const getDisplayImage = () => {
    const newestObs = allObsImages.find(i => !i.archived);
    return realImage(individual?.imageUrl)
      || newestObs?.url
      || realImage(species?.imageUrl)
      || generatePattern(individual?.name || 'Individual');
  };

  // For plants, saving a height measurement writes the same photo to both a weight record and
  // a "Growth Measurement" health entry. Only list the photo once in the gallery.
  const growthPhotoDates = new Set(
    sortedHealth.filter(h => h.imageUrl && (h.type as any) === 'Growth Measurement').map(h => h.date)
  );
  const allObsImages = [
    ...sortedHealth.filter(h => h.imageUrl).map(h => ({ url: h.imageUrl!, date: h.date, id: h.id, archived: isArchivedPhoto(h.id) })),
    ...sortedWeight
      .filter(w => w.imageUrl && !(isPlant && growthPhotoDates.has(w.date)))
      .map(w => ({ url: w.imageUrl!, date: w.date, id: w.id, archived: false })),
  ].sort(newestFirst);
  const originalProfileImg = realImage(individual.imageUrl) || realImage(species?.imageUrl);
  const galleryImages = [...new Set([...allObsImages.map(i => i.url), ...(originalProfileImg ? [originalProfileImg] : [])])];

  const galleryIndexFor = (url: string, date: string) => {
    let idx = galleryImages.indexOf(url);
    if (idx < 0) {
      // weight photo hidden because the matching growth-measurement entry carries it
      const twin = sortedHealth.find(h => h.imageUrl && h.date === date && (h.type as any) === 'Growth Measurement');
      if (twin) idx = galleryImages.indexOf(twin.imageUrl!);
    }
    return Math.max(idx, 0);
  };

  // Profile image fields to apply when a photo is chosen as the card image. The thumbnail must
  // be refreshed too: cards and the map prefer thumbnailUrl over imageUrl.
  const buildProfileImage = async (photo: string): Promise<{ imageUrl: string; thumbnailUrl?: string }> => {
    try {
      return { imageUrl: photo, thumbnailUrl: await compressDataUrl(photo, 320, 0.72) };
    } catch {
      return { imageUrl: photo, thumbnailUrl: undefined };
    }
  };

  // Keep the old profile photo in the history only if it isn't already shown somewhere else.
  const isPhotoAlreadyListed = (url: string) =>
    (individual.healthHistory || []).some(h => h.imageUrl === url) ||
    (individual.weightHistory || []).some(w => w.imageUrl === url);

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
          <span>{t('editProfile')}</span>
        </button>
      </div>

      {/* Presence banner */}
      {individual.isPresenceOnly && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-sm text-teal-800 leading-relaxed flex items-start gap-3">
          <Info size={18} className="shrink-0 mt-0.5 text-teal-500" />
          <span>An individual record is created to represent this species, so observations, notes etc can be added.</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 space-x-8">
        <button onClick={() => setActiveTab('overview')} className={`py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'overview' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{t('overview')}</button>
        <button onClick={() => setActiveTab('history')} className={`py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'history' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{t('history')}</button>
        <button onClick={() => setActiveTab('genetics')} className={`py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'genetics' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{t('genetics')}</button>
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
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">{t('studbookId')}</span>
                    <span className="text-sm font-mono font-bold text-slate-700">{individual.studbookId}</span>
                  </div>
                  {individual.microchipNumber && (
                    <div className="flex items-center justify-between py-2 border-b border-slate-50">
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">{t('microchipNumber')}</span>
                      <span className="text-sm font-mono font-bold text-slate-700">{individual.microchipNumber}</span>
                    </div>
                  )}
                  {(!(isPlant && individual.sex === Sex.UNKNOWN)) && (
                    <div className="flex items-center justify-between py-2 border-b border-slate-50">
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">{t('sex')}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${individual.sex === Sex.MALE ? 'bg-blue-100 text-blue-700' : individual.sex === Sex.FEMALE ? 'bg-pink-100 text-pink-700' : 'bg-slate-100 text-slate-700'}`}>{individual.sex}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between py-2 border-b border-slate-50">
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">{isPlant ? t('planted') : t('birthDate')}</span>
                    <span className="text-sm font-bold text-slate-700">{individual.birthDate || t('unknownSex')}</span>
                  </div>
                  {individual.isDeceased && individual.deathDate && (
                    <div className="flex items-center justify-between py-2 border-b border-slate-50">
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">{isPlant ? t('removed') : t('deathDate')}</span>
                      <span className="text-sm font-bold text-red-600">{individual.deathDate}</span>
                    </div>
                  )}
                  {individual.source && (
                    <div className="flex items-center justify-between py-2 border-b border-slate-50">
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">{t('acquisitionSource')}</span>
                      <span className="text-sm font-bold text-slate-700">{individual.source}</span>
                    </div>
                  )}
                  {individual.sourceDetails && (
                    <div className="py-2 border-b border-slate-50">
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest block mb-1">{t('sourceDetails')}</span>
                      <p className="text-sm text-slate-700 leading-relaxed">{individual.sourceDetails}</p>
                    </div>
                  )}
                  {individual.loanStatus && individual.loanStatus !== 'None' && (
                    <div className="flex items-center justify-between py-2 border-b border-slate-50">
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">{t('loanStatus')}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${individual.loanStatus === 'Loaned Out' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{individual.loanStatus}</span>
                    </div>
                  )}
                  {individual.transferDate && (
                    <div className="flex items-center justify-between py-2 border-b border-slate-50">
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">{t('transferred')}</span>
                      <span className="text-sm font-bold text-slate-700">{individual.transferDate}</span>
                    </div>
                  )}
                  {individual.transferNote && (
                    <div className="py-2 border-b border-slate-50">
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest block mb-1">{t('transferNote')}</span>
                      <p className="text-sm text-slate-700 leading-relaxed">{individual.transferNote}</p>
                    </div>
                  )}
                  {enclosure && (
                    <div className="bg-purple-50 p-3 rounded-lg border border-purple-100 mt-2 flex items-center gap-3">
                      <Box size={20} className="text-purple-600" />
                      <div>
                        <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">{t('enclosure')}</p>
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
                   <button onClick={() => setShowSpeciesModal(true)} title={t('speciesDetail')} className="text-emerald-600 hover:text-emerald-800 transition-colors flex-shrink-0">
                     <Info size={16} />
                   </button>
                   <h3 className="font-bold text-slate-800 text-sm">Species: {species.commonName}</h3>
                   <span className="italic text-slate-400 text-xs ml-1">{species.scientificName}</span>
                   {species.conservationStatus && species.conservationStatus !== 'Unknown' && (
                     <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 uppercase tracking-wide">{species.conservationStatus}</span>
                   )}
                 </div>
                 <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                   {species.lifeExpectancyYears > 0 && (
                     <div className="bg-slate-50 rounded-lg p-3">
                       <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('lifeExpectancyShort')}</p>
                       <p className="font-bold text-slate-800 text-sm">{species.lifeExpectancyYears} yrs</p>
                     </div>
                   )}
                   {species.sexualMaturityAgeYears > 0 && (
                     <div className="bg-slate-50 rounded-lg p-3">
                       <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('sexualMaturityShort')}</p>
                       <p className="font-bold text-slate-800 text-sm">{species.sexualMaturityAgeYears} yrs</p>
                     </div>
                   )}
                   {species.averageAdultWeightKg > 0 && (
                     <div className="bg-slate-50 rounded-lg p-3">
                       <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{isPlant ? t('avgAdultHeight') : t('avgAdultWeight')}</p>
                       <p className="font-bold text-slate-800 text-sm">{species.averageAdultWeightKg} {isPlant ? 'cm' : 'kg'}</p>
                     </div>
                   )}
                   {species.breedingSeasonStart && species.breedingSeasonEnd && (
                     <div className="bg-slate-50 rounded-lg p-3">
                       <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('breedingSeason')}</p>
                       <p className="font-bold text-slate-800 text-sm">
                         {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][species.breedingSeasonStart - 1]} – {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][species.breedingSeasonEnd - 1]}
                       </p>
                     </div>
                   )}
                   {(() => {
                     const ns = (species.nativeStatusLocal && species.nativeStatusLocal !== 'Unknown')
                       ? species.nativeStatusLocal
                       : (species.nativeStatusCountry && species.nativeStatusCountry !== 'Unknown')
                       ? species.nativeStatusCountry
                       : null;
                     return ns ? (
                       <div className="bg-slate-50 rounded-lg p-3">
                         <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('nativeStatus')}</p>
                         <span className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase ${nativeStatusStyle(ns)}`}>{nativeStatusLabel(ns)}</span>
                       </div>
                     ) : null;
                   })()}
                 </div>
                 {species.description && (
                   <div className="px-4 pb-3">
                     <p className="text-xs text-slate-500 leading-relaxed">{species.description}</p>
                   </div>
                 )}
                 <div className="px-4 pb-4 flex gap-2 flex-wrap">
                   {!species.isUnknown && (
                     <>
                       <a href={`https://en.wikipedia.org/wiki/${encodeURIComponent(species.scientificName)}`} target="_blank" rel="noopener noreferrer"
                         className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors">
                         <ExternalLink size={12}/> Wikipedia
                       </a>
                       <a href={`https://www.iucnredlist.org/search?query=${encodeURIComponent(species.scientificName)}`} target="_blank" rel="noopener noreferrer"
                         className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors">
                         <ExternalLink size={12}/> IUCN Red List
                       </a>
                     </>
                   )}
                   <button onClick={() => setShowSpeciesModal(true)}
                     className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors ml-auto">
                     {t('speciesDetail')}
                   </button>
                 </div>
               </div>
             )}

             {/* Growth trend — always shown when data exists, or if no species card */}
             {(weightData.length > 1 || (!species || weightData.length > 1)) && (
             <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                   <h3 className="font-bold text-slate-800 flex items-center gap-2"><Activity size={20} className="text-emerald-500" />{isPlant ? t('growthTrend') : t('weightTrend')}</h3>
                   <div className="flex items-center gap-2">
                     {isPlant && weightData.length > 0 && (
                       <button onClick={() => { setShowWeightModal(true); setPendingLogImage(''); }} className="text-xs text-slate-500 px-2 py-1 rounded-lg hover:bg-slate-100 flex items-center gap-1"><Plus size={12}/> {t('logHeight')}</button>
                     )}
                     <button onClick={() => { isPlant ? (setShowHealthModal(true), setPendingLogImage('')) : (setShowWeightModal(true), setPendingLogImage('')); }} className="text-xs bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 hover:bg-emerald-100"><Plus size={14}/> {isPlant ? t('addObservation') : t('logWeight')}</button>
                   </div>
                </div>
                {isPlant && weightData.length === 0 ? (
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('speciesInfo')}</p>
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
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('nativeStatus')}</p>
                        {(() => {
                          const ns = (species?.nativeStatusLocal && species.nativeStatusLocal !== 'Unknown')
                            ? species.nativeStatusLocal
                            : (species?.nativeStatusCountry && species.nativeStatusCountry !== 'Unknown')
                            ? species.nativeStatusCountry
                            : null;
                          return ns
                            ? <span className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase ${nativeStatusStyle(ns)}`}>{nativeStatusLabel(ns)}</span>
                            : <p className="font-medium text-slate-700">—</p>;
                        })()}
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
                   <button onClick={() => setShowSpeciesModal(true)} title={t('speciesDetail')} className="text-emerald-600 hover:text-emerald-800 transition-colors flex-shrink-0">
                     <Info size={16} />
                   </button>
                   <h3 className="font-bold text-slate-800 text-sm">Species: {species.commonName}</h3>
                   <span className="italic text-slate-400 text-xs ml-1">{species.scientificName}</span>
                   {species.conservationStatus && species.conservationStatus !== 'Unknown' && (
                     <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 uppercase tracking-wide">{species.conservationStatus}</span>
                   )}
                 </div>
                 <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                   {species.lifeExpectancyYears > 0 && (
                     <div className="bg-slate-50 rounded-lg p-3">
                       <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('lifeExpectancyShort')}</p>
                       <p className="font-bold text-slate-800 text-sm">{species.lifeExpectancyYears} yrs</p>
                     </div>
                   )}
                   {species.sexualMaturityAgeYears > 0 && (
                     <div className="bg-slate-50 rounded-lg p-3">
                       <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('sexualMaturityShort')}</p>
                       <p className="font-bold text-slate-800 text-sm">{species.sexualMaturityAgeYears} yrs</p>
                     </div>
                   )}
                   {species.averageAdultWeightKg > 0 && (
                     <div className="bg-slate-50 rounded-lg p-3">
                       <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{isPlant ? t('avgAdultHeight') : t('avgAdultWeight')}</p>
                       <p className="font-bold text-slate-800 text-sm">{species.averageAdultWeightKg} {isPlant ? 'cm' : 'kg'}</p>
                     </div>
                   )}
                   {species.breedingSeasonStart && species.breedingSeasonEnd && (
                     <div className="bg-slate-50 rounded-lg p-3">
                       <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('breedingSeason')}</p>
                       <p className="font-bold text-slate-800 text-sm">
                         {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][species.breedingSeasonStart - 1]} – {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][species.breedingSeasonEnd - 1]}
                       </p>
                     </div>
                   )}
                   {(() => {
                     const ns = (species.nativeStatusLocal && species.nativeStatusLocal !== 'Unknown')
                       ? species.nativeStatusLocal
                       : (species.nativeStatusCountry && species.nativeStatusCountry !== 'Unknown')
                       ? species.nativeStatusCountry
                       : null;
                     return ns ? (
                       <div className="bg-slate-50 rounded-lg p-3">
                         <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('nativeStatus')}</p>
                         <span className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase ${nativeStatusStyle(ns)}`}>{nativeStatusLabel(ns)}</span>
                       </div>
                     ) : null;
                   })()}
                 </div>
                 {species.description && (
                   <div className="px-4 pb-3">
                     <p className="text-xs text-slate-500 leading-relaxed">{species.description}</p>
                   </div>
                 )}
                 <div className="px-4 pb-4 flex gap-2 flex-wrap">
                   {!species.isUnknown && (
                     <>
                       <a href={`https://en.wikipedia.org/wiki/${encodeURIComponent(species.scientificName)}`} target="_blank" rel="noopener noreferrer"
                         className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors">
                         <ExternalLink size={12}/> Wikipedia
                       </a>
                       <a href={`https://www.iucnredlist.org/search?query=${encodeURIComponent(species.scientificName)}`} target="_blank" rel="noopener noreferrer"
                         className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors">
                         <ExternalLink size={12}/> IUCN Red List
                       </a>
                     </>
                   )}
                   <button onClick={() => setShowSpeciesModal(true)}
                     className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors ml-auto">
                     {t('speciesDetail')}
                   </button>
                 </div>
               </div>
             )}

             {(individual.sireId || individual.damId) && (
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                   <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4"><Baby size={20} className="text-blue-500" /> {t('parentage')}</h3>
                   <div className="space-y-4 flex-1">
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-center gap-3">
                         <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">S</div>
                         <div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('sire')}</p><p className="text-sm font-bold text-slate-900">{individual.sireId || t('unknownSex')}</p></div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-center gap-3">
                         <div className="w-8 h-8 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center font-bold">D</div>
                         <div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('dam')}</p><p className="text-sm font-bold text-slate-900">{individual.damId || t('unknownSex')}</p></div>
                      </div>
                   </div>
                </div>
             )}

             {/* Location — full width */}
             <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4"><MapPin size={20} className="text-red-500" /> {t('location')}</h3>
                <div className="h-64 w-full rounded-lg bg-slate-100 overflow-hidden relative border border-slate-200">
{individual.latitude || isUpdatingLocation
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
                          <p className="text-slate-400 italic text-xs">{t('noCoordinatesAssigned')}</p>
                          <button
                            onClick={handleSetLocation}
                            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors shadow-sm"
                          >
                            <Navigation size={13}/> {t('setLocation')}
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
                 <h3 className="font-bold text-slate-800">{isPlant ? 'Observations & History' : 'Health Records'}</h3>
                 <button onClick={() => { setShowHealthModal(true); setEditingHealthId(null); setPendingLogImage(''); }} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm">+ {isPlant ? 'Add Observation' : 'New Record'}</button>
              </div>
<div className="divide-y divide-slate-100">
                  {sortedHealth.length > 0 ? (
                     sortedHealth.map(log => (
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
                             {log.performedBy && <p className="text-[10px] text-slate-400 font-bold uppercase mb-3">{t('performedBy')}: {log.performedBy}</p>}
                             
                             {log.imageUrl && (
                               <div className="w-32 h-32 rounded-lg overflow-hidden border border-slate-200 cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setGalleryIndex(galleryIndexFor(log.imageUrl!, log.date))}>
                                  <img src={log.imageUrl} className="w-full h-full object-cover" />
                               </div>
                             )}
                          </div>
                          <div className="flex flex-col gap-1.5 shrink-0">
                             <button onClick={() => handleEditHealth(log)} className="p-1.5 text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all" title="Edit record"><Pencil size={16}/></button>
                             <button onClick={() => setDeleteRecordTarget({ id: log.id, type: 'health' })} className="p-1.5 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Delete record"><Trash2 size={16}/></button>
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

           {/* Weight Records section */}
           <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                 <h3 className="font-bold text-slate-800">{isPlant ? 'Height Measurements' : 'Weight Records'}</h3>
                 <button onClick={() => { setShowWeightModal(true); setEditingWeightId(null); setPendingLogImage(''); }} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm">+ {isPlant ? 'Log Height' : 'Log Weight'}</button>
              </div>
<div className="divide-y divide-slate-100">
                  {sortedWeight.length > 0 ? (
                     sortedWeight.map(w => (
                       <div key={w.id} className="p-6 hover:bg-slate-50 transition-colors flex gap-6">
                          <div className="p-2 rounded-lg h-fit flex-shrink-0 bg-emerald-50 text-emerald-600">
                            <Scale size={20}/>
                          </div>
                          <div className="flex-1 min-w-0">
                             <div className="flex justify-between items-start mb-1">
                                <h4 className="font-bold text-slate-900">{isPlant ? 'Height' : 'Weight'}: <span className="text-emerald-600">{w.weightKg} {isPlant ? 'cm' : 'kg'}</span></h4>
                                <span className="text-xs font-bold text-slate-400">{w.date}</span>
                             </div>
                             {w.note && <p className="text-sm text-slate-600 leading-relaxed mb-3">{w.note}</p>}
                             {w.imageUrl && (
                               <div className="w-32 h-32 rounded-lg overflow-hidden border border-slate-200 cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setGalleryIndex(galleryIndexFor(w.imageUrl!, w.date))}>
                                  <img src={w.imageUrl} className="w-full h-full object-cover" />
                               </div>
                             )}
                          </div>
                          <div className="flex flex-col gap-1.5 shrink-0">
                             <button onClick={() => handleEditWeight(w)} className="p-1.5 text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all" title="Edit record"><Pencil size={16}/></button>
                             <button onClick={() => setDeleteRecordTarget({ id: w.id, type: 'weight' })} className="p-1.5 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Delete record"><Trash2 size={16}/></button>
                          </div>
                       </div>
                    ))
                 ) : (
                    <div className="p-12 text-center text-slate-400 opacity-50 flex flex-col items-center">
                       <Archive size={48} strokeWidth={1} className="mb-2" />
                       <p>{isPlant ? 'No height measurements recorded yet.' : 'No weight records found.'}</p>
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
      {showWeightModal && (() => {
        const editingWeightRecord = editingWeightId ? (individual?.weightHistory || []).find(w => w.id === editingWeightId) : null;
        return (
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4" key={editingWeightId || 'new-weight'}>
           <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-200">
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                 <h3 className="font-bold">{editingWeightId ? 'Edit Measurement' : `Log ${isPlant ? 'Measurement' : 'Weight'}`}</h3>
                 <button onClick={() => { setShowWeightModal(false); setEditingWeightId(null); setPendingLogImage(''); setUseAsCardImage(true); }} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
              </div>
              <form onSubmit={async (e) => {
                 e.preventDefault();
                 if (!individual) return;
                 const fd = new FormData(e.currentTarget);
                 const date = fd.get('date') as string;
                 const value = Number(fd.get('weight'));
                 const note = fd.get('note') as string;

                 const newRecord: WeightRecord = {
                    id: editingWeightId || `w-${Date.now()}`,
                    date,
                    weightKg: value,
                    note,
                    imageUrl: pendingLogImage || undefined
                 };

                 const newHealthEntry: HealthRecord | null = isPlant && !editingWeightId ? {
                    id: `h-${Date.now()}`,
                    date,
                    type: 'Growth Measurement' as any,
                    description: `Height recorded: ${value} cm${note ? ` — ${note}` : ''}`,
                    performedBy: '',
                    imageUrl: pendingLogImage || undefined
                 } : null;

                 const existingWeight = editingWeightId ? (individual.weightHistory || []).find(w => w.id === editingWeightId) : null;

                 // When a weight record has an image, preserve any old profile picture
                 // so it stays visible in the gallery
                 const oldProfileImgWeight = individual.imageUrl;
                 const shouldPreserveOldWeight = pendingLogImage && useAsCardImage && oldProfileImgWeight && !oldProfileImgWeight.startsWith('data:image/svg+xml') && oldProfileImgWeight !== pendingLogImage && !isPhotoAlreadyListed(oldProfileImgWeight);
                 const newProfileImage = pendingLogImage && useAsCardImage ? await buildProfileImage(pendingLogImage) : null;
                 const preservationEntry: HealthRecord | null = shouldPreserveOldWeight ? { id: `h-pfp-${Date.now()}`, date: individual.lastModified ? individual.lastModified.split('T')[0] : (individual.birthDate || new Date().toISOString().split('T')[0]), type: 'Other' as any, description: 'Previous profile photo', imageUrl: oldProfileImgWeight, performedBy: '' } : null;

const updatedInd = {
                      ...individual,
                      ...(newProfileImage ?? {}),
                      weightHistory: existingWeight
                        ? (individual.weightHistory || []).map(w => w.id === editingWeightId ? newRecord : w)
                        : [newRecord, ...(individual.weightHistory || [])],
                      ...(newHealthEntry || preservationEntry
                        ? {
                            healthHistory: [
                              ...(newHealthEntry ? [newHealthEntry] : []),
                              ...(preservationEntry ? [preservationEntry] : []),
                              ...(individual.healthHistory || [])
                            ]
                          }
                        : {}),
                      lastModified: new Date().toISOString()
                   };

                 const allInds = getIndividuals().map(i => i.id === individual.id ? updatedInd : i);
                 saveIndividuals(allInds);
                 setIndividual(updatedInd);
setShowWeightModal(false);
                  setEditingWeightId(null);
                  setPendingLogImage('');
                  setUseAsCardImage(true);
              }} className="p-6 space-y-4">
                 <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">Date</label>
                    <input type="date" name="date" className="w-full mt-1 px-4 py-2 border border-slate-300 rounded-lg outline-none" defaultValue={editingWeightRecord?.date || new Date().toISOString().split('T')[0]} required />
                 </div>
                 <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">{isPlant ? 'Height (cm)' : 'Weight (kg)'}</label>
                    <input type="number" step="0.01" name="weight" className="w-full mt-1 px-4 py-2 border border-slate-300 rounded-lg outline-none" defaultValue={editingWeightRecord?.weightKg ?? ''} autoFocus />
                 </div>
                 <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">Note</label>
                    <input type="text" name="note" className="w-full mt-1 px-4 py-2 border border-slate-300 rounded-lg outline-none" placeholder="e.g. Regular checkup" defaultValue={editingWeightRecord?.note || ''} />
                 </div>

<div className="space-y-2">
                     <label className="text-xs font-bold text-slate-500 uppercase">Attach Observation Photo</label>
                     {pendingLogImage ? (
                       <div className="flex items-center gap-3">
                         <div className="flex-1 flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                           <img src={pendingLogImage} className="h-16 w-16 object-cover rounded shadow-sm shrink-0" />
                           <div className="flex gap-2">
                             <button type="button" onClick={() => { setPendingLogImage(''); setUseAsCardImage(true); }} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={18}/></button>
                           </div>
                         </div>
                       </div>
                     ) : (
                       <div className="grid grid-cols-2 gap-3">
                         <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer transition-all">
                           <Camera size={24} className="text-slate-300 mb-1" />
                           <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Take Photo</span>
                           <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleLogPhotoUpload} />
                         </label>
                         <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer transition-all">
                           <ImageIcon size={24} className="text-slate-300 mb-1" />
                           <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Upload</span>
                           <input type="file" accept="image/*" className="hidden" onChange={handleLogPhotoUpload} />
                         </label>
                       </div>
                     )}
                     {pendingLogImage && (
                        <label className="flex items-center gap-2.5 cursor-pointer mt-1 select-none">
                           <input
                              type="checkbox"
                              checked={useAsCardImage}
                              onChange={e => setUseAsCardImage(e.target.checked)}
                              className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                           />
                           <span className="text-sm text-slate-600">{t('useAsCardImage')}</span>
                        </label>
                     )}
                  </div>

                 <div className="pt-4 flex gap-2">
                    <button type="button" onClick={() => { setShowWeightModal(false); setEditingWeightId(null); setPendingLogImage(''); setUseAsCardImage(true); }} className="flex-1 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-bold">Cancel</button>
                    <button type="submit" className="flex-1 py-2 bg-emerald-600 text-white rounded-lg font-bold shadow-md hover:bg-emerald-700">{editingWeightId ? 'Update Log' : 'Save Log'}</button>
                 </div>
              </form>
           </div>
        </div>
        );
      })()}

      {/* Health Modal */}
      {showHealthModal && (() => {
        const editingHealthRecord = editingHealthId ? (individual?.healthHistory || []).find(h => h.id === editingHealthId) : null;
        return (
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4" key={editingHealthId || 'new-health'}>
           <div className="bg-white rounded-xl shadow-xl w-full max-md overflow-hidden animate-in zoom-in duration-200">
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                 <h3 className="font-bold">{editingHealthId ? 'Edit Record' : (isPlant ? 'New Observation' : 'New Record')}</h3>
                 <button onClick={() => { setShowHealthModal(false); setEditingHealthId(null); setPendingLogImage(''); setUseAsCardImage(true); }} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
              </div>
              <form onSubmit={async (e) => {
                 e.preventDefault();
                 if(!individual) return;
                 const fd = new FormData(e.currentTarget);
                 const log: HealthRecord = {
                    id: editingHealthId || `h-${Date.now()}`,
                    date: fd.get('date') as string,
                    type: fd.get('type') as any,
                    description: fd.get('desc') as string,
                    performedBy: fd.get('who') as string,
                    imageUrl: pendingLogImage || undefined
                 };

                 const existing = editingHealthId ? (individual.healthHistory || []).find(h => h.id === editingHealthId) : null;

                 // When useAsCardImage overwrites imageUrl, preserve the old profile
                 // picture so it stays visible in the gallery
                 const oldProfileImg = individual.imageUrl;
                 const shouldPreserveOld = pendingLogImage && useAsCardImage && oldProfileImg && !oldProfileImg.startsWith('data:image/svg+xml') && oldProfileImg !== pendingLogImage && !isPhotoAlreadyListed(oldProfileImg);
                 const newProfileImage = pendingLogImage && useAsCardImage ? await buildProfileImage(pendingLogImage) : null;

const updated = {
                      ...individual,
                      ...(newProfileImage ?? {}),
                      healthHistory: existing
                        ? (individual.healthHistory || []).map(h => h.id === editingHealthId ? log : h)
                        : [
                            log,
                            ...(shouldPreserveOld ? [{ id: `h-pfp-${Date.now()}`, date: individual.lastModified ? individual.lastModified.split('T')[0] : (individual.birthDate || new Date().toISOString().split('T')[0]), type: 'Other' as any, description: 'Previous profile photo', imageUrl: oldProfileImg, performedBy: '' }] : []),
                            ...(individual.healthHistory || [])
                          ],
                      lastModified: new Date().toISOString()
                   };

                 const all = getIndividuals().map(i => i.id === individual.id ? updated : i);
                 saveIndividuals(all);
                 setIndividual(updated);
                 setShowHealthModal(false);
                 setEditingHealthId(null);
                 setPendingLogImage('');
                 setUseAsCardImage(true);
              }} className="p-6 space-y-4">
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                       <label className="text-[10px] font-bold text-slate-400 uppercase">Date</label>
                       <input type="date" name="date" className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" defaultValue={editingHealthRecord?.date || new Date().toISOString().split('T')[0]} required />
                    </div>
                    <div>
                       <label className="text-[10px] font-bold text-slate-400 uppercase">Type</label>
                       <select name="type" className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white" defaultValue={editingHealthRecord?.type || ''} required>
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
                     <input type="text" name="who" className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder={isPlant ? 'Your name' : 'Veterinarian Name'} defaultValue={editingHealthRecord?.performedBy || getSession()?.name || ''} />
                  </div>
                  <div>
                     <label className="text-[10px] font-bold text-slate-400 uppercase">Description</label>
                     <textarea name="desc" className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" rows={4} placeholder="Detailed notes..." defaultValue={editingHealthRecord?.description || ''} />
                 </div>
                 
                 <div className="space-y-2">
                     <label className="text-[10px] font-bold text-slate-400 uppercase">Attach Photo</label>
                     {pendingLogImage ? (
                       <div className="flex items-center gap-3">
                         <div className="flex-1 flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                           <img src={pendingLogImage} className="h-20 w-20 object-cover rounded shadow-sm shrink-0" />
                           <div className="flex gap-2">
                             <button type="button" onClick={() => { setPendingLogImage(''); setUseAsCardImage(true); }} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={18}/></button>
                           </div>
                         </div>
                       </div>
                     ) : (
                       <div className="grid grid-cols-2 gap-3">
                         <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer transition-all">
                           <Camera size={24} className="text-slate-300 mb-1" />
                           <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Take Photo</span>
                           <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleLogPhotoUpload} />
                         </label>
                         <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer transition-all">
                           <ImageIcon size={24} className="text-slate-300 mb-1" />
                           <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Upload</span>
                           <input type="file" accept="image/*" className="hidden" onChange={handleLogPhotoUpload} />
                         </label>
                       </div>
                     )}
                     {pendingLogImage && (
                        <label className="flex items-center gap-2.5 cursor-pointer mt-1 select-none">
                           <input
                              type="checkbox"
                              checked={useAsCardImage}
                              onChange={e => setUseAsCardImage(e.target.checked)}
                              className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                           />
                           <span className="text-sm text-slate-600">{t('useAsCardImage')}</span>
                        </label>
                     )}
                  </div>

                 <div className="pt-4 flex gap-2">
                    <button type="button" onClick={() => { setShowHealthModal(false); setPendingLogImage(''); setUseAsCardImage(true); }} className="flex-1 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-bold">Cancel</button>
                    <button type="submit" className="flex-1 py-2 bg-emerald-600 text-white rounded-lg font-bold shadow-md hover:bg-emerald-700">{editingHealthId ? 'Update Record' : 'Save Record'}</button>
                 </div>
              </form>
           </div>
        </div>
        );
      })()}
      {/* Image Gallery Lightbox */}
      {galleryIndex >= 0 && (() => {
        if (galleryImages.length === 0) return null;
        const current = galleryImages[galleryIndex] || galleryImages[0];
        const isObs = galleryIndex < (allObsImages.length);
        return (
          <div className="fixed inset-0 z-[99999] bg-black/95 flex flex-col items-center justify-center my-0" onClick={() => setGalleryIndex(-1)}>
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
              src={current}
              className="max-h-[80vh] max-w-[90vw] object-contain rounded-xl shadow-2xl"
              onClick={e => e.stopPropagation()}
            />
            {/* Caption */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center">
              <p className="text-white font-bold text-sm">{isObs ? 'Observation' : 'Profile photo'}</p>
            </div>
          </div>
        );
      })()}

      <ConfirmModal
        isOpen={!!deleteRecordTarget}
        title="Delete Record"
        message="Permanently delete this record? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDeleteRecord}
        onCancel={() => setDeleteRecordTarget(null)}
        variant="danger"
      />

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

      {showSpeciesModal && species && (
        <SpeciesModal species={species} onClose={() => setShowSpeciesModal(false)} />
      )}
    </div>
  );
};

export default IndividualDetail;