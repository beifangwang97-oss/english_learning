import React, { useEffect, useMemo, useState } from 'react';
import { CheckSquare, Layers, Pencil, Plus, Save, Trash2, Upload, X } from 'lucide-react';
import { LexiconItem, lexiconApi } from '../../lib/lexicon';
import { getSessionToken } from '../../lib/session';

type Props = { type: 'word' | 'phrase' };
type ImportStatus = 'invalid' | 'checking' | 'unchecked' | 'exists' | 'ready' | 'importing' | 'success' | 'failed';
type ImportRow = {
  id: string;
  file: File;
  fileName: string;
  parsedType: 'word' | 'phrase' | 'passage' | 'unknown';
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
  if (s === '全册' || s === '全一册') return '全册';
  if (s.includes('全') && s.includes('册')) return '全册';
  return s;
};
const parseFileMeta = (fileName: string) => {
  const base = fileName.replace(/\.jsonl$/i, '');
  const parts = base.split('_');
  const bookVersion = (parts[0] || '').trim();
  const grade = (parts[1] || '').trim();
  const semester = normalizeSemester((parts[2] || '').trim());
  const listToken = (parts[3] || '').trim();
  let parsedType: ImportRow['parsedType'] = 'unknown';
  if (listToken.includes('单词表')) parsedType = 'word';
  else if (listToken.includes('短语表')) parsedType = 'phrase';
  else if (listToken.includes('课文表')) parsedType = 'passage';
  return { bookVersion, grade, semester, parsedType };
};
const statusLabel: Record<ImportStatus, string> = {
  invalid: '无效',
  checking: '校验中',
  unchecked: '待校验',
  exists: '数据库已存在',
  ready: '可导入',
  importing: '导入中',
  success: '已导入',
  failed: '\u5931\u8d25',
};

