import React, { useEffect, useMemo, useState } from 'react';
import { CheckSquare, Layers, Pencil, Plus, Save, Trash2, Upload, X } from 'lucide-react';
import { LexiconItem, TextbookScopeBookRow, formatSourceTagLabel, lexiconApi } from '../../lib/lexicon';
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
  sourceTag: string;
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
const stripBom = (value: string) => value.replace(/^\uFEFF/, '');
const normalizeSourceTagToken = (value?: string) => {
  const normalized = (value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!normalized) return '';
  if (['current', 'current_book', 'currentbook'].includes(normalized)) return 'current_book';
  if (['primary', 'primary_school_review', 'primaryschoolreview', 'primary_school', 'primary_review', 'review'].includes(normalized)) {
    return 'primary_school_review';
  }
  return normalized;
};
const parseFileMeta = (fileName: string) => {
  const base = fileName.replace(/\.jsonl$/i, '');
  const parts = base.split('_');
  const grade = (parts[0] || '').trim();
  const semester = normalizeSemester((parts[1] || '').trim());
  const suffix = parts.slice(2).map((part) => part.trim()).filter(Boolean).join('_');
  return {
    grade,
    semester,
    parsedType: 'unknown' as ImportRow['parsedType'],
    sourceTag: normalizeSourceTagToken(suffix),
  };
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

const resolveSourceTag = (value?: string) => normalizeSourceTagToken(value);

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
  const [textbookTree, setTextbookTree] = useState<TextbookScopeBookRow[]>([]);
  const [selectedBookVersion, setSelectedBookVersion] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('');
  const [selectedSemester, setSelectedSemester] = useState('');
  const [selectedSourceTag, setSelectedSourceTag] = useState('all');
  const [selectedUnit, setSelectedUnit] = useState('');
  const [items, setItems] = useState<LexiconItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isEditing, setIsEditing] = useState(false);
  const [moveTargetUnit, setMoveTargetUnit] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [groupMode, setGroupMode] = useState<'all' | 'custom'>('all');
  const [groupScope, setGroupScope] = useState<'semester' | 'book_version'>('semester');
  const [groupUnits, setGroupUnits] = useState<Set<string>>(new Set());
  const [groupSize, setGroupSize] = useState('10');
  const [grouping, setGrouping] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [checkingImportRows, setCheckingImportRows] = useState(false);
  const [importingBatch, setImportingBatch] = useState(false);
  const availableSourceTags = useMemo(
    () => Array.from(new Set(items.map((x) => resolveSourceTag(x.source_tag)))).sort(),
    [items]
  );

  const filteredBySource = useMemo(
    () => selectedSourceTag === 'all' ? items : items.filter((x) => resolveSourceTag(x.source_tag) === selectedSourceTag),
    [items, selectedSourceTag]
  );
  const units = useMemo(() => Array.from(new Set(filteredBySource.map((x) => x.unit || 'Unit 1'))).sort(sortUnit), [filteredBySource]);
  const visibleItems = useMemo(() => filteredBySource.filter((x) => x.unit === selectedUnit), [filteredBySource, selectedUnit]);
  const groupedTargetItems = useMemo(() => {
    const sourceMatched = selectedSourceTag === 'all'
      ? items
      : items.filter((item) => resolveSourceTag(item.source_tag) === selectedSourceTag);
    if (groupMode === 'all') return sourceMatched;
    const selected = new Set(groupUnits);
    return sourceMatched.filter((item) => selected.has(item.unit));
  }, [groupMode, groupUnits, items, selectedSourceTag]);
  const normalizedSemesters = useMemo(() => semesters.map(normalizeSemester), [semesters]);
  const scopeMap = useMemo(() => {
    const m = new Map<string, Map<string, string[]>>();
    textbookTree.forEach((book) => {
      const gradeMap = new Map<string, string[]>();
      (book.grades || []).forEach((gradeRow) => {
        const ss = (gradeRow.semesters || []).map(normalizeSemester);
        gradeMap.set(gradeRow.grade, Array.from(new Set(ss)));
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
    return fromScope.length ? fromScope : normalizedSemesters;
  }, [scopeMap, selectedBookVersion, selectedGrade, normalizedSemesters]);
  const getGradesForBook = (bookVersion: string) => {
    const fromScope = Array.from(scopeMap.get(bookVersion || '')?.keys() || []);
    return fromScope.length ? fromScope : grades;
  };
  const getSemestersForBookGrade = (bookVersion: string, gradeValue: string) => {
    const fromScope = scopeMap.get(bookVersion || '')?.get(gradeValue || '') || [];
    return fromScope.length ? fromScope : normalizedSemesters;
  };

  const loadOptions = async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, scopeRes] = await Promise.all([lexiconApi.getOptions(token, type), lexiconApi.getTextbookScopes(token)]);
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
        source_tag: resolveSourceTag(x.source_tag),
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
  useEffect(() => { if (selectedBookVersion && selectedGrade && selectedSemester) loadItems(selectedBookVersion, selectedGrade, selectedSemester); }, [selectedBookVersion, selectedGrade, selectedSemester]);
  useEffect(() => {
    if (selectedSourceTag === 'all') return;
    if (!availableSourceTags.includes(selectedSourceTag)) {
      setSelectedSourceTag('all');
    }
  }, [availableSourceTags, selectedSourceTag]);
  useEffect(() => {
    if (!units.length) {
      setSelectedUnit('');
      return;
    }
    if (!units.includes(selectedUnit)) {
      setSelectedUnit(units[0]);
    }
  }, [units, selectedUnit]);
  useEffect(() => { if (showImportModal) setImportRows([]); }, [showImportModal, type]);
  useEffect(() => {
    if (!showImportModal) return;
    setImportRows((prev) => prev.map((row) => ({ ...row, bookVersion: selectedBookVersion, status: row.status === 'success' ? 'success' : 'unchecked', note: row.status === 'success' ? row.note : undefined })));
  }, [selectedBookVersion, showImportModal]);
  useEffect(() => {
    if (showGroupModal) {
      setGroupMode('all');
      setGroupScope('semester');
      setGroupUnits(new Set(units));
      setGroupSize('10');
    }
  }, [showGroupModal, units]);

  const updateItem = (id: string, patch: Partial<LexiconItem>) => setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const updateMeaning = (id: string, idx: number, field: 'pos' | 'meaning' | 'example' | 'example_zh' | 'example_audio', value: string) => setItems((prev) => prev.map((x) => x.id !== id ? x : { ...x, meanings: x.meanings.map((m, i) => i === idx ? { ...m, [field]: value } : m) }));
  const toggleSelected = (id: string, checked: boolean) => setSelectedIds((prev) => { const next = new Set(prev); checked ? next.add(id) : next.delete(id); return next; });
  const addMeaning = (id: string) => setItems((prev) => prev.map((x) => x.id === id ? { ...x, meanings: [...x.meanings, { pos: '', meaning: '', example: '', example_zh: '', example_audio: '' }] } : x));
  const removeMeaning = (id: string, idx: number) => setItems((prev) => prev.map((x) => x.id === id && x.meanings.length > 1 ? { ...x, meanings: x.meanings.filter((_, i) => i !== idx) } : x));
  const addItem = () => selectedUnit && setItems((prev) => [{
    id: newId(),
    word: '',
    phonetic: '',
    unit: selectedUnit,
    group_no: undefined,
    type,
    book_version: selectedBookVersion,
    grade: selectedGrade,
    semester: selectedSemester,
    source_tag: selectedSourceTag === 'all' ? '' : selectedSourceTag,
    meanings: [{ pos: type === 'word' ? '' : 'phrase', meaning: '', example: '', example_zh: '', example_audio: '' }],
    word_audio: '',
    phrase_audio: '',
    syllable_text: '',
    syllable_pronunciation: [],
    memory_tip: '',
    proper_noun_type: ''
  }, ...prev]);
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
      const { grade, semester, sourceTag: fileSourceTag } = parseFileMeta(file.name);
      let count = 0;
      let status: ImportStatus = 'unchecked';
      let note = '';
      let effectiveSourceTag = fileSourceTag;
      const parsedType: ImportRow['parsedType'] = type;

      if (!grade || !semester) {
        status = 'invalid';
        note = '文件名需至少包含“年级_册数.jsonl”';
      }

      try {
        const rawText = await file.text();
        const lines = rawText
          .split(/\r?\n/)
          .map((x) => stripBom(x).trim())
          .filter(Boolean);
        count = lines.length;
        const embeddedTypes = new Set<string>();
        const embeddedSourceTags = new Set<string>();
        let sawSourceTagField = false;

        for (const line of lines) {
          const parsed = JSON.parse(line);
          const rowType = ((parsed?.type as string | undefined) || '').trim();
          if (rowType) embeddedTypes.add(rowType);
          if (Object.prototype.hasOwnProperty.call(parsed, 'source_tag')) {
            sawSourceTagField = true;
            embeddedSourceTags.add(resolveSourceTag(parsed?.source_tag));
          }
        }

        if (embeddedTypes.size > 1 || (embeddedTypes.size === 1 && !embeddedTypes.has(type))) {
          status = 'invalid';
          note = `当前页面仅支持导入${type === 'word' ? '单词' : '短语'}数据`;
        } else if (embeddedSourceTags.size > 1) {
          status = 'invalid';
          note = '同一个文件中存在多个 source_tag，暂不支持混合导入';
        } else if (fileSourceTag && embeddedSourceTags.size === 1 && !embeddedSourceTags.has(fileSourceTag)) {
          status = 'invalid';
          note = '文件名中的 source_tag 与 JSONL 内容中的 source_tag 不一致';
        } else if (!fileSourceTag && sawSourceTagField && embeddedSourceTags.size === 1) {
          effectiveSourceTag = Array.from(embeddedSourceTags)[0] || '';
        }
      } catch {
        status = 'invalid';
        note = 'JSONL 格式错误';
      }
      rows.push({
        id: newId(),
        file,
        fileName: file.name,
        parsedType,
        bookVersion: selectedBookVersion,
        grade,
        semester: normalizeSemester(semester),
        sourceTag: effectiveSourceTag,
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
        if (!row.bookVersion) {
          next[i] = { ...row, status: 'invalid', note: '请先选择目标教材版本' };
          continue;
        }
        if (!bookVersions.includes(row.bookVersion)) {
          next[i] = { ...row, status: 'invalid', note: '目标教材版本未在系统标签中配置' };
          continue;
        }
        if (!grades.includes(row.grade)) {
          next[i] = { ...row, status: 'invalid', note: '年级标签无效' };
          continue;
        }
        if (!normalizedSemesters.includes(normalizeSemester(row.semester))) {
          next[i] = { ...row, status: 'invalid', note: '册数标签无效' };
          continue;
        }
        if (!hasScopedTuple(row.bookVersion, row.grade, normalizeSemester(row.semester))) {
          next[i] = { ...row, status: 'invalid', note: '目标教材版本下未配置这个年级和册数' };
          continue;
        }
        if (row.count <= 0) {
          next[i] = { ...row, status: 'invalid', note: '文件中没有可导入的数据' };
          continue;
        }
        next[i] = { ...row, status: 'checking', note: undefined };
        setImportRows([...next]);
        try {
          const scope = await lexiconApi.getItemsCount(token, type, row.bookVersion, row.grade, normalizeSemester(row.semester), row.sourceTag);
          next[i] = scope.count > 0
            ? { ...row, semester: normalizeSemester(row.semester), status: 'exists', note: `数据库中已存在 ${scope.count} 条同范围同来源数据，请先删除后再导入` }
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
            sourceTag: row.sourceTag,
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
    if (groupMode === 'custom' && groupUnits.size === 0) return setError('\u81f3\u5c11\u9009\u62e9\u4e00\u4e2a\u5355\u5143\u540e\u624d\u80fd\u5206\u7ec4');
    const size = Math.floor(Number(groupSize));
    if (!clearOnly && (!Number.isFinite(size) || size <= 0)) return setError('\u6bcf\u7ec4\u6570\u91cf\u5fc5\u987b\u662f\u6b63\u6574\u6570');
    if (!(groupMode === 'all' && groupScope === 'book_version') && !groupedTargetItems.length) {
      return setError('\u5f53\u524d\u6761\u4ef6\u4e0b\u6ca1\u6709\u53ef\u5206\u7ec4\u7684\u6570\u636e');
    }
    setGrouping(true); setError(null); setMessage(null);
    try {
      if (groupMode === 'all' && groupScope === 'book_version') {
        const res = await lexiconApi.batchGroupItems(token, {
          type,
          bookVersion: selectedBookVersion,
          sourceTag: selectedSourceTag === 'all' ? undefined : selectedSourceTag,
          groupSize: clearOnly ? undefined : size,
          clearOnly,
        });
        setMessage(
          clearOnly
            ? `已取消整套教材分组：处理 ${res.affectedScopes} 个年级册数，${res.affectedEntries} 条数据`
            : `已完成整套教材分组：处理 ${res.affectedScopes} 个年级册数，${res.affectedEntries} 条数据`
        );
        setShowGroupModal(false);
        await loadItems(selectedBookVersion, selectedGrade, selectedSemester);
        return;
      }

      const selected = new Set(groupUnits);
      const counter = new Map<string, number>();
      const nextItems = items.map((item) => {
        if (selectedSourceTag !== 'all' && resolveSourceTag(item.source_tag) !== selectedSourceTag) return item;
        if (groupMode === 'custom' && !selected.has(item.unit)) return item;
        if (clearOnly) return { ...item, group_no: undefined };
        const counterKey = `${resolveSourceTag(item.source_tag) || '__empty__'}||${item.unit || ''}`;
        const idx = counter.get(counterKey) ?? 0;
        counter.set(counterKey, idx + 1);
        return { ...item, group_no: Math.floor(idx / size) + 1 };
      });
      await saveAll(nextItems, clearOnly ? '\u5df2\u53d6\u6d88\u5206\u7ec4\u5e76\u540c\u6b65\u6570\u636e\u5e93' : '\u5206\u7ec4\u5b8c\u6210\u5e76\u540c\u6b65\u6570\u636e\u5e93');
      setShowGroupModal(false);
    } finally { setGrouping(false); }
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-2xl font-black">{type === 'word' ? '单词库' : '短语库'}</h3>
        <select value={selectedBookVersion} onChange={(e) => { setSelectedBookVersion(e.target.value); }} className="border rounded-lg px-3 py-2 bg-white">{bookVersions.map((v) => <option key={v} value={v}>{v}</option>)}</select>
        <select value={selectedGrade} onChange={(e) => setSelectedGrade(e.target.value)} className="border rounded-lg px-3 py-2 bg-white">{gradesForSelectedBook.map((g) => <option key={g} value={g}>{g}</option>)}</select>
        <select value={selectedSemester} onChange={(e) => setSelectedSemester(e.target.value)} className="border rounded-lg px-3 py-2 bg-white">{semestersForSelectedScope.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <select value={selectedSourceTag} onChange={(e) => setSelectedSourceTag(e.target.value)} className="border rounded-lg px-3 py-2 bg-white">
          <option value="all">全部来源</option>
          {availableSourceTags.map((tag) => <option key={tag} value={tag}>{formatSourceTagLabel(tag)}</option>)}
        </select>
        <select value={selectedUnit} onChange={(e) => setSelectedUnit(e.target.value)} className="border rounded-lg px-3 py-2 bg-white">{units.map((u) => <option key={u} value={u}>{u}</option>)}</select>
        <div className="ml-auto flex items-center gap-2">
          {!isEditing && <button onClick={() => {
            setShowGroupModal(true);
          }} className="px-4 py-2 rounded-lg border font-bold hover:bg-surface-container-low flex items-center gap-2"><Layers className="w-4 h-4" /> {'\u5206\u7ec4'}</button>}
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

      <div className="rounded-xl border border-outline-variant/30 overflow-x-auto bg-surface-container-lowest">
        <table className="w-full border-collapse text-left table-fixed">
          <thead>
            <tr className="border-b border-outline-variant/30 bg-surface-container-low">
              {isEditing && <th className="p-3 w-12"><CheckSquare className="w-4 h-4" /></th>}
              <th className="p-3 w-24">{'\u5206\u7ec4'}</th>
              <th className="p-3">{'\u82f1\u6587'}</th>
              {type === 'word' && <th className="p-3">{'\u97f3\u6807'}</th>}
              {type === 'word' && <th className="p-3">{'\u97f3\u8282'}</th>}
              {type === 'word' && <th className="p-3">{'\u97f3\u8282\u53d1\u97f3'}</th>}
              {type === 'word' && <th className="p-3">{'\u8bb0\u5fc6\u63d0\u793a'}</th>}
              {type === 'word' && <th className="p-3">{'\u4e13\u6709\u540d\u8bcd\u7c7b\u578b'}</th>}
              {type === 'word' && <th className="p-3">{'\u8bcd\u6027'}</th>}
              <th className="p-3">{'\u4e2d\u6587\u91ca\u4e49'}</th>
              <th className="p-3">{'\u5f55\u97f3'}</th>
              <th className="p-3">{'\u4f8b\u53e5'}</th>
              <th className="p-3">{'\u4f8b\u53e5\u4e2d\u6587'}</th>
              <th className="p-3">{'\u4f8b\u53e5\u5f55\u97f3'}</th>
              {isEditing && <th className="p-3">{'\u64cd\u4f5c'}</th>}
            </tr>
          </thead>
          <tbody>
            {!loading && visibleItems.length === 0 && (
              <tr>
                <td className="p-6 text-center text-on-surface-variant" colSpan={type === 'word' ? (isEditing ? 15 : 13) : (isEditing ? 9 : 7)}>
                  {'\u5f53\u524d\u7b5b\u9009\u4e0b\u6682\u65e0\u6570\u636e'}
                </td>
              </tr>
            )}
            {visibleItems.map((item) => (item.meanings.length ? item.meanings : [{ pos: '', meaning: '', example: '', example_zh: '', example_audio: '' }]).map((m, idx, arr) => {
              const first = idx === 0; const rowSpan = arr.length; const wordAudioPath = type === 'word' ? (item.word_audio || '') : (item.phrase_audio || '');
              const syllablePronunciationText = (item.syllable_pronunciation || []).join(' / ');
              return <tr key={`${item.id}-${idx}`} className="border-b border-outline-variant/20 align-top">
                {isEditing && first && <td className="p-3" rowSpan={rowSpan}><input type="checkbox" checked={selectedIds.has(item.id)} onChange={(e) => toggleSelected(item.id, e.target.checked)} /></td>}
                {first && <td className="p-3" rowSpan={rowSpan}>{item.group_no ? `\u7b2c${item.group_no}\u7ec4` : '-'}</td>}
                {first && <td className="p-3" rowSpan={rowSpan}>{isEditing ? <input className="w-full border rounded px-2 py-1" value={item.word} onChange={(e) => updateItem(item.id, { word: e.target.value })} /> : <span className="font-bold">{item.word}</span>}</td>}
                {type === 'word' && first && <td className="p-3" rowSpan={rowSpan}>{isEditing ? <input className="w-full border rounded px-2 py-1" value={item.phonetic || ''} onChange={(e) => updateItem(item.id, { phonetic: e.target.value })} /> : (item.phonetic || '-')}</td>}
                {type === 'word' && first && <td className="p-3" rowSpan={rowSpan}>{isEditing ? <input className="w-full border rounded px-2 py-1" value={item.syllable_text || ''} onChange={(e) => updateItem(item.id, { syllable_text: e.target.value })} /> : (item.syllable_text || '-')}</td>}
                {type === 'word' && first && <td className="p-3" rowSpan={rowSpan}>{isEditing ? <input className="w-full border rounded px-2 py-1" value={syllablePronunciationText} onChange={(e) => updateItem(item.id, { syllable_pronunciation: e.target.value.split('/').map((x) => x.trim()).filter(Boolean) })} placeholder="\u02c8la\u026a / \u0259n" /> : (syllablePronunciationText || '-')}</td>}
                {type === 'word' && first && <td className="p-3" rowSpan={rowSpan}>{isEditing ? <input className="w-full border rounded px-2 py-1" value={item.memory_tip || ''} onChange={(e) => updateItem(item.id, { memory_tip: e.target.value })} /> : (item.memory_tip || '-')}</td>}
                {type === 'word' && first && <td className="p-3" rowSpan={rowSpan}>{isEditing ? <input className="w-full border rounded px-2 py-1" value={item.proper_noun_type || ''} onChange={(e) => updateItem(item.id, { proper_noun_type: e.target.value })} /> : (item.proper_noun_type || '-')}</td>}
                {type === 'word' && <td className="p-3">{isEditing ? <input className="w-full border rounded px-2 py-1" value={m.pos || ''} onChange={(e) => updateMeaning(item.id, idx, 'pos', e.target.value)} /> : (m.pos || '-')}</td>}
                <td className="p-3">{isEditing ? <input className="w-full border rounded px-2 py-1" value={m.meaning || ''} onChange={(e) => updateMeaning(item.id, idx, 'meaning', e.target.value)} /> : (m.meaning || '-')}</td>
                {first && <td className="p-3" rowSpan={rowSpan}>{isEditing ? <input className="w-full border rounded px-2 py-1 mb-2" value={wordAudioPath} onChange={(e) => updateItem(item.id, type === 'word' ? { word_audio: e.target.value } : { phrase_audio: e.target.value })} placeholder="./audio/xxx.mp3" /> : null}<button onClick={() => playAudio(wordAudioPath)} disabled={!wordAudioPath} className="px-3 py-1.5 rounded border text-sm disabled:opacity-40">{'\u8bd5\u542c'}</button></td>}
                <td className="p-3">{isEditing ? <input className="w-full border rounded px-2 py-1" value={m.example || ''} onChange={(e) => updateMeaning(item.id, idx, 'example', e.target.value)} /> : (m.example || '-')}</td>
                <td className="p-3">{isEditing ? <input className="w-full border rounded px-2 py-1" value={m.example_zh || ''} onChange={(e) => updateMeaning(item.id, idx, 'example_zh', e.target.value)} /> : (m.example_zh || '-')}</td>
                <td className="p-3">{isEditing ? <input className="w-full border rounded px-2 py-1 mb-2" value={m.example_audio || ''} onChange={(e) => updateMeaning(item.id, idx, 'example_audio', e.target.value)} placeholder="./audio/xxx.mp3" /> : null}<button onClick={() => playAudio(m.example_audio || '')} disabled={!m.example_audio} className="px-3 py-1.5 rounded border text-sm disabled:opacity-40">{'\u8bd5\u542c'}</button></td>
                {isEditing && <td className="p-3 whitespace-nowrap"><button onClick={() => addMeaning(item.id)} className="px-2 py-1 rounded border text-xs mr-2">{'\u65b0\u589e\u8bcd\u6027'}</button><button onClick={() => removeMeaning(item.id, idx)} disabled={arr.length <= 1} className="px-2 py-1 rounded border text-xs disabled:opacity-40">{'\u5220\u9664\u8bcd\u6027'}</button></td>}
              </tr>;
            }))}
          </tbody>
        </table>
      </div>

      {showGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-[min(900px,96vw)] rounded-xl bg-white border border-outline-variant/30 shadow-xl p-5 space-y-4 max-h-[86vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-black">{type === 'word' ? '\u5355\u8bcd\u5206\u7ec4' : '\u77ed\u8bed\u5206\u7ec4'}</h4>
              <button onClick={() => setShowGroupModal(false)} className="rounded-md p-1 hover:bg-surface-container-low"><X className="w-4 h-4" /></button>
            </div>
            <div className="text-sm text-on-surface-variant">
              {'\u5f53\u524d\u8303\u56f4\uff1a'}{selectedBookVersion} / {selectedGrade} / {selectedSemester} / {formatSourceTagLabel(selectedSourceTag)}
            </div>
            {groupMode === 'all' && (
              <div className="space-y-2 rounded-lg border border-outline-variant/30 p-4">
                <div className="text-sm font-bold">{'\u5206\u7ec4\u8303\u56f4'}</div>
                <label className="flex items-start gap-3 text-sm">
                  <input type="radio" name="group-scope" checked={groupScope === 'semester'} onChange={() => setGroupScope('semester')} className="mt-1" />
                  <span>
                    <span className="block font-bold">{'\u53ea\u5904\u7406\u5f53\u524d\u5e74\u7ea7\u518c\u6570'}</span>
                    <span className="block text-on-surface-variant">{'\u4ec5\u5bf9\u5f53\u524d\u9009\u4e2d\u7684\u5e74\u7ea7 + \u518c\u6570\u6267\u884c\u6279\u91cf\u5206\u7ec4\u3002'}</span>
                  </span>
                </label>
                <label className="flex items-start gap-3 text-sm">
                  <input type="radio" name="group-scope" checked={groupScope === 'book_version'} onChange={() => setGroupScope('book_version')} className="mt-1" />
                  <span>
                    <span className="block font-bold">{'\u5904\u7406\u5f53\u524d\u6559\u6750\u7248\u672c\u4e0b\u5168\u90e8\u5e74\u7ea7\u518c\u6570'}</span>
                    <span className="block text-on-surface-variant">{'\u4f1a\u5bf9\u8be5\u6559\u6750\u7248\u672c\u4e0b\u6240\u6709\u5df2\u914d\u7f6e\u7684\u5e74\u7ea7\u3001\u518c\u6570\u4e00\u952e\u6279\u91cf\u5206\u7ec4\uff0c\u4f46\u4ecd\u4f1a\u6309\u5e74\u7ea7\u518c\u6570\u3001source_tag \u5206\u5f00\u5904\u7406\u3002'}</span>
                  </span>
                </label>
              </div>
            )}
            <div className="space-y-3 rounded-lg border border-outline-variant/30 p-4">
              <label className="flex items-start gap-3 text-sm">
                <input type="radio" name="group-mode" checked={groupMode === 'all'} onChange={() => setGroupMode('all')} className="mt-1" />
                <span>
                  <span className="block font-bold">{'\u6309\u5f53\u524d\u6765\u6e90\u4e0b\u5168\u90e8\u5355\u5143\u6279\u91cf\u5206\u7ec4'}</span>
                  <span className="block text-on-surface-variant">{selectedSourceTag === 'all' ? '\u4f1a\u5728\u5f53\u524d\u5e74\u7ea7\u518c\u6570\u5185\u6279\u91cf\u5904\u7406\uff0c\u4f46\u4e0d\u540c source_tag \u4ecd\u7136\u5404\u5206\u5404\u7684\uff0c\u4e0d\u4f1a\u6df7\u5728\u4e00\u8d77\u3002' : '\u5f53\u524d\u9009\u4e2d source_tag \u4e0b\u7684\u6240\u6709\u5355\u5143\u4f1a\u6279\u91cf\u5206\u7ec4\uff0c\u4e0d\u4f1a\u5f71\u54cd\u5176\u4ed6\u6765\u6e90\u3002'}</span>
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input type="radio" name="group-mode" checked={groupMode === 'custom'} onChange={() => setGroupMode('custom')} className="mt-1" />
                <span>
                  <span className="block font-bold">{'\u53ea\u5bf9\u6307\u5b9a\u5355\u5143\u6279\u91cf\u5206\u7ec4'}</span>
                  <span className="block text-on-surface-variant">{'\u9009\u4e2d\u7684\u5355\u5143\u4f1a\u5408\u5e76\u540e\u8fde\u7eed\u7f16\u53f7\uff0c\u4e0d\u4f1a\u6309\u5355\u5143\u91cd\u65b0\u4ece\u7b2c 1 \u7ec4\u5f00\u59cb\u3002'}</span>
                </span>
              </label>
            </div>
            {groupMode === 'custom' && (
              <>
                <div className="flex gap-2">
                  <button onClick={() => setGroupUnits(new Set(units))} className="px-3 py-1.5 rounded border text-sm font-bold">{'\u5168\u9009'}</button>
                  <button onClick={() => setGroupUnits(new Set())} className="px-3 py-1.5 rounded border text-sm font-bold">{'\u6e05\u7a7a'}</button>
                  <span className="text-sm text-on-surface-variant px-1 py-1.5">{'\u5df2\u9009 '}{groupUnits.size} / {units.length}</span>
                </div>
                <div className="max-h-52 overflow-auto border rounded-lg p-3 grid grid-cols-2 md:grid-cols-3 gap-2">
                  {units.map((u) => (
                    <label key={u} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={groupUnits.has(u)}
                        onChange={(e) => setGroupUnits((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(u);
                          else next.delete(u);
                          return next;
                        })}
                      />
                      <span>{u}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
            <div className="space-y-2">
              <label className="text-sm font-bold">{'\u6bcf\u7ec4\u6570\u91cf'}</label>
              <input value={groupSize} onChange={(e) => setGroupSize(e.target.value)} type="number" min={1} className="w-48 border rounded-lg px-3 py-2" />
            </div>
            <div className="rounded-lg bg-surface-container-low px-3 py-2 text-sm text-on-surface-variant space-y-1">
              <div>
                {groupMode === 'all' && groupScope === 'book_version'
                  ? '\u672c\u6b21\u5c06\u5bf9\u5f53\u524d\u6559\u6750\u7248\u672c\u4e0b\u7684\u5168\u90e8\u5e74\u7ea7\u518c\u6570\u6267\u884c\u6279\u91cf\u5206\u7ec4\u3002'
                  : <>{'\u672c\u6b21\u5c06\u5904\u7406 '}{groupedTargetItems.length}{' \u6761'}{type === 'word' ? '\u5355\u8bcd' : '\u77ed\u8bed'}{'\u3002'}</>}
              </div>
              <div>
                {selectedSourceTag === 'all'
                  ? '\u82e5\u5f53\u524d\u6709\u591a\u4e2a source_tag\uff0c\u7cfb\u7edf\u4f1a\u6309 source_tag \u5206\u5f00\u5206\u7ec4\uff0c\u4e0d\u4f1a\u4e92\u76f8\u6df7\u7528\u7ec4\u53f7\u3002'
                  : '\u5206\u7ec4\u4ec5\u4f5c\u7528\u4e8e\u5f53\u524d source_tag\uff0c\u4e0d\u4f1a\u5f71\u54cd\u5176\u4ed6\u6765\u6e90\u3002'}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowGroupModal(false)} className="px-4 py-2 border rounded-lg font-bold">{'\u53d6\u6d88'}</button>
              <button onClick={() => applyGrouping(true)} disabled={grouping || (!(groupMode === 'all' && groupScope === 'book_version') && !groupedTargetItems.length)} className="px-4 py-2 border rounded-lg font-bold disabled:opacity-40">
                {grouping ? '\u5904\u7406\u4e2d...' : '\u53d6\u6d88\u5206\u7ec4'}
              </button>
              <button onClick={() => applyGrouping(false)} disabled={grouping || (!(groupMode === 'all' && groupScope === 'book_version') && !groupedTargetItems.length)} className="px-4 py-2 bg-secondary text-on-secondary rounded-lg font-bold disabled:opacity-40">
                {grouping ? '\u5904\u7406\u4e2d...' : '\u786e\u8ba4\u5206\u7ec4'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-[min(1200px,98vw)] rounded-xl bg-white border border-outline-variant/30 shadow-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-black">{type === 'word' ? '批量导入单词 JSONL' : '批量导入短语 JSONL'}</h4>
              <button onClick={() => setShowImportModal(false)} className="rounded-md p-1 hover:bg-surface-container-low"><X className="w-4 h-4" /></button>
            </div>
            <div className="rounded-lg bg-surface-container-low p-3 text-sm text-on-surface-variant space-y-1">
              <div>目标教材版本：{selectedBookVersion || '未选择'}</div>
              <div>文件名规则：`年级_册数.jsonl`，也兼容 `年级_册数_current.jsonl` 和 `年级_册数_primary.jsonl` 这类末尾带来源标签的文件。</div>
              <div>导入时会先校验目标教材版本下是否已配置对应的年级和册数；如果文件名里没有 `source_tag`，会继续尝试从 JSONL 内容中读取。</div>
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
                    <th className="text-left p-2">目标教材版本</th>
                    <th className="text-left p-2">年级</th>
                    <th className="text-left p-2">册数</th>
                    <th className="text-left p-2">来源标签</th>
                    <th className="text-right p-2">条数</th>
                    <th className="text-left p-2">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {!importRows.length && (
                    <tr>
                      <td colSpan={8} className="p-4 text-center text-on-surface-variant">请选择要导入的 JSONL 文件</td>
                    </tr>
                  )}
                  {importRows.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="p-2">{row.fileName}</td>
                      <td className="p-2">{row.parsedType === 'word' ? '单词表' : row.parsedType === 'phrase' ? '短语表' : row.parsedType === 'passage' ? '课文表' : '未知'}</td>
                      <td className="p-2">{row.bookVersion || '-'}</td>
                      <td className="p-2">{row.grade || '-'}</td>
                      <td className="p-2">{normalizeSemester(row.semester) || '-'}</td>
                      <td className="p-2">{formatSourceTagLabel(row.sourceTag)}</td>
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

