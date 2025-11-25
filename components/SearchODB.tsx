
import React, { useState } from 'react';
import { User, ODBLocation } from '../types';
import { searchODBLocation, saveODBLocation } from '../services/mockBackend';
import { Icons } from './Icons';
import { LocationModal } from './LocationModal';
import { CopyableText } from './CopyableText';

interface Props {
    user: User;
}

const SearchODB: React.FC<Props> = ({ user }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<ODBLocation[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    
    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<'view' | 'edit'>('view');
    const [selectedLocation, setSelectedLocation] = useState<Partial<ODBLocation>>({});

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;

        setLoading(true);
        setHasSearched(true);
        setResults([]);
        
        try {
            const data = await searchODBLocation(query);
            setResults(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleResultClick = (loc: ODBLocation) => {
        setSelectedLocation(loc);
        setModalMode('view');
        setIsModalOpen(true);
    };

    const handleSave = async (data: ODBLocation) => {
        try {
            await saveODBLocation(data);
            setResults(prev => prev.map(r => r.id === data.id ? {...r, ...data} : r));
        } catch (e) {
            alert('خطأ في الحفظ');
        }
    };

    return (
        <div className="flex flex-col h-full bg-gray-50">
            {/* Sticky Search Header (Mobile Optimized) */}
            <div className="sticky top-0 z-30 bg-white shadow-sm border-b border-gray-100 p-3 md:p-6 md:rounded-b-2xl md:static">
                <div className="flex flex-col items-center justify-center text-center space-y-3 max-w-2xl mx-auto">
                    <div className="hidden md:flex p-3 bg-blue-50 text-primary rounded-full mb-1">
                        <Icons.Search />
                    </div>
                    <div className="hidden md:block">
                        <h2 className="text-xl font-bold text-gray-800">استعلام عن ODB</h2>
                        <p className="text-sm text-gray-500 mt-1">ابحث عن أي موقع باستخدام كود ODB</p>
                    </div>

                    <form onSubmit={handleSearch} className="w-full relative flex items-center shadow-sm border border-gray-200 rounded-xl overflow-hidden group focus-within:ring-2 focus-within:ring-primary/20 transition-all bg-gray-50">
                        <input 
                            type="text" 
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="بحث بكود ODB أو المدينة..."
                            className="flex-1 p-3.5 bg-transparent border-none outline-none text-base font-medium placeholder-gray-400"
                        />
                        <button 
                            type="submit" 
                            disabled={loading || !query.trim()}
                            className="bg-primary text-white px-5 py-3.5 font-bold hover:bg-blue-700 transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center min-w-[60px]"
                        >
                            {loading ? <span className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin"></span> : <Icons.Search />}
                        </button>
                    </form>
                </div>
            </div>

            {/* Results Area */}
            <div className="flex-1 overflow-y-auto p-3 md:p-6">
                {hasSearched && (
                    <div className="space-y-3 max-w-5xl mx-auto">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-20 space-y-3">
                                <div className="w-8 h-8 border-4 border-blue-100 border-t-primary rounded-full animate-spin"></div>
                                <span className="text-sm text-gray-400 font-medium">جاري البحث في قاعدة البيانات...</span>
                            </div>
                        ) : results.length > 0 ? (
                            <>
                                <div className="flex justify-between items-center px-1">
                                    <h3 className="font-bold text-gray-700 text-sm">نتائج البحث ({results.length})</h3>
                                    <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">بحث مطابق</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {results.map(loc => (
                                        <div 
                                            key={loc.id} 
                                            onClick={() => handleResultClick(loc)}
                                            className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:border-primary hover:shadow-md cursor-pointer transition-all active:scale-[0.99] group relative overflow-hidden"
                                        >
                                            <div className="flex justify-between items-start relative z-10">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-blue-50 text-primary flex items-center justify-center shrink-0">
                                                        <Icons.MapPin />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="font-bold text-gray-800 truncate">{loc.CITYNAME}</div>
                                                        <div className="mt-1">
                                                            <CopyableText text={loc.ODB_ID} className="text-xs text-gray-500 font-mono bg-gray-100 px-1.5 rounded hover:bg-blue-100 hover:text-blue-700" />
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-gray-300 group-hover:text-primary transition-colors">
                                                    <Icons.Navigation />
                                                </div>
                                            </div>
                                            {/* Lock Status Indicator if applicable */}
                                            {loc.isLocked && (
                                                <div className="absolute bottom-2 left-2 text-gray-300 opacity-20">
                                                    <Icons.Lock />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-20 text-gray-400 bg-white rounded-xl border border-gray-100 border-dashed mx-4">
                                <Icons.Ban />
                                <span className="mt-2 text-sm font-bold">لا توجد نتائج مطابقة لـ "{query}"</span>
                                <span className="text-xs mt-1">تأكد من كتابة الكود أو الاسم بشكل صحيح</span>
                            </div>
                        )}
                    </div>
                )}
                
                {!hasSearched && (
                    <div className="flex flex-col items-center justify-center h-full text-gray-300 opacity-60 pb-20 px-6 text-center">
                        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                            <div className="scale-150 text-gray-400"><Icons.Database /></div>
                        </div>
                        <h3 className="text-lg font-bold text-gray-500">مرحباً بك في نظام الاستعلام</h3>
                        <p className="text-sm mt-1 max-w-xs">ابدأ بكتابة كود ODB أو اسم المنطقة في الأعلى لعرض التفاصيل.</p>
                    </div>
                )}
            </div>

            <LocationModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                mode={modalMode}
                data={selectedLocation}
                user={user}
                context="search_odb"
                onSave={handleSave}
                onEdit={() => setModalMode('edit')}
            />
        </div>
    );
};

export default SearchODB;
