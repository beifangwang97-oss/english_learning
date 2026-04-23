import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, FileText, Plus, Printer, RefreshCw, Replace, Save, Trash2, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  AdminStore,
  adminStoreApi,
  authApi,
  TeacherExamPaperDetail,
  TeacherExamPaperGenerateRequest,
  TeacherExamPaperListItem,
  TeacherExamQuestionCandidate,
  teacherExamPaperApi,
} from '../../lib/auth';
import { lexiconApi, normalizeTextbookPermissionToAvailable, TextbookScopeBookRow } from '../../lib/lexicon';
import { getSessionToken } from '../../lib/session';

type SectionDraft = {
  questionType: string;
  count: number;
};

type ReplaceState = {
  open: boolean;
  sectionId?: number;
  itemId?: number;
  questionType?: string;
  itemType?: 'question' | 'group';
  currentQuestionId?: number | null;
  currentGroupId?: number | null;
};

const QUESTION_TYPE_OPTIONS = [
  { value: 'single_choice', label: '单项选择' },
  { value: 'multiple_choice', label: '多项选择' },
  { value: 'cloze', label: '完形填空' },
  { value: 'reading', label: '阅读理解' },
  { value: 'seven_choice', label: '七选五' },
];

function questionTypeLabel(value?: string) {
  return QUESTION_TYPE_OPTIONS.find((row) => row.value === value)?.label || value || '-';
}

function normalizeSemester(value?: string) {
  const text = (value || '').trim();
  if (!text) return '';
  const compact = text.replace(/\s+/g, '');
  if (compact.includes('上')) return '上册';
  if (compact.includes('下')) return '下册';
  return text;
}

function normalizeUnitCode(value?: string) {
  const text = (value || '').trim();
  if (!text) return '';
  const compact = text.replace(/\s+/g, '');
  if (/^unit\d+[a-zA-Z]?$/i.test(compact)) return `Unit ${compact.slice(4)}`;
  return text;
}

