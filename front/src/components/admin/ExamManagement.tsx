import React, { useEffect, useMemo, useState } from 'react';
import { Eye, FileQuestion, RefreshCw, Save, Trash2, Upload, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { examApi, ExamPaperDetail, ExamPaperSummary, ExamQuestionItem } from '../../lib/auth';
import { TextbookScopeBookRow, lexiconApi } from '../../lib/lexicon';
import { getSessionToken } from '../../lib/session';

type ImportRow = {
  id: string;
  file: File;
  fileName: string;
  bookVersion: string;
  grade: string;
  semester: string;
  unitCode: string;
  overwrite: boolean;
  status: 'invalid' | 'ready' | 'importing' | 'success' | 'failed';
  note?: string;
};

const PAPER_TYPE = '同步测试题';
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const sortUnit = (a: string, b: string) => {
  const an = Number((a || '').replace(/[^\d]/g, ''));
  const bn = Number((b || '').replace(/[^\d]/g, ''));
  return an && bn ? an - bn : a.localeCompare(b, 'zh-CN');
};
const normalizeSemester = (v: string) => ((v || '').trim() === '全一册' ? '全册' : (v || '').trim());
const normalizeUnitCode = (v: string) => {
  const raw = (v || '').trim();
  const compact = raw.replace(/\s+/g, '');
  if (/^unit\d+[a-zA-Z]?$/i.test(compact)) return `Unit ${compact.slice(4)}`;
  return raw;
};
const parseMeta = (name: string) => {
  const p = name.replace(/\.jsonl$/i, '').split('_');
  return {
    bookVersion: (p[0] || '').trim(),
    grade: (p[1] || '').trim(),
    semester: normalizeSemester((p[2] || '').trim()),
    unitCode: normalizeUnitCode((p[3] || '').trim()),
  };
};

function renderParagraphs(text?: string, emptyText = '暂无内容') {
  const content = (text || '').trim();
  if (!content) {
    return <div className="text-sm text-on-surface-variant">{emptyText}</div>;
  }
  return content.split(/\n{2,}/).map((part, index) => (
    <p key={`${index}-${part.slice(0, 12)}`} className="whitespace-pre-wrap leading-7 text-[15px] text-on-surface">
      {part.trim()}
    </p>
  ));
}

function getQuestionTypeLabel(questionType?: string) {
  const value = (questionType || '').trim();
  const map: Record<string, string> = {
    single_choice: '单项选择',
    multiple_choice: '多项选择',
    reading_mcq: '阅读选择',
    cloze: '完形填空',
    fill_blank: '填空题',
    short_answer: '简答题',
    true_false: '判断题',
  };
  return map[value] || value || '未标注题型';
}

function getQuestionMaterial(detail: ExamPaperDetail | null, question: ExamQuestionItem) {
  if (!detail || !question.materialId) return null;
  return detail.materials.find((item) => item.id === question.materialId) || null;
}

export const ExamManagement: React.FC = () => {
  const token = useMemo(() => getSessionToken(), []);
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [books, setBooks] = useState<string[]>([]);
  const [grades, setGrades] = useState<string[]>([]);
  const [semesters, setSemesters] = useState<string[]>([]);
  const [tree, setTree] = useState<TextbookScopeBookRow[]>([]);
  const [book, setBook] = useState('');
  const [grade, setGrade] = useState('');
  const [semester, setSemester] = useState('');
  const [unit, setUnit] = useState('');
  const [papers, setPapers] = useState<ExamPaperSummary[]>([]);
  const [paperId, setPaperId] = useState(0);
  const [detail, setDetail] = useState<ExamPaperDetail | null>(null);
  const [paperName, setPaperName] = useState('');
  const [paperStatus, setPaperStatus] = useState('active');
  const [paperSourceFile, setPaperSourceFile] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [imports, setImports] = useState<ImportRow[]>([]);

  const scope = useMemo(() => {
    const map = new Map<string, Map<string, string[]>>();
    tree.forEach((bookRow) => {
      const gradeMap = new Map<string, string[]>();
      (bookRow.grades || []).forEach((gradeRow) => gradeMap.set(gradeRow.grade, (gradeRow.semesters || []).map(normalizeSemester)));
      map.set(bookRow.bookVersion, gradeMap);
    });
    return map;
  }, [tree]);

  const gradeOpts = useMemo(() => {
    const candidate = Array.from(scope.get(book || '')?.keys() || []);
    return candidate.length ? candidate : grades;
  }, [scope, book, grades]);

  const semesterOpts = useMemo(() => {
    const candidate = scope.get(book || '')?.get(grade || '') || [];
    return candidate.length ? candidate : semesters;
  }, [scope, book, grade, semesters]);

  const units = useMemo(() => Array.from(new Set(papers.map((row) => row.unitCode))).sort(sortUnit), [papers]);
  const visiblePapers = useMemo(() => papers.filter((row) => !unit || row.unitCode === unit), [papers, unit]);
  const questions = useMemo(
    () => (detail?.questions || []).slice().sort((a, b) => (a.questionNo || 0) - (b.questionNo || 0)),
    [detail]
  );

  const flash = (msg?: string, err?: string) => {
    setMessage(msg || null);
    setError(err || null);
  };

  const applyDetail = (next: ExamPaperDetail | null) => {
    setDetail(next);
    setPaperName(next?.paperName || '');
    setPaperStatus(next?.status || 'active');
    setPaperSourceFile(next?.sourceFile || '');
  };

  const loadOptions = async () => {
    setLoading(true);
    flash();
    try {
      const [options, scopes] = await Promise.all([lexiconApi.getOptions(token, 'word'), lexiconApi.getTextbookScopes(token)]);
      const bs = options.bookVersions || [];
      const gs = options.grades || [];
      const ss = (options.semesters || []).map(normalizeSemester);
      setBooks(bs);
      setGrades(gs);
      setSemesters(ss);
      setTree(scopes.tree || []);
      setBook((value) => value || bs[0] || '');
      setGrade((value) => value || gs[0] || '');
      setSemester((value) => value || ss[0] || '');
    } catch (e: any) {
      setError(e?.message || '加载教材选项失败');
    } finally {
      setLoading(false);
    }
  };

  const loadPapers = async (preferred?: number) => {
    if (!book || !grade || !semester) return;
    setLoading(true);
    flash();
    try {
      const rows = await examApi.getPapers(token, { bookVersion: book, grade, semester, paperType: PAPER_TYPE });
      const list = rows.slice().sort((a, b) => sortUnit(a.unitCode, b.unitCode));
      setPapers(list);
      const nextId = preferred && list.some((row) => row.id === preferred) ? preferred : (list[0]?.id || 0);
      setPaperId(nextId);
      applyDetail(nextId ? await examApi.getPaperDetail(token, nextId) : null);
    } catch (e: any) {
      setError(e?.message || '加载题库失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOptions();
  }, []);

  useEffect(() => {
    if (gradeOpts.length && !gradeOpts.includes(grade)) setGrade(gradeOpts[0]);
  }, [gradeOpts, grade]);

  useEffect(() => {
    if (semesterOpts.length && !semesterOpts.includes(semester)) setSemester(semesterOpts[0]);
  }, [semesterOpts, semester]);

  useEffect(() => {
    if (book && grade && semester) loadPapers(paperId || undefined);
  }, [book, grade, semester]);

  const openPaper = async (id: number) => {
    setPaperId(id);
    setLoading(true);
    flash();
    try {
      applyDetail(await examApi.getPaperDetail(token, id));
    } catch (e: any) {
      setError(e?.message || '加载试卷详情失败');
    } finally {
      setLoading(false);
    }
  };

  const savePaper = async () => {
    if (!detail) return;
    setSaving(true);
    flash();
    try {
      await examApi.updatePaper(token, detail.id, {
        paperName,
        status: paperStatus,
        sourceFile: paperSourceFile,
      });
      setMessage('试卷信息已保存');
      await loadPapers(detail.id);
    } catch (e: any) {
      setError(e?.message || '保存试卷失败');
    } finally {
      setSaving(false);
    }
  };

  const deletePaper = async () => {
    if (!detail || !window.confirm(`确认删除试卷《${detail.paperName}》吗？`)) return;
    setSaving(true);
    flash();
    try {
      const result = await examApi.deletePaper(token, detail.id);
      setMessage(`${result.message}，删除试卷 ${result.deletedPaperCount} 份`);
      await loadPapers();
    } catch (e: any) {
      setError(e?.message || '删除试卷失败');
    } finally {
      setSaving(false);
    }
  };

  const deleteUnit = async () => {
    if (!unit) {
      setError('请先选择单元');
      return;
    }
    if (!window.confirm(`确认删除 ${book} ${grade} ${semester} ${unit} 的同步题吗？`)) return;
    setSaving(true);
    flash();
    try {
      const result = await examApi.deleteUnitScope(token, { bookVersion: book, grade, semester, unitCode: unit, paperType: PAPER_TYPE });
      setUnit('');
      setMessage(`${result.message}，删除试卷 ${result.deletedPaperCount} 份`);
      await loadPapers();
    } catch (e: any) {
      setError(e?.message || '按单元删除失败');
    } finally {
      setSaving(false);
    }
  };

  const deleteSemester = async () => {
    if (!window.confirm(`确认删除 ${book} ${grade} ${semester} 整册同步题吗？`)) return;
    setSaving(true);
    flash();
    try {
      const result = await examApi.deleteSemesterScope(token, { bookVersion: book, grade, semester, paperType: PAPER_TYPE });
      setMessage(`${result.message}，删除试卷 ${result.deletedPaperCount} 份`);
      await loadPapers();
    } catch (e: any) {
      setError(e?.message || '按整册删除失败');
    } finally {
      setSaving(false);
    }
  };

  const onFiles = (files: FileList | null) => {
    if (!files?.length) return;
    setImports((prev) => [
      ...prev,
      ...Array.from(files).map((file) => {
        const meta = parseMeta(file.name);
        const ok = Boolean(meta.bookVersion && meta.grade && meta.semester && meta.unitCode);
        return {
          id: newId(),
          file,
          fileName: file.name,
          ...meta,
          overwrite: false,
          status: ok ? 'ready' : 'invalid',
          note: ok ? undefined : '文件名无法解析教材范围',
        };
      }),
    ]);
  };

  const runImport = async () => {
    const rows = imports.filter((item) => item.status === 'ready');
    if (!rows.length) {
      setError('请先选择可导入文件');
      return;
    }
    setSaving(true);
    flash();
    try {
      for (const row of rows) {
        setImports((prev) => prev.map((item) => (item.id === row.id ? { ...item, status: 'importing', note: undefined } : item)));
        try {
          const result = await examApi.importJsonl(token, {
            file: row.file,
            bookVersion: row.bookVersion,
            grade: row.grade,
            semester: row.semester,
            unitCode: row.unitCode,
            overwrite: row.overwrite,
            createdBy: user?.id ? Number(user.id) : undefined,
          });
          setImports((prev) => prev.map((item) => (item.id === row.id ? { ...item, status: 'success', note: `${result.questionCount} 题` } : item)));
        } catch (e: any) {
          setImports((prev) => prev.map((item) => (item.id === row.id ? { ...item, status: 'failed', note: e?.message || '导入失败' } : item)));
        }
      }
      setMessage('批量导入执行完成');
      await loadPapers(paperId || undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-surface-container-low p-5 border border-outline-variant/30">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-black text-on-surface flex items-center gap-2">
              <FileQuestion className="w-5 h-5 text-primary" />
              同步题库管理
            </h2>
            <p className="text-sm text-on-surface-variant mt-1">批量导入、试卷预览、完整卷面查看、按单元或整册删除。</p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <button onClick={() => loadPapers(paperId || undefined)} className="px-4 py-2 rounded-lg border font-bold flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />刷新
            </button>
            <button onClick={() => setShowImport(true)} className="px-4 py-2 rounded-lg bg-primary text-on-primary font-bold flex items-center gap-2">
              <Upload className="w-4 h-4" />批量导入
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4">
          <select value={book} onChange={(e) => setBook(e.target.value)} className="border rounded-lg px-3 py-2 bg-white">
            {books.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={grade} onChange={(e) => setGrade(e.target.value)} className="border rounded-lg px-3 py-2 bg-white">
            {gradeOpts.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={semester} onChange={(e) => setSemester(e.target.value)} className="border rounded-lg px-3 py-2 bg-white">
            {semesterOpts.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className="border rounded-lg px-3 py-2 bg-white">
            <option value="">全部单元</option>
            {units.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>

        <div className="flex gap-3 mt-4 flex-wrap">
          <button onClick={deleteUnit} disabled={saving || !unit} className="px-4 py-2 rounded-lg border border-red-300 text-red-700 font-bold disabled:opacity-40">
            删除当前单元
          </button>
          <button onClick={deleteSemester} disabled={saving} className="px-4 py-2 rounded-lg bg-red-600 text-white font-bold disabled:opacity-40">
            删除当前整册
          </button>
        </div>

        {error && <div className="mt-4 rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}
        {message && <div className="mt-4 rounded-lg bg-emerald-50 text-emerald-700 px-4 py-3 text-sm">{message}</div>}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-3 rounded-2xl bg-surface-container-low p-4 border border-outline-variant/30">
          <div className="flex items-center justify-between mb-3">
            <div className="font-black">试卷列表</div>
            <span className="text-xs text-on-surface-variant">{papers.length} 份</span>
          </div>
          <div className="space-y-2 max-h-[720px] overflow-auto custom-scrollbar">
            {!visiblePapers.length && <div className="text-sm text-on-surface-variant p-3">当前范围没有同步题。</div>}
            {visiblePapers.map((paper) => (
              <button
                key={paper.id}
                onClick={() => openPaper(paper.id)}
                className={`w-full text-left rounded-xl border p-3 ${paperId === paper.id ? 'border-primary bg-primary/5' : 'border-outline-variant/30 hover:bg-surface-container-highest'}`}
              >
                <div className="font-bold text-sm">{paper.paperName}</div>
                <div className="text-xs text-on-surface-variant mt-1">{paper.unitCode} · {paper.questionCount} 题</div>
              </button>
            ))}
          </div>
        </div>

        <div className="xl:col-span-9 space-y-6">
          <div className="rounded-2xl bg-surface-container-low p-5 border border-outline-variant/30">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 className="font-black text-on-surface flex items-center gap-2">
                <Eye className="w-4 h-4 text-primary" />试卷信息
              </h3>
              {detail && (
                <div className="flex gap-3">
                  <button onClick={savePaper} disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-on-primary font-bold flex items-center gap-2 disabled:opacity-40">
                    <Save className="w-4 h-4" />保存试卷
                  </button>
                  <button onClick={deletePaper} disabled={saving} className="px-4 py-2 rounded-lg bg-red-600 text-white font-bold flex items-center gap-2 disabled:opacity-40">
                    <Trash2 className="w-4 h-4" />删除试卷
                  </button>
                </div>
              )}
            </div>

            {!detail && <div className="text-sm text-on-surface-variant mt-4">{loading ? '加载中...' : '请选择左侧试卷查看详情。'}</div>}

            {detail && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input value={paperName} onChange={(e) => setPaperName(e.target.value)} className="border rounded-lg px-3 py-2 bg-white" placeholder="试卷名称" />
                  <select value={paperStatus} onChange={(e) => setPaperStatus(e.target.value)} className="border rounded-lg px-3 py-2 bg-white">
                    <option value="active">active</option>
                    <option value="draft">draft</option>
                    <option value="disabled">disabled</option>
                  </select>
                  <input value={paperSourceFile} onChange={(e) => setPaperSourceFile(e.target.value)} className="border rounded-lg px-3 py-2 bg-white" placeholder="来源文件" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-on-surface-variant">
                  <div>教材：{detail.bookVersion} / {detail.grade} / {detail.semester}</div>
                  <div>单元：{detail.unitCode}</div>
                  <div>题量：{detail.questionCount}</div>
                </div>
              </div>
            )}
          </div>

          {detail && (
            <div className="rounded-2xl bg-surface-container-low p-6 border border-outline-variant/30">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="text-lg font-black text-on-surface">整卷预览</h3>
                  <p className="text-sm text-on-surface-variant mt-1">按试卷顺序展示材料、题干、选项、答案与解析，更接近学生真实作答视图。</p>
                </div>
                <div className="text-sm text-on-surface-variant">共 {questions.length} 题</div>
              </div>

              {!questions.length && <div className="mt-6 text-sm text-on-surface-variant">当前试卷暂无题目。</div>}

              <div className="mt-6 space-y-6">
                {questions.map((question) => {
                  const material = getQuestionMaterial(detail, question);
                  return (
                    <article key={question.id} className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
                      {material && (
                        <div className="border-b border-outline-variant/20 bg-primary/5 px-6 py-5 space-y-3">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                              {material.materialLabel || '材料题'}
                            </span>
                            <span className="text-xs font-medium text-on-surface-variant">{getQuestionTypeLabel(material.questionType)}</span>
                            {material.title && <span className="text-sm font-bold text-on-surface">{material.title}</span>}
                          </div>
                          <div className="space-y-3">{renderParagraphs(material.content, '暂无材料正文')}</div>
                          {material.analysis?.trim() && (
                            <div className="rounded-xl bg-white/70 px-4 py-3">
                              <div className="text-xs font-bold text-primary mb-2">材料解析</div>
                              <div className="space-y-2">{renderParagraphs(material.analysis)}</div>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="px-6 py-6 space-y-4">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div>
                            <div className="text-sm font-bold text-primary">第 {question.questionNo} 题</div>
                            <div className="text-sm text-on-surface-variant mt-1">{getQuestionTypeLabel(question.questionType)}</div>
                          </div>
                          {question.materialLabel && !material && (
                            <span className="inline-flex items-center rounded-full bg-surface-container-high px-3 py-1 text-xs font-medium text-on-surface-variant">
                              {question.materialLabel}
                            </span>
                          )}
                        </div>

                        <div className="space-y-3">{renderParagraphs(question.stem, '暂无题干')}</div>

                        {!!question.options?.length && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {question.options
                              .slice()
                              .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
                              .map((option) => (
                                <div key={`${question.id}-${option.key}`} className="rounded-xl border border-outline-variant/25 px-4 py-3 bg-white">
                                  <div className="font-bold text-on-surface">{option.key}. {option.text}</div>
                                </div>
                              ))}
                          </div>
                        )}

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
                            <div className="text-xs font-bold text-emerald-700 mb-2">正确答案</div>
                            <div className="whitespace-pre-wrap text-sm text-emerald-900">{question.answerText?.trim() || '暂无答案'}</div>
                          </div>
                          <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                            <div className="text-xs font-bold text-slate-700 mb-2">题目解析</div>
                            <div className="space-y-2">{renderParagraphs(question.analysis, '暂无解析')}</div>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {showImport && (
        <div className="fixed inset-0 z-50 bg-black/35 flex items-center justify-center p-6">
          <div className="w-full max-w-6xl max-h-[88vh] overflow-auto rounded-2xl bg-white shadow-2xl">
            <div className="p-5 border-b flex items-center justify-between">
              <div>
                <div className="text-lg font-black">批量导入同步题 JSONL</div>
                <div className="text-sm text-slate-500 mt-1">文件名建议格式：教材版本_年级_册别_UnitX_同步题_xxx.jsonl</div>
              </div>
              <button onClick={() => setShowImport(false)} className="p-2 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer font-bold">
                <Upload className="w-4 h-4" />选择 JSONL 文件
                <input type="file" accept=".jsonl" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
              </label>

              <div className="overflow-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left p-3">文件</th>
                      <th className="text-left p-3">教材版本</th>
                      <th className="text-left p-3">年级</th>
                      <th className="text-left p-3">册别</th>
                      <th className="text-left p-3">单元</th>
                      <th className="text-left p-3">覆盖</th>
                      <th className="text-left p-3">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!imports.length && (
                      <tr>
                        <td colSpan={7} className="p-4 text-center text-slate-500">请先选择要导入的 JSONL 文件</td>
                      </tr>
                    )}
                    {imports.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="p-3">{row.fileName}</td>
                        <td className="p-3"><input value={row.bookVersion} onChange={(e) => setImports((prev) => prev.map((item) => item.id === row.id ? { ...item, bookVersion: e.target.value, status: 'ready', note: undefined } : item))} className="w-full border rounded px-2 py-1" /></td>
                        <td className="p-3"><input value={row.grade} onChange={(e) => setImports((prev) => prev.map((item) => item.id === row.id ? { ...item, grade: e.target.value, status: 'ready', note: undefined } : item))} className="w-full border rounded px-2 py-1" /></td>
                        <td className="p-3"><input value={row.semester} onChange={(e) => setImports((prev) => prev.map((item) => item.id === row.id ? { ...item, semester: e.target.value, status: 'ready', note: undefined } : item))} className="w-full border rounded px-2 py-1" /></td>
                        <td className="p-3"><input value={row.unitCode} onChange={(e) => setImports((prev) => prev.map((item) => item.id === row.id ? { ...item, unitCode: e.target.value, status: 'ready', note: undefined } : item))} className="w-full border rounded px-2 py-1" /></td>
                        <td className="p-3">
                          <label className="inline-flex items-center gap-2">
                            <input type="checkbox" checked={row.overwrite} onChange={(e) => setImports((prev) => prev.map((item) => item.id === row.id ? { ...item, overwrite: e.target.checked } : item))} />
                            <span>覆盖</span>
                          </label>
                        </td>
                        <td className="p-3">
                          <div className="font-medium">{row.status}</div>
                          {row.note && <div className="text-xs text-slate-500 mt-1">{row.note}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between items-center gap-3 flex-wrap">
                <button onClick={() => setImports([])} className="px-4 py-2 rounded-lg border font-bold">清空列表</button>
                <button onClick={runImport} disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-on-primary font-bold disabled:opacity-40">开始导入</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
