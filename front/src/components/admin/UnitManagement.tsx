import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Save, Trash2, Upload, X } from 'lucide-react';
import { TextbookScopeBookRow, TextbookUnitItem, lexiconApi } from '../../lib/lexicon';
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

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const normalizeSemester = (semester: string) => {
  const s = (semester || '').trim();
  if (s === '全册' || s === '全一册') return '全册';
  return s;
};

const sortUnit = (a: string, b: string) => {
  const an = Number((a || '').replace(/[^\d]/g, ''));
  const bn = Number((b || '').replace(/[^\d]/g, ''));
  if (Number.isFinite(an) && Number.isFinite(bn) && an > 0 && bn > 0) return an - bn;
  return a.localeCompare(b, 'zh-CN');
};

const parseFileMeta = (fileName: string) => {
  const base = fileName.replace(/\.jsonl$/i, '');
  const parts = base.split('_');
  const grade = (parts[0] || '').trim();
  const semester = normalizeSemester((parts[1] || '').trim());
  return {
    grade,
    semester,
    isUnitFile: Boolean(grade && semester),
  };
};

const cloneUnit = (item: TextbookUnitItem): TextbookUnitItem => JSON.parse(JSON.stringify(item));

const emptyUnit = (bookVersion: string, grade: string, semester: string, sortOrder: number): TextbookUnitItem => ({
  id: 0,
  book_version: bookVersion,
  grade,
  semester,
  unit: '',
  unit_title: '',
  unit_desc_short: '',
  sort_order: sortOrder,
  source_file: '',
  source_pages: [],
  active: true,
});

