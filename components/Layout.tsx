
import React from 'react';
import { Role } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  activeRole: Role;
  setRole: (role: Role) => void;
  userName: string;
  onLogout?: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, activeRole, setRole, userName, onLogout }) => {
  const roles = [
    { key: Role.TRAINEE, label: '受講者' },
    { key: Role.TRAINER, label: '講義作成' },
    { key: Role.HR, label: 'HR分析' }
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between py-3 md:h-16 gap-4">
            {/* Logo & Brand */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 group cursor-pointer" onClick={() => window.location.reload()}>
                <div className="w-8 h-8 md:w-10 md:h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-indigo-200 relative overflow-hidden transition-transform group-hover:scale-110">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 md:w-6 md:h-6 z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <div className="absolute inset-0 bg-indigo-400 animate-pulse opacity-30"></div>
                </div>
                <h1 className="text-lg md:text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600 tracking-tighter">
                  SkillBridge AI
                </h1>
              </div>
              
              {/* User Logout (Mobile only) */}
              <div className="flex md:hidden items-center gap-2">
                {onLogout && (
                  <button onClick={onLogout} className="p-2 text-slate-400 hover:text-rose-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                  </button>
                )}
              </div>
            </div>

            {/* Role Switcher - Horizontal scroll on mobile */}
            <div className="flex bg-slate-100 p-1 rounded-xl overflow-x-auto scrollbar-hide no-scrollbar">
              <div className="flex min-w-max gap-1">
                {roles.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setRole(r.key)}
                    className={`px-4 md:px-5 py-2 md:py-2.5 rounded-lg text-xs md:text-sm font-black transition-all whitespace-nowrap ${
                      activeRole === r.key
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* User Info (Desktop only) */}
            <div className="hidden md:flex items-center gap-4">
              <div className="flex flex-col items-end">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Active User</span>
                <span className="text-sm font-black text-slate-700 leading-none">{userName}</span>
              </div>
              {onLogout ? (
                <button 
                  onClick={onLogout}
                  className="px-4 py-2 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-500 rounded-xl text-xs font-black transition-all border border-transparent hover:border-rose-100"
                >
                  ログアウト
                </button>
              ) : (
                <div className="w-10 h-10 rounded-2xl bg-slate-50 border-2 border-slate-100 flex items-center justify-center text-slate-300">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6">
        {children}
      </main>
      
      <footer className="py-6 md:py-8 border-t border-slate-100 text-center text-slate-300 text-[10px] md:text-xs font-bold uppercase tracking-widest px-4">
        © 2024 SkillBridge AI - Training Portal v2.0
      </footer>
    </div>
  );
};
