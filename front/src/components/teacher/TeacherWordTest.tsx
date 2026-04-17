import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, ClipboardList, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  AdminStore,
  AdminUser,
  adminStoreApi,
  adminUserApi,
  authApi,
  PublishWordTestRequest,
  WordTestAssignmentRow,
  WordTestContentItem,
  WordTestGroupScope,
  wordTestApi,
} from '../../lib/auth';
import { formatSourceTagLabel, LearningSourceGroupSummary, lexiconApi, normalizeTextbookPermissionToAvailable, TextbookScopeBookRow } from '../../lib/lexicon';
import { getSessionToken } from '../../lib/session';

type StudentUser = AdminUser & { onlineStatus?: number | boolean | null };

type UnitNode = {
  textbookVersion: string;
  grade: string;
  semester: string;
  unit: string;
};

type TaskTreeSemester = {
  semester: string;
  units: string[];
};

type TaskTreeGrade = {
  grade: string;
  semesters: TaskTreeSemester[];
};

type TaskTreeBook = {
  bookVersion: string;
  grades: TaskTreeGrade[];
};

function normalizeTag(value?: string) {
  return (value || '').replace(/\s+/g, '').trim().toLowerCase();
}

function matchPermission(value: string, permissions: string[]) {
  if (permissions.length === 0) return true;
  const target = normalizeTag(value);
  if (!target) return false;
  return permissions.some((permission) => {
    const normalized = normalizeTag(permission);
    return Boolean(normalized) && (target === normalized || target.includes(normalized) || normalized.includes(target));
  });
}

function safeStoreCode(value?: string) {
  return (value || '').trim() || 'UNASSIGNED';
}

function resolveStoreCode(value: string | undefined, stores: AdminStore[]) {
  const normalized = (value || '').trim();
  if (!normalized) return 'UNASSIGNED';
  const byCode = stores.find((store) => store.storeCode === normalized);
  if (byCode) return byCode.storeCode;
  const byName = stores.find((store) => store.storeName === normalized);
  if (byName) return byName.storeCode;
  return safeStoreCode(normalized);
}

function todayDefaultTitle() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()} 单词测试`;
}

function formatDuration(seconds?: number | null) {
  if (typeof seconds !== 'number' || seconds <= 0) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}分${secs}秒`;
}

function formatScopeLabel(key: string) {
  const parts = key.split('||');
  if (parts.length !== 6) return key;
  const [textbookVersion, grade, semester, unit, sourceTag, groupNo] = parts;
  return `${textbookVersion} / ${grade} / ${semester} / ${unit} / ${formatSourceTagLabel(sourceTag)} / 第${groupNo}组`;
}

