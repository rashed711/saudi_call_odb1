
import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import ODBTable from './components/ODBTable';
import Profile from './components/Profile';
import SiteSettingsComponent from './components/SiteSettings';
import UserManagement from './components/UserManagement';
import MyActivity from './components/MyActivity';
import MapFilter from './components/MapFilter';
import SearchODB from './components/SearchODB';
import SystemLogs from './components/SystemLogs';
import { Icons } from './components/Icons';
import { User, View } from './types';
import { getSession, mockLogout, getSiteSettings, applySiteSettings, hasPermission, refreshUserSession } from './services/mockBackend';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<View>(View.DASHBOARD);
  const [siteName, setSiteName] = useState('ODB Manager Pro');
  
  // حالة نافذة تأكيد الخروج
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  // 1. Load Settings & Session on Mount
  useEffect(() => {
    const session = getSession();
    if (session) setUser(session);

    const loadSettings = async () => {
        try {
            const settings = await getSiteSettings();
            setSiteName(settings.siteName);
            applySiteSettings(settings);
        } catch (e) {}
    };
    loadSettings();
    const interval = setInterval(loadSettings, 10000); // Reload settings every 10s
    return () => clearInterval(interval);
  }, []);

  // 2. Security Heartbeat & Real-Time Permissions Sync
  useEffect(() => {
    if (!user) return;

    const syncSession = async () => {
        try {
            // Fetch fresh user data from server
            const freshUser = await refreshUserSession(user.id);
            
            if (freshUser) {
                // Check if banned/inactive
                if (!freshUser.isActive) {
                    alert('تم إيقاف حسابك من قبل الإدارة. سيتم تسجيل الخروج.');
                    handleLogoutForce();
                    return;
                }

                // Check for Permission/Role changes
                const permsChanged = JSON.stringify(freshUser.permissions) !== JSON.stringify(user.permissions);
                const roleChanged = freshUser.role !== user.role;
                
                if (permsChanged || roleChanged) {
                    console.log("Permissions updated remotely");
                    setUser(freshUser);
                    localStorage.setItem('odb_user_session_v6_final', JSON.stringify(freshUser));
                }
            }
        } catch (e: any) {
            if (e.message && (e.message.includes('Forbidden') || e.message.includes('403'))) {
                handleLogoutForce();
            }
        }
    };

    const statusInterval = setInterval(syncSession, 5000);
    return () => clearInterval(statusInterval);
  }, [user]);

  const handleLoginSuccess = (u: User) => {
    setUser(u);
    // Redirect logic: Priority to Map Filter as requested
    if (hasPermission(u, 'map_filter', 'view')) {
      setCurrentView(View.MAP_FILTER);
    } else {
      setCurrentView(View.DASHBOARD);
    }
  };

  // فتح نافذة التأكيد بدلاً من رسالة المتصفح
  const handleLogout = () => {
      setIsLogoutModalOpen(true);
  };

  // تنفيذ الخروج الفعلي
  const confirmLogout = () => {
      mockLogout();
      setUser(null);
      setCurrentView(View.LOGIN);
      setIsLogoutModalOpen(false);
  };

  const handleLogoutForce = () => {
      mockLogout();
      setUser(null);
      setCurrentView(View.LOGIN);
  };

  if (!user) return <Login onLoginSuccess={handleLoginSuccess} />;

  // Permission check helper
  const can = (resource: string, action: string) => hasPermission(user, resource, action);

  const renderContent = () => {
    switch (currentView) {
      case View.SETTINGS_ODB: 
        return can('odb', 'view') ? <ODBTable user={user} /> : <AccessDenied />;
      case View.SEARCH_ODB:
        return can('search_odb', 'view') ? <SearchODB user={user} /> : <AccessDenied />;
      case View.MAP_FILTER:
        return can('map_filter', 'view') ? <MapFilter user={user} /> : <AccessDenied />;
      case View.PROFILE: 
        return <Profile user={user} />;
      case View.SETTINGS_SITE: 
        return can('settings', 'view') ? <SiteSettingsComponent /> : <AccessDenied />;
      case View.USERS: 
        return can('users', 'view') ? <UserManagement /> : <AccessDenied />;
      case View.MY_ACTIVITY: 
        return can('my_activity', 'view') ? <MyActivity user={user} /> : <AccessDenied />;
      case View.SYSTEM_LOGS:
        return can('system_logs', 'view') ? <SystemLogs user={user} /> : <AccessDenied />;
      case View.DASHBOARD:
      default:
        return (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6 pb-4">
            {can('map_filter', 'view') && (
                <DashboardCard onClick={() => setCurrentView(View.MAP_FILTER)} icon={<Icons.Map />} color="green" title="خريطة الأماكن" desc="بحث بالنطاق الجغرافي" />
            )}
            {can('search_odb', 'view') && (
                <DashboardCard onClick={() => setCurrentView(View.SEARCH_ODB)} icon={<Icons.Search />} color="blue" title="استعلام ODB" desc="بحث سريع بالكود" />
            )}
            {can('odb', 'view') && (
                <DashboardCard onClick={() => setCurrentView(View.SETTINGS_ODB)} icon={<Icons.Database />} color="blue" title="إدارة المواقع" desc="السجل العام" />
            )}
            {can('my_activity', 'view') && (
                <DashboardCard onClick={() => setCurrentView(View.MY_ACTIVITY)} icon={<Icons.Check />} color="orange" title="نشاطي" desc="المواقع التي أضفتها" />
            )}
            {can('users', 'view') && (
                <DashboardCard onClick={() => setCurrentView(View.USERS)} icon={<Icons.Users />} color="gray" title="فريق العمل" desc="إدارة الصلاحيات والهيكل" />
            )}
            {can('system_logs', 'view') && (
                <DashboardCard onClick={() => setCurrentView(View.SYSTEM_LOGS)} icon={<Icons.FileText />} color="orange" title="سجلات النظام" desc="تتبع العمليات والأمان" />
            )}
            {can('settings', 'view') && (
                <DashboardCard onClick={() => setCurrentView(View.SETTINGS_SITE)} icon={<Icons.Settings />} color="gray" title="النظام" desc="إعدادات التطبيق" />
            )}
            
            {/* Added Profile Card - Always Visible */}
            <DashboardCard onClick={() => setCurrentView(View.PROFILE)} icon={<Icons.User />} color="purple" title="حسابي" desc="الملف الشخصي وكلمة المرور" />
          </div>
        );
    }
  };

  return (
    <div className="flex h-[100dvh] bg-gray-50 font-sans overflow-hidden">
      
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-secondary text-white shadow-xl shrink-0 z-50">
        <div className="h-16 flex items-center px-6 border-b border-gray-700/50">
          <h1 className="text-lg font-bold tracking-wider truncate">{siteName}</h1>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          <SidebarItem active={currentView === View.DASHBOARD} onClick={() => setCurrentView(View.DASHBOARD)} icon={<Icons.Dashboard />} text="الرئيسية" />
          
          <div className="pt-4 pb-2 px-2 text-xs font-semibold text-gray-500 uppercase">العمليات</div>
          {can('map_filter', 'view') && <SidebarItem active={currentView === View.MAP_FILTER} onClick={() => setCurrentView(View.MAP_FILTER)} icon={<Icons.Map />} text="الخريطة" />}
          {can('search_odb', 'view') && <SidebarItem active={currentView === View.SEARCH_ODB} onClick={() => setCurrentView(View.SEARCH_ODB)} icon={<Icons.Search />} text="استعلام ODB" />}
          {can('my_activity', 'view') && <SidebarItem active={currentView === View.MY_ACTIVITY} onClick={() => setCurrentView(View.MY_ACTIVITY)} icon={<Icons.Check />} text="نشاطي" />}
          
          {(can('users', 'view') || can('settings', 'view') || can('system_logs', 'view')) && <div className="pt-4 pb-2 px-2 text-xs font-semibold text-gray-500 uppercase">الإدارة</div>}
          {can('users', 'view') && <SidebarItem active={currentView === View.USERS} onClick={() => setCurrentView(View.USERS)} icon={<Icons.Users />} text="المستخدمين" />}
          {can('odb', 'view') && <SidebarItem active={currentView === View.SETTINGS_ODB} onClick={() => setCurrentView(View.SETTINGS_ODB)} icon={<Icons.Database />} text="كل مواقع ODB" />}
          {can('system_logs', 'view') && <SidebarItem active={currentView === View.SYSTEM_LOGS} onClick={() => setCurrentView(View.SYSTEM_LOGS)} icon={<Icons.FileText />} text="سجلات النظام" />}
          {can('settings', 'view') && <SidebarItem active={currentView === View.SETTINGS_SITE} onClick={() => setCurrentView(View.SETTINGS_SITE)} icon={<Icons.Settings />} text="إعدادات الموقع" />}
          
          <SidebarItem active={currentView === View.PROFILE} onClick={() => setCurrentView(View.PROFILE)} icon={<Icons.User />} text="حسابي" />
        </nav>
        <div className="p-4 border-t border-gray-700/50">
          <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 text-red-400 hover:bg-red-900/20 py-2 rounded-lg transition-colors">
            <Icons.LogOut /> <span>خروج</span>
          </button>
        </div>
      </aside>

      {/* Main Layout */}
      <main className="flex-1 flex flex-col relative min-w-0">
        <header className="shrink-0 h-14 md:h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-8 shadow-sm z-20">
            <div className="flex items-center gap-3 md:hidden">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-bold">{siteName.charAt(0)}</div>
                <h2 className="text-base font-bold text-gray-800 truncate max-w-[150px]">{siteName}</h2>
            </div>
            <div className="hidden md:block text-xl font-bold text-gray-800">
                {currentView === View.DASHBOARD && 'لوحة التحكم'}
                {currentView === View.SETTINGS_ODB && 'سجل المواقع المركزي'}
                {currentView === View.SEARCH_ODB && 'بحث ODB سريع'}
                {currentView === View.MAP_FILTER && 'خريطة الأماكن (بحث جغرافي)'}
                {currentView === View.MY_ACTIVITY && 'سجل نشاطي'}
                {currentView === View.USERS && 'إدارة الصلاحيات'}
                {currentView === View.SYSTEM_LOGS && 'سجلات النظام (Logs)'}
                {currentView === View.SETTINGS_SITE && 'إعدادات الموقع'}
                {currentView === View.PROFILE && 'الملف الشخصي'}
            </div>
            <div className="flex items-center gap-3">
                 <div className="hidden md:block text-sm text-gray-600"><span className="font-bold text-gray-900">{user.name}</span> <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full border">{user.role === 'admin' ? 'مدير' : user.role === 'supervisor' ? 'مشرف' : 'مندوب'}</span></div>
                 <button onClick={handleLogout} className="md:hidden text-gray-400 hover:text-red-500"><Icons.LogOut /></button>
            </div>
        </header>

        <div className="flex-1 overflow-y-auto bg-gray-50 p-3 md:p-8 pb-24 md:pb-8">
            {renderContent()}
        </div>

        {/* Mobile Bottom Nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200/80 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] backdrop-blur-lg z-50 pb-[env(safe-area-inset-bottom)]">
            <div className="flex justify-between items-end h-[60px] px-2 relative">
                
                <div className="flex-1 flex justify-around">
                     <MobileNavItem 
                        active={currentView === View.DASHBOARD} 
                        onClick={() => setCurrentView(View.DASHBOARD)} 
                        icon={<Icons.Dashboard />} 
                        label="الرئيسية" 
                    />
                    {can('search_odb', 'view') && (
                        <MobileNavItem 
                            active={currentView === View.SEARCH_ODB} 
                            onClick={() => setCurrentView(View.SEARCH_ODB)} 
                            icon={<Icons.Search />} 
                            label="بحث" 
                        />
                    )}
                </div>

                <div className="relative -top-6 px-2 z-10 shrink-0">
                     {can('map_filter', 'view') ? (
                        <div className="flex flex-col items-center">
                            <button 
                                onClick={() => setCurrentView(View.MAP_FILTER)} 
                                className={`w-16 h-16 rounded-full flex items-center justify-center shadow-xl border-[4px] border-gray-50 transition-all duration-300 transform active:scale-95 ${currentView === View.MAP_FILTER ? 'bg-primary text-white shadow-blue-500/40 scale-105' : 'bg-gray-800 text-white hover:bg-gray-700'}`}
                            >
                                <Icons.Map />
                            </button>
                            <span className={`absolute -bottom-5 text-[10px] font-bold whitespace-nowrap transition-all duration-300 ${currentView === View.MAP_FILTER ? 'text-primary opacity-100 translate-y-0' : 'text-gray-400 opacity-0 -translate-y-2'}`}>
                                الخريطة
                            </span>
                        </div>
                     ) : (
                         <div className="w-4"></div>
                     )}
                </div>

                <div className="flex-1 flex justify-around">
                     {can('my_activity', 'view') && (
                        <MobileNavItem 
                            active={currentView === View.MY_ACTIVITY} 
                            onClick={() => setCurrentView(View.MY_ACTIVITY)} 
                            icon={<Icons.Check />} 
                            label="نشاطي" 
                        />
                    )}

                    {can('users', 'view') ? (
                        <MobileNavItem 
                            active={currentView === View.USERS} 
                            onClick={() => setCurrentView(View.USERS)} 
                            icon={<Icons.Users />} 
                            label="الفريق" 
                        />
                    ) : (
                        <MobileNavItem 
                            active={currentView === View.PROFILE} 
                            onClick={() => setCurrentView(View.PROFILE)} 
                            icon={<Icons.User />} 
                            label="حسابي" 
                        />
                    )}
                </div>
            </div>
        </nav>
      </main>

      {/* Logout Confirmation Modal */}
      {isLogoutModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 transform animate-in zoom-in-95 duration-200 border border-gray-100">
                <div className="flex flex-col items-center text-center">
                    <div className="bg-red-50 text-red-500 p-4 rounded-full mb-4 shadow-inner">
                        <Icons.LogOut />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">تسجيل الخروج</h3>
                    <p className="text-gray-500 text-sm mb-8 leading-relaxed">
                        هل أنت متأكد أنك تريد تسجيل الخروج من النظام؟
                    </p>
                    
                    <div className="flex gap-3 w-full">
                        <button 
                            onClick={() => setIsLogoutModalOpen(false)} 
                            className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors active:scale-95"
                        >
                            إلغاء
                        </button>
                        <button 
                            onClick={confirmLogout} 
                            className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 shadow-lg shadow-red-500/30 transition-all active:scale-95"
                        >
                            تأكيد الخروج
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};

const AccessDenied = () => (
    <div className="flex flex-col items-center justify-center h-full text-gray-400">
        <Icons.Lock />
        <h2 className="mt-2 font-bold text-gray-600">عفواً، ليس لديك صلاحية للوصول لهذه الصفحة</h2>
    </div>
);

const DashboardCard = ({ onClick, icon, title, desc, color }: any) => {
    const colors: any = { blue: 'bg-blue-100 text-blue-600', purple: 'bg-purple-100 text-purple-600', green: 'bg-green-100 text-green-600', gray: 'bg-gray-100 text-gray-600', orange: 'bg-orange-100 text-orange-600' };
    return (
        <div onClick={onClick} className="cursor-pointer bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-gray-100 active:scale-[0.98] transition-all flex flex-col md:flex-row items-center gap-3 md:gap-4 hover:border-blue-200 h-full">
            <div className={`w-12 h-12 md:w-14 md:h-14 ${colors[color]} rounded-2xl flex items-center justify-center shadow-sm shrink-0`}>
                {icon}
            </div>
            <div className="text-center md:text-right">
                <h3 className="text-sm md:text-lg font-bold text-gray-800 leading-tight">{title}</h3>
                <p className="text-gray-500 text-[10px] md:text-xs mt-1 md:mt-0 line-clamp-2 md:line-clamp-none leading-snug">{desc}</p>
            </div>
        </div>
    );
};

const SidebarItem = ({ active, onClick, icon, text }: any) => (
    <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${active ? 'bg-primary text-white shadow-lg' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}>
        <span className={active ? 'text-white' : 'text-gray-500'}>{icon}</span><span className="font-medium">{text}</span>
    </button>
);

const MobileNavItem = ({ active, onClick, icon, label }: any) => (
    <button onClick={onClick} className={`flex-1 flex flex-col items-center justify-center h-14 space-y-1 transition-all duration-200 group active:scale-95 ${active ? 'text-primary' : 'text-gray-400 hover:text-gray-600'}`}>
        <div className={`p-1.5 rounded-xl transition-colors ${active ? 'bg-blue-50' : 'bg-transparent'}`}>
            <span className="[&>svg]:w-6 [&>svg]:h-6 transition-transform group-hover:-translate-y-0.5">{icon}</span>
        </div>
        <span className={`text-[10px] font-medium ${active ? 'font-bold' : ''}`}>{label}</span>
    </button>
);

export default App;
