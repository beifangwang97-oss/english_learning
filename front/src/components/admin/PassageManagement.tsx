import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Save, Trash2, Upload, X } from 'lucide-react';
import { PassageItem, TextbookScopeBookRow, lexiconApi } from '../../lib/lexicon';
import { getSessionToken } from '../../lib/session';

type ImportStatus = 'invalid' | 'checking' | 'unchecked' | 'exists' | 'ready' | 'importing' | 'success' | 'failed';
type ImportRow = {
  id: string;
  file: File;
  fileName: string;
  bookVersion: string;
  grade: string;
  semester: string;
  count: number;
  status: ImportStatus;
  note?: string;
};

const sortUnit = (a: string, b: string) => {
  const an = Number((a || '').replace(/[^\d]/g, ''));
  const bn = Number((b || '').replace(/[^\d]/g, ''));
  if (an && bn) return an - bn;
  return a.localeCompare(b, 'zh-CN');
};

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const normalizeSemester = (semester: string) => {
  const s = (semester || '').trim();
  if (s === '\u5168\u518c' || s === '\u5168\u4e00\u518c') return '\u5168\u518c';
  if (s.includes('\u5168') && s.includes('\u518c')) return '\u5168\u518c';
  return s;
};

const parseFileMeta = (fileName: string) => {
  const base = fileName.replace(/\.jsonl$/i, '');
  const parts = base.split('_');
  const p3 = (parts[3] || '');
  return {
    bookVersion: (parts[0] || '').trim(),
    grade: (parts[1] || '').trim(),
    semester: normalizeSemester((parts[2] || '').trim()),
    isPassage: p3.includes('\u8bfe\u6587\u8868') || p3.includes('\u8bfe\u6587'),
  };
};

const statusLabel: Record<ImportStatus, string> = {
  invalid: '\u65e0\u6548',
  checking: '\u68c0\u67e5\u4e2d',
  unchecked: '\u672a\u68c0\u67e5',
  exists: '\u5df2\u5b58\u5728',
  ready: '\u53ef\u5bfc\u5165',
  importing: '\u5bfc\u5165\u4e2d',
  success: '\u6210\u529f',
  failed: '\u5931\u8d25',
};

const clonePassage = (x: PassageItem): PassageItem => JSON.parse(JSON.stringify(x));