export const LexiconManagement: React.FC<Props> = ({ type }) => {
  const token = useMemo(() => getSessionToken(), []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [serverFile, setServerFile] = useState<string | null>(null);
  const [bookVersions, setBookVersions] = useState<string[]>([]);
  const [grades, setGrades] = useState<string[]>([]);
  const [semesters, setSemesters] = useState<string[]>([]);
  const [selectedBookVersion, setSelectedBookVersion] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('');
  const [selectedSemester, setSelectedSemester] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');
  const [items, setItems] = useState<LexiconItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isEditing, setIsEditing] = useState(false);
  const [moveTargetUnit, setMoveTargetUnit] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [groupUnits, setGroupUnits] = useState<Set<string>>(new Set());
  const [groupSize, setGroupSize] = useState('10');
  const [grouping, setGrouping] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [checkingImportRows, setCheckingImportRows] = useState(false);
  const [importingBatch, setImportingBatch] = useState(false);

  const units = useMemo(() => Array.from(new Set(items.map((x) => x.unit || 'Unit 1'))).sort(sortUnit), [items]);
  const visibleItems = useMemo(() => items.filter((x) => x.unit === selectedUnit), [items, selectedUnit]);

  const loadOptions = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await lexiconApi.getOptions(token, type);
      setBookVersions(res.bookVersions || []);
      setGrades(res.grades || []);
      setSemesters((res.semesters || []).map(normalizeSemester));
      setSelectedBookVersion(res.bookVersions?.[0] || '');
      setSelectedGrade(res.grades?.[0] || '');
      setSelectedSemester(normalizeSemester(res.semesters?.[0] || ''));
    } catch (e: any) {
      setError(e?.message || '加载筛选项失败');
    } finally {
      setLoading(false);
    }
  };

  const loadItems = async (bookVersion: string, grade: string, semester: string) => {
    if (!bookVersion || !grade || !semester) return;
    setLoading(true);
    setError(null);
    try {
      const res = await lexiconApi.getItems(token, type, bookVersion, grade, semester);
      const normalized = (res.items || []).map((x) => ({
        ...x,
        meanings: Array.isArray(x.meanings) && x.meanings.length ? x.meanings : [{ pos: '', meaning: '', example: '', example_zh: '', example_audio: '' }],
      }));
      setItems(normalized);
      setServerFile(res.file || null);
      const us = (res.units || []).sort(sortUnit);
      setSelectedUnit((prev) => (prev && us.includes(prev) ? prev : us[0] || ''));
      setSelectedIds(new Set());
    } catch (e: any) {
      setError(e?.message || '加载词条失败');
      setItems([]);
      setSelectedUnit('');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadOptions(); }, [type]);
  useEffect(() => { if (selectedBookVersion && selectedGrade && selectedSemester) loadItems(selectedBookVersion, selectedGrade, selectedSemester); }, [selectedBookVersion, selectedGrade, selectedSemester]);
  useEffect(() => { if (showImportModal) setImportRows([]); }, [showImportModal, type]);
  useEffect(() => { if (showGroupModal) { setGroupUnits(new Set(units)); setGroupSize('10'); } }, [showGroupModal, units]);

  const updateItem = (id: string, patch: Partial<LexiconItem>) => setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const updateMeaning = (id: string, idx: number, field: 'pos' | 'meaning' | 'example' | 'example_zh' | 'example_audio', value: string) => setItems((prev) => prev.map((x) => x.id !== id ? x : { ...x, meanings: x.meanings.map((m, i) => i === idx ? { ...m, [field]: value } : m) }));
  const toggleSelected = (id: string, checked: boolean) => setSelectedIds((prev) => { const next = new Set(prev); checked ? next.add(id) : next.delete(id); return next; });
  const addMeaning = (id: string) => setItems((prev) => prev.map((x) => x.id === id ? { ...x, meanings: [...x.meanings, { pos: '', meaning: '', example: '', example_zh: '', example_audio: '' }] } : x));
  const removeMeaning = (id: string, idx: number) => setItems((prev) => prev.map((x) => x.id === id && x.meanings.length > 1 ? { ...x, meanings: x.meanings.filter((_, i) => i !== idx) } : x));
  const addItem = () => selectedUnit && setItems((prev) => [{ id: newId(), word: '', phonetic: '', unit: selectedUnit, group_no: undefined, type, book_version: selectedBookVersion, grade: selectedGrade, semester: selectedSemester, meanings: [{ pos: type === 'word' ? '' : 'phrase', meaning: '', example: '', example_zh: '', example_audio: '' }], word_audio: '', phrase_audio: '' }, ...prev]);
  const deleteSelected = () => { setItems((prev) => prev.filter((x) => !selectedIds.has(x.id))); setSelectedIds(new Set()); };
  const moveSelected = () => { if (!moveTargetUnit) return; setItems((prev) => prev.map((x) => selectedIds.has(x.id) ? { ...x, unit: moveTargetUnit } : x)); setSelectedUnit(moveTargetUnit); setSelectedIds(new Set()); };

  const saveAll = async (nextItems: LexiconItem[] = items, text = `已保存 ${items.length} 条`) => {
    setSaving(true); setError(null); setMessage(null);
    try {
      const res = await lexiconApi.saveItems(token, type, selectedBookVersion, selectedGrade, selectedSemester, nextItems);
      setServerFile(res.file); setMessage(text); setIsEditing(false); setSelectedIds(new Set());
      await loadItems(selectedBookVersion, selectedGrade, selectedSemester);
    } catch (e: any) { setError(e?.message || '保存失败'); } finally { setSaving(false); }
  };

  const playAudio = async (path: string) => {
    if (!path) return;
    try {
      await lexiconApi.playAudioWithAuth(token, path);
    } catch {
      setError('音频播放失败');
    }
  };
  const deleteCurrentScope = async () => {
    if (!selectedBookVersion || !selectedGrade || !selectedSemester) {
      setError('请先选择教材、年级和册数');
      return;
    }
    setDeleting(true);
    setError(null);
    setMessage(null);
    try {
      const typeLabel = type === 'word' ? '单词' : '短语';
      const preview = await lexiconApi.previewDeleteItems(token, type, selectedBookVersion, selectedGrade, selectedSemester);
      if (preview.deletedEntries <= 0) {
        setMessage('当前范围没有可删除的数据');
        return;
      }
      const confirmed = window.confirm(
        `确认删除当前${typeLabel}册数据？\n\n范围：${selectedBookVersion} / ${selectedGrade} / ${selectedSemester}\n类型：${typeLabel}\n将删除词条：${preview.deletedEntries} 条\n将删除释义：${preview.deletedMeanings} 条\n\n删除后不可恢复。`
      );
      if (!confirmed) return;

      const res = await lexiconApi.deleteItems(token, type, selectedBookVersion, selectedGrade, selectedSemester);
      setMessage(`删除成功：词条 ${res.deletedEntries} 条，释义 ${res.deletedMeanings} 条`);
      await loadItems(selectedBookVersion, selectedGrade, selectedSemester);
    } catch (e: any) {
      setError(e?.message || '删除失败');
    } finally {
      setDeleting(false);
    }
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
      const { bookVersion, grade, semester, parsedType } = parseFileMeta(file.name);
      let count = 0;
      let status: ImportStatus = 'unchecked';
      let note = '';
      if (!bookVersion || !grade || !semester || parsedType === 'unknown') {
        status = 'invalid';
        note = '文件名不符合规则';
      } else if (parsedType === 'passage') {
        status = 'invalid';
        note = '课文表请在课文管理中导入';
      } else if (parsedType !== type) {
        status = 'invalid';
        note = `当前页面仅支持导入${type === 'word' ? '单词表' : '短语表'}`;
      }
      try {
        const text = await file.text();
        const lines = text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
        count = lines.length;
        for (const line of lines) JSON.parse(line);
      } catch {
        status = 'invalid';
        note = 'JSONL 格式错误';
      }
      rows.push({
        id: newId(),
        file,
        fileName: file.name,
        parsedType,
        bookVersion,
        grade,
        semester: normalizeSemester(semester),
        count,
        status,
        note: note || undefined,
      });
    }
    return rows;
  };
  const checkImportRows = async (rows: ImportRow[]) => {
    const semesterSet = new Set(semesters.map(normalizeSemester));
    const next = [...rows];
    setCheckingImportRows(true);
    try {
      for (let i = 0; i < next.length; i++) {
        const row = next[i];
        if (row.status === 'invalid' || row.status === 'success') continue;
        if (!bookVersions.includes(row.bookVersion)) {
          next[i] = { ...row, status: 'invalid', note: '教材版本未在系统标签中，请先到教材管理中新增' };
          continue;
        }
        if (!grades.includes(row.grade)) {
          next[i] = { ...row, status: 'invalid', note: '年级标签无效' };
          continue;
        }
        if (!semesterSet.has(normalizeSemester(row.semester))) {
          next[i] = { ...row, status: 'invalid', note: '册数标签无效' };
          continue;
        }
        if (row.count <= 0) {
          next[i] = { ...row, status: 'invalid', note: '文件无有效数据' };
          continue;
        }
        next[i] = { ...row, status: 'checking', note: undefined };
        setImportRows([...next]);
        try {
          const scope = await lexiconApi.getItemsCount(token, type, row.bookVersion, row.grade, normalizeSemester(row.semester));
          next[i] = scope.count > 0
            ? { ...row, semester: normalizeSemester(row.semester), status: 'exists', note: `数据库已存在 ${scope.count} 条，请先删除再导入` }
            : { ...row, semester: normalizeSemester(row.semester), status: 'ready', note: undefined };
        } catch (e: any) {
          next[i] = { ...row, status: 'failed', note: e?.message || '校验失败' };
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
    setError(null);
    setMessage(null);
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
    const hasBlocking = checked.some((x) => x.status === 'invalid' || x.status === 'exists' || x.status === 'failed');
    if (hasBlocking) return setError('存在不可导入文件，请先修正后再导入');
    const readyRows = checked.filter((x) => x.status === 'ready');
    if (!readyRows.length) return setError('没有可导入文件');

    setImportingBatch(true);
    try {
      let success = 0;
      let failed = 0;
      for (const row of readyRows) {
        setImportRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, status: 'importing', note: undefined } : x)));
        try {
          const res = await lexiconApi.importJsonl(token, {
            type,
            bookVersion: row.bookVersion,
            grade: row.grade,
            semester: normalizeSemester(row.semester),
            file: row.file,
            proofread: true,
            overwrite: false,
          });
          success += 1;
          setImportRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, status: 'success', note: `导入 ${res.count} 条` } : x)));
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

  const applyGrouping = async (clearOnly: boolean) => {
    if (groupUnits.size === 0) return setError('请至少选择一个单元');
    const size = Math.floor(Number(groupSize));
    if (!clearOnly && (!Number.isFinite(size) || size <= 0)) return setError('每组数量必须是正整数');
    setGrouping(true); setError(null); setMessage(null);
    try {
      const selected = new Set(groupUnits);
      const counter = new Map<string, number>();
      const nextItems = items.map((item) => {
        if (!selected.has(item.unit)) return item;
        if (clearOnly) return { ...item, group_no: undefined };
        const idx = counter.get(item.unit) ?? 0;
        counter.set(item.unit, idx + 1);
        return { ...item, group_no: Math.floor(idx / size) + 1 };
      });
      await saveAll(nextItems, clearOnly ? '已取消分组并同步数据库' : '分组完成并同步数据库');
      setShowGroupModal(false);
    } finally { setGrouping(false); }
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-2xl font-black">{type === 'word' ? '单词库' : '短语库'}</h3>
        <select value={selectedBookVersion} onChange={(e) => { setSelectedBookVersion(e.target.value); setSelectedGrade(grades[0] || ''); setSelectedSemester(semesters[0] || ''); }} className="border rounded-lg px-3 py-2 bg-white">{bookVersions.map((v) => <option key={v} value={v}>{v}</option>)}</select>
        <select value={selectedGrade} onChange={(e) => setSelectedGrade(e.target.value)} className="border rounded-lg px-3 py-2 bg-white">{grades.map((g) => <option key={g} value={g}>{g}</option>)}</select>
        <select value={selectedSemester} onChange={(e) => setSelectedSemester(e.target.value)} className="border rounded-lg px-3 py-2 bg-white">{semesters.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <select value={selectedUnit} onChange={(e) => setSelectedUnit(e.target.value)} className="border rounded-lg px-3 py-2 bg-white">{units.map((u) => <option key={u} value={u}>{u}</option>)}</select>
        <div className="ml-auto flex items-center gap-2">
          {!isEditing && <button onClick={() => setShowGroupModal(true)} className="px-4 py-2 rounded-lg border font-bold hover:bg-surface-container-low flex items-center gap-2"><Layers className="w-4 h-4" /> 分组</button>}
          {!isEditing && <button onClick={() => setShowImportModal(true)} className="px-4 py-2 rounded-lg border font-bold hover:bg-surface-container-low flex items-center gap-2"><Upload className="w-4 h-4" /> 批量导入</button>}
          {!isEditing && <button onClick={deleteCurrentScope} disabled={deleting || loading} className="px-4 py-2 rounded-lg border border-red-300 text-red-700 font-bold hover:bg-red-50 disabled:opacity-40 flex items-center gap-2"><Trash2 className="w-4 h-4" /> {deleting ? '删除中...' : '删除本册'}</button>}
          {!isEditing && <button onClick={() => setIsEditing(true)} className="px-4 py-2 rounded-lg border font-bold hover:bg-surface-container-low flex items-center gap-2"><Pencil className="w-4 h-4" /> 编辑</button>}
          {isEditing && <>
            <button onClick={addItem} className="px-4 py-2 rounded-lg border font-bold hover:bg-surface-container-low flex items-center gap-2"><Plus className="w-4 h-4" /> 新增</button>
            <button onClick={deleteSelected} disabled={selectedIds.size === 0} className="px-4 py-2 rounded-lg border font-bold hover:bg-surface-container-low disabled:opacity-40 flex items-center gap-2"><Trash2 className="w-4 h-4" /> 删除</button>
            <select value={moveTargetUnit} onChange={(e) => setMoveTargetUnit(e.target.value)} className="border rounded-lg px-3 py-2 bg-white"><option value="">目标单元</option>{units.map((u) => <option key={u} value={u}>{u}</option>)}</select>
            <button onClick={moveSelected} disabled={!moveTargetUnit || selectedIds.size === 0} className="px-4 py-2 rounded-lg border font-bold hover:bg-surface-container-low disabled:opacity-40">移动</button>
            <button onClick={() => saveAll()} disabled={saving} className="px-4 py-2 rounded-lg bg-secondary text-on-secondary font-bold disabled:opacity-50 flex items-center gap-2"><Save className="w-4 h-4" /> {saving ? '保存中...' : '保存'}</button>
          </>}
        </div>
      </div>
      <div className="flex gap-3 text-sm">
        <span className="rounded-lg bg-surface-container-low px-3 py-1.5">本册总{type === 'word' ? '单词' : '短语'}数：<b>{items.length}</b></span>
        <span className="rounded-lg bg-surface-container-low px-3 py-1.5">{selectedUnit || '当前单元'} {type === 'word' ? '单词' : '短语'}数：<b>{visibleItems.length}</b></span>
      </div>
      {serverFile && <div className="text-xs text-on-surface-variant">数据来源：{serverFile}</div>}
      {message && <div className="rounded-lg bg-green-50 text-green-700 px-3 py-2 text-sm">{message}</div>}
      {error && <div className="rounded-lg bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="rounded-xl border border-outline-variant/30 overflow-x-hidden bg-surface-container-lowest">
        <table className="w-full border-collapse text-left table-fixed">
          <thead><tr className="border-b border-outline-variant/30 bg-surface-container-low">{isEditing && <th className="p-3 w-12"><CheckSquare className="w-4 h-4" /></th>}<th className="p-3 w-24">分组</th><th className="p-3">英文</th>{type === 'word' && <th className="p-3">音标</th>}{type === 'word' && <th className="p-3">词性</th>}<th className="p-3">中文释义</th><th className="p-3">录音</th><th className="p-3">例句</th><th className="p-3">例句中文</th><th className="p-3">例句录音</th>{isEditing && <th className="p-3">操作</th>}</tr></thead>
          <tbody>
            {!loading && visibleItems.length === 0 && <tr><td className="p-6 text-center text-on-surface-variant" colSpan={isEditing ? (type === 'word' ? 11 : 10) : (type === 'word' ? 9 : 8)}>当前筛选下暂无数据</td></tr>}
            {visibleItems.map((item) => (item.meanings.length ? item.meanings : [{ pos: '', meaning: '', example: '', example_zh: '', example_audio: '' }]).map((m, idx, arr) => {
              const first = idx === 0; const rowSpan = arr.length; const wordAudioPath = type === 'word' ? (item.word_audio || '') : (item.phrase_audio || '');
              return <tr key={`${item.id}-${idx}`} className="border-b border-outline-variant/20 align-top">
                {isEditing && first && <td className="p-3" rowSpan={rowSpan}><input type="checkbox" checked={selectedIds.has(item.id)} onChange={(e) => toggleSelected(item.id, e.target.checked)} /></td>}
                {first && <td className="p-3" rowSpan={rowSpan}>{item.group_no ? `第${item.group_no}组` : '-'}</td>}
                {first && <td className="p-3" rowSpan={rowSpan}>{isEditing ? <input className="w-full border rounded px-2 py-1" value={item.word} onChange={(e) => updateItem(item.id, { word: e.target.value })} /> : <span className="font-bold">{item.word}</span>}</td>}
                {type === 'word' && first && <td className="p-3" rowSpan={rowSpan}>{isEditing ? <input className="w-full border rounded px-2 py-1" value={item.phonetic || ''} onChange={(e) => updateItem(item.id, { phonetic: e.target.value })} /> : (item.phonetic || '-')}</td>}
                {type === 'word' && <td className="p-3">{isEditing ? <input className="w-full border rounded px-2 py-1" value={m.pos || ''} onChange={(e) => updateMeaning(item.id, idx, 'pos', e.target.value)} /> : (m.pos || '-')}</td>}
                <td className="p-3">{isEditing ? <input className="w-full border rounded px-2 py-1" value={m.meaning || ''} onChange={(e) => updateMeaning(item.id, idx, 'meaning', e.target.value)} /> : (m.meaning || '-')}</td>
                {first && <td className="p-3" rowSpan={rowSpan}>{isEditing ? <input className="w-full border rounded px-2 py-1 mb-2" value={wordAudioPath} onChange={(e) => updateItem(item.id, type === 'word' ? { word_audio: e.target.value } : { phrase_audio: e.target.value })} placeholder="./audio/xxx.mp3" /> : null}<button onClick={() => playAudio(wordAudioPath)} disabled={!wordAudioPath} className="px-3 py-1.5 rounded border text-sm disabled:opacity-40">试听</button></td>}
                <td className="p-3">{isEditing ? <input className="w-full border rounded px-2 py-1" value={m.example || ''} onChange={(e) => updateMeaning(item.id, idx, 'example', e.target.value)} /> : (m.example || '-')}</td>
                <td className="p-3">{isEditing ? <input className="w-full border rounded px-2 py-1" value={m.example_zh || ''} onChange={(e) => updateMeaning(item.id, idx, 'example_zh', e.target.value)} /> : (m.example_zh || '-')}</td>
                <td className="p-3">{isEditing ? <input className="w-full border rounded px-2 py-1 mb-2" value={m.example_audio || ''} onChange={(e) => updateMeaning(item.id, idx, 'example_audio', e.target.value)} placeholder="./audio/xxx.mp3" /> : null}<button onClick={() => playAudio(m.example_audio || '')} disabled={!m.example_audio} className="px-3 py-1.5 rounded border text-sm disabled:opacity-40">试听</button></td>
                {isEditing && <td className="p-3 whitespace-nowrap"><button onClick={() => addMeaning(item.id)} className="px-2 py-1 rounded border text-xs mr-2">新增词性</button><button onClick={() => removeMeaning(item.id, idx)} disabled={arr.length <= 1} className="px-2 py-1 rounded border text-xs disabled:opacity-40">删除词性</button></td>}
              </tr>;
            }))}
          </tbody>
        </table>
      </div>

      {showGroupModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="w-[min(900px,96vw)] rounded-xl bg-white border border-outline-variant/30 shadow-xl p-5 space-y-4 max-h-[86vh] overflow-y-auto"><div className="flex items-center justify-between"><h4 className="text-lg font-black">{type === 'word' ? '单词分组' : '短语分组'}</h4><button onClick={() => setShowGroupModal(false)} className="rounded-md p-1 hover:bg-surface-container-low"><X className="w-4 h-4" /></button></div><div className="text-sm text-on-surface-variant">当前：{selectedBookVersion} / {selectedGrade} / {selectedSemester}</div><div className="flex gap-2"><button onClick={() => setGroupUnits(new Set(units))} className="px-3 py-1.5 rounded border text-sm font-bold">全选</button><button onClick={() => setGroupUnits(new Set())} className="px-3 py-1.5 rounded border text-sm font-bold">清空</button><span className="text-sm text-on-surface-variant px-1 py-1.5">已选 {groupUnits.size} / {units.length}</span></div><div className="max-h-52 overflow-auto border rounded-lg p-3 grid grid-cols-2 md:grid-cols-3 gap-2">{units.map((u) => <label key={u} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={groupUnits.has(u)} onChange={(e) => setGroupUnits((prev) => { const next = new Set(prev); e.target.checked ? next.add(u) : next.delete(u); return next; })} /><span>{u}</span></label>)}</div><div className="space-y-2"><label className="text-sm font-bold">每组数量</label><input value={groupSize} onChange={(e) => setGroupSize(e.target.value)} type="number" min={1} className="w-48 border rounded-lg px-3 py-2" /></div><div className="flex justify-end gap-2"><button onClick={() => setShowGroupModal(false)} className="px-4 py-2 border rounded-lg font-bold">取消</button><button onClick={() => applyGrouping(true)} disabled={grouping || groupUnits.size === 0} className="px-4 py-2 border rounded-lg font-bold disabled:opacity-40">{grouping ? '处理中...' : '取消分组'}</button><button onClick={() => applyGrouping(false)} disabled={grouping || groupUnits.size === 0} className="px-4 py-2 bg-secondary text-on-secondary rounded-lg font-bold disabled:opacity-40">{grouping ? '处理中...' : '确认分组'}</button></div></div></div>}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-[min(1200px,98vw)] rounded-xl bg-white border border-outline-variant/30 shadow-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-black">{type === 'word' ? '批量导入单词 JSONL' : '批量导入短语 JSONL'}</h4>
              <button onClick={() => setShowImportModal(false)} className="rounded-md p-1 hover:bg-surface-container-low"><X className="w-4 h-4" /></button>
            </div>
            <div className="rounded-lg bg-surface-container-low p-3 text-sm text-on-surface-variant">
              文件名规则：教材版本_年级_册数_单词表/短语表_时间戳.jsonl。系统将自动识别标签；可人工修正后再导入。
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input type="file" accept=".jsonl" multiple onChange={onImportFilesSelected} className="block border rounded-lg px-3 py-2" />
              <button onClick={recheckRows} disabled={checkingImportRows || importingBatch || !importRows.length} className="px-4 py-2 border rounded-lg font-bold disabled:opacity-40">
                {checkingImportRows ? '校验中...' : '重新校验'}
              </button>
            </div>
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-container-low">
                  <tr>
                    <th className="text-left p-2">文件名</th>
                    <th className="text-left p-2">类型</th>
                    <th className="text-left p-2">教材版本</th>
                    <th className="text-left p-2">年级</th>
                    <th className="text-left p-2">册数</th>
                    <th className="text-right p-2">条数</th>
                    <th className="text-left p-2">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {!importRows.length && (
                    <tr>
                      <td colSpan={7} className="p-4 text-center text-on-surface-variant">请选择要导入的 JSONL 文件</td>
                    </tr>
                  )}
                  {importRows.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="p-2">{row.fileName}</td>
                      <td className="p-2">{row.parsedType === 'word' ? '单词表' : row.parsedType === 'phrase' ? '短语表' : row.parsedType === 'passage' ? '课文表' : '未知'}</td>
                      <td className="p-2">
                        <select value={row.bookVersion} disabled={importingBatch || row.status === 'success'} onChange={(e) => updateImportRow(row.id, { bookVersion: e.target.value })} className="w-full border rounded px-2 py-1 bg-white">
                          <option value="">请选择教材</option>
                          {bookVersions.map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </td>
                      <td className="p-2">
                        <select value={row.grade} disabled={importingBatch || row.status === 'success'} onChange={(e) => updateImportRow(row.id, { grade: e.target.value })} className="w-full border rounded px-2 py-1 bg-white">
                          <option value="">请选择年级</option>
                          {grades.map((g) => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </td>
                      <td className="p-2">
                        <select value={normalizeSemester(row.semester)} disabled={importingBatch || row.status === 'success'} onChange={(e) => updateImportRow(row.id, { semester: normalizeSemester(e.target.value) })} className="w-full border rounded px-2 py-1 bg-white">
                          <option value="">请选择册数</option>
                          {semesters.map((s) => <option key={s} value={normalizeSemester(s)}>{normalizeSemester(s)}</option>)}
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
                {importingBatch ? '导入中...' : '确定导入'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

