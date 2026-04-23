import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Save, Trash2, X } from 'lucide-react';
import { AdminUser, authApi, teacherStudentApi } from '../../lib/auth';
import { lexiconApi, TextbookScopeBookRow } from '../../lib/lexicon';
import { getSessionToken } from '../../lib/session';

type EditableStudent = AdminUser & { dirty?: boolean };

const DEFAULT_GRADE_OPTIONS = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '七年级', '八年级', '九年级', '高一', '高二', '高三'];

const defaultNewStudent: Partial<AdminUser> = {
  username: '',
  name: '',
  phone: '',
  loginPassword: '123456',
  textbookVersion: '',
  grade: '',
  expireDate: null,
  active: true,
};

function formatDateTime(value?: string) {
  if (!value) return '-';
  return value.replace('T', ' ').slice(0, 19);
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

function validateStudent(student: Partial<AdminUser>) {
  if (!student.name || !student.name.trim()) return '学生姓名不能为空';
  if (!student.phone || !student.phone.trim()) return '联系方式不能为空';
  if (!student.loginPassword || !student.loginPassword.trim()) return '登录密码不能为空';
  if (!student.textbookVersion) return '教材版本不能为空';
  if (!student.grade) return '年级不能为空';
  if (!student.expireDate) return '到期时间不能为空';
  return null;
}

export const PermissionsManagement: React.FC = () => {
  const token = useMemo(() => getSessionToken(), []);
  const [students, setStudents] = useState<EditableStudent[]>([]);
  const [textbookOptions, setTextbookOptions] = useState<string[]>([]);
  const [textbookGradeMap, setTextbookGradeMap] = useState<Record<string, string[]>>({});
  const [currentStoreName, setCurrentStoreName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newStudent, setNewStudent] = useState<Partial<AdminUser>>(defaultNewStudent);

  const loadStudents = async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, textbookScopes, latestUser] = await Promise.all([
        teacherStudentApi.getStoreStudents(token),
        lexiconApi.getTextbookScopes(token),
        authApi.getCurrentUser(token).catch(() => null),
      ]);

      const scopeTree = (textbookScopes?.tree || []) as TextbookScopeBookRow[];
      const nextTextbookGradeMap = buildTextbookGradeMap(scopeTree);
      const optionSet = new Set<string>(scopeTree.map((row) => row.bookVersion).filter(Boolean));
      const rowData = data.map((u) => {
        const textbookVersion = (u.textbookVersion || '').trim();
        if (textbookVersion) optionSet.add(textbookVersion);
        return {
          ...u,
          grade: normalizeGradeForTextbook(textbookVersion, u.grade, nextTextbookGradeMap),
          dirty: false,
        };
      });
      const mergedVersions = Array.from(optionSet).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
      const initialTextbook = (newStudent.textbookVersion || mergedVersions[0] || '').trim();
      const resolvedStoreName = (latestUser?.storeName || rowData[0]?.storeName || '').trim();

      setStudents(rowData);
      setTextbookOptions(mergedVersions);
      setTextbookGradeMap(nextTextbookGradeMap);
      setCurrentStoreName(resolvedStoreName);
      setNewStudent((prev) => ({
        ...prev,
        textbookVersion: initialTextbook,
        grade: normalizeGradeForTextbook(initialTextbook, prev.grade, nextTextbookGradeMap),
      }));
    } catch (e: any) {
      setError(e?.message || '加载学生账号失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudents();
  }, [token]);

  const updateLocalStudent = <K extends keyof EditableStudent>(id: number, key: K, value: EditableStudent[K]) => {
    setStudents((prev) => prev.map((student) => {
      if (student.id !== id) return student;
      const next = { ...student, [key]: value, dirty: true };
      if (key === 'textbookVersion') {
        next.grade = normalizeGradeForTextbook(String(value || ''), next.grade, textbookGradeMap);
      }
      return next;
    }));
  };

  const updateNewStudentField = (key: keyof AdminUser, value: string | boolean | null) => {
    setNewStudent((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'textbookVersion') {
        next.grade = normalizeGradeForTextbook(String(value || ''), next.grade, textbookGradeMap);
      }
      return next;
    });
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
        phone: student.phone,
        name: student.name,
        loginPassword: student.loginPassword,
        textbookVersion: student.textbookVersion,
        grade: normalizeGradeForTextbook(student.textbookVersion, student.grade, textbookGradeMap),
        expireDate: student.expireDate || null,
        active: !!student.active,
      });
      setStudents((prev) => prev.map((item) => (
        item.id === student.id
          ? {
              ...updated,
              grade: normalizeGradeForTextbook(updated.textbookVersion, updated.grade, textbookGradeMap),
              dirty: false,
            }
          : item
      )));
      setMessage('学生账号已保存');
    } catch (e: any) {
      setError(e?.message || '保存学生账号失败');
    } finally {
      setSavingId(null);
    }
  };

  const deleteStudent = async (student: EditableStudent) => {
    if (!window.confirm(`确认删除学生账号 ${student.username} / ${student.name} 吗？`)) return;
    setDeletingId(student.id);
    setError(null);
    setMessage(null);
    try {
      await teacherStudentApi.deleteStudent(token, student.id);
      setStudents((prev) => prev.filter((item) => item.id !== student.id));
      setMessage('学生账号已删除');
    } catch (e: any) {
      setError(e?.message || '删除学生账号失败');
    } finally {
      setDeletingId(null);
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
        username: '',
        phone: newStudent.phone,
        name: newStudent.name!,
        loginPassword: newStudent.loginPassword!,
        textbookVersion: newStudent.textbookVersion!,
        grade: normalizeGradeForTextbook(newStudent.textbookVersion, newStudent.grade, textbookGradeMap),
        expireDate: newStudent.expireDate || null,
        active: newStudent.active ?? true,
      });
      setStudents((prev) => [{
        ...created,
        grade: normalizeGradeForTextbook(created.textbookVersion, created.grade, textbookGradeMap),
        dirty: false,
      }, ...prev]);
      const resetTextbook = textbookOptions[0] || '';
      setNewStudent({
        ...defaultNewStudent,
        textbookVersion: resetTextbook,
        grade: normalizeGradeForTextbook(resetTextbook, '', textbookGradeMap),
      });
      setShowCreateModal(false);
      setMessage('学生账号已创建');
    } catch (e: any) {
      setError(e?.message || '创建学生账号失败');
    } finally {
      setCreating(false);
    }
  };

  const newStudentGradeOptions = getGradeOptionsForTextbook(newStudent.textbookVersion, textbookGradeMap, newStudent.grade);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-2xl font-black">学生账号管理</h3>
          <p className="text-sm text-on-surface-variant mt-1">
            当前门店：{currentStoreName || '未分配门店'}，教师端仅可管理本门店学生，不能新增老师或修改学生门店归属。
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg font-bold hover:bg-primary-dim transition-colors"
        >
          <Plus className="w-4 h-4" />
          新增学生账号
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}
      {message && <div className="rounded-lg border border-green-200 bg-green-50 text-green-700 px-4 py-2 text-sm">{message}</div>}
      {loading && <div className="rounded-lg bg-surface-container-low p-4">正在加载学生账号...</div>}

      {!loading && (
        <div className="overflow-auto max-h-[60vh] bg-surface-container-lowest rounded-xl border border-outline-variant/30">
          <table className="w-full text-left border-collapse min-w-[1500px]">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant/30">
                <th className="p-3 font-bold">登录 ID</th>
                <th className="p-3 font-bold">姓名</th>
                <th className="p-3 font-bold">联系方式</th>
                <th className="p-3 font-bold">创建时间</th>
                <th className="p-3 font-bold">到期时间</th>
                <th className="p-3 font-bold">教材版本</th>
                <th className="p-3 font-bold">年级</th>
                <th className="p-3 font-bold">登录密码</th>
                <th className="p-3 font-bold">启用状态</th>
                <th className="p-3 font-bold">门店归属</th>
                <th className="p-3 font-bold text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => {
                const gradeOptions = getGradeOptionsForTextbook(student.textbookVersion, textbookGradeMap, student.grade);
                return (
                  <tr key={student.id} className="border-b border-outline-variant/20">
                    <td className="p-3">
                      <span className="font-mono text-sm">{student.username || '保存后自动生成'}</span>
                    </td>
                    <td className="p-3">
                      <input
                        className="bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none"
                        value={student.name || ''}
                        onChange={(e) => updateLocalStudent(student.id, 'name', e.target.value)}
                      />
                    </td>
                    <td className="p-3">
                      <input
                        className="bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none"
                        value={student.phone || ''}
                        onChange={(e) => updateLocalStudent(student.id, 'phone', e.target.value)}
                      />
                    </td>
                    <td className="p-3 text-sm">{formatDateTime(student.createdAt)}</td>
                    <td className="p-3">
                      <input
                        type="date"
                        className="bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none"
                        value={student.expireDate || ''}
                        onChange={(e) => updateLocalStudent(student.id, 'expireDate', e.target.value)}
                      />
                    </td>
                    <td className="p-3">
                      <select
                        className="bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none"
                        value={student.textbookVersion || textbookOptions[0] || ''}
                        onChange={(e) => updateLocalStudent(student.id, 'textbookVersion', e.target.value)}
                      >
                        {textbookOptions.map((version) => <option key={version} value={version}>{version}</option>)}
                      </select>
                    </td>
                    <td className="p-3">
                      <select
                        className="bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none"
                        value={student.grade || gradeOptions[0] || ''}
                        onChange={(e) => updateLocalStudent(student.id, 'grade', e.target.value)}
                      >
                        {gradeOptions.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                      </select>
                    </td>
                    <td className="p-3">
                      <input
                        className="bg-transparent border-b border-transparent hover:border-outline-variant focus:border-primary outline-none"
                        value={student.loginPassword || ''}
                        onChange={(e) => updateLocalStudent(student.id, 'loginPassword', e.target.value)}
                      />
                    </td>
                    <td className="p-3">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!student.active}
                          onChange={(e) => updateLocalStudent(student.id, 'active', e.target.checked)}
                        />
                        {student.active ? '启用' : '停用'}
                      </label>
                    </td>
                    <td className="p-3 text-sm text-on-surface-variant">{student.storeName || currentStoreName || '未分配门店'}</td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => saveStudent(student)}
                        disabled={!student.dirty || savingId === student.id}
                        className="p-2 text-secondary hover:bg-secondary-container rounded-lg disabled:opacity-40"
                        title="保存"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteStudent(student)}
                        disabled={deletingId === student.id}
                        className="p-2 text-error hover:bg-error-container rounded-lg disabled:opacity-40"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {students.length === 0 && (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-sm text-on-surface-variant">
                    当前门店下还没有学生账号
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-5xl max-h-[85vh] overflow-auto bg-white rounded-xl border border-outline-variant/30 shadow-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-black">新增学生账号</h4>
              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-md p-1 text-on-surface-variant hover:bg-surface-container-low"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div className="border rounded-lg px-3 py-2 bg-surface-container-low text-sm text-on-surface-variant flex items-center">
                学生登录 ID 创建后自动生成
              </div>
              <input
                className="border rounded-lg px-3 py-2"
                placeholder="姓名"
                value={newStudent.name || ''}
                onChange={(e) => updateNewStudentField('name', e.target.value)}
              />
              <div className="border rounded-lg px-3 py-2 bg-surface-container-low text-sm text-on-surface-variant flex items-center">
                账号类型：学生
              </div>
              <div className="border rounded-lg px-3 py-2 bg-surface-container-low text-sm text-on-surface-variant flex items-center">
                门店归属：{currentStoreName || '未分配门店'}
              </div>
              <input
                className="border rounded-lg px-3 py-2"
                placeholder="登录密码"
                value={newStudent.loginPassword || ''}
                onChange={(e) => updateNewStudentField('loginPassword', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                className="border rounded-lg px-3 py-2"
                placeholder="联系方式"
                value={newStudent.phone || ''}
                onChange={(e) => updateNewStudentField('phone', e.target.value)}
              />
              <select
                className="border rounded-lg px-3 py-2"
                value={newStudent.textbookVersion || textbookOptions[0] || ''}
                onChange={(e) => updateNewStudentField('textbookVersion', e.target.value)}
              >
                {textbookOptions.map((version) => <option key={version} value={version}>{version}</option>)}
              </select>
              <select
                className="border rounded-lg px-3 py-2"
                value={newStudent.grade || newStudentGradeOptions[0] || ''}
                onChange={(e) => updateNewStudentField('grade', e.target.value)}
              >
                {newStudentGradeOptions.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
              </select>
              <input
                type="date"
                className="border rounded-lg px-3 py-2"
                value={newStudent.expireDate || ''}
                onChange={(e) => updateNewStudentField('expireDate', e.target.value)}
              />
            </div>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={newStudent.active ?? true}
                onChange={(e) => updateNewStudentField('active', e.target.checked)}
              />
              启用账号
            </label>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 border border-outline-variant rounded-lg font-bold"
              >
                取消
              </button>
              <button
                onClick={createStudent}
                disabled={creating}
                className="px-4 py-2 bg-secondary text-on-secondary rounded-lg font-bold disabled:opacity-50"
              >
                {creating ? '创建中...' : '确认新增'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
