import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, ClipboardCheck, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  AdminStore,
  AdminUser,
  adminStoreApi,
  adminUserApi,
  authApi,
  PublishWordReviewRequest,
  WordReviewAssignmentRow,
  WordReviewContentItem,
  WordReviewUnitScope,
  wordReviewApi,
} from '../../lib/auth';
import { formatSourceTagLabel, LearningSourceGroupSummary, lexiconApi, normalizeTextbookPermissionToAvailable, TextbookScopeBookRow } from '../../lib/lexicon';
import { getSessionToken } from '../../lib/session';

type StudentUser = AdminUser & { onlineStatus?: number | boolean | null };

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

function resolveStoreCode(value: string | undefined, stores: AdminStore[]) {
  const normalized = (value || '').trim();
  if (!normalized) return 'UNASSIGNED';
  const byCode = stores.find((store) => store.storeCode === normalized);
  if (byCode) return byCode.storeCode;
  const byName = stores.find((store) => store.storeName === normalized);
  if (byName) return byName.storeCode;
  return normalized || 'UNASSIGNED';
}

function todayDefaultTitle() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()} 单词复习`;
}

function unitLabel(key: string) {
  const parts = key.split('||');
  if (parts.length !== 5) return key;
  const [textbookVersion, grade, semester, unit, sourceTag] = parts;
  return `${textbookVersion} / ${grade} / ${semester} / ${unit} / ${formatSourceTagLabel(sourceTag)}`;
}

function normalizeSemesterText(value: string) {
  return (value || '').trim();
}

export const TeacherWordReview: React.FC = () => {
  const { user } = useAuth();
  const token = useMemo(() => getSessionToken(), []);

  const [students, setStudents] = useState<StudentUser[]>([]);
  const [studentNameMap, setStudentNameMap] = useState<Map<number, string>>(new Map());
  const [teacherStoreCode, setTeacherStoreCode] = useState('UNASSIGNED');
  const [taskTree, setTaskTree] = useState<TaskTreeBook[]>([]);
  const [assignments, setAssignments] = useState<WordReviewAssignmentRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dailyQuota, setDailyQuota] = useState(20);
  const [enableSpelling, setEnableSpelling] = useState(false);
  const [enableZhToEn, setEnableZhToEn] = useState(false);
  const [reviewTitle, setReviewTitle] = useState(todayDefaultTitle());
  const [customTitle, setCustomTitle] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<number[]>([]);
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [studentGradeFilter, setStudentGradeFilter] = useState('ALL');
  const [studentBookFilter, setStudentBookFilter] = useState('ALL');
  const [expandedBooks, setExpandedBooks] = useState<Set<string>>(new Set());
  const [expandedGrades, setExpandedGrades] = useState<Set<string>>(new Set());
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
  const [sourceSummaryMap, setSourceSummaryMap] = useState<Record<string, LearningSourceGroupSummary[]>>({});
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

      const rows = await wordReviewApi.getTeacherAssignments(token, Number(user.id), currentStoreCode);
      setAssignments(rows || []);
    } catch (e: any) {
      setError(e?.message || '加载单词复习数据失败');
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

  const toggleUnit = (key: string) => {
    setSelectedUnits((prev) => (prev.includes(key) ? prev.filter((row) => row !== key) : [...prev, key]));
  };

  useEffect(() => {
    if (customTitle) return;
    if (selectedUnits.length === 0) {
      setReviewTitle(todayDefaultTitle());
      return;
    }
    const first = selectedUnits[0].split('||');
    if (first.length >= 4) {
      const [, grade, semester, unit] = first;
      const prefix = selectedUnits.length === 1 ? `${grade}${normalizeSemesterText(semester)}${unit}` : `${grade}${normalizeSemesterText(semester)}单元复习`;
      setReviewTitle(`${prefix} 复习任务`);
    }
  }, [selectedUnits, customTitle]);

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

  const parseUnitKey = (key: string): WordReviewUnitScope | null => {
    const parts = key.split('||');
    if (parts.length !== 5) return null;
    const [textbookVersion, grade, semester, unit, sourceTag] = parts;
    if (!textbookVersion || !grade || !semester || !unit || !sourceTag) return null;
    return { textbookVersion, grade, semester, unit, sourceTag };
  };

  const fetchUnitSources = async (textbookVersion: string, grade: string, semester: string, unit: string) => {
    const key = `${textbookVersion}||${grade}||${semester}||${unit}`;
    if (sourceSummaryMap[key]) return;
    const summary = await lexiconApi.getLearningSummary(token, {
      type: 'word',
      bookVersion: textbookVersion,
      grade,
      semester,
      unit,
    });
    setSourceSummaryMap((prev) => ({ ...prev, [key]: summary.sourceGroups || [] }));
  };

  const toggleUnitExpand = async (textbookVersion: string, grade: string, semester: string, unit: string) => {
    const key = `${textbookVersion}||${grade}||${semester}||${unit}`;
    if (!expandedUnits.has(key)) {
      await fetchUnitSources(textbookVersion, grade, semester, unit);
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
    if (selectedUnits.length === 0) return setError('请先选择要发布的复习来源。');
    if (!Number.isFinite(dailyQuota) || dailyQuota < 1 || dailyQuota > 200) return setError('每日复习量需在 1 到 200 之间。');

    const scopes = selectedUnits.map(parseUnitKey).filter((row): row is WordReviewUnitScope => Boolean(row));
    if (!scopes.length) return setError('当前没有有效的复习范围。');

    setPublishing(true);
    setError(null);
    try {
      const itemMap = new Map<string, WordReviewContentItem>();
      for (const scope of scopes) {
        const summary = await lexiconApi.getLearningSummary(token, {
          type: 'word',
          bookVersion: scope.textbookVersion,
          grade: scope.grade,
          semester: scope.semester,
          unit: scope.unit,
          sourceTag: scope.sourceTag,
        });
        for (const group of summary.groups || []) {
          const payload = await lexiconApi.getLearningItemsByGroup(token, {
            type: 'word',
            bookVersion: scope.textbookVersion,
            grade: scope.grade,
            semester: scope.semester,
            unit: scope.unit,
            sourceTag: scope.sourceTag,
            groupNo: Number(group.groupNo),
          });
          (payload.items || []).forEach((entry) => {
            const meanings = entry.meanings || [];
            const firstMeaning = meanings[0];
            const meaningWithExample = meanings.find((row) => (row?.example || '').trim().length > 0) || firstMeaning;
            itemMap.set(entry.id, {
              entryId: entry.id,
              sourceTag: entry.source_tag || scope.sourceTag,
              word: entry.word,
              phonetic: entry.phonetic,
              meaning: firstMeaning?.meaning || '',
              pos: firstMeaning?.pos || '',
              wordAudio: entry.word_audio || entry.phrase_audio || '',
              sentence: meaningWithExample?.example || '',
              sentenceCn: meaningWithExample?.example_zh || '',
              sentenceAudio: meaningWithExample?.example_audio || '',
            });
          });
        }
      }

      if (itemMap.size === 0) return setError('当前选择范围下没有可发布的单词。');

      const request: PublishWordReviewRequest = {
        createdBy: Number(user.id),
        storeCode: teacherStoreCode,
        title: (reviewTitle || '').trim(),
        dailyQuota,
        enableSpelling,
        enableZhToEn,
        studentIds: selectedStudents,
        scopes,
        items: Array.from(itemMap.values()),
      };

      await wordReviewApi.publish(token, request);
      setSelectedStudents([]);
      setSelectedUnits([]);
      setSelectedAssignmentIds([]);
      setDailyQuota(20);
      setEnableSpelling(false);
      setEnableZhToEn(false);
      setReviewTitle(todayDefaultTitle());
      setCustomTitle(false);
      await loadData();
    } catch (e: any) {
      setError(e?.message || '发布单词复习失败');
    } finally {
      setPublishing(false);
    }
  };

  const deleteOne = async (assignmentId: number) => {
    if (!token) return;
    setDeleting(true);
    setError(null);
    try {
      await wordReviewApi.deleteOneAssignment(token, assignmentId);
      setSelectedAssignmentIds((prev) => prev.filter((row) => row !== assignmentId));
      await loadData();
    } catch (e: any) {
      setError(e?.message || '删除复习任务失败');
    } finally {
      setDeleting(false);
    }
  };

  const deleteBatch = async () => {
    if (!token || selectedAssignmentIds.length === 0) return;
    setDeleting(true);
    setError(null);
    try {
      await wordReviewApi.batchDeleteAssignments(token, selectedAssignmentIds);
      setSelectedAssignmentIds([]);
      await loadData();
    } catch (e: any) {
      setError(e?.message || '批量删除复习任务失败');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[96rem] animate-in fade-in p-8">
      <header className="mb-8">
        <h2 className="mb-2 flex items-center gap-3 text-3xl font-black text-on-background">
          <ClipboardCheck className="h-8 w-8 text-primary" />
          单词复习发布
        </h2>
        <p className="text-on-surface-variant">教材版本、年级、上下册来自管理员教材树；发布最小单位为单元下的本册/小学复习来源。</p>
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
            <h3 className="text-xl font-bold">选择复习范围</h3>
            <p className="text-xs text-on-surface-variant">请展开到单元下的来源标签，勾选“本册”或“小学复习”等实际复习来源。</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-bold text-on-surface-variant">每日复习量</label>
              <input type="number" min={1} max={200} value={dailyQuota} onChange={(e) => setDailyQuota(Number(e.target.value))} className="rounded-lg border border-outline-variant/30 px-3 py-2" />
            </div>
            <div className="flex gap-4">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={enableSpelling} onChange={(e) => setEnableSpelling(e.target.checked)} />
                开启拼写
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={enableZhToEn} onChange={(e) => setEnableZhToEn(e.target.checked)} />
                开启汉译英
              </label>
            </div>
            <input
              value={reviewTitle}
              onChange={(e) => {
                setReviewTitle(e.target.value);
                setCustomTitle(true);
              }}
              className="w-full rounded-lg border border-outline-variant/30 px-3 py-2"
              placeholder="复习标题"
            />
            {selectedUnits.length > 0 && (
              <div className="rounded-lg border border-outline-variant/30 bg-white p-2">
                <p className="mb-1 text-xs font-bold text-on-surface-variant">已选范围</p>
                <div className="max-h-24 space-y-1 overflow-auto text-xs text-on-surface">
                  {selectedUnits.map((key) => <div key={key} className="truncate">{unitLabel(key)}</div>)}
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
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
                                    <div className="mb-1 px-1 text-xs font-bold text-on-surface-variant">{semesterNode.semester}</div>
                                    {semesterNode.units.map((unit) => {
                                      const unitKey = `${book.bookVersion}||${gradeNode.grade}||${semesterNode.semester}||${unit}`;
                                      const unitExpanded = expandedUnits.has(unitKey);
                                      const sourceGroups = sourceSummaryMap[unitKey] || [];
                                      return (
                                        <div key={unitKey} className="mb-1 overflow-hidden rounded-lg border border-outline-variant/20 bg-white">
                                          <button onClick={() => toggleUnitExpand(book.bookVersion, gradeNode.grade, semesterNode.semester, unit)} className="flex w-full items-center justify-between px-3 py-2 hover:bg-surface-container-highest">
                                            <span className="text-sm font-bold">{unit}</span>
                                            <ChevronRight className={`h-4 w-4 transition-transform ${unitExpanded ? 'rotate-90' : ''}`} />
                                          </button>
                                          {unitExpanded && (
                                            <div className="space-y-1 px-3 pb-3">
                                              {sourceGroups.length === 0 && <div className="text-xs text-on-surface-variant">该单元暂无可发布来源。</div>}
                                              {sourceGroups.map((sourceGroup) => {
                                                const key = `${book.bookVersion}||${gradeNode.grade}||${semesterNode.semester}||${unit}||${sourceGroup.sourceTag}`;
                                                return (
                                                  <label key={key} className="flex cursor-pointer items-center justify-between rounded px-2 py-1 hover:bg-surface-container-highest">
                                                    <span className="text-sm">{formatSourceTagLabel(sourceGroup.sourceTag)}（{sourceGroup.total} 词）</span>
                                                    <input type="checkbox" checked={selectedUnits.includes(key)} onChange={() => toggleUnit(key)} />
                                                  </label>
                                                );
                                              })}
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
            <button onClick={publish} disabled={publishing || selectedStudents.length === 0 || selectedUnits.length === 0} className="w-full rounded-xl bg-primary py-3 font-black text-on-primary disabled:opacity-50">
              {publishing ? '发布中...' : '确认发送'}
            </button>
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest shadow-sm">
        <div className="flex items-center justify-between border-b border-outline-variant/20 px-5 py-4">
          <h4 className="text-lg font-black text-on-surface">已发布复习</h4>
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
                  <th className="px-4 py-3">学生</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">每日复习量</th>
                  <th className="px-4 py-3">模式</th>
                  <th className="px-4 py-3">掌握进度</th>
                  <th className="px-4 py-3">最近复习</th>
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
                    <td className="px-4 py-2">{studentNameMap.get(row.userId) || `ID:${row.userId}`}</td>
                    <td className="px-4 py-2">{row.status === 'completed' ? '已完成' : '进行中'}</td>
                    <td className="px-4 py-2">{row.dailyQuota}</td>
                    <td className="px-4 py-2">基础复习{row.enableSpelling ? ' + 拼写' : ''}{row.enableZhToEn ? ' + 汉译英' : ''}</td>
                    <td className="px-4 py-2">{row.masteredWordCount}/{row.totalWordCount}</td>
                    <td className="px-4 py-2">{row.lastReviewDate || '-'}</td>
                    <td className="px-4 py-2">{row.createdAt ? new Date(row.createdAt).toLocaleString() : '-'}</td>
                    <td className="px-4 py-2"><button onClick={() => deleteOne(row.assignmentId)} className="text-sm font-bold text-red-600">删除</button></td>
                  </tr>
                ))}
                {assignments.length === 0 && <tr><td colSpan={10} className="px-4 py-6 text-center text-on-surface-variant">暂无已发布复习</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
