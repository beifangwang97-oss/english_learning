import React, { useEffect, useMemo, useState } from 'react';
import { Activity, GraduationCap, RefreshCw, Store, UserCheck, Users } from 'lucide-react';
import { AdminStore, AdminUser, adminStoreApi, adminUserApi } from '../../lib/auth';
import { getSessionToken } from '../../lib/session';

type StoreOverview = {
  storeCode: string;
  storeName: string;
  teacherCount: number;
  studentCount: number;
  teacherOnlineCount: number;
  studentOnlineCount: number;
  onlineCount: number;
};

type OnlineLikeUser = AdminUser & {
  onlineStatus?: number | boolean | null;
};

function safeStoreCode(value?: string | null) {
  const code = (value || '').trim();
  return code || 'UNASSIGNED';
}

function isOnline(user: OnlineLikeUser) {
  if (typeof user.onlineStatus === 'boolean') return user.onlineStatus;
  if (typeof user.onlineStatus === 'number') return user.onlineStatus === 1;
  return false;
}

export const AdminConsole: React.FC = () => {
  const token = useMemo(() => getSessionToken(), []);
  const [users, setUsers] = useState<OnlineLikeUser[]>([]);
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    setError(null);
    try {
      const [userData, storeData] = await Promise.all([
        adminUserApi.getAllUsers(token),
        adminStoreApi.getAllStores(token),
      ]);
      setUsers((userData || []).filter((u) => u.role !== 'admin') as OnlineLikeUser[]);
      setStores(storeData || []);
    } catch (e: any) {
      setError(e?.message || '加载控制台数据失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  const storeNameMap = useMemo(() => {
    const map = new Map<string, string>();
    stores.forEach((store) => {
      map.set(store.storeCode, store.storeName);
    });
    return map;
  }, [stores]);

  const overviews = useMemo<StoreOverview[]>(() => {
    const counter: Record<string, StoreOverview> = {};

    stores.forEach((store) => {
      counter[store.storeCode] = {
        storeCode: store.storeCode,
        storeName: store.storeName,
        teacherCount: 0,
        studentCount: 0,
        teacherOnlineCount: 0,
        studentOnlineCount: 0,
        onlineCount: 0,
      };
    });

    users.forEach((user) => {
      const storeCode = safeStoreCode(user.storeName);
      if (!counter[storeCode]) {
        counter[storeCode] = {
          storeCode,
          storeName: storeNameMap.get(storeCode) || (storeCode === 'UNASSIGNED' ? '未分配门店' : storeCode),
          teacherCount: 0,
          studentCount: 0,
          teacherOnlineCount: 0,
          studentOnlineCount: 0,
          onlineCount: 0,
        };
      }

      if (user.role === 'teacher') {
        counter[storeCode].teacherCount += 1;
        if (isOnline(user)) counter[storeCode].teacherOnlineCount += 1;
      }

      if (user.role === 'student') {
        counter[storeCode].studentCount += 1;
        if (isOnline(user)) counter[storeCode].studentOnlineCount += 1;
      }

      if (isOnline(user)) counter[storeCode].onlineCount += 1;
    });

    return Object.values(counter).sort((a, b) => {
      if (a.storeCode === 'UNASSIGNED') return 1;
      if (b.storeCode === 'UNASSIGNED') return -1;
      return a.storeCode.localeCompare(b.storeCode);
    });
  }, [stores, users, storeNameMap]);

  const totals = useMemo(() => {
    const teacherCount = users.filter((u) => u.role === 'teacher').length;
    const studentCount = users.filter((u) => u.role === 'student').length;
    const onlineCount = users.filter((u) => isOnline(u)).length;
    return {
      storeCount: overviews.length,
      teacherCount,
      studentCount,
      onlineCount,
    };
  }, [overviews.length, users]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <section className="relative overflow-hidden rounded-2xl border border-outline-variant/30 bg-gradient-to-br from-primary-container/70 via-secondary-container/40 to-surface-container-lowest p-6">
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/30 blur-3xl" />
        <div className="absolute -left-16 bottom-0 h-56 w-56 rounded-full bg-secondary/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-2xl font-black text-on-surface">平台控制台</h3>
            <p className="mt-1 text-sm text-on-surface-variant">实时查看门店、账号与在线学习状态</p>
          </div>
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/30 bg-white/80 px-4 py-2 font-bold text-on-surface hover:bg-white disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            刷新数据
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-error/30 bg-error-container/20 px-4 py-3 text-sm font-medium text-error">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-8 text-center text-on-surface-variant">
          正在加载控制台数据...
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm">
              <p className="text-sm font-bold text-on-surface-variant">门店总数</p>
              <div className="mt-3 flex items-center justify-between">
                <p className="text-3xl font-black text-primary">{totals.storeCount}</p>
                <div className="rounded-lg bg-primary/10 p-2 text-primary"><Store className="h-5 w-5" /></div>
              </div>
            </div>
            <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm">
              <p className="text-sm font-bold text-on-surface-variant">教师总数</p>
              <div className="mt-3 flex items-center justify-between">
                <p className="text-3xl font-black text-secondary">{totals.teacherCount}</p>
                <div className="rounded-lg bg-secondary/10 p-2 text-secondary"><GraduationCap className="h-5 w-5" /></div>
              </div>
            </div>
            <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm">
              <p className="text-sm font-bold text-on-surface-variant">学生总数</p>
              <div className="mt-3 flex items-center justify-between">
                <p className="text-3xl font-black text-tertiary">{totals.studentCount}</p>
                <div className="rounded-lg bg-tertiary/10 p-2 text-tertiary"><Users className="h-5 w-5" /></div>
              </div>
            </div>
            <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm">
              <p className="text-sm font-bold text-on-surface-variant">在线总人数</p>
              <div className="mt-3 flex items-center justify-between">
                <p className="text-3xl font-black text-green-600">{totals.onlineCount}</p>
                <div className="rounded-lg bg-green-100 p-2 text-green-600"><Activity className="h-5 w-5" /></div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest shadow-sm">
            <div className="flex items-center justify-between border-b border-outline-variant/20 px-5 py-4">
              <h4 className="text-lg font-black text-on-surface">门店明细</h4>
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-container-low px-3 py-1 text-xs font-bold text-on-surface-variant">
                <UserCheck className="h-3.5 w-3.5" />
                统计含教师与学生在线
              </span>
            </div>
            <div className="max-h-[56vh] overflow-auto custom-scrollbar">
              <table className="min-w-full border-collapse text-left">
                <thead className="sticky top-0 bg-surface-container-low">
                  <tr className="border-b border-outline-variant/30 text-sm">
                    <th className="px-5 py-3 font-bold text-on-surface-variant">门店编码</th>
                    <th className="px-5 py-3 font-bold text-on-surface-variant">门店名称</th>
                    <th className="px-5 py-3 font-bold text-on-surface-variant">教师数量</th>
                    <th className="px-5 py-3 font-bold text-on-surface-variant">学生数量</th>
                    <th className="px-5 py-3 font-bold text-on-surface-variant">在线总数</th>
                  </tr>
                </thead>
                <tbody>
                  {overviews.map((store) => (
                    <tr key={store.storeCode} className="border-b border-outline-variant/20 hover:bg-surface-container-low/40">
                      <td className="px-5 py-3 font-mono text-sm">{store.storeCode}</td>
                      <td className="px-5 py-3 font-medium">{store.storeName}</td>
                      <td className="px-5 py-3">{store.teacherCount}（在线 {store.teacherOnlineCount}）</td>
                      <td className="px-5 py-3">{store.studentCount}（在线 {store.studentOnlineCount}）</td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700">
                          {store.onlineCount}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
};
