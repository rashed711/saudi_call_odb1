
import React, { useState, useEffect, useRef } from 'react';
import { ODBLocation, User } from '../types';
import { getODBLocationsPaginated, saveODBLocation, deleteODBLocation, saveBulkODBLocations } from '../services/mockBackend';
import { Icons } from './Icons';
import { PermissionGuard } from './PermissionGuard';
import { LocationModal } from './LocationModal';
import { CopyableText } from './CopyableText';

interface ODBTableProps {
    user: User;
}

const ODBTable: React.FC<ODBTableProps> = ({ user }) => {
  const [locations, setLocations] = useState<ODBLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Pagination & Search States
  const [page, setPage] = useState(1);
  const [limit] = useState(20); 
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // New Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'view' | 'edit' | 'create'>('view');
  const [selectedLocation, setSelectedLocation] = useState<Partial<ODBLocation>>({});

  const [isImporting, setIsImporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
      const timer = setTimeout(() => {
          setDebouncedSearch(searchQuery);
          setPage(1); 
      }, 500);
      return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchLocations = async (signal?: AbortSignal) => {
      setLoading(true);
      setErrorMsg(null);
      try {
          const result = await getODBLocationsPaginated(page, limit, debouncedSearch, signal);
          // Filter duplicates locally if any slip through
          const uniqueLocations = result.data.filter((loc, index, self) => 
             index === self.findIndex((t) => (t.ODB_ID === loc.ODB_ID))
          );
          setLocations(uniqueLocations);
          setTotalItems(result.total);
          setTotalPages(result.totalPages);
      } catch (error: any) {
          if (error.name !== 'AbortError') {
              console.error("Error fetching locations:", error);
              setErrorMsg(error.message);
          }
      } finally {
           if (!signal?.aborted) setLoading(false);
      }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchLocations(controller.signal);
    return () => controller.abort();
  }, [page, limit, debouncedSearch]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelectedIds(locations.map(l => l.id));
    else setSelectedIds([]);
  };

  const handleSelectRow = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  // --- Modal Handlers ---

  const handleRowClick = (loc: ODBLocation) => {
    // We only pass the ID and basic info. The modal will fetch the heavy image.
    setSelectedLocation(loc);
    setModalMode('view');
    setIsModalOpen(true);
  };

  const handleCreateNew = () => {
    setSelectedLocation({
        id: 0,
        CITYNAME: '',
        ODB_ID: '',
        LATITUDE: 0,
        LONGITUDE: 0,
        image: '',
        notes: ''
    });
    setModalMode('create');
    setIsModalOpen(true);
  };

  const handleSaveLocation = async (data: ODBLocation) => {
    try {
        await saveODBLocation(data);
        await fetchLocations();
    } catch (error: any) {
        alert("Error saving: " + error.message);
    }
  };

  const handleSwitchToEdit = () => {
      setModalMode('edit');
  };

  // --- End Modal Handlers ---

  const handleDeleteSingle = async (id: number) => {
      if (window.confirm(`هل أنت متأكد من حذف هذا الموقع؟`)) {
          await deleteODBLocation(id);
          fetchLocations();
          setSelectedIds(prev => prev.filter(pid => pid !== id));
          setIsModalOpen(false);
      }
  };

  const handleBulkDelete = async () => {
    if (window.confirm(`حذف ${selectedIds.length} مواقع؟`)) {
      for (const id of selectedIds) await deleteODBLocation(id);
      fetchLocations();
      setSelectedIds([]);
    }
  };

  const handleImportClick = () => {
      if (fileInputRef.current) { fileInputRef.current.value = ''; fileInputRef.current.click(); }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) return;
        const lines = text.split(/\r\n|\n/);
        const newLocations: Omit<ODBLocation, 'id'>[] = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line || (i === 0 && (line.toLowerCase().includes('city')))) continue;
            const cols = line.split(/[,;]/).map(c => c.trim().replace(/^"|"$/g, '')); 
            if (cols.length < 3) continue; 
            const city = cols[0]; const lat = parseFloat(cols[1]); const lng = parseFloat(cols[2]); const odbId = cols[3] || `CSV-${Math.floor(Math.random() * 10000)}`;
            if (city && !isNaN(lat)) newLocations.push({ CITYNAME: city, LATITUDE: lat, LONGITUDE: lng, ODB_ID: odbId });
        }
        if (newLocations.length > 0) {
            if (window.confirm(`استيراد ${newLocations.length} موقع؟`)) {
                const result = await saveBulkODBLocations(newLocations);
                alert(`تم: ${result.added}, مكرر: ${result.skipped}`);
                fetchLocations();
            }
        }
      } catch (err: any) { alert('Error: ' + err.message); } finally { setIsImporting(false); }
    };
    reader.readAsText(file);
  };

  if (!user) return null;

  return (
    <div className="flex flex-col h-full">
      <input type="file" accept=".csv,.txt" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} />

      {/* Sticky Action Bar */}
      <div className="sticky top-0 z-20 bg-gray-50/95 backdrop-blur-md pb-4 pt-1">
        <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400"><Icons.Search /></div>
                <input type="text" className="w-full pr-10 pl-4 py-3 bg-white border border-gray-200 rounded-xl shadow-sm outline-none text-sm" placeholder="بحث..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            
            <PermissionGuard user={user} resource="odb" action="create">
                <button onClick={handleCreateNew} className="w-12 h-12 flex items-center justify-center bg-primary text-white rounded-xl shadow-lg hover:bg-blue-700 transition-colors">
                    <Icons.Plus />
                </button>
            </PermissionGuard>
        </div>

        <div className="flex justify-between items-center px-1">
            <p className="text-xs text-gray-500 font-medium">{loading ? '...' : `العدد: ${totalItems}`}</p>
            
            <PermissionGuard user={user} resource="odb" action="create">
                <button onClick={handleImportClick} disabled={isImporting || loading} className="text-xs flex items-center gap-1 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg font-bold">
                    {isImporting ? '...' : <><Icons.Upload /> <span>CSV</span></>}
                </button>
            </PermissionGuard>
        </div>
      </div>

      {/* Error Message Display */}
      {errorMsg && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 flex items-center gap-3 mb-4 mx-1">
            <Icons.Ban />
            <div className="text-sm font-bold">
                {errorMsg}
                <div className="text-xs font-normal mt-1 opacity-75">يرجى التأكد من تشغيل السيرفر وتحديث ملف api.php بشكل صحيح.</div>
            </div>
        </div>
      )}

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-28 left-4 right-4 md:absolute md:top-20 md:z-30 bg-slate-900 text-white p-3 rounded-xl shadow-2xl flex items-center justify-between animate-in slide-in-from-bottom-4">
            <div className="flex items-center gap-3 px-2">
                <button onClick={() => setSelectedIds([])}><Icons.X /></button>
                <span className="font-bold text-sm">{selectedIds.length}</span>
            </div>
            <PermissionGuard user={user} resource="odb" action="delete">
                <button onClick={handleBulkDelete} className="bg-red-600 px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
                    <Icons.Trash /> <span>حذف</span>
                </button>
            </PermissionGuard>
        </div>
      )}

      {/* Desktop Table */}
      <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden min-h-[300px]">
        <table className="w-full text-right border-collapse">
          <thead className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
            <tr>
              <th className="py-3 px-4 w-12 text-center"><input type="checkbox" onChange={handleSelectAll} checked={locations.length > 0 && selectedIds.length === locations.length} /></th>
              <th className="py-3 px-4 font-semibold">المدينة</th>
              <th className="py-3 px-4 font-semibold">ODB_ID</th>
            </tr>
          </thead>
          <tbody>
            {loading ? ( <tr><td colSpan={3} className="text-center py-20">...</td></tr> ) : 
             locations.length === 0 && !errorMsg ? ( <tr><td colSpan={3} className="text-center py-20 text-gray-400">لا توجد نتائج</td></tr> ) :
             locations.map((loc) => (
                <tr key={loc.id} onClick={() => handleRowClick(loc)} className={`border-b border-gray-50 cursor-pointer hover:bg-gray-50 ${selectedIds.includes(loc.id) ? 'bg-blue-50' : ''}`}>
                    <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(loc.id)} onChange={(e) => { e.stopPropagation(); handleSelectRow(loc.id); }} /></td>
                    <td className="py-3 px-4 font-medium flex items-center gap-2">
                        <div className="text-gray-400"><Icons.MapPin /></div>
                        {loc.CITYNAME}
                    </td>
                    <td className="py-3 px-4">
                        <CopyableText text={loc.ODB_ID} className="text-blue-600 font-mono text-sm hover:bg-blue-50 px-2 py-0.5 rounded" />
                    </td>
                </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile App Card */}
      <div className="md:hidden space-y-3 pb-4">
        {locations.map((loc) => (
            <div key={loc.id} className={`bg-white rounded-2xl p-4 shadow-sm border ${selectedIds.includes(loc.id) ? 'border-primary bg-blue-50' : 'border-gray-100'}`} onClick={() => handleRowClick(loc)}>
                <div className="flex justify-between">
                    <h3 className="font-bold flex items-center gap-2">
                         <span className="text-gray-400"><Icons.MapPin /></span>
                         {loc.CITYNAME}
                    </h3>
                    <CopyableText text={loc.ODB_ID} className="text-xs bg-gray-100 px-2 rounded h-fit py-0.5 font-mono" />
                </div>
                <div className="mt-3 flex justify-between items-center border-t pt-2">
                     <div className="text-[10px] text-gray-400">
                         {loc.lastEditedAt ? loc.lastEditedAt.split('T')[0] : ''}
                     </div>
                </div>
            </div>
        ))}
      </div>

      {/* Pagination */}
      {locations.length > 0 && (
        <div className="flex justify-center gap-4 py-6">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="w-10 h-10 bg-white border rounded-full shadow-sm">{'<'}</button>
            <span className="mt-2 text-sm font-bold">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="w-10 h-10 bg-white border rounded-full shadow-sm">{'>'}</button>
        </div>
      )}

      {/* Unified Location Modal */}
      <LocationModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        mode={modalMode}
        data={selectedLocation}
        user={user}
        context="default"
        onSave={handleSaveLocation}
        onEdit={handleSwitchToEdit}
        onDelete={selectedLocation.id ? () => handleDeleteSingle(selectedLocation.id!) : undefined}
      />
    </div>
  );
};

export default ODBTable;
