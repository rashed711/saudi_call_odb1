
import React, { useState, useEffect } from 'react';
import { User, Permission, PermissionResource, PermissionAction } from '../types';
import { getUsers, saveUser, deleteUser, toggleUserStatus, getSession, hasPermission, resetUserDevice } from '../services/mockBackend';
import { Icons } from './Icons';

const RESOURCES: { id: PermissionResource; label: string }[] = [
  { id: 'dashboard', label: 'لوحة التحكم' },
  { id: 'search_odb', label: 'استعلام ODB (سريع)' },
  { id: 'odb', label: 'مواقع ODB (السجل الكامل)' },
  { id: 'map_filter', label: 'الأماكن القريبة (خريطة)' },
  { id: 'users', label: 'المستخدمين' },
  { id: 'settings', label: 'الإعدادات' },
  { id: 'my_activity', label: 'نشاطي (للمناديب)' },
  { id: 'system_logs', label: 'سجلات النظام (Audit)' },
];

const ACTIONS: { id: PermissionAction; label: string }[] = [
  { id: 'view', label: 'عرض' },
  { id: 'create', label: 'إضافة' },
  { id: 'edit', label: 'تعديل' },
  { id: 'delete', label: 'حذف' },
  { id: 'export', label: 'تصدير' },
];

