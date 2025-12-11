
import React, { useEffect, useRef, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { getIndividuals, getSpecies, getOrg } from '../services/storage';
import { Individual, Species, Organization } from '../types';
import { MapPin, ArrowLeft, Maximize2, X, Crosshair } from 'lucide-react';
import { LanguageContext } from '../App';

declare const L: any; // Leaflet global

const PlantMap: React.FC<{ currentProjectId: string }> = ({ currentProjectId }) => {
  const { t } = useContext(LanguageContext);
  const navigate = useNavigate();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null); // LayerGroup for markers

  const [selectedInd, setSelectedInd] = useState<Individual | null>(null);
  const [selectedSpecies, setSelectedSpecies] = useState<Species | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  // 1. Initialize Map Instance (Once)
  useEffect(() => {
    if (mapContainerRef.current && !mapInstanceRef.current) {
       const currentOrg = getOrg();
       
       // Determine initial center: Org Location -> Default World
       const initialLat = currentOrg.latitude || 0;
       const initialLng = currentOrg.longitude || 0;
       const initialZoom = (currentOrg.latitude && currentOrg.longitude) ? 15 : 2;

       const map = L.map(mapContainerRef.current, {
          zoomControl: false 
       }).setView([initialLat, initialLng], initialZoom);
       
       L.control.zoom({ position: 'topright' }).addTo(map);

       L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19
       }).addTo(map);

       // Create a LayerGroup for markers so we can clear them easily later
       const markersLayer = L.layerGroup().addTo(map);
       markersLayerRef.current = markersLayer;
       mapInstanceRef.current = map;

       // If no Org location, try geolocation automatically once
       if (!currentOrg.latitude || !currentOrg.longitude) {
          if (navigator.geolocation) {
             navigator.geolocation.getCurrentPosition((pos) => {
                // Only fly to user if we haven't already plotted data (which might be elsewhere)
                // For now, we just set view if we are still at world view
                if (map.getZoom() < 5) {
                   map.invalidateSize();
                   map.setView([pos.coords.latitude, pos.coords.longitude], 15);
                }
             }, (err) => {
                console.warn("Geolocation failed or denied", err);
             });
          }
       }

       // Fix for "Gray Map" - invalidate size after a short delay to allow flex layout to settle
       setTimeout(() => {
          map.invalidateSize();
       }, 200);
    }

    // Cleanup on unmount
    return () => {
       if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
          markersLayerRef.current = null;
       }
    };
  }, []);

  // 2. Update Markers when Project or Data Changes
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;

    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;

    // Clear existing markers
    markersLayer.clearLayers();

    const allInds = getIndividuals();
    const allSpecies = getSpecies();
    const currentOrg = getOrg();

    // 2a. Add Organization Marker (Headquarters)
    if (currentOrg.latitude && currentOrg.longitude) {
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

    // 2b. Filter Plants for Current Project
    const mappedPlants = allInds.filter(i => 
       i.projectId === currentProjectId && 
       i.latitude && 
       i.longitude
    );

    const plantIcon = L.divIcon({
       className: 'custom-div-icon',
       html: `<div style="background-color: #16a34a; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"></div>`,
       iconSize: [14, 14],
       iconAnchor: [7, 7]
    });

    const leafletMarkers: any[] = [];

    mappedPlants.forEach(plant => {
       if (!plant.latitude || !plant.longitude) return;
       const sp = allSpecies.find(s => s.id === plant.speciesId);
       
       const marker = L.marker([plant.latitude, plant.longitude], { icon: plantIcon });
       
       // Click Handler
       marker.on('click', () => {
          setSelectedInd(plant);
          setSelectedSpecies(sp || null);
          
          // Fly to marker, slightly offset to account for sidebar
          map.invalidateSize();
          map.flyTo([plant.latitude, plant.longitude], 18, {
             animate: true,
             duration: 1.5
          });
       });
       
       marker.addTo(markersLayer);
       leafletMarkers.push(marker);
    });

    // 2c. Fit Bounds ONLY if we have data. 
    // If we have data, we prioritize seeing the data over the org location.
    // Force a resize calculation first to avoid fitting to a 0x0 container
    map.invalidateSize();

    if (leafletMarkers.length > 0) {
       const group = L.featureGroup(leafletMarkers);
       map.fitBounds(group.getBounds().pad(0.2));
    } else if (currentOrg.latitude && currentOrg.longitude) {
       // If no data, ensure we are at org location
       map.setView([currentOrg.latitude, currentOrg.longitude], 15);
    }

  }, [currentProjectId]); // Re-run whenever the project ID changes

  const handleLocateMe = () => {
     if (!mapInstanceRef.current) return;
     setIsLocating(true);
     
     if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
           const map = mapInstanceRef.current;
           map.invalidateSize();
           map.flyTo([pos.coords.latitude, pos.coords.longitude], 16, {
              animate: true,
              duration: 1.5
           });
           
           // Add a temporary "You" marker
           L.popup()
             .setLatLng([pos.coords.latitude, pos.coords.longitude])
             .setContent("📍 You are here")
             .openOn(map);
             
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
       
       {/* Manual Locate Button */}
       <button 
          onClick={handleLocateMe}
          className="absolute bottom-6 right-6 z-[1000] bg-white p-3 rounded-full shadow-lg text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 transition-colors border border-slate-200"
          title="Locate Me"
       >
          <Crosshair size={24} className={isLocating ? 'animate-spin' : ''} />
       </button>

       {/* Plant Detail Slide-over */}
       {selectedInd && (
          <div className="absolute right-4 top-4 bottom-4 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 z-[1000] flex flex-col overflow-hidden animate-in slide-in-from-right-10 duration-300">
             <div className="relative h-48 bg-slate-100">
                {selectedInd.imageUrl ? (
                   <img src={selectedInd.imageUrl} className="w-full h-full object-cover" alt={selectedInd.name} />
                ) : (
                   <div className="w-full h-full flex items-center justify-center text-slate-400">No Image</div>
                )}
                <button 
                   onClick={() => setSelectedInd(null)}
                   className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full hover:bg-black/70 transition-colors"
                >
                   <X size={16} />
                </button>
             </div>
             
             <div className="p-5 flex-1 overflow-y-auto">
                <h3 className="text-xl font-bold text-slate-900 mb-1">{selectedInd.name}</h3>
                <p className="text-sm text-slate-500 font-mono mb-3">{selectedInd.studbookId}</p>
                
                <div className="space-y-3 text-sm">
                   <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100">
                      <span className="text-xs font-bold text-emerald-800 uppercase block mb-1">Species</span>
                      <p className="font-medium text-emerald-900">{selectedSpecies?.commonName}</p>
                      <p className="text-xs text-emerald-700 italic">{selectedSpecies?.scientificName}</p>
                   </div>
                   
                   <div className="grid grid-cols-2 gap-2">
                      <div className="bg-slate-50 p-2 rounded border border-slate-100">
                         <span className="text-xs text-slate-500 block">Status</span>
                         <span className="font-medium text-slate-900">{selectedInd.isDeceased ? 'Removed' : 'Active'}</span>
                      </div>
                      <div className="bg-slate-50 p-2 rounded border border-slate-100">
                         <span className="text-xs text-slate-500 block">Planted</span>
                         <span className="font-medium text-slate-900">{selectedInd.birthDate || 'Unknown'}</span>
                      </div>
                   </div>

                   <div className="flex items-center gap-2 text-slate-500 text-xs">
                      <MapPin size={12} />
                      {selectedInd.latitude?.toFixed(5)}, {selectedInd.longitude?.toFixed(5)}
                   </div>
                </div>
             </div>

             <div className="p-4 border-t border-slate-100 bg-slate-50">
                <button 
                   onClick={() => navigate(`/individuals/${selectedInd.id}`)}
                   className="w-full bg-emerald-600 text-white py-2 rounded-lg font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                >
                   <Maximize2 size={16} /> View Full Details
                </button>
             </div>
          </div>
       )}
    </div>
  );
};

export default PlantMap;