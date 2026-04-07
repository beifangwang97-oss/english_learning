import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Send, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { adminStoreApi, adminUserApi, authApi, unitAssignmentApi, UnitAssignment } from '../../lib/auth';
import { lexiconApi } from '../../lib/lexicon';
import { getSessionToken } from '../../lib/session';

type StudentItem = {
  id: string;
  name: string;
  grade: string;
  textbookVersion: string;
};

type SemesterUnitNode = {
  semester: string;
  units: string[];
};

type GradeNode = {
  grade: string;
  semesters: SemesterUnitNode[];
};

type TextbookNode = {
  textbook: string;
  grades: GradeNode[];
};

function sortUnit(a: string, b: string) {
  const an = Number((a || '').replace(/[^\d]/g, ''));
  const bn = Number((b || '').replace(/[^\d]/g, ''));
  if (Number.isFinite(an) && Number.isFinite(bn) && an && bn) return an - bn;
  return a.localeCompare(b, 'zh-CN');
}

function safeStoreCode(value?: string | null) {
  const v = (value || '').trim();
  return v || 'UNASSIGNED';
}

function normalizeLegacyTextbookPermission(permission: string, mergedTextbooks: string[]) {
  const p = (permission || '').trim();
  if (!p) return '';
  if (mergedTextbooks.includes(p)) return p;
  const mapping: Record<string, string[]> = {
    PEP: ['人教版'],
    FLTRP: ['外研版'],
    SHJ: ['上海版'],
  };
  const aliases = mapping[p] || [];
  const hit = mergedTextbooks.find((bv) => aliases.includes(bv));
  return hit || p;
}

