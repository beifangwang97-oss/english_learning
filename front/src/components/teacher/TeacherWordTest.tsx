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
import { getSessionToken } from '../../lib/session';
import { lexiconApi, LexiconTaskTreeBook } from '../../lib/lexicon';

type StudentUser = AdminUser & { onlineStatus?: number | boolean | null };

type UnitNode = {
  textbookVersion: string;
  grade: string;
  semester: string;
  unit: string;
};

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

function safeStoreCode(value?: string) {
  return (value || '').trim() || 'UNASSIGNED';
}

function resolveStoreCode(value: string | undefined, stores: AdminStore[]) {
  const v = (value || '').trim();
  if (!v) return 'UNASSIGNED';
  const byCode = stores.find((s) => s.storeCode === v);
  if (byCode) return byCode.storeCode;
  const byName = stores.find((s) => s.storeName === v);
  if (byName) return byName.storeCode;
  return safeStoreCode(v);
}

function todayDefaultTitle() {
  const now = new Date();
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日单词测试`;
}

function formatDuration(seconds?: number | null) {
  if (typeof seconds !== 'number' || seconds <= 0) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}分${secs}秒`;
}

export const TeacherWordTest: React.FC = () => {
  const { user } = useAuth();
  const token = useMemo(() => getSessionToken(), []);

  const [students, setStudents] = useState<StudentUser[]>([]);
  const [studentNameMap, setStudentNameMap] = useState<Map<number, string>>(new Map());
  const [teacherStoreCode, setTeacherStoreCode] = useState('UNASSIGNED');
  const [taskTree, setTaskTree] = useState<LexiconTaskTreeBook[]>([]);
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
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
  const [expandedGrades, setExpandedGrades] = useState<Set<string>>(new Set());
  const [groupSummaryMap, setGroupSummaryMap] = useState<Record<string, Array<{ groupNo: number; count: number }>>>({});
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<number[]>([]);

  const loadData = async () => {
    if (!token || !user?.id) return;
    setLoading(true);
    setError(null);
    setTreeHint(null);
    try {
      const [latestUser, storesData, usersData, treeData] = await Promise.all([
        authApi.getCurrentUser(token),
        adminStoreApi.getAllStores(token),
        adminUserApi.getAllUsers(token),
        lexiconApi.getTaskTree(token),
      ]);

      const teacherStoreCode = resolveStoreCode(latestUser.storeName || user?.storeName, storesData);
      setTeacherStoreCode(teacherStoreCode);
      const studentsInStore = (usersData || []).filter(
        (u) => u.role === 'student' && resolveStoreCode(u.storeName, storesData) === teacherStoreCode
      ) as StudentUser[];
      setStudents(studentsInStore);
      setStudentNameMap(new Map(studentsInStore.map((s) => [Number(s.id), s.name || s.username || `ID:${s.id}`])));

      const storeCfg = storesData.find((s) => s.storeCode === teacherStoreCode);
      const rawTree = Array.isArray((treeData as any)?.tree)
        ? ((treeData as any).tree as LexiconTaskTreeBook[])
        : (Array.isArray(treeData as any) ? (treeData as any as LexiconTaskTreeBook[]) : []);
      const availableBooks = Array.from(new Set(rawTree.map((b) => b.bookVersion).filter(Boolean)));
      const availableGrades = Array.from(
        new Set(rawTree.flatMap((b) => (b.grades || []).map((g) => g.grade).filter(Boolean)))
      );
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
      if (filteredTree.length > 0) {
        setTaskTree(filteredTree);
      } else {
        setTaskTree(rawTree);
        if (rawTree.length > 0 && (allowedBooks.length > 0 || allowedGrades.length > 0)) {
          setTreeHint('当前门店权限标签与词库标签未完全匹配，已临时展示全部可用教材树，请稍后在门店配置中统一标签命名。');
        } else if (rawTree.length === 0) {
          setTreeHint('词库中暂无可用教材-年级-册数-单元数据。');
        }
      }

      const rows = await wordTestApi.getTeacherAssignments(token, Number(user.id), teacherStoreCode);
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
    setSelectedStudents((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleScope = (scopeKey: string) => {
    setSelectedScopes((prev) => (prev.includes(scopeKey) ? prev.filter((x) => x !== scopeKey) : [...prev, scopeKey]));
  };

  const parseScopeKey = (key: string): WordTestGroupScope | null => {
    const parts = key.split('||');
    if (parts.length !== 5) return null;
    const [textbookVersion, grade, semester, unit, groupNoRaw] = parts;
    const groupNo = Number(groupNoRaw);
    if (!textbookVersion || !grade || !semester || !unit || !Number.isFinite(groupNo)) return null;
    return { textbookVersion, grade, semester, unit, groupNo };
  };

  const formatScopeLabel = (key: string) => {
    const scope = parseScopeKey(key);
    if (!scope) return key;
    return `${scope.textbookVersion} / ${scope.grade} / ${scope.semester} / ${scope.unit} / 组${scope.groupNo}`;
  };

  const fetchUnitGroups = async (unitNode: UnitNode) => {
    const key = `${unitNode.textbookVersion}||${unitNode.grade}||${unitNode.semester}||${unitNode.unit}`;
    if (groupSummaryMap[key]) return;
    const res = await lexiconApi.getLearningSummary(token, {
      type: 'word',
      bookVersion: unitNode.textbookVersion,
      grade: unitNode.grade,
      semester: unitNode.semester,
      unit: unitNode.unit,
    });
    setGroupSummaryMap((prev) => ({ ...prev, [key]: res.groups || [] }));
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

  const toggleGradeExpand = (bookVersion: string, grade: string) => {
    const key = `${bookVersion}||${grade}`;
    setExpandedGrades((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const publish = async () => {
    if (!token || !user?.id) return;
    if (selectedStudents.length === 0) return setError('请至少选择一位学生');
    if (selectedScopes.length === 0) return setError('请至少选择一个组');
    if (!Number.isFinite(passScore) || passScore < 0 || passScore > 100) return setError('合格分数需在 0-100 之间');

    const scopes = selectedScopes
      .map(parseScopeKey)
      .filter((x): x is WordTestGroupScope => Boolean(x));
    if (scopes.length === 0) return setError('测试范围无效，请重新选择');

    setPublishing(true);
    setError(null);
    try {
      const itemMap = new Map<string, WordTestContentItem>();
      for (const scope of scopes) {
        const rows = await lexiconApi.getLearningItemsByGroup(token, {
          type: 'word',
          bookVersion: scope.textbookVersion,
          grade: scope.grade,
          semester: scope.semester,
          unit: scope.unit,
          groupNo: scope.groupNo,
        });
        (rows.items || []).forEach((entry) => {
          const firstMeaning = entry.meanings?.[0];
          itemMap.set(entry.id, {
            entryId: entry.id,
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
      await wordTestApi.batchDeleteAssignments(token, selectedAssignmentIds);
      setSelectedAssignmentIds([]);
      await loadData();
    } catch (e: any) {
      setError(e?.message || '批量删除失败');
    } finally {
      setDeleting(false);
    }
  };

  const uniqueGrades = (book: LexiconTaskTreeBook) => (book.grades || []);

  return (
    <div className="w-full max-w-[96rem] mx-auto p-8 animate-in fade-in">
      <header className="mb-8">
        <h2 className="text-3xl font-black text-on-background mb-2 flex items-center gap-3">
          <ClipboardList className="w-8 h-8 text-primary" />
          单词测试
        </h2>
        <p className="text-on-surface-variant">发布默写/听写任务，测试范围支持跨单元多组。</p>
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
            <h3 className="text-xl font-bold">选择任务</h3>
            <p className="text-xs text-on-surface-variant">
              教材版本、年级、册数、单元、组号均来自数据库词库（非旧测试数据）。
            </p>
            <div className="flex gap-3">
              <button onClick={() => setTestType('默写')} className={`px-4 py-2 rounded-lg border-2 font-bold ${testType === '默写' ? 'border-primary bg-primary-container/20 text-primary' : 'border-outline-variant/30'}`}>默写</button>
              <button onClick={() => setTestType('听写')} className={`px-4 py-2 rounded-lg border-2 font-bold ${testType === '听写' ? 'border-primary bg-primary-container/20 text-primary' : 'border-outline-variant/30'}`}>听写</button>
            </div>            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-on-surface-variant">合格分</span>
              <input
                type="number"
                min={0}
                max={100}
                value={passScore}
                onChange={(e) => setPassScore(Number(e.target.value))}
                className="w-24 rounded-lg border border-outline-variant/30 px-3 py-2"
              />
            </div>            <input value={testTitle} onChange={(e) => setTestTitle(e.target.value)} className="w-full rounded-lg border border-outline-variant/30 px-3 py-2" placeholder="测试名称" />
            {selectedScopes.length > 0 && (
              <div className="rounded-lg border border-outline-variant/30 bg-white p-2">
                <p className="mb-1 text-xs font-bold text-on-surface-variant">已选范围（含册数）</p>
                <div className="max-h-24 space-y-1 overflow-auto text-xs text-on-surface">
                  {selectedScopes.map((k) => (
                    <div key={k} className="truncate">{formatScopeLabel(k)}</div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {treeHint && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {treeHint}
              </div>
            )}
            {taskTree.map((book) => (
              <div key={book.bookVersion} className="mb-4">
                <h4 className="font-bold text-on-surface-variant mb-2">{book.bookVersion}</h4>
                {(uniqueGrades(book) || []).map((g) => {
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
                              <div className="mb-1 flex items-center justify-between px-1">
                                <div className="text-xs font-bold text-on-surface-variant">册数：{s.semester}</div>
                                <div className="rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-bold text-on-surface-variant">
                                  册数层级
                                </div>
                              </div>
                              {(s.units || []).map((u) => {
                                const unitNode: UnitNode = { textbookVersion: book.bookVersion, grade: g.grade, semester: s.semester, unit: u };
                                const unitKey = `${book.bookVersion}||${g.grade}||${s.semester}||${u}`;
                                const unitExpanded = expandedUnits.has(unitKey);
                                const groups = groupSummaryMap[unitKey] || [];
                                return (
                                  <div key={unitKey} className="mb-1 border rounded-lg border-outline-variant/20 bg-white overflow-hidden">
                                    <button onClick={() => toggleUnitExpand(unitNode)} className="w-full px-3 py-2 flex items-center justify-between hover:bg-surface-container-highest">
                                      <span className="text-sm font-bold">{u}</span>
                                      <ChevronRight className={`w-4 h-4 transition-transform ${unitExpanded ? 'rotate-90' : ''}`} />
                                    </button>
                                    {unitExpanded && (
                                      <div className="px-3 pb-3 space-y-1">
                                        {groups.length === 0 && <div className="text-xs text-on-surface-variant">暂无组数据</div>}
                                        {groups.map((gr) => {
                                          const scopeKey = `${book.bookVersion}||${g.grade}||${s.semester}||${u}||${gr.groupNo}`;
                                          const checked = selectedScopes.includes(scopeKey);
                                          return (
                                            <label key={scopeKey} className="flex items-center justify-between rounded px-2 py-1 hover:bg-surface-container-highest cursor-pointer">
                                              <span className="text-sm">组 {gr.groupNo}（{gr.count} 词）</span>
                                              <input type="checkbox" checked={checked} onChange={() => toggleScope(scopeKey)} />
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
            <button onClick={publish} disabled={publishing || selectedStudents.length === 0 || selectedScopes.length === 0} className="w-full py-3 bg-primary text-on-primary rounded-xl font-black disabled:opacity-50">
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
                  <th className="px-4 py-3">类型</th>
                  <th className="px-4 py-3">学生</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">合格分数</th>
                  <th className="px-4 py-3">完成次数</th>
                  <th className="px-4 py-3">最高分/最佳用时</th>
                  <th className="px-4 py-3">最高正确数/单词总数</th>
                  <th className="px-4 py-3">发布时间</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((row) => (
                  <tr key={row.assignmentId} className="border-t border-outline-variant/20">
                    <td className="px-4 py-2"><input type="checkbox" checked={selectedAssignmentIds.includes(row.assignmentId)} onChange={(e) => setSelectedAssignmentIds((prev) => e.target.checked ? [...prev, row.assignmentId] : prev.filter((x) => x !== row.assignmentId))} /></td>
                    <td className="px-4 py-2 font-medium">{row.title}</td>
                    <td className="px-4 py-2">{row.testType}</td>
                    <td className="px-4 py-2">{studentNameMap.get(row.userId) || `ID:${row.userId}`}</td>
                    <td className="px-4 py-2">{row.status || 'pending'}</td>
                    <td className="px-4 py-2">{typeof row.passScore === 'number' ? `${row.passScore} 分` : '60 分'}</td>
                    <td className="px-4 py-2">{typeof row.attemptCount === 'number' ? row.attemptCount : 0}</td>
                    <td className="px-4 py-2">
                      {typeof row.score === 'number' ? `${row.score} 分` : '-'} / {formatDuration(row.duration)}
                    </td>
                    <td className="px-4 py-2">
                      {typeof row.correctCount === 'number' && typeof row.totalCount === 'number' ? `${row.correctCount}/${row.totalCount}` : '-'}
                    </td>
                    <td className="px-4 py-2">{row.createdAt ? new Date(row.createdAt).toLocaleString() : '-'}</td>
                    <td className="px-4 py-2">
                      <button onClick={() => deleteOne(row.assignmentId)} className="text-sm text-red-600 font-bold">删除</button>
                    </td>
                  </tr>
                ))}
                {assignments.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-6 text-center text-on-surface-variant">暂无数据</td>
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








