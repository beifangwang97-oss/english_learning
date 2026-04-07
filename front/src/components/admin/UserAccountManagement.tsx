import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Save, Search, Trash2, X } from 'lucide-react';
import { AdminUser, accountMetaApi, adminStoreApi, adminUserApi } from '../../lib/auth';
import { getSessionToken } from '../../lib/session';
import { StoreManagement } from './StoreManagement';

type EditableUser = AdminUser & { dirty?: boolean };

const GRADE_OPTIONS = [
  '一年级', '二年级', '三年级', '四年级', '五年级', '六年级',
  '七年级', '八年级', '九年级', '高一', '高二', '高三',
];

const defaultNewUser: Partial<AdminUser> = {
  username: '',
  name: '',
  role: 'student',
  loginPassword: '123456',
  active: true,
  textbookVersion: '',
  grade: GRADE_OPTIONS[0],
  storeName: '',
  expireDate: null,
};

function isPhone(value?: string) {
  return !!value && /^1\d{10}$/.test(value);
}

function formatDateTime(value?: string) {
  if (!value) return '-';
  return value.replace('T', ' ').slice(0, 19);
}

function safeStore(value?: string | null) {
  return (value || '').trim() || 'UNASSIGNED';
}

export const UserAccountManagement: React.FC = () => {
  const token = useMemo(() => getSessionToken(), []);

  const [users, setUsers] = useState<EditableUser[]>([]);
  const [stores, setStores] = useState<string[]>([]);
  const [textbookOptions, setTextbookOptions] = useState<string[]>([]);
  const [selectedStore, setSelectedStore] = useState('ALL');
  const [searchKeyword, setSearchKeyword] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [showStoreModal, setShowStoreModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState<Partial<AdminUser>>(defaultNewUser);

  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [allUsers, allStores, options] = await Promise.all([
        adminUserApi.getAllUsers(token),
        adminStoreApi.getAllStores(token),
        accountMetaApi.getLexiconOptions(token),
      ]);

      const nonAdminUsers = allUsers
        .filter((u) => u.role !== 'admin')
        .map((u) => ({ ...u, dirty: false }));
      const versionSet = new Set<string>(options.bookVersions || []);
      nonAdminUsers.forEach((u) => {
        const value = (u.textbookVersion || '').trim();
        if (value) versionSet.add(value);
      });
      const mergedVersions = Array.from(versionSet).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));

      setUsers(nonAdminUsers);
      setStores(allStores.map((s) => s.storeCode).sort());
      setTextbookOptions(mergedVersions);
      setNewUser((prev) => ({
        ...prev,
        textbookVersion: prev.textbookVersion || mergedVersions[0] || '',
      }));
    } catch (e: any) {
      setError(e?.message || '加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  const validateUser = (u: Partial<AdminUser>) => {
    if (!isPhone(u.username)) return '手机号必须为11位数字';
    if (!u.name || !u.name.trim()) return '姓名不能为空';
    if (!u.loginPassword || !u.loginPassword.trim()) return '密码不能为空';
    if (!u.storeName) return '门店不能为空';
    if (!u.expireDate) return '截止日期不能为空';
    if (u.role === 'student') {
      if (!u.textbookVersion) return '学生教材版本不能为空';
      if (!u.grade) return '学生年级不能为空';
    }
    return null;
  };

  const visibleUsers = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    return users.filter((u) => {
      const inStore = selectedStore === 'ALL' || safeStore(u.storeName) === selectedStore;
      if (!inStore) return false;
      if (!keyword) return true;
      const phoneLike = (u.username || u.phone || '').toLowerCase();
      const name = (u.name || '').toLowerCase();
      return phoneLike.includes(keyword) || name.includes(keyword);
    });
  }, [users, selectedStore, searchKeyword]);

  const teacherUsers = useMemo(() => visibleUsers.filter((u) => u.role === 'teacher'), [visibleUsers]);
  const studentUsers = useMemo(() => visibleUsers.filter((u) => u.role === 'student'), [visibleUsers]);

  const updateLocal = <K extends keyof EditableUser>(id: number, key: K, value: EditableUser[K]) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, [key]: value, dirty: true } : u)));
  };

  const saveUser = async (u: EditableUser) => {
    const err = validateUser(u);
    if (err) {
      setError(err);
      return;
    }
    setSavingId(u.id);
    setError(null);
    setMessage(null);
    try {
      const payload: any = {
        username: u.username,
        phone: u.username,
        name: u.name,
        role: u.role,
        loginPassword: u.loginPassword,
        active: !!u.active,
        expireDate: u.expireDate || null,
        storeName: safeStore(u.storeName),
      };
      if (u.role === 'student') {
        payload.textbookVersion = u.textbookVersion;
        payload.grade = u.grade || GRADE_OPTIONS[0];
      } else {
        payload.textbookVersion = null;
        payload.grade = null;
      }
      const updated = await adminUserApi.updateUser(token, u.id, payload);
      setUsers((prev) => prev.map((item) => (item.id === u.id ? { ...updated, dirty: false } : item)));
      setMessage('保存成功');
    } catch (e: any) {
      setError(e?.message || '保存失败');
    } finally {
      setSavingId(null);
    }
  };

  const deleteUser = async (u: EditableUser) => {
    if (!window.confirm(`确认删除账号 ${u.username}（${u.name}）？`)) return;
    setDeletingId(u.id);
    setError(null);
    setMessage(null);
    try {
      await adminUserApi.deleteUser(token, u.id);
      setUsers((prev) => prev.filter((item) => item.id !== u.id));
      setMessage('删除成功');
    } catch (e: any) {
      setError(e?.message || '删除失败');
    } finally {
      setDeletingId(null);
    }
  };

  const createUser = async () => {
    const err = validateUser(newUser);
    if (err) {
      setError(err);
      return;
    }
    setCreating(true);
    setError(null);
    setMessage(null);
    try {
      const role = (newUser.role || 'student') as 'student' | 'teacher';
      const payload: any = {
        username: newUser.username,
        phone: newUser.username,
        name: newUser.name,
        role,
        loginPassword: newUser.loginPassword,
        active: true,
        storeName: safeStore(newUser.storeName),
        expireDate: newUser.expireDate || null,
      };
      if (role === 'student') {
        payload.textbookVersion = newUser.textbookVersion;
        payload.grade = newUser.grade || GRADE_OPTIONS[0];
      } else {
        payload.textbookVersion = null;
        payload.grade = null;
      }
      const created = await adminUserApi.createUser(token, payload);
      setUsers((prev) => [{ ...created, dirty: false }, ...prev]);
      setShowCreateModal(false);
      setNewUser({ ...defaultNewUser, textbookVersion: textbookOptions[0] || '' });
      setMessage('创建成功');
    } catch (e: any) {
      setError(e?.message || '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const renderRows = (rows: EditableUser[], isStudent: boolean) => (
    <div className="overflow-auto max-h-[42vh] bg-surface-container-lowest rounded-xl border border-outline-variant/30">
      <table className="w-full text-left border-collapse min-w-[1280px]">
        <thead>
          <tr className="bg-surface-container-low border-b border-outline-variant/30">
            <th className="p-3 font-bold">手机号</th>
            <th className="p-3 font-bold">姓名</th>
            <th className="p-3 font-bold">创建时间</th>
            <th className="p-3 font-bold">截止日期</th>
            {isStudent && <th className="p-3 font-bold">教材版本</th>}
            {isStudent && <th className="p-3 font-bold">年级</th>}
            <th className="p-3 font-bold">密码</th>
            <th className="p-3 font-bold">启用状态</th>
            <th className="p-3 font-bold">门店</th>
            <th className="p-3 font-bold text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id} className="border-b border-outline-variant/20">
              <td className="p-3"><input className="bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none" value={u.username || ''} onChange={(e) => updateLocal(u.id, 'username', e.target.value)} /></td>
              <td className="p-3"><input className="bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none" value={u.name || ''} onChange={(e) => updateLocal(u.id, 'name', e.target.value)} /></td>
              <td className="p-3 text-sm">{formatDateTime(u.createdAt)}</td>
              <td className="p-3"><input type="date" className="bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none" value={u.expireDate || ''} onChange={(e) => updateLocal(u.id, 'expireDate', e.target.value)} /></td>
              {isStudent && (
                <td className="p-3"><select className="bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none" value={u.textbookVersion || textbookOptions[0] || ''} onChange={(e) => updateLocal(u.id, 'textbookVersion', e.target.value)}>{textbookOptions.map((v) => <option key={v} value={v}>{v}</option>)}</select></td>
              )}
              {isStudent && (
                <td className="p-3"><select className="bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none" value={u.grade || GRADE_OPTIONS[0]} onChange={(e) => updateLocal(u.id, 'grade', e.target.value)}>{GRADE_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}</select></td>
              )}
              <td className="p-3"><input className="bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none" value={u.loginPassword || ''} onChange={(e) => updateLocal(u.id, 'loginPassword', e.target.value)} /></td>
              <td className="p-3"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!u.active} onChange={(e) => updateLocal(u.id, 'active', e.target.checked)} />{u.active ? '启用' : '停用'}</label></td>
              <td className="p-3">
                <select className="border rounded-lg px-2 py-1 text-sm" value={safeStore(u.storeName)} onChange={(e) => updateLocal(u.id, 'storeName', e.target.value)}>
                  {stores.map((code) => <option key={code} value={code}>{code}</option>)}
                </select>
              </td>
              <td className="p-3 text-right whitespace-nowrap">
                <button onClick={() => saveUser(u)} disabled={!u.dirty || savingId === u.id} className="p-2 text-secondary hover:bg-secondary-container rounded-lg disabled:opacity-40"><Save className="w-4 h-4" /></button>
                <button onClick={() => deleteUser(u)} disabled={deletingId === u.id} className="p-2 text-error hover:bg-error-container rounded-lg disabled:opacity-40"><Trash2 className="w-4 h-4" /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-2xl font-black">账号管理</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-sm font-bold">门店筛选</label>
            <select className="border rounded-lg px-3 py-2 bg-white" value={selectedStore} onChange={(e) => setSelectedStore(e.target.value)}>
              <option value="ALL">全部门店</option>
              {stores.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              className="border rounded-lg pl-9 pr-3 py-2 bg-white w-64"
              placeholder="搜索手机号或姓名"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowStoreModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg font-bold hover:bg-primary-dim transition-colors"
          >
            门店管理
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg font-bold hover:bg-primary-dim transition-colors"
          >
            <Plus className="w-4 h-4" />
            添加账号
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}
      {message && <div className="rounded-lg border border-green-200 bg-green-50 text-green-700 px-4 py-2 text-sm">{message}</div>}
      {loading && <div className="rounded-lg bg-surface-container-low p-4">加载中...</div>}

      {!loading && (
        <div className="space-y-8">
          <div className="space-y-3">
            <h4 className="text-xl font-black">教师账号</h4>
            {renderRows(teacherUsers, false)}
          </div>
          <div className="space-y-3">
            <h4 className="text-xl font-black">学生账号</h4>
            {renderRows(studentUsers, true)}
          </div>
        </div>
      )}

      {showStoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-[92vw] max-h-[88vh] overflow-auto rounded-xl border border-outline-variant/30 bg-white shadow-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-black">门店管理</h4>
              <button onClick={() => setShowStoreModal(false)} className="rounded-md p-1 text-on-surface-variant hover:bg-surface-container-low"><X className="h-4 w-4" /></button>
            </div>
            <StoreManagement />
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-5xl max-h-[85vh] overflow-auto bg-white rounded-xl border border-outline-variant/30 shadow-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-black">新增账号</h4>
              <button onClick={() => setShowCreateModal(false)} className="rounded-md p-1 text-on-surface-variant hover:bg-surface-container-low"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <input className="border rounded-lg px-3 py-2" placeholder="手机号（11位）" value={newUser.username || ''} onChange={(e) => setNewUser((p) => ({ ...p, username: e.target.value }))} />
              <input className="border rounded-lg px-3 py-2" placeholder="姓名" value={newUser.name || ''} onChange={(e) => setNewUser((p) => ({ ...p, name: e.target.value }))} />
              <select className="border rounded-lg px-3 py-2" value={newUser.role || 'student'} onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value as AdminUser['role'] }))}><option value="student">学生</option><option value="teacher">教师</option></select>
              <select className="border rounded-lg px-3 py-2" value={newUser.storeName || ''} onChange={(e) => setNewUser((p) => ({ ...p, storeName: e.target.value }))}>
                <option value="">选择门店</option>
                {stores.map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
              <input className="border rounded-lg px-3 py-2" placeholder="密码" value={newUser.loginPassword || ''} onChange={(e) => setNewUser((p) => ({ ...p, loginPassword: e.target.value }))} />
            </div>
            {newUser.role === 'student' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <select className="border rounded-lg px-3 py-2" value={newUser.textbookVersion || textbookOptions[0] || ''} onChange={(e) => setNewUser((p) => ({ ...p, textbookVersion: e.target.value }))}>{textbookOptions.map((v) => <option key={v} value={v}>{v}</option>)}</select>
                <select className="border rounded-lg px-3 py-2" value={newUser.grade || GRADE_OPTIONS[0]} onChange={(e) => setNewUser((p) => ({ ...p, grade: e.target.value }))}>{GRADE_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}</select>
                <input type="date" className="border rounded-lg px-3 py-2" value={newUser.expireDate || ''} onChange={(e) => setNewUser((p) => ({ ...p, expireDate: e.target.value }))} />
              </div>
            )}
            {newUser.role === 'teacher' && <input type="date" className="border rounded-lg px-3 py-2 w-full md:w-1/3" value={newUser.expireDate || ''} onChange={(e) => setNewUser((p) => ({ ...p, expireDate: e.target.value }))} />}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 border border-outline-variant rounded-lg font-bold">取消</button>
              <button onClick={createUser} disabled={creating} className="px-4 py-2 bg-secondary text-on-secondary rounded-lg font-bold disabled:opacity-50">{creating ? '创建中...' : '确认添加'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
