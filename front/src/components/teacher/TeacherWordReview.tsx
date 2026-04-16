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
import { getSessionToken } from '../../lib/session';
import { formatSourceTagLabel, lexiconApi, LexiconTaskTreeBook, LearningSourceGroupSummary } from '../../lib/lexicon';

type StudentUser = AdminUser & { onlineStatus?: number | boolean | null };

function normalizeTag(value?: string) {
  return (value || '').replace(/\s+/g, '').trim().toLowerCase();
}

function normalizeLegacyTextbookPermission(permission: string, availableBooks: string[]) {
  const raw = (permission || '').trim();
  if (!raw) return '';
  if (availableBooks.includes(raw)) return raw;
  const map: Record<string, string[]> = {
    PEP: ['人教版'],
    FLTRP: ['外研版'],
    SHJ: ['上海版'],
  };
  const aliases = map[raw] || [];
  return availableBooks.find((b) => aliases.includes(b)) || raw;
}

function normalizeLegacyGradePermission(permission: string, availableGrades: string[]) {
  const raw = (permission || '').trim().toUpperCase();
  if (!raw) return '';
  if (availableGrades.includes(permission)) return permission;
  const m = raw.match(/^G(\d+)(?:-T\d|-(?:ALL|FULL))?$/);
  if (m) {
    const num = Number(m[1]);
    const map: Record<number, string> = {
      1: '一年级',
      2: '二年级',
      3: '三年级',
      4: '四年级',
      5: '五年级',
      6: '六年级',
      7: '七年级',
      8: '八年级',
      9: '九年级',
    };
    const grade = map[num];
    if (grade && availableGrades.includes(grade)) return grade;
  }
  return permission;
}

function matchPermission(value: string, permissions: string[]) {
  if (permissions.length === 0) return true;
  const v = normalizeTag(value);
  if (!v) return false;
  return permissions.some((p) => {
    const n = normalizeTag(p);
    return Boolean(n) && (v === n || v.includes(n) || n.includes(v));
  });
}

function resolveStoreCode(value: string | undefined, stores: AdminStore[]) {
  const v = (value || '').trim();
  if (!v) return 'UNASSIGNED';
  const byCode = stores.find((s) => s.storeCode === v);
  if (byCode) return byCode.storeCode;
  const byName = stores.find((s) => s.storeName === v);
  if (byName) return byName.storeCode;
  return v || 'UNASSIGNED';
}