export const UnitManagement: React.FC = () => {
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

  const [items, setItems] = useState<TextbookUnitItem[]>([]);
  const [selectedId, setSelectedId] = useState<number>(0);
  const [editing, setEditing] = useState<TextbookUnitItem | null>(null);
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
      setError(e?.message || '加载教材选项失败');
    } finally {
      setLoading(false);
    }
  };

  const loadItems = async (bookVersion: string, grade: string, semester: string) => {
    if (!bookVersion || !grade || !semester) return;
    setLoading(true);
    setError(null);
    try {
      const res = await lexiconApi.getUnits(token, bookVersion, grade, semester);
      const sorted = (res.items || []).slice().sort((a, b) => {
        const byOrder = (a.sort_order || 0) - (b.sort_order || 0);
        if (byOrder !== 0) return byOrder;
        return sortUnit(a.unit, b.unit);
      });
      setItems(sorted);
      const nextSelectedId = selectedId && sorted.some((x) => x.id === selectedId) ? selectedId : (sorted[0]?.id || 0);
      setSelectedId(nextSelectedId);
      const found = sorted.find((x) => x.id === nextSelectedId) || null;
      setEditing(found ? cloneUnit(found) : null);
      setCreating(false);
    } catch (e: any) {
      setError(e?.message || '加载单元失败');
      setItems([]);
      setSelectedId(0);
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
  useEffect(() => {
    if (!showImportModal) return;
    setImportRows((prev) => prev.map((row) => ({
      ...row,
      bookVersion: selectedBookVersion,
      status: row.status === 'success' ? row.status : 'unchecked',
      note: row.status === 'success' ? row.note : undefined,
    })));
  }, [selectedBookVersion, showImportModal]);

  const selectUnit = (id: number) => {
    setSelectedId(id);
    const found = items.find((x) => x.id === id) || null;
    setEditing(found ? cloneUnit(found) : null);
    setCreating(false);
  };

  const createEmptyUnit = () => {
    const next = emptyUnit(selectedBookVersion, selectedGrade, selectedSemester, items.length + 1);
    setEditing(next);
    setSelectedId(0);
    setCreating(true);
  };

  const updateEditingField = (patch: Partial<TextbookUnitItem>) => {
    setEditing((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const saveEditing = async () => {
    if (!editing) return;
    if (!editing.book_version || !editing.grade || !editing.semester || !editing.unit.trim()) {
      return setError('教材版本、年级、册数和单元编号不能为空');
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = {
        book_version: editing.book_version,
        grade: editing.grade,
        semester: normalizeSemester(editing.semester),
        unit: editing.unit.trim(),
        unit_title: editing.unit_title || '',
        unit_desc_short: editing.unit_desc_short || '',
        sort_order: editing.sort_order || 0,
        source_file: editing.source_file || '',
        source_pages: editing.source_pages || [],
        active: editing.active,
      };
      if (creating) {
        await lexiconApi.createUnit(token, payload);
        setMessage('新增单元成功');
      } else {
        await lexiconApi.updateUnit(token, editing.id, payload);
        setMessage('单元已更新');
      }
      await loadItems(selectedBookVersion, selectedGrade, selectedSemester);
    } catch (e: any) {
      setError(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const deleteSelected = async () => {
    if (!editing || creating) return;
    if (!window.confirm(`确认删除单元“${editing.unit}”？\n如已被词库或课文使用会被阻止。`)) return;
    setError(null);
    setMessage(null);
    try {
      await lexiconApi.deleteUnit(token, editing.id);
      setMessage('单元已删除');
      await loadItems(selectedBookVersion, selectedGrade, selectedSemester);
    } catch (e: any) {
      setError(e?.message || '删除失败');
    }
  };

  const deleteScope = async () => {
    if (!selectedBookVersion || !selectedGrade || !selectedSemester) return;
    const preview = await lexiconApi.getUnitsDeletePreview(token, selectedBookVersion, selectedGrade, selectedSemester);
    if (preview.unitCount <= 0) {
      setMessage('当前筛选范围没有单元');
      return;
    }
    const detail = `范围：${selectedBookVersion} / ${selectedGrade} / ${selectedSemester}\n单元数：${preview.unitCount}\n单词词条：${preview.wordLexiconCount}\n短语词条：${preview.phraseLexiconCount}\n课文数：${preview.passageCount}`;
    if (preview.blocked) {
      return setError(`当前册已被引用，暂不能整册删除。\n${detail}`);
    }
    if (!window.confirm(`确认删除当前册全部单元？\n\n${detail}`)) return;
    setDeletingScope(true);
    setError(null);
    setMessage(null);
    try {
      const res = await lexiconApi.deleteUnitsByScope(token, selectedBookVersion, selectedGrade, selectedSemester);
      setMessage(`整册删除成功：${res.count} 个单元`);
      await loadItems(selectedBookVersion, selectedGrade, selectedSemester);
    } catch (e: any) {
      setError(e?.message || '删除失败');
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

  const buildImportRows = async (files: File[]) => {
    const rows: ImportRow[] = [];
    for (const file of files) {
      const { grade, semester, isUnitFile } = parseFileMeta(file.name);
      let count = 0;
      let status: ImportStatus = 'unchecked';
      let note = '';
      if (!selectedBookVersion) {
        status = 'invalid';
        note = '请先在页面顶部选择目标教材版本';
      } else if (!grade || !semester || !isUnitFile) {
        status = 'invalid';
        note = '文件名需包含 年级_册次，例如：七年级_上册.jsonl';
      }
      try {
        const text = await file.text();
        const lines = text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
        for (const line of lines) {
          const row = JSON.parse(line);
          if (String(row?.record_type || '').trim().toLowerCase() === 'unit') {
            count += 1;
          }
        }
      } catch {
        status = 'invalid';
        note = 'JSONL 格式错误';
      }
      rows.push({
        id: newId(),
        file,
        fileName: file.name,
        bookVersion: selectedBookVersion,
        grade,
        semester,
        count,
        status,
        note: note || undefined,
      });
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
          next[i] = { ...row, status: 'invalid', note: '教材版本不存在或不可用' };
          continue;
        }
        if (!grades.includes(row.grade)) {
          next[i] = { ...row, status: 'invalid', note: '年级不存在或不可用' };
          continue;
        }
        if (!semesters.map(normalizeSemester).includes(normalizeSemester(row.semester))) {
          next[i] = { ...row, status: 'invalid', note: '册次不存在或不可用' };
          continue;
        }
        if (!hasScopedTuple(row.bookVersion, row.grade, normalizeSemester(row.semester))) {
          next[i] = { ...row, status: 'invalid', note: '教材版本/年级/册次不在教材管理范围内' };
          continue;
        }
        if (row.count <= 0) {
          next[i] = { ...row, status: 'invalid', note: '未解析到任何单元' };
          continue;
        }
        next[i] = { ...row, status: 'checking', note: undefined };
        setImportRows([...next]);
        try {
          const scope = await lexiconApi.getUnitsCount(token, row.bookVersion, row.grade, normalizeSemester(row.semester));
          next[i] = scope.count > 0
            ? { ...row, semester: normalizeSemester(row.semester), status: 'exists', note: `数据库已存在 ${scope.count} 个单元，将按覆盖导入执行` }
            : { ...row, semester: normalizeSemester(row.semester), status: 'ready', note: undefined };
        } catch (e: any) {
          next[i] = { ...row, status: 'failed', note: e?.message || '检查失败' };
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
    if (!importRows.length) return setError('请先选择 JSONL 文件');
    setError(null);
    setMessage(null);
    const checked = await checkImportRows(importRows);
    setImportRows(checked);
    const hasBlocking = checked.some((x) => x.status === 'invalid' || x.status === 'failed');
    if (hasBlocking) return setError('有文件存在异常，请先处理后再导入');
    const readyRows = checked.filter((x) => x.status === 'ready' || x.status === 'exists');
    if (!readyRows.length) return setError('没有可导入文件');

    setImportingBatch(true);
    try {
      let success = 0;
      let failed = 0;
      for (const row of readyRows) {
        setImportRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, status: 'importing', note: undefined } : x)));
        try {
          const res = await lexiconApi.importUnitJsonl(token, {
            file: row.file,
            bookVersion: row.bookVersion,
            grade: row.grade,
            semester: normalizeSemester(row.semester),
            overwrite: true,
          });
          success += 1;
          setImportRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, status: 'success', note: `导入 ${res.count} 个单元` } : x)));
        } catch (e: any) {
          failed += 1;
          setImportRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, status: 'failed', note: e?.message || '导入失败' } : x)));
        }
      }
      setMessage(`批量导入完成：成功 ${success} 个，失败 ${failed} 个`);
      await loadItems(selectedBookVersion, selectedGrade, selectedSemester);
    } finally {
      setImportingBatch(false);
    }
  };

  const statusLabel: Record<ImportStatus, string> = {
    invalid: '无效',
    checking: '检查中',
    unchecked: '未检查',
    exists: '将覆盖',
    ready: '可导入',
    importing: '导入中',
    success: '成功',
    failed: '失败',
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-2xl font-black">单元管理</h3>
        <select value={selectedBookVersion} onChange={(e) => setSelectedBookVersion(e.target.value)} className="border rounded-lg px-3 py-2 bg-white">{bookVersions.map((v) => <option key={v} value={v}>{v}</option>)}</select>
        <select value={selectedGrade} onChange={(e) => setSelectedGrade(e.target.value)} className="border rounded-lg px-3 py-2 bg-white">{gradesForSelectedBook.map((g) => <option key={g} value={g}>{g}</option>)}</select>
        <select value={selectedSemester} onChange={(e) => setSelectedSemester(e.target.value)} className="border rounded-lg px-3 py-2 bg-white">{semestersForSelectedScope.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setShowImportModal(true)} className="px-4 py-2 rounded-lg border font-bold hover:bg-surface-container-low flex items-center gap-2"><Upload className="w-4 h-4" /> 批量导入</button>
          <button onClick={deleteScope} disabled={deletingScope || loading} className="px-4 py-2 rounded-lg border border-red-300 text-red-700 font-bold hover:bg-red-50 disabled:opacity-40 flex items-center gap-2"><Trash2 className="w-4 h-4" /> {deletingScope ? '删除中...' : '删除全册'}</button>
          <button onClick={createEmptyUnit} className="px-4 py-2 rounded-lg border font-bold hover:bg-surface-container-low flex items-center gap-2"><Plus className="w-4 h-4" /> 新增单元</button>
        </div>
      </div>

      <div className="flex gap-3 text-sm">
        <span className="rounded-lg bg-surface-container-low px-3 py-1.5">本册单元数：<b>{items.length}</b></span>
      </div>
      {message && <div className="rounded-lg bg-green-50 text-green-700 px-3 py-2 text-sm whitespace-pre-line">{message}</div>}
      {error && <div className="rounded-lg bg-red-50 text-red-700 px-3 py-2 text-sm whitespace-pre-line">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-outline-variant/30 overflow-hidden bg-surface-container-lowest">
          <table className="w-full border-collapse text-left table-fixed">
            <thead>
              <tr className="border-b border-outline-variant/30 bg-surface-container-low">
                <th className="p-3 w-24">排序</th>
                <th className="p-3 w-28">单元</th>
                <th className="p-3">标题</th>
                <th className="p-3">简介</th>
              </tr>
            </thead>
            <tbody>
              {!loading && items.length === 0 && <tr><td className="p-6 text-center text-on-surface-variant" colSpan={4}>当前筛选范围暂无单元</td></tr>}
              {items.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => selectUnit(item.id)}
                  className={'border-b border-outline-variant/20 cursor-pointer ' + (selectedId === item.id ? 'bg-secondary-container/40' : 'hover:bg-surface-container-low')}
                >
                  <td className="p-3">{item.sort_order || 0}</td>
                  <td className="p-3">{item.unit}</td>
                  <td className="p-3 truncate">{item.unit_title || '（无标题）'}</td>
                  <td className="p-3 truncate">{item.unit_desc_short || '（无简介）'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4 space-y-3">
          {!editing && <div className="text-on-surface-variant text-sm">请选择一个单元进行编辑，或点击右上角新增单元。</div>}
          {editing && (
            <>
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-black">{creating ? '新增单元' : '编辑单元'}</h4>
                <div className="flex items-center gap-2">
                  {!creating && <button onClick={deleteSelected} className="px-3 py-2 rounded-lg border border-red-300 text-red-700 font-bold hover:bg-red-50 flex items-center gap-2"><Trash2 className="w-4 h-4" /> 删除</button>}
                  <button onClick={saveEditing} disabled={saving} className="px-3 py-2 rounded-lg bg-secondary text-on-secondary font-bold disabled:opacity-50 flex items-center gap-2"><Save className="w-4 h-4" /> {saving ? '保存中...' : '保存'}</button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <input value={editing.book_version} disabled className="border rounded px-2 py-1 bg-surface-container-low" />
                <input value={editing.grade} disabled className="border rounded px-2 py-1 bg-surface-container-low" />
                <input value={editing.semester} disabled className="border rounded px-2 py-1 bg-surface-container-low" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input value={editing.unit} onChange={(e) => updateEditingField({ unit: e.target.value })} className="border rounded px-2 py-1" placeholder="Unit 1" />
                <input type="number" min={0} step={1} value={editing.sort_order || 0} onChange={(e) => updateEditingField({ sort_order: Number(e.target.value) || 0 })} className="border rounded px-2 py-1" placeholder="排序" />
              </div>
              <input value={editing.unit_title || ''} onChange={(e) => updateEditingField({ unit_title: e.target.value })} className="w-full border rounded px-2 py-1" placeholder="单元标题" />
              <textarea value={editing.unit_desc_short || ''} onChange={(e) => updateEditingField({ unit_desc_short: e.target.value })} className="w-full border rounded px-2 py-2 min-h-28" placeholder="单元简介" />
              <div className="grid grid-cols-2 gap-2">
                <input value={editing.source_file || ''} disabled className="border rounded px-2 py-1 bg-surface-container-low" placeholder="来源文件" />
                <input value={(editing.source_pages || []).join(',')} disabled className="border rounded px-2 py-1 bg-surface-container-low" placeholder="来源页码" />
              </div>
            </>
          )}
        </div>
      </div>

      {showImportModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-[min(1100px,98vw)] rounded-xl bg-white border border-outline-variant/30 shadow-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-black">批量导入单元 JSONL</h4>
              <button onClick={() => setShowImportModal(false)} className="rounded-md p-1 hover:bg-surface-container-low"><X className="w-4 h-4" /></button>
            </div>
            <div className="rounded-lg bg-surface-container-low p-3 text-sm text-on-surface-variant">
              导入将使用当前页面顶部选中的教材版本作为目标版本。文件名只需包含“年级_册次”，例如“七年级_上册.jsonl”或“九年级_全册.jsonl”。系统会先校验该教材版本下是否存在对应的年级与册次，再按整册覆盖导入。
            </div>
            <div className="rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-3 py-2 text-sm">
              目标教材版本：<b>{selectedBookVersion || '未选择'}</b>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input type="file" accept=".jsonl" multiple onChange={onImportFilesSelected} className="block border rounded-lg px-3 py-2" />
              <button onClick={recheckRows} disabled={checkingImportRows || importingBatch || !importRows.length} className="px-4 py-2 border rounded-lg font-bold disabled:opacity-40">{checkingImportRows ? '检查中...' : '重新检查'}</button>
              <button onClick={runBatchImport} disabled={importingBatch || checkingImportRows || !importRows.length} className="px-4 py-2 rounded-lg bg-secondary text-on-secondary font-bold disabled:opacity-40">{importingBatch ? '导入中...' : '开始导入'}</button>
            </div>
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-container-low">
                  <tr>
                    <th className="p-3 text-left">文件</th>
                    <th className="p-3 text-left">目标教材</th>
                    <th className="p-3 text-left">年级</th>
                    <th className="p-3 text-left">册次</th>
                    <th className="p-3 text-right">单元数</th>
                    <th className="p-3 text-left">状态</th>
                    <th className="p-3 text-left">说明</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.length === 0 && (
                    <tr><td className="p-4 text-center text-on-surface-variant" colSpan={7}>请选择要导入的 JSONL 文件</td></tr>
                  )}
                  {importRows.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="p-3">{row.fileName}</td>
                      <td className="p-3">
                        <div className="w-full rounded border bg-surface-container-low px-2 py-1">
                          {row.bookVersion || '-'}
                        </div>
                      </td>
                      <td className="p-3">
                        <select value={row.grade} disabled={importingBatch || row.status === 'success'} onChange={(e) => {
                          const nextGrade = e.target.value;
                          const semesterCandidates = getSemestersForBookGrade(row.bookVersion, nextGrade);
                          const nextSemester = semesterCandidates.includes(normalizeSemester(row.semester)) ? normalizeSemester(row.semester) : (semesterCandidates[0] || '');
                          setImportRows((prev) => prev.map((x) => x.id === row.id ? { ...x, grade: nextGrade, semester: nextSemester, status: 'unchecked', note: undefined } : x));
                        }} className="w-full border rounded px-2 py-1 bg-white">
                          {getGradesForBook(row.bookVersion).map((g) => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </td>
                      <td className="p-3">
                        <select value={normalizeSemester(row.semester)} disabled={importingBatch || row.status === 'success'} onChange={(e) => {
                          setImportRows((prev) => prev.map((x) => x.id === row.id ? { ...x, semester: normalizeSemester(e.target.value), status: 'unchecked', note: undefined } : x));
                        }} className="w-full border rounded px-2 py-1 bg-white">
                          {getSemestersForBookGrade(row.bookVersion, row.grade).map((s) => <option key={s} value={normalizeSemester(s)}>{normalizeSemester(s)}</option>)}
                        </select>
                      </td>
                      <td className="p-3 text-right">{row.count}</td>
                      <td className="p-3">{statusLabel[row.status]}</td>
                      <td className="p-3 text-on-surface-variant">{row.note || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
