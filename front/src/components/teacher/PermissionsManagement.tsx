import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Save, Trash2, X } from 'lucide-react';
import { AdminUser, accountMetaApi, teacherStudentApi } from '../../lib/auth';
import { getSessionToken } from '../../lib/session';

type EditableStudent = AdminUser & { dirty?: boolean };

const GRADE_OPTIONS = [
  '一年级', '二年级', '三年级', '四年级', '五年级', '六年级',
  '七年级', '八年级', '九年级', '高一', '高二', '高三',
];

const defaultNewStudent: Partial<AdminUser> = {
  username: '',
  name: '',
  loginPassword: '123456',
  textbookVersion: '',
  grade: GRADE_OPTIONS[0],
  expireDate: null,
  active: true,
};

function isPhone(value?: string) {
  return !!value && /^1\d{10}$/.test(value);
}

function formatDateTime(value?: string) {
  if (!value) return '-';
  return value.replace('T', ' ').slice(0, 19);
}

function validateStudent(student: Partial<AdminUser>) {
  if (!isPhone(student.username)) return '手机号必须为 11 位数字';
  if (!student.name || !student.name.trim()) return '姓名不能为空';
  if (!student.loginPassword || !student.loginPassword.trim()) return '密码不能为空';
  if (!student.textbookVersion) return '教材版本不能为空';
  if (!student.grade) return '年级不能为空';
  if (!student.expireDate) return '截止日期不能为空';
  return null;
}