function normalizeBookVersion(value?: string) {
  const text = (value || '').trim();
  if (!text) return '';
  const compact = text.replace(/\s+/g, '');
  if (/^pep$/i.test(compact) || compact.includes('人教')) return '人教版初中';
  return text;
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

function defaultTitle() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()} 教师试卷`;
}

function answerText(value: any) {
  if (value == null) return '-';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function plainText(value?: string | null) {
  return (value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function toRoman(index: number) {
  const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  return romans[index] || String(index + 1);
}

function buildPrintHtml(detail: TeacherExamPaperDetail, showAnswers: boolean) {
  const sectionsHtml = detail.sections
    .map((section) => {
      let counter = 0;
      const itemsHtml = section.items
        .map((item) => {
          const snapshot = item.snapshot || {};
          if (item.itemType === 'group') {
            const questions = Array.isArray(snapshot.questions) ? snapshot.questions : [];
            const block = `
              ${snapshot.sharedStem ? `<div class="note"><strong>共享题干：</strong>${plainText(snapshot.sharedStem)}</div>` : ''}
              ${snapshot.material ? `<div class="note"><strong>材料：</strong>${plainText(snapshot.material)}</div>` : ''}
              ${questions
                .map((question: any) => {
                  counter += 1;
                  return `
                    <div class="question">
                      <div class="stem">${counter}. ${plainText(question.stem || '')}</div>
                      ${(Array.isArray(question.options) ? question.options : [])
                        .map((option: any) => `<div class="option">${option.key}. ${plainText(option.text || '')}</div>`)
                        .join('')}
                      ${showAnswers ? `<div class="answer">答案：${answerText(question.answer)}<br/>解析：${plainText(question.analysis || '') || '-'}</div>` : ''}
                    </div>
                  `;
                })
                .join('')}
            `;
            return `<div class="group-card">${block}</div>`;
          }
          counter += 1;
          return `
            <div class="question">
              ${snapshot.sharedStem ? `<div class="note"><strong>共享题干：</strong>${plainText(snapshot.sharedStem)}</div>` : ''}
              ${snapshot.material ? `<div class="note"><strong>材料：</strong>${plainText(snapshot.material)}</div>` : ''}
              <div class="stem">${counter}. ${plainText(snapshot.stem || '')}</div>
              ${(Array.isArray(snapshot.options) ? snapshot.options : [])
                .map((option: any) => `<div class="option">${option.key}. ${plainText(option.text || '')}</div>`)
                .join('')}
              ${showAnswers ? `<div class="answer">答案：${answerText(snapshot.answer)}<br/>解析：${plainText(snapshot.analysis || '') || '-'}</div>` : ''}
            </div>
          `;
        })
        .join('');
      return `<section><h2>${section.sectionTitle} ${questionTypeLabel(section.questionType)}</h2>${itemsHtml}</section>`;
    })
    .join('');

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${detail.title}</title>
        <style>
          body { font-family: "Microsoft YaHei", sans-serif; color: #111827; margin: 24px; line-height: 1.7; }
          h1 { font-size: 28px; margin: 0 0 8px; }
          h2 { font-size: 18px; margin: 24px 0 12px; }
          .meta { color: #6b7280; font-size: 12px; margin-bottom: 16px; }
          .question, .group-card { margin-bottom: 16px; }
          .stem { font-weight: 700; }
          .option { margin-left: 18px; }
          .note { padding: 8px 10px; background: #f3f4f6; border-radius: 8px; margin-bottom: 8px; }
          .answer { padding: 8px 10px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; margin-top: 8px; white-space: pre-wrap; }
        </style>
      </head>
      <body>
        <h1>${detail.title}</h1>
        <div class="meta">${[detail.bookVersion, detail.grade, detail.semester, detail.unitCode].filter(Boolean).join(' / ')}</div>
        ${sectionsHtml}
        <script>window.onload = () => window.print();</script>
      </body>
    </html>
  `;
}

