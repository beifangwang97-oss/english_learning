import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Save, Search, Trash2, X } from 'lucide-react';
import { AdminUser, adminStoreApi, adminUserApi } from '../../lib/auth';
import { lexiconApi, TextbookScopeBookRow } from '../../lib/lexicon';
import { getSessionToken } from '../../lib/session';
import { StoreManagement } from './StoreManagement';

type EditableUser = AdminUser & { dirty?: boolean };

const DEFAULT_GRADE_OPTIONS = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '七年级', '八年级', '九年级', '高一', '高二', '高三'];

const defaultNewUser: Partial<AdminUser> = {
  username: '',
  name: '',
  role: 'student',
  loginPassword: '123456',
  active: true,
  phone: '',
  textbookVersion: '',
  grade: '',
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

function buildTextbookGradeMap(tree: TextbookScopeBookRow[]) {
  return Object.fromEntries(
    (tree || []).map((book) => [
      book.bookVersion,
      Array.from(new Set((book.grades || []).map((row) => (row.grade || '').trim()).filter(Boolean))),
    ]),
  ) as Record<string, string[]>;
}

function getGradeOptionsForTextbook(
  textbookVersion: string | undefined,
  textbookGradeMap: Record<string, string[]>,
  fallbackGrade?: string,
) {
  const grades = textbookGradeMap[(textbookVersion || '').trim()] || [];
  if (grades.length > 0) return grades;
  return fallbackGrade ? [fallbackGrade] : DEFAULT_GRADE_OPTIONS;
}

function normalizeGradeForTextbook(
  textbookVersion: string | undefined,
  grade: string | undefined,
  textbookGradeMap: Record<string, string[]>,
) {
  const options = getGradeOptionsForTextbook(textbookVersion, textbookGradeMap, grade);
  if (!options.length) return grade || '';
  if (grade && options.includes(grade)) return grade;
  return options[0];
}

export const UserAccountManagement: React.FC = () => {
  const token = useMemo(() => getSessionToken(), []);

  const [users, setUsers] = useState<EditableUser[]>([]);
  const [stores, setStores] = useState<string[]>([]);
  const [textbookOptions, setTextbookOptions] = useState<string[]>([]);
  const [textbookGradeMap, setTextbookGradeMap] = useState<Record<string, string[]>>({});
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
      const [allUsers, allStores, textbookScopes] = await Promise.all([
        adminUserApi.getAllUsers(token),
        adminStoreApi.getAllStores(token),
        lexiconApi.getTextbookScopes(token),
      ]);

      const scopeTree = (textbookScopes?.tree || []) as TextbookScopeBookRow[];
      const nextTextbookGradeMap = buildTextbookGradeMap(scopeTree);
      const versionSet = new Set<string>(scopeTree.map((row) => row.bookVersion).filter(Boolean));
      const nonAdminUsers = allUsers
        .filter((u) => u.role !== 'admin')
        .map((u) => {
          const textbookVersion = (u.textbookVersion || '').trim();
          if (textbookVersion) versionSet.add(textbookVersion);
          return {
            ...u,
            grade: u.role === 'student'
              ? normalizeGradeForTextbook(textbookVersion, u.grade, nextTextbookGradeMap)
              : u.grade,
            dirty: false,
          };
        });

      const mergedVersions = Array.from(versionSet).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
      const initialTextbook = (newUser.textbookVersion || mergedVersions[0] || '').trim();

      setUsers(nonAdminUsers);
      setStores(allStores.map((s) => s.storeCode).sort());
      setTextbookOptions(mergedVersions);
      setTextbookGradeMap(nextTextbookGradeMap);
      setNewUser((prev) => ({
        ...prev,
        textbookVersion: initialTextbook,
        grade: normalizeGradeForTextbook(initialTextbook, prev.grade, nextTextbookGradeMap),
      }));
    } catch (e: any) {
      setError(e?.message || '加载账号数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  const validateUser = (u: Partial<AdminUser>) => {
    if (!u.name || !u.name.trim()) return '姓名不能为空';
    if (!u.loginPassword || !u.loginPassword.trim()) return '密码不能为空';
    if (!u.storeName) return '门店不能为空';
    if (!u.expireDate) return '到期时间不能为空';
    if (u.role === 'teacher') {
      if (!isPhone(u.username)) return '教师登录手机号必须是 11 位手机号';
    }
    if (u.role === 'student') {
      if (!u.phone || !u.phone.trim()) return '学生联系方式不能为空';
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
      const account = (u.username || '').toLowerCase();
      const contact = (u.phone || '').toLowerCase();
      const name = (u.name || '').toLowerCase();
      return account.includes(keyword) || contact.includes(keyword) || name.includes(keyword);
    });
  }, [users, selectedStore, searchKeyword]);

  const teacherUsers = useMemo(() => visibleUsers.filter((u) => u.role === 'teacher'), [visibleUsers]);
  const studentUsers = useMemo(() => visibleUsers.filter((u) => u.role === 'student'), [visibleUsers]);

  const updateLocal = <K extends keyof EditableUser>(id: number, key: K, value: EditableUser[K]) => {
    setUsers((prev) => prev.map((u) => {
      if (u.id !== id) return u;
      const next = { ...u, [key]: value, dirty: true };
      if (u.role === 'student' && key === 'textbookVersion') {
        next.grade = normalizeGradeForTextbook(String(value || ''), next.grade, textbookGradeMap);
      }
      return next;
    }));
  };

  const updateNewUser = (key: keyof AdminUser, value: any) => {
    setNewUser((prev) => {
      const next = { ...prev, [key]: value };
      if ((prev.role || 'student') === 'student' && key === 'textbookVersion') {
        next.grade = normalizeGradeForTextbook(String(value || ''), next.grade, textbookGradeMap);
      }
      return next;
    });
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
        name: u.name,
        role: u.role,
        loginPassword: u.loginPassword,
        active: !!u.active,
        expireDate: u.expireDate || null,
        storeName: safeStore(u.storeName),
      };

      if (u.role === 'teacher') {
        payload.username = u.username;
        payload.phone = u.username;
        payload.textbookVersion = null;
        payload.grade = null;
      } else {
        payload.username = u.username;
        payload.phone = (u.phone || '').trim();
        payload.textbookVersion = u.textbookVersion;
        payload.grade = normalizeGradeForTextbook(u.textbookVersion, u.grade, textbookGradeMap);
      }

      const updated = await adminUserApi.updateUser(token, u.id, payload);
      setUsers((prev) => prev.map((item) => (
        item.id === u.id
          ? {
              ...updated,
              grade: updated.role === 'student'
                ? normalizeGradeForTextbook(updated.textbookVersion, updated.grade, textbookGradeMap)
                : updated.grade,
              dirty: false,
            }
          : item
      )));
      setMessage('保存成功');
    } catch (e: any) {
      setError(e?.message || '保存失败');
    } finally {
      setSavingId(null);
    }
  };

  const deleteUser = async (u: EditableUser) => {
    if (!window.confirm(`确认删除账号 ${u.username} / ${u.name} 吗？`)) return;
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
        name: newUser.name,
        role,
        loginPassword: newUser.loginPassword,
        active: true,
        storeName: safeStore(newUser.storeName),
        expireDate: newUser.expireDate || null,
      };
      if (role === 'teacher') {
        payload.username = newUser.username;
        payload.phone = newUser.username;
        payload.textbookVersion = null;
        payload.grade = null;
      } else {
        payload.username = '';
        payload.phone = (newUser.phone || '').trim();
        payload.textbookVersion = newUser.textbookVersion;
        payload.grade = normalizeGradeForTextbook(newUser.textbookVersion, newUser.grade, textbookGradeMap);
      }
      const created = await adminUserApi.createUser(token, payload);
      setUsers((prev) => [{
        ...created,
        grade: created.role === 'student'
          ? normalizeGradeForTextbook(created.textbookVersion, created.grade, textbookGradeMap)
          : created.grade,
        dirty: false,
      }, ...prev]);
      setShowCreateModal(false);
      const resetTextbook = textbookOptions[0] || '';
      setNewUser({
        ...defaultNewUser,
        role,
        textbookVersion: resetTextbook,
        grade: normalizeGradeForTextbook(resetTextbook, '', textbookGradeMap),
      });
      setMessage('创建成功');
    } catch (e: any) {
      setError(e?.message || '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const renderTeacherRows = (rows: EditableUser[]) => (
    <div className="overflow-auto max-h-[34vh] bg-surface-container-lowest rounded-xl border border-outline-variant/30">
      <table className="w-full text-left border-collapse min-w-[1100px]">
        <thead>
          <tr className="bg-surface-container-low border-b border-outline-variant/30">
            <th className="p-3 font-bold">登录手机号</th>
            <th className="p-3 font-bold">姓名</th>
            <th className="p-3 font-bold">创建时间</th>
            <th className="p-3 font-bold">到期时间</th>
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
              <td className="p-3"><input className="bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none" value={u.loginPassword || ''} onChange={(e) => updateLocal(u.id, 'loginPassword', e.target.value)} /></td>
              <td className="p-3"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!u.active} onChange={(e) => updateLocal(u.id, 'active', e.target.checked)} />{u.active ? '启用' : '停用'}</label></td>
              <td className="p-3"><select className="border rounded-lg px-2 py-1 text-sm" value={safeStore(u.storeName)} onChange={(e) => updateLocal(u.id, 'storeName', e.target.value)}>{stores.map((code) => <option key={code} value={code}>{code}</option>)}</select></td>
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

  const renderStudentRows = (rows: EditableUser[]) => (
    <div className="overflow-auto max-h-[42vh] bg-surface-container-lowest rounded-xl border border-outline-variant/30">
      <table className="w-full text-left border-collapse min-w-[1380px]">
        <thead>
          <tr className="bg-surface-container-low border-b border-outline-variant/30">
            <th className="p-3 font-bold">登录 ID</th>
            <th className="p-3 font-bold">姓名</th>
            <th className="p-3 font-bold">联系方式</th>
            <th className="p-3 font-bold">创建时间</th>
            <th className="p-3 font-bold">到期时间</th>
            <th className="p-3 font-bold">教材版本</th>
            <th className="p-3 font-bold">年级</th>
            <th className="p-3 font-bold">密码</th>
            <th className="p-3 font-bold">启用状态</th>
            <th className="p-3 font-bold">门店</th>
            <th className="p-3 font-bold text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => {
            const gradeOptions = getGradeOptionsForTextbook(u.textbookVersion, textbookGradeMap, u.grade);
            return (
              <tr key={u.id} className="border-b border-outline-variant/20">
                <td className="p-3"><span className="font-mono text-sm">{u.username || '保存后自动生成'}</span></td>
                <td className="p-3"><input className="bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none" value={u.name || ''} onChange={(e) => updateLocal(u.id, 'name', e.target.value)} /></td>
                <td className="p-3"><input className="bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none" value={u.phone || ''} onChange={(e) => updateLocal(u.id, 'phone', e.target.value)} /></td>
                <td className="p-3 text-sm">{formatDateTime(u.createdAt)}</td>
                <td className="p-3"><input type="date" className="bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none" value={u.expireDate || ''} onChange={(e) => updateLocal(u.id, 'expireDate', e.target.value)} /></td>
                <td className="p-3"><select className="bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none" value={u.textbookVersion || textbookOptions[0] || ''} onChange={(e) => updateLocal(u.id, 'textbookVersion', e.target.value)}>{textbookOptions.map((v) => <option key={v} value={v}>{v}</option>)}</select></td>
                <td className="p-3"><select className="bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none" value={u.grade || gradeOptions[0] || ''} onChange={(e) => updateLocal(u.id, 'grade', e.target.value)}>{gradeOptions.map((g) => <option key={g} value={g}>{g}</option>)}</select></td>
                <td className="p-3"><input className="bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none" value={u.loginPassword || ''} onChange={(e) => updateLocal(u.id, 'loginPassword', e.target.value)} /></td>
                <td className="p-3"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!u.active} onChange={(e) => updateLocal(u.id, 'active', e.target.checked)} />{u.active ? '启用' : '停用'}</label></td>
                <td className="p-3"><select className="border rounded-lg px-2 py-1 text-sm" value={safeStore(u.storeName)} onChange={(e) => updateLocal(u.id, 'storeName', e.target.value)}>{stores.map((code) => <option key={code} value={code}>{code}</option>)}</select></td>
                <td className="p-3 text-right whitespace-nowrap">
                  <button onClick={() => saveUser(u)} disabled={!u.dirty || savingId === u.id} className="p-2 text-secondary hover:bg-secondary-container rounded-lg disabled:opacity-40"><Save className="w-4 h-4" /></button>
                  <button onClick={() => deleteUser(u)} disabled={deletingId === u.id} className="p-2 text-error hover:bg-error-container rounded-lg disabled:opacity-40"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const newUserGradeOptions = getGradeOptionsForTextbook(newUser.textbookVersion, textbookGradeMap, newUser.grade);

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
            <input className="border rounded-lg pl-9 pr-3 py-2 bg-white w-64" placeholder="搜索登录 ID、联系方式或姓名" value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowStoreModal(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg font-bold hover:bg-primary-dim transition-colors">门店管理</button>
          <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg font-bold hover:bg-primary-dim transition-colors"><Plus className="w-4 h-4" />新增账号</button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}
      {message && <div className="rounded-lg border border-green-200 bg-green-50 text-green-700 px-4 py-2 text-sm">{message}</div>}
      {loading && <div className="rounded-lg bg-surface-container-low p-4">加载中...</div>}

      {!loading && (
        <div className="space-y-8">
          <div className="space-y-3">
            <h4 className="text-xl font-black">教师账号</h4>
            {renderTeacherRows(teacherUsers)}
          </div>
          <div className="space-y-3">
            <h4 className="text-xl font-black">学生账号</h4>
            {renderStudentRows(studentUsers)}
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
              {newUser.role === 'teacher' ? (
                <input className="border rounded-lg px-3 py-2" placeholder="教师登录手机号" value={newUser.username || ''} onChange={(e) => updateNewUser('username', e.target.value)} />
              ) : (
                <div className="border rounded-lg px-3 py-2 bg-surface-container-low text-sm text-on-surface-variant flex items-center">学生登录 ID 将在创建后自动生成</div>
              )}
              <input className="border rounded-lg px-3 py-2" placeholder="姓名" value={newUser.name || ''} onChange={(e) => updateNewUser('name', e.target.value)} />
              <select className="border rounded-lg px-3 py-2" value={newUser.role || 'student'} onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value as AdminUser['role'] }))}><option value="student">学生</option><option value="teacher">教师</option></select>
              <select className="border rounded-lg px-3 py-2" value={newUser.storeName || ''} onChange={(e) => updateNewUser('storeName', e.target.value)}>
                <option value="">选择门店</option>
                {stores.map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
              <input className="border rounded-lg px-3 py-2" placeholder="密码" value={newUser.loginPassword || ''} onChange={(e) => updateNewUser('loginPassword', e.target.value)} />
            </div>
            {newUser.role === 'student' && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input className="border rounded-lg px-3 py-2" placeholder="联系方式" value={newUser.phone || ''} onChange={(e) => updateNewUser('phone', e.target.value)} />
                <select className="border rounded-lg px-3 py-2" value={newUser.textbookVersion || textbookOptions[0] || ''} onChange={(e) => updateNewUser('textbookVersion', e.target.value)}>{textbookOptions.map((v) => <option key={v} value={v}>{v}</option>)}</select>
                <select className="border rounded-lg px-3 py-2" value={newUser.grade || newUserGradeOptions[0] || ''} onChange={(e) => updateNewUser('grade', e.target.value)}>{newUserGradeOptions.map((g) => <option key={g} value={g}>{g}</option>)}</select>
                <input type="date" className="border rounded-lg px-3 py-2" value={newUser.expireDate || ''} onChange={(e) => updateNewUser('expireDate', e.target.value)} />
              </div>
            )}
            {newUser.role === 'teacher' && <input type="date" className="border rounded-lg px-3 py-2 w-full md:w-1/3" value={newUser.expireDate || ''} onChange={(e) => updateNewUser('expireDate', e.target.value)} />}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 border border-outline-variant rounded-lg font-bold">取消</button>
              <button onClick={createUser} disabled={creating} className="px-4 py-2 bg-secondary text-on-secondary rounded-lg font-bold disabled:opacity-50">{creating ? '创建中...' : '确认新增'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
