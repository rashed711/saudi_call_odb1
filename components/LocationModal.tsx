
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ODBLocation, User, PermissionResource } from '../types';
import { Icons } from './Icons';
import { getLocationDetails, checkPermission } from '../services/mockBackend';
import { CopyableText } from './CopyableText';

interface LocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'view' | 'edit' | 'create';
  data: Partial<ODBLocation>;
  user: User;
  context: 'default' | 'nearby' | 'my_activity' | 'map_filter' | 'search_odb';
  onSave: (data: ODBLocation) => Promise<void>;
  onEdit?: () => void;
  onDelete?: () => void;
}

export const LocationModal: React.FC<LocationModalProps> = ({
  isOpen,
  onClose,
  mode,
  data,
  user,
  context,
  onSave,
  onEdit,
  onDelete
}) => {
  const [formData, setFormData] = useState<Partial<ODBLocation>>(data);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setFormData(data);
      setIsZoomed(false);
      setIsSaving(false);
      if (mode !== 'create' && data.id) {
          fetchDetails(data.id);
      }
    }
  }, [isOpen, data]);

  const fetchDetails = async (id: number) => {
      setIsLoadingDetails(true);
      try {
          const fullData = await getLocationDetails(id);
          setFormData(fullData);
      } catch (error) {
          console.error("Failed to load details:", error);
      } finally {
          setIsLoadingDetails(false);
      }
  };

  // --- Logic: Can User Edit? ---
  const editStatus = useMemo(() => {
      if (mode === 'create') return { allowed: true, reason: '' };
      
      // 1. Check RBAC Permissions (صلاحيات الدور)
      // This is the single source of truth. If checkPermission says yes (e.g., Scope='all'), 
      // then we allow editing regardless of lock status (unless logic changes).
      const hasPerm = checkPermission(user, 'odb', 'edit', formData.ownerId);
      
      if (!hasPerm) {
          // If no permission, we distinguish the reason for the user
          if (formData.isLocked) return { allowed: false, reason: 'مقفل / لا توجد صلاحية' };
          return { allowed: false, reason: 'ليس لديك صلاحية' };
      }

      // If they have permission, they can edit.
      // Even if it's locked, if they have 'all' or 'team' scope that covers it, they can edit.
      // The lock acts as a warning or protection against lower-scope edits.
      return { allowed: true, reason: '' };
  }, [formData, user, mode]);

  const canToggleLock = useMemo(() => {
     // Only Admin and Supervisor can toggle the lock switch
     return user.role === 'admin' || user.role === 'supervisor'; 
  }, [user]);

  if (!isOpen) return null;

  const handleSaveInternal = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (!formData.CITYNAME || !formData.ODB_ID) {
        alert('يرجى إدخال اسم المدينة و كود ODB');
        setIsSaving(false);
        return;
      }

      const locationToSave: ODBLocation = {
        id: formData.id || 0,
        ODB_ID: formData.ODB_ID!,
        CITYNAME: formData.CITYNAME!,
        LATITUDE: Number(formData.LATITUDE),
        LONGITUDE: Number(formData.LONGITUDE),
        image: formData.image,
        notes: formData.notes,
        lastEditedBy: user.username,
        lastEditedAt: new Date().toISOString(),
        ownerId: formData.ownerId,
        ownerName: formData.ownerName,
        isLocked: formData.isLocked
      };

      await onSave(locationToSave);
      onClose();
    } catch (error) {
      console.error(error);
      setIsSaving(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setFormData({ ...formData, image: reader.result as string });
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    if (window.confirm('هل تريد حذف الصورة؟')) {
      setFormData({ ...formData, image: '' });
    }
  };

  const handleGetDirections = () => {
     if (formData.LATITUDE && formData.LONGITUDE) {
         window.open(`https://www.google.com/maps/dir/?api=1&destination=${formData.LATITUDE},${formData.LONGITUDE}&travelmode=driving`, '_blank');
     }
  };

  const isView = mode === 'view';

  // --- RENDER VIEW MODE ---
  const renderViewMode = () => (
    <div className="flex flex-col h-full bg-white md:rounded-2xl overflow-hidden">
        {/* Header Image Section */}
        <div className="relative h-48 md:h-56 bg-gray-100 shrink-0 group cursor-pointer border-b border-gray-200" onClick={() => !isLoadingDetails && formData.image && setIsZoomed(true)}>
            {isLoadingDetails ? (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 animate-pulse">
                     <Icons.Camera />
                     <span className="mt-2 text-xs font-bold text-gray-400">جاري تحميل الصورة...</span>
                </div>
            ) : formData.image ? (
                <>
                    <img src={formData.image} className="w-full h-full object-cover" alt="Location" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <span className="opacity-0 group-hover:opacity-100 bg-black/50 text-white px-3 py-1 rounded-full text-xs font-bold backdrop-blur-sm transition-opacity">
                            <Icons.Eye /> تكبير
                        </span>
                    </div>
                </>
            ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-300">
                    <div className="scale-150"><Icons.MapPin /></div>
                    <span className="mt-2 text-xs font-bold">لا توجد صورة</span>
                </div>
            )}
            
            <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 text-white pointer-events-none">
                <div className="flex justify-between items-end">
                    <div>
                        <h2 className="text-xl md:text-2xl font-bold leading-none shadow-black drop-shadow-md">{formData.CITYNAME}</h2>
                        <div className="flex items-center gap-2 mt-1 pointer-events-auto">
                             <CopyableText text={formData.ODB_ID || ''} className="font-mono bg-white/20 backdrop-blur-md px-2 py-0.5 rounded text-xs font-bold hover:bg-white/30 text-white" />
                        </div>
                    </div>
                    {formData.ownerName && (
                        <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10">
                            {formData.isLocked ? <Icons.Lock /> : <div className="w-3 h-3 rounded-full bg-green-500"></div>}
                            <div className="flex flex-col">
                                <span className="text-[9px] text-gray-300 leading-none">بواسطة</span>
                                <span className="text-[10px] font-bold leading-none">{formData.ownerName}</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="absolute top-4 left-4 bg-black/20 hover:bg-black/40 text-white p-1.5 rounded-full backdrop-blur-md z-10 transition-colors">
                <Icons.X />
            </button>
        </div>

        <div className="p-5 flex-1 overflow-y-auto space-y-5">
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 border border-gray-100 p-3 rounded-xl text-center">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Lat</label>
                    <div className="font-mono font-bold text-gray-700 dir-ltr">{Number(formData.LATITUDE).toFixed(6)}</div>
                </div>
                <div className="bg-gray-50 border border-gray-100 p-3 rounded-xl text-center">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Lng</label>
                    <div className="font-mono font-bold text-gray-700 dir-ltr">{Number(formData.LONGITUDE).toFixed(6)}</div>
                </div>
            </div>

            <div>
                <h3 className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-2"><Icons.Edit /> الملاحظات</h3>
                <div className="bg-yellow-50 border border-yellow-100 p-4 rounded-xl text-sm text-gray-700 leading-relaxed min-h-[80px]">
                    {formData.notes ? formData.notes : <span className="text-gray-400 italic">لا توجد ملاحظات.</span>}
                </div>
            </div>
            
            <div className="text-center text-xs text-gray-400">
                آخر تعديل: {formData.lastEditedBy} ({formData.lastEditedAt ? new Date(formData.lastEditedAt).toLocaleDateString() : '-'})
            </div>
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50 flex gap-3">
             <button onClick={handleGetDirections} className="flex-1 bg-green-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-green-600/20 active:scale-95 transition-transform">
                <Icons.Navigation /> <span>ذهاب</span>
            </button>
            
            {onDelete && checkPermission(user, 'odb', 'delete', formData.ownerId) && (
                 <button onClick={onDelete} className="bg-red-50 text-red-600 px-4 rounded-xl font-bold hover:bg-red-100 transition-colors">
                    <Icons.Trash />
                </button>
            )}

            {editStatus.allowed ? (
                <button onClick={onEdit} className="flex-1 bg-primary text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 active:scale-95 transition-transform">
                    {/* If editing is allowed BUT it's locked, show unlock icon to imply override */}
                    {formData.isLocked ? <Icons.Lock /> : <Icons.Edit />} 
                    <span className="hidden md:inline">{formData.isLocked ? 'تعديل (تجاوز القفل)' : 'تعديل'}</span>
                    <span className="md:hidden text-xs">{formData.isLocked ? 'تجاوز' : 'تعديل'}</span>
                </button>
            ) : (
                <div className="flex-1 bg-gray-200 text-gray-500 py-3 rounded-xl font-bold flex items-center justify-center gap-2 cursor-not-allowed opacity-80" title={editStatus.reason}>
                    <Icons.Lock /> 
                    <span className="hidden md:inline">مقفل ({editStatus.reason})</span>
                    <span className="md:hidden text-xs">{editStatus.reason}</span>
                </div>
            )}
        </div>
    </div>
  );

  const renderEditMode = () => {
    // If not creating, ensure user can edit
    if (mode === 'edit' && !editStatus.allowed) {
        return (
            <div className="flex flex-col h-full items-center justify-center text-center p-6 bg-white rounded-2xl">
                <Icons.Ban />
                <h3 className="mt-2 font-bold text-red-600">عفواً، لا يمكنك تعديل هذا الموقع</h3>
                <p className="text-sm text-gray-500 mt-1">السبب: {editStatus.reason}</p>
                <button onClick={onClose} className="mt-4 bg-gray-100 px-4 py-2 rounded-lg font-bold">إغلاق</button>
            </div>
        );
    }

    const isCoreLocked = mode === 'edit' && context !== 'default';
    
    return (
    <div className="flex flex-col h-full bg-white md:rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                {mode === 'create' ? <Icons.Plus /> : <Icons.Edit />}
                {mode === 'create' ? 'إضافة موقع' : 'تعديل بيانات'}
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-red-500"><Icons.X /></button>
        </div>

        <form id="locationForm" onSubmit={handleSaveInternal} className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Lock Toggle: Only visible to Admins/Supervisors */}
            {canToggleLock && mode === 'edit' && (
                <div className="bg-purple-50 border border-purple-100 p-4 rounded-xl flex items-center justify-between">
                    <div>
                        <span className="block text-xs font-bold text-purple-800">حالة القفل (Lock)</span>
                        <span className="text-[10px] text-purple-600">عند التفعيل، لن يتمكن المندوب (بدون صلاحية خاصة) من التعديل</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={formData.isLocked || false} onChange={(e) => setFormData({...formData, isLocked: e.target.checked})} className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-purple-600 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                    </label>
                </div>
            )}
            
            <div className="space-y-4">
                <input type="text" required value={formData.CITYNAME || ''} onChange={e => setFormData({...formData, CITYNAME: e.target.value})} className={`w-full p-3 border rounded-xl outline-none ${isCoreLocked ? 'bg-gray-100' : 'focus:ring-2 focus:ring-primary'}`} placeholder="اسم المدينة" disabled={isCoreLocked} />
                <input type="text" required value={formData.ODB_ID || ''} onChange={e => setFormData({...formData, ODB_ID: e.target.value})} className={`w-full p-3 border rounded-xl font-mono outline-none ${isCoreLocked ? 'bg-gray-100' : 'focus:ring-2 focus:ring-primary'}`} placeholder="ODB Code" disabled={isCoreLocked} />
            </div>

            <div className="grid grid-cols-2 gap-3">
                <input type="number" step="any" required value={formData.LATITUDE || ''} onChange={e => setFormData({...formData, LATITUDE: parseFloat(e.target.value)})} className={`w-full p-2 border rounded-lg text-center font-mono outline-none ${isCoreLocked ? 'bg-gray-100' : 'focus:ring-2 focus:ring-primary'}`} placeholder="Lat" disabled={isCoreLocked} />
                <input type="number" step="any" required value={formData.LONGITUDE || ''} onChange={e => setFormData({...formData, LONGITUDE: parseFloat(e.target.value)})} className={`w-full p-2 border rounded-lg text-center font-mono outline-none ${isCoreLocked ? 'bg-gray-100' : 'focus:ring-2 focus:ring-primary'}`} placeholder="Lng" disabled={isCoreLocked} />
            </div>

            <div>
                <label className="text-xs font-bold text-gray-500 block mb-2">الصورة</label>
                {formData.image ? (
                    <div className="relative rounded-xl overflow-hidden border border-gray-200 group h-48">
                        <img src={formData.image} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                            <button type="button" onClick={() => fileInputRef.current?.click()} className="bg-white text-blue-600 px-3 py-2 rounded-lg font-bold text-xs"><Icons.Camera /> تغيير</button>
                            <button type="button" onClick={handleRemoveImage} className="bg-white text-red-600 px-3 py-2 rounded-lg font-bold text-xs"><Icons.Trash /> حذف</button>
                        </div>
                    </div>
                ) : (
                    <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-gray-300 rounded-xl h-32 flex flex-col items-center justify-center text-gray-400 cursor-pointer hover:border-primary hover:bg-blue-50 transition-all">
                        <Icons.Camera /><span className="text-xs font-bold mt-2">إضافة صورة</span>
                    </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleImageUpload} />
            </div>

            <textarea value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl h-24 focus:ring-2 focus:ring-primary outline-none resize-none" placeholder="ملاحظات..." />
        </form>

        <div className="p-4 border-t border-gray-100 bg-gray-50 flex gap-3">
            <button onClick={onClose} type="button" className="flex-1 bg-white border border-gray-200 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-100">إلغاء</button>
            <button form="locationForm" type="submit" disabled={isSaving} className="flex-[2] bg-primary text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-700 active:scale-95 disabled:opacity-70">
                {isSaving ? 'جاري الحفظ...' : 'حفظ'}
            </button>
        </div>
    </div>
    );
  };

  return (
    <>
        <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center md:p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
            <div className="relative w-full md:w-[500px] h-[90vh] md:h-auto md:max-h-[90vh] transition-transform animate-in slide-in-from-bottom-10 md:zoom-in-95">
                {isView ? renderViewMode() : renderEditMode()}
            </div>
        </div>
        {isZoomed && formData.image && (
            <div className="fixed inset-0 z-[90] bg-black flex items-center justify-center animate-in fade-in" onClick={() => setIsZoomed(false)}>
                <img src={formData.image} className="max-w-full max-h-full object-contain p-2" />
                <button className="absolute top-4 right-4 text-white bg-white/20 p-2 rounded-full hover:bg-white/40"><Icons.X /></button>
            </div>
        )}
    </>
  );
};
