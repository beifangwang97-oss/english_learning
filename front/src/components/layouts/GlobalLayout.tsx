import React, { useEffect, useMemo, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { adminStoreApi, authApi } from '../../lib/auth';

export const GlobalLayout: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const token = useMemo(() => localStorage.getItem('token') || '', []);
  const [storeCode, setStoreCode] = useState('');
  const [storeLabel, setStoreLabel] = useState('');

  useEffect(() => {
    if (!token || !user || !['teacher', 'student'].includes(user.role)) return;
    Promise.all([authApi.getCurrentUser(token), adminStoreApi.getAllStores(token)])
      .then(([latestUser, stores]) => {
        const code = latestUser.storeName || '';
        setStoreCode(code);
        const matched = stores.find((s) => s.storeCode === code);
        setStoreLabel(matched?.storeName || '');
      })
      .catch(() => {
        setStoreCode(user.storeName || '');
        setStoreLabel('');
      });
  }, [token, user]);

  if (!user) return <Outlet />;

  return (
    <div className="min-h-screen bg-surface text-on-background flex flex-col">
      <nav className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-xl flex justify-between items-center px-4 md:px-8 h-20 shadow-[0_12px_32px_-4px_rgba(37,49,42,0.06)]">
        <div className="flex items-center gap-4">
          <span className="text-2xl font-black text-yellow-600 tracking-tighter cursor-pointer" onClick={() => navigate(`/${user.role}/dashboard`)}>
            Kinetic Scholar
          </span>
        </div>
        <div className="flex items-center gap-4 md:gap-8">
          {['teacher', 'student'].includes(user.role) && (
            <div className="hidden md:flex items-center gap-2 rounded-full bg-secondary-container/30 px-4 py-2 text-sm font-bold text-on-surface">
              <span className="text-on-surface-variant">所属门店</span>
              <span className="text-primary">
                {storeCode
                  ? `${storeCode} ${storeLabel || ''}`.trim()
                  : '未分配'}
              </span>
            </div>
          )}
          <div className="flex items-center gap-3 bg-surface-container-highest/40 p-1.5 pr-5 rounded-full hover:scale-105 transition-transform duration-300 cursor-pointer">
            <img src={user.avatar} alt="User avatar" className="w-10 h-10 rounded-full bg-primary-container object-cover" referrerPolicy="no-referrer" />
            <div className="hidden md:flex flex-col">
              <span className="font-headline font-bold text-sm tracking-tight text-on-surface">{user.name}</span>
              <span className="text-[10px] font-bold text-yellow-600 uppercase tracking-widest">{user.role}</span>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex-1 pt-20 flex">
        <Outlet />
      </div>
    </div>
  );
};