export const TeacherWordTest: React.FC = () => {
  const { user } = useAuth();
  const token = useMemo(() => getSessionToken(), []);

  const [students, setStudents] = useState<StudentUser[]>([]);
  const [studentNameMap, setStudentNameMap] = useState<Map<number, string>>(new Map());
  const [teacherStoreCode, setTeacherStoreCode] = useState('UNASSIGNED');
  const [taskTree, setTaskTree] = useState<TaskTreeBook[]>([]);
  const [assignments, setAssignments] = useState<WordTestAssignmentRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [treeHint, setTreeHint] = useState<string | null>(null);

  const [testType, setTestType] = useState<'默写' | '听写'>('默写');
  const [passScore, setPassScore] = useState<number>(60);
  const [testTitle, setTestTitle] = useState(todayDefaultTitle());
  const [selectedStudents, setSelectedStudents] = useState<number[]>([]);
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [studentGradeFilter, setStudentGradeFilter] = useState('ALL');
  const [studentBookFilter, setStudentBookFilter] = useState('ALL');
  const [expandedBooks, setExpandedBooks] = useState<Set<string>>(new Set());
  const [expandedGrades, setExpandedGrades] = useState<Set<string>>(new Set());
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
  const [groupSummaryMap, setGroupSummaryMap] = useState<Record<string, LearningSourceGroupSummary[]>>({});
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<number[]>([]);

  const filteredStudents = useMemo(
    () =>
      students.filter((student) => {
        if (studentGradeFilter !== 'ALL' && (student.grade || '-') !== studentGradeFilter) return false;
        if (studentBookFilter !== 'ALL' && (student.textbookVersion || '-') !== studentBookFilter) return false;
        return true;
      }),
    [students, studentBookFilter, studentGradeFilter]
  );

  const studentGradeOptions = useMemo(
    () => Array.from(new Set(students.map((student) => student.grade || '-').filter(Boolean))).sort((a, b) => a.localeCompare(b, 'zh-CN')),
    [students]
  );

  const studentBookOptions = useMemo(
    () => Array.from(new Set(students.map((student) => student.textbookVersion || '-').filter(Boolean))).sort((a, b) => a.localeCompare(b, 'zh-CN')),
    [students]
  );

  const loadData = async () => {
    if (!token || !user?.id) return;
    setLoading(true);
    setError(null);
    setTreeHint(null);
    try {
      const [latestUser, storesData, usersData, textbookScopes] = await Promise.all([
        authApi.getCurrentUser(token),
        adminStoreApi.getAllStores(token),
        adminUserApi.getAllUsers(token),
        lexiconApi.getTextbookScopes(token),
      ]);

      const currentStoreCode = resolveStoreCode(latestUser.storeName || user?.storeName, storesData);
      setTeacherStoreCode(currentStoreCode);

      const storeStudents = (usersData || []).filter(
        (row) => row.role === 'student' && resolveStoreCode(row.storeName, storesData) === currentStoreCode
      ) as StudentUser[];
      setStudents(storeStudents);
      setStudentNameMap(new Map(storeStudents.map((row) => [Number(row.id), row.name || row.username || `ID:${row.id}`])));

      const storeCfg = storesData.find((row) => row.storeCode === currentStoreCode);
      const scopeTree = (textbookScopes?.tree || []) as TextbookScopeBookRow[];
      const availableBooks = Array.from(new Set(scopeTree.map((row) => row.bookVersion).filter(Boolean)));
      const allowedBooks = (storeCfg?.textbookPermissions || [])
        .map((permission) => normalizeTextbookPermissionToAvailable(permission, availableBooks))
        .filter(Boolean);

      const baseTree = scopeTree
        .filter((book) => matchPermission(book.bookVersion, allowedBooks))
        .map((book) => ({
          bookVersion: book.bookVersion,
          grades: (book.grades || []).map((gradeNode) => ({
            grade: gradeNode.grade,
            semesters: (gradeNode.semesters || []).map((semester) => ({
              semester,
              units: [] as string[],
            })),
          })),
        }))
        .filter((book) => book.grades.length > 0);

      if (!baseTree.length) {
        setTaskTree([]);
        if (scopeTree.length > 0 && allowedBooks.length > 0) {
          setTreeHint('门店教材权限已配置，但教材树中没有匹配到对应教材版本。');
        } else if (scopeTree.length === 0) {
          setTreeHint('教材树为空，请先在管理员端维护教材版本、年级和上下册。');
        }
      } else {
        const hydratedTree = await Promise.all(
          baseTree.map(async (book) => ({
            ...book,
            grades: await Promise.all(
              book.grades.map(async (gradeNode) => ({
                ...gradeNode,
                semesters: await Promise.all(
                  gradeNode.semesters.map(async (semesterNode) => {
                    try {
                      const wordItems = await lexiconApi.getItems(token, 'word', book.bookVersion, gradeNode.grade, semesterNode.semester);
                      const units = Array.from(new Set((wordItems.items || []).map((item) => item.unit).filter(Boolean)));
                      return { ...semesterNode, units };
                    } catch {
                      return semesterNode;
                    }
                  })
                ),
              }))
            ),
          }))
        );
        setTaskTree(hydratedTree);
        setExpandedBooks(new Set(hydratedTree.length > 0 ? [hydratedTree[0].bookVersion] : []));
      }

      const rows = await wordTestApi.getTeacherAssignments(token, Number(user.id), currentStoreCode);
      setAssignments(rows || []);
    } catch (e: any) {
      setError(e?.message || '加载单词测试数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token, user?.id, user?.storeName]);

  const toggleStudent = (id: number) => {
    setSelectedStudents((prev) => (prev.includes(id) ? prev.filter((row) => row !== id) : [...prev, id]));
  };

  const toggleScope = (scopeKey: string) => {
    setSelectedScopes((prev) => (prev.includes(scopeKey) ? prev.filter((row) => row !== scopeKey) : [...prev, scopeKey]));
  };

  const toggleBookExpand = (bookVersion: string) => {
    setExpandedBooks((prev) => {
      const next = new Set(prev);
      if (next.has(bookVersion)) next.delete(bookVersion);
      else next.add(bookVersion);
      return next;
    });
  };

  const toggleGradeExpand = (bookVersion: string, grade: string) => {
    const key = `${bookVersion}||${grade}`;
    setExpandedGrades((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const parseScopeKey = (key: string): WordTestGroupScope | null => {
    const parts = key.split('||');
    if (parts.length !== 6) return null;
    const [textbookVersion, grade, semester, unit, sourceTag, groupNoRaw] = parts;
    const groupNo = Number(groupNoRaw);
    if (!textbookVersion || !grade || !semester || !unit || !sourceTag || !Number.isFinite(groupNo)) return null;
    return { textbookVersion, grade, semester, unit, sourceTag, groupNo };
  };

  const fetchUnitGroups = async (unitNode: UnitNode) => {
    const key = `${unitNode.textbookVersion}||${unitNode.grade}||${unitNode.semester}||${unitNode.unit}`;
    if (groupSummaryMap[key]) return;
    const summary = await lexiconApi.getLearningSummary(token, {
      type: 'word',
      bookVersion: unitNode.textbookVersion,
      grade: unitNode.grade,
      semester: unitNode.semester,
      unit: unitNode.unit,
    });
    setGroupSummaryMap((prev) => ({ ...prev, [key]: summary.sourceGroups || [] }));
  };

  const toggleUnitExpand = async (unitNode: UnitNode) => {
    const key = `${unitNode.textbookVersion}||${unitNode.grade}||${unitNode.semester}||${unitNode.unit}`;
    if (!expandedUnits.has(key)) {
      await fetchUnitGroups(unitNode);
    }
    setExpandedUnits((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const publish = async () => {
    if (!token || !user?.id) return;
    if (selectedStudents.length === 0) return setError('请先选择学生。');
    if (selectedScopes.length === 0) return setError('请先选择要发布的组号。');
    if (!Number.isFinite(passScore) || passScore < 0 || passScore > 100) return setError('及格分需在 0 到 100 之间。');

    const scopes = selectedScopes.map(parseScopeKey).filter((row): row is WordTestGroupScope => Boolean(row));
    if (!scopes.length) return setError('当前没有有效的测试范围。');

    setPublishing(true);
    setError(null);
    try {
      const itemMap = new Map<string, WordTestContentItem>();
      for (const scope of scopes) {
        const payload = await lexiconApi.getLearningItemsByGroup(token, {
          type: 'word',
          bookVersion: scope.textbookVersion,
          grade: scope.grade,
          semester: scope.semester,
          unit: scope.unit,
          sourceTag: scope.sourceTag,
          groupNo: scope.groupNo,
        });
        (payload.items || []).forEach((entry) => {
          const firstMeaning = entry.meanings?.[0];
          itemMap.set(entry.id, {
            entryId: entry.id,
            sourceTag: entry.source_tag || scope.sourceTag,
            word: entry.word,
            phonetic: entry.phonetic,
            meaning: firstMeaning?.meaning || '',
            pos: firstMeaning?.pos || '',
            wordAudio: entry.word_audio || entry.phrase_audio || '',
          });
        });
      }

      const request: PublishWordTestRequest = {
        createdBy: Number(user.id),
        storeCode: teacherStoreCode,
        title: (testTitle || '').trim(),
        testType,
        passScore,
        studentIds: selectedStudents,
        scopes,
        items: Array.from(itemMap.values()),
      };

      await wordTestApi.publish(token, request);
      setSelectedStudents([]);
      setSelectedScopes([]);
      setSelectedAssignmentIds([]);
      setTestTitle(todayDefaultTitle());
      setPassScore(60);
      await loadData();
    } catch (e: any) {
      setError(e?.message || '发布单词测试失败');
    } finally {
      setPublishing(false);
    }
  };

  const deleteOne = async (assignmentId: number) => {
    if (!token) return;
    setDeleting(true);
    setError(null);
    try {
      await wordTestApi.deleteOneAssignment(token, assignmentId);
      setSelectedAssignmentIds((prev) => prev.filter((row) => row !== assignmentId));
      await loadData();
    } catch (e: any) {
      setError(e?.message || '删除测试任务失败');
    } finally {
      setDeleting(false);
    }
  };

  const deleteBatch = async () => {
    if (!token || selectedAssignmentIds.length === 0) return;
    setDeleting(true);
    setError(null);
    try {
      await wordTestApi.batchDeleteAssignments(token, selectedAssignmentIds);
      setSelectedAssignmentIds([]);
      await loadData();
    } catch (e: any) {
      setError(e?.message || '批量删除测试任务失败');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[96rem] animate-in fade-in p-8">
      <header className="mb-8">
        <h2 className="mb-2 flex items-center gap-3 text-3xl font-black text-on-background">
          <ClipboardList className="h-8 w-8 text-primary" />
          单词测试发布
        </h2>
        <p className="text-on-surface-variant">教材版本、年级、上下册来自管理员教材树；发布最小单位为单元下的组号。</p>
      </header>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      <div className="mb-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="flex h-[720px] flex-col rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
          <div className="rounded-t-2xl border-b border-outline-variant/20 bg-surface-container-low/50 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-bold">选择学生</h3>
              <button
                onClick={() =>
                  setSelectedStudents((prev) =>
                    filteredStudents.length > 0 && filteredStudents.every((row) => prev.includes(Number(row.id)))
                      ? prev.filter((id) => !filteredStudents.some((row) => Number(row.id) === id))
                      : Array.from(new Set([...prev, ...filteredStudents.map((row) => Number(row.id))]))
                  )
                }
                className="text-sm font-bold text-primary"
              >
                {filteredStudents.length > 0 && filteredStudents.every((row) => selectedStudents.includes(Number(row.id))) ? '取消当前筛选全选' : '全选当前筛选'}
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
            {filteredStudents.map((student) => {
              const checked = selectedStudents.includes(Number(student.id));
              return (
                <div
                  key={student.id}
                  onClick={() => toggleStudent(Number(student.id))}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border-2 p-4 transition-all ${checked ? 'border-primary bg-primary-container/20' : 'border-transparent hover:bg-surface-container-highest'}`}
                >
                  <div>
                    <p className="font-bold text-on-surface">{student.name || '-'}</p>
                    <p className="text-xs text-on-surface-variant">{student.grade || '-'} / {student.textbookVersion || '-'}</p>
                  </div>
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${checked ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant'}`}>
                    {checked && <CheckCircle2 className="h-4 w-4" />}
                  </div>
                </div>
              );
            })}
            {!loading && filteredStudents.length === 0 && <div className="rounded-xl bg-surface-container-high p-4 text-sm text-on-surface-variant">当前筛选条件下没有学生。</div>}
          </div>
        </div>

        <div className="flex h-[720px] flex-col rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
          <div className="space-y-3 rounded-t-2xl border-b border-outline-variant/20 bg-surface-container-low/50 p-6">
            <h3 className="text-xl font-bold">选择测试范围</h3>
            <p className="text-xs text-on-surface-variant">请展开到单元下的来源标签，再勾选具体组号。</p>
            <div className="flex gap-3">
              <button onClick={() => setTestType('默写')} className={`rounded-lg border-2 px-4 py-2 font-bold ${testType === '默写' ? 'border-primary bg-primary-container/20 text-primary' : 'border-outline-variant/30'}`}>默写</button>
              <button onClick={() => setTestType('听写')} className={`rounded-lg border-2 px-4 py-2 font-bold ${testType === '听写' ? 'border-primary bg-primary-container/20 text-primary' : 'border-outline-variant/30'}`}>听写</button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-on-surface-variant">及格分</span>
              <input type="number" min={0} max={100} value={passScore} onChange={(e) => setPassScore(Number(e.target.value))} className="w-24 rounded-lg border border-outline-variant/30 px-3 py-2" />
            </div>
            <input value={testTitle} onChange={(e) => setTestTitle(e.target.value)} className="w-full rounded-lg border border-outline-variant/30 px-3 py-2" placeholder="测试标题" />
            {selectedScopes.length > 0 && (
              <div className="rounded-lg border border-outline-variant/30 bg-white p-2">
                <p className="mb-1 text-xs font-bold text-on-surface-variant">已选范围</p>
                <div className="max-h-24 space-y-1 overflow-auto text-xs text-on-surface">
                  {selectedScopes.map((key) => <div key={key} className="truncate">{formatScopeLabel(key)}</div>)}
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {treeHint && <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">{treeHint}</div>}
            {taskTree.map((book) => {
              const bookExpanded = expandedBooks.has(book.bookVersion);
              return (
                <div key={book.bookVersion} className="mb-4 overflow-hidden rounded-2xl border border-outline-variant/20">
                  <button onClick={() => toggleBookExpand(book.bookVersion)} className="flex w-full items-center justify-between bg-surface-container-low px-4 py-3 hover:bg-surface-container-high">
                    <span className="font-bold text-on-surface">{book.bookVersion}</span>
                    <ChevronRight className={`h-4 w-4 transition-transform ${bookExpanded ? 'rotate-90' : ''}`} />
                  </button>
                  {bookExpanded && (
                    <div className="bg-surface-container-low/30 p-3">
                      {book.grades.map((gradeNode) => {
                        const gradeKey = `${book.bookVersion}||${gradeNode.grade}`;
                        const gradeExpanded = expandedGrades.has(gradeKey);
                        return (
                          <div key={gradeKey} className="mb-2 overflow-hidden rounded-xl border border-outline-variant/20">
                            <button onClick={() => toggleGradeExpand(book.bookVersion, gradeNode.grade)} className="flex w-full items-center justify-between bg-surface-container-lowest px-4 py-3 hover:bg-surface-container-highest">
                              <span className="font-bold">{gradeNode.grade}</span>
                              <ChevronRight className={`h-4 w-4 transition-transform ${gradeExpanded ? 'rotate-90' : ''}`} />
                            </button>
                            {gradeExpanded && (
                              <div className="space-y-2 bg-surface-container-low/30 p-2">
                                {gradeNode.semesters.map((semesterNode) => (
                                  <div key={`${gradeKey}||${semesterNode.semester}`}>
                                    <div className="mb-1 flex items-center justify-between px-1">
                                      <span className="text-xs font-bold text-on-surface-variant">{semesterNode.semester}</span>
                                      <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-bold text-on-surface-variant">册别</span>
                                    </div>
                                    {semesterNode.units.map((unit) => {
                                      const unitNode: UnitNode = { textbookVersion: book.bookVersion, grade: gradeNode.grade, semester: semesterNode.semester, unit };
                                      const unitKey = `${book.bookVersion}||${gradeNode.grade}||${semesterNode.semester}||${unit}`;
                                      const unitExpanded = expandedUnits.has(unitKey);
                                      const sourceGroups = groupSummaryMap[unitKey] || [];
                                      return (
                                        <div key={unitKey} className="mb-1 overflow-hidden rounded-lg border border-outline-variant/20 bg-white">
                                          <button onClick={() => toggleUnitExpand(unitNode)} className="flex w-full items-center justify-between px-3 py-2 hover:bg-surface-container-highest">
                                            <span className="text-sm font-bold">{unit}</span>
                                            <ChevronRight className={`h-4 w-4 transition-transform ${unitExpanded ? 'rotate-90' : ''}`} />
                                          </button>
                                          {unitExpanded && (
                                            <div className="space-y-2 px-3 pb-3">
                                              {sourceGroups.length === 0 && <div className="text-xs text-on-surface-variant">该单元暂无可发布的分组。</div>}
                                              {sourceGroups.map((sourceGroup) => (
                                                <div key={`${unitKey}||${sourceGroup.sourceTag}`} className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest/60 p-2">
                                                  <div className="mb-1 flex items-center justify-between">
                                                    <span className="text-xs font-bold text-on-surface-variant">{formatSourceTagLabel(sourceGroup.sourceTag)}</span>
                                                    <span className="text-[10px] font-bold text-on-surface-variant">共 {sourceGroup.total} 词</span>
                                                  </div>
                                                  <div className="space-y-1">
                                                    {(sourceGroup.groups || []).map((group) => {
                                                      const scopeKey = `${book.bookVersion}||${gradeNode.grade}||${semesterNode.semester}||${unit}||${sourceGroup.sourceTag}||${group.groupNo}`;
                                                      const checked = selectedScopes.includes(scopeKey);
                                                      return (
                                                        <label key={scopeKey} className="flex cursor-pointer items-center justify-between rounded px-2 py-1 hover:bg-surface-container-highest">
                                                          <span className="text-sm">第 {group.groupNo} 组（{group.count} 词）</span>
                                                          <input type="checkbox" checked={checked} onChange={() => toggleScope(scopeKey)} />
                                                        </label>
                                                      );
                                                    })}
                                                    {(!sourceGroup.groups || sourceGroup.groups.length === 0) && <div className="px-2 py-1 text-xs text-on-surface-variant">该来源下暂无可发布组号。</div>}
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ))}
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
            <button onClick={publish} disabled={publishing || selectedStudents.length === 0 || selectedScopes.length === 0} className="w-full rounded-xl bg-primary py-3 font-black text-on-primary disabled:opacity-50">
              {publishing ? '发布中...' : '确认发送'}
            </button>
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest shadow-sm">
        <div className="flex items-center justify-between border-b border-outline-variant/20 px-5 py-4">
          <h4 className="text-lg font-black text-on-surface">已发布测试</h4>
          <button onClick={deleteBatch} disabled={deleting || selectedAssignmentIds.length === 0} className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-3 py-1 text-sm font-bold text-red-600 disabled:opacity-40">
            <Trash2 className="h-4 w-4" />
            批量删除
          </button>
        </div>
        {loading ? (
          <div className="px-5 py-6 text-sm text-on-surface-variant">加载中...</div>
        ) : (
          <div className="max-h-[420px] overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-surface-container-low">
                <tr>
                  <th className="px-4 py-3">选择</th>
                  <th className="px-4 py-3">标题</th>
                  <th className="px-4 py-3">类型</th>
                  <th className="px-4 py-3">学生</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">及格分</th>
                  <th className="px-4 py-3">作答次数</th>
                  <th className="px-4 py-3">得分/用时</th>
                  <th className="px-4 py-3">正确数</th>
                  <th className="px-4 py-3">发布时间</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((row) => (
                  <tr key={row.assignmentId} className="border-t border-outline-variant/20">
                    <td className="px-4 py-2">
                      <input type="checkbox" checked={selectedAssignmentIds.includes(row.assignmentId)} onChange={(e) => setSelectedAssignmentIds((prev) => (e.target.checked ? [...prev, row.assignmentId] : prev.filter((id) => id !== row.assignmentId)))} />
                    </td>
                    <td className="px-4 py-2 font-medium">{row.title}</td>
                    <td className="px-4 py-2">{row.testType}</td>
                    <td className="px-4 py-2">{studentNameMap.get(row.userId) || `ID:${row.userId}`}</td>
                    <td className="px-4 py-2">{row.status === 'completed' ? '已完成' : '待完成'}</td>
                    <td className="px-4 py-2">{typeof row.passScore === 'number' ? row.passScore : 60}</td>
                    <td className="px-4 py-2">{typeof row.attemptCount === 'number' ? row.attemptCount : 0}</td>
                    <td className="px-4 py-2">{typeof row.score === 'number' ? `${row.score} / ${formatDuration(row.duration)}` : '-'}</td>
                    <td className="px-4 py-2">{typeof row.correctCount === 'number' && typeof row.totalCount === 'number' ? `${row.correctCount}/${row.totalCount}` : '-'}</td>
                    <td className="px-4 py-2">{row.createdAt ? new Date(row.createdAt).toLocaleString() : '-'}</td>
                    <td className="px-4 py-2"><button onClick={() => deleteOne(row.assignmentId)} className="text-sm font-bold text-red-600">删除</button></td>
                  </tr>
                ))}
                {assignments.length === 0 && <tr><td colSpan={11} className="px-4 py-6 text-center text-on-surface-variant">暂无已发布测试</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