const UserManagement: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(getSession());
  const [users, setUsers] = useState<User[]>([]);
  const [supervisors, setSupervisors] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  
  // Save Loading State
  const [isSaving, setIsSaving] = useState(false);

  // Form State
  const [formData, setFormData] = useState<Partial<User>>({
      id: 0, username: '', name: '', email: '', role: 'delegate', password: '', isActive: true, permissions: [], supervisorId: null, deviceId: null
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
      if (!currentUser) return;
      setLoading(true);
      try {
        const data = await getUsers(currentUser);
        
        // تصفية إضافية: استبعاد السوبر أدمن من القائمة إذا لم أكن أنا السوبر أدمن
        // (حتى لو الباك إند أرسلها بالخطأ، الواجهة ستخفيها)
        const filteredData = data.filter(u => {
            if (currentUser.id === 1) return true; // أنا السوبر أدمن، أريني كل شيء وصلني
            return u.id !== 1; // لست السوبر أدمن، أخفِ المستخدم رقم 1
        });

        setUsers(filteredData);
        // قائمة المشرفين المتاحة للتعيين (يجب أن تظهر فقط المشرفين الذين أراهم)
        setSupervisors(filteredData.filter(u => u.role === 'admin' || u.role === 'supervisor'));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
  };

  const handleOpenModal = (userToEdit?: User) => {
      setModalError(null);
      if (userToEdit) {
          setFormData({ ...userToEdit, password: '' });
      } else {
          // Rule #2 Enforced Logic:
          // If I am a Supervisor, I MUST be the supervisor of the new user.
          const isSupervisor = currentUser?.role === 'supervisor';
          
          // Supervisors can only create Delegates.
          const defaultRole = isSupervisor ? 'delegate' : 'delegate'; 
          
          // Auto-assign self as supervisor if I am a supervisor
          const defaultSupervisor = isSupervisor ? currentUser.id : null;
          
          setFormData({
              id: 0, username: '', name: '', email: '', role: defaultRole,
              password: '', isActive: true, supervisorId: defaultSupervisor, permissions: [], deviceId: null
          });
          handleRoleChange(defaultRole, true);
      }
      setIsModalOpen(true);
  };

  const handleRoleChange = (newRole: string, isNew: boolean = false) => {
      let defaults: Permission[] = [];
      if (newRole === 'admin') {
          defaults = RESOURCES.map(r => ({ resource: r.id, actions: ['view', 'create', 'edit', 'delete', 'export'] }));
      } else if (newRole === 'supervisor') {
          defaults = [
              { resource: 'dashboard', actions: ['view'] },
              { resource: 'search_odb', actions: ['view'] },
              { resource: 'odb', actions: ['view', 'create', 'edit'] },
              { resource: 'map_filter', actions: ['view'] },
              { resource: 'users', actions: ['view', 'create', 'edit'] },
              { resource: 'my_activity', actions: ['view'] }
          ];
      } else { 
          defaults = [
              { resource: 'dashboard', actions: ['view'] },
              { resource: 'search_odb', actions: ['view'] },
              { resource: 'odb', actions: ['view'] },
              { resource: 'map_filter', actions: ['view'] },
              { resource: 'my_activity', actions: ['view', 'edit'] }
          ];
      }

      setFormData(prev => ({
          ...prev,
          role: newRole as any,
          permissions: isNew ? defaults : (prev.permissions && prev.permissions.length > 0 ? prev.permissions : defaults)
      }));
  };

  const togglePermission = (resource: PermissionResource, action: PermissionAction) => {
      setFormData(prev => {
          const currentPerms = prev.permissions || [];
          const resourcePerm = currentPerms.find(p => p.resource === resource);
          let newPerms;
          if (resourcePerm) {
              const hasAction = resourcePerm.actions.includes(action);
              const newActions = hasAction ? resourcePerm.actions.filter(a => a !== action) : [...resourcePerm.actions, action];
              newPerms = currentPerms.map(p => p.resource === resource ? { ...p, actions: newActions } : p);
          } else {
              newPerms = [...currentPerms, { resource, actions: [action] }];
          }
          return { ...prev, permissions: newPerms };
      });
  };

  const handleSave = async (e: React.SyntheticEvent) => {
      e.preventDefault();
      setModalError(null);
      
      // Validation with Feedback
      if (!formData.name) return setModalError("يرجى إدخال الاسم");
      if (!formData.username) return setModalError("يرجى إدخال اسم المستخدم");
      if (!formData.id && !formData.password) return setModalError("يرجى إدخال كلمة المرور للمستخدم الجديد");

      if (currentUser?.role === 'supervisor' && formData.role === 'admin') return setModalError("عفواً، لا يمكنك إنشاء حساب مدير.");
      if (currentUser?.role === 'supervisor' && formData.role === 'supervisor') return setModalError("عفواً، لا يمكنك إنشاء حساب مشرف آخر.");

      setIsSaving(true);
      try {
          await saveUser(formData as User);
          setIsModalOpen(false);
          loadData();
      } catch (error: any) {
          console.error(error);
          setModalError(error.message || "حدث خطأ غير معروف");
      } finally {
          setIsSaving(false);
      }
  };

  const handleDelete = async () => {
      if (!formData.id) return;
      if (formData.username === 'admin') {
          setModalError("لا يمكن حذف الحساب الرئيسي (Super Admin)");
          return;
      }
      if (window.confirm('هل أنت متأكد من حذف هذا المستخدم نهائياً؟')) {
          try {
            await deleteUser(formData.id);
            setIsModalOpen(false);
            loadData();
          } catch (error: any) {
            setModalError("فشل الحذف: " + error.message);
          }
      }
  };

  const handleToggleStatus = async () => {
    if (!formData.id) return;
    if (formData.username === 'admin') {
        setModalError("لا يمكن إيقاف الحساب الرئيسي (Super Admin)");
        return;
    }
    try {
        await toggleUserStatus(formData.id);
        setFormData(prev => ({ ...prev, isActive: !prev.isActive }));
        loadData();
    } catch (error: any) {
        setModalError("فشل تغيير الحالة: " + error.message);
    }
  };

  const handleResetDevice = async () => {
      if (!formData.id) return;
      if (window.confirm('سيتم فك ارتباط الجهاز الحالي بهذا الحساب والسماح له بالدخول من جهاز جديد. هل أنت متأكد؟')) {
          try {
              await resetUserDevice(formData.id);
              setFormData(prev => ({ ...prev, deviceId: null }));
              loadData();
              alert('تم فك ارتباط الجهاز بنجاح.');
          } catch (error: any) {
              setModalError('فشل في فك الارتباط: ' + error.message);
          }
      }
  }

  const isPermitted = (resource: string, action: string) => {
      const p = formData.permissions?.find(x => x.resource === resource);
      return p?.actions.includes(action as any);
  };

  // Logic Check for Self Editing & Roles
  const isEditingSelf = currentUser?.id === formData.id;
  const isTargetSuperAdmin = formData.username === 'admin';
  const amISupervisor = currentUser?.role === 'supervisor';
  
  // Filter resources to hide sensitive ones AND hide rows where current user has NO permissions
  const visibleResources = RESOURCES.filter(res => {
      // 1. Hard restriction for system_logs (only admins)
      if (res.id === 'system_logs' && currentUser?.role !== 'admin') return false;

      // 2. Strict Rule #1: If I don't have ANY access to this resource, I shouldn't see it as an option to grant
      const hasAnyAccess = ACTIONS.some(act => hasPermission(currentUser!, res.id, act.id));
      if (!hasAnyAccess) return false;

      return true;
  });

  if (!currentUser) return <div>Access Denied</div>;

  const stats = {
      total: users.length,
      active: users.filter(u => u.isActive).length,
      inactive: users.filter(u => !u.isActive).length,
      admins: users.filter(u => u.role === 'admin').length,
      supervisors: users.filter(u => u.role === 'supervisor').length,
      delegates: users.filter(u => u.role === 'delegate').length,
  };

  const StatCard = ({ title, value, icon, color, bg }: any) => (
      <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between min-w-[110px] md:min-w-[130px] snap-start">
            <div className="flex justify-between items-start mb-2">
                <span className={`text-[10px] md:text-xs font-bold ${color}`}>{title}</span>
                <div className={`${bg} ${color.replace('text-', 'text-opacity-80 ')} p-1.5 rounded-lg`}>{icon}</div>
            </div>
            <span className="text-xl font-bold text-gray-800">{value}</span>
      </div>
  );

  return (
    <div className="flex flex-col space-y-4 pb-24 md:pb-0">
       
       {/* شريط الإحصائيات - قابل للتمرير */}
       <div className="flex overflow-x-auto gap-3 pb-2 -mx-2 px-2 md:mx-0 md:px-0 md:grid md:grid-cols-5 md:overflow-visible no-scrollbar snap-x">
            <StatCard title="إجمالي الفريق" value={stats.total} icon={<Icons.Users />} color="text-gray-500" bg="bg-gray-50" />
            <StatCard title="حساب نشط" value={stats.active} icon={<Icons.Check />} color="text-green-600" bg="bg-green-50" />
            <StatCard title="موقوف" value={stats.inactive} icon={<Icons.Ban />} color="text-red-500" bg="bg-red-50" />
            {currentUser.role !== 'supervisor' && <StatCard title="مشرفين" value={stats.supervisors} icon={<Icons.Shield />} color="text-purple-500" bg="bg-purple-50" />}
            <StatCard title="مناديب" value={stats.delegates} icon={<Icons.User />} color="text-blue-500" bg="bg-blue-50" />
       </div>

       {/* الهيدر وزر الإضافة */}
       <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-100 shadow-sm sticky top-0 z-10">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Icons.Users />
                <span>إدارة المستخدمين</span>
            </h2>
            <button onClick={() => handleOpenModal()} className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-xs font-bold shadow-lg shadow-blue-500/20 active:scale-95">
                <Icons.Plus />
                <span>عضو جديد</span>
            </button>
       </div>

       {/* التحميل */}
       {loading && (
           <div className="text-center py-10">
               <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
               <p className="text-gray-400 text-sm mt-2">جاري تحميل البيانات...</p>
           </div>
       )}

       {/* جدول الديسك توب */}
       {!loading && (
       <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-right min-w-[600px]">
                    <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
                        <tr>
                            <th className="px-4 py-3 text-center w-12">#</th>
                            <th className="px-6 py-3">الموظف</th>
                            <th className="px-6 py-3">الدور الوظيفي</th>
                            <th className="px-6 py-3">المدير المباشر</th>
                            <th className="px-6 py-3 text-center">الجهاز</th>
                            <th className="px-6 py-3 text-center">الحالة</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                         {users.map((user, index) => (
                            <tr key={user.id} onClick={() => handleOpenModal(user)} className={`hover:bg-blue-50 cursor-pointer transition-colors group ${isSuperAdmin(user.username) ? 'bg-yellow-50/50' : ''}`}>
                                <td className="px-4 py-4 text-center text-gray-400 font-mono text-xs">{index + 1}</td>
                                <td className="px-6 py-4 flex items-center gap-3">
                                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm ${user.role === 'admin' ? 'bg-gray-800' : user.role === 'supervisor' ? 'bg-purple-600' : 'bg-blue-500'}`}>{user.name.charAt(0)}</div>
                                    <div>
                                        <div className="font-bold text-sm text-gray-800 group-hover:text-primary transition-colors flex items-center gap-2">
                                            {user.name} 
                                            {isSuperAdmin(user.username) && <Icons.Shield />}
                                            {user.id === currentUser.id && <span className="text-[10px] text-gray-400 bg-gray-100 px-1 rounded">(أنت)</span>}
                                        </div>
                                        <div className="text-xs text-gray-400 font-mono">@{user.username}</div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                                        user.role === 'admin' ? 'bg-gray-100 text-gray-700 border-gray-200' : 
                                        user.role === 'supervisor' ? 'bg-purple-50 text-purple-700 border-purple-100' : 
                                        'bg-blue-50 text-blue-700 border-blue-100'
                                    }`}>
                                        {isSuperAdmin(user.username) ? 'Super Admin' : (user.role === 'admin' ? 'مدير نظام' : user.role === 'supervisor' ? 'مشرف منطقة' : 'مندوب ميداني')}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-xs font-medium text-gray-500">{user.supervisorId ? users.find(u => u.id === user.supervisorId)?.name : '-'}</td>
                                <td className="px-6 py-4 text-center">
                                    {user.deviceId ? (
                                        <span className="text-[10px] bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-100 font-bold">مرتبط</span>
                                    ) : (
                                        <span className="text-[10px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full font-bold">غير مرتبط</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${user.isActive ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
       </div>
       )}

       {/* بطاقات الموبايل */}
       {!loading && (
        <div className="md:hidden space-y-3">
            {users.map((user, index) => (
                <div key={user.id} onClick={() => handleOpenModal(user)} className={`bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4 active:scale-[0.98] transition-transform cursor-pointer relative overflow-hidden ${isSuperAdmin(user.username) ? 'ring-2 ring-yellow-400/20' : ''}`}>
                     <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${user.isActive ? 'bg-green-500' : 'bg-red-500'}`}></div>
                     <div className="text-[10px] text-gray-300 font-mono absolute top-2 left-3">#{index + 1}</div>
                     <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold shrink-0 shadow-md border-2 border-white ${user.role === 'admin' ? 'bg-gray-800' : user.role === 'supervisor' ? 'bg-purple-600' : 'bg-blue-500'}`}>
                         {user.name.charAt(0)}
                     </div>
                     <div className="flex-1 min-w-0">
                         <h3 className="font-bold text-gray-900 truncate text-sm flex items-center gap-1">
                             {user.name}
                             {isSuperAdmin(user.username) && <span className="text-yellow-500"><Icons.Shield /></span>}
                             {user.id === currentUser.id && <span className="text-[8px] bg-gray-100 text-gray-500 px-1 rounded-sm font-normal">أنت</span>}
                         </h3>
                         <div className="flex items-center gap-2 mt-0.5">
                             <span className="text-xs text-gray-400 font-mono">@{user.username}</span>
                             <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                 user.role === 'admin' ? 'bg-gray-100 text-gray-600' : user.role === 'supervisor' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'
                             }`}>
                                 {isSuperAdmin(user.username) ? 'Super Admin' : (user.role === 'admin' ? 'مدير' : user.role === 'supervisor' ? 'مشرف' : 'مندوب')}
                             </span>
                         </div>
                     </div>
                     <div className="bg-blue-50 text-blue-600 p-2 rounded-lg">
                         <Icons.Edit />
                     </div>
                </div>
            ))}
        </div>
       )}

       {/* النافذة المنبثقة للتعديل */}
       {isModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-2">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col animate-in zoom-in-95">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-2xl">
                <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                    {formData.id ? 'بيانات المستخدم' : 'إضافة عضو جديد'}
                    {isTargetSuperAdmin && <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><Icons.Shield /> Super Admin</span>}
                </h3>
                <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-red-500"><Icons.X /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {modalError && (
                    <div className="bg-red-50 text-red-600 p-4 rounded-xl flex items-start gap-3 border border-red-100">
                        <Icons.Ban />
                        <div className="text-sm font-bold">{modalError}</div>
                    </div>
                )}

                {/* تحذير عند تعديل النفس */}
                {isEditingSelf && !isTargetSuperAdmin && (
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex gap-3 items-start text-sm text-blue-800">
                        <Icons.Shield />
                        <div>
                            <span className="font-bold block">حماية الصلاحيات</span>
                            <span className="opacity-80 text-xs">لا يمكنك تعديل صلاحياتك أو دورك الوظيفي بنفسك. يرجى التواصل مع مدير آخر إذا تطلب الأمر.</span>
                        </div>
                    </div>
                )}

                {/* إدارة ربط الجهاز */}
                {formData.id && (
                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${formData.deviceId ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-500'}`}>
                                <Icons.Smartphone />
                            </div>
                            <div>
                                <span className="font-bold block text-sm text-gray-800">حالة الجهاز</span>
                                <span className={`text-xs ${formData.deviceId ? 'text-green-600 font-bold' : 'text-gray-500'}`}>
                                    {formData.deviceId ? 'الحساب مرتبط بجهاز حالياً' : 'لا يوجد جهاز مرتبط'}
                                </span>
                            </div>
                        </div>
                        {formData.deviceId && !isEditingSelf && (
                            <button 
                                onClick={handleResetDevice}
                                className="text-xs bg-red-50 text-red-600 border border-red-100 px-3 py-1.5 rounded-lg font-bold hover:bg-red-100 flex items-center gap-1"
                            >
                                <Icons.Unlink /> فك الارتباط
                            </button>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-bold text-gray-500 block mb-1">الاسم الكامل</label>
                        <input type="text" required placeholder="الاسم" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                    <div>
                         <label className="text-xs font-bold text-gray-500 block mb-1">البريد الإلكتروني</label>
                         <input type="email" required placeholder="Email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 block mb-1">اسم المستخدم</label>
                        <input type="text" required placeholder="Username" disabled={!!formData.id} value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 block mb-1">كلمة المرور</label>
                        <input type="password" placeholder={formData.id ? "تغيير كلمة المرور..." : "كلمة المرور"} value={formData.password || ''} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                    
                    <div>
                        <label className="text-xs font-bold text-gray-500 block mb-1">نوع الحساب</label>
                        <select 
                            value={formData.role} 
                            onChange={(e) => handleRoleChange(e.target.value)} 
                            disabled={isEditingSelf || amISupervisor || isTargetSuperAdmin} 
                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500"
                        >
                            {!amISupervisor && <option value="admin">مدير نظام (Admin)</option>}
                            {!amISupervisor && <option value="supervisor">مشرف (Supervisor)</option>}
                            <option value="delegate">مندوب (Delegate)</option>
                        </select>
                    </div>

                    {/* Supervisor Select: Hide if I am a Supervisor (Implicitly set to me) */}
                    {(formData.role === 'delegate' || formData.role === 'supervisor') && !amISupervisor && (
                        <div>
                            <label className="text-xs font-bold text-gray-500 block mb-1">المشرف المسؤول</label>
                            <select 
                                value={formData.supervisorId || ''} 
                                onChange={(e) => setFormData({...formData, supervisorId: Number(e.target.value)})} 
                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100"
                            >
                                <option value="">-- اختر المشرف --</option>
                                {supervisors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                    )}
                </div>
                
                {/* جدول الصلاحيات */}
                <div>
                    <h4 className="font-bold text-sm text-gray-500 mb-2 uppercase border-b pb-1 flex justify-between">
                        <span>صلاحيات الوصول</span>
                        {isEditingSelf && !isTargetSuperAdmin && <span className="text-xs text-red-500 font-normal">(للعرض فقط)</span>}
                    </h4>
                    
                    {isTargetSuperAdmin ? (
                        <div className="bg-yellow-50 text-yellow-800 p-4 rounded-xl text-center border border-yellow-200">
                            <Icons.Shield />
                            <h3 className="font-bold mt-2">صلاحيات كاملة تلقائية</h3>
                            <p className="text-xs mt-1">هذا الحساب يمتلك كافة الصلاحيات بشكل دائم ولا يمكن تقييده.</p>
                        </div>
                    ) : (
                        <div className={`border rounded-xl overflow-hidden text-sm mt-3 ${isEditingSelf ? 'opacity-60 pointer-events-none grayscale-[0.5]' : ''}`}>
                             <table className="w-full text-center">
                                 <thead className="bg-gray-100 text-xs text-gray-600">
                                     <tr><th className="p-2 text-right">القسم</th>{ACTIONS.map(a => <th key={a.id} className="p-2">{a.label}</th>)}</tr>
                                 </thead>
                                 <tbody>
                                     {visibleResources.map(res => (
                                         <tr key={res.id} className="border-t border-gray-50 hover:bg-gray-50">
                                             <td className="p-2 text-right font-bold text-gray-700 bg-gray-50/50">{res.label}</td>
                                             {ACTIONS.map(act => {
                                                 if (res.id === 'dashboard' && act.id !== 'view') return <td key={act.id}></td>;
                                                 if (res.id === 'search_odb' && !['view', 'edit'].includes(act.id)) return <td key={act.id}></td>;

                                                 // Rule #1: Visual enforcement of Delegation Rule
                                                 const userHasThisPerm = hasPermission(currentUser!, res.id, act.id);
                                                 if (!userHasThisPerm) {
                                                     return <td key={act.id} className="bg-gray-50 p-2"><div className="w-1 h-1 bg-gray-300 rounded-full mx-auto"></div></td>;
                                                 }

                                                 const checked = isPermitted(res.id, act.id);
                                                 const disabled = isEditingSelf; 
                                                 
                                                 return (
                                                     <td key={act.id} className="p-2 border-l border-gray-50">
                                                         <input 
                                                            type="checkbox" 
                                                            checked={!!checked} 
                                                            disabled={disabled} 
                                                            onChange={() => togglePermission(res.id, act.id)} 
                                                            className="w-5 h-5 accent-blue-600 cursor-pointer disabled:opacity-30 rounded focus:ring-0" 
                                                         />
                                                     </td>
                                                 )
                                             })}
                                         </tr>
                                     ))}
                                 </tbody>
                             </table>
                        </div>
                    )}
                </div>
            </div>

            {/* شريط الأزرار */}
            <div className="p-4 border-t bg-gray-50 rounded-b-2xl flex items-center gap-3">
                {/* زر الحذف */}
                {formData.id && !isEditingSelf && !isTargetSuperAdmin && (
                    <button 
                        onClick={handleDelete} 
                        className="bg-red-50 text-red-600 w-12 h-12 md:w-auto md:px-4 md:py-2.5 rounded-xl font-bold hover:bg-red-100 transition-colors flex items-center justify-center gap-2 border border-red-100"
                        title="حذف المستخدم ."
                    >
                        <Icons.Trash /> 
                        <span className="hidden md:inline">حذف</span>
                    </button>
                )}

                {/* زر الحالة */}
                {formData.id && !isEditingSelf && !isTargetSuperAdmin && (
                    <button 
                        onClick={handleToggleStatus}
                        className={`w-12 h-12 md:w-auto md:px-4 md:py-2.5 md:flex-1 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors border ${formData.isActive ? 'bg-orange-50 text-orange-700 border-orange-100 hover:bg-orange-100' : 'bg-green-50 text-green-700 border-green-100 hover:bg-green-100'}`}
                        title={formData.isActive ? 'إيقاف الحساب' : 'تنشيط الحساب'}
                    >
                        {formData.isActive ? <Icons.Ban /> : <Icons.Check />}
                        <span className="hidden md:inline">{formData.isActive ? 'إيقاف الحساب' : 'تنشيط الحساب'}</span>
                    </button>
                )}

                {/* زر الحفظ */}
                <button 
                    onClick={handleSave} 
                    disabled={isSaving}
                    className="flex-1 h-12 md:h-auto md:px-6 md:py-2.5 rounded-xl font-bold text-white bg-primary hover:bg-blue-700 transition-colors disabled:opacity-70 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
                >
                    {isSaving ? <span className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin"></span> : 'حفظ التعديلات'}
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper function to safely check for super admin username
const isSuperAdmin = (username: string) => username === 'admin';

export default UserManagement;
