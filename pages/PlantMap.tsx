import React, { useEffect, useRef, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { getIndividuals, getSpecies, getOrg } from '../services/storage';
import { Individual, Species, Organization } from '../types';
// Fixed: Added PawPrint to imports
import { MapPin, ArrowLeft, Maximize2, X, Crosshair, Type as TypeIcon, Calendar, Weight, Info, Users, Briefcase, Archive, PawPrint } from 'lucide-react';
import { LanguageContext } from '../App';

declare const L: any; // Leaflet global

const PlantMap: React.FC<{ currentProjectId: string }> = ({ currentProjectId }) => {
  const { t } = useContext(LanguageContext);
  const navigate = useNavigate();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null); 
  const userMarkerRef = useRef<any>(null);

  const [selectedInd, setSelectedInd] = useState<Individual | null>(null);
  const [selectedSpecies, setSelectedSpecies] = useState<Species | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [userCoords, setUserCoords] = useState<{lat: number, lng: number} | null>(null);

  // 1. Initialize Map Instance (Once)
  useEffect(() => {
    if (mapContainerRef.current && !mapInstanceRef.current) {
       const currentOrg = getOrg();
       const initialLat = (typeof currentOrg.latitude === 'number') ? currentOrg.latitude : 0;
       const initialLng = (typeof currentOrg.longitude === 'number') ? currentOrg.longitude : 0;
       const initialZoom = (typeof currentOrg.latitude === 'number' && typeof currentOrg.longitude === 'number') ? 15 : 2;

       const map = L.map(mapContainerRef.current, {
          zoomControl: false,
          maxZoom: 20 // Set maxZoom to 20 on the map instance
       }).setView([initialLat, initialLng], initialZoom);
       
       L.control.zoom({ position: 'topright' }).addTo(map);
       L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 20, // Allow map to request zoom 20
          maxNativeZoom: 19 // Tiles only exist natively up to 19, so stretched for 20
       }).addTo(map);

       const markersLayer = L.layerGroup().addTo(map);
       markersLayerRef.current = markersLayer;
       mapInstanceRef.current = map;

       setTimeout(() => map.invalidateSize(), 200);

       // Start watching user location
       if (navigator.geolocation) {
         navigator.geolocation.watchPosition(
           (pos) => setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
           (err) => console.warn("Watch failed", err),
           { enableHighAccuracy: true }
         );
       }
    }

    return () => {
       if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
          markersLayerRef.current = null;
       }
    };
  }, []);

  // 2. Update Markers when Project, Data, or Label Setting Changes
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;

    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    markersLayer.clearLayers();

    const allInds = getIndividuals();
    const allSpecies = getSpecies();
    const currentOrg = getOrg();

    // Show User Location
    if (userCoords) {
      const userIcon = L.divIcon({
        className: 'user-location-marker',
        html: `<div style="background-color: #3b82f6; width: 18px; height: 18px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.3);"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      });
      if (userMarkerRef.current) map.removeLayer(userMarkerRef.current);
      userMarkerRef.current = L.marker([userCoords.lat, userCoords.lng], { icon: userIcon, zIndexOffset: 2000 })
        .addTo(map)
        .bindTooltip("You are here", { direction: 'top', offset: [0, -10] });
    }

    // Show Organization Base
    if (typeof currentOrg.latitude === 'number' && typeof currentOrg.longitude === 'number') {
       const orgIcon = L.divIcon({
          className: 'custom-div-icon',
          html: `<div style="background-color: #3b82f6; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 3px 6px rgba(0,0,0,0.3);"></div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
          popupAnchor: [0, -10]
       });
       L.marker([currentOrg.latitude, currentOrg.longitude], { icon: orgIcon, zIndexOffset: 1000 })
          .addTo(markersLayer)
          .bindPopup(`<b>${currentOrg.name}</b><br>Headquarters`);
    }

    const mappedInds = allInds.filter(i => 
       i.projectId === currentProjectId && 
       typeof i.latitude === 'number' && 
       typeof i.longitude === 'number'
    );

    const mappedPinIcon = L.divIcon({
       className: 'custom-div-icon',
       html: `<div style="background-color: #16a34a; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"></div>`,
       iconSize: [14, 14],
       iconAnchor: [7, 7]
    });

    const leafletMarkers: any[] = [];

    mappedInds.forEach(plant => {
       if (typeof plant.latitude !== 'number' || typeof plant.longitude !== 'number') return;
       const sp = allSpecies.find(s => s.id === plant.speciesId);
       const marker = L.marker([plant.latitude, plant.longitude], { icon: mappedPinIcon });
       
       if (showLabels) {
          marker.bindTooltip(sp?.commonName || plant.name, {
             permanent: true,
             direction: 'right',
             className: 'bg-white/90 border-none shadow-sm px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-700 cursor-pointer',
             interactive: true
          });
       }

       const handleSelect = () => {
          setSelectedInd(plant);
          setSelectedSpecies(sp || null);
          map.flyTo([plant.latitude, plant.longitude], 19, { animate: true, duration: 1.5 }); // flyTo slightly deeper zoom
       };

       marker.on('click', handleSelect);
       marker.on('tooltipclick', handleSelect);
       
       marker.addTo(markersLayer);
       leafletMarkers.push(marker);
    });

    if (leafletMarkers.length > 0) {
       try {
          const group = L.featureGroup(leafletMarkers);
          const bounds = group.getBounds();
          if (bounds.isValid()) map.fitBounds(bounds.pad(0.2));
       } catch (err) {
          console.warn("FitBounds failed on Map", err);
       }
    }
  }, [currentProjectId, showLabels, userCoords]); 

  const handleLocateMe = () => {
     if (!mapInstanceRef.current) return;
     setIsLocating(true);
     if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
           const map = mapInstanceRef.current;
           map.flyTo([pos.coords.latitude, pos.coords.longitude], 16, { animate: true, duration: 1.5 });
           L.popup().setLatLng([pos.coords.latitude, pos.coords.longitude]).setContent("📍 You are here").openOn(map);
           setIsLocating(false);
        }, (err) => {
           alert("Could not retrieve location.");
           setIsLocating(false);
        });
     } else {
        alert("Geolocation not supported.");
        setIsLocating(false);
     }
  };

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col relative bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
       <div className="absolute top-4 left-4 z-[1000] bg-white p-2 rounded-lg shadow-md border border-slate-200 flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-1 hover:bg-slate-100 rounded-full transition-colors text-slate-600">
             <ArrowLeft size={20} />
          </button>
          <h2 className="font-bold text-slate-900 pr-2">{t('plantMap')}</h2>
       </div>

       <div ref={mapContainerRef} className="w-full h-full z-0" />
       
       <div className="absolute bottom-6 right-6 z-[1000] flex flex-col gap-3">
          <button 
             onClick={() => setShowLabels(!showLabels)} 
             className={`p-3 rounded-full shadow-lg border transition-all ${showLabels ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
             title={showLabels ? "Hide Labels" : "Show Labels"}
          >
             <TypeIcon size={24} />
          </button>
          <button 
             onClick={handleLocateMe}
             className="bg-white p-3 rounded-full shadow-lg text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 transition-colors border border-slate-200"
             title="Locate Me"
          >
             <Crosshair size={24} className={isLocating ? 'animate-spin' : ''} />
          </button>
       </div>

       {selectedInd && (
          <div className="absolute right-4 top-4 bottom-4 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 z-[1000] flex flex-col overflow-hidden animate-in slide-in-from-right-10 duration-300">
             <div className="relative h-44 bg-slate-100">
                {(() => {
                  const displayImg = selectedInd.imageUrl || selectedSpecies?.imageUrl;
                  return displayImg && !displayImg.startsWith('data:image/svg+xml') ? (
                    <img src={displayImg} className="w-full h-full object-cover" alt={selectedInd.name} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400 bg-slate-100 flex-col gap-2">
                       <PawPrint size={40} className="opacity-20" />
                       <span className="text-[10px] font-bold tracking-widest uppercase">No Image</span>
                    </div>
                  );
                })()}
                <button onClick={() => setSelectedInd(null)} className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full hover:bg-black/70 transition-colors z-10"><X size={16} /></button>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
                  <h3 className="font-bold text-white text-lg drop-shadow-sm">{selectedInd.name}</h3>
                  <p className="text-[10px] text-white/80 font-mono tracking-widest">{selectedInd.studbookId}</p>
                </div>
             </div>
             
             <div className="p-5 flex-1 overflow-y-auto space-y-5">
                <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100">
                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest block mb-1">Species</span>
                  <p className="font-bold text-slate-900">{selectedSpecies?.commonName}</p>
                  <p className="text-xs text-emerald-700 italic">{selectedSpecies?.scientificName}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1"><Users size={10}/> Sex / Class</span>
                      <p className="text-sm font-bold text-slate-800">{selectedInd.sex || 'Unknown'}</p>
                   </div>
                   <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1"><Calendar size={10}/> {selectedSpecies?.type === 'Plant' ? 'Planted' : 'Born'}</span>
                      <p className="text-sm font-bold text-slate-800">{selectedInd.birthDate || 'Unknown'}</p>
                   </div>
                   <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1"><Archive size={10}/> Source</span>
                      <p className="text-sm font-bold text-slate-800 truncate">{selectedInd.source || 'Unknown'}</p>
                   </div>
                   <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1"><Info size={10}/> Status</span>
                      <p className={`text-sm font-bold ${selectedInd.isDeceased ? 'text-red-600' : 'text-emerald-600'}`}>{selectedInd.isDeceased ? 'Dead' : 'Active'}</p>
                   </div>
                </div>

                <div className="pt-4 border-t border-slate-100">
                   <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Geo-Coordinates</span>
                   <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-200">
                      <MapPin size={14} className="text-blue-500" />
                      <span>{selectedInd.latitude?.toFixed(5)}, {selectedInd.longitude?.toFixed(5)}</span>
                   </div>
                </div>

                {selectedInd.notes && (
                  <div className="pt-4 border-t border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Notes</span>
                    <p className="text-xs text-slate-600 italic leading-relaxed">"{selectedInd.notes}"</p>
                  </div>
                )}
             </div>

             <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2">
                <button onClick={() => navigate(`/individuals/${selectedInd.id}`)} className="w-full bg-emerald-600 text-white py-2 rounded-lg font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 shadow-md"><Maximize2 size={16} /> View Full File</button>
             </div>
          </div>
       )}
    </div>
  );
};

export default PlantMap;