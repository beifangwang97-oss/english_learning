import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Clock3, LogOut, Users } from 'lucide-react';
import { TeachingUnits } from '../components/teacher/TeachingUnits';
import { PermissionsManagement } from '../components/teacher/PermissionsManagement';
import { LearningAnalytics } from '../components/teacher/LearningAnalytics';
import { TeacherExamPaperManagement } from '../components/teacher/TeacherExamPaperManagement';
import { TeacherWordTest } from '../components/teacher/TeacherWordTest';
import { TeacherWordReview } from '../components/teacher/TeacherWordReview';
import { useAuth } from '../context/AuthContext';
import { AdminStore, AdminUser, adminStoreApi, adminUserApi, authApi } from '../lib/auth';
import { getSessionToken } from '../lib/session';

type TabKey = 'dashboard' | 'teachingUnits' | 'examPaper' | 'wordTest' | 'wordReview' | 'permissions' | 'analytics';

type TeacherStudentUser = AdminUser & {
  onlineStatus?: number | boolean | null;
};

function isOnline(user: TeacherStudentUser) {
  if (typeof user.onlineStatus === 'boolean') return user.onlineStatus;
  if (typeof user.onlineStatus === 'number') return user.onlineStatus === 1;
  return false;
}

function resolveStoreCode(value: string | undefined, stores: AdminStore[]) {
  const v = (value || '').trim();
  if (!v) return 'UNASSIGNED';
  const byCode = stores.find((s) => s.storeCode === v);
  if (byCode) return byCode.storeCode;
  const byName = stores.find((s) => s.storeName === v);
  if (byName) return byName.storeCode;
  return v;
}

