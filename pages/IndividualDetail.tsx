
import React, { useState, useEffect, useRef, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getIndividuals, saveIndividuals, getSpecies, generatePattern, getBreedingLoans, sendMockNotification, getBreedingEvents, getNetworkPartners, getPartnerships, getOrg, getEnclosures } from '../services/storage';
import { Individual, Species, WeightRecord, HealthRecord, GrowthRecord, BreedingEvent, ExternalPartner, Partnership, Enclosure } from '../types';
import { ArrowLeft, Scale, Activity, Syringe, Calendar, Plus, Stethoscope, Sprout, Camera, MapPin, Navigation, X, ChevronLeft, ChevronRight, Maximize2, Briefcase, Archive, Edit, Baby, Heart, ArrowRightLeft, ExternalLink, Fingerprint, Download, FileCode, Box } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { LanguageContext } from '../App';

declare const L: any; // Leaflet global

const IndividualDetail: React.FC = () => {
  const { t } = useContext(LanguageContext);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [individual, setIndividual] = useState<Individual | null>(null);
  const [species, setSpecies] = useState<Species | null>(null);
  const [enclosure, setEnclosure] = useState<Enclosure | null>(null);
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
    
    setPartners(getNetworkPartners());
    setMyPartnerships(getPartnerships());
  }, [id]);

  // ... (existing map and modal helper functions) ...
  const getDisplayImage = () => {
    if (individual?.imageUrl && !individual.imageUrl.startsWith('data:image/svg+xml')) return individual.imageUrl;
    if (species?.imageUrl && !species.imageUrl.startsWith('data:image/svg+xml')) return species.imageUrl;
    return generatePattern(individual?.name || 'Individual');
  };

  if (!individual) return <div className="p-8 text-center">Loading...</div>;

  const isPlant = species?.type === 'Plant';
  const showSexBadge = !isPlant || (isPlant && species?.plantClassification === 'Dioecious');
  const org = getOrg();
  const enclosureLabel = org.focus === 'Plants' ? 'Area' : 'Enclosure';

  const weightHistory = Array.isArray(individual.weightHistory) ? individual.weightHistory : [];
  const growthHistory = Array.isArray(individual.growthHistory) ? individual.growthHistory : [];
  const healthHistory = Array.isArray(individual.healthHistory) ? individual.healthHistory : [];

  const weightData = weightHistory.filter(w => w.weightKg !== undefined && w.weightKg !== null).map(w => ({ date: w.date, value: w.weightKg })) || [];
  const growthData = growthHistory.map(g => ({ date: g.date, value: g.heightCm })) || [];
  const chartData = isPlant ? growthData : weightData;
  const historySource = isPlant ? growthHistory : weightHistory;

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
              {enclosure && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full uppercase font-bold flex items-center gap-1"><Box size={10} /> {enclosure.name}</span>}
            </h1>
            <p className="text-slate-500 font-medium flex items-center gap-2">
               {species?.commonName} • <span className="font-serif italic">{species?.scientificName}</span>
            </p>
          </div>
        </div>
        <div className="flex gap-2">
            <button onClick={() => navigate('/individuals', { state: { editId: individual.id, returnTo: `/individuals/${individual.id}` } })} className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg font-medium transition-colors shadow-sm">
                <Edit size={18} />
                <span>Edit Profile</span>
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
             <div className="aspect-square w-full bg-slate-100 relative group cursor-pointer" onClick={() => setGalleryIndex(0)}>
                <img src={getDisplayImage()} className="w-full h-full object-cover" alt={individual.name} />
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                   <Maximize2 className="text-white" size={32} />
                </div>
             </div>
             <div className="p-4 space-y-3">
                {enclosure && (
                  <div className="bg-purple-50 p-3 rounded-lg border border-purple-100 mb-2">
                    <p className="text-xs font-bold text-purple-700 uppercase flex items-center gap-1 mb-1"><Box size={12}/> Assigned {enclosureLabel}</p>
                    <p className="text-sm text-slate-900 font-bold">{enclosure.name}</p>
                  </div>
                )}
                <div className="flex items-center justify-between py-2 border-b border-slate-50">
                  <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Studbook ID</span>
                  <span className="text-sm font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{individual.studbookId}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-50">
                  <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">{isPlant ? 'Planted' : 'Birth Date'}</span>
                  <span className="text-sm font-bold text-slate-700">{individual.birthDate || 'Unknown'}</span>
                </div>
                {showSexBadge && (
                  <div className="flex items-center justify-between py-2 border-b border-slate-50">
                    <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Sex</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${individual.sex === 'Male' ? 'bg-blue-100 text-blue-700' : individual.sex === 'Female' ? 'bg-pink-100 text-pink-700' : 'bg-slate-100 text-slate-700'}`}>{individual.sex}</span>
                  </div>
                )}
                <div className="flex items-center justify-between py-2 border-b border-slate-50">
                  <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Source</span>
                  <span className="text-sm font-bold text-slate-700">{individual.source || 'Unknown'}</span>
                </div>
                {individual.loanStatus && individual.loanStatus !== 'None' && (
                  <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 mt-4 flex items-start gap-3">
                     <Briefcase size={18} className="text-amber-600 shrink-0 mt-0.5" />
                     <div>
                        <p className="text-xs font-bold text-amber-700 uppercase">Loan Status</p>
                        <p className="text-sm font-bold text-amber-900">{individual.loanStatus}</p>
                     </div>
                  </div>
                )}
             </div>
          </div>
        </div>
        {/* ... (remaining detail view content like history and genetics) ... */}
      </div>
    </div>
  );
};

export default IndividualDetail;
