import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { lexiconApi, TextbookScopeBookRow } from '../../lib/lexicon';
import { getSessionToken } from '../../lib/session';

const DEFAULT_GRADES = ['三年级', '四年级', '五年级', '六年级', '七年级', '八年级', '九年级', '高一', '高二', '高三'];
const SEMESTER_OPTIONS = ['上册', '下册', '全册'];

const normalizeSemester = (v: string) => {
  const s = (v || '').trim();
  if (s === '全一册' || s === '全册') return '全册';
  return s;
};

type ScopeUsage = {
  bookVersion?: string;
  grade?: string;
  semester?: string;
  wordLexiconCount?: number;
  phraseLexiconCount?: number;
  passageCount?: number;
  unitCount?: number;
  userCount?: number;
  storeCount?: number;
  users?: Array<Record<string, unknown>>;
  stores?: Array<Record<string, unknown>>;
};

type CleanupScope =
  | { kind: 'book'; bookVersion: string; usage?: ScopeUsage }
  | { kind: 'grade'; bookVersion: string; grade: string; usage?: ScopeUsage }
  | { kind: 'semester'; bookVersion: string; grade: string; semester: string; usage?: ScopeUsage };

export const TextbookScopeManagement: React.FC = () => {
  const token = useMemo(() => getSessionToken(), []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tree, setTree] = useState<TextbookScopeBookRow[]>([]);
  const [grades, setGrades] = useState<string[]>(DEFAULT_GRADES);
  const [newBookVersion, setNewBookVersion] = useState('');
  const [expandedBooks, setExpandedBooks] = useState<Set<string>>(new Set());
  const [cleanupCandidate, setCleanupCandidate] = useState<CleanupScope | null>(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await lexiconApi.getTextbookScopes(token);
      const nextTree = (res.tree || []).map((book) => ({
        ...book,
        grades: (book.grades || []).map((g) => ({
          ...g,
          semesters: (g.semesters || []).map(normalizeSemester),
        })),
      }));
      setTree(nextTree);
      setGrades((res.grades || []).length ? res.grades : DEFAULT_GRADES);
      setExpandedBooks((prev) => {
        const keep = new Set<string>();
        for (const b of nextTree) if (prev.has(b.bookVersion)) keep.add(b.bookVersion);
        return keep;
      });
    } catch (e: any) {
      const msg = e?.message || '加载教材结构失败';
      setError(msg);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const describeUsage = (usage?: ScopeUsage) => {
    if (!usage) return '';
    const lines = [
      `内容占用：单词 ${usage.wordLexiconCount ?? 0}，短语 ${usage.phraseLexiconCount ?? 0}，课文 ${usage.passageCount ?? 0}，单元 ${usage.unitCount ?? 0}`,
      `业务占用：用户 ${usage.userCount ?? 0}，门店 ${usage.storeCount ?? 0}`,
    ];
    const userLines = (usage.users || []).map((u) => {
      const role = String(u.role || '');
      const name = String(u.name || u.username || '');
      const grade = String(u.grade || '');
      const storeName = String(u.storeName || u.storeCode || '');
      return `${role} / ${name}${grade ? ` / ${grade}` : ''}${storeName ? ` / ${storeName}` : ''}`;
    });
    const storeLines = (usage.stores || []).map((s) => {
      const code = String(s.storeCode || '');
      const name = String(s.storeName || '');
      return `${code}${name ? ` / ${name}` : ''}`;
    });
    if (userLines.length) lines.push(`占用用户：${userLines.join('；')}`);
    if (storeLines.length) lines.push(`占用门店：${storeLines.join('；')}`);
    return lines.join('\n');
  };

  const canCascadeDelete = (usage?: ScopeUsage) => {
    if (!usage) return false;
    const userCount = usage.userCount ?? 0;
    const storeCount = usage.storeCount ?? 0;
    const contentCount =
      (usage.wordLexiconCount ?? 0) +
      (usage.phraseLexiconCount ?? 0) +
      (usage.passageCount ?? 0) +
      (usage.unitCount ?? 0);
    return userCount === 0 && storeCount === 0 && contentCount > 0;
  };

  const runAction = async (fn: () => Promise<any>, successMessage: string, reload = true) => {
    setSaving(true);
    setError(null);
    setMessage(null);
    setCleanupCandidate(null);
    try {
      await fn();
      setMessage(successMessage);
      if (reload) {
        await load(true);
      }
    } catch (e: any) {
      const msg = e?.message || '操作失败';
      setError(msg);
      window.alert(msg);
    } finally {
      setSaving(false);
    }
  };

  const createBook = async () => {
    const name = newBookVersion.trim();
    if (!name) {
      const msg = '请输入教材版本名称';
      setError(msg);
      window.alert(msg);
      return;
    }
    await runAction(() => lexiconApi.createTextbookScopeTextbook(token, name), `已新增教材版本：${name}`);
    setNewBookVersion('');
  };

  const renameBook = async (oldName: string) => {
    const next = window.prompt(`将“${oldName}”重命名为：`, oldName)?.trim();
    if (!next || next === oldName) return;
    await runAction(() => lexiconApi.renameTextbookScopeTextbook(token, oldName, next), `已重命名：${oldName} -> ${next}`);
  };

  const handleDeleteFailure = (scope: CleanupScope, e: any) => {
    const usage = e?.usage as ScopeUsage | undefined;
    const msg = e?.message || '删除失败';
    setError(msg);
    setCleanupCandidate(usage ? { ...scope, usage } as CleanupScope : null);
  };

  const deleteBook = async (bookVersion: string) => {
    if (!window.confirm(`确认删除教材版本“${bookVersion}”？\n如有占用会被阻止。`)) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    setCleanupCandidate(null);
    try {
      await lexiconApi.deleteTextbookScopeTextbook(token, bookVersion);
      setMessage(`已删除教材版本：${bookVersion}`);
      await load(true);
    } catch (e: any) {
      handleDeleteFailure({ kind: 'book', bookVersion }, e);
    } finally {
      setSaving(false);
    }
  };

  const addGrade = async (bookVersion: string) => {
    const grade = window.prompt(`给“${bookVersion}”新增年级：`, grades[0] || '七年级')?.trim();
    if (!grade) return;
    await runAction(() => lexiconApi.addTextbookScopeGrade(token, bookVersion, grade), `已新增年级：${bookVersion} / ${grade}`);
  };

  const deleteGrade = async (bookVersion: string, grade: string) => {
    if (!window.confirm(`确认删除：${bookVersion} / ${grade}？\n如有占用会被阻止。`)) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    setCleanupCandidate(null);
    try {
      await lexiconApi.deleteTextbookScopeGrade(token, bookVersion, grade);
      setMessage(`已删除年级：${bookVersion} / ${grade}`);
      await load(true);
    } catch (e: any) {
      handleDeleteFailure({ kind: 'grade', bookVersion, grade }, e);
    } finally {
      setSaving(false);
    }
  };

  const cascadeDelete = async (candidate: CleanupScope) => {
    const scopeLabel =
      candidate.kind === 'book'
        ? candidate.bookVersion
        : candidate.kind === 'grade'
          ? `${candidate.bookVersion} / ${candidate.grade}`
          : `${candidate.bookVersion} / ${candidate.grade} / ${candidate.semester}`;
    if (!window.confirm(`确认清空关联内容并删除：${scopeLabel}？\n\n这会删除该范围下的单词、短语、课文、单元，并自动重试删除教材标签。`)) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await lexiconApi.cascadeDeleteTextbookScope(token, {
        bookVersion: candidate.bookVersion,
        grade: candidate.kind === 'book' ? undefined : candidate.grade,
        semester: candidate.kind === 'semester' ? candidate.semester : undefined,
      });
      setCleanupCandidate(null);
      setMessage(
        `级联删除完成：单词 ${res.deletedWords}，短语 ${res.deletedPhrases}，课文 ${res.deletedPassages}，单元 ${res.deletedUnits}，教材范围 ${res.deletedScopes}` +
        (res.deletedTextbookTag ? '，教材标签已删除' : '')
      );
      await load(true);
    } catch (e: any) {
      handleDeleteFailure(candidate, e);
    } finally {
      setSaving(false);
    }
  };

  const setGradeSemesters = async (
    bookVersion: string,
    grade: string,
    current: string[],
    targetRaw: string[],
    messageText: string
  ) => {
    const currentSet = new Set((current || []).map(normalizeSemester));
    const target = Array.from(new Set(targetRaw.map(normalizeSemester).filter((x) => SEMESTER_OPTIONS.includes(x))));
    const targetSet = new Set(target);
    const toDelete = Array.from(currentSet).filter((s) => !targetSet.has(s));
    const toAdd = target.filter((s) => !currentSet.has(s));
    if (!toDelete.length && !toAdd.length) return;

    await runAction(
      async () => {
        for (const s of toDelete) {
          try {
            await lexiconApi.deleteTextbookScopeSemester(token, bookVersion, grade, s);
          } catch (e: any) {
            handleDeleteFailure({ kind: 'semester', bookVersion, grade, semester: s }, e);
            throw e;
          }
        }
        for (const s of toAdd) {
          await lexiconApi.addTextbookScopeSemester(token, bookVersion, grade, s);
        }

        // Optimistic in-place update to avoid viewport jump after each toggle.
        setTree((prev) =>
          prev.map((book) =>
            book.bookVersion !== bookVersion
              ? book
              : {
                  ...book,
                  grades: (book.grades || []).map((gRow) =>
                    gRow.grade !== grade
                      ? gRow
                      : {
                          ...gRow,
                          semesters: target,
                        }
                  ),
                }
          )
        );
      },
      messageText,
      false
    );
  };

  const toggleBook = (bookVersion: string) => {
    setExpandedBooks((prev) => {
      const next = new Set(prev);
      if (next.has(bookVersion)) next.delete(bookVersion);
      else next.add(bookVersion);
      return next;
    });
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex items-center gap-2">
        <h3 className="text-2xl font-black">教材管理</h3>
        <button
          onClick={load}
          disabled={loading || saving}
          className="ml-auto px-3 py-2 rounded-lg border font-bold hover:bg-surface-container-low disabled:opacity-40 inline-flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4 flex flex-wrap gap-2 items-center">
        <input
          value={newBookVersion}
          onChange={(e) => setNewBookVersion(e.target.value)}
          placeholder="新增教材版本，如：新人教版"
          className="border rounded-lg px-3 py-2 min-w-64"
        />
        <button
          onClick={createBook}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-secondary text-on-secondary font-bold disabled:opacity-50 inline-flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          新增教材
        </button>
        <span className="text-xs text-on-surface-variant">
          默认创建：三到九年级 + 高一高二高三；每个年级默认上册/下册。
        </span>
      </div>

      {message && <div className="rounded-lg bg-green-50 text-green-700 px-3 py-2 text-sm whitespace-pre-line">{message}</div>}
      {error && (
        <div className="rounded-lg bg-red-50 text-red-700 px-3 py-3 text-sm space-y-2">
          <div className="font-bold whitespace-pre-line">{error}</div>
          {cleanupCandidate?.usage && (
            <div className="rounded border border-red-200 bg-white/80 p-3 space-y-2">
              <div className="font-bold">详细占用说明</div>
              <div className="whitespace-pre-line text-xs leading-6">{describeUsage(cleanupCandidate.usage)}</div>
              {canCascadeDelete(cleanupCandidate.usage) ? (
                <button
                  onClick={() => cascadeDelete(cleanupCandidate)}
                  disabled={saving}
                  className="px-3 py-2 rounded-lg border border-red-300 bg-red-600 text-white font-bold disabled:opacity-50"
                >
                  清空关联内容并删除教材
                </button>
              ) : (
                <div className="text-xs">
                  当前仍存在门店或用户占用，暂不支持级联删除。请先解除这些业务占用后再删除。
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-6 text-sm text-on-surface-variant">
          正在加载教材结构...
        </div>
      ) : (
        <div className="space-y-3">
          {tree.map((book) => {
            const expanded = expandedBooks.has(book.bookVersion);
            return (
              <div key={book.bookVersion} className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleBook(book.bookVersion)}
                    className="w-8 h-8 rounded-lg border flex items-center justify-center hover:bg-surface-container-low"
                    title={expanded ? '折叠教材' : '展开教材'}
                  >
                    {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  <h4 className="text-lg font-black">{book.bookVersion}</h4>
                  <button onClick={() => renameBook(book.bookVersion)} disabled={saving} className="px-2 py-1 rounded border text-sm font-bold">重命名</button>
                  <button onClick={() => addGrade(book.bookVersion)} disabled={saving} className="px-2 py-1 rounded border text-sm font-bold">新增年级</button>
                  <button
                    onClick={() => deleteBook(book.bookVersion)}
                    disabled={saving}
                    className="ml-auto px-2 py-1 rounded border border-red-300 text-red-700 text-sm font-bold inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    删除教材
                  </button>
                </div>

                {expanded && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                    {book.grades.map((gradeRow) => {
                      const semesters = (gradeRow.semesters || []).map(normalizeSemester).filter(Boolean);
                      const has = (s: string) => semesters.includes(s);
                      return (
                        <div
                          key={`${book.bookVersion}-${gradeRow.grade}`}
                          className="rounded-lg border border-outline-variant/20 p-3 bg-white/70 max-w-[320px]"
                        >
                          <div className="flex items-center gap-2">
                            <div className="font-bold text-sm">{gradeRow.grade}</div>
                            <button
                              onClick={() => deleteGrade(book.bookVersion, gradeRow.grade)}
                              disabled={saving}
                              className="ml-auto px-2 py-1 rounded border border-red-300 text-red-700 text-xs font-bold"
                            >
                              删除年级
                            </button>
                          </div>

                          <div className="mt-2 grid grid-cols-3 gap-1">
                            {SEMESTER_OPTIONS.map((option) => (
                              <button
                                key={`${book.bookVersion}-${gradeRow.grade}-${option}`}
                                disabled={saving}
                                onClick={() =>
                                  setGradeSemesters(
                                    book.bookVersion,
                                    gradeRow.grade,
                                    semesters,
                                    has(option) ? semesters.filter((x) => x !== option) : [...semesters, option],
                                    `已更新册数：${book.bookVersion} / ${gradeRow.grade}`
                                  )
                                }
                                className={`px-2 py-1 rounded border text-xs font-bold ${
                                  has(option)
                                    ? 'bg-secondary text-on-secondary border-secondary'
                                    : 'hover:bg-surface-container-low'
                                }`}
                              >
                                {option}
                              </button>
                            ))}
                          </div>

                          <div className="mt-2 flex flex-wrap gap-1">
                            <button
                              disabled={saving}
                              onClick={() =>
                                setGradeSemesters(
                                  book.bookVersion,
                                  gradeRow.grade,
                                  semesters,
                                  ['上册', '下册'],
                                  `已设为上下册：${book.bookVersion} / ${gradeRow.grade}`
                                )
                              }
                              className="px-2 py-1 rounded border text-xs hover:bg-surface-container-low"
                            >
                              常规（上/下）
                            </button>
                            <button
                              disabled={saving}
                              onClick={() =>
                                setGradeSemesters(
                                  book.bookVersion,
                                  gradeRow.grade,
                                  semesters,
                                  ['全册'],
                                  `已设为全册：${book.bookVersion} / ${gradeRow.grade}`
                                )
                              }
                              className="px-2 py-1 rounded border text-xs hover:bg-surface-container-low"
                            >
                              仅全册
                            </button>
                            <button
                              disabled={saving}
                              onClick={() =>
                                setGradeSemesters(
                                  book.bookVersion,
                                  gradeRow.grade,
                                  semesters,
                                  [],
                                  `已清空册数：${book.bookVersion} / ${gradeRow.grade}`
                                )
                              }
                              className="px-2 py-1 rounded border text-xs text-red-700 border-red-300 hover:bg-red-50"
                            >
                              清空
                            </button>
                          </div>

                          <div className="mt-2 text-xs text-on-surface-variant">
                            当前：{semesters.length ? semesters.join(' / ') : '空'}
                          </div>
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
};
