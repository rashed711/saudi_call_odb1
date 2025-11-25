
import React, { useState, useEffect } from 'react';
import { SiteSettings } from '../types';
import { getSiteSettings, saveSiteSettings } from '../services/mockBackend';
import { Icons } from './Icons';

const SiteSettingsComponent: React.FC = () => {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>('general');

  useEffect(() => {
      const load = async () => {
          try {
            const data = await getSiteSettings();
            setSettings(data);
          } catch (e) {
            console.error(e);
            setError("فشل تحميل الإعدادات");
          }
      };
      load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    
    setSaving(true);
    setError(null);
    
    try {
        await saveSiteSettings(settings);
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 3000);
    } catch (e: any) {
        console.error(e);
        setError(e.message || "حدث خطأ أثناء حفظ الإعدادات");
    } finally {
        setSaving(false);
    }
  };

  const toggleSection = (section: string) => {
      setActiveSection(activeSection === section ? null : section);
  };

  if (!settings) return <div className="p-8 text-center text-gray-500">جاري تحميل الإعدادات...</div>;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Icons.Settings />
            <span>إعدادات الموقع</span>
        </h2>
        {isSaved && (
            <div className="bg-green-100 text-green-700 px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-bold animate-in fade-in slide-in-from-top-2">
                <Icons.Check />
                <span>تم حفظ التعديلات</span>
            </div>
        )}
        {error && (
             <div className="bg-red-100 text-red-700 px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-bold animate-in fade-in slide-in-from-top-2">
                <Icons.Ban />
                <span>{error}</span>
            </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        
        {/* SECTION 1: General Information */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <button 
                type="button"
                onClick={() => toggleSection('general')}
                className={`w-full flex items-center justify-between p-5 transition-colors ${activeSection === 'general' ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-800'}`}
            >
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${activeSection === 'general' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                        <Icons.Dashboard />
                    </div>
                    <div className="text-right">
                        <h3 className="font-bold text-lg">بيانات الموقع الأساسية</h3>
                        <p className="text-xs opacity-70">اسم الموقع وشعار النظام</p>
                    </div>
                </div>
                <div className={`transform transition-transform duration-200 ${activeSection === 'general' ? 'rotate-180' : ''}`}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
                </div>
            </button>
            
            {activeSection === 'general' && (
                <div className="p-6 border-t border-gray-100 animate-in slide-in-from-top-2">
                    <div className="max-w-lg">
                        <label className="block text-sm font-bold text-gray-700 mb-2">اسم الموقع</label>
                        <input 
                            type="text" 
                            required
                            value={settings.siteName}
                            onChange={(e) => setSettings({...settings, siteName: e.target.value})}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="ODB Manager Pro"
                        />
                        <p className="text-xs text-gray-400 mt-2">سيظهر هذا الاسم في شريط العنوان والشريط الجانبي.</p>
                    </div>
                </div>
            )}
        </div>

        {/* SECTION 2: Appearance */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
             <button 
                type="button"
                onClick={() => toggleSection('appearance')}
                className={`w-full flex items-center justify-between p-5 transition-colors ${activeSection === 'appearance' ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-800'}`}
            >
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${activeSection === 'appearance' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                        <Icons.Palette />
                    </div>
                    <div className="text-right">
                        <h3 className="font-bold text-lg">المظهر والألوان</h3>
                        <p className="text-xs opacity-70">تخصيص ألوان السمة (Theme) للنظام</p>
                    </div>
                </div>
                <div className={`transform transition-transform duration-200 ${activeSection === 'appearance' ? 'rotate-180' : ''}`}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
                </div>
            </button>

            {activeSection === 'appearance' && (
                <div className="p-6 border-t border-gray-100 animate-in slide-in-from-top-2">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        {/* Primary Color */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">اللون الأساسي</label>
                            <div className="flex items-center gap-3 border border-gray-200 p-2 rounded-lg">
                                <input 
                                    type="color" 
                                    value={settings.primaryColor}
                                    onChange={(e) => setSettings({...settings, primaryColor: e.target.value})}
                                    className="h-8 w-8 rounded cursor-pointer border-none p-0"
                                />
                                <div className="flex-1 font-mono uppercase text-sm">{settings.primaryColor}</div>
                            </div>
                        </div>

                        {/* Secondary Color */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">اللون الثانوي</label>
                            <div className="flex items-center gap-3 border border-gray-200 p-2 rounded-lg">
                                <input 
                                    type="color" 
                                    value={settings.secondaryColor}
                                    onChange={(e) => setSettings({...settings, secondaryColor: e.target.value})}
                                    className="h-8 w-8 rounded cursor-pointer border-none p-0"
                                />
                                <div className="flex-1 font-mono uppercase text-sm">{settings.secondaryColor}</div>
                            </div>
                        </div>

                        {/* Accent Color */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">لون التمييز</label>
                            <div className="flex items-center gap-3 border border-gray-200 p-2 rounded-lg">
                                <input 
                                    type="color" 
                                    value={settings.accentColor}
                                    onChange={(e) => setSettings({...settings, accentColor: e.target.value})}
                                    className="h-8 w-8 rounded cursor-pointer border-none p-0"
                                />
                                <div className="flex-1 font-mono uppercase text-sm">{settings.accentColor}</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* SECTION 3: Search Settings */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
             <button 
                type="button"
                onClick={() => toggleSection('search')}
                className={`w-full flex items-center justify-between p-5 transition-colors ${activeSection === 'search' ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-800'}`}
            >
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${activeSection === 'search' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                        <Icons.MapPin />
                    </div>
                    <div className="text-right">
                        <h3 className="font-bold text-lg">إعدادات البحث الجغرافي</h3>
                        <p className="text-xs opacity-70">التحكم في نطاق البحث وعدد النتائج في شاشة "الأماكن القريبة"</p>
                    </div>
                </div>
                <div className={`transform transition-transform duration-200 ${activeSection === 'search' ? 'rotate-180' : ''}`}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
                </div>
            </button>

            {activeSection === 'search' && (
                <div className="p-6 border-t border-gray-100 animate-in slide-in-from-top-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        
                        {/* Max Results */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-3">أقصى عدد للنتائج (المواقع)</label>
                            <div className="flex items-center gap-4">
                                <input 
                                    type="number" 
                                    min="1" max="100"
                                    value={settings.maxResults}
                                    onChange={(e) => setSettings({...settings, maxResults: parseInt(e.target.value) || 1})}
                                    className="w-24 p-3 text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono font-bold text-lg"
                                />
                                <span className="text-gray-500 text-sm">موقع</span>
                            </div>
                            <p className="text-xs text-gray-400 mt-2">سيتم عرض أقرب {settings.maxResults} نتيجة فقط.</p>
                        </div>

                        {/* Search Radius */}
                        <div>
                             <label className="block text-sm font-bold text-gray-700 mb-3">نطاق البحث (كم)</label>
                             <div className="flex items-center gap-4">
                                <input 
                                    type="range" 
                                    min="0" max="500" step="1"
                                    value={settings.searchRadius}
                                    onChange={(e) => setSettings({...settings, searchRadius: parseInt(e.target.value)})}
                                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                />
                                <div className="w-28 bg-gray-50 border border-gray-200 rounded-lg flex items-center px-2">
                                    <input 
                                        type="number"
                                        min="0"
                                        max="1000"
                                        value={settings.searchRadius}
                                        onChange={(e) => setSettings({...settings, searchRadius: parseInt(e.target.value) || 0})}
                                        className="w-full bg-transparent p-2 text-center font-mono font-bold text-blue-600 outline-none"
                                    />
                                    <span className="text-xs text-gray-500 font-bold">km</span>
                                </div>
                             </div>
                             <p className="text-xs text-gray-400 mt-2">
                                 {settings.searchRadius === 0 
                                    ? 'نطاق مفتوح: عرض جميع النتائج بغض النظر عن المسافة.' 
                                    : `يتم البحث في محيط ${settings.searchRadius} كم.`}
                             </p>
                        </div>

                    </div>
                </div>
            )}
        </div>

        {/* Actions */}
        <div className="pt-4 flex justify-end">
            <button 
                type="submit"
                disabled={saving}
                className="w-full md:w-auto bg-primary text-white px-8 py-3.5 rounded-xl font-bold hover:opacity-90 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 disabled:opacity-50"
            >
                {saving ? (
                    <>
                        <span className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin"></span>
                        <span>جاري الحفظ...</span>
                    </>
                ) : (
                    <>
                        <Icons.Check />
                        <span>حفظ جميع الإعدادات</span>
                    </>
                )}
            </button>
        </div>

      </form>
    </div>
  );
};

export default SiteSettingsComponent;
