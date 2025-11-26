
import React, { useState, useEffect } from 'react';
import { User, RoleDefinition, PermissionResource, PermissionAction, PermissionScope } from '../types';
import { getUsers, saveUser, deleteUser, toggleUserStatus, getSession, getRoles, saveRole, deleteRole } from '../services/mockBackend';
import { Icons } from './Icons';

const RESOURCES: { id: PermissionResource; label: string }[] = [
  { id: 'dashboard', label: 'لوحة التحكم' },
  { id: 'odb', label: 'مواقع ODB' },
  { id: 'search_odb', label: 'بحث ODB' },
  { id: 'map_filter', label: 'خريطة الأماكن' },
  { id: 'my_activity', label: 'نشاطي' },
  { id: 'users', label: 'إدارة المستخدمين' },
  { id: 'roles', label: 'إدارة الأدوار' },
  { id: 'settings', label: 'إعدادات النظام' },
  { id: 'system_logs', label: 'سجلات النظام' },
];

const ACTIONS: { id: PermissionAction; label: string }[] = [
  { id: 'view', label: 'عرض' },
  { id: 'create', label: 'إضافة' },
  { id: 'edit', label: 'تعديل' },
  { id: 'delete', label: 'حذف' },
  { id: 'export', label: 'تصدير' },
];

const SCOPES: { id: PermissionScope; label: string; color: string }[] = [
    { id: 'none', label: 'ممنوع', color: 'text-red-500 bg-red-50' },
    { id: 'own', label: 'الخاص بي', color: 'text-blue-500 bg-blue-50' },
    { id: 'team', label: 'فريقي', color: 'text-purple-500 bg-purple-50' },
    { id: 'all', label: 'الكل', color: 'text-green-500 bg-green-50' },
];

const UserManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users');
  const [currentUser] = useState<User | null>(getSession());
  const [loading, setLoading] = useState(false);
  
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  
  const [editingUser, setEditingUser] = useState<Partial<User>>({});
  const [editingRole, setEditingRole] = useState<Partial<RoleDefinition>>({});

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
        // Fetch roles fresh from server
        const r = await getRoles();
        setRoles(r);

        if (activeTab === 'users') {
            const u = await getUsers(currentUser);
            setUsers(u.filter(x => x.username !== 'admin')); 
        }
    } catch(e) { console.error(e); } 
    finally { setLoading(false); }
  };

  // --- ROLE HANDLERS ---
  const handleEditRole = (role?: RoleDefinition) => {
      if (role) {
          setEditingRole(JSON.parse(JSON.stringify(role))); 
      } else {
          setEditingRole({
              id: `role_${Date.now()}`,
              name: '',
              isSystem: false,
              permissions: []
          });
      }
      setRoleModalOpen(true);
  };

  const handleSaveRole = async () => {
      if (!editingRole.name) return alert("الاسم مطلوب");
      setLoading(true);
      try {
          await saveRole(editingRole as RoleDefinition);
          alert("تم حفظ الصلاحيات والدور بنجاح");
          setRoleModalOpen(false);
          await loadData(); // Reload to sync UI with DB
      } catch (e) {
          alert("حدث خطأ أثناء الحفظ");
      } finally {
          setLoading(false);
      }
  };

  const handleDeleteRole = async (id: string) => {
      if(window.confirm("حذف الدور؟")) {
          setLoading(true);
          await deleteRole(id);
          await loadData();
          setLoading(false);
      }
  };

  const updateRolePerm = (resource: PermissionResource, action: PermissionAction, scope: PermissionScope) => {
      setEditingRole(prev => {
          const currentPerms = prev.permissions || [];
          const filtered = currentPerms.filter(p => !(p.resource === resource && p.action === action));
          // Only add if scope is NOT none, or keep it to track explicit 'none' if preferred.
          // For now, we push everything so state tracks the UI correctly.
          filtered.push({ resource, action, scope });
          return { ...prev, permissions: filtered };
      });
  };

  const getScope = (res: string, act: string) => {
      const p = editingRole.permissions?.find(x => x.resource === res && x.action === act);
      return p?.scope || 'none';
  };

  // --- USER HANDLERS ---
  const handleEditUser = (user?: User) => {
      if (user) {
          setEditingUser({ ...user, password: '' });
      } else {
          setEditingUser({
              id: 0,
              username: '',
              name: '',
              email: '',
              role: roles.find(r => r.id === 'delegate')?.id || 'delegate',
              password: '',
              isActive: true,
              supervisorId: currentUser?.role === 'supervisor' ? currentUser.id : null
          });
      }
      setUserModalOpen(true);
  };

  const handleSaveUser = async () => {
      if (!editingUser.username || !editingUser.name) return alert("بيانات ناقصة");
      
      const userToSave: User = {
          ...(editingUser as User),
          permissions: [] // Send empty to force inheritance from Role in DB
      };

      setLoading(true);
      await saveUser(userToSave);
      setUserModalOpen(false);
      await loadData();
      setLoading(false);
  };

  const handleDeleteUser = async (id: number) => {
      if(window.confirm("حذف المستخدم؟")) {
          await deleteUser(id);
          loadData();
      }
  };

  return (
    <div className="space-y-6 pb-20">
        <div className="flex bg-white p-1 rounded-xl shadow-sm border border-gray-100 w-fit">
            <button onClick={() => setActiveTab('users')} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'users' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
                <span className="flex items-center gap-2"><Icons.Users /> المستخدمين</span>
            </button>
            <button onClick={() => setActiveTab('roles')} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'roles' ? 'bg-purple-50 text-purple-700' : 'text-gray-500 hover:text-gray-700'}`}>
                <span className="flex items-center gap-2"><Icons.Shield /> الأدوار والصلاحيات</span>
            </button>
        </div>

        {activeTab === 'users' && (
            <div className="space-y-4 animate-in fade-in">
                 <div className="flex justify-between items-center">
                    <h3 className="text-lg font-bold text-gray-800">قائمة الفريق</h3>
                    <button onClick={() => handleEditUser()} className="bg-primary text-white px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2">
                        <Icons.Plus /> إضافة
                    </button>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {users.map(u => {
                        const roleName = roles.find(r => r.id === u.role)?.name || u.role;
                        return (
                            <div key={u.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4 group hover:border-blue-200">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg ${u.role === 'admin' ? 'bg-gray-800' : u.role === 'supervisor' ? 'bg-purple-600' : 'bg-blue-500'}`}>
                                    {u.name.charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-gray-900 truncate">{u.name}</h4>
                                    <p className="text-xs text-gray-500">@{u.username}</p>
                                    <span className="inline-block mt-1 text-[10px] bg-gray-100 px-2 py-0.5 rounded text-gray-600 font-bold">{roleName}</span>
                                </div>
                                <button onClick={() => handleEditUser(u)} className="p-2 text-gray-400 hover:text-blue-600 bg-gray-50 rounded-lg">
                                    <Icons.Edit />
                                </button>
                            </div>
                        )
                    })}
                 </div>
            </div>
        )}

        {activeTab === 'roles' && (
             <div className="space-y-4 animate-in fade-in">
                <div className="flex justify-between items-center">
                   <h3 className="text-lg font-bold text-gray-800">الأدوار المتاحة</h3>
                   <button onClick={() => handleEditRole()} className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2">
                       <Icons.Plus /> دور جديد
                   </button>
                </div>
                
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <table className="w-full text-right">
                        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                            <tr>
                                <th className="px-6 py-3">اسم الدور</th>
                                <th className="px-6 py-3">النوع</th>
                                <th className="px-6 py-3 text-center">أدوات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {roles.map(r => (
                                <tr key={r.id}>
                                    <td className="px-6 py-4 font-bold text-gray-800">{r.name}</td>
                                    <td className="px-6 py-4">
                                        {r.isSystem ? <span className="bg-yellow-100 text-yellow-800 text-[10px] px-2 py-1 rounded font-bold">نظام أساسي</span> : <span className="bg-gray-100 text-gray-600 text-[10px] px-2 py-1 rounded font-bold">مخصص</span>}
                                    </td>
                                    <td className="px-6 py-4 text-center flex justify-center gap-2">
                                        <button onClick={() => handleEditRole(r)} className="text-blue-600 hover:bg-blue-50 p-2 rounded"><Icons.Edit /></button>
                                        {!r.isSystem && <button onClick={() => handleDeleteRole(r.id)} className="text-red-600 hover:bg-red-50 p-2 rounded"><Icons.Trash /></button>}
                                        {r.isSystem && <button onClick={() => handleDeleteRole(r.id)} disabled={true} className="text-gray-300 p-2 cursor-not-allowed opacity-50"><Icons.Trash /></button>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
           </div>
        )}

        {userModalOpen && (
             <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl animate-in zoom-in-95">
                    <h3 className="font-bold text-lg mb-4">{editingUser.id ? 'تعديل مستخدم' : 'مستخدم جديد'}</h3>
                    <div className="space-y-3">
                        <input type="text" placeholder="الاسم" className="w-full p-3 border rounded-xl" value={editingUser.name} onChange={e => setEditingUser({...editingUser, name: e.target.value})} />
                        <input type="text" placeholder="اسم المستخدم" disabled={!!editingUser.id} className="w-full p-3 border rounded-xl disabled:bg-gray-100" value={editingUser.username} onChange={e => setEditingUser({...editingUser, username: e.target.value})} />
                        <input type="password" placeholder="كلمة المرور" className="w-full p-3 border rounded-xl" value={editingUser.password} onChange={e => setEditingUser({...editingUser, password: e.target.value})} />
                        
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">الدور الوظيفي</label>
                            <select className="w-full p-3 border rounded-xl bg-white" value={editingUser.role} onChange={e => setEditingUser({...editingUser, role: e.target.value})}>
                                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                            </select>
                        </div>
                        
                        <div className="flex justify-between items-center bg-gray-50 p-3 rounded-xl">
                            <span className="text-sm font-bold">حالة الحساب</span>
                            <button onClick={() => setEditingUser({...editingUser, isActive: !editingUser.isActive})} className={`px-3 py-1 rounded text-xs font-bold ${editingUser.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {editingUser.isActive ? 'نشط' : 'موقوف'}
                            </button>
                        </div>
                    </div>
                    <div className="mt-6 flex gap-3">
                        <button onClick={handleSaveUser} disabled={loading} className="flex-1 bg-primary text-white py-3 rounded-xl font-bold">{loading ? '...' : 'حفظ'}</button>
                        <button onClick={() => setUserModalOpen(false)} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-bold">إلغاء</button>
                    </div>
                    {editingUser.id !== 0 && (
                        <button onClick={() => handleDeleteUser(editingUser.id!)} className="w-full mt-3 text-red-500 text-xs font-bold hover:bg-red-50 py-2 rounded">حذف المستخدم</button>
                    )}
                </div>
             </div>
        )}

        {roleModalOpen && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-2 md:p-6">
                <div className="bg-white rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95">
                    <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-2xl">
                        <h3 className="font-bold text-lg">
                            {editingRole.isSystem ? `تعديل دور النظام: ${editingRole.name}` : `تخصيص الدور: ${editingRole.name || 'جديد'}`}
                        </h3>
                        <button onClick={() => setRoleModalOpen(false)}><Icons.X /></button>
                    </div>

                    <div className="p-4 border-b bg-white">
                        <label className="text-xs font-bold text-gray-500 block mb-1">اسم الدور</label>
                        <input type="text" value={editingRole.name} onChange={e => setEditingRole({...editingRole, name: e.target.value})} className="w-full md:w-1/3 p-2 border rounded-lg focus:ring-2 focus:ring-purple-500" placeholder="مثال: مراجع مالي" />
                    </div>

                    <div className="flex-1 overflow-auto p-4 bg-gray-50">
                        {editingRole.isSystem && (
                            <div className="mb-4 bg-orange-50 p-3 rounded text-sm text-orange-800 border border-orange-200 flex items-center gap-2">
                                <Icons.Shield />
                                <span>تنبيه: أنت تقوم بتعديل دور أساسي في النظام. التعديلات ستطبق فوراً على جميع المستخدمين المرتبطين بهذا الدور.</span>
                            </div>
                        )}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <table className="w-full text-center border-collapse">
                                <thead className="bg-gray-100 text-xs text-gray-600 sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className="p-3 text-right min-w-[150px] bg-gray-100 z-20 sticky right-0 border-l">المورد (الشاشة)</th>
                                        {ACTIONS.map(a => <th key={a.id} className="p-3 min-w-[100px] border-l last:border-l-0">{a.label}</th>)}
                                    </tr>
                                </thead>
                                <tbody className="text-sm">
                                    {RESOURCES.map(res => (
                                        <tr key={res.id} className="border-t hover:bg-gray-50">
                                            <td className="p-3 text-right font-bold text-gray-700 bg-gray-50/50 sticky right-0 border-l z-10">{res.label}</td>
                                            {ACTIONS.map(act => {
                                                const currentScope = getScope(res.id, act.id);
                                                if (res.id === 'dashboard' && act.id !== 'view') return <td key={act.id} className="bg-gray-100/50"></td>;
                                                return (
                                                    <td key={act.id} className="p-2 border-l last:border-l-0">
                                                        <select 
                                                            value={currentScope}
                                                            onChange={(e) => updateRolePerm(res.id, act.id, e.target.value as PermissionScope)}
                                                            className={`w-full p-1.5 rounded text-xs font-bold border-2 cursor-pointer outline-none transition-colors ${
                                                                currentScope === 'none' ? 'border-gray-200 text-gray-400 bg-white' :
                                                                currentScope === 'own' ? 'border-blue-200 text-blue-700 bg-blue-50' :
                                                                currentScope === 'team' ? 'border-purple-200 text-purple-700 bg-purple-50' :
                                                                'border-green-200 text-green-700 bg-green-50'
                                                            }`}
                                                        >
                                                            {SCOPES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                                                        </select>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="p-4 border-t bg-white rounded-b-2xl flex justify-end gap-3">
                         <button onClick={() => setRoleModalOpen(false)} className="px-6 py-2 rounded-xl font-bold text-gray-600 hover:bg-gray-100">إغلاق</button>
                         <button onClick={handleSaveRole} disabled={loading} className="px-6 py-2 rounded-xl font-bold bg-purple-600 text-white hover:bg-purple-700 shadow-lg shadow-purple-500/20">
                             {loading ? 'جاري الحفظ...' : 'حفظ التغييرات'}
                         </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default UserManagement;
