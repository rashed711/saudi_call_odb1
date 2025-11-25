
import React, { useState, useEffect } from 'react';
import { User, ODBLocation } from '../types';
import { getMyActivity, saveODBLocation } from '../services/mockBackend';
import { Icons } from './Icons';
import { PermissionGuard } from './PermissionGuard';
import { LocationModal } from './LocationModal';
import { CopyableText } from './CopyableText';

interface Props {
    user: User;
}

const MyActivity: React.FC<Props> = ({ user }) => {
    const [locations, setLocations] = useState<ODBLocation[]>([]);
    const [loading, setLoading] = useState(true);
    
    // States for Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<'view' | 'edit'>('view');
    const [selectedLocation, setSelectedLocation] = useState<Partial<ODBLocation>>({});

    useEffect(() => {
        loadActivity();
    }, [user.id, user.username]);

    const loadActivity = async () => {
        setLoading(true);
        try {
            const searchTerm = user.username;
            const res = await getMyActivity(searchTerm);
            setLocations(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    // --- Modal Handlers ---
    const handleView = (loc: ODBLocation) => {
        setSelectedLocation(loc);
        setModalMode('view');
        setIsModalOpen(true);
    };

    const handleEdit = (e: React.MouseEvent, loc: ODBLocation) => {
        e.stopPropagation(); 
        setSelectedLocation(loc);
        setModalMode('edit');
        setIsModalOpen(true);
    };

    const handleSave = async (data: ODBLocation) => {
        try {
            await saveODBLocation(data);
            await loadActivity();
            // Optional: Close modal or switch back to view
            // setModalMode('view');
        } catch (e) {
            alert('Error saving location');
        }
    };

    const handleSwitchToEdit = () => {
        setModalMode('edit');
    };

    return (
        <div className="space-y-4 md:space-y-6 h-full flex flex-col">
            <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between shrink-0">
                <div>
                    <h2 className="text-lg md:text-xl font-bold text-gray-800 flex items-center gap-2">
                        <Icons.Check />
                        <span>نشاطي الميداني</span>
                    </h2>
                    <p className="text-xs md:text-sm text-gray-500">المواقع المسجلة باسم المستخدم (@{user.username})</p>
                </div>
                <div className="text-xl font-bold text-primary bg-blue-50 px-3 py-1 rounded-lg">
                    {locations.length}
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex-1 flex flex-col">
                <div className="overflow-y-auto flex-1">
                    <table className="w-full text-right">
                        <thead className="bg-gray-50 text-xs text-gray-500 uppercase sticky top-0 z-10">
                            <tr>
                                <th className="px-4 py-3 md:px-6">المدينة</th>
                                <th className="px-4 py-3 md:px-6 hidden md:table-cell">كود ODB</th>
                                <th className="px-4 py-3 md:px-6 text-center">إجراءات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td colSpan={3} className="text-center py-8">...</td></tr>
                            ) : locations.length === 0 ? (
                                <tr><td colSpan={3} className="text-center py-12 text-gray-400 text-sm">لم يتم العثور على نشاط مسجل باسم المستخدم "{user.username}"</td></tr>
                            ) : locations.map(loc => (
                                <tr key={loc.id} onClick={() => handleView(loc)} className="hover:bg-gray-50 cursor-pointer transition-colors">
                                    <td className="px-4 py-3 md:px-6">
                                        <div className="font-bold text-gray-800 text-sm flex items-center gap-2">
                                            {/* Generic icon instead of conditional image */}
                                            <div className="text-gray-400"><Icons.MapPin /></div>
                                            {loc.CITYNAME}
                                        </div>
                                        <div className="md:hidden mt-1">
                                            <CopyableText text={loc.ODB_ID} className="text-xs text-blue-600 font-mono" />
                                        </div>
                                        <div className="text-[10px] text-gray-400 mt-1" dir="ltr">
                                            {loc.lastEditedAt ? loc.lastEditedAt.split('T')[0] : 'N/A'}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 md:px-6 hidden md:table-cell">
                                        <CopyableText text={loc.ODB_ID} className="font-mono text-blue-600 hover:bg-blue-50 px-2 py-0.5 rounded" />
                                    </td>
                                    <td className="px-4 py-3 md:px-6 text-center">
                                        <PermissionGuard 
                                            user={user} 
                                            resource="my_activity" 
                                            action="edit"
                                            fallback={<button onClick={(e) => { e.stopPropagation(); handleView(loc); }} className="text-gray-400 hover:text-blue-600 p-2"><Icons.Eye /></button>}
                                        >
                                            <button onClick={(e) => handleEdit(e, loc)} className="bg-blue-50 text-blue-600 p-2 rounded-lg hover:bg-blue-100 transition-colors">
                                                <Icons.Edit />
                                            </button>
                                        </PermissionGuard>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Unified Location Modal */}
            <LocationModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                mode={modalMode}
                data={selectedLocation}
                user={user}
                context="my_activity"
                onSave={handleSave}
                onEdit={handleSwitchToEdit}
            />
        </div>
    );
};

export default MyActivity;
