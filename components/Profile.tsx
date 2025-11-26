
import React, { useState } from 'react';
import { User } from '../types';
import { Icons } from './Icons';
import { saveUser } from '../services/mockBackend';

interface ProfileProps {
  user: User;
}

const Profile: React.FC<ProfileProps> = ({ user }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handlePasswordChange = async (e: React.FormEvent) => {
      e.preventDefault();
      setMessage(null);

      if (!password || password.length < 4) {
          setMessage({ type: 'error', text: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل' });
          return;
      }

      if (password !== confirmPassword) {
          setMessage({ type: 'error', text: 'كلمة المرور غير متطابقة' });
          return;
      }

      setLoading(true);
      try {
          // Send the full user object with the new password
          // The backend allows users to edit themselves
          await saveUser({ ...user, password: password });
          setMessage({ type: 'success', text: 'تم تحديث كلمة المرور بنجاح' });
          setPassword('');
          setConfirmPassword('');
      } catch (err: any) {
          console.error(err);
          setMessage({ type: 'error', text: err.message || 'حدث خطأ أثناء التحديث' });
      } finally {
          setLoading(false);
      }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      
      {/* 1. Basic Info Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="h-24 md:h-32 bg-gradient-to-r from-blue-500 to-indigo-600"></div>
        <div className="px-4 md:px-8 pb-8 relative">
            <div className="absolute -top-10 md:-top-12 right-4 md:right-8">
                <div className="w-20 h-20 md:w-24 md:h-24 bg-white rounded-full p-1 shadow-lg">
                    <div className="w-full h-full bg-gray-100 rounded-full flex items-center justify-center text-gray-400">
                        <Icons.User />
                    </div>
                </div>
            </div>
            
            <div className="pt-12 md:pt-16">
                <h2 className="text-xl md:text-2xl font-bold text-gray-800">{user.name}</h2>
                <p className="text-sm md:text-base text-gray-500 font-mono">@{user.username}</p>
                
                <div className="mt-6 md:mt-8 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1">البريد الإلكتروني</label>
                        <p className="text-gray-900 font-medium text-sm md:text-base break-all">{user.email}</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-2">الصلاحية</label>
                        <span className={`inline-block px-3 py-1 text-xs md:text-sm rounded-full font-bold ${
                            user.role === 'admin' ? 'bg-gray-800 text-white' : 
                            user.role === 'supervisor' ? 'bg-purple-100 text-purple-700' : 
                            'bg-blue-100 text-blue-700'
                        }`}>
                            {user.role === 'admin' ? 'مدير النظام' : user.role === 'supervisor' ? 'مشرف' : 'مندوب'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
      </div>

      {/* 2. Password Change Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 md:p-6 border-b border-gray-100 bg-gray-50">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <Icons.Lock />
                الأمان وتغيير كلمة المرور
            </h3>
        </div>
        <div className="p-4 md:p-6">
            <form onSubmit={handlePasswordChange} className="space-y-4 max-w-lg">
                
                {message && (
                    <div className={`p-3 rounded-lg text-sm font-bold flex items-center gap-2 ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                        {message.type === 'success' ? <Icons.Check /> : <Icons.Ban />}
                        {message.text}
                    </div>
                )}

                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">كلمة المرور الجديدة</label>
                    <input 
                        type="password" 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        placeholder="••••••••"
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">تأكيد كلمة المرور</label>
                    <input 
                        type="password" 
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        placeholder="••••••••"
                    />
                </div>

                <div className="pt-2">
                    <button 
                        type="submit" 
                        disabled={loading || !password}
                        className="bg-primary text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {loading ? <span className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin"></span> : <Icons.Check />}
                        تحديث كلمة المرور
                    </button>
                </div>
            </form>
        </div>
      </div>

    </div>
  );
};

export default Profile;
