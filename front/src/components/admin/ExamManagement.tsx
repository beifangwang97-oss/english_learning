import React, { useEffect, useMemo, useState } from 'react';
import { Eye, RefreshCw, Save, Trash2, Upload, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  QuestionBankImportBatch,
  QuestionBankQuestionDetail,
  QuestionBankQuestionSummary,
  QuestionBankOptionItem,
  questionBankApi,
} from '../../lib/auth';
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
  overwriteMode: 'skip_existing' | 'overwrite_existing';
  status: 'invalid' | 'ready' | 'importing' | 'success' | 'failed';
  note?: string;
};

type DetailDraft = {
  stem: string;
  answerText: string;
  analysis: string;
  difficulty: string;
  knowledgeTagsText: string;
  bookVersion: string;
  grade: string;
  semester: string;
  unitCode: string;
  examScene: string;
  status: string;
  remarks: string;
  sharedStem: string;
  material: string;
  options: QuestionBankOptionItem[];
};

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const sortUnit = (a: string, b: string) => {
  const an = Number((a || '').replace(/[^\d]/g, ''));
  const bn = Number((b || '').replace(/[^\d]/g, ''));
  return an && bn ? an - bn : a.localeCompare(b, 'zh-CN');
};
const normalizeSemester = (v: string) => (v || '').trim();
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
const safeStringify = (value: any) => {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};
const prettyTime = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};
const summarizeStem = (stem?: string) => {
  const text = (stem || '').replace(/\s+/g, ' ').trim();
  if (!text) return '(空题干)';
  return text.length > 72 ? `${text.slice(0, 72)}...` : text;
};
const questionTypeLabel = (value?: string) => {
  const map: Record<string, string> = {
    single_choice: '单选',
    multiple_choice: '多选',
    cloze: '完形',
    reading: '阅读',
    seven_choice: '七选五',
    fill_blank: '填空',
    short_answer: '简答',
    true_false: '判断',
  };
  return map[(value || '').trim()] || value || '未分类';
};

