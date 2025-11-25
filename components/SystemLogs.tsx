
import React, { useState, useEffect } from 'react';
import { SystemLog, User } from '../types';
import { getLogs, clearLogs, hasPermission } from '../services/mockBackend'; 
import { Icons } from './Icons';
import { PermissionGuard } from './PermissionGuard';

interface Props {
    user: User;
}

const SystemLogs: React.FC<Props> = ({ user }) => {
    // Immediate Security Check: Do not render anything if no permission
    const canView = hasPermission(user, 'system_logs', 'view');
    
    const [logs, setLogs] = useState<SystemLog[]>([]);
    const [filteredLogs, setFilteredLogs] = useState<SystemLog[]>([]);
    const [search, setSearch] = useState('');
    const [filterAction, setFilterAction] = useState<string>('ALL');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (canView) {
            loadLogs();
        } else {
            setLoading(false);
        }
    }, [user, canView]);

    useEffect(() => {
        let res = logs;
        if (search) {
            const lower = search.toLowerCase();
            res = res.filter(l => 
                l.username.toLowerCase().includes(lower) || 
                l.details.toLowerCase().includes(lower) ||
                l.resource.toLowerCase().includes(lower)
            );
        }
        if (filterAction !== 'ALL') {
            res = res.filter(l => l.action === filterAction);
        }
        setFilteredLogs(res);
    }, [search, filterAction, logs]);

    const loadLogs = async () => {
        setLoading(true);
        try {
            const data = await getLogs();
            // Sort by latest
            data.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setLogs(data);
            setFilteredLogs(data);
        } catch (error) {
            console.error("Failed to load logs", error);
        } finally {
            setLoading(false);
        }
    };

    const handleClear = async () => {
        if (window.confirm('هل أنت متأكد من مسح جميع سجلات النظام؟ لا يمكن التراجع عن هذه العملية.')) {
            await clearLogs();
            await loadLogs();
        }
    };

    const getActionColor = (action: string) => {
        switch (action) {
            case 'LOGIN': return 'bg-green-100 text-green-700';
            case 'LOGOUT': return 'bg-gray-100 text-gray-600';
            case 'CREATE': return 'bg-blue-100 text-blue-700';
            case 'UPDATE': return 'bg-yellow-100 text-yellow-700';
            case 'DELETE': return 'bg-red-100 text-red-700';
            case 'SECURITY': return 'bg-purple-100 text-purple-700';
            case 'EXPORT': return 'bg-indigo-100 text-indigo-700';
            case 'ERROR': return 'bg-red-50 text-red-600 border border-red-200';
            default: return 'bg-gray-100 text-gray-700';
        }
    };

    if (!canView) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <div className="bg-gray-100 p-4 rounded-full mb-3">
                    <Icons.Lock />
                </div>
                <h2 className="text-lg font-bold text-gray-600">عفواً، ليس لديك صلاحية لعرض سجلات النظام</h2>
                <p className="text-sm text-gray-400 mt-1">يرجى مراجعة مدير النظام</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full space-y-4">
            {/* Header */}
            <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-gray-100 text-gray-600 rounded-xl">
                        <Icons.FileText />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">سجلات النظام</h2>
                        <p className="text-sm text-gray-500">مراقبة العمليات والأحداث</p>
                    </div>
                </div>
                
                <PermissionGuard user={user} resource="system_logs" action="delete">
                    <button 
                        onClick={handleClear} 
                        className="bg-red-50 text-red-600 px-4 py-2 rounded-lg font-bold hover:bg-red-100 transition-colors flex items-center gap-2 text-sm border border-red-100"
                    >
                        <Icons.Trash />
                        <span>تنظيف السجلات</span>
                    </button>
                </PermissionGuard>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-xl border border-gray-100 flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
                        <Icons.Search />
                    </div>
                    <input 
                        type="text" 
                        placeholder="بحث بالمستخدم، التفاصيل..." 
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pr-10 pl-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                    />
                </div>
                <div className="w-full md:w-48">
                    <select 
                        value={filterAction} 
                        onChange={e => setFilterAction(e.target.value)}
                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none cursor-pointer"
                    >
                        <option value="ALL">كل العمليات</option>
                        <option value="LOGIN">تسجيل الدخول</option>
                        <option value="CREATE">إضافة</option>
                        <option value="UPDATE">تعديل</option>
                        <option value="DELETE">حذف</option>
                        <option value="EXPORT">تصدير</option>
                        <option value="SECURITY">أمان</option>
                        <option value="ERROR">أخطاء</option>
                    </select>
                </div>
            </div>

            {/* Logs List */}
            <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                <div className="overflow-y-auto flex-1">
                    {loading ? (
                        <div className="flex items-center justify-center h-40">
                            <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
                        </div>
                    ) : filteredLogs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                            <Icons.FileText />
                            <span className="mt-2 text-sm">لا توجد سجلات مطابقة</span>
                        </div>
                    ) : (
                        <table className="w-full text-right">
                            <thead className="bg-gray-50 text-xs text-gray-500 uppercase sticky top-0">
                                <tr>
                                    <th className="px-4 py-3">العملية</th>
                                    <th className="px-4 py-3">المستخدم</th>
                                    <th className="px-4 py-3">المصدر</th>
                                    <th className="px-4 py-3">التفاصيل</th>
                                    <th className="px-4 py-3 text-left">التوقيت</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filteredLogs.map(log => (
                                    <tr key={log.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3">
                                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${getActionColor(log.action)}`}>
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm font-bold text-gray-700">{log.username}</td>
                                        <td className="px-4 py-3 text-sm text-gray-500">{log.resource}</td>
                                        <td className="px-4 py-3 text-sm text-gray-600 max-w-xs md:max-w-md truncate" title={log.details}>
                                            {log.details}
                                        </td>
                                        <td className="px-4 py-3 text-left text-xs text-gray-400 font-mono" dir="ltr">
                                            {new Date(log.timestamp).toLocaleString('en-GB')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SystemLogs;
