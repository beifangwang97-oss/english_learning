import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { UserAccountManagement } from '../components/admin/UserAccountManagement';
import { LexiconManagement } from '../components/admin/LexiconManagement';
import { AdminConsole } from '../components/admin/AdminConsole';
import { TextbookScopeManagement } from '../components/admin/TextbookScopeManagement';
import { PassageManagement } from '../components/admin/PassageManagement';
import { BookOpen, Database, LayoutDashboard, LogOut, MessageSquare, ScrollText, Type, Users } from 'lucide-react';

type Tab = 'dashboard' | 'users' | 'words' | 'phrases' | 'passages' | 'textbooks';

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  useEffect(() => {
    document.title = '虎子英语_管理员端';
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <AdminConsole />;
      case 'users':
        return <UserAccountManagement />;
      case 'words':
        return <LexiconManagement key="lexicon-word" type="word" />;
      case 'phrases':
        return <LexiconManagement key="lexicon-phrase" type="phrase" />;
      case 'passages':
        return <PassageManagement />;
      case 'textbooks':
        return <TextbookScopeManagement />;
      default:
        return null;
    }
  };

  const navItems: Array<{ key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { key: 'dashboard', label: '控制台', icon: LayoutDashboard },
    { key: 'users', label: '账号管理', icon: Users },
    { key: 'words', label: '单词词库', icon: Type },
    { key: 'phrases', label: '短语词库', icon: MessageSquare },
    { key: 'passages', label: '课文管理', icon: ScrollText },
    { key: 'textbooks', label: '教材管理', icon: BookOpen },
  ];

  return (
    <div className="flex w-full h-screen overflow-hidden pt-16 bg-surface-bright">
      <aside className="w-64 bg-surface-container-low border-r border-outline-variant/30 flex flex-col h-full">
        <div className="p-6 border-b border-outline-variant/30">
          <h2 className="text-xl font-black text-primary flex items-center gap-2">
            <Database className="w-6 h-6" />
            管理员后台
          </h2>
        </div>
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveTab(item.key)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-colors ${
                activeTab === item.key
                  ? 'bg-primary text-on-primary shadow-md'
                  : 'text-on-surface-variant hover:bg-surface-container-highest'
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-outline-variant/30">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-error-container text-on-error-container rounded-xl font-bold hover:bg-error hover:text-white transition-colors"
          >
            <LogOut className="w-5 h-5" />
            退出登录
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-20 bg-surface-container-lowest border-b border-outline-variant/30 flex items-center px-8 shrink-0">
          <div>
            <h1 className="text-2xl font-black text-on-surface">平台管理</h1>
            <p className="text-sm text-on-surface-variant mt-1">账号、教材、词库与课文统一管理</p>
          </div>
        </header>

        <main className="flex-1 overflow-auto custom-scrollbar p-8">
          <div className="max-w-none">{renderContent()}</div>
        </main>
      </div>
    </div>
  );
};

