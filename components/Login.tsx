
import React, { useState } from 'react';
import { mockLogin, getDeviceFingerprint } from '../services/mockBackend';
import { User } from '../types';
import { Icons } from './Icons';

interface LoginProps {
  onLoginSuccess: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Get unique device ID (creates one if not exists)
      const deviceId = getDeviceFingerprint();
      
      const user = await mockLogin(username, password, deviceId);
      onLoginSuccess(user);
    } catch (err: any) {
      setError(err.message || 'حدث خطأ ما');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-gray-200/50">
        <div className="bg-gradient-to-br from-primary to-blue-800 p-10 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-white/10 backdrop-blur-sm transform -skew-y-6 scale-150 origin-top-left opacity-20"></div>
          <div className="relative z-10">
             <h1 className="text-3xl font-extrabold text-white mb-2 tracking-tight">سعودي كول ODB</h1>
             <p className="text-blue-100 text-sm font-medium opacity-90">تسجيل الدخول</p>
          </div>
        </div>
        
        <div className="p-8 pt-10">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl text-sm text-center font-bold animate-in slide-in-from-top-2">
                {error}
              </div>
            )}
            
            <div className="space-y-1">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mr-1">اسم المستخدم</label>
              <div className="relative">
                 <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
                    <Icons.User />
                 </div>
                 <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pr-10 pl-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-gray-900 font-semibold"
                    placeholder="اسم المستخدم"
                 />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mr-1">كلمة المرور</label>
              <div className="relative">
                 <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
                    <Icons.Lock />
                 </div>
                 <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pr-10 pl-12 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-gray-900 font-mono"
                    placeholder="••••••"
                 />
                 <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
                 >
                    {showPassword ? <Icons.EyeOff /> : <Icons.Eye />}
                 </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-blue-800 text-white font-bold text-lg py-4 rounded-xl shadow-lg shadow-blue-500/30 transition-all transform active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                  <>
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    <span>جاري التحقق...</span>
                  </>
              ) : 'دخول للنظام'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
