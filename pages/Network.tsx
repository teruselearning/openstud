
import React, { useState, useEffect, useRef } from 'react';
import { getNetworkPartners, getOrg, getSpecies, sendMockNotification, getPartnerships, generatePartnerInvite, redeemPartnerInvite, getSession } from '../services/storage';
import { ExternalPartner, Organization, Species, Partnership, Sex, UserRole } from '../types';
import { Map, Filter, Building2, MapPin, Send, MessageSquare, Search, Crosshair, EyeOff, Handshake, Plus, Copy, Check, Eye, X, Users, Dna, Lock } from 'lucide-react';

declare const L: any; // Leaflet global

type ViewMode = 'map' | 'partners';

// Mock Individual Generator for Partner Browsing
const generateMockPartnerIndividuals = (speciesId: string, countStr: string) => {
   if (!countStr) return [];
   const [m, f, u] = countStr.split('.').map(Number);
   const inds = [];
   for(let i=0; i<m; i++) inds.push({ id: `m-${i}`, name: `Male ${i+1}`, sex: Sex.MALE, age: Math.floor(Math.random()*10)+1 });
   for(let i=0; i<f; i++) inds.push({ id: `f-${i}`, name: `Female ${i+1}`, sex: Sex.FEMALE, age: Math.floor(Math.random()*10)+1 });
   for(let i=0; i<(u||0); i++) inds.push({ id: `u-${i}`, name: `Juv ${i+1}`, sex: Sex.UNKNOWN, age: 0.5 });
   return inds;
};