export const TeacherDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [users, setUsers] = useState<TeacherStudentUser[]>([]);
  const [resolvedStoreName, setResolvedStoreName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const token = useMemo(() => getSessionToken(), []);

  useEffect(() => {
    document.title = '虎子英语_教师端';
  }, []);

  useEffect(() => {
    if (!token || user?.role !== 'teacher') return;
    authApi
      .getCurrentUser(token)
      .then((latest) => setResolvedStoreName(latest.storeName || ''))
      .catch(() => setResolvedStoreName(user?.storeName || ''));
  }, [token, user?.role, user?.storeName]);

  const loadStoreStudents = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [allUsers, stores] = await Promise.all([
        adminUserApi.getAllUsers(token),
        adminStoreApi.getAllStores(token),
      ]);
      const currentStoreCode = resolveStoreCode(resolvedStoreName || user?.storeName, stores);
      setUsers(
        (allUsers as TeacherStudentUser[]).filter(
          (u) => u.role === 'student' && resolveStoreCode(u.storeName, stores) === currentStoreCode
        )
      );
    } catch (e: any) {
      setError(e?.message || '加载教师端实时数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    loadStoreStudents();
  }, [token, resolvedStoreName, user?.storeName]);

  useEffect(() => {
    if (!token) return;
    const timer = window.setInterval(() => {
      loadStoreStudents(true);
    }, 12000);
    return () => window.clearInterval(timer);
  }, [token, resolvedStoreName, user?.storeName]);

  const totalStudents = users.length;
  const onlineStudents = useMemo(() => users.filter((u) => isOnline(u)), [users]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const renderConsole = () => (
    <main className="ml-64 min-h-screen flex-1 p-8">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h2 className="mb-2 text-4xl font-extrabold tracking-tight text-on-background">教师控制台</h2>
          <p className="font-medium text-on-surface-variant">
            当前门店：{resolvedStoreName || user?.storeName || '未分配门店'}，实时展示本门店学生在线学习动态
          </p>
        </div>
      </header>

      {error && (
        <div className="mb-6 rounded-xl border border-error/30 bg-error-container/20 px-4 py-3 text-sm font-medium text-error">
          {error}
        </div>
      )}

      <div className="mb-8 grid grid-cols-12 gap-6">
        <div className="relative col-span-12 min-h-[170px] overflow-hidden rounded-xl bg-gradient-to-br from-primary to-primary-dim p-8 text-on-primary lg:col-span-6">
          <div className="relative z-10">
            <h3 className="mb-2 text-xl font-bold opacity-95">本门店在线学生</h3>
            <p className="text-6xl font-black tracking-tighter">
              {onlineStudents.length}
              <span className="ml-2 text-2xl font-bold opacity-75">人</span>
            </p>
            <p className="mt-4 text-sm opacity-85">本门店学生总人数：{totalStudents} 人</p>
          </div>
          <div className="absolute -bottom-12 -right-12 h-64 w-64 rounded-full bg-primary-container/20 blur-3xl" />
        </div>

        <div className="col-span-12 rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-6 shadow-sm lg:col-span-6">
          <h3 className="mb-4 text-lg font-black">实时概览</h3>
          {loading ? (
            <p className="text-sm text-on-surface-variant">正在加载...</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-surface-container-low px-4 py-3">
                <span className="text-sm font-bold text-on-surface-variant">在线率</span>
                <span className="text-lg font-black text-secondary">
                  {totalStudents > 0 ? Math.round((onlineStudents.length / totalStudents) * 100) : 0}%
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-surface-container-low px-4 py-3">
                <span className="text-sm font-bold text-on-surface-variant">在线人数</span>
                <span className="text-lg font-black text-green-600">{onlineStudents.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-surface-container-low px-4 py-3">
                <span className="text-sm font-bold text-on-surface-variant">学生总数</span>
                <span className="text-lg font-black text-primary">{totalStudents}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <section className="overflow-hidden rounded-xl bg-surface-container shadow-sm">
        <div className="flex items-center justify-between border-b border-outline-variant/20 p-6">
          <h3 className="text-2xl font-extrabold text-on-surface">在线学生明细</h3>
          <span className="inline-flex items-center gap-2 rounded-full bg-surface-container-low px-3 py-1 text-xs font-bold text-on-surface-variant">
            <Activity className="h-3.5 w-3.5" />
            每 12 秒自动刷新
          </span>
        </div>

        <div className="grid grid-cols-12 bg-surface-container-high px-8 py-4 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
          <div className="col-span-3">学生姓名</div>
          <div className="col-span-2">手机号</div>
          <div className="col-span-2">年级</div>
          <div className="col-span-2">教材</div>
          <div className="col-span-3 text-right">在线状态</div>
        </div>

        <div className="space-y-2 p-2">
          {loading && <div className="px-6 py-4 text-sm text-on-surface-variant">正在加载在线学生...</div>}
          {!loading && onlineStudents.length === 0 && (
            <div className="px-6 py-8 text-sm text-on-surface-variant">当前门店暂无在线学生</div>
          )}
          {!loading &&
            onlineStudents.map((student) => (
              <div key={student.id} className="grid grid-cols-12 items-center rounded-xl bg-surface-container-lowest px-6 py-4 shadow-sm hover:bg-white">
                <div className="col-span-3 flex items-center gap-2 font-bold text-on-surface">
                  <Users className="h-4 w-4 text-secondary" />
                  {student.name || '-'}
                </div>
                <div className="col-span-2 text-sm text-on-surface-variant">{student.username || '-'}</div>
                <div className="col-span-2 text-sm text-on-surface-variant">{student.grade || '-'}</div>
                <div className="col-span-2 text-sm text-on-surface-variant">{student.textbookVersion || '-'}</div>
                <div className="col-span-3 flex justify-end">
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
                    <Clock3 className="h-3.5 w-3.5" />
                    在线
                  </span>
                </div>
              </div>
            ))}
        </div>
      </section>
    </main>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return renderConsole();
      case 'teachingUnits':
        return <main className="ml-64 flex-1"><TeachingUnits /></main>;
      case 'examPaper':
        return <main className="ml-64 flex-1"><TeacherExamPaperManagement /></main>;
      case 'wordTest':
        return <main className="ml-64 flex-1"><TeacherWordTest /></main>;
      case 'wordReview':
        return <main className="ml-64 flex-1"><TeacherWordReview /></main>;
      case 'permissions':
        return <main className="ml-64 flex-1"><PermissionsManagement /></main>;
      case 'analytics':
        return <main className="ml-64 flex-1"><LearningAnalytics /></main>;
      default:
        return null;
    }
  };

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: 'dashboard', label: '控制台' },
    { key: 'teachingUnits', label: '教学任务' },
    { key: 'examPaper', label: '试卷管理' },
    { key: 'wordTest', label: '单词测试' },
    { key: 'wordReview', label: '单词复习' },
    { key: 'permissions', label: '权限管理' },
    { key: 'analytics', label: '学习分析' },
  ];

  return (
    <div className="flex w-full">
      <aside className="fixed left-0 top-20 bottom-0 z-40 flex w-64 flex-col gap-2 border-r-0 bg-emerald-50 py-6">
        <div className="mb-8 px-8">
          <h1 className="text-xl font-black text-yellow-600">教师管理端</h1>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-800/60">K-12 Teaching</p>
        </div>

        <nav className="flex-1 space-y-1">
          {tabs.map((tab) => (
            <div
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`mx-4 mb-2 flex cursor-pointer items-center gap-3 rounded-full px-4 py-3 font-semibold transition-all duration-200 ${
                activeTab === tab.key
                  ? 'bg-yellow-400 text-yellow-950 shadow-lg shadow-yellow-400/20'
                  : 'text-emerald-800 hover:translate-x-1 hover:bg-emerald-100'
              }`}
            >
              <span>{tab.label}</span>
            </div>
          ))}
        </nav>

        <div className="border-t border-outline-variant/20 p-4">
          <button
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-error-container px-4 py-3 font-bold text-on-error-container transition-colors hover:bg-error hover:text-white"
          >
            <LogOut className="h-5 w-5" />
            退出登录
          </button>
        </div>
      </aside>

      {renderContent()}
    </div>
  );
};
