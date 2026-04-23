import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BookOpen, Lock, User, Eye, Rocket, Loader2 } from 'lucide-react';

export const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading, error, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'Kinetic Scholar_登录';
  }, []);

  useEffect(() => {
    if (user) {
      navigate(`/${user.role}/dashboard`);
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(username, password);
    } catch {
      // handled by auth context
    }
  };

  return (
    <main className="w-full min-h-screen flex items-center justify-center p-4 md:p-8 dopamine-bg">
      <div className="w-full max-w-6xl glass-panel rounded-xl overflow-hidden shadow-[0_32px_64px_-12px_rgba(37,49,42,0.12)] border border-white/30 flex flex-col md:flex-row min-h-[700px]">
        <div className="hidden md:flex md:w-1/2 bg-gradient-to-br from-primary-container to-secondary-container p-12 flex-col justify-between relative overflow-hidden">
          <div className="absolute -top-20 -left-20 w-64 h-64 bg-white/20 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-tertiary-container/30 rounded-full blur-3xl"></div>

          <div className="z-10">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-lg">
                <BookOpen className="text-primary w-8 h-8" />
              </div>
              <h1 className="font-headline font-black text-3xl tracking-tighter text-on-primary-fixed">Kinetic Scholar</h1>
            </div>
            <h2 className="font-headline font-extrabold text-5xl leading-tight text-on-primary-fixed mb-6">让学习更有节奏感</h2>
            <p className="text-on-primary-fixed-variant text-lg font-medium max-w-sm">
              学生使用系统生成的登录 ID 登录，教师继续使用手机号登录。
            </p>
          </div>

          <div className="relative z-10 mt-auto flex justify-center">
            <img
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuBBVHEughBBdnzw9pQ0hBeTAwcnqPamplRRhvg4svxuI1-U5Xuhf0w71l16Q08GYMf4WojWGJVlShslGOTbKM5CbAm-sTuWYMK-vwjCDL9sYQRfJWUFKuCuePbIfJV8S9PJeMQY-CokcKtQjD0eTDgWf8JCcVe5MUqFgRncD5erEaY9HkA6H4cFm-Ix4h0i8YgGglxd5ToX7V0wW9wMo7D7MQgYNWLmJ1K-QAbIphFi9Hq4YwKgTRm2pPpA0paLYwCSvaoW0hTLUkTP"
              alt="Playful character"
              className="w-3/4 h-auto drop-shadow-2xl translate-y-6"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>

        <div className="w-full md:w-1/2 p-8 md:p-16 flex flex-col justify-center bg-white/40">
          <div className="max-w-md mx-auto w-full">
            <div className="md:hidden flex items-center gap-2 mb-10">
              <BookOpen className="text-primary w-8 h-8" />
              <h1 className="font-headline font-black text-2xl tracking-tighter text-on-background">Kinetic Scholar</h1>
            </div>

            <header className="mb-10">
              <h3 className="font-headline font-extrabold text-4xl text-on-background mb-2">欢迎登录</h3>
              <p className="text-on-surface-variant font-medium">请输入学生登录 ID 或教师手机号，以及对应密码。</p>
            </header>

            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-md">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label className="block font-label font-bold text-sm text-on-surface-variant ml-2">登录账号</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                    <User className="w-5 h-5 text-outline group-focus-within:text-secondary" />
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-14 pr-6 py-5 bg-surface-container-low border-none rounded-md font-body text-on-background placeholder:text-outline-variant focus:ring-4 focus:ring-secondary/10 transition-all outline-none"
                    placeholder="学生登录 ID / 教师手机号"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center px-2">
                  <label className="block font-label font-bold text-sm text-on-surface-variant">登录密码</label>
                  <a href="#" className="text-xs font-bold text-secondary hover:underline">忘记密码？</a>
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                    <Lock className="w-5 h-5 text-outline group-focus-within:text-secondary" />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-14 pr-6 py-5 bg-surface-container-low border-none rounded-md font-body text-on-background placeholder:text-outline-variant focus:ring-4 focus:ring-secondary/10 transition-all outline-none"
                    placeholder="请输入密码"
                    required
                  />
                  <div className="absolute inset-y-0 right-5 flex items-center">
                    <Eye className="w-5 h-5 text-outline-variant cursor-pointer hover:text-on-surface" />
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-5 bg-primary-container text-on-primary-fixed font-headline font-black text-xl rounded-xl shadow-[0_12px_24px_-4px_rgba(108,90,0,0.25)] hover:shadow-[0_16px_32px_-4px_rgba(108,90,0,0.35)] hover:-translate-y-1 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin" />
                      登录中...
                    </>
                  ) : (
                    <>
                      开始学习 <Rocket className="w-6 h-6" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
};