const Network: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [partners, setPartners] = useState<ExternalPartner[]>([]);
  const [myOrg, setMyOrg] = useState<Organization | null>(null);
  const [speciesList, setSpeciesList] = useState<Species[]>([]);
  const [partnerships, setPartnerships] = useState<Partnership[]>([]);
  
  // Filters
  const [selectedSpeciesId, setSelectedSpeciesId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  // Modal States
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactPartner, setContactPartner] = useState<ExternalPartner | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  
  // Summary Modal State
  const [selectedPartnerForSummary, setSelectedPartnerForSummary] = useState<ExternalPartner | null>(null);
  const [summaryTab, setSummaryTab] = useState<'population' | 'individuals'>('population');
  
  // Invite States
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inputCode, setInputCode] = useState('');
  const [redeemResult, setRedeemResult] = useState<{success: boolean, message: string} | null>(null);

  useEffect(() => {
    setPartners(getNetworkPartners());
    setMyOrg(getOrg());
    setSpeciesList(getSpecies());
    setPartnerships(getPartnerships());
  }, []);

  // Filter partners based on criteria
  const filteredPartners = partners.filter(p => {
    // Must be visible organization
    if (!p.isOrgPublic) return false; 
    
    // 1. Dropdown Filter (Specific Species ID)
    if (selectedSpeciesId) {
      if (!p.isSpeciesPublic) return false;
      if (!p.speciesIds.includes(selectedSpeciesId)) return false;
    }

    // 2. Text Search (Name, Location, Species Names)
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      
      // Important: If hidden, name search should NOT work for privacy
      const nameMatch = !p.hideName && p.name.toLowerCase().includes(query);
      const locMatch = p.location.toLowerCase().includes(query);
      
      let speciesMatch = false;
      if (p.isSpeciesPublic) {
        // Find common names of species this partner has
        const partnerSpeciesNames = speciesList
          .filter(s => p.speciesIds.includes(s.id))
          .map(s => s.commonName.toLowerCase());
        
        // Check if any species name matches query
        speciesMatch = partnerSpeciesNames.some(name => name.includes(query));
      }

      if (!nameMatch && !locMatch && !speciesMatch) return false;
    }

    return true;
  });
  
  // Derived state for 'My Partners'
  const myPartners = partners.filter(p => {
     if (!myOrg) return false;
     return partnerships.some(rel => 
        (rel.orgId1 === myOrg.id && rel.orgId2 === p.id) || 
        (rel.orgId1 === p.id && rel.orgId2 === myOrg?.id)
     );
  });

  // Initialize Map
  useEffect(() => {
    if (viewMode !== 'map') return;
    if (!mapRef.current) return;
    
    const targetLat = myOrg?.latitude || 39.8283; // Default US center
    const targetLng = myOrg?.longitude || -98.5795;
    const targetZoom = myOrg?.latitude ? 10 : 4; // Zoom 10 for better local context

    // Init map if not exists
    if (!leafletMap.current) {
      const map = L.map(mapRef.current).setView([targetLat, targetLng], targetZoom);
      leafletMap.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(map);

      // Fix for gray areas/rendering issues on load
      setTimeout(() => {
        map.invalidateSize();
      }, 200);
    } else {
      // Map exists, ensure it is centered on My Org if available (and not just defaulting)
      if (myOrg && myOrg.latitude && myOrg.longitude) {
         // Only recenter if we aren't actively searching (to avoid snapping away from results)
         if (!searchQuery) {
            leafletMap.current.setView([myOrg.latitude, myOrg.longitude], targetZoom);
         }
      }
    }
  }, [viewMode, myOrg]);

  // Update Markers
  useEffect(() => {
    if (viewMode !== 'map' || !leafletMap.current) return;
    const map = leafletMap.current;

    // Clear existing markers
    markersRef.current.forEach((m: any) => map.removeLayer(m));
    markersRef.current = [];

    // Add My Org Marker
    if (myOrg && myOrg.latitude && myOrg.longitude) {
      const myName = myOrg.hideName ? "Anonymous Organization" : myOrg.name;
      const myMarker = L.marker([myOrg.latitude, myOrg.longitude])
        .bindPopup(`<b>${myName}</b><br>You are here.`)
        .addTo(map);
      
      // Open popup by default for user
      myMarker.openPopup();
      markersRef.current.push(myMarker);
    }

    // Add Partner Markers
    filteredPartners.forEach(p => {
      let lat = p.latitude;
      let lng = p.longitude;
      
      // If obscured, round coordinates to 1 decimal place (approx 10km grid)
      if (p.obscureLocation) {
        lat = Math.round(lat * 10) / 10;
        lng = Math.round(lng * 10) / 10;
      }

      const isMyPartner = myPartners.some(mp => mp.id === p.id);
      const color = isMyPartner ? "#9333ea" : (p.obscureLocation ? "#f59e0b" : "#3b82f6");
      const displayName = p.hideName ? "Anonymous Partner" : p.name;

      let marker;
      if (p.obscureLocation) {
         marker = L.circleMarker([lat, lng], {
            radius: 8,
            fillColor: color, 
            color: "#000",
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8
         });
      } else {
         marker = L.marker([lat, lng]);
      }
      
      const popupContent = document.createElement('div');
      popupContent.innerHTML = `
          <div class="text-sm">
            <h3 class="font-bold text-base flex items-center gap-2">
               ${displayName} 
               ${p.obscureLocation ? '<span title="Approximate Location" class="text-xs bg-amber-100 text-amber-800 px-1 rounded border border-amber-200">Approx</span>' : ''}
            </h3>
            <p class="text-slate-500">${p.location}</p>
            ${isMyPartner ? '<p class="text-purple-600 font-bold text-xs mt-1">Partnership Active</p>' : ''}
            ${(p.isSpeciesPublic && p.speciesIds.length > 0) ? `<p class="text-emerald-600 font-medium mt-1">Has ${p.speciesIds.length} species</p>` : ''}
            <button id="view-profile-${p.id}" class="mt-2 w-full bg-slate-800 text-white px-2 py-1 rounded text-xs font-medium hover:bg-slate-700">View Profile</button>
          </div>
      `;
      
      // Add event listener to button after popup opens
      marker.bindPopup(popupContent);
      marker.on('popupopen', () => {
         const btn = document.getElementById(`view-profile-${p.id}`);
         if(btn) {
            btn.onclick = () => setSelectedPartnerForSummary(p);
         }
      });
      
      marker.addTo(map);
      markersRef.current.push(marker);
    });

    // Only fit bounds if we have search results and aren't just starting up
    if (searchQuery && markersRef.current.length > 0) {
       const group = new L.featureGroup(markersRef.current);
       map.fitBounds(group.getBounds().pad(0.1));
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
      setSending(false);
      setShowContactModal(false);
      setContactPartner(null);
    }, 1000);
  };
  
  const handleGenerateInvite = () => {
     const code = generatePartnerInvite();
     setInviteCode(code);
  };
  
  const handleRedeemInvite = () => {
     if(!inputCode) return;
     const result = redeemPartnerInvite(inputCode);
     setRedeemResult(result);
     if(result.success) {
        setPartnerships(getPartnerships());
        setInputCode('');
     }
     setTimeout(() => setRedeemResult(null), 5000);
  };

  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        if (leafletMap.current) {
          leafletMap.current.setView([latitude, longitude], 12);
          L.popup()
            .setLatLng([latitude, longitude])
            .setContent("📍 You are here")
            .openOn(leafletMap.current);
        }
      },
      (error) => {
        alert("Unable to retrieve your location.");
      }
    );
  };
  
  // Demo Mode Logic
  const session = getSession();
  const isSuperAdmin = session?.role === UserRole.SUPER_ADMIN || (session?.role as string) === 'Super Admin';
  const isDemoOrg = myOrg?.id === 'org-1' && !isSuperAdmin;

  return (
    <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Partner Network</h2>
          <p className="text-slate-500">Discover other organizations and establish breeding partnerships.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto items-center">
          {/* Tab Switcher */}
          <div className="flex bg-slate-100 p-1 rounded-lg">
             <button 
               onClick={() => setViewMode('map')} 
               className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${viewMode === 'map' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}
             >
               Global Map
             </button>
             <button 
               onClick={() => setViewMode('partners')} 
               className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${viewMode === 'partners' ? 'bg-white shadow text-purple-700' : 'text-slate-500 hover:text-slate-900'}`}
             >
               My Partners
             </button>
          </div>

          {/* Filters (Only visible on Map) */}
          {viewMode === 'map' && (
             <>
               <div className="relative flex-1 min-w-[200px]">
                 <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                 <input 
                   type="text"
                   placeholder="Search..."
                   className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900 shadow-sm text-sm"
                   value={searchQuery}
                   onChange={(e) => setSearchQuery(e.target.value)}
                 />
               </div>
               <div className="flex items-center space-x-2 bg-white px-2 py-2 rounded-lg border border-slate-200 shadow-sm min-w-[150px]">
                  <Filter size={18} className="text-slate-400 ml-1" />
                  <select 
                    className="bg-transparent outline-none text-slate-700 text-sm font-medium w-full"
                    value={selectedSpeciesId}
                    onChange={(e) => setSelectedSpeciesId(e.target.value)}
                  >
                    <option value="">Any Species</option>
                    {speciesList.map(s => (
                      <option key={s.id} value={s.id}>Has {s.commonName}</option>
                    ))}
                  </select>
               </div>
             </>
          )}
        </div>
      </div>

      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative flex flex-col md:flex-row">
         
         {/* VIEW: MAP */}
         {viewMode === 'map' && (
            <>
               <div className="flex-1 relative z-0 h-full min-h-[400px]">
                  <div id="network-map" ref={mapRef} className="h-full w-full"></div>
                  <button 
                    onClick={handleLocateMe}
                    className="absolute bottom-6 right-6 z-[1000] bg-white p-3 rounded-full shadow-lg text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 transition-colors border border-slate-200"
                    title="Use My Current Location"
                  >
                    <Crosshair size={24} />
                  </button>
               </div>
               {/* List Sidebar (Desktop) */}
               <div className="w-full md:w-80 border-l border-slate-200 bg-slate-50 overflow-y-auto h-64 md:h-full">
                  <div className="p-4 border-b border-slate-200 bg-white sticky top-0">
                     <h3 className="font-bold text-slate-900">Organizations</h3>
                  </div>
                  <div className="divide-y divide-slate-100">
                     {filteredPartners.length === 0 ? (
                       <div className="p-8 text-center text-slate-400 text-sm">No public partners found.</div>
                     ) : (
                       filteredPartners.map(p => {
                         const isMyPartner = myPartners.some(mp => mp.id === p.id);
                         const displayName = p.hideName ? "Anonymous Partner" : p.name;
                         return (
                           <div key={p.id} className="p-4 hover:bg-white transition-colors cursor-pointer group">
                              <div className="flex justify-between items-start mb-1">
                                 <h4 className="font-bold text-slate-900 group-hover:text-emerald-700 transition-colors flex items-center gap-1">
                                    {displayName}
                                    {p.obscureLocation && <EyeOff size={12} className="text-slate-400" />}
                                 </h4>
                                 {isMyPartner && (
                                   <span title="Partner">
                                     <Handshake size={14} className="text-purple-600" />
                                   </span>
                                 )}
                              </div>
                              <div className="flex items-center text-slate-500 text-xs mb-2">
                                <MapPin size={12} className="mr-1" /> {p.location}
                              </div>
                              {p.isSpeciesPublic && p.speciesIds.length > 0 ? (
                                <div className="flex flex-wrap gap-1 mb-2">
                                   {p.speciesIds.slice(0, 4).map(sid => {
                                      const sp = speciesList.find(s => s.id === sid);
                                      return sp ? <span key={sid} className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">{sp.commonName}</span> : null;
                                   })}
                                   {p.speciesIds.length > 4 && (
                                      <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">+{p.speciesIds.length - 4} more</span>
                                   )}
                                </div>
                              ) : (
                                <div className="text-[10px] text-slate-400 italic mb-2">Species list private</div>
                              )}
                              <div className="flex gap-2 mt-2">
                                 <button 
                                    onClick={() => setSelectedPartnerForSummary(p)}
                                    className="flex-1 bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs py-1.5 rounded font-medium flex items-center justify-center gap-1 transition-colors"
                                 >
                                    <Eye size={12} /> View Profile
                                 </button>
                                 {p.allowBreedingRequests && (
                                    <button 
                                       onClick={(e) => { e.stopPropagation(); handleOpenContact(p); }}
                                       className={`flex-1 text-purple-700 border border-purple-100 text-xs py-1.5 rounded font-medium flex items-center justify-center gap-1 transition-colors ${isDemoOrg ? 'bg-slate-50 text-slate-400 cursor-not-allowed border-slate-200' : 'bg-purple-50 hover:bg-purple-100'}`}
                                       disabled={isDemoOrg}
                                       title={isDemoOrg ? "Contact disabled in Demo Mode" : "Contact Partner"}
                                    >
                                       <Send size={12} /> Contact
                                    </button>
                                 )}
                              </div>
                           </div>
                         );
                       })
                     )}
                  </div>
               </div>
            </>
         )}

         {/* VIEW: MY PARTNERS */}
         {viewMode === 'partners' && (
            <div className="flex-1 p-6 overflow-y-auto">
               <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Connect Card */}
                  <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-xl p-6 text-white shadow-lg flex flex-col justify-between">
                     <div>
                        <h3 className="text-xl font-bold mb-2">Connect New Partner</h3>
                        <p className="text-emerald-100 text-sm mb-4">Share your invite code or enter a code from another organization to establish a breeding partnership.</p>
                        
                        <div className="bg-white/10 p-4 rounded-lg backdrop-blur-sm border border-white/20 mb-4">
                           <p className="text-xs text-emerald-200 uppercase font-bold tracking-wider mb-1">Your Invite Code</p>
                           <div className="flex items-center justify-between">
                              <span className="font-mono text-xl font-bold tracking-widest">{inviteCode || '••••-••••'}</span>
                              <button onClick={handleGenerateInvite} className="p-2 hover:bg-white/20 rounded-lg transition-colors" title="Generate New Code">
                                 <Plus size={20} />
                              </button>
                           </div>
                        </div>

                        <div className="bg-white/10 p-4 rounded-lg backdrop-blur-sm border border-white/20">
                           <p className="text-xs text-emerald-200 uppercase font-bold tracking-wider mb-1">Redeem Code</p>
                           <div className="flex gap-2">
                              <input 
                                 className="flex-1 bg-white/20 border-none rounded px-3 py-2 text-white placeholder:text-emerald-200/50 outline-none focus:ring-2 focus:ring-white"
                                 placeholder="Enter code..."
                                 value={inputCode}
                                 onChange={(e) => setInputCode(e.target.value)}
                              />
                              <button 
                                 onClick={handleRedeemInvite}
                                 disabled={!inputCode}
                                 className="bg-white text-emerald-700 px-4 py-2 rounded font-bold hover:bg-emerald-50 disabled:opacity-50"
                              >
                                 Connect
                              </button>
                           </div>
                           {redeemResult && (
                              <p className={`text-xs mt-2 font-medium ${redeemResult.success ? 'text-emerald-100' : 'text-red-200'}`}>
                                 {redeemResult.message}
                              </p>
                           )}
                        </div>
                     </div>
                  </div>

                  {/* Partner List */}
                  {myPartners.length === 0 ? (
                     <div className="lg:col-span-2 flex items-center justify-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 text-slate-400 min-h-[300px]">
                        <div className="text-center">
                           <Handshake size={48} className="mx-auto mb-3 opacity-50" />
                           <p>No partnerships established yet.</p>
                        </div>
                     </div>
                  ) : (
                     myPartners.map(p => {
                        const partnership = partnerships.find(rel => 
                           (rel.orgId1 === myOrg?.id && rel.orgId2 === p.id) || 
                           (rel.orgId1 === p.id && rel.orgId2 === myOrg?.id)
                        );
                        return (
                           <div key={p.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 hover:shadow-md transition-shadow relative group">
                              <div className="flex justify-between items-start mb-4">
                                 <div>
                                    <h3 className="font-bold text-lg text-slate-900">{p.name}</h3>
                                    <p className="text-slate-500 text-sm flex items-center gap-1"><MapPin size={14}/> {p.location}</p>
                                 </div>
                                 <div className="bg-purple-100 text-purple-700 p-2 rounded-lg">
                                    <Handshake size={20} />
                                 </div>
                              </div>
                              
                              <div className="space-y-3 mb-6">
                                 <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Connected Since</span>
                                    <span className="font-medium text-slate-900">{partnership?.establishedDate}</span>
                                 </div>
                                 <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Shared Species</span>
                                    <span className="font-medium text-slate-900">{p.speciesIds.length}</span>
                                 </div>
                              </div>

                              <div className="flex gap-2">
                                 <button 
                                    onClick={() => setSelectedPartnerForSummary(p)}
                                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-lg font-medium text-sm transition-colors"
                                 >
                                    View Details
                                 </button>
                                 <button 
                                    onClick={() => handleOpenContact(p)}
                                    className={`flex-1 border border-purple-200 text-purple-700 py-2 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2 ${isDemoOrg ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed' : 'hover:bg-purple-50'}`}
                                    disabled={isDemoOrg}
                                    title={isDemoOrg ? "Disabled in Demo Mode" : "Send Message"}
                                 >
                                    <MessageSquare size={16} /> Message
                                 </button>
                              </div>
                           </div>
                        );
                     })
                  )}
               </div>
            </div>
         )}
      </div>

      {/* Contact Modal */}
      {showContactModal && contactPartner && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 animate-in zoom-in duration-200">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Contact {contactPartner.name}</h3>
            <p className="text-slate-500 text-sm mb-4">Send a secure message to request a breeding loan or share data.</p>
            
            <textarea 
              className="w-full h-40 p-4 border border-slate-300 rounded-lg resize-none outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
              placeholder="Type your message here..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            
            <div className="flex justify-end space-x-3 mt-4">
              <button 
                onClick={() => setShowContactModal(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button 
                onClick={handleSendRequest}
                disabled={!message || sending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-bold transition-colors flex items-center space-x-2 disabled:opacity-50"
              >
                {sending ? 'Sending...' : <><Send size={18} /> <span>Send Request</span></>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Partner Summary Modal */}
      {selectedPartnerForSummary && (
         <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
               {/* Header */}
               <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50">
                  <div>
                     <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Building2 className="text-slate-400"/> {selectedPartnerForSummary.name}
                     </h2>
                     <p className="text-slate-500 flex items-center gap-1 mt-1">
                        <MapPin size={14}/> {selectedPartnerForSummary.location}
                        {selectedPartnerForSummary.obscureLocation && <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded ml-2">Approximate Location</span>}
                     </p>
                  </div>
                  <button onClick={() => setSelectedPartnerForSummary(null)} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors">
                     <X size={24} />
                  </button>
               </div>

               {/* Tabs */}
               <div className="flex border-b border-slate-200 px-6">
                  <button 
                     onClick={() => setSummaryTab('population')}
                     className={`py-3 px-4 text-sm font-bold border-b-2 transition-colors ${summaryTab === 'population' ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  >
                     Species & Population
                  </button>
                  <button 
                     onClick={() => setSummaryTab('individuals')}
                     className={`py-3 px-4 text-sm font-bold border-b-2 transition-colors ${summaryTab === 'individuals' ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  >
                     Individual Browser
                  </button>
               </div>

               {/* Content */}
               <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                  {summaryTab === 'population' && (
                     <div className="grid gap-4">
                        {selectedPartnerForSummary.isSpeciesPublic ? (
                           selectedPartnerForSummary.speciesIds.length > 0 ? (
                              selectedPartnerForSummary.speciesIds.map(sid => {
                                 const sp = speciesList.find(s => s.id === sid);
                                 const counts = selectedPartnerForSummary.populationCounts?.[sid] || "Unknown";
                                 if(!sp) return null;
                                 return (
                                    <div key={sid} className="bg-white p-4 rounded-lg border border-slate-200 flex justify-between items-center shadow-sm">
                                       <div className="flex items-center gap-3">
                                          <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold">
                                             {sp.commonName.charAt(0)}
                                          </div>
                                          <div>
                                             <h4 className="font-bold text-slate-900">{sp.commonName}</h4>
                                             <p className="text-xs text-slate-500 italic">{sp.scientificName}</p>
                                          </div>
                                       </div>
                                       <div className="text-right">
                                          <p className="text-xs text-slate-400 uppercase tracking-wider font-bold">Population (M.F.U)</p>
                                          <p className="text-lg font-mono font-bold text-slate-700">{counts}</p>
                                       </div>
                                    </div>
                                 );
                              })
                           ) : (
                              <p className="text-center text-slate-500 py-8">No species listed.</p>
                           )
                        ) : (
                           <div className="text-center py-12 bg-slate-100 rounded-xl border border-dashed border-slate-300">
                              <Lock className="mx-auto text-slate-400 mb-2" size={32} />
                              <p className="text-slate-600 font-medium">Species List is Private</p>
                              <p className="text-sm text-slate-400">Request a partnership to view details.</p>
                           </div>
                        )}
                     </div>
                  )}

                  {summaryTab === 'individuals' && (
                     <div>
                        {!selectedPartnerForSummary.isSpeciesPublic ? (
                           <div className="text-center py-12 bg-slate-100 rounded-xl border border-dashed border-slate-300">
                              <Lock className="mx-auto text-slate-400 mb-2" size={32} />
                              <p className="text-slate-600 font-medium">Access Restricted</p>
                           </div>
                        ) : (
                           <div className="space-y-6">
                              {selectedPartnerForSummary.speciesIds.map(sid => {
                                 const sp = speciesList.find(s => s.id === sid);
                                 if(!sp) return null;
                                 const mockInds = generateMockPartnerIndividuals(sid, selectedPartnerForSummary.populationCounts?.[sid] || "0.0.0");
                                 
                                 return (
                                    <div key={sid}>
                                       <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                                          <Dna size={16} className="text-emerald-500"/> {sp.commonName}
                                       </h4>
                                       <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                          {mockInds.map(ind => (
                                             <div key={ind.id} className="bg-white p-3 rounded border border-slate-200 flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${ind.sex === Sex.MALE ? 'bg-blue-100 text-blue-700' : ind.sex === Sex.FEMALE ? 'bg-pink-100 text-pink-700' : 'bg-slate-100 text-slate-600'}`}>
                                                   {ind.sex.charAt(0)}
                                                </div>
                                                <div>
                                                   <p className="text-sm font-bold text-slate-900">{ind.name}</p>
                                                   <p className="text-xs text-slate-500">{ind.age} years old</p>
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
               
               <div className="p-4 border-t border-slate-200 bg-white flex justify-end gap-3">
                  <button onClick={() => setSelectedPartnerForSummary(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Close</button>
                  {selectedPartnerForSummary.allowBreedingRequests && (
                     <button 
                        onClick={() => { setSelectedPartnerForSummary(null); handleOpenContact(selectedPartnerForSummary); }}
                        className={`bg-purple-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-purple-700 shadow-sm flex items-center gap-2 ${isDemoOrg ? 'opacity-50 cursor-not-allowed' : ''}`}
                        disabled={isDemoOrg}
                     >
                        <MessageSquare size={18} /> Contact for Loan
                     </button>
                  )}
               </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default Network;