function todayDefaultTitle() {
  const now = new Date();
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日单词复习`;
}

function normalizeSemesterText(v: string) {
  const s = (v || '').trim();
  if (!s) return '';
  if (s.includes('上')) return '上册';
  if (s.includes('下')) return '下册';
  return s;
}

function unitLabel(key: string) {
  const [textbookVersion, grade, semester, unit, sourceTag] = key.split('||');
  return `${textbookVersion} / ${grade} / ${semester} / ${unit}${sourceTag ? ` / ${formatSourceTagLabel(sourceTag)}` : ''}`;
}

export const TeacherWordReview: React.FC = () => {
  const { user } = useAuth();
  const token = useMemo(() => getSessionToken(), []);

  const [students, setStudents] = useState<StudentUser[]>([]);
  const [studentNameMap, setStudentNameMap] = useState<Map<number, string>>(new Map());
  const [teacherStoreCode, setTeacherStoreCode] = useState('UNASSIGNED');
  const [taskTree, setTaskTree] = useState<LexiconTaskTreeBook[]>([]);
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
  const [expandedGrades, setExpandedGrades] = useState<Set<string>>(new Set());
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
  const [sourceSummaryMap, setSourceSummaryMap] = useState<Record<string, LearningSourceGroupSummary[]>>({});
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<number[]>([]);

  const loadData = async () => {
    if (!token || !user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const [latestUser, storesData, usersData, treeData] = await Promise.all([
        authApi.getCurrentUser(token),
        adminStoreApi.getAllStores(token),
        adminUserApi.getAllUsers(token),
        lexiconApi.getTaskTree(token),
      ]);

      const code = resolveStoreCode(latestUser.storeName || user?.storeName, storesData);
      setTeacherStoreCode(code);
      const studentsInStore = (usersData || []).filter(
        (u) => u.role === 'student' && resolveStoreCode(u.storeName, storesData) === code
      ) as StudentUser[];
      setStudents(studentsInStore);
      setStudentNameMap(new Map(studentsInStore.map((s) => [Number(s.id), s.name || s.username || `ID:${s.id}`])));

      const storeCfg = storesData.find((s) => s.storeCode === code);
      const rawTree = Array.isArray((treeData as any)?.tree)
        ? ((treeData as any).tree as LexiconTaskTreeBook[])
        : (Array.isArray(treeData as any) ? (treeData as any as LexiconTaskTreeBook[]) : []);
      const availableBooks = Array.from(new Set(rawTree.map((b) => b.bookVersion).filter(Boolean)));
      const availableGrades = Array.from(new Set(rawTree.flatMap((b) => (b.grades || []).map((g) => g.grade).filter(Boolean))));
      const allowedBooks = (storeCfg?.textbookPermissions || [])
        .map((p) => normalizeLegacyTextbookPermission(p, availableBooks))
        .filter(Boolean);
      const allowedGrades = (storeCfg?.gradePermissions || [])
        .map((p) => normalizeLegacyGradePermission(p, availableGrades))
        .filter(Boolean);
      const filteredTree = rawTree
        .filter((book) => matchPermission(book.bookVersion, allowedBooks))
        .map((book) => ({
          ...book,
          grades: (book.grades || [])
            .filter((g) => matchPermission(g.grade, allowedGrades))
            .map((g) => ({ ...g, semesters: g.semesters || [] })),
        }))
        .filter((book) => (book.grades || []).length > 0);
      setTaskTree(filteredTree.length > 0 ? filteredTree : rawTree);

      const rows = await wordReviewApi.getTeacherAssignments(token, Number(user.id), code);
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
    setSelectedStudents((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleUnit = (key: string) => {
    setSelectedUnits((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
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
      const prefix = selectedUnits.length === 1 ? `${grade}${normalizeSemesterText(semester)}${unit}` : `${grade}${normalizeSemesterText(semester)}多单元`;
      setReviewTitle(`${prefix}单词复习`);
    }
  }, [selectedUnits, customTitle]);

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
    const res = await lexiconApi.getLearningSummary(token, {
      type: 'word',
      bookVersion: textbookVersion,
      grade,
      semester,
      unit,
    });
    setSourceSummaryMap((prev) => ({ ...prev, [key]: res.sourceGroups || [] }));
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
    if (selectedStudents.length === 0) return setError('请至少选择一位学生');
    if (selectedUnits.length === 0) return setError('请至少选择一个单元');
    if (!Number.isFinite(dailyQuota) || dailyQuota < 1 || dailyQuota > 200) return setError('每日复习数量需在 1-200 之间');

    const scopes = selectedUnits.map(parseUnitKey).filter((x): x is WordReviewUnitScope => Boolean(x));
    if (scopes.length === 0) return setError('复习范围无效，请重新选择');

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
          const rows = await lexiconApi.getLearningItemsByGroup(token, {
            type: 'word',
            bookVersion: scope.textbookVersion,
            grade: scope.grade,
            semester: scope.semester,
            unit: scope.unit,
            sourceTag: scope.sourceTag,
            groupNo: Number(group.groupNo),
          });
          (rows.items || []).forEach((entry) => {
            const allMeanings = entry.meanings || [];
            const firstMeaning = allMeanings[0];
            const meaningWithExample = allMeanings.find((m) => (m?.example || '').trim().length > 0) || firstMeaning;
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

      if (itemMap.size === 0) {
        return setError('所选单元未找到可用单词数据');
      }

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
      setSelectedAssignmentIds((prev) => prev.filter((x) => x !== assignmentId));
      await loadData();
    } catch (e: any) {
      setError(e?.message || '删除失败');
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
      setError(e?.message || '批量删除失败');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="w-full max-w-[96rem] mx-auto p-8 animate-in fade-in">
      <header className="mb-8">
        <h2 className="text-3xl font-black text-on-background mb-2 flex items-center gap-3">
          <ClipboardCheck className="w-8 h-8 text-primary" />
          单词复习
        </h2>
        <p className="text-on-surface-variant">教师发布按天配额的复习任务，学生每日完成指定数量，直到全词掌握。</p>
      </header>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/20 flex flex-col h-[720px]">
          <div className="p-6 border-b border-outline-variant/20 flex justify-between items-center bg-surface-container-low/50 rounded-t-2xl">
            <h3 className="text-xl font-bold">选择学生</h3>
            <button
              onClick={() => setSelectedStudents((prev) => (prev.length === students.length ? [] : students.map((s) => Number(s.id))))}
              className="text-sm font-bold text-primary"
            >
              {selectedStudents.length === students.length ? '清空' : '全选'}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {students.map((s) => (
              <div key={s.id} onClick={() => toggleStudent(Number(s.id))} className={`flex items-center justify-between p-4 rounded-xl cursor-pointer transition-all border-2 ${selectedStudents.includes(Number(s.id)) ? 'border-primary bg-primary-container/20' : 'border-transparent hover:bg-surface-container-highest'}`}>
                <div>
                  <p className="font-bold text-on-surface">{s.name || '-'}</p>
                  <p className="text-xs text-on-surface-variant">{s.grade || '-'} · {s.textbookVersion || '-'}</p>
                </div>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${selectedStudents.includes(Number(s.id)) ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant'}`}>
                  {selectedStudents.includes(Number(s.id)) && <CheckCircle2 className="w-4 h-4" />}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/20 flex flex-col h-[720px]">
          <div className="p-6 border-b border-outline-variant/20 bg-surface-container-low/50 rounded-t-2xl space-y-3">
            <h3 className="text-xl font-bold">选择复习任务</h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-bold text-on-surface-variant">每日复习数量</label>
              <input
                type="number"
                min={1}
                max={200}
                value={dailyQuota}
                onChange={(e) => setDailyQuota(Number(e.target.value))}
                className="rounded-lg border border-outline-variant/30 px-3 py-2"
              />
            </div>
            <div className="flex gap-4">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={enableSpelling} onChange={(e) => setEnableSpelling(e.target.checked)} />
                开启单词补全
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={enableZhToEn} onChange={(e) => setEnableZhToEn(e.target.checked)} />
                开启汉译英
              </label>
            </div>
            <input value={reviewTitle} onChange={(e) => { setReviewTitle(e.target.value); setCustomTitle(true); }} className="w-full rounded-lg border border-outline-variant/30 px-3 py-2" placeholder="复习任务名称" />
            {selectedUnits.length > 0 && (
              <div className="rounded-lg border border-outline-variant/30 bg-white p-2">
                <p className="mb-1 text-xs font-bold text-on-surface-variant">已选单元</p>
                <div className="max-h-24 space-y-1 overflow-auto text-xs text-on-surface">
                  {selectedUnits.map((k) => <div key={k} className="truncate">{unitLabel(k)}</div>)}
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {taskTree.map((book) => (
              <div key={book.bookVersion} className="mb-4">
                <h4 className="font-bold text-on-surface-variant mb-2">{book.bookVersion}</h4>
                {(book.grades || []).map((g) => {
                  const gKey = `${book.bookVersion}||${g.grade}`;
                  const gExpanded = expandedGrades.has(gKey);
                  return (
                    <div key={gKey} className="mb-2 border rounded-xl overflow-hidden border-outline-variant/20">
                      <button onClick={() => toggleGradeExpand(book.bookVersion, g.grade)} className="w-full px-4 py-3 flex items-center justify-between bg-surface-container-lowest hover:bg-surface-container-highest">
                        <span className="font-bold">{g.grade}</span>
                        <ChevronRight className={`w-4 h-4 transition-transform ${gExpanded ? 'rotate-90' : ''}`} />
                      </button>
                      {gExpanded && (
                        <div className="p-2 bg-surface-container-low/30 space-y-2">
                          {(g.semesters || []).map((s) => (
                            <div key={`${gKey}||${s.semester}`}>
                              <div className="mb-1 text-xs font-bold text-on-surface-variant px-1">册数：{s.semester}</div>
                              {(s.units || []).map((u) => {
                                const unitKey = `${book.bookVersion}||${g.grade}||${s.semester}||${u}`;
                                const unitExpanded = expandedUnits.has(unitKey);
                                const sourceGroups = sourceSummaryMap[unitKey] || [];
                                return (
                                  <div key={unitKey} className="mb-1 border rounded-lg border-outline-variant/20 bg-white overflow-hidden">
                                    <button onClick={() => toggleUnitExpand(book.bookVersion, g.grade, s.semester, u)} className="flex w-full items-center justify-between px-3 py-2 hover:bg-surface-container-highest">
                                      <span className="text-sm font-bold">{u}</span>
                                      <ChevronRight className={`h-4 w-4 transition-transform ${unitExpanded ? 'rotate-90' : ''}`} />
                                    </button>
                                    {unitExpanded && (
                                      <div className="space-y-1 px-3 pb-3">
                                        {sourceGroups.length === 0 && <div className="text-xs text-on-surface-variant">暂无来源数据</div>}
                                        {sourceGroups.map((sourceGroup) => {
                                          const key = `${book.bookVersion}||${g.grade}||${s.semester}||${u}||${sourceGroup.sourceTag}`;
                                          return (
                                            <label key={key} className="flex items-center justify-between rounded px-2 py-1 hover:bg-surface-container-highest cursor-pointer">
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
            ))}
          </div>

          <div className="p-4 border-t border-outline-variant/20 bg-surface-container-low/50 rounded-b-2xl">
            <button onClick={publish} disabled={publishing || selectedStudents.length === 0 || selectedUnits.length === 0} className="w-full py-3 bg-primary text-on-primary rounded-xl font-black disabled:opacity-50">
              {publishing ? '发布中...' : '确认发送'}
            </button>
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest shadow-sm">
        <div className="flex items-center justify-between border-b border-outline-variant/20 px-5 py-4">
          <h4 className="text-lg font-black text-on-surface">任务明细</h4>
          <button onClick={deleteBatch} disabled={deleting || selectedAssignmentIds.length === 0} className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-3 py-1 text-sm font-bold text-red-600 disabled:opacity-40">
            <Trash2 className="w-4 h-4" /> 批量删除
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
                  <th className="px-4 py-3">任务名称</th>
                  <th className="px-4 py-3">学生</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">每日数量</th>
                  <th className="px-4 py-3">模式</th>
                  <th className="px-4 py-3">进度</th>
                  <th className="px-4 py-3">最近复习日期</th>
                  <th className="px-4 py-3">发布时间</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((row) => (
                  <tr key={row.assignmentId} className="border-t border-outline-variant/20">
                    <td className="px-4 py-2"><input type="checkbox" checked={selectedAssignmentIds.includes(row.assignmentId)} onChange={(e) => setSelectedAssignmentIds((prev) => e.target.checked ? [...prev, row.assignmentId] : prev.filter((x) => x !== row.assignmentId))} /></td>
                    <td className="px-4 py-2 font-medium">{row.title}</td>
                    <td className="px-4 py-2">{studentNameMap.get(row.userId) || `ID:${row.userId}`}</td>
                    <td className="px-4 py-2">{row.status === 'completed' ? '已完成' : '待完成'}</td>
                    <td className="px-4 py-2">{row.dailyQuota}</td>
                    <td className="px-4 py-2">
                      固定2项
                      {row.enableSpelling ? ' + 补全' : ''}
                      {row.enableZhToEn ? ' + 汉译英' : ''}
                    </td>
                    <td className="px-4 py-2">{row.masteredWordCount}/{row.totalWordCount}</td>
                    <td className="px-4 py-2">{row.lastReviewDate || '-'}</td>
                    <td className="px-4 py-2">{row.createdAt ? new Date(row.createdAt).toLocaleString() : '-'}</td>
                    <td className="px-4 py-2"><button onClick={() => deleteOne(row.assignmentId)} className="text-sm text-red-600 font-bold">删除</button></td>
                  </tr>
                ))}
                {assignments.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-6 text-center text-on-surface-variant">暂无数据</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