export const PermissionsManagement: React.FC = () => {
  const token = useMemo(() => getSessionToken(), []);
  const [students, setStudents] = useState<EditableStudent[]>([]);
  const [textbookOptions, setTextbookOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newStudent, setNewStudent] = useState<Partial<AdminUser>>(defaultNewStudent);

  const loadStudents = async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, versionList] = await Promise.all([
        teacherStudentApi.getStoreStudents(token),
        accountMetaApi.getTextbookVersions(token),
      ]);
      const rowData = data.map((u) => ({ ...u, dirty: false }));
      const optionSet = new Set<string>(versionList);
      rowData.forEach((u) => {
        const value = (u.textbookVersion || '').trim();
        if (value) optionSet.add(value);
      });
      const mergedVersions = Array.from(optionSet).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));

      setStudents(rowData);
      setTextbookOptions(mergedVersions);
      setNewStudent((prev) => ({
        ...prev,
        textbookVersion: prev.textbookVersion || mergedVersions[0] || '',
      }));
      setSelectedIds([]);
    } catch (e: any) {
      setError(e?.message || '加载学生失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudents();
  }, [token]);

  const updateLocalStudent = <K extends keyof EditableStudent>(id: number, key: K, value: EditableStudent[K]) => {
    setStudents((prev) => prev.map((s) => (s.id === id ? { ...s, [key]: value, dirty: true } : s)));
  };

  const saveStudent = async (student: EditableStudent) => {
    const validationError = validateStudent(student);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSavingId(student.id);
    setError(null);
    setMessage(null);
    try {
      const updated = await teacherStudentApi.updateStudent(token, student.id, {
        username: student.username,
        name: student.name,
        loginPassword: student.loginPassword,
        textbookVersion: student.textbookVersion,
        grade: student.grade,
        expireDate: student.expireDate || null,
        active: !!student.active,
      });
      setStudents((prev) => prev.map((s) => (s.id === student.id ? { ...updated, dirty: false } : s)));
      setMessage('保存成功');
    } catch (e: any) {
      setError(e?.message || '保存失败');
    } finally {
      setSavingId(null);
    }
  };

  const deleteOne = async (student: EditableStudent) => {
    if (!window.confirm(`确认删除学生账号 ${student.username}（${student.name}）吗？`)) return;
    setDeletingId(student.id);
    setError(null);
    setMessage(null);
    try {
      await teacherStudentApi.deleteStudent(token, student.id);
      setStudents((prev) => prev.filter((s) => s.id !== student.id));
      setSelectedIds((prev) => prev.filter((id) => id !== student.id));
      setMessage('删除成功');
    } catch (e: any) {
      setError(e?.message || '删除失败');
    } finally {
      setDeletingId(null);
    }
  };

  const batchDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`确认批量删除 ${selectedIds.length} 个学生账号吗？`)) return;
    setBatchDeleting(true);
    setError(null);
    setMessage(null);
    try {
      await teacherStudentApi.batchDeleteStudents(token, selectedIds);
      setStudents((prev) => prev.filter((s) => !selectedIds.includes(s.id)));
      setSelectedIds([]);
      setMessage('批量删除成功');
    } catch (e: any) {
      setError(e?.message || '批量删除失败');
    } finally {
      setBatchDeleting(false);
    }
  };

  const createStudent = async () => {
    const validationError = validateStudent(newStudent);
    if (validationError) {
      setError(validationError);
      return;
    }
    setCreating(true);
    setError(null);
    setMessage(null);
    try {
      const created = await teacherStudentApi.createStudent(token, {
        username: newStudent.username!,
        name: newStudent.name!,
        loginPassword: newStudent.loginPassword!,
        textbookVersion: newStudent.textbookVersion!,
        grade: newStudent.grade!,
        expireDate: newStudent.expireDate || null,
        active: newStudent.active ?? true,
      });
      setStudents((prev) => [{ ...created, dirty: false }, ...prev]);
      setNewStudent({ ...defaultNewStudent, textbookVersion: textbookOptions[0] || '' });
      setShowCreateModal(false);
      setMessage('新增成功');
    } catch (e: any) {
      setError(e?.message || '新增失败');
    } finally {
      setCreating(false);
    }
  };

  const allChecked = students.length > 0 && selectedIds.length === students.length;

  return (
    <div className="p-8 space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-3xl font-extrabold">权限管理（本门店学生）</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={batchDelete}
            disabled={selectedIds.length === 0 || batchDeleting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-300 text-red-700 font-bold disabled:opacity-40"
          >
            <Trash2 size={16} />
            {batchDeleting ? '删除中...' : `批量删除(${selectedIds.length})`}
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg font-bold"
          >
            <Plus size={18} />
            添加学生账号
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}
      {message && <div className="rounded-lg border border-green-200 bg-green-50 text-green-700 px-4 py-2 text-sm">{message}</div>}

      {loading ? (
        <div className="rounded-lg bg-surface-container-low p-4">加载中...</div>
      ) : (
        <div className="bg-surface-container rounded-xl overflow-auto shadow-sm border border-outline-variant/20">
          <table className="w-full text-left min-w-[1300px]">
            <thead className="bg-surface-container-high text-xs uppercase tracking-widest font-bold text-on-surface-variant">
              <tr>
                <th className="p-4">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds(students.map((s) => s.id));
                      else setSelectedIds([]);
                    }}
                  />
                </th>
                <th className="p-4">手机号(账号)</th>
                <th className="p-4">姓名</th>
                <th className="p-4">教材</th>
                <th className="p-4">年级</th>
                <th className="p-4">到期时间</th>
                <th className="p-4">启用</th>
                <th className="p-4">创建时间</th>
                <th className="p-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-high">
              {students.map((s) => (
                <tr key={s.id} className="hover:bg-surface-container-lowest">
                  <td className="p-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(s.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds((prev) => [...prev, s.id]);
                        else setSelectedIds((prev) => prev.filter((id) => id !== s.id));
                      }}
                    />
                  </td>
                  <td className="p-4">
                    <input
                      className="border rounded px-2 py-1 w-40"
                      value={s.username || ''}
                      onChange={(e) => updateLocalStudent(s.id, 'username', e.target.value)}
                    />
                  </td>
                  <td className="p-4">
                    <input
                      className="border rounded px-2 py-1 w-32"
                      value={s.name || ''}
                      onChange={(e) => updateLocalStudent(s.id, 'name', e.target.value)}
                    />
                  </td>
                  <td className="p-4">
                    <select
                      className="border rounded px-2 py-1"
                      value={s.textbookVersion || textbookOptions[0] || ''}
                      onChange={(e) => updateLocalStudent(s.id, 'textbookVersion', e.target.value)}
                    >
                      {textbookOptions.map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-4">
                    <select
                      className="border rounded px-2 py-1"
                      value={s.grade || GRADE_OPTIONS[0]}
                      onChange={(e) => updateLocalStudent(s.id, 'grade', e.target.value)}
                    >
                      {GRADE_OPTIONS.map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-4">
                    <input
                      type="date"
                      className="border rounded px-2 py-1"
                      value={s.expireDate || ''}
                      onChange={(e) => updateLocalStudent(s.id, 'expireDate', e.target.value)}
                    />
                  </td>
                  <td className="p-4">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!s.active}
                        onChange={(e) => updateLocalStudent(s.id, 'active', e.target.checked)}
                      />
                      <span className="text-sm">{s.active ? '启用' : '禁用'}</span>
                    </label>
                  </td>
                  <td className="p-4 text-sm text-on-surface-variant">{formatDateTime(s.createdAt)}</td>
                  <td className="p-4 text-right whitespace-nowrap">
                    <button
                      onClick={() => saveStudent(s)}
                      disabled={!s.dirty || savingId === s.id}
                      className="p-2 hover:bg-emerald-100 rounded-lg text-emerald-800 disabled:opacity-40"
                      title="保存"
                    >
                      <Save size={18} />
                    </button>
                    <button
                      onClick={() => deleteOne(s)}
                      disabled={deletingId === s.id}
                      className="p-2 hover:bg-red-100 rounded-lg text-red-600 disabled:opacity-40"
                      title="删除"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
              {students.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-sm text-on-surface-variant">当前门店暂无学生账号</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white rounded-xl border border-outline-variant/30 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black">添加学生账号（本门店）</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-1 rounded hover:bg-surface-container-low">
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input className="border rounded-lg px-3 py-2" placeholder="手机号(11位)" value={newStudent.username || ''} onChange={(e) => setNewStudent((p) => ({ ...p, username: e.target.value }))} />
              <input className="border rounded-lg px-3 py-2" placeholder="姓名" value={newStudent.name || ''} onChange={(e) => setNewStudent((p) => ({ ...p, name: e.target.value }))} />
              <input className="border rounded-lg px-3 py-2" placeholder="密码" value={newStudent.loginPassword || ''} onChange={(e) => setNewStudent((p) => ({ ...p, loginPassword: e.target.value }))} />
              <select className="border rounded-lg px-3 py-2" value={newStudent.textbookVersion || textbookOptions[0] || ''} onChange={(e) => setNewStudent((p) => ({ ...p, textbookVersion: e.target.value }))}>
                {textbookOptions.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <select className="border rounded-lg px-3 py-2" value={newStudent.grade || GRADE_OPTIONS[0]} onChange={(e) => setNewStudent((p) => ({ ...p, grade: e.target.value }))}>
                {GRADE_OPTIONS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
              <input type="date" className="border rounded-lg px-3 py-2" value={(newStudent.expireDate as string) || ''} onChange={(e) => setNewStudent((p) => ({ ...p, expireDate: e.target.value }))} />
            </div>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={newStudent.active ?? true} onChange={(e) => setNewStudent((p) => ({ ...p, active: e.target.checked }))} />
              启用账号
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 border rounded-lg font-bold">取消</button>
              <button onClick={createStudent} disabled={creating} className="px-4 py-2 bg-primary text-white rounded-lg font-bold disabled:opacity-50">{creating ? '创建中...' : '确认添加'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