function parseJsonOrText(value: string) {
  const text = (value || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function buildDraft(detail: QuestionBankQuestionDetail | null): DetailDraft {
  return {
    stem: detail?.stem || '',
    answerText: safeStringify(detail?.answer),
    analysis: detail?.analysis || '',
    difficulty: detail?.difficulty || '',
    knowledgeTagsText: safeStringify(detail?.knowledgeTags),
    bookVersion: detail?.bookVersion || '',
    grade: detail?.grade || '',
    semester: detail?.semester || '',
    unitCode: detail?.unitCode || '',
    examScene: detail?.examScene || '',
    status: detail?.status || 'active',
    remarks: detail?.remarks || '',
    sharedStem: detail?.sharedStem || '',
    material: detail?.material || '',
    options: (detail?.options || []).map((item, idx) => ({
      id: item.id,
      key: item.key || '',
      text: item.text || '',
      sortOrder: item.sortOrder ?? idx,
    })),
  };
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
  const [unitCode, setUnitCode] = useState('');
  const [questionType, setQuestionType] = useState('');
  const [status, setStatus] = useState('');
  const [keyword, setKeyword] = useState('');
  const [questions, setQuestions] = useState<QuestionBankQuestionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number>(0);
  const [detail, setDetail] = useState<QuestionBankQuestionDetail | null>(null);
  const [draft, setDraft] = useState<DetailDraft>(buildDraft(null));
  const [showImport, setShowImport] = useState(false);
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [batches, setBatches] = useState<QuestionBankImportBatch[]>([]);

  const scope = useMemo(() => {
    const map = new Map<string, Map<string, string[]>>();
    tree.forEach((bookRow) => {
      const gradeMap = new Map<string, string[]>();
      (bookRow.grades || []).forEach((gradeRow) => gradeMap.set(gradeRow.grade, (gradeRow.semesters || []).map((x) => normalizeSemester(x))));
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

  const units = useMemo(
    () => Array.from(new Set(questions.map((row) => row.unitCode || '').filter(Boolean))).sort(sortUnit),
    [questions]
  );

  const flash = (msg?: string, err?: string) => {
    setMessage(msg || null);
    setError(err || null);
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
      setError(e?.message || '加载教材范围失败');
    } finally {
      setLoading(false);
    }
  };

  const loadBatches = async () => {
    try {
      const page = await questionBankApi.getImportBatches(token, { page: 0, size: 8 });
      setBatches(page.content || []);
    } catch {
      setBatches([]);
    }
  };

  const loadQuestions = async (preferredId?: number) => {
    setLoading(true);
    flash();
    try {
      const page = await questionBankApi.getQuestions(token, {
        bookVersion: book || undefined,
        grade: grade || undefined,
        semester: semester || undefined,
        unitCode: unitCode || undefined,
        questionType: questionType || undefined,
        status: status || undefined,
        keyword: keyword || undefined,
        page: 0,
        size: 200,
      });
      const rows = page.content || [];
      setQuestions(rows);
      const nextId = preferredId && rows.some((row) => row.id === preferredId) ? preferredId : (rows[0]?.id || 0);
      setSelectedId(nextId);
      if (nextId) {
        const nextDetail = await questionBankApi.getQuestionDetail(token, nextId);
        setDetail(nextDetail);
        setDraft(buildDraft(nextDetail));
      } else {
        setDetail(null);
        setDraft(buildDraft(null));
      }
    } catch (e: any) {
      setError(e?.message || '加载题库失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOptions();
    loadBatches();
  }, []);

  useEffect(() => {
    if (gradeOpts.length && !gradeOpts.includes(grade)) setGrade(gradeOpts[0]);
  }, [gradeOpts, grade]);

  useEffect(() => {
    if (semesterOpts.length && !semesterOpts.includes(semester)) setSemester(semesterOpts[0]);
  }, [semesterOpts, semester]);

  useEffect(() => {
    if (book && grade && semester) loadQuestions(selectedId || undefined);
  }, [book, grade, semester]);

  const openQuestion = async (id: number) => {
    setSelectedId(id);
    setLoading(true);
    flash();
    try {
      const nextDetail = await questionBankApi.getQuestionDetail(token, id);
      setDetail(nextDetail);
      setDraft(buildDraft(nextDetail));
    } catch (e: any) {
      setError(e?.message || '加载题目详情失败');
    } finally {
      setLoading(false);
    }
  };

  const saveQuestion = async () => {
    if (!detail) return;
    setSaving(true);
    flash();
    try {
      const next = await questionBankApi.updateQuestion(token, detail.id, {
        stem: draft.stem,
        answer: parseJsonOrText(draft.answerText),
        analysis: draft.analysis,
        difficulty: draft.difficulty,
        knowledgeTags: parseJsonOrText(draft.knowledgeTagsText),
        bookVersion: draft.bookVersion,
        grade: draft.grade,
        semester: draft.semester,
        unitCode: draft.unitCode,
        examScene: draft.examScene,
        status: draft.status,
        remarks: draft.remarks,
        sharedStem: draft.sharedStem,
        material: draft.material,
        options: draft.options
          .filter((item) => item.key.trim() || item.text.trim())
          .map((item, idx) => ({ ...item, sortOrder: idx })),
      });
      setDetail(next);
      setDraft(buildDraft(next));
      setMessage('题目已保存');
      await loadQuestions(next.id);
    } catch (e: any) {
      setError(e?.message || '保存题目失败');
    } finally {
      setSaving(false);
    }
  };

  const removeQuestion = async () => {
    if (!detail) return;
    if (!window.confirm(`确定删除题目 ${detail.questionUid} 吗？`)) return;
    setSaving(true);
    flash();
    try {
      await questionBankApi.deleteQuestion(token, detail.id);
      setMessage('题目已删除');
      await loadQuestions();
    } catch (e: any) {
      setError(e?.message || '删除题目失败');
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
        const ok = Boolean(meta.bookVersion && meta.grade && meta.semester);
        return {
          id: newId(),
          file,
          fileName: file.name,
          ...meta,
          overwriteMode: 'overwrite_existing',
          status: ok ? 'ready' : 'invalid',
          note: ok ? undefined : '文件名无法解析出教材范围',
        };
      }),
    ]);
  };

  const runImport = async () => {
    const rows = imports.filter((item) => item.status === 'ready');
    if (!rows.length) {
      setError('没有可导入的文件');
      return;
    }
    setSaving(true);
    flash();
    try {
      for (const row of rows) {
        setImports((prev) => prev.map((item) => (item.id === row.id ? { ...item, status: 'importing', note: undefined } : item)));
        try {
          const result = await questionBankApi.importJsonl(token, {
            file: row.file,
            bookVersion: row.bookVersion,
            grade: row.grade,
            semester: row.semester,
            unitCode: row.unitCode || undefined,
            sourceType: 'sync_test',
            overwriteMode: row.overwriteMode,
            createdBy: user?.id ? Number(user.id) : undefined,
          });
          const note = `成功 ${result.successCount}，失败 ${result.failedCount}，新增/更新 ${result.createdCount + result.updatedCount}`;
          setImports((prev) => prev.map((item) => (item.id === row.id ? { ...item, status: 'success', note } : item)));
        } catch (e: any) {
          setImports((prev) => prev.map((item) => (item.id === row.id ? { ...item, status: 'failed', note: e?.message || '导入失败' } : item)));
        }
      }
      setMessage('导入任务已执行');
      await loadBatches();
      await loadQuestions(selectedId || undefined);
    } finally {
      setSaving(false);
    }
  };

  const updateDraft = <K extends keyof DetailDraft>(key: K, value: DetailDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const updateOption = (index: number, field: 'key' | 'text', value: string) => {
    setDraft((prev) => ({
      ...prev,
      options: prev.options.map((item, idx) => (idx === index ? { ...item, [field]: value } : item)),
    }));
  };

  const addOption = () => {
    setDraft((prev) => ({
      ...prev,
      options: [...prev.options, { key: '', text: '', sortOrder: prev.options.length }],
    }));
  };

  const removeOption = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      options: prev.options.filter((_, idx) => idx !== index).map((item, idx) => ({ ...item, sortOrder: idx })),
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-on-surface">题库管理</h2>
          <p className="mt-1 text-sm text-on-surface-variant">导入 JSONL、按题目检索并维护题干、材料、选项、答案和解析。</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => loadQuestions(selectedId || undefined)} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold">
            <RefreshCw className="h-4 w-4" />
            刷新
          </button>
          <button onClick={() => setShowImport(true)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary">
            <Upload className="h-4 w-4" />
            导入题库
          </button>
        </div>
      </div>

      {message ? <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
      {error ? <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {showImport ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
        <section className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-black text-on-surface">JSONL 导入</h3>
              <p className="mt-1 text-sm text-on-surface-variant">按文件名自动解析教材范围，可逐个文件设置覆盖模式。</p>
            </div>
            <div className="flex items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold">
              <Upload className="h-4 w-4" />
              选择文件
              <input type="file" multiple accept=".jsonl" className="hidden" onChange={(e) => onFiles(e.target.files)} />
            </label>
            <button onClick={() => setShowImport(false)} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold">
              <X className="h-4 w-4" />
              Close
            </button>
            </div>
          </div>

          <div className="mt-4 max-h-[calc(90vh-220px)] overflow-y-auto space-y-3 pr-1">
            {imports.length === 0 ? <div className="text-sm text-on-surface-variant">还没有选择文件。</div> : null}
            {imports.map((row) => (
              <div key={row.id} className="grid gap-3 rounded-xl border border-outline-variant/20 bg-surface px-4 py-3 md:grid-cols-[2fr_repeat(4,1fr)_160px]">
                <div>
                  <div className="font-bold text-on-surface">{row.fileName}</div>
                  <div className="mt-1 text-xs text-on-surface-variant">{row.note || row.status}</div>
                </div>
                <input className="rounded-lg border px-3 py-2 text-sm" value={row.bookVersion} onChange={(e) => setImports((prev) => prev.map((item) => item.id === row.id ? { ...item, bookVersion: e.target.value } : item))} placeholder="教材版本" />
                <input className="rounded-lg border px-3 py-2 text-sm" value={row.grade} onChange={(e) => setImports((prev) => prev.map((item) => item.id === row.id ? { ...item, grade: e.target.value } : item))} placeholder="年级" />
                <input className="rounded-lg border px-3 py-2 text-sm" value={row.semester} onChange={(e) => setImports((prev) => prev.map((item) => item.id === row.id ? { ...item, semester: e.target.value } : item))} placeholder="学期" />
                <input className="rounded-lg border px-3 py-2 text-sm" value={row.unitCode} onChange={(e) => setImports((prev) => prev.map((item) => item.id === row.id ? { ...item, unitCode: e.target.value } : item))} placeholder="单元" />
                <select className="rounded-lg border px-3 py-2 text-sm" value={row.overwriteMode} onChange={(e) => setImports((prev) => prev.map((item) => item.id === row.id ? { ...item, overwriteMode: e.target.value as ImportRow['overwriteMode'] } : item))}>
                  <option value="overwrite_existing">覆盖已存在</option>
                  <option value="skip_existing">跳过已存在</option>
                </select>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end">
            <button onClick={runImport} disabled={saving} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary disabled:opacity-50">
              {saving ? '导入中...' : '开始导入'}
            </button>
          </div>

          <div className="mt-6">
            <h4 className="text-sm font-black text-on-surface">最近批次</h4>
            <div className="mt-3 overflow-auto rounded-xl border">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-container-low">
                  <tr className="text-left">
                    <th className="px-3 py-2">批次</th>
                    <th className="px-3 py-2">范围</th>
                    <th className="px-3 py-2">状态</th>
                    <th className="px-3 py-2">结果</th>
                    <th className="px-3 py-2">时间</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="px-3 py-2">{row.batchCode}</td>
                      <td className="px-3 py-2">{[row.bookVersion, row.grade, row.semester, row.unitCode].filter(Boolean).join(' / ')}</td>
                      <td className="px-3 py-2">{row.importStatus}</td>
                      <td className="px-3 py-2">{row.successCount}/{row.totalCount}</td>
                      <td className="px-3 py-2">{prettyTime(row.createdAt)}</td>
                    </tr>
                  ))}
                  {batches.length === 0 ? (
                    <tr><td className="px-3 py-3 text-on-surface-variant" colSpan={5}>暂无导入记录</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </section>
        </div>
      ) : null}

      <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5">
        <div className="grid gap-3 md:grid-cols-6">
          <select className="rounded-lg border px-3 py-2 text-sm" value={book} onChange={(e) => setBook(e.target.value)}>
            {books.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="rounded-lg border px-3 py-2 text-sm" value={grade} onChange={(e) => setGrade(e.target.value)}>
            {gradeOpts.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="rounded-lg border px-3 py-2 text-sm" value={semester} onChange={(e) => setSemester(e.target.value)}>
            {semesterOpts.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="rounded-lg border px-3 py-2 text-sm" value={unitCode} onChange={(e) => setUnitCode(e.target.value)}>
            <option value="">全部单元</option>
            {units.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="rounded-lg border px-3 py-2 text-sm" value={questionType} onChange={(e) => setQuestionType(e.target.value)}>
            <option value="">全部题型</option>
            <option value="single_choice">单选</option>
            <option value="multiple_choice">多选</option>
            <option value="cloze">完形</option>
            <option value="reading">阅读</option>
            <option value="seven_choice">七选五</option>
            <option value="fill_blank">填空</option>
          </select>
          <select className="rounded-lg border px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">全部状态</option>
            <option value="active">active</option>
            <option value="draft">draft</option>
            <option value="disabled">disabled</option>
          </select>
        </div>
        <div className="mt-3 flex gap-3">
          <input className="flex-1 rounded-lg border px-3 py-2 text-sm" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="按题干关键词搜索" />
          <button onClick={() => loadQuestions(selectedId || undefined)} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary">查询</button>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[520px_minmax(0,1fr)] items-stretch">
        <section className="h-[980px] overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-black text-on-surface">题目列表</h3>
            <div className="text-sm text-on-surface-variant">{questions.length} 道</div>
          </div>
          <div className="h-[calc(980px-64px)] overflow-y-auto space-y-3 pr-1">
            {questions.map((row) => (
              <button
                key={row.id}
                onClick={() => openQuestion(row.id)}
                className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${selectedId === row.id ? 'border-primary bg-primary/5' : 'border-outline-variant/20 bg-surface hover:bg-surface-container-low'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-black text-on-surface">{questionTypeLabel(row.questionType)}</div>
                  <div className="text-xs text-on-surface-variant">{row.status || '-'}</div>
                </div>
                <div className="mt-2 text-sm leading-6 text-on-surface">{summarizeStem(row.stem)}</div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-on-surface-variant">
                  <span>{row.bookVersion}</span>
                  <span>{row.grade}</span>
                  <span>{row.semester}</span>
                  <span>{row.unitCode || '-'}</span>
                  <span>{row.sourceFile || '-'}</span>
                </div>
              </button>
            ))}
            {!questions.length && !loading ? <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-on-surface-variant">当前筛选条件下没有题目。</div> : null}
          </div>
        </section>

        <section className="h-[980px] overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5">
          {!detail ? (
            <div className="flex min-h-[480px] items-center justify-center text-sm text-on-surface-variant">选择左侧题目后可查看并编辑详情。</div>
          ) : (
            <div className="h-full overflow-y-auto space-y-5 pr-1">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-black tracking-[0.18em] text-primary">QUESTION DETAIL</div>
                  <h3 className="mt-2 text-xl font-black text-on-surface">{detail.questionUid}</h3>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-on-surface-variant">
                    <span>{questionTypeLabel(detail.questionType)}</span>
                    <span>{detail.groupUid ? `组 ${detail.groupUid}` : '独立题'}</span>
                    <span>{prettyTime(detail.updatedAt)}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openQuestion(detail.id)} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold"><Eye className="h-4 w-4" />重载</button>
                  <button onClick={removeQuestion} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-bold text-red-700"><Trash2 className="h-4 w-4" />删除</button>
                  <button onClick={saveQuestion} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary"><Save className="h-4 w-4" />{saving ? '保存中...' : '保存'}</button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <input className="rounded-lg border px-3 py-2 text-sm" value={draft.bookVersion} onChange={(e) => updateDraft('bookVersion', e.target.value)} placeholder="教材版本" />
                <input className="rounded-lg border px-3 py-2 text-sm" value={draft.grade} onChange={(e) => updateDraft('grade', e.target.value)} placeholder="年级" />
                <input className="rounded-lg border px-3 py-2 text-sm" value={draft.semester} onChange={(e) => updateDraft('semester', e.target.value)} placeholder="学期" />
                <input className="rounded-lg border px-3 py-2 text-sm" value={draft.unitCode} onChange={(e) => updateDraft('unitCode', e.target.value)} placeholder="单元" />
                <input className="rounded-lg border px-3 py-2 text-sm" value={draft.examScene} onChange={(e) => updateDraft('examScene', e.target.value)} placeholder="场景" />
                <input className="rounded-lg border px-3 py-2 text-sm" value={draft.difficulty} onChange={(e) => updateDraft('difficulty', e.target.value)} placeholder="难度" />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <select className="rounded-lg border px-3 py-2 text-sm" value={draft.status} onChange={(e) => updateDraft('status', e.target.value)}>
                  <option value="active">active</option>
                  <option value="draft">draft</option>
                  <option value="disabled">disabled</option>
                </select>
                <textarea className="min-h-[42px] rounded-lg border px-3 py-2 text-sm" value={draft.remarks} onChange={(e) => updateDraft('remarks', e.target.value)} placeholder="备注" />
              </div>

              <div>
                <div className="mb-2 text-sm font-black text-on-surface">题干</div>
                <textarea className="min-h-[110px] w-full rounded-xl border px-3 py-3 text-sm" value={draft.stem} onChange={(e) => updateDraft('stem', e.target.value)} />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div>
                  <div className="mb-2 text-sm font-black text-on-surface">共享题干</div>
                  <textarea className="min-h-[120px] w-full rounded-xl border px-3 py-3 text-sm" value={draft.sharedStem} onChange={(e) => updateDraft('sharedStem', e.target.value)} />
                </div>
                <div>
                  <div className="mb-2 text-sm font-black text-on-surface">材料</div>
                  <textarea className="min-h-[120px] w-full rounded-xl border px-3 py-3 text-sm" value={draft.material} onChange={(e) => updateDraft('material', e.target.value)} />
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div>
                  <div className="mb-2 text-sm font-black text-on-surface">答案 JSON / 文本</div>
                  <textarea className="min-h-[140px] w-full rounded-xl border px-3 py-3 font-mono text-sm" value={draft.answerText} onChange={(e) => updateDraft('answerText', e.target.value)} />
                </div>
                <div>
                  <div className="mb-2 text-sm font-black text-on-surface">知识标签 JSON</div>
                  <textarea className="min-h-[140px] w-full rounded-xl border px-3 py-3 font-mono text-sm" value={draft.knowledgeTagsText} onChange={(e) => updateDraft('knowledgeTagsText', e.target.value)} />
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-black text-on-surface">解析</div>
                <textarea className="min-h-[120px] w-full rounded-xl border px-3 py-3 text-sm" value={draft.analysis} onChange={(e) => updateDraft('analysis', e.target.value)} />
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-black text-on-surface">选项</div>
                  <button onClick={addOption} className="rounded-lg border px-3 py-1.5 text-sm font-bold">新增选项</button>
                </div>
                <div className="space-y-3">
                  {draft.options.map((item, index) => (
                    <div key={`${detail.id}-option-${index}`} className="grid gap-3 rounded-xl border border-outline-variant/20 bg-surface px-4 py-3 md:grid-cols-[100px_minmax(0,1fr)_90px]">
                      <input className="rounded-lg border px-3 py-2 text-sm" value={item.key} onChange={(e) => updateOption(index, 'key', e.target.value)} placeholder="A" />
                      <input className="rounded-lg border px-3 py-2 text-sm" value={item.text} onChange={(e) => updateOption(index, 'text', e.target.value)} placeholder="选项内容" />
                      <button onClick={() => removeOption(index)} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-700">删除</button>
                    </div>
                  ))}
                  {draft.options.length === 0 ? <div className="text-sm text-on-surface-variant">当前题目没有选项。</div> : null}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
