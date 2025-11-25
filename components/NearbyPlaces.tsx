
import React, { useState, useRef, useEffect } from 'react';
import { ODBLocation, NearbyLocation, User, SiteSettings } from '../types';
import { getNearbyLocationsAPI, saveODBLocation, getSiteSettings } from '../services/mockBackend';
import { Icons } from './Icons';
import { LocationModal } from './LocationModal';
import { CopyableText } from './CopyableText';

interface NearbyPlacesProps {
  user: User;
}

const NearbyPlaces: React.FC<NearbyPlacesProps> = ({ user }) => {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyLocation[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'view' | 'edit'>('view');
  const [selectedLocation, setSelectedLocation] = useState<Partial<ODBLocation>>({});

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Auto-detect location on mount
  useEffect(() => {
      handleGetLocation();
  }, []);

  const showToast = (msg: string) => {
      setToastMsg(msg);
      setTimeout(() => setToastMsg(null), 3000);
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setStatus('error');
      setErrorMsg('المتصفح لا يدعم تحديد الموقع الجغرافي.');
      return;
    }

    setStatus('loading');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserCoords({ lat: latitude, lng: longitude });
        processNearby(latitude, longitude);
      },
      (error) => {
        setStatus('error');
        let msg = 'حدث خطأ أثناء تحديد الموقع.';
        if (error.code === 1) msg = 'يرجى السماح بتحديد الموقع لعرض الأماكن القريبة.';
        else if (error.code === 2) msg = 'الموقع غير متاح حالياً.';
        else if (error.code === 3) msg = 'انتهت مهلة تحديد الموقع.';
        setErrorMsg(msg);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const processNearby = async (lat: number, lng: number) => {
    try {
        const currentSettings = await getSiteSettings();
        setSettings(currentSettings); // Update state for UI

        const limit = currentSettings.maxResults || 20; 
        
        const places = await getNearbyLocationsAPI(
            lat, 
            lng, 
            currentSettings.searchRadius, 
            limit
        );

        const uniquePlaces = places.filter((place, index, self) => 
            index === self.findIndex((t) => t.ODB_ID === place.ODB_ID)
        );

        setNearbyPlaces(uniquePlaces);
        setStatus('success');
    } catch (e: any) {
        console.error(e);
        setStatus('error');
        setErrorMsg(e.message || 'فشل الاتصال بقاعدة البيانات');
    }
  };

  // --- Modal Handlers ---
  const handleItemClick = (place: NearbyLocation) => {
      setSelectedLocation(place);
      setModalMode('view');
      setIsModalOpen(true);
  };

  const handleSave = async (data: ODBLocation) => {
    try {
        await saveODBLocation(data);
        
        setNearbyPlaces(prev => prev.map(p => {
            if (p.id === data.id) {
                return { ...p, ...data, distance: p.distance };
            }
            return p;
        }));

        showToast('تم حفظ التعديلات بنجاح');
    } catch (e) {
        alert('فشل الحفظ في قاعدة البيانات');
    }
  };

  const handleSwitchToEdit = () => {
      setModalMode('edit');
  };

  const handleDirectDirections = (e: React.MouseEvent, lat: number, lng: number) => {
      e.stopPropagation();
      const dest = `${lat},${lng}`;
      const url = `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
      window.open(url, '_blank');
  };

  return (
    <div className="flex flex-col h-full space-y-3">
      
      {/* Success Toast */}
      {toastMsg && (
          <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-[80] bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="bg-green-500 rounded-full p-1"><Icons.Check /></div>
              <span className="font-bold text-sm">{toastMsg}</span>
          </div>
      )}

      {/* Top Banner */}
      <div className="bg-gradient-to-br from-purple-600 to-indigo-700 rounded-xl p-3 md:p-4 text-white shadow-lg relative overflow-hidden shrink-0 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div className="flex items-center justify-between w-full md:w-auto">
            <div className="min-w-0">
                <h2 className="text-base md:text-lg font-bold leading-tight flex items-center gap-2">
                    <Icons.MapPin /> 
                    الأماكن القريبة
                </h2>
                <div className="flex items-center gap-2 text-[10px] md:text-xs text-purple-100 opacity-90 mt-1">
                    {status === 'success' ? (
                        <span className="bg-white/20 px-1.5 py-0.5 rounded font-bold">
                             تم العثور على {nearbyPlaces.length} موقع
                        </span>
                    ) : status === 'loading' ? (
                        <span className="animate-pulse">جاري تحديد موقعك والبحث...</span>
                    ) : (
                         <span>قم بتفعيل الموقع للمتابعة</span>
                    )}
                </div>
            </div>
            
            <button
                onClick={handleGetLocation}
                disabled={status === 'loading'}
                className="md:hidden bg-white/10 backdrop-blur-md border border-white/20 text-white px-3 py-1.5 rounded-lg font-bold text-[10px] shadow-sm flex items-center gap-1 active:bg-white/20"
            >
                {status === 'loading' ? <span className="w-3 h-3 border border-white rounded-full animate-spin"></span> : <Icons.Search />}
                <span>تحديث</span>
            </button>
        </div>
        
        <div className="hidden md:block">
            <button
                onClick={handleGetLocation}
                disabled={status === 'loading'}
                className="bg-white/10 hover:bg-white hover:text-purple-700 backdrop-blur-md border border-white/20 text-white px-4 py-1.5 rounded-lg font-bold text-xs shadow-sm transition-all active:scale-95 flex items-center gap-2"
            >
                {status === 'loading' ? <span className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin"></span> : <Icons.Search />}
                <span>تحديث الموقع</span>
            </button>
        </div>
      </div>

      {status === 'error' && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 text-center flex flex-col items-center justify-center gap-2">
          <Icons.Ban />
          <span className="font-bold text-sm">{errorMsg}</span>
          <button onClick={handleGetLocation} className="mt-2 bg-red-100 px-4 py-2 rounded-lg text-xs font-bold hover:bg-red-200">
              إعادة المحاولة
          </button>
        </div>
      )}

      {/* LOADING SKELETON */}
      {status === 'loading' && (
        <div className="flex flex-col gap-3">
             <div className="text-center text-gray-400 text-xs animate-pulse mb-2">
                 جاري البحث عن أقرب {settings?.maxResults || '...'} موقع...
             </div>
             {[1,2,3,4,5].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse"></div>)}
        </div>
      )}

      {/* RESULTS LIST */}
      {status === 'success' && nearbyPlaces.length > 0 && (
        <div className="flex-1 overflow-y-auto">
            {/* Desktop Table */}
            <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden min-h-[300px]">
                <table className="w-full text-right border-collapse">
                <thead className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200 sticky top-0">
                    <tr>
                        <th className="py-3 px-4 font-semibold">المدينة</th>
                        <th className="py-3 px-4 font-semibold">المسافة</th>
                        <th className="py-3 px-4 font-semibold">ODB_ID</th>
                        <th className="py-3 px-4 font-semibold text-center">أدوات</th>
                    </tr>
                </thead>
                <tbody>
                    {nearbyPlaces.map((place) => (
                        <tr key={place.ODB_ID} onClick={() => handleItemClick(place)} className="border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors">
                            <td className="py-3 px-4 font-medium flex items-center gap-2">
                                <div className="text-gray-400"><Icons.MapPin /></div>
                                {place.CITYNAME}
                            </td>
                            <td className="py-3 px-4 text-sm font-bold text-green-600">{place.distance.toFixed(2)} كم</td>
                            <td className="py-3 px-4">
                                <CopyableText text={place.ODB_ID} className="text-blue-600 font-mono text-sm hover:bg-blue-50 px-2 py-0.5 rounded" />
                            </td>
                            <td className="py-3 px-4 text-center flex justify-center gap-2">
                                <button onClick={(e) => handleDirectDirections(e, place.LATITUDE, place.LONGITUDE)} className="flex items-center gap-1 bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-green-100 transition-colors" title="الذهاب للموقع">
                                    <Icons.Navigation /> <span>ذهاب</span>
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
                </table>
            </div>

            {/* Mobile Cards (Redesigned to match MapFilter) */}
            <div className="md:hidden space-y-2 pb-4">
                {nearbyPlaces.map((place) => (
                    <div key={place.ODB_ID} onClick={() => handleItemClick(place)} className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3 active:scale-[0.98] transition-transform">
                        <div className="w-12 h-12 rounded-lg flex flex-col items-center justify-center shrink-0 border bg-green-50 border-green-100 text-green-700">
                            <span className="text-sm font-bold leading-none">{place.distance.toFixed(1)}</span>
                            <span className="text-[9px] opacity-75">km</span>
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex justify-between items-start">
                                <h4 className="font-bold text-gray-900 truncate text-sm">{place.CITYNAME}</h4>
                                <CopyableText text={place.ODB_ID} className="text-[10px] font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded" />
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400">
                                <span className="dir-ltr">{place.LATITUDE.toFixed(4)}, {place.LONGITUDE.toFixed(4)}</span>
                            </div>
                        </div>
                        <button 
                            onClick={(e) => handleDirectDirections(e, place.LATITUDE, place.LONGITUDE)} 
                            className="p-2 text-gray-400 hover:text-green-600 bg-gray-50 rounded-lg ml-2 active:bg-green-100 active:text-green-700 transition-colors"
                            title="ذهاب للموقع"
                        >
                            <Icons.Navigation />
                        </button>
                    </div>
                ))}
            </div>
        </div>
      )}
      
      {status === 'success' && nearbyPlaces.length === 0 && (
         <div className="text-center py-12 text-gray-400 flex flex-col items-center">
             <Icons.Search />
             <div className="mt-2 text-sm font-bold">لا توجد مواقع قريبة في النطاق المحدد</div>
             {settings && settings.searchRadius > 0 && (
                <div className="text-xs mt-1 opacity-70">
                    نطاق البحث الحالي: {settings.searchRadius} كم
                    <br/>
                    حاول زيادة النطاق من الإعدادات
                </div>
             )}
         </div>
      )}

      {/* Unified Location Modal */}
      <LocationModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        mode={modalMode}
        data={selectedLocation}
        user={user}
        context="nearby"
        onSave={handleSave}
        onEdit={handleSwitchToEdit}
      />
    </div>
  );
};

export default NearbyPlaces;