export const TeacherExamPaperManagement: React.FC = () => {
  const { user } = useAuth();
  const token = useMemo(() => getSessionToken(), []);

  const [storeCode, setStoreCode] = useState('UNASSIGNED');
  const [scopeTree, setScopeTree] = useState<TextbookScopeBookRow[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [papers, setPapers] = useState<TeacherExamPaperListItem[]>([]);
  const [selectedPaperId, setSelectedPaperId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TeacherExamPaperDetail | null>(null);
  const [showAnswers, setShowAnswers] = useState(false);

  const [title, setTitle] = useState(defaultTitle());
  const [bookVersion, setBookVersion] = useState('');
  const [grade, setGrade] = useState('');
  const [semester, setSemester] = useState('');
  const [unitCode, setUnitCode] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [knowledgeTag, setKnowledgeTag] = useState('');
  const [sections, setSections] = useState<SectionDraft[]>([
    { questionType: 'single_choice', count: 10 },
    { questionType: 'reading', count: 2 },
  ]);

  const [replaceState, setReplaceState] = useState<ReplaceState>({ open: false });
  const [candidateKeyword, setCandidateKeyword] = useState('');
  const [candidates, setCandidates] = useState<TeacherExamQuestionCandidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [savingTitle, setSavingTitle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const gradeOptions = useMemo(() => {
    if (!bookVersion) return [];
    const book = scopeTree.find((row) => row.bookVersion === bookVersion);
    return (book?.grades || []).map((row) => row.grade);
  }, [bookVersion, scopeTree]);

  const semesterOptions = useMemo(() => {
    if (!bookVersion || !grade) return [];
    const book = scopeTree.find((row) => row.bookVersion === bookVersion);
    const gradeNode = (book?.grades || []).find((row) => row.grade === grade);
    return gradeNode?.semesters || [];
  }, [bookVersion, grade, scopeTree]);

  const syncFormFromDetail = (paper: TeacherExamPaperDetail) => {
    setTitle(paper.title || defaultTitle());
    setBookVersion(paper.bookVersion || '');
    setGrade(paper.grade || '');
    setSemester(paper.semester || '');
    setUnitCode(paper.unitCode || '');
    setDifficulty(paper.difficulty || '');
    const tags = Array.isArray(paper.knowledgeTags) ? paper.knowledgeTags.filter(Boolean).join(', ') : '';
    setKnowledgeTag(tags);
    if (paper.sections.length > 0) {
      setSections(
        paper.sections.map((section) => ({
          questionType: section.questionType,
          count: Math.max(section.requestedCount || section.actualCount || 1, 1),
        })),
      );
    }
  };

  const loadPaperDetail = async (paperId: number) => {
    if (!token) return;
    const payload = await teacherExamPaperApi.getDetail(token, paperId);
    setSelectedPaperId(payload.id);
    setDetail(payload);
    syncFormFromDetail(payload);
  };

  const loadPapers = async (resolvedStoreCode: string, preferredPaperId?: number | null) => {
    if (!token || !user?.id) return;
    const rows = await teacherExamPaperApi.list(token, Number(user.id), resolvedStoreCode);
    setPapers(rows);
    if (rows.length === 0) {
      setSelectedPaperId(null);
      setDetail(null);
      return;
    }
    const targetId =
      preferredPaperId && rows.some((row) => row.id === preferredPaperId)
        ? preferredPaperId
        : selectedPaperId && rows.some((row) => row.id === selectedPaperId)
          ? selectedPaperId
          : rows[0].id;
    if (targetId) {
      await loadPaperDetail(targetId);
    }
  };

  const loadData = async () => {
    if (!token || !user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const [latestUser, stores, textbookScopes] = await Promise.all([
        authApi.getCurrentUser(token),
        adminStoreApi.getAllStores(token),
        lexiconApi.getTextbookScopes(token),
      ]);
      const resolvedStoreCode = resolveStoreCode(latestUser.storeName || user?.storeName, stores);
      setStoreCode(resolvedStoreCode);

      const availableBooks = Array.from(new Set((textbookScopes.tree || []).map((row) => row.bookVersion).filter(Boolean)));
      const currentStore = stores.find((row) => row.storeCode === resolvedStoreCode);
      const allowedBooks = (currentStore?.textbookPermissions || [])
        .map((permission) => normalizeTextbookPermissionToAvailable(permission, availableBooks))
        .filter(Boolean);
      const filteredTree = (textbookScopes.tree || []).filter((row) => allowedBooks.length === 0 || allowedBooks.includes(row.bookVersion));
      setScopeTree(filteredTree);

      if (!bookVersion && filteredTree[0]?.bookVersion) {
        setBookVersion(filteredTree[0].bookVersion);
      }

      await loadPapers(resolvedStoreCode, selectedPaperId);
    } catch (e: any) {
      setError(e?.message || '加载教师试卷数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token, user?.id, user?.storeName]);

  useEffect(() => {
    const loadUnits = async () => {
      if (!token || !bookVersion || !grade || !semester) {
        setUnits([]);
        return;
      }
      try {
        const payload = await lexiconApi.getItems(token, 'word', bookVersion, grade, semester);
        setUnits(Array.from(new Set((payload.items || []).map((item) => item.unit).filter(Boolean))));
      } catch {
        setUnits([]);
      }
    };
    loadUnits();
  }, [token, bookVersion, grade, semester]);

  const updateSection = (index: number, patch: Partial<SectionDraft>) => {
    setSections((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    setSections((prev) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const clone = [...prev];
      [clone[index], clone[nextIndex]] = [clone[nextIndex], clone[index]];
      return clone;
    });
  };

  const addSection = () => {
    setSections((prev) => [...prev, { questionType: '', count: 1 }]);
  };

  const removeSection = (index: number) => {
    setSections((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const handleGenerate = async () => {
    if (!token || !user?.id) return;
    const request: TeacherExamPaperGenerateRequest = {
      createdBy: Number(user.id),
      storeCode,
      title,
      bookVersion: normalizeBookVersion(bookVersion) || undefined,
      grade: grade || undefined,
      semester: normalizeSemester(semester) || undefined,
      unitCode: normalizeUnitCode(unitCode) || undefined,
      difficulty: difficulty || undefined,
      knowledgeTag: knowledgeTag || undefined,
      sections: sections
        .map((row, index) => ({
          sectionTitle: `第${index + 1}部分`,
          questionType: row.questionType.trim(),
          count: Number(row.count),
        }))
        .filter((row) => row.questionType && row.count > 0),
    };
    if (request.sections.length === 0) {
      setError('请至少配置一个有效的大题。');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const created = await teacherExamPaperApi.generate(token, request);
      setSelectedPaperId(created.id);
      setDetail(created);
      syncFormFromDetail(created);
      await loadPapers(storeCode, created.id);
      setMessage('试卷生成成功。');
      window.setTimeout(() => setMessage(null), 2000);
    } catch (e: any) {
      setError(e?.message || '生成试卷失败');
    } finally {
      setGenerating(false);
    }
  };

  const openReplace = async (
    sectionId: number,
    itemId: number,
    questionType: string,
    itemType: 'question' | 'group',
    currentQuestionId?: number | null,
    currentGroupId?: number | null,
  ) => {
    setReplaceState({ open: true, sectionId, itemId, questionType, itemType, currentQuestionId, currentGroupId });
    setCandidateKeyword('');
    setCandidates([]);
    setLoadingCandidates(true);
    try {
      const rows = await teacherExamPaperApi.getCandidates(token, {
        bookVersion: detail?.bookVersion,
        grade: detail?.grade,
        semester: detail?.semester,
        unitCode: detail?.unitCode,
        difficulty: detail?.difficulty,
        knowledgeTag,
        questionType,
        currentQuestionId: currentQuestionId || undefined,
        currentGroupId: currentGroupId || undefined,
        limit: 50,
      });
      setCandidates(rows.filter((row) => row.itemType === itemType));
    } catch (e: any) {
      setError(e?.message || '加载替换候选失败');
    } finally {
      setLoadingCandidates(false);
    }
  };

  const searchCandidates = async () => {
    if (!replaceState.questionType) return;
    setLoadingCandidates(true);
    try {
      const rows = await teacherExamPaperApi.getCandidates(token, {
        bookVersion: detail?.bookVersion,
        grade: detail?.grade,
        semester: detail?.semester,
        unitCode: detail?.unitCode,
        difficulty: detail?.difficulty,
        knowledgeTag,
        questionType: replaceState.questionType,
        currentQuestionId: replaceState.currentQuestionId || undefined,
        currentGroupId: replaceState.currentGroupId || undefined,
        keyword: candidateKeyword || undefined,
        limit: 50,
      });
      setCandidates(rows.filter((row) => row.itemType === replaceState.itemType));
    } catch (e: any) {
      setError(e?.message || '搜索替换候选失败');
    } finally {
      setLoadingCandidates(false);
    }
  };

  const confirmReplace = async (candidate: TeacherExamQuestionCandidate) => {
    if (!token || !detail || !replaceState.sectionId || !replaceState.itemId) return;
    try {
      const next = await teacherExamPaperApi.replaceItem(token, detail.id, replaceState.sectionId, replaceState.itemId, {
        questionId: candidate.questionId || undefined,
        groupId: candidate.groupId || undefined,
      });
      setDetail(next);
      setReplaceState({ open: false });
      await loadPapers(storeCode, next.id);
      setMessage('题目已替换。');
      window.setTimeout(() => setMessage(null), 2000);
    } catch (e: any) {
      setError(e?.message || '替换题目失败');
    }
  };

  const handleDeleteItem = async (sectionId: number, itemId: number) => {
    if (!token || !detail) return;
    try {
      const next = await teacherExamPaperApi.deleteItem(token, detail.id, sectionId, itemId);
      setDetail(next);
      await loadPapers(storeCode, next.id);
      setMessage('题目已删除。');
      window.setTimeout(() => setMessage(null), 2000);
    } catch (e: any) {
      setError(e?.message || '删除题目失败');
    }
  };

  const handleSaveTitle = async () => {
    if (!token || !detail) return;
    setSavingTitle(true);
    try {
      const next = await teacherExamPaperApi.update(token, detail.id, { title });
      setDetail(next);
      await loadPapers(storeCode, next.id);
      setMessage('试卷标题已保存。');
      window.setTimeout(() => setMessage(null), 2000);
    } catch (e: any) {
      setError(e?.message || '保存标题失败');
    } finally {
      setSavingTitle(false);
    }
  };

  const handleDeletePaper = async (paperId: number) => {
    if (!token) return;
    try {
      await teacherExamPaperApi.deleteOne(token, paperId);
      if (selectedPaperId === paperId) {
        setSelectedPaperId(null);
        setDetail(null);
      }
      await loadPapers(storeCode, null);
      setMessage('试卷已删除。');
      window.setTimeout(() => setMessage(null), 2000);
    } catch (e: any) {
      setError(e?.message || '删除试卷失败');
    }
  };

  const printPaper = (withAnswers: boolean) => {
    if (!detail) return;
    const win = window.open('', '_blank', 'width=1200,height=800');
    if (!win) return;
    win.document.write(buildPrintHtml(detail, withAnswers));
    win.document.close();
  };

  return (
    <div className="mx-auto w-full max-w-[110rem] animate-in fade-in p-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="mb-2 flex items-center gap-3 text-3xl font-black text-on-background">
            <FileText className="h-8 w-8 text-primary" />
            试卷管理
          </h2>
          <p className="text-on-surface-variant">
            教师可按题型与范围组卷，并在右侧直接预览、替换、删除和导出试卷。
          </p>
        </div>
        <button onClick={loadData} className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/30 px-4 py-2 text-sm font-bold">
          <RefreshCw className="h-4 w-4" />
          刷新
        </button>
      </header>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
      {message && <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">{message}</div>}

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[420px_minmax(0,1fr)_320px]">
        <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
          <div className="border-b border-outline-variant/20 p-5">
            <h3 className="text-xl font-bold">组卷设置</h3>
          </div>
          <div className="space-y-4 p-5">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="试卷标题" className="w-full rounded-xl border border-outline-variant/30 px-3 py-2" />
            <div className="grid grid-cols-2 gap-3">
              <select value={bookVersion} onChange={(e) => { setBookVersion(e.target.value); setGrade(''); setSemester(''); setUnitCode(''); }} className="rounded-xl border border-outline-variant/30 px-3 py-2 text-sm">
                <option value="">教材版本</option>
                {scopeTree.map((row) => <option key={row.bookVersion} value={row.bookVersion}>{row.bookVersion}</option>)}
              </select>
              <select value={grade} onChange={(e) => { setGrade(e.target.value); setSemester(''); setUnitCode(''); }} className="rounded-xl border border-outline-variant/30 px-3 py-2 text-sm">
                <option value="">年级</option>
                {gradeOptions.map((row) => <option key={row} value={row}>{row}</option>)}
              </select>
              <select value={semester} onChange={(e) => { setSemester(e.target.value); setUnitCode(''); }} className="rounded-xl border border-outline-variant/30 px-3 py-2 text-sm">
                <option value="">册别</option>
                {semesterOptions.map((row) => <option key={row} value={row}>{row}</option>)}
              </select>
              <select value={unitCode} onChange={(e) => setUnitCode(e.target.value)} className="rounded-xl border border-outline-variant/30 px-3 py-2 text-sm">
                <option value="">单元</option>
                {units.map((row) => <option key={row} value={row}>{row}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input value={difficulty} onChange={(e) => setDifficulty(e.target.value)} placeholder="难度（可留空）" className="rounded-xl border border-outline-variant/30 px-3 py-2 text-sm" />
              <input value={knowledgeTag} onChange={(e) => setKnowledgeTag(e.target.value)} placeholder="知识点（可留空）" className="rounded-xl border border-outline-variant/30 px-3 py-2 text-sm" />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold">大题结构</h4>
                <button onClick={addSection} className="inline-flex items-center gap-1 text-sm font-bold text-primary">
                  <Plus className="h-4 w-4" />
                  添加部分
                </button>
              </div>
              {sections.map((section, index) => (
                <div key={`${index}-${section.questionType}`} className="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-[0.28em] text-primary">Part {toRoman(index)}</div>
                      <div className="text-sm text-on-surface-variant">第 {index + 1} 部分</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => moveSection(index, -1)} disabled={index === 0} className="rounded-lg border border-outline-variant/30 p-2 disabled:opacity-40">
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button onClick={() => moveSection(index, 1)} disabled={index === sections.length - 1} className="rounded-lg border border-outline-variant/30 p-2 disabled:opacity-40">
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button onClick={() => removeSection(index)} disabled={sections.length <= 1} className="rounded-lg border border-red-200 p-2 text-red-600 disabled:opacity-40">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <select value={section.questionType} onChange={(e) => updateSection(index, { questionType: e.target.value })} className="w-full rounded-lg border border-outline-variant/30 px-3 py-2 text-sm">
                      <option value="">选择题型</option>
                      {QUESTION_TYPE_OPTIONS.map((row) => (
                        <option key={row.value} value={row.value}>{row.label}</option>
                      ))}
                    </select>
                    <input type="number" min={1} value={section.count} onChange={(e) => updateSection(index, { count: Math.max(Number(e.target.value) || 1, 1) })} className="w-full rounded-lg border border-outline-variant/30 px-3 py-2 text-sm" />
                  </div>
                </div>
              ))}
            </div>

            <button onClick={handleGenerate} disabled={generating || loading} className="w-full rounded-xl bg-primary py-3 font-black text-on-primary disabled:opacity-50">
              {generating ? '正在组卷...' : '开始组卷'}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
          <div className="flex items-center justify-between border-b border-outline-variant/20 p-5">
            <div className="min-w-0">
              <h3 className="text-xl font-bold">试卷预览</h3>
              <p className="text-xs text-on-surface-variant">
                {detail ? `${detail.totalSectionCount} 个部分 / ${detail.totalQuestionCount} 道题` : '生成或点击右侧试卷后，可在这里预览并编辑。'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowAnswers((prev) => !prev)} className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/30 px-3 py-2 text-sm font-bold">
                {showAnswers ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {showAnswers ? '隐藏答案' : '显示答案'}
              </button>
              <button onClick={() => printPaper(false)} disabled={!detail} className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/30 px-3 py-2 text-sm font-bold disabled:opacity-40">
                <Printer className="h-4 w-4" />
                PDF 无答案
              </button>
              <button onClick={() => printPaper(true)} disabled={!detail} className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/30 px-3 py-2 text-sm font-bold disabled:opacity-40">
                <Printer className="h-4 w-4" />
                PDF 有答案
              </button>
            </div>
          </div>
          <div className="h-[860px] overflow-y-auto p-6">
            {!detail && !loading && <div className="rounded-2xl bg-surface-container-low p-6 text-sm text-on-surface-variant">当前还没有选中试卷。先在左侧组卷，或点击右侧“我的试卷”载入已有试卷。</div>}
            {detail && (
              <div className="mx-auto max-w-4xl rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
                <div className="mb-8">
                  <div className="flex items-center gap-3">
                    <input value={title} onChange={(e) => setTitle(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 text-2xl font-black text-slate-900" />
                    <button onClick={handleSaveTitle} disabled={savingTitle} className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/30 px-4 py-3 text-sm font-bold disabled:opacity-40">
                      <Save className="h-4 w-4" />
                      保存标题
                    </button>
                  </div>
                  <p className="mt-3 text-sm text-slate-500">{[detail.bookVersion, detail.grade, detail.semester, detail.unitCode].filter(Boolean).join(' / ') || '未设置范围'}</p>
                </div>
                <div className="space-y-8">
                  {detail.sections.map((section) => {
                    let questionIndex = 0;
                    return (
                      <section key={section.id}>
                        <div className="mb-4 rounded-2xl bg-slate-100 px-4 py-3">
                          <h2 className="text-lg font-black text-slate-900">{section.sectionTitle} {questionTypeLabel(section.questionType)}</h2>
                        </div>
                        <div className="space-y-5">
                          {section.items.map((item) => {
                            const snapshot = item.snapshot || {};
                            if (item.itemType === 'group') {
                              const questions = Array.isArray(snapshot.questions) ? snapshot.questions : [];
                              return (
                                <div key={item.id} className="rounded-2xl border border-slate-200 p-5">
                                  <div className="mb-4 flex items-center justify-end gap-2">
                                    <button
                                      onClick={() => openReplace(section.id, item.id, section.questionType, 'group', item.questionId, item.groupId)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/30 px-3 py-1.5 text-xs font-bold text-primary"
                                    >
                                      <Replace className="h-3.5 w-3.5" />
                                      替换
                                    </button>
                                    <button
                                      onClick={() => handleDeleteItem(section.id, item.id)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                      删除
                                    </button>
                                  </div>
                                  {snapshot.sharedStem && <div className="mb-3 rounded-xl bg-slate-100 px-4 py-3 text-sm leading-7 text-slate-700">{snapshot.sharedStem}</div>}
                                  {snapshot.material && <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-7 text-slate-700">{snapshot.material}</div>}
                                  <div className="space-y-4">
                                    {questions.map((question: any, index: number) => {
                                      questionIndex += 1;
                                      return (
                                        <div key={`${item.id}-${index}`} className="rounded-xl border border-slate-100 p-4">
                                          <div className="mb-2 text-sm font-bold leading-7 text-slate-900">{questionIndex}. {question.stem}</div>
                                          {Array.isArray(question.options) && question.options.length > 0 && (
                                            <div className="space-y-1 text-sm leading-7 text-slate-700">
                                              {question.options.map((option: any, optionIndex: number) => (
                                                <div key={`${item.id}-${index}-${optionIndex}`}>{option.key}. {option.text}</div>
                                              ))}
                                            </div>
                                          )}
                                          {showAnswers && (
                                            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-7 text-emerald-900">
                                              <div><strong>答案：</strong>{answerText(question.answer)}</div>
                                              <div><strong>解析：</strong>{question.analysis || '-'}</div>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            }
                            questionIndex += 1;
                            return (
                              <div key={item.id} className="rounded-2xl border border-slate-200 p-5">
                                <div className="mb-3 flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => openReplace(section.id, item.id, section.questionType, 'question', item.questionId, item.groupId)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/30 px-3 py-1.5 text-xs font-bold text-primary"
                                  >
                                    <Replace className="h-3.5 w-3.5" />
                                    替换
                                  </button>
                                  <button
                                    onClick={() => handleDeleteItem(section.id, item.id)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    删除
                                  </button>
                                </div>
                                {snapshot.sharedStem && <div className="mb-3 rounded-xl bg-slate-100 px-4 py-3 text-sm leading-7 text-slate-700">{snapshot.sharedStem}</div>}
                                {snapshot.material && <div className="mb-3 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-7 text-slate-700">{snapshot.material}</div>}
                                <div className="text-sm font-bold leading-7 text-slate-900">{questionIndex}. {snapshot.stem}</div>
                                {Array.isArray(snapshot.options) && snapshot.options.length > 0 && (
                                  <div className="mt-2 space-y-1 text-sm leading-7 text-slate-700">
                                    {snapshot.options.map((option: any, optionIndex: number) => (
                                      <div key={`${item.id}-${optionIndex}`}>{option.key}. {option.text}</div>
                                    ))}
                                  </div>
                                )}
                                {showAnswers && (
                                  <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-7 text-emerald-900">
                                    <div><strong>答案：</strong>{answerText(snapshot.answer)}</div>
                                    <div><strong>解析：</strong>{snapshot.analysis || '-'}</div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
          <div className="border-b border-outline-variant/20 p-5">
            <h3 className="text-xl font-bold">我的试卷</h3>
          </div>
          <div className="h-[860px] space-y-3 overflow-y-auto p-4">
            {papers.map((paper) => {
              const active = selectedPaperId === paper.id;
              return (
                <div key={paper.id} className={`rounded-2xl border p-4 transition-all ${active ? 'border-primary bg-primary-container/15' : 'border-outline-variant/20 hover:bg-surface-container-low'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <button onClick={() => loadPaperDetail(paper.id)} className="flex-1 text-left">
                      <div className="font-bold text-on-surface">{paper.title}</div>
                      <div className="mt-1 text-xs text-on-surface-variant">{[paper.bookVersion, paper.grade, paper.semester, paper.unitCode].filter(Boolean).join(' / ') || '未设置范围'}</div>
                      <div className="mt-2 text-xs text-on-surface-variant">{paper.totalSectionCount} 个部分 / {paper.totalQuestionCount} 道题</div>
                    </button>
                    <button onClick={() => handleDeletePaper(paper.id)} className="rounded-lg p-2 text-red-600 hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
            {!loading && papers.length === 0 && <div className="rounded-2xl bg-surface-container-low p-4 text-sm text-on-surface-variant">当前还没有生成过试卷。</div>}
          </div>
        </section>
      </div>

      {replaceState.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-3xl rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h4 className="text-lg font-black text-slate-900">替换题目</h4>
                <p className="text-xs text-slate-500">{questionTypeLabel(replaceState.questionType)}</p>
              </div>
              <button onClick={() => setReplaceState({ open: false })} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 p-6">
              <div className="flex gap-3">
                <input value={candidateKeyword} onChange={(e) => setCandidateKeyword(e.target.value)} placeholder="按题干关键字搜索候选题" className="flex-1 rounded-xl border border-slate-200 px-3 py-2" />
                <button onClick={searchCandidates} className="rounded-xl bg-primary px-4 py-2 font-bold text-on-primary">搜索</button>
              </div>
              <div className="max-h-[420px] space-y-3 overflow-y-auto">
                {loadingCandidates && <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">正在加载候选题...</div>}
                {!loadingCandidates && candidates.map((candidate, index) => (
                  <div key={`${candidate.itemType}-${candidate.groupId || candidate.questionId || index}`} className="rounded-2xl border border-slate-200 p-4">
                    <div className="mb-2 text-sm font-bold text-slate-900">{candidate.label || candidate.stem || `候选题 ${index + 1}`}</div>
                    {candidate.sharedStem && <div className="mb-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{candidate.sharedStem}</div>}
                    {candidate.material && <div className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-slate-700">{candidate.material}</div>}
                    <div className="text-xs text-slate-500">{[candidate.bookVersion, candidate.grade, candidate.semester, candidate.unitCode].filter(Boolean).join(' / ')}</div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-500">{candidate.itemType === 'group' ? `${candidate.questionCount || 0} 道题` : '单题'}</span>
                      <button onClick={() => confirmReplace(candidate)} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-on-primary">替换为这道题</button>
                    </div>
                  </div>
                ))}
                {!loadingCandidates && candidates.length === 0 && <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">没有找到符合条件的候选题。</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
