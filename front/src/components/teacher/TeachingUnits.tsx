import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, ClipboardList, Send, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  adminStoreApi,
  adminUserApi,
  authApi,
  teacherExamPaperApi,
  TeacherExamPaperListItem,
  unitAssignmentApi,
  UnitAssignment,
} from '../../lib/auth';
import { lexiconApi, normalizeTextbookPermissionToAvailable } from '../../lib/lexicon';
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
  const left = Number((a || '').replace(/[^\d]/g, ''));
  const right = Number((b || '').replace(/[^\d]/g, ''));
  if (Number.isFinite(left) && Number.isFinite(right) && left && right) return left - right;
  return a.localeCompare(b, 'zh-CN');
}

function safeStoreCode(value?: string | null) {
  const normalized = (value || '').trim();
  return normalized || 'UNASSIGNED';
}

export const TeachingUnits: React.FC = () => {
  const { user } = useAuth();
  const token = useMemo(() => getSessionToken(), []);

  const [students, setStudents] = useState<StudentItem[]>([]);
  const [resolvedStoreName, setResolvedStoreName] = useState('');
  const [taskTree, setTaskTree] = useState<TextbookNode[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [expandedTextbooks, setExpandedTextbooks] = useState<Set<string>>(new Set());
  const [expandedGrades, setExpandedGrades] = useState<Set<string>>(new Set());
  const [expandedSemesters, setExpandedSemesters] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [assignments, setAssignments] = useState<UnitAssignment[]>([]);
  const [papers, setPapers] = useState<TeacherExamPaperListItem[]>([]);
  const [selectedPaperId, setSelectedPaperId] = useState<number | ''>('');
  const [taskFilterStudent, setTaskFilterStudent] = useState('');
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<number[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [studentGradeFilter, setStudentGradeFilter] = useState('ALL');
  const [studentBookFilter, setStudentBookFilter] = useState('ALL');

  const currentStoreCode = useMemo(
    () => safeStoreCode(resolvedStoreName || user?.storeName),
    [resolvedStoreName, user?.storeName]
  );

  const filteredStudents = useMemo(
    () =>
      students.filter((student) => {
        if (studentGradeFilter !== 'ALL' && student.grade !== studentGradeFilter) return false;
        if (studentBookFilter !== 'ALL' && student.textbookVersion !== studentBookFilter) return false;
        return true;
      }),
    [students, studentGradeFilter, studentBookFilter]
  );

  const studentGradeOptions = useMemo(
    () => Array.from(new Set(students.map((row) => row.grade).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'zh-CN')),
    [students]
  );

  const studentBookOptions = useMemo(
    () => Array.from(new Set(students.map((row) => row.textbookVersion).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'zh-CN')),
    [students]
  );

  const studentNameMap = useMemo(() => {
    const map = new Map<number, string>();
    students.forEach((row) => map.set(Number(row.id), row.name));
    return map;
  }, [students]);

  const filteredAssignments = useMemo(() => {
    const keyword = taskFilterStudent.trim().toLowerCase();
    return assignments.filter((row) => {
      if (!keyword) return true;
      const name = (studentNameMap.get(row.userId) || '').toLowerCase();
      return name.includes(keyword);
    });
  }, [assignments, taskFilterStudent, studentNameMap]);

  const allFilteredIds = useMemo(() => filteredAssignments.map((row) => row.id), [filteredAssignments]);
  const selectedPaper = useMemo(
    () => (selectedPaperId === '' ? null : papers.find((row) => row.id === selectedPaperId) || null),
    [papers, selectedPaperId]
  );

  const toggleStudent = (id: string) => {
    setSelectedStudents((prev) => (prev.includes(id) ? prev.filter((row) => row !== id) : [...prev, id]));
  };

  const toggleUnit = (id: string) => {
    setSelectedUnits((prev) => (prev.includes(id) ? prev.filter((row) => row !== id) : [...prev, id]));
  };

  const toggleTextbook = (textbook: string) => {
    setExpandedTextbooks((prev) => {
      const next = new Set(prev);
      if (next.has(textbook)) next.delete(textbook);
      else next.add(textbook);
      return next;
    });
  };

  const toggleGrade = (gradeKey: string) => {
    setExpandedGrades((prev) => {
      const next = new Set(prev);
      if (next.has(gradeKey)) next.delete(gradeKey);
      else next.add(gradeKey);
      return next;
    });
  };

  const toggleSemester = (semesterKey: string) => {
    setExpandedSemesters((prev) => {
      const next = new Set(prev);
      if (next.has(semesterKey)) next.delete(semesterKey);
      else next.add(semesterKey);
      return next;
    });
  };

  const toggleAssignment = (id: number) => {
    setSelectedAssignmentIds((prev) => (prev.includes(id) ? prev.filter((row) => row !== id) : [...prev, id]));
  };

  const toggleSelectAllFiltered = () => {
    const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedAssignmentIds.includes(id));
    if (allSelected) {
      setSelectedAssignmentIds((prev) => prev.filter((id) => !allFilteredIds.includes(id)));
      return;
    }
    setSelectedAssignmentIds((prev) => Array.from(new Set([...prev, ...allFilteredIds])));
  };

  const loadAssignments = async (studentIds: number[]) => {
    if (!studentIds.length) {
      setAssignments([]);
      return;
    }
    const rows = await unitAssignmentApi.getByStudents(token, studentIds);
    setAssignments(rows);
    setSelectedAssignmentIds((prev) => prev.filter((id) => rows.some((row) => row.id === id)));
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [allUsers, stores, textbookScopes] = await Promise.all([
        adminUserApi.getAllUsers(token),
        adminStoreApi.getAllStores(token),
        lexiconApi.getTextbookScopes(token),
      ]);

      const store = stores.find((row) => row.storeCode === currentStoreCode);
      const textbookPermissions = (store?.textbookPermissions || []).filter(Boolean);
      const scopeTree = textbookScopes.tree || [];
      const availableBooks = Array.from(new Set(scopeTree.map((row) => row.bookVersion).filter(Boolean)));
      const allowedTextbooks = (store ? textbookPermissions : availableBooks)
        .map((permission) => normalizeTextbookPermissionToAvailable(permission, availableBooks))
        .filter(Boolean);

      const storeStudents = allUsers
        .filter((row) => row.role === 'student' && safeStoreCode(row.storeName) === currentStoreCode)
        .map((row) => ({
          id: String(row.id),
          name: row.name || row.username || `ID:${row.id}`,
          grade: row.grade || '-',
          textbookVersion: row.textbookVersion || '-',
        }));
      setStudents(storeStudents);

      const tree: TextbookNode[] = await Promise.all(
        scopeTree
          .filter((book) => allowedTextbooks.length === 0 || allowedTextbooks.includes(book.bookVersion))
          .map(async (book) => ({
            textbook: book.bookVersion,
            grades: await Promise.all(
              (book.grades || []).map(async (gradeNode) => ({
                grade: gradeNode.grade,
                semesters: await Promise.all(
                  (gradeNode.semesters || []).map(async (semester) => {
                    try {
                      const wordItems = await lexiconApi.getItems(token, 'word', book.bookVersion, gradeNode.grade, semester);
                      const units = Array.from(new Set((wordItems.items || []).map((item) => item.unit).filter(Boolean))).sort(sortUnit);
                      return { semester, units };
                    } catch {
                      return { semester, units: [] as string[] };
                    }
                  })
                ),
              }))
            ),
          }))
      );

      setTaskTree(tree);
      setExpandedTextbooks(new Set(tree.length ? [tree[0].textbook] : []));
      setExpandedGrades(new Set(tree.length && tree[0].grades.length ? [`${tree[0].textbook}||${tree[0].grades[0].grade}`] : []));
      setExpandedSemesters(
        new Set(
          tree.length && tree[0].grades.length && tree[0].grades[0].semesters.length
            ? [`${tree[0].textbook}||${tree[0].grades[0].grade}||${tree[0].grades[0].semesters[0].semester}`]
            : []
        )
      );

      await loadAssignments(storeStudents.map((row) => Number(row.id)).filter((id) => Number.isFinite(id)));

      if (user?.id) {
        const teacherPapers = await teacherExamPaperApi.list(token, Number(user.id), currentStoreCode);
        setPapers(teacherPapers);
        setSelectedPaperId((prev) => (prev && teacherPapers.some((row) => row.id === prev) ? prev : ''));
      } else {
        setPapers([]);
        setSelectedPaperId('');
      }

      setMessage(null);
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
    if (selectedStudents.length === 0) return setError('请先选择学生');
    if (selectedUnits.length === 0) return setError('请先选择教学单元');

    const teacherId = Number(user?.id || 0);
    if (!teacherId) return setError('当前教师账号信息无效，请重新登录后再试');

    const units = selectedUnits
      .map((raw) => raw.split('||'))
      .filter((parts) => parts.length === 4)
      .map(([textbookVersion, grade, semester, unitName]) => ({
        textbookVersion,
        grade,
        semester,
        unitName,
        paperId: selectedPaper?.id,
        paperTitle: selectedPaper?.title,
      }));

    if (!units.length) return setError('没有可发布的单元数据');

    setError(null);
    try {
      await unitAssignmentApi.batchAssign(token, {
        assignedBy: teacherId,
        studentIds: selectedStudents.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0),
        units,
        paperId: selectedPaper?.id,
        paperTitle: selectedPaper?.title,
      });
      await loadAssignments(students.map((row) => Number(row.id)).filter((id) => Number.isFinite(id)));
      setMessage(`已向 ${selectedStudents.length} 名学生发布 ${units.length} 个单元任务`);
      setTimeout(() => setMessage(null), 2500);
    } catch (e: any) {
      setError(e?.message || '发布教学任务失败');
    }
  };

  const handleDeleteOne = async (id: number) => {
    setDeleting(true);
    setError(null);
    try {
      await unitAssignmentApi.deleteOne(token, id);
      setAssignments((prev) => prev.filter((row) => row.id !== id));
      setSelectedAssignmentIds((prev) => prev.filter((row) => row !== id));
      setMessage('任务已删除');
      setTimeout(() => setMessage(null), 2000);
    } catch (e: any) {
      setError(e?.message || '删除任务失败');
    } finally {
      setDeleting(false);
    }
  };

  const handleBatchDelete = async () => {
    if (!selectedAssignmentIds.length) return setError('请先选择要删除的任务');
    setDeleting(true);
    setError(null);
    try {
      await unitAssignmentApi.batchDelete(token, selectedAssignmentIds);
      setAssignments((prev) => prev.filter((row) => !selectedAssignmentIds.includes(row.id)));
      setSelectedAssignmentIds([]);
      setMessage('已批量删除任务');
      setTimeout(() => setMessage(null), 2000);
    } catch (e: any) {
      setError(e?.message || '批量删除任务失败');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[96rem] animate-in fade-in p-8">
      <header className="mb-8">
        <h2 className="mb-2 flex items-center gap-3 text-3xl font-black text-on-background">
          <ClipboardList className="h-8 w-8 text-primary" />
          教学任务
        </h2>
        <p className="text-on-surface-variant">当前门店：{resolvedStoreName || user?.storeName || '未分配'}，可为学生发布单元任务，并可关联教师自组试卷。</p>
      </header>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
      {message && <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">{message}</div>}

      <div className="mb-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="flex h-[720px] flex-col rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
          <div className="rounded-t-2xl border-b border-outline-variant/20 bg-surface-container-low/50 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-bold">选择学生</h3>
              <button
                onClick={() =>
                  setSelectedStudents((prev) =>
                    prev.length === filteredStudents.length
                      ? prev.filter((id) => !filteredStudents.some((row) => row.id === id))
                      : Array.from(new Set([...prev, ...filteredStudents.map((row) => row.id)]))
                  )
                }
                className="text-sm font-bold text-primary"
              >
                {filteredStudents.length > 0 && filteredStudents.every((row) => selectedStudents.includes(row.id)) ? '取消全选' : '全选'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select value={studentGradeFilter} onChange={(e) => setStudentGradeFilter(e.target.value)} className="rounded-lg border border-outline-variant/30 bg-white px-3 py-2 text-sm">
                <option value="ALL">全部年级</option>
                {studentGradeOptions.map((grade) => (
                  <option key={grade} value={grade}>{grade}</option>
                ))}
              </select>
              <select value={studentBookFilter} onChange={(e) => setStudentBookFilter(e.target.value)} className="rounded-lg border border-outline-variant/30 bg-white px-3 py-2 text-sm">
                <option value="ALL">全部教材</option>
                {studentBookOptions.map((book) => (
                  <option key={book} value={book}>{book}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-4">
            {loading && <div className="rounded-xl bg-surface-container-high p-4 text-sm text-on-surface-variant">正在加载学生列表...</div>}
            {!loading && filteredStudents.length === 0 && <div className="rounded-xl bg-surface-container-high p-4 text-sm text-on-surface-variant">当前筛选条件下暂无学生。</div>}
            {!loading && filteredStudents.map((student) => {
              const checked = selectedStudents.includes(student.id);
              return (
                <div
                  key={student.id}
                  onClick={() => toggleStudent(student.id)}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border-2 p-4 transition-all ${checked ? 'border-primary bg-primary-container/20' : 'border-transparent hover:bg-surface-container-highest'}`}
                >
                  <div>
                    <p className="font-bold text-on-surface">{student.name}</p>
                    <p className="text-xs text-on-surface-variant">{student.grade} / {student.textbookVersion}</p>
                  </div>
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${checked ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant'}`}>
                    {checked && <CheckCircle2 className="h-4 w-4" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex h-[720px] flex-col rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
          <div className="space-y-3 rounded-t-2xl border-b border-outline-variant/20 bg-surface-container-low/50 p-6">
            <h3 className="text-xl font-bold">选择教学单元</h3>
            <p className="text-xs text-on-surface-variant">可选填试卷，发布后学生在对应单元任务中会关联这份测试卷。</p>
            <select
              value={selectedPaperId}
              onChange={(e) => setSelectedPaperId(e.target.value ? Number(e.target.value) : '')}
              className="w-full rounded-xl border border-outline-variant/30 bg-white px-3 py-2 text-sm"
            >
              <option value="">不关联试卷</option>
              {papers.map((paper) => (
                <option key={paper.id} value={paper.id}>
                  {paper.title}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {loading && <div className="rounded-xl bg-surface-container-high p-4 text-sm text-on-surface-variant">正在加载单元树...</div>}
            {!loading && taskTree.length === 0 && <div className="rounded-xl bg-surface-container-high p-4 text-sm text-on-surface-variant">当前门店暂无可发布的教材单元。</div>}
            {!loading && taskTree.map((book) => {
              const bookExpanded = expandedTextbooks.has(book.textbook);
              return (
                <div key={book.textbook} className="mb-4 overflow-hidden rounded-2xl border border-outline-variant/20">
                  <button onClick={() => toggleTextbook(book.textbook)} className="flex w-full items-center justify-between bg-surface-container-low px-4 py-3 hover:bg-surface-container-high">
                    <span className="font-bold text-on-surface">{book.textbook}</span>
                    <ChevronRight className={`h-4 w-4 transition-transform ${bookExpanded ? 'rotate-90' : ''}`} />
                  </button>
                  {bookExpanded && (
                    <div className="bg-surface-container-low/30 p-3">
                      {book.grades.map((gradeNode) => {
                        const gradeKey = `${book.textbook}||${gradeNode.grade}`;
                        const gradeExpanded = expandedGrades.has(gradeKey);
                        return (
                          <div key={gradeKey} className="mb-2 overflow-hidden rounded-xl border border-outline-variant/20">
                            <button onClick={() => toggleGrade(gradeKey)} className="flex w-full items-center justify-between bg-surface-container-lowest px-4 py-3 hover:bg-surface-container-highest">
                              <span className="font-bold">{gradeNode.grade}</span>
                              <ChevronRight className={`h-4 w-4 transition-transform ${gradeExpanded ? 'rotate-90' : ''}`} />
                            </button>
                            {gradeExpanded && (
                              <div className="space-y-2 bg-surface-container-low/30 p-2">
                                {gradeNode.semesters.map((semesterNode) => {
                                  const semesterKey = `${book.textbook}||${gradeNode.grade}||${semesterNode.semester}`;
                                  const semesterExpanded = expandedSemesters.has(semesterKey);
                                  return (
                                    <div key={semesterKey}>
                                      <button onClick={() => toggleSemester(semesterKey)} className="mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-surface-container-highest">
                                        <span className="text-sm font-bold text-on-surface-variant">{semesterNode.semester}</span>
                                        <ChevronRight className={`h-4 w-4 transition-transform ${semesterExpanded ? 'rotate-90' : ''}`} />
                                      </button>
                                      {semesterExpanded && (
                                        <div className="space-y-1 pl-3">
                                          {semesterNode.units.map((unit) => {
                                            const unitId = `${book.textbook}||${gradeNode.grade}||${semesterNode.semester}||${unit}`;
                                            const checked = selectedUnits.includes(unitId);
                                            return (
                                              <label key={unitId} className="flex cursor-pointer items-center justify-between rounded-lg border border-outline-variant/20 bg-white px-3 py-2 hover:bg-surface-container-highest">
                                                <span className="text-sm font-medium">{unit}</span>
                                                <input type="checkbox" checked={checked} onChange={() => toggleUnit(unitId)} />
                                              </label>
                                            );
                                          })}
                                          {semesterNode.units.length === 0 && <div className="px-3 py-2 text-xs text-on-surface-variant">当前册次暂无单元。</div>}
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
              );
            })}
          </div>
          <div className="rounded-b-2xl border-t border-outline-variant/20 bg-surface-container-low/50 p-4">
            <button
              onClick={handlePublish}
              disabled={selectedStudents.length === 0 || selectedUnits.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-black text-on-primary disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              发布教学任务
            </button>
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest shadow-sm">
        <div className="flex flex-col gap-3 border-b border-outline-variant/20 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <h4 className="text-lg font-black text-on-surface">已发布任务</h4>
          <div className="flex items-center gap-3">
            <input
              value={taskFilterStudent}
              onChange={(e) => setTaskFilterStudent(e.target.value)}
              placeholder="按学生姓名搜索"
              className="rounded-lg border border-outline-variant/30 bg-white px-3 py-2 text-sm"
            />
            <button
              onClick={handleBatchDelete}
              disabled={deleting || selectedAssignmentIds.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-3 py-2 text-sm font-bold text-red-600 disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />
              批量删除
            </button>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-surface-container-low">
              <tr>
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedAssignmentIds.includes(id))}
                    onChange={toggleSelectAllFiltered}
                  />
                </th>
                <th className="px-4 py-3">学生</th>
                <th className="px-4 py-3">教材</th>
                <th className="px-4 py-3">年级</th>
                <th className="px-4 py-3">册数</th>
                <th className="px-4 py-3">单元</th>
                <th className="px-4 py-3">试卷</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">发布时间</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssignments.map((row) => (
                <tr key={row.id} className="border-t border-outline-variant/20">
                  <td className="px-4 py-2">
                    <input type="checkbox" checked={selectedAssignmentIds.includes(row.id)} onChange={() => toggleAssignment(row.id)} />
                  </td>
                  <td className="px-4 py-2 font-medium">{studentNameMap.get(row.userId) || `ID:${row.userId}`}</td>
                  <td className="px-4 py-2">{row.textbookVersion}</td>
                  <td className="px-4 py-2">{row.grade}</td>
                  <td className="px-4 py-2">{row.semester}</td>
                  <td className="px-4 py-2">{row.unitName}</td>
                  <td className="px-4 py-2">{row.paperTitle || '-'}</td>
                  <td className="px-4 py-2">
                    <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700">已发布</span>
                  </td>
                  <td className="px-4 py-2">{row.createdAt ? new Date(row.createdAt).toLocaleString() : '-'}</td>
                  <td className="px-4 py-2">
                    <button onClick={() => handleDeleteOne(row.id)} disabled={deleting} className="text-sm font-bold text-red-600 disabled:opacity-50">
                      删除
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && filteredAssignments.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-on-surface-variant">暂无已发布任务</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