export const PassageManagement: React.FC = () => {
  const token = useMemo(() => getSessionToken(), []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingScope, setDeletingScope] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [bookVersions, setBookVersions] = useState<string[]>([]);
  const [grades, setGrades] = useState<string[]>([]);
  const [semesters, setSemesters] = useState<string[]>([]);
  const [textbookTree, setTextbookTree] = useState<TextbookScopeBookRow[]>([]);
  const [selectedBookVersion, setSelectedBookVersion] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('');
  const [selectedSemester, setSelectedSemester] = useState('');

  const [items, setItems] = useState<PassageItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [editing, setEditing] = useState<PassageItem | null>(null);
  const [creating, setCreating] = useState(false);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [checkingImportRows, setCheckingImportRows] = useState(false);
  const [importingBatch, setImportingBatch] = useState(false);

  const scopeMap = useMemo(() => {
    const m = new Map<string, Map<string, string[]>>();
    textbookTree.forEach((book) => {
      const gradeMap = new Map<string, string[]>();
      (book.grades || []).forEach((gradeRow) => {
        gradeMap.set(gradeRow.grade, (gradeRow.semesters || []).map(normalizeSemester));
      });
      m.set(book.bookVersion, gradeMap);
    });
    return m;
  }, [textbookTree]);

  const gradesForSelectedBook = useMemo(() => {
    const fromScope = Array.from(scopeMap.get(selectedBookVersion || '')?.keys() || []);
    return fromScope.length ? fromScope : grades;
  }, [scopeMap, selectedBookVersion, grades]);

  const semestersForSelectedScope = useMemo(() => {
    const fromScope = scopeMap.get(selectedBookVersion || '')?.get(selectedGrade || '') || [];
    return fromScope.length ? fromScope : semesters.map(normalizeSemester);
  }, [scopeMap, selectedBookVersion, selectedGrade, semesters]);

  const units = useMemo(() => Array.from(new Set(items.map((x) => x.unit))).sort(sortUnit), [items]);

  const loadOptions = async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, scopeRes] = await Promise.all([
        lexiconApi.getOptions(token, 'word'),
        lexiconApi.getTextbookScopes(token),
      ]);
      const books = res.bookVersions || [];
      const baseGrades = res.grades || [];
      const baseSemesters = (res.semesters || []).map(normalizeSemester);
      setBookVersions(books);
      setGrades(baseGrades);
      setSemesters(baseSemesters);
      setTextbookTree(scopeRes.tree || []);

      const initialBook = books[0] || '';
      const initialGrades = Array.from((scopeRes.tree || []).find((x) => x.bookVersion === initialBook)?.grades?.map((x) => x.grade) || []);
      const initialGrade = (initialGrades.length ? initialGrades : baseGrades)[0] || '';
      const initialSemesters = (((scopeRes.tree || []).find((x) => x.bookVersion === initialBook)?.grades || []).find((x) => x.grade === initialGrade)?.semesters || []).map(normalizeSemester);
      const initialSemester = (initialSemesters.length ? initialSemesters : baseSemesters)[0] || '';
      setSelectedBookVersion(initialBook);
      setSelectedGrade(initialGrade);
      setSelectedSemester(initialSemester);
    } catch (e: any) {
      setError(e?.message || '\u52a0\u8f7d\u6559\u6750\u9009\u9879\u5931\u8d25');
    } finally {
      setLoading(false);
    }
  };

  const loadItems = async (bookVersion: string, grade: string, semester: string) => {
    if (!bookVersion || !grade || !semester) return;
    setLoading(true);
    setError(null);
    try {
      const res = await lexiconApi.getPassages(token, bookVersion, grade, semester);
      const sorted = (res.items || []).sort((a, b) => {
        const c1 = sortUnit(a.unit, b.unit);
        if (c1 !== 0) return c1;
        const c2 = (a.section || '').localeCompare(b.section || '', 'zh-CN');
        if (c2 !== 0) return c2;
        return (a.label || '').localeCompare(b.label || '', 'zh-CN');
      });
      setItems(sorted);
      const selected = selectedId && sorted.find((x) => x.id === selectedId) ? selectedId : (sorted[0]?.id || '');
      setSelectedId(selected);
      setEditing(selected ? clonePassage(sorted.find((x) => x.id === selected) as PassageItem) : null);
      setCreating(false);
    } catch (e: any) {
      setError(e?.message || '\u52a0\u8f7d\u8bfe\u6587\u5931\u8d25');
      setItems([]);
      setSelectedId('');
      setEditing(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadOptions(); }, []);
  useEffect(() => {
    const scopedGrades = gradesForSelectedBook;
    if (!scopedGrades.length) {
      setSelectedGrade('');
      setSelectedSemester('');
      return;
    }
    if (!scopedGrades.includes(selectedGrade)) {
      setSelectedGrade(scopedGrades[0]);
    }
  }, [gradesForSelectedBook, selectedGrade]);
  useEffect(() => {
    const scopedSemesters = semestersForSelectedScope;
    if (!scopedSemesters.length) {
      setSelectedSemester('');
      return;
    }
    if (!scopedSemesters.includes(selectedSemester)) {
      setSelectedSemester(scopedSemesters[0]);
    }
  }, [semestersForSelectedScope, selectedSemester]);
  useEffect(() => {
    if (selectedBookVersion && selectedGrade && selectedSemester) {
      loadItems(selectedBookVersion, selectedGrade, selectedSemester);
    }
  }, [selectedBookVersion, selectedGrade, selectedSemester]);

  const selectPassage = (id: string) => {
    setSelectedId(id);
    const found = items.find((x) => x.id === id) || null;
    setEditing(found ? clonePassage(found) : null);
    setCreating(false);
  };

  const createEmptyPassage = () => {
    const empty: PassageItem = {
      id: newId(),
      type: 'passage',
      unit: 'Unit 1',
      section: 'A',
      label: '1a',
      target_id: '',
      title: '',
      passage_text: '',
      source_pages: [],
      book_version: selectedBookVersion,
      grade: selectedGrade,
      semester: selectedSemester,
      sentence_count: 1,
      sentences: [{ en: '', zh: '', audio: '', paragraph_no: 1, sentence_no_in_paragraph: 1, newline_after: 2, is_paragraph_end: true }],
    };
    setEditing(empty);
    setSelectedId('');
    setCreating(true);
  };

  const updateEditingField = (patch: Partial<PassageItem>) => {
    setEditing((prev) => prev ? { ...prev, ...patch } : prev);
  };

  const updateSentenceField = (
    idx: number,
    field: 'en' | 'zh' | 'audio' | 'paragraph_no' | 'sentence_no_in_paragraph' | 'newline_after' | 'is_paragraph_end',
    value: string | number | boolean | undefined
  ) => {
    setEditing((prev) => {
      if (!prev) return prev;
      const next = [...prev.sentences];
      next[idx] = { ...next[idx], [field]: value };
      return { ...prev, sentences: next, sentence_count: next.length };
    });
  };

  const addSentence = () => {
    setEditing((prev) => prev ? {
      ...prev,
      sentences: [...prev.sentences, { en: '', zh: '', audio: '', paragraph_no: undefined, sentence_no_in_paragraph: undefined, newline_after: 0, is_paragraph_end: false }],
      sentence_count: prev.sentences.length + 1,
    } : prev);
  };

  const parsePositiveIntOrUndefined = (raw: string) => {
    const x = (raw || '').trim();
    if (!x) return undefined;
    const n = Number(x);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return Math.floor(n);
  };

  const removeSentence = (idx: number) => {
    setEditing((prev) => {
      if (!prev || prev.sentences.length <= 1) return prev;
      const next = prev.sentences.filter((_, i) => i !== idx);
      return { ...prev, sentences: next, sentence_count: next.length };
    });
  };

  const saveEditing = async () => {
    if (!editing) return;
    if (!editing.unit || !editing.section || !editing.label) return setError('\u5355\u5143\u3001\u5206\u533a\u3001\u6807\u7b7e\u4e0d\u80fd\u4e3a\u7a7a');
    if (!editing.passage_text.trim()) return setError('\u8bfe\u6587\u82f1\u6587\u4e0d\u80fd\u4e3a\u7a7a');
    if (!editing.sentences.length) return setError('\u53e5\u5b50\u4e0d\u80fd\u4e3a\u7a7a');
    for (const s of editing.sentences) {
      if (!s.en.trim() || !s.zh.trim()) return setError('\u6bcf\u4e2a\u53e5\u5b50\u7684\u82f1\u6587\u548c\u8bd1\u6587\u90fd\u4e0d\u80fd\u4e3a\u7a7a');
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      if (creating) {
        await lexiconApi.createPassage(token, editing);
        setMessage('\u65b0\u589e\u8bfe\u6587\u6210\u529f');
      } else {
        await lexiconApi.updatePassage(token, editing.id, editing);
        setMessage('\u8bfe\u6587\u5df2\u66f4\u65b0');
      }
      await loadItems(selectedBookVersion, selectedGrade, selectedSemester);
    } catch (e: any) {
      setError(e?.message || '\u4fdd\u5b58\u5931\u8d25');
    } finally {
      setSaving(false);
    }
  };

  const deleteSelected = async () => {
    if (!editing || creating) return;
    const ok = window.confirm('确认删除当前课文？\\n\\nID：' + editing.id);
    if (!ok) return;
    setError(null);
    setMessage(null);
    try {
      await lexiconApi.deletePassage(token, editing.id);
      setMessage('\u8bfe\u6587\u5df2\u5220\u9664');
      await loadItems(selectedBookVersion, selectedGrade, selectedSemester);
    } catch (e: any) {
      setError(e?.message || '\u5220\u9664\u5931\u8d25');
    }
  };

  const deleteScope = async () => {
    if (!selectedBookVersion || !selectedGrade || !selectedSemester) return;
    const preview = await lexiconApi.getPassagesCount(token, selectedBookVersion, selectedGrade, selectedSemester);
    if (preview.count <= 0) {
      setMessage('\u5f53\u524d\u7b5b\u9009\u8303\u56f4\u6ca1\u6709\u8bfe\u6587');
      return;
    }
    const ok = window.confirm('确认删除当前册全部课文？\\n\\n范围：' + selectedBookVersion + ' / ' + selectedGrade + ' / ' + selectedSemester + '\\n将删除：' + preview.count + ' 篇');
    if (!ok) return;
    setDeletingScope(true);
    setError(null);
    setMessage(null);
    try {
      const res = await lexiconApi.deletePassagesByScope(token, selectedBookVersion, selectedGrade, selectedSemester);
      setMessage('\u5220\u9664\u5168\u518c\u6210\u529f\uff1a' + res.count + ' \u7bc7');
      await loadItems(selectedBookVersion, selectedGrade, selectedSemester);
    } catch (e: any) {
      setError(e?.message || '\u5220\u9664\u5931\u8d25');
    } finally {
      setDeletingScope(false);
    }
  };

  const getGradesForBook = (bookVersion: string) => {
    const fromScope = Array.from(scopeMap.get(bookVersion || '')?.keys() || []);
    return fromScope.length ? fromScope : grades;
  };
  const getSemestersForBookGrade = (bookVersion: string, gradeValue: string) => {
    const fromScope = scopeMap.get(bookVersion || '')?.get(gradeValue || '') || [];
    return fromScope.length ? fromScope : semesters.map(normalizeSemester);
  };
  const updateImportRow = (id: string, patch: Partial<ImportRow>) => {
    setImportRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        if (row.status === 'success') return row;
        return { ...row, ...patch, status: 'unchecked', note: undefined };
      })
    );
  };

  const buildImportRows = async (files: File[]) => {
    const rows: ImportRow[] = [];
    for (const file of files) {
      const { bookVersion, grade, semester, isPassage } = parseFileMeta(file.name);
      let count = 0;
      let status: ImportStatus = 'unchecked';
      let note = '';
      if (!bookVersion || !grade || !semester || !isPassage) {
        status = 'invalid';
        note = '\u6587\u4ef6\u540d\u9700\u5305\u542b\u6559\u6750\u7248\u672c_\u5e74\u7ea7_\u518c\u6b21_\u8bfe\u6587\u8868';
      }
      try {
        const text = await file.text();
        const lines = text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
        count = lines.length;
        for (const line of lines) JSON.parse(line);
      } catch {
        status = 'invalid';
        note = 'JSONL \u683c\u5f0f\u9519\u8bef';
      }
      rows.push({ id: newId(), file, fileName: file.name, bookVersion, grade, semester, count, status, note: note || undefined });
    }
    return rows;
  };

  const checkImportRows = async (rows: ImportRow[]) => {
    const hasScopedTuple = (bookVersion: string, gradeValue: string, semesterValue: string) => {
      const gradeRows = scopeMap.get(bookVersion || '');
      if (!gradeRows) return false;
      const semesterRows = gradeRows.get(gradeValue || '');
      if (!semesterRows) return false;
      return semesterRows.includes(normalizeSemester(semesterValue));
    };
    const next = [...rows];
    setCheckingImportRows(true);
    try {
      for (let i = 0; i < next.length; i++) {
        const row = next[i];
        if (row.status === 'invalid' || row.status === 'success') continue;
        if (!bookVersions.includes(row.bookVersion)) {
          next[i] = { ...row, status: 'invalid', note: '\u6559\u6750\u7248\u672c\u4e0d\u5b58\u5728\u6216\u4e0d\u53ef\u7528' };
          continue;
        }
        if (!grades.includes(row.grade)) {
          next[i] = { ...row, status: 'invalid', note: '\u5e74\u7ea7\u4e0d\u5b58\u5728\u6216\u4e0d\u53ef\u7528' };
          continue;
        }
        if (!semesters.map(normalizeSemester).includes(normalizeSemester(row.semester))) {
          next[i] = { ...row, status: 'invalid', note: '\u518c\u6b21\u4e0d\u5b58\u5728\u6216\u4e0d\u53ef\u7528' };
          continue;
        }
        if (!hasScopedTuple(row.bookVersion, row.grade, normalizeSemester(row.semester))) {
          next[i] = { ...row, status: 'invalid', note: '\u6559\u6750\u7248\u672c/\u5e74\u7ea7/\u518c\u6b21\u4e0d\u5728\u6388\u6743\u8303\u56f4' };
          continue;
        }
        if (row.count <= 0) {
          next[i] = { ...row, status: 'invalid', note: '\u6587\u4ef6\u884c\u6570\u65e0\u6548' };
          continue;
        }
        next[i] = { ...row, status: 'checking', note: undefined };
        setImportRows([...next]);
        try {
          const scope = await lexiconApi.getPassagesCount(token, row.bookVersion, row.grade, normalizeSemester(row.semester));
          next[i] = scope.count > 0
            ? { ...row, semester: normalizeSemester(row.semester), status: 'exists', note: '\u6570\u636e\u5e93\u5df2\u5b58\u5728 ' + scope.count + ' \u7bc7\uff0c\u8bf7\u5148\u5220\u9664\u518d\u5bfc\u5165' }
            : { ...row, semester: normalizeSemester(row.semester), status: 'ready', note: undefined };
        } catch (e: any) {
          next[i] = { ...row, status: 'failed', note: e?.message || '\u68c0\u67e5\u5931\u8d25' };
        }
      }
    } finally {
      setCheckingImportRows(false);
    }
    return next;
  };

  const onImportFilesSelected = async (evt: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(evt.target.files || []);
    if (!files.length) return;
    const built = await buildImportRows(files);
    setImportRows(built);
    const checked = await checkImportRows(built);
    setImportRows(checked);
    evt.target.value = '';
  };

  const recheckRows = async () => {
    const checked = await checkImportRows(importRows);
    setImportRows(checked);
  };

  const runBatchImport = async () => {
    if (!importRows.length) return setError('\u8bf7\u5148\u9009\u62e9 JSONL \u6587\u4ef6');
    setError(null);
    setMessage(null);
    const checked = await checkImportRows(importRows);
    setImportRows(checked);
    const hasBlocking = checked.some((x) => x.status === 'invalid' || x.status === 'exists' || x.status === 'failed');
    if (hasBlocking) return setError('\u6709\u6587\u4ef6\u5b58\u5728\u5f02\u5e38\u6216\u51b2\u7a81\uff0c\u8bf7\u5148\u5904\u7406\u540e\u518d\u5bfc\u5165');
    const readyRows = checked.filter((x) => x.status === 'ready');
    if (!readyRows.length) return setError('\u6ca1\u6709\u53ef\u5bfc\u5165\u6587\u4ef6');

    setImportingBatch(true);
    try {
      let success = 0;
      let failed = 0;
      for (const row of readyRows) {
        setImportRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, status: 'importing', note: undefined } : x)));
        try {
          const res = await lexiconApi.importPassageJsonl(token, {
            file: row.file,
            bookVersion: row.bookVersion,
            grade: row.grade,
            semester: normalizeSemester(row.semester),
            overwrite: false,
          });
          success += 1;
          setImportRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, status: 'success', note: '\u5bfc\u5165 ' + res.count + ' \u7bc7' } : x)));
        } catch (e: any) {
          failed += 1;
          setImportRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, status: 'failed', note: e?.message || '\u5bfc\u5165\u5931\u8d25' } : x)));
        }
      }
      setMessage('\u6279\u91cf\u5bfc\u5165\u5b8c\u6210\uff1a\u6210\u529f ' + success + ' \u4e2a\uff0c\u5931\u8d25 ' + failed + ' \u4e2a');
      await loadItems(selectedBookVersion, selectedGrade, selectedSemester);
    } finally {
      setImportingBatch(false);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-2xl font-black">课文管理</h3>
        <select value={selectedBookVersion} onChange={(e) => setSelectedBookVersion(e.target.value)} className="border rounded-lg px-3 py-2 bg-white">{bookVersions.map((v) => <option key={v} value={v}>{v}</option>)}</select>
        <select value={selectedGrade} onChange={(e) => setSelectedGrade(e.target.value)} className="border rounded-lg px-3 py-2 bg-white">{gradesForSelectedBook.map((g) => <option key={g} value={g}>{g}</option>)}</select>
        <select value={selectedSemester} onChange={(e) => setSelectedSemester(e.target.value)} className="border rounded-lg px-3 py-2 bg-white">{semestersForSelectedScope.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setShowImportModal(true)} className="px-4 py-2 rounded-lg border font-bold hover:bg-surface-container-low flex items-center gap-2"><Upload className="w-4 h-4" /> 批量导入</button>
          <button onClick={deleteScope} disabled={deletingScope || loading} className="px-4 py-2 rounded-lg border border-red-300 text-red-700 font-bold hover:bg-red-50 disabled:opacity-40 flex items-center gap-2"><Trash2 className="w-4 h-4" /> {deletingScope ? '删除中...' : '删除全册'}</button>
          <button onClick={createEmptyPassage} className="px-4 py-2 rounded-lg border font-bold hover:bg-surface-container-low flex items-center gap-2"><Plus className="w-4 h-4" /> 新增课文</button>
        </div>
      </div>

      <div className="flex gap-3 text-sm">
        <span className="rounded-lg bg-surface-container-low px-3 py-1.5">本册课文数：<b>{items.length}</b></span>
        <span className="rounded-lg bg-surface-container-low px-3 py-1.5">单元数：<b>{units.length}</b></span>
      </div>
      {message && <div className="rounded-lg bg-green-50 text-green-700 px-3 py-2 text-sm">{message}</div>}
      {error && <div className="rounded-lg bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-outline-variant/30 overflow-hidden bg-surface-container-lowest">
          <table className="w-full border-collapse text-left table-fixed">
            <thead>
              <tr className="border-b border-outline-variant/30 bg-surface-container-low">
                <th className="p-3 w-24">单元</th>
                <th className="p-3 w-16">分区</th>
                <th className="p-3 w-16">标签</th>
                <th className="p-3">标题</th>
                <th className="p-3 w-20 text-right">句子数</th>
              </tr>
            </thead>
            <tbody>
              {!loading && items.length === 0 && <tr><td className="p-6 text-center text-on-surface-variant" colSpan={5}>当前筛选范围暂无课文</td></tr>}
              {items.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => selectPassage(item.id)}
                  className={'border-b border-outline-variant/20 cursor-pointer ' + (selectedId === item.id ? 'bg-secondary-container/40' : 'hover:bg-surface-container-low')}
                >
                  <td className="p-3">{item.unit}</td>
                  <td className="p-3">{item.section}</td>
                  <td className="p-3">{item.label}</td>
                  <td className="p-3 truncate">{item.title || '（无标题）'}</td>
                  <td className="p-3 text-right">{item.sentence_count || item.sentences.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4 space-y-3">
          {!editing && <div className="text-on-surface-variant text-sm">请选择一篇课文进行编辑，或点击右上角新增课文。</div>}
          {editing && (
            <>
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-black">{creating ? '新增课文' : '编辑课文'}</h4>
                <div className="flex items-center gap-2">
                  {!creating && <button onClick={deleteSelected} className="px-3 py-2 rounded-lg border border-red-300 text-red-700 font-bold hover:bg-red-50 flex items-center gap-2"><Trash2 className="w-4 h-4" /> 删除</button>}
                  <button onClick={saveEditing} disabled={saving} className="px-3 py-2 rounded-lg bg-secondary text-on-secondary font-bold disabled:opacity-50 flex items-center gap-2"><Save className="w-4 h-4" /> {saving ? '保存中...' : '保存'}</button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <input value={editing.unit} onChange={(e) => updateEditingField({ unit: e.target.value })} className="border rounded px-2 py-1" placeholder="Unit 1" />
                <input value={editing.section} onChange={(e) => updateEditingField({ section: e.target.value })} className="border rounded px-2 py-1" placeholder="A/B" />
                <input value={editing.label} onChange={(e) => updateEditingField({ label: e.target.value })} className="border rounded px-2 py-1" placeholder="3a" />
              </div>
              <input value={editing.title || ''} onChange={(e) => updateEditingField({ title: e.target.value })} className="w-full border rounded px-2 py-1" placeholder="标题（可选）" />
              <input value={editing.target_id || ''} onChange={(e) => updateEditingField({ target_id: e.target.value })} className="w-full border rounded px-2 py-1" placeholder="target_id（留空自动生成）" />
              <textarea value={editing.passage_text} onChange={(e) => updateEditingField({ passage_text: e.target.value })} className="w-full border rounded px-2 py-2 min-h-24" placeholder="课文英文正文" />

              <div className="flex items-center justify-between">
                <h5 className="font-bold">逐句内容（英中一一对应）</h5>
                <button onClick={addSentence} className="px-2 py-1 border rounded text-sm font-bold">新增句子</button>
              </div>
              <div className="max-h-[420px] overflow-auto space-y-2 pr-1">
                {editing.sentences.map((s, idx) => (
                  <div key={idx} className="rounded-lg border p-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-on-surface-variant">句子 #{idx + 1}</span>
                      <button onClick={() => removeSentence(idx)} disabled={editing.sentences.length <= 1} className="px-2 py-1 text-xs border rounded disabled:opacity-40">删除</button>
                    </div>
                    <textarea value={s.en} onChange={(e) => updateSentenceField(idx, 'en', e.target.value)} className="w-full border rounded px-2 py-1 min-h-16" placeholder="英文句子" />
                    <textarea value={s.zh} onChange={(e) => updateSentenceField(idx, 'zh', e.target.value)} className="w-full border rounded px-2 py-1 min-h-16" placeholder="中文译文" />
                    <div className="flex items-center gap-2">
                      <input value={s.audio || ''} onChange={(e) => updateSentenceField(idx, 'audio', e.target.value)} className="flex-1 border rounded px-2 py-1" placeholder="./passage_audio/xxx.mp3" />
                      <button onClick={() => lexiconApi.playAudioWithAuth(token, s.audio)} disabled={!s.audio} className="px-3 py-1.5 rounded border text-sm disabled:opacity-40">试听</button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                      <label className="text-xs text-on-surface-variant space-y-1">
                        <div>paragraph_no</div>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={s.paragraph_no ?? ''}
                          onChange={(e) => updateSentenceField(idx, 'paragraph_no', parsePositiveIntOrUndefined(e.target.value))}
                          className="w-full border rounded px-2 py-1"
                          placeholder="自动"
                        />
                      </label>
                      <label className="text-xs text-on-surface-variant space-y-1">
                        <div>sentence_no_in_paragraph</div>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={s.sentence_no_in_paragraph ?? ''}
                          onChange={(e) => updateSentenceField(idx, 'sentence_no_in_paragraph', parsePositiveIntOrUndefined(e.target.value))}
                          className="w-full border rounded px-2 py-1"
                          placeholder="自动"
                        />
                      </label>
                      <label className="text-xs text-on-surface-variant space-y-1">
                        <div>newline_after</div>
                        <select
                          value={typeof s.newline_after === 'number' ? s.newline_after : 0}
                          onChange={(e) => updateSentenceField(idx, 'newline_after', Number(e.target.value))}
                          className="w-full border rounded px-2 py-1 h-[34px] bg-white"
                        >
                          <option value={0}>0 - 不换行</option>
                          <option value={1}>1 - 单换行</option>
                          <option value={2}>2 - 段落换行</option>
                        </select>
                      </label>
                      <label className="text-xs text-on-surface-variant space-y-1">
                        <div>is_paragraph_end</div>
                        <label className="h-[34px] w-full border rounded px-2 py-1 inline-flex items-center gap-2 bg-white">
                          <input
                            type="checkbox"
                            checked={Boolean(s.is_paragraph_end)}
                            onChange={(e) => updateSentenceField(idx, 'is_paragraph_end', e.target.checked)}
                          />
                          <span>{s.is_paragraph_end ? 'true' : 'false'}</span>
                        </label>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-[min(1200px,98vw)] rounded-xl bg-white border border-outline-variant/30 shadow-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-black">批量导入课文 JSONL</h4>
              <button onClick={() => setShowImportModal(false)} className="rounded-md p-1 hover:bg-surface-container-low"><X className="w-4 h-4" /></button>
            </div>
            <div className="rounded-lg bg-surface-container-low p-3 text-sm text-on-surface-variant">
              请按“教材版本_年级_册次_课文表*.jsonl”命名文件。可在下方手动调整版本、年级和册次后再导入。</div>
            <div className="flex flex-wrap items-center gap-3">
              <input type="file" accept=".jsonl" multiple onChange={onImportFilesSelected} className="block border rounded-lg px-3 py-2" />
              <button onClick={recheckRows} disabled={checkingImportRows || importingBatch || !importRows.length} className="px-4 py-2 border rounded-lg font-bold disabled:opacity-40">{checkingImportRows ? '检查中...' : '重新检查'}</button>
            </div>
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-container-low">
                  <tr>
                    <th className="text-left p-2">文件名</th>
                    <th className="text-left p-2">教材版本</th>
                    <th className="text-left p-2">年级</th>
                    <th className="text-left p-2">册次</th>
                    <th className="text-right p-2">篇数</th>
                    <th className="text-left p-2">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {!importRows.length && <tr><td colSpan={6} className="p-4 text-center text-on-surface-variant">请先选择要导入的 JSONL 文件</td></tr>}
                  {importRows.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="p-2">{row.fileName}</td>
                      <td className="p-2">
                        <select value={row.bookVersion} disabled={importingBatch || row.status === 'success'} onChange={(e) => { const nextBook = e.target.value; const gradeCandidates = getGradesForBook(nextBook); const nextGrade = gradeCandidates.includes(row.grade) ? row.grade : (gradeCandidates[0] || ''); const semesterCandidates = getSemestersForBookGrade(nextBook, nextGrade); const nextSemester = semesterCandidates.includes(normalizeSemester(row.semester)) ? normalizeSemester(row.semester) : (semesterCandidates[0] || ''); updateImportRow(row.id, { bookVersion: nextBook, grade: nextGrade, semester: nextSemester }); }} className="w-full border rounded px-2 py-1 bg-white">
                          <option value="">请选择教材版本</option>
                          {bookVersions.map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </td>
                      <td className="p-2">
                        <select value={row.grade} disabled={importingBatch || row.status === 'success'} onChange={(e) => { const nextGrade = e.target.value; const semesterCandidates = getSemestersForBookGrade(row.bookVersion, nextGrade); const nextSemester = semesterCandidates.includes(normalizeSemester(row.semester)) ? normalizeSemester(row.semester) : (semesterCandidates[0] || ''); updateImportRow(row.id, { grade: nextGrade, semester: nextSemester }); }} className="w-full border rounded px-2 py-1 bg-white">
                          <option value="">请选择年级</option>
                          {getGradesForBook(row.bookVersion).map((g) => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </td>
                      <td className="p-2">
                        <select value={normalizeSemester(row.semester)} disabled={importingBatch || row.status === 'success'} onChange={(e) => updateImportRow(row.id, { semester: normalizeSemester(e.target.value) })} className="w-full border rounded px-2 py-1 bg-white">
                          <option value="">请选择册次</option>
                          {getSemestersForBookGrade(row.bookVersion, row.grade).map((s) => <option key={s} value={normalizeSemester(s)}>{normalizeSemester(s)}</option>)}
                        </select>
                      </td>
                      <td className="p-2 text-right">{row.count}</td>
                      <td className="p-2">
                        <div className="font-semibold">{statusLabel[row.status]}</div>
                        {row.note && <div className="text-xs text-on-surface-variant mt-0.5">{row.note}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowImportModal(false)} className="px-4 py-2 border rounded-lg font-bold">取消</button>
              <button onClick={runBatchImport} disabled={importingBatch || checkingImportRows || !importRows.length} className="px-4 py-2 bg-secondary text-on-secondary rounded-lg font-bold disabled:opacity-40">
                {importingBatch ? '导入中...' : '开始导入'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};












