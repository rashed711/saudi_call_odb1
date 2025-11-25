
import React, { useState, useEffect, useRef } from 'react';
import { getAllLocationsForMap, saveODBLocation, getSiteSettings, getNearbyLocationsAPI } from '../services/mockBackend';
import { ODBLocation, User, SiteSettings } from '../types';
import { Icons } from './Icons';
import { LocationModal } from './LocationModal';
import { CopyableText } from './CopyableText';

interface MapFilterProps {
  user: User;
}

// Extend ODBLocation locally to include distance for sorting
interface LocationWithDistance extends ODBLocation {
    distance?: number;
}

const MapFilter: React.FC<MapFilterProps> = ({ user }) => {
  const mapRef = useRef<any>(null);
  const rectangleRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null); // Layer group for markers

  const [allLocations, setAllLocations] = useState<LocationWithDistance[]>([]);
  const [filteredLocations, setFilteredLocations] = useState<LocationWithDistance[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDrawing, setIsDrawing] = useState(false);
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [viewMode, setViewMode] = useState<'nearest' | 'area'>('nearest');
  
  // Settings State
  const [settings, setSettings] = useState<SiteSettings | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'view' | 'edit'>('view');
  const [selectedLocation, setSelectedLocation] = useState<Partial<ODBLocation>>({});

  useEffect(() => {
    initMap();
    initializeData();

    return () => {
        if (mapRef.current) {
            mapRef.current.remove();
            mapRef.current = null;
        }
    };
  }, []);

  // Initialize Map
  const initMap = () => {
      // @ts-ignore
      if (!window.L) return;
      // @ts-ignore
      const L = window.L;

      if (mapRef.current) return;

      // 1. Initialize Map with Mobile Optimizations
      const map = L.map('map-container', { 
          zoomControl: false,
          tap: false, // Fix for some touch devices
          preferCanvas: true // Use Canvas rendering for better performance with many markers
      }).setView([26.8206, 30.8025], 6); 
      
      // 2. Use CartoDB Voyager Tiles (Much faster & Mobile friendly than OSM default)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: 'abcd',
          maxZoom: 20,
          // Performance settings
          updateWhenIdle: false, // Load tiles while panning (smoother visual)
          keepBuffer: 10,        // Keep 10 screens worth of tiles in memory (prevents grey areas on pan)
          edgeBufferTiles: 2     // Load tiles slightly outside viewport
      }).addTo(map);

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // Create a FeatureGroup for markers to easily clear them
      markersLayerRef.current = L.featureGroup().addTo(map);

      mapRef.current = map;

      // 3. Fix: Invalid Size Issue (Grey Map)
      // Force map to recalculate size after render to ensure full coverage
      setTimeout(() => {
          map.invalidateSize();
      }, 200);

      // Drawing Logic
      let startLatLng: any = null;
      let currentRect: any = null;

      map.on('mousedown', (e: any) => {
          if (!map.isDrawingEnabled) return;
          map.dragging.disable();
          startLatLng = e.latlng;
          
          if (rectangleRef.current) {
              map.removeLayer(rectangleRef.current);
          }
          
          currentRect = L.rectangle([startLatLng, startLatLng], {color: "#ef4444", weight: 2, dashArray: '5, 5'}).addTo(map);
          rectangleRef.current = currentRect;
      });

      map.on('mousemove', (e: any) => {
          if (!startLatLng || !currentRect) return;
          currentRect.setBounds([startLatLng, e.latlng]);
      });

      map.on('mouseup', (e: any) => {
          if (!startLatLng) return;
          map.dragging.enable();
          
          const b = currentRect.getBounds();
          filterByBounds(b);

          startLatLng = null;
          currentRect = null;
          setIsDrawing(false);
          map.isDrawingEnabled = false;
          map.getContainer().style.cursor = '';
          setViewMode('area'); // Switch mode to Area
      });
      
      // Handle Window Resize (Mobile keyboard / Address bar)
      window.addEventListener('resize', () => {
          if(mapRef.current) mapRef.current.invalidateSize();
      });
  };

  const initializeData = async () => {
      setLoading(true);
      try {
          // 1. Fetch Settings & General Data
          const currentSettings = await getSiteSettings();
          setSettings(currentSettings);

          // Get the general pool of data (e.g. recent 500) to support map browsing
          const generalData = await getAllLocationsForMap();
          
          // 2. Try to get User Location & Specific Nearby Data
          if (navigator.geolocation) {
              navigator.geolocation.getCurrentPosition(
                  async (position) => {
                      const { latitude, longitude } = position.coords;
                      
                      const limit = currentSettings.maxResults || 20;
                      // Pass searchRadius if set, otherwise 0 for "nearest whatever distance"
                      const nearbyData = await getNearbyLocationsAPI(
                          latitude, 
                          longitude, 
                          currentSettings.searchRadius, 
                          limit
                      );

                      // Merge General + Nearby (Deduplicate by ID)
                      const combinedMap = new Map();
                      generalData.forEach(item => combinedMap.set(item.id, item));
                      nearbyData.forEach(item => combinedMap.set(item.id, item)); // Nearby overwrites (ensures presence)
                      
                      const mergedData = Array.from(combinedMap.values()) as LocationWithDistance[];

                      handleLocationFound(latitude, longitude, mergedData, currentSettings);
                  },
                  (error) => {
                      console.warn("Location access denied or error:", error);
                      // Fallback: Use only general data
                      const limit = currentSettings.maxResults || 20;
                      setAllLocations(generalData);
                      setFilteredLocations(generalData.slice(0, limit));
                      renderMarkers(generalData.slice(0, limit));
                  },
                  { enableHighAccuracy: true, timeout: 10000 }
              );
          } else {
              const limit = currentSettings.maxResults || 20;
              setAllLocations(generalData);
              setFilteredLocations(generalData.slice(0, limit));
              renderMarkers(generalData.slice(0, limit));
          }

      } catch (e) {
          console.error(e);
          setLoading(false);
      }
  };

  const handleLocationFound = (lat: number, lng: number, data: LocationWithDistance[], currentSettings: SiteSettings) => {
      setUserPos([lat, lng]);

      // Calculate Distances for ALL items relative to user
      const dataWithDist = data.map(loc => ({
          ...loc,
          distance: calcDistance(lat, lng, loc.LATITUDE, loc.LONGITUDE)
      }));
      setAllLocations(dataWithDist); // Update main list with distances

      // Apply Filter by Radius (if set)
      let accessiblePoints = dataWithDist;
      if (currentSettings.searchRadius > 0) {
          accessiblePoints = accessiblePoints.filter(d => d.distance! <= currentSettings.searchRadius);
      }

      // Sort by Distance
      accessiblePoints.sort((a, b) => (a.distance || 99999) - (b.distance || 99999));
      
      // Apply Max Results Limit
      const limit = currentSettings.maxResults || 20;
      const topResults = accessiblePoints.slice(0, limit);

      setFilteredLocations(topResults);
      setViewMode('nearest');
      setLoading(false);

      // Update Map
      // @ts-ignore
      const L = window.L;
      if (mapRef.current && L) {
          // Add User Marker (Pulse Animation)
          if (userMarkerRef.current) mapRef.current.removeLayer(userMarkerRef.current);
          
          const userIcon = L.divIcon({
              className: 'user-pulse-marker',
              html: `
                <div class="user-pulse-container">
                    <div class="user-pulse-ring"></div>
                    <div class="user-pulse-core"></div>
                </div>
              `,
              iconSize: [24, 24],
              iconAnchor: [12, 12]
          });

          userMarkerRef.current = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 1000 }).addTo(mapRef.current);
          
          // Fly to user
          mapRef.current.setView([lat, lng], 14);
          
          // Render result markers
          renderMarkers(topResults);
      }
  };

  const renderMarkers = (locs: LocationWithDistance[]) => {
      // @ts-ignore
      const L = window.L;
      if (!mapRef.current || !markersLayerRef.current) return;

      markersLayerRef.current.clearLayers();

      locs.forEach((loc, index) => {
          // Determine color based on index (Nearest is distinctive)
          const isNearest = index === 0;
          const colorClass = isNearest ? 'bg-green-600' : 'bg-primary';
          const iconHtml = `
            <div class="custom-pin-wrapper group">
                <div class="pin-shadow"></div>
                <div class="pin-body ${colorClass} group-hover:-translate-y-2 transition-transform duration-200">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="pin-icon"><circle cx="12" cy="10" r="3"/><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 6.9 8 11.7z"/></svg>
                </div>
            </div>
          `;

          const customIcon = L.divIcon({
              className: 'custom-map-pin',
              html: iconHtml,
              iconSize: [40, 40],
              iconAnchor: [20, 40], // Tip of the pin
              popupAnchor: [0, -40]
          });

          const marker = L.marker([loc.LATITUDE, loc.LONGITUDE], { icon: customIcon })
            .bindPopup(`<div style="text-align: center;"><b>${loc.CITYNAME}</b><br/><span style="color: #666; font-size: 10px; font-family: monospace;">${loc.ODB_ID}</span></div>`)
            .on('click', () => handleItemClick(loc));
          
          markersLayerRef.current.addLayer(marker);
      });
  };

  const filterByBounds = (bounds: any) => {
      const north = bounds.getNorth();
      const south = bounds.getSouth();
      const east = bounds.getEast();
      const west = bounds.getWest();

      // Ensure we use the latest allLocations (which might have distances)
      const filtered = allLocations.filter(loc => 
          loc.LATITUDE <= north &&
          loc.LATITUDE >= south &&
          loc.LONGITUDE <= east &&
          loc.LONGITUDE >= west
      );

      setFilteredLocations(filtered);
      renderMarkers(filtered);
      
      // Zoom to bounds
      mapRef.current.fitBounds(bounds);
  };

  const resetToNearest = () => {
      if (rectangleRef.current && mapRef.current) {
          mapRef.current.removeLayer(rectangleRef.current);
          rectangleRef.current = null;
      }

      if (userPos && settings) {
          handleLocationFound(userPos[0], userPos[1], allLocations, settings);
      } else {
          // Re-trigger location check
          initializeData();
      }
  };

  // Haversine Formula
  const calcDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371; 
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
  };

  const toggleDrawing = () => {
      if (!mapRef.current) return;
      const newState = !isDrawing;
      setIsDrawing(newState);
      mapRef.current.isDrawingEnabled = newState;
      mapRef.current.getContainer().style.cursor = newState ? 'crosshair' : '';
  };

  // --- Modal Handlers ---
  const handleItemClick = (loc: ODBLocation) => {
    setSelectedLocation(loc);
    setModalMode('view');
    setIsModalOpen(true);
  };

  const handleNavigate = (e: React.MouseEvent, loc: ODBLocation) => {
      e.stopPropagation();
      const url = `https://www.google.com/maps/dir/?api=1&destination=${loc.LATITUDE},${loc.LONGITUDE}&travelmode=driving`;
      window.open(url, '_blank');
  };

  const handleSave = async (data: ODBLocation) => {
      await saveODBLocation(data);
      setFilteredLocations(prev => prev.map(p => p.id === data.id ? {...p, ...data} : p));
      setAllLocations(prev => prev.map(p => p.id === data.id ? {...p, ...data} : p));
  };

  const handleSwitchToEdit = () => setModalMode('edit');

  const maxResults = settings?.maxResults || 20;

  // --- Render ---
  return (
    <div className="flex flex-col h-[calc(100vh-140px)] md:h-full space-y-3 relative">
        <style>{`
            /* User Location Pulse Animation */
            .user-pulse-container {
                position: relative;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .user-pulse-core {
                width: 14px;
                height: 14px;
                background-color: #2563eb;
                border: 2px solid white;
                border-radius: 50%;
                box-shadow: 0 0 5px rgba(0,0,0,0.3);
                position: absolute;
                z-index: 2;
            }
            .user-pulse-ring {
                position: absolute;
                width: 100%;
                height: 100%;
                border-radius: 50%;
                background-color: rgba(37, 99, 235, 0.4);
                animation: mapPulse 2s infinite;
                z-index: 1;
            }
            @keyframes mapPulse {
                0% { transform: scale(0.5); opacity: 0.8; }
                70% { transform: scale(1.5); opacity: 0; }
                100% { transform: scale(0.5); opacity: 0; }
            }

            /* Custom Pin Styles */
            .custom-pin-wrapper {
                position: relative;
                width: 40px;
                height: 40px;
                display: flex;
                flex-direction: column;
                align-items: center;
            }
            .pin-body {
                width: 32px;
                height: 32px;
                border-radius: 50% 50% 50% 0;
                transform: rotate(-45deg);
                display: flex;
                align-items: center;
                justify-content: center;
                border: 2px solid white;
                box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                position: relative;
                z-index: 10;
            }
            .pin-icon {
                transform: rotate(45deg); /* Counter rotate icon */
                width: 16px;
                height: 16px;
                color: white;
            }
            .pin-shadow {
                width: 12px;
                height: 4px;
                background: rgba(0,0,0,0.3);
                border-radius: 50%;
                filter: blur(2px);
                position: absolute;
                bottom: 2px;
                z-index: 1;
            }
        `}</style>
        
        {/* Floating Controls for Map (Better Mobile UX) */}
        <div className="absolute top-4 left-4 right-4 z-[400] flex justify-between items-start pointer-events-none">
            {/* Status Badge */}
            <div className="bg-white/90 backdrop-blur shadow-md px-3 py-1.5 rounded-lg border border-gray-200 pointer-events-auto">
                {viewMode === 'nearest' ? (
                     <div className="flex items-center gap-2 text-xs font-bold text-blue-700">
                         <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-600"></span>
                         </span>
                         أقرب {maxResults} موقع لك
                     </div>
                ) : (
                     <div className="flex items-center gap-2 text-xs font-bold text-orange-700">
                         <Icons.Square />
                         نتائج المنطقة المحددة ({filteredLocations.length})
                     </div>
                )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2 pointer-events-auto">
                <button 
                    onClick={toggleDrawing}
                    className={`h-10 px-4 rounded-xl font-bold shadow-lg flex items-center gap-2 text-xs md:text-sm transition-all ${isDrawing ? 'bg-red-500 text-white animate-pulse' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                    {isDrawing ? <><Icons.X /> إلغاء الرسم</> : <><Icons.Square /> تحديد منطقة</>}
                </button>
                
                {viewMode === 'area' && (
                    <button 
                        onClick={resetToNearest}
                        className="h-10 px-4 rounded-xl font-bold shadow-lg flex items-center gap-2 text-xs md:text-sm bg-blue-600 text-white hover:bg-blue-700"
                    >
                        <Icons.Navigation /> أقرب {maxResults}
                    </button>
                )}
            </div>
        </div>

        {/* Map Container */}
        <div className="h-[45vh] md:h-[50%] bg-gray-200 rounded-2xl overflow-hidden border border-gray-300 shadow-inner shrink-0 relative z-0">
             <div id="map-container" className="h-full w-full"></div>
             {isDrawing && (
                 <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-full text-xs font-bold pointer-events-none z-[1000] backdrop-blur-md">
                     ارسم مربعاً على الخريطة الآن
                 </div>
             )}
        </div>

        {/* List Section */}
        <div className="flex-1 bg-white md:bg-gray-50 rounded-t-2xl md:rounded-xl shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] md:shadow-sm border-t md:border border-gray-200 overflow-hidden flex flex-col min-h-0">
            {/* List Header */}
            <div className="p-3 bg-white border-b border-gray-100 flex justify-between items-center shrink-0">
                <h3 className="font-bold text-sm text-gray-700 flex items-center gap-2">
                    <Icons.Database />
                    النتائج ({filteredLocations.length})
                </h3>
                {settings && settings.searchRadius > 0 && viewMode === 'nearest' && (
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                        في نطاق {settings.searchRadius} كم
                    </span>
                )}
            </div>

            {/* Scrollable List */}
            <div className="flex-1 overflow-y-auto p-2 md:p-0 bg-gray-50/50">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-10 space-y-3">
                         <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                         <span className="text-xs text-gray-400">جاري تحديد الموقع وجلب البيانات...</span>
                    </div>
                ) : filteredLocations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                        <Icons.MapPin />
                        <span className="mt-2 text-sm font-bold">لا توجد مواقع</span>
                        {viewMode === 'nearest' && settings && settings.searchRadius > 0 && (
                            <span className="text-xs mt-1">حاول زيادة نطاق البحث من الإعدادات</span>
                        )}
                    </div>
                ) : (
                    <>
                        {/* Desktop Table */}
                        <table className="hidden md:table w-full text-right bg-white">
                            <thead className="bg-gray-50 text-xs text-gray-500 uppercase sticky top-0 shadow-sm z-10">
                                <tr>
                                    <th className="px-4 py-3">المدينة</th>
                                    <th className="px-4 py-3">المسافة</th>
                                    <th className="px-4 py-3">ODB ID</th>
                                    <th className="px-4 py-3">أدوات</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filteredLocations.map(loc => (
                                    <tr key={loc.id} onClick={() => handleItemClick(loc)} className="hover:bg-blue-50 cursor-pointer transition-colors group">
                                        <td className="px-4 py-3 font-bold text-gray-800">{loc.CITYNAME}</td>
                                        <td className="px-4 py-3">
                                            {loc.distance ? (
                                                <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-bold">
                                                    {loc.distance.toFixed(2)} كم
                                                </span>
                                            ) : '-'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <CopyableText text={loc.ODB_ID} className="text-blue-600 font-mono text-xs hover:bg-blue-50 px-2 py-0.5 rounded" />
                                        </td>
                                        <td className="px-4 py-3">
                                            <button 
                                                onClick={(e) => handleNavigate(e, loc)} 
                                                className="flex items-center gap-1 bg-green-50 text-green-700 px-2 py-1 rounded-lg text-xs font-bold hover:bg-green-100 transition-colors opacity-0 group-hover:opacity-100"
                                                title="ذهاب للموقع"
                                            >
                                                <Icons.Navigation />
                                                <span className="hidden lg:inline">ذهاب</span>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* Mobile Cards */}
                        <div className="md:hidden space-y-2 pb-safe">
                            {filteredLocations.map((loc) => (
                                <div key={loc.id} onClick={() => handleItemClick(loc)} className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3 active:scale-[0.98] transition-transform">
                                    <div className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center shrink-0 border ${loc.distance ? 'bg-green-50 border-green-100 text-green-700' : 'bg-gray-50 border-gray-100 text-gray-400'}`}>
                                        {loc.distance ? (
                                            <>
                                                <span className="text-sm font-bold leading-none">{loc.distance.toFixed(1)}</span>
                                                <span className="text-[9px] opacity-75">km</span>
                                            </>
                                        ) : <Icons.MapPin />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex justify-between items-start">
                                            <h4 className="font-bold text-gray-900 truncate text-sm">{loc.CITYNAME}</h4>
                                            <CopyableText text={loc.ODB_ID} className="text-[10px] font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded" />
                                        </div>
                                        <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400">
                                            <span className="dir-ltr">{loc.LATITUDE.toFixed(4)}, {loc.LONGITUDE.toFixed(4)}</span>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={(e) => handleNavigate(e, loc)} 
                                        className="p-2 text-gray-400 hover:text-green-600 bg-gray-50 rounded-lg ml-2 active:bg-green-100 active:text-green-700 transition-colors"
                                        title="ذهاب للموقع"
                                    >
                                        <Icons.Navigation />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>

        <LocationModal 
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            mode={modalMode}
            data={selectedLocation}
            user={user}
            context="map_filter"
            onSave={handleSave}
            onEdit={handleSwitchToEdit}
        />
    </div>
  );
};

export default MapFilter;