export const TeachingUnits: React.FC = () => {
  const { user } = useAuth();
  const token = useMemo(() => getSessionToken(), []);

  const [students, setStudents] = useState<StudentItem[]>([]);
  const [resolvedStoreName, setResolvedStoreName] = useState('');
  const [taskTree, setTaskTree] = useState<TextbookNode[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [expandedTextbooks, setExpandedTextbooks] = useState<string[]>([]);
  const [expandedGrades, setExpandedGrades] = useState<string[]>([]);
  const [expandedSemesters, setExpandedSemesters] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [assignments, setAssignments] = useState<UnitAssignment[]>([]);
  const [taskFilterStudent, setTaskFilterStudent] = useState('');
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<number[]>([]);
  const [deleting, setDeleting] = useState(false);

  const currentStoreCode = useMemo(
    () => safeStoreCode(resolvedStoreName || user?.storeName),
    [resolvedStoreName, user?.storeName]
  );

  const studentNameMap = useMemo(() => {
    const map = new Map<number, string>();
    students.forEach((s) => map.set(Number(s.id), s.name));
    return map;
  }, [students]);

  const filteredAssignments = useMemo(() => {
    const kw = taskFilterStudent.trim().toLowerCase();
    return assignments.filter((a) => {
      if (!kw) return true;
      const n = (studentNameMap.get(a.userId) || '').toLowerCase();
      return n.includes(kw);
    });
  }, [assignments, taskFilterStudent, studentNameMap]);

  const allFilteredIds = useMemo(() => filteredAssignments.map((a) => a.id), [filteredAssignments]);

  const toggleStudent = (id: string) => {
    setSelectedStudents((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const toggleUnit = (id: string) => {
    setSelectedUnits((prev) => (prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]));
  };

  const toggleTextbook = (textbook: string) => {
    setExpandedTextbooks((prev) => (prev.includes(textbook) ? prev.filter((t) => t !== textbook) : [...prev, textbook]));
  };

  const toggleGrade = (gradeKey: string) => {
    setExpandedGrades((prev) => (prev.includes(gradeKey) ? prev.filter((g) => g !== gradeKey) : [...prev, gradeKey]));
  };

  const toggleSemester = (semesterKey: string) => {
    setExpandedSemesters((prev) => (prev.includes(semesterKey) ? prev.filter((s) => s !== semesterKey) : [...prev, semesterKey]));
  };

  const toggleAssignment = (id: number) => {
    setSelectedAssignmentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAllFiltered = () => {
    const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedAssignmentIds.includes(id));
    if (allSelected) {
      setSelectedAssignmentIds((prev) => prev.filter((id) => !allFilteredIds.includes(id)));
    } else {
      setSelectedAssignmentIds((prev) => Array.from(new Set([...prev, ...allFilteredIds])));
    }
  };

  const loadAssignments = async (studentIds: number[]) => {
    if (!studentIds.length) {
      setAssignments([]);
      return;
    }
    const rows = await unitAssignmentApi.getByStudents(token, studentIds);
    setAssignments(rows);
    setSelectedAssignmentIds((prev) => prev.filter((id) => rows.some((r) => r.id === id)));
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [allUsers, stores, taskTreePayload] = await Promise.all([
        adminUserApi.getAllUsers(token),
        adminStoreApi.getAllStores(token),
        lexiconApi.getTaskTree(token),
      ]);

      const store = stores.find((s) => s.storeCode === currentStoreCode);
      const textbookPermissions = (store?.textbookPermissions || []).filter(Boolean);
      const gradePermissions = (store?.gradePermissions || []).filter(Boolean);

      const rawTree = taskTreePayload.tree || [];
      const mergedTextbooks = Array.from(new Set(rawTree.map((b) => b.bookVersion).filter(Boolean)));
      const mergedGrades = Array.from(new Set(rawTree.flatMap((b) => (b.grades || []).map((g) => g.grade)).filter(Boolean)));

      const storeBound = Boolean(store);
      const allowedTextbooks = (storeBound ? textbookPermissions : mergedTextbooks)
        .map((p) => normalizeLegacyTextbookPermission(p, mergedTextbooks))
        .filter(Boolean);
      const allowedGrades = (storeBound ? gradePermissions : mergedGrades).filter(Boolean);

      const storeStudents = allUsers
        .filter((u) => u.role === 'student' && safeStoreCode(u.storeName) === currentStoreCode)
        .map((u) => ({
          id: String(u.id),
          name: u.name || '',
          grade: u.grade || '-',
          textbookVersion: u.textbookVersion || '-',
        }));
      setStudents(storeStudents);

      const tree: TextbookNode[] = rawTree
        .filter((book) => allowedTextbooks.includes(book.bookVersion))
        .map((book) => ({
          textbook: book.bookVersion,
          grades: (book.grades || [])
            .filter((grade) => allowedGrades.includes(grade.grade))
            .map((grade) => ({
              grade: grade.grade,
              semesters: (grade.semesters || [])
                .map((semester) => ({
                  semester: semester.semester,
                  units: (semester.units || []).slice().sort(sortUnit),
                }))
                .filter((semester) => semester.units.length > 0),
            }))
            .filter((grade) => grade.semesters.length > 0),
        }))
        .filter((book) => book.grades.length > 0);

      setTaskTree(tree);
      setExpandedTextbooks(tree.length ? [tree[0].textbook] : []);
      if (tree.length && tree[0].grades.length) {
        setExpandedGrades([`${tree[0].textbook}-${tree[0].grades[0].grade}`]);
      }
      if (tree.length && tree[0].grades.length && tree[0].grades[0].semesters.length) {
        const firstSemester = tree[0].grades[0].semesters[0].semester;
        setExpandedSemesters([`${tree[0].textbook}-${tree[0].grades[0].grade}-${firstSemester}`]);
      }

      await loadAssignments(storeStudents.map((s) => Number(s.id)).filter((v) => Number.isFinite(v)));

      const hasAnyUnits = tree.some((tb) => tb.grades.some((g) => g.semesters.some((s) => s.units.length > 0)));
      if (storeBound && (allowedTextbooks.length === 0 || allowedGrades.length === 0)) {
        setMessage('当前门店尚未配置教材或年级权限，请在管理员端门店管理中设置后再发布任务。');
      } else if (storeBound && !hasAnyUnits && allowedTextbooks.length > 0 && allowedGrades.length > 0) {
        setMessage('已获取到门店权限，但当前权限范围下暂无册别/单元数据，请先导入对应教材+年级+册别的词库。');
      } else {
        setMessage(null);
      }
    } catch (e: any) {
      setError(e?.message || '加载教学任务数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token || user?.role !== 'teacher') return;
    authApi
      .getCurrentUser(token)
      .then((latest) => setResolvedStoreName(latest.storeName || ''))
      .catch(() => setResolvedStoreName(user?.storeName || ''));
  }, [token, user?.role, user?.storeName]);

  useEffect(() => {
    if (!token) return;
    loadData();
  }, [token, currentStoreCode]);

  const handlePublish = async () => {
    if (selectedStudents.length === 0) {
      setError('请先选择学生');
      return;
    }
    if (selectedUnits.length === 0) {
      setError('请先选择要发布的单元');
      return;
    }

    const teacherId = Number(user?.id || 0);
    if (!teacherId) {
      setError('当前教师信息无效，请重新登录');
      return;
    }

    const units = selectedUnits
      .map((raw) => raw.split('||'))
      .filter((parts) => parts.length === 4)
      .map(([textbookVersion, grade, semester, unitName]) => ({ textbookVersion, grade, semester, unitName }));

    if (units.length === 0) {
      setError('单元数据格式错误，请重新选择');
      return;
    }

    setError(null);
    try {
      await unitAssignmentApi.batchAssign(token, {
        assignedBy: teacherId,
        studentIds: selectedStudents.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0),
        units,
      });
      await loadAssignments(students.map((s) => Number(s.id)).filter((v) => Number.isFinite(v)));
      setMessage(`已发布 ${units.length} 个单元给 ${selectedStudents.length} 名学生。`);
      setTimeout(() => setMessage(null), 2500);
    } catch (e: any) {
      setError(e?.message || '发布任务失败');
    }
  };

  const handleDeleteOne = async (id: number) => {
    setDeleting(true);
    setError(null);
    try {
      await unitAssignmentApi.deleteOne(token, id);
      setAssignments((prev) => prev.filter((a) => a.id !== id));
      setSelectedAssignmentIds((prev) => prev.filter((x) => x !== id));
      setMessage('任务已删除');
      setTimeout(() => setMessage(null), 2000);
    } catch (e: any) {
      setError(e?.message || '删除任务失败');
    } finally {
      setDeleting(false);
    }
  };

  const handleBatchDelete = async () => {
    if (!selectedAssignmentIds.length) {
      setError('请先勾选要删除的任务');
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await unitAssignmentApi.batchDelete(token, selectedAssignmentIds);
      setAssignments((prev) => prev.filter((a) => !selectedAssignmentIds.includes(a.id)));
      setSelectedAssignmentIds([]);
      setMessage('已批量删除任务');
      setTimeout(() => setMessage(null), 2000);
    } catch (e: any) {
      setError(e?.message || '批量删除失败');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-8">
      <h2 className="text-3xl font-extrabold mb-2">教学任务管理</h2>
      <p className="text-sm text-on-surface-variant mb-8">当前门店：{resolvedStoreName || user?.storeName || '未分配门店'}</p>

      {error && <div className="rounded-lg bg-red-50 text-red-700 px-4 py-2 mb-4 text-sm">{error}</div>}
      {message && <div className="rounded-lg bg-green-50 text-green-700 px-4 py-2 mb-4 text-sm">{message}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="bg-surface-container rounded-xl p-6 shadow-sm">
          <h3 className="font-bold mb-4">选择学生（本门店）</h3>
          <div className="space-y-2 max-h-[52vh] overflow-y-auto custom-scrollbar pr-1">
            {loading && <div className="p-3 text-sm text-on-surface-variant">正在加载学生列表...</div>}
            {!loading && students.length === 0 && <div className="p-3 text-sm text-on-surface-variant">暂无学生数据</div>}
            {!loading &&
              students.map((student) => (
                <div key={student.id} className="flex items-center justify-between p-3 bg-white rounded-lg cursor-pointer" onClick={() => toggleStudent(student.id)}>
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded border flex items-center justify-center ${selectedStudents.includes(student.id) ? 'bg-primary border-primary' : 'border-gray-300'}`}>
                      {selectedStudents.includes(student.id) && <Check size={14} className="text-white" />}
                    </div>
                    <span className="font-bold">{student.name}</span>
                  </div>
                  <span className="text-sm text-on-surface-variant font-medium">{student.grade} | {student.textbookVersion}</span>
                </div>
              ))}
          </div>
        </div>

        <div className="bg-surface-container rounded-xl p-6 shadow-sm">
          <h3 className="font-bold mb-4">选择单元（教材 → 年级 → 册别 → 单元）</h3>
          <div className="space-y-4 max-h-[52vh] overflow-y-auto custom-scrollbar pr-1">
            {loading && <div className="p-3 text-sm text-on-surface-variant">正在加载权限与单元...</div>}
            {!loading && taskTree.length === 0 && <div className="p-3 text-sm text-on-surface-variant">当前权限范围下暂无可发布内容</div>}
            {!loading &&
              taskTree.map((textbookGroup) => (
                <div key={textbookGroup.textbook}>
                  <div className="flex items-center gap-2 cursor-pointer font-bold text-on-surface" onClick={() => toggleTextbook(textbookGroup.textbook)}>
                    {expandedTextbooks.includes(textbookGroup.textbook) ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    {textbookGroup.textbook}
                  </div>
                  {expandedTextbooks.includes(textbookGroup.textbook) && (
                    <div className="ml-6 mt-2 space-y-2">
                      {textbookGroup.grades.map((gradeGroup) => {
                        const gradeKey = `${textbookGroup.textbook}-${gradeGroup.grade}`;
                        return (
                          <div key={gradeKey}>
                            <div className="flex items-center gap-2 cursor-pointer font-semibold text-on-surface-variant" onClick={() => toggleGrade(gradeKey)}>
                              {expandedGrades.includes(gradeKey) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                              {gradeGroup.grade}
                            </div>
                            {expandedGrades.includes(gradeKey) && (
                              <div className="ml-6 mt-2 space-y-2">
                                {gradeGroup.semesters.map((semesterGroup) => {
                                  const semesterKey = `${gradeKey}-${semesterGroup.semester}`;
                                  return (
                                    <div key={semesterKey}>
                                      <div className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-on-surface-variant" onClick={() => toggleSemester(semesterKey)}>
                                        {expandedSemesters.includes(semesterKey) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        {semesterGroup.semester}
                                      </div>
                                      {expandedSemesters.includes(semesterKey) && (
                                        <div className="ml-6 mt-2 space-y-2">
                                          {semesterGroup.units.map((unit) => {
                                            const unitId = `${textbookGroup.textbook}||${gradeGroup.grade}||${semesterGroup.semester}||${unit}`;
                                            return (
                                              <div key={unitId} className="flex items-center gap-3 p-2 bg-white rounded-lg cursor-pointer" onClick={() => toggleUnit(unitId)}>
                                                <div className={`w-5 h-5 rounded border flex items-center justify-center ${selectedUnits.includes(unitId) ? 'bg-primary border-primary' : 'border-gray-300'}`}>
                                                  {selectedUnits.includes(unitId) && <Check size={14} className="text-white" />}
                                                </div>
                                                <span>{unit}</span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      </div>

      <button
        onClick={handlePublish}
        disabled={selectedStudents.length === 0 || selectedUnits.length === 0}
        className="mt-8 flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-lg font-bold hover:bg-primary-dim transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Send size={20} />
        发布新任务
      </button>

      <div className="mt-10 bg-surface-container rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <h3 className="font-bold text-lg">本门店学生已发布任务</h3>
          <div className="flex items-center gap-3">
            <input
              value={taskFilterStudent}
              onChange={(e) => setTaskFilterStudent(e.target.value)}
              placeholder="按学生姓名筛选"
              className="px-3 py-2 rounded-lg border border-outline-variant/40 bg-white text-sm"
            />
            <button
              onClick={handleBatchDelete}
              disabled={deleting || selectedAssignmentIds.length === 0}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-error-container text-on-error-container hover:bg-error hover:text-white disabled:opacity-50 text-sm font-bold"
            >
              <Trash2 size={16} /> 批量删除
            </button>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-on-surface-variant border-b border-outline-variant/30">
                <th className="py-2 px-2 w-10">
                  <input
                    type="checkbox"
                    checked={allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedAssignmentIds.includes(id))}
                    onChange={toggleSelectAllFiltered}
                  />
                </th>
                <th className="py-2 px-2">学生</th>
                <th className="py-2 px-2">教材</th>
                <th className="py-2 px-2">年级</th>
                <th className="py-2 px-2">册别</th>
                <th className="py-2 px-2">单元</th>
                <th className="py-2 px-2">状态</th>
                <th className="py-2 px-2">发布时间</th>
                <th className="py-2 px-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssignments.map((row) => (
                <tr key={row.id} className="border-b border-outline-variant/20">
                  <td className="py-2 px-2">
                    <input type="checkbox" checked={selectedAssignmentIds.includes(row.id)} onChange={() => toggleAssignment(row.id)} />
                  </td>
                  <td className="py-2 px-2 font-medium">{studentNameMap.get(row.userId) || `ID:${row.userId}`}</td>
                  <td className="py-2 px-2">{row.textbookVersion}</td>
                  <td className="py-2 px-2">{row.grade}</td>
                  <td className="py-2 px-2">{row.semester}</td>
                  <td className="py-2 px-2">{row.unitName}</td>
                  <td className="py-2 px-2">
                    <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-semibold text-xs">已发布</span>
                  </td>
                  <td className="py-2 px-2">{row.createdAt ? new Date(row.createdAt).toLocaleString() : '-'}</td>
                  <td className="py-2 px-2">
                    <button
                      onClick={() => handleDeleteOne(row.id)}
                      disabled={deleting}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-error-container text-on-error-container hover:bg-error hover:text-white disabled:opacity-50"
                    >
                      <Trash2 size={14} /> 删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filteredAssignments.length === 0 && (
            <div className="py-6 text-sm text-on-surface-variant">暂无任务</div>
          )}
        </div>
      </div>
    </div>
  );
};
