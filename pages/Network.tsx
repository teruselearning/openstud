
import React, { useState, useEffect, useRef, useContext } from 'react';
import { getNetworkPartners, getOrg, getSpecies, sendMockNotification, getPartnerships, generatePartnerInvite, redeemPartnerInvite, getSession, getIndividuals, getProjects } from '../services/storage';
import { ExternalPartner, Organization, Species, Partnership, Sex, UserRole } from '../types';
import { Map, Filter, Building2, MapPin, Send, MessageSquare, Search, Crosshair, EyeOff, Handshake, Plus, Copy, Check, Eye, X, Users, Dna, Lock, AlertTriangle, Globe2, Activity, Leaf, ChevronRight, Info, Loader2 } from 'lucide-react';
import { LanguageContext } from '../App';

declare const L: any; // Leaflet global

type ViewMode = 'map' | 'partners';

const Network: React.FC = () => {
  const { t } = useContext(LanguageContext);
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [partners, setPartners] = useState<ExternalPartner[]>([]);
  const [myOrg, setMyOrg] = useState<Organization | null>(null);
  const [localSpecies, setLocalSpecies] = useState<Species[]>([]);
  const [partnerships, setPartnerships] = useState<Partnership[]>([]);
  
  const [selectedSpeciesId, setSelectedSpeciesId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLocating, setIsLocating] = useState(false);
  const [userCoords, setUserCoords] = useState<{lat: number, lng: number} | null>(null);
  
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  const [showContactModal, setShowContactModal] = useState(false);
  const [contactPartner, setContactPartner] = useState<ExternalPartner | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  
  const [selectedPartnerForSummary, setSelectedPartnerForSummary] = useState<ExternalPartner | null>(null);
  const [summaryTab, setSummaryTab] = useState<'population' | 'individuals'>('population');
  
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inputCode, setInputCode] = useState('');
  const [redeemResult, setRedeemResult] = useState<{success: boolean, message: string} | null>(null);

  useEffect(() => {
    const rawPartners = getNetworkPartners() || [];
    setPartners(rawPartners);
    setMyOrg(getOrg());
    setLocalSpecies(getSpecies() || []);
    setPartnerships(getPartnerships() || []);
  }, []);

  const filteredPartners = partners.filter(p => {
    if (!p) return false;
    if (!p.isOrgPublic) return false; 
    const pSpeciesIds = p.speciesIds || [];
    if (selectedSpeciesId) {
      if (!p.isSpeciesPublic) return false;
      if (!pSpeciesIds.includes(selectedSpeciesId)) return false;
    }
    if (searchQuery && viewMode === 'map') {
      const query = searchQuery.toLowerCase();
      const nameMatch = !p.hideName && (p.name || '').toLowerCase().includes(query);
      const locMatch = (p.location || '').toLowerCase().includes(query);
      return nameMatch || locMatch;
    }
    return true;
  });

  const myPartners = partners.filter(p => {
     if (!myOrg) return false;
     return partnerships.some(rel => (rel.orgId1 === myOrg.id && rel.orgId2 === p.id) || (rel.orgId1 === p.id && rel.orgId2 === myOrg?.id));
  });

  useEffect(() => {
    if (viewMode !== 'map' || !mapRef.current) return;
    const targetLat = (typeof myOrg?.latitude === 'number') ? myOrg.latitude : 39.8283; 
    const targetLng = (typeof myOrg?.longitude === 'number') ? myOrg.longitude : -98.5795;
    const targetZoom = (typeof myOrg?.latitude === 'number') ? 10 : 4; 

    if (!leafletMap.current) {
      try {
        const map = L.map(mapRef.current, { zoomControl: false }).setView([targetLat, targetLng], targetZoom);
        L.control.zoom({ position: 'topright' }).addTo(map);
        leafletMap.current = map;
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(map);

        // ATTEMPT TO CENTER ON CURRENT LOCATION
        if (navigator.geolocation) {
           navigator.geolocation.getCurrentPosition(
             (pos) => {
               const { latitude, longitude } = pos.coords;
               setUserCoords({ lat: latitude, lng: longitude });
               map.setView([latitude, longitude], 11);
             },
             (err) => console.warn("Network Map geolocation denied."),
             { enableHighAccuracy: true, timeout: 5000 }
           );
        }

        setTimeout(() => map.invalidateSize(), 200);
      } catch (e) { console.error("Error initializing map:", e); }
    }
  }, [viewMode, myOrg]);

  useEffect(() => {
    if (viewMode !== 'map' || !leafletMap.current) return;
    const map = leafletMap.current;
    markersRef.current.forEach((m: any) => map.removeLayer(m));
    markersRef.current = [];

    if (myOrg && typeof myOrg.latitude === 'number' && typeof myOrg.longitude === 'number') {
      const myName = myOrg.hideName ? "Anonymous Organization" : myOrg.name;
      const myMarker = L.marker([myOrg.latitude, myOrg.longitude]).bindPopup(`<b>${myName}</b><br>You are here.`).addTo(map);
      markersRef.current.push(myMarker);
    }

    filteredPartners.forEach(p => {
      let lat = p.latitude; let lng = p.longitude;
      if (typeof lat !== 'number' || typeof lng !== 'number') return;
      if (p.obscureLocation) { lat = Math.round(lat * 10) / 10; lng = Math.round(lng * 10) / 10; }
      const isMyPartner = myPartners.some(mp => mp.id === p.id);
      const color = isMyPartner ? "#9333ea" : (p.obscureLocation ? "#f59e0b" : "#3b82f6");
      const displayName = p.hideName ? "Anonymous Partner" : p.name;
      
      let marker = p.obscureLocation ? L.circleMarker([lat, lng], { radius: 8, fillColor: color, color: "#000", weight: 1, opacity: 1, fillOpacity: 0.8 }) : L.marker([lat, lng]);
      
      const popupContent = document.createElement('div');
      popupContent.innerHTML = `<div class="text-sm"><h3 class="font-bold text-base flex items-center gap-2">${displayName}</h3><p class="text-slate-500">${p.location || 'Unknown Location'}</p><button id="view-profile-${p.id}" class="mt-2 w-full bg-slate-800 text-white px-2 py-1 rounded text-xs font-medium hover:bg-slate-700">View Profile</button></div>`;
      
      marker.bindPopup(popupContent);
      marker.on('popupopen', () => {
         const btn = document.getElementById(`view-profile-${p.id}`);
         if(btn) btn.onclick = () => setSelectedPartnerForSummary(p);
      });
      marker.addTo(map);
      markersRef.current.push(marker);
    });

    if (searchQuery && markersRef.current.length > 1) {
       try {
          const group = new L.featureGroup(markersRef.current);
          const bounds = group.getBounds();
          if (bounds.isValid()) map.fitBounds(bounds.pad(0.1));
       } catch (err) { console.warn("FitBounds failed", err); }
    }
  }, [filteredPartners, myOrg, searchQuery, viewMode, myPartners]);

  const handleOpenContact = (partner: ExternalPartner) => {
    setContactPartner(partner);
    const myName = myOrg?.hideName ? "A Partner Organization" : myOrg?.name;
    setMessage(`Hi ${partner.name},\n\nWe are interested in discussing a potential breeding loan for [Species].\n\nRegards,\n${myName}`);
    setShowContactModal(true);
  };

  const handleSendRequest = () => {
    if (!contactPartner) return;
    setSending(true);
    setTimeout(() => {
      alert(`Email and Notification sent to ${contactPartner.name}'s contact person.`);
      setSending(false); setShowContactModal(false); setContactPartner(null);
    }, 1000);
  };
  
  const handleGenerateInvite = () => setInviteCode(generatePartnerInvite());
  const handleRedeemInvite = () => {
     if(!inputCode) return;
     const result = redeemPartnerInvite(inputCode);
     setRedeemResult(result);
     if(result.success) { setPartnerships(getPartnerships()); setInputCode(''); }
     setTimeout(() => setRedeemResult(null), 5000);
  };

  const handleLocateMe = () => {
    if (!navigator.geolocation || !leafletMap.current) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition((position) => {
        const { latitude, longitude } = position.coords;
        leafletMap.current.flyTo([latitude, longitude], 12, { animate: true, duration: 1.5 });
        setUserCoords({ lat: latitude, lng: longitude });
        setIsLocating(false);
    }, () => setIsLocating(false));
  };

  const generateMockPartnerIndividuals = (speciesId: string, counts: string) => {
    const [m, f, u] = counts.split('.').map(n => parseInt(n) || 0);
    const results: { id: string; name: string; sex: Sex; age: number }[] = [];
    for (let i = 0; i < m; i++) results.push({ id: `m-${speciesId}-${i}`, name: `Male ${i + 1}`, sex: Sex.MALE, age: Math.floor(Math.random() * 10) + 2 });
    for (let i = 0; i < f; i++) results.push({ id: `f-${speciesId}-${i}`, name: `Female ${i + 1}`, sex: Sex.FEMALE, age: Math.floor(Math.random() * 10) + 2 });
    for (let i = 0; i < u; i++) results.push({ id: `u-${speciesId}-${i}`, name: `Individual ${i + 1}`, sex: Sex.UNKNOWN, age: Math.floor(Math.random() * 5) + 1 });
    return results;
  };

  const session = getSession();
  const isSuperAdmin = session?.role === UserRole.SUPER_ADMIN || (session?.role as string) === 'Super Admin';
  const isDemoOrg = myOrg?.id === 'org-1' && !isSuperAdmin;

  return (
    <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 flex-shrink-0">
        <div>
           <h2 className="text-2xl font-bold text-slate-900">{t('networkMap')}</h2>
           <p className="text-slate-500">{t('networkDescription')}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto items-center">
          <div className="flex bg-slate-100 p-1 rounded-lg">
             <button onClick={() => setViewMode('map')} className={`px-3 py-1.5 text-sm font-bold rounded-md transition-all ${viewMode === 'map' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}><Globe2 size={16} className="inline mr-1.5" />{t('network')}</button>
             <button onClick={() => setViewMode('partners')} className={`px-3 py-1.5 text-sm font-bold rounded-md transition-all ${viewMode === 'partners' ? 'bg-white shadow text-purple-700' : 'text-slate-500 hover:text-slate-900'}`}><Handshake size={16} className="inline mr-1.5" />{t('myPartners')}</button>
          </div>
          <div className="relative flex-1 min-w-[200px]">
             <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
             <input type="text" placeholder="Search locations..." className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900 shadow-sm text-sm" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative flex flex-col">
         {viewMode === 'map' && (
            <div className="flex flex-col md:flex-row h-full">
               <div className="flex-1 relative z-0 h-full min-h-[400px]">
                  <div id="network-map" ref={mapRef} className="h-full w-full"></div>
                  <button onClick={handleLocateMe} className="absolute bottom-6 right-6 z-[1000] bg-white p-3 rounded-full shadow-lg text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 transition-colors border border-slate-200" title="Use My Current Location">
                    {isLocating ? <Loader2 size={24} className="animate-spin text-emerald-600" /> : <Crosshair size={24} />}
                  </button>
               </div>
               <div className="w-full md:w-80 border-l border-slate-200 bg-slate-50 overflow-y-auto h-64 md:h-full">
                  <div className="p-4 border-b border-slate-200 bg-white sticky top-0 flex justify-between items-center"><h3 className="font-bold text-slate-900">Organizations</h3><span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{filteredPartners.length} Total</span></div>
                  <div className="divide-y divide-slate-100">
                     {filteredPartners.length === 0 ? (<div className="p-8 text-center text-slate-400 text-sm">{t('noPartnersFound')}</div>) : (
                       filteredPartners.map(p => (
                           <div key={p.id} className="p-4 hover:bg-white transition-colors cursor-pointer group" onClick={() => setSelectedPartnerForSummary(p)}>
                              <div className="flex justify-between items-start mb-1"><h4 className="font-bold text-slate-900 group-hover:text-emerald-700 transition-colors flex items-center gap-1">{p.hideName ? "Anonymous Partner" : p.name} {p.obscureLocation && <EyeOff size={12} className="text-slate-400" />}</h4>{myPartners.some(mp => mp.id === p.id) && (<span title="Partner"><Handshake size={14} className="text-purple-600" /></span>)}</div>
                              <div className="flex items-center text-slate-500 text-xs mb-2"><MapPin size={12} className="mr-1" /> {p.location || 'Unknown'}</div>
                              <div className="flex gap-2 mt-2"><button className="flex-1 bg-slate-100 text-slate-700 hover:bg-slate-200 text-[10px] py-1.5 rounded font-bold flex items-center justify-center gap-1 transition-colors uppercase tracking-widest"><Eye size={12} /> Profile</button>{p.allowBreedingRequests && (<button onClick={(e) => { e.stopPropagation(); handleOpenContact(p); }} className={`flex-1 text-purple-700 border border-purple-100 text-[10px] py-1.5 rounded font-bold flex items-center justify-center gap-1 transition-colors uppercase tracking-widest ${isDemoOrg ? 'opacity-50 cursor-not-allowed' : 'bg-purple-50 hover:bg-purple-100'}`} disabled={isDemoOrg}><Send size={12} /> Contact</button>)}</div>
                           </div>
                       ))
                     )}
                  </div>
               </div>
            </div>
         )}

         {viewMode === 'partners' && (
            <div className="flex-1 p-6 overflow-y-auto">
               <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-xl p-6 text-white shadow-lg flex flex-col justify-between">
                     <div><h3 className="text-xl font-bold mb-2">{t('connectNewPartner')}</h3><p className="text-emerald-100 text-sm mb-4">Share your invite code or enter a code from another organization to establish a breeding partnership.</p><div className="bg-white/10 p-4 rounded-lg backdrop-blur-sm border border-white/20 mb-4"><p className="text-xs text-emerald-200 uppercase font-bold tracking-wider mb-1">{t('yourInviteCode')}</p><div className="flex items-center justify-between"><span className="font-mono text-xl font-bold tracking-widest">{inviteCode || '••••-••••'}</span><button onClick={handleGenerateInvite} className="p-2 hover:bg-white/20 rounded-lg transition-colors"><Plus size={20} /></button></div></div><div className="bg-white/10 p-4 rounded-lg backdrop-blur-sm border border-white/20"><p className="text-xs text-emerald-200 uppercase font-bold tracking-wider mb-1">{t('redeemCode')}</p><div className="flex gap-2"><input className="flex-1 bg-white/20 border-none rounded px-3 py-2 text-white placeholder:text-emerald-200/50 outline-none focus:ring-2 focus:ring-white" placeholder="Enter code..." value={inputCode} onChange={(e) => setInputCode(e.target.value)} /><button onClick={handleRedeemInvite} disabled={!inputCode} className="bg-white text-emerald-700 px-4 py-2 rounded font-bold hover:bg-emerald-50">Connect</button></div>{redeemResult && (<p className={`text-xs mt-2 font-medium ${redeemResult.success ? 'text-emerald-100' : 'text-red-200'}`}>{redeemResult.message}</p>)}</div></div>
                  </div>
                  {myPartners.length === 0 ? (<div className="lg:col-span-2 flex items-center justify-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 text-slate-400 min-h-[300px]"><div className="text-center"><Handshake size={48} className="mx-auto mb-3 opacity-50" /><p>No partnerships established yet.</p></div></div>) : (
                     myPartners.map(p => (
                           <div key={p.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 hover:shadow-md transition-shadow relative group">
                              <div className="flex justify-between items-start mb-4"><div><h3 className="font-bold text-lg text-slate-900">{p.name}</h3><p className="text-slate-500 text-sm flex items-center gap-1"><MapPin size={14}/> {p.location || 'Unknown'}</p></div><div className="bg-purple-100 text-purple-700 p-2 rounded-lg"><Handshake size={20} /></div></div>
                              <div className="flex gap-2"><button onClick={() => setSelectedPartnerForSummary(p)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-lg font-bold text-xs uppercase tracking-widest transition-all">Profile</button><button onClick={() => handleOpenContact(p)} className={`flex-1 border border-purple-200 text-purple-700 py-2 rounded-lg font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${isDemoOrg ? 'opacity-50 cursor-not-allowed' : 'hover:bg-purple-50'}`} disabled={isDemoOrg}><MessageSquare size={16} /> Message</button></div>
                           </div>
                        ))
                  )}
               </div>
            </div>
         )}
      </div>

      {selectedPartnerForSummary && (
         <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in duration-200">
               <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50"><div><h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Building2 className="text-slate-400"/> {selectedPartnerForSummary.name}</h2><p className="text-slate-500 flex items-center gap-1 mt-1"><MapPin size={14}/> {selectedPartnerForSummary.location || 'Unknown Location'}</p></div><button onClick={() => setSelectedPartnerForSummary(null)} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors"><X size={24} /></button></div>
               <div className="flex border-b border-slate-200 px-6"><button onClick={() => setSummaryTab('population')} className={`py-3 px-4 text-sm font-bold border-b-2 transition-colors ${summaryTab === 'population' ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Species & Population</button><button onClick={() => setSummaryTab('individuals')} className={`py-3 px-4 text-sm font-bold border-b-2 transition-colors ${summaryTab === 'individuals' ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Individual Browser</button></div>
               <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                  {summaryTab === 'population' && (
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {selectedPartnerForSummary.isSpeciesPublic ? ((selectedPartnerForSummary.speciesIds || []).map(sid => { 
                           const sp = localSpecies.find(s => s.id === sid); 
                           const counts = selectedPartnerForSummary.populationCounts?.[sid] || "???.???.???"; 
                           return (
                              <div key={sid} className="bg-white p-4 rounded-xl border border-slate-200 flex justify-between items-center shadow-sm">
                                 <div className="flex items-center gap-3 overflow-hidden">
                                    <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center font-bold flex-shrink-0 overflow-hidden">
                                       {sp?.imageUrl ? <img src={sp.imageUrl} className="w-full h-full object-cover rounded-full" /> : <Dna className="p-2 opacity-30" />}
                                    </div>
                                    <div className="overflow-hidden">
                                       <h4 className="font-bold text-slate-900 truncate">{sp?.commonName || `Species #${sid.substring(0,5)}`}</h4>
                                       <p className="text-[10px] text-slate-500 italic truncate">{sp?.scientificName || 'Unlisted Metadata'}</p>
                                    </div>
                                 </div>
                                 <div className="text-right flex-shrink-0">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Ratio</p>
                                    <p className="text-sm font-mono font-bold text-emerald-600">{counts}</p>
                                 </div>
                              </div>
                           );
                        })) : (
                           <div className="col-span-full text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
                              <Lock className="mx-auto text-slate-300 mb-2" size={48} />
                              <p className="text-slate-500 font-bold">This organization keeps their species list private.</p>
                           </div>
                        )}
                     </div>
                  )}
                  {summaryTab === 'individuals' && (
                     <div>
                        {!selectedPartnerForSummary.isSpeciesPublic ? (
                           <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
                              <Lock className="mx-auto text-slate-300 mb-2" size={48} />
                              <p className="text-slate-500 font-bold">Access Restricted</p>
                           </div>
                        ) : (
                           <div className="space-y-6">
                              {(selectedPartnerForSummary.speciesIds || []).map(sid => { 
                                 const sp = localSpecies.find(s => s.id === sid); 
                                 const mockInds = generateMockPartnerIndividuals(sid, selectedPartnerForSummary.populationCounts?.[sid] || "0.0.0"); 
                                 if (mockInds.length === 0) return null;
                                 return (
                                    <div key={sid}>
                                       <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2 bg-white p-2 rounded border border-slate-100 shadow-sm w-fit">
                                          <Dna size={16} className="text-emerald-500"/> {sp?.commonName || `Species #${sid.substring(0,5)}`}
                                       </h4>
                                       <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                          {mockInds.map(ind => (
                                             <div key={ind.id} className="bg-white p-3 rounded-lg border border-slate-200 flex items-center gap-3 shadow-sm">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${ind.sex === Sex.MALE ? 'bg-blue-100 text-blue-700' : ind.sex === Sex.FEMALE ? 'bg-pink-100 text-pink-700' : 'bg-slate-100 text-slate-600'}`}>
                                                   {ind.sex.charAt(0)}
                                                </div>
                                                <div>
                                                   <p className="text-sm font-bold text-slate-900 leading-tight">{ind.name}</p>
                                                   <p className="text-[10px] text-slate-400 uppercase tracking-widest">{ind.age}y • Adult</p>
                                                </div>
                                             </div>
                                          ))}
                                       </div>
                                    </div>
                                 ); 
                              })}
                           </div>
                        )}
                     </div>
                  )}
               </div>
               <div className="p-4 border-t border-slate-200 bg-white flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div className="flex items-center gap-2 text-xs text-slate-500 italic">
                     <Info size={14}/> Private individual data is only shared with active breeding partners.
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                     <button onClick={() => setSelectedPartnerForSummary(null)} className="flex-1 sm:flex-none px-6 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-bold text-sm transition-all border border-slate-200">Close</button>
                     {selectedPartnerForSummary.allowBreedingRequests && (
                        <button onClick={() => handleOpenContact(selectedPartnerForSummary)} className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-2 rounded-lg font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2"><Send size={14}/> Contact</button>
                     )}
                  </div>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default Network;
