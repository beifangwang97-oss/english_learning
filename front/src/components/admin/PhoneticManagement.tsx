import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Save, Trash2, Upload, Volume2, X } from 'lucide-react';
import { PhoneticExampleWord, PhoneticItem, lexiconApi } from '../../lib/lexicon';
import { getSessionToken } from '../../lib/session';

type ImportStatus = 'invalid' | 'ready' | 'importing' | 'success' | 'failed';

type ImportRow = {
  id: string;
  file: File;
  fileName: string;
  count: number;
  overwrite: boolean;
  status: ImportStatus;
  note?: string;
};

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const cloneItem = (item: PhoneticItem): PhoneticItem => JSON.parse(JSON.stringify(item));

const emptyExample = (): PhoneticExampleWord => ({
  word: '',
  phonetic: '',
  zh: '',
  word_audio: '',
});

const emptyItem = (): PhoneticItem => ({
  id: '',
  type: 'phoneme',
  phonetic: '',
  category: 'vowel',
  phoneme_audio: '',
  example_words: [emptyExample(), emptyExample(), emptyExample()],
});

export const PhoneticManagement: React.FC = () => {
  const token = useMemo(() => getSessionToken(), []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [serverFile, setServerFile] = useState<string | null>(null);

  const [items, setItems] = useState<PhoneticItem[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [editing, setEditing] = useState<PhoneticItem | null>(null);
  const [creating, setCreating] = useState(false);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);

  const loadItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await lexiconApi.getPhonetics(token);
      const nextItems = (res.items || []).map((item) => ({
        ...item,
        phoneme_audio: item.phoneme_audio || '',
        example_words: Array.isArray(item.example_words) && item.example_words.length
          ? item.example_words
          : [emptyExample(), emptyExample(), emptyExample()],
      }));
      setItems(nextItems);
      setServerFile(res.file || null);
      const nextSelectedId = selectedId && nextItems.some((item) => item.id === selectedId) ? selectedId : (nextItems[0]?.id || '');
      setSelectedId(nextSelectedId);
      const found = nextItems.find((item) => item.id === nextSelectedId) || null;
      setEditing(found ? cloneItem(found) : null);
      setCreating(false);
    } catch (e: any) {
      setError(e?.message || '加载音标失败');
      setItems([]);
      setSelectedId('');
      setEditing(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const selectItem = (id: string) => {
    setSelectedId(id);
    const found = items.find((item) => item.id === id) || null;
    setEditing(found ? cloneItem(found) : null);
    setCreating(false);
  };

  const createItem = () => {
    setEditing(emptyItem());
    setSelectedId('');
    setCreating(true);
  };

  const updateEditing = (patch: Partial<PhoneticItem>) => {
    setEditing((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const updateExample = (index: number, patch: Partial<PhoneticExampleWord>) => {
    setEditing((prev) => {
      if (!prev) return prev;
      const examples = [...(prev.example_words || [])];
      while (examples.length <= index) examples.push(emptyExample());
      examples[index] = { ...examples[index], ...patch };
      return { ...prev, example_words: examples };
    });
  };

  const addExample = () => {
    setEditing((prev) => (prev ? { ...prev, example_words: [...(prev.example_words || []), emptyExample()] } : prev));
  };

  const removeExample = (index: number) => {
    setEditing((prev) => {
      if (!prev) return prev;
      const next = (prev.example_words || []).filter((_, idx) => idx !== index);
      return { ...prev, example_words: next.length ? next : [emptyExample()] };
    });
  };

  const playAudio = async (path?: string) => {
    if (!path) return;
    try {
      await lexiconApi.playAudioWithAuth(token, path);
    } catch {
      setError('音频播放失败');
    }
  };

  const saveEditing = async () => {
    if (!editing) return;
    if (!editing.id.trim() || !editing.phonetic.trim() || !editing.category.trim()) {
      setError('音标ID、音标内容、分类不能为空');
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload: PhoneticItem = {
        ...editing,
        id: editing.id.trim(),
        type: editing.type?.trim() || 'phoneme',
        phonetic: editing.phonetic.trim(),
        category: editing.category.trim(),
        phoneme_audio: editing.phoneme_audio?.trim() || '',
        example_words: (editing.example_words || []).map((row) => ({
          word: row.word?.trim() || '',
          phonetic: row.phonetic?.trim() || '',
          zh: row.zh?.trim() || '',
          word_audio: row.word_audio?.trim() || '',
        })),
      };
      if (creating) {
        await lexiconApi.createPhonetic(token, payload);
        setMessage('音标新增成功');
      } else {
        await lexiconApi.updatePhonetic(token, selectedId, payload);
        setMessage('音标更新成功');
      }
      await loadItems();
    } catch (e: any) {
      setError(e?.message || '保存音标失败');
    } finally {
      setSaving(false);
    }
  };

  const deleteSelected = async () => {
    if (!editing || creating) return;
    if (!window.confirm(`确认删除音标 ${editing.phonetic} 吗？删除后不可恢复。`)) return;
    setError(null);
    setMessage(null);
    try {
      await lexiconApi.deletePhonetic(token, editing.id);
      setMessage('音标删除成功');
      await loadItems();
    } catch (e: any) {
      setError(e?.message || '删除音标失败');
    }
  };

  const deleteAll = async () => {
    if (!items.length) {
      setMessage('当前没有可删除的音标数据');
      return;
    }
    if (!window.confirm(`确认全部删除 ${items.length} 条音标数据吗？该操作不可恢复。`)) return;
    setDeletingAll(true);
    setError(null);
    setMessage(null);
    try {
      const res = await lexiconApi.deleteAllPhonetics(token);
      setMessage(`已全部删除 ${res.count} 条音标数据`);
      await loadItems();
    } catch (e: any) {
      setError(e?.message || '全部删除失败');
    } finally {
      setDeletingAll(false);
    }
  };

  const buildImportRows = async (files: File[]) => {
    const rows: ImportRow[] = [];
    for (const file of files) {
      let count = 0;
      let status: ImportStatus = 'ready';
      let note = '';
      try {
        const text = await file.text();
        const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        count = Math.max(0, lines.length - 1);
        for (const line of lines) JSON.parse(line);
        if (count <= 0) {
          status = 'invalid';
          note = '文件中没有可导入的音标记录';
        }
      } catch {
        status = 'invalid';
        note = 'JSONL 格式错误';
      }
      rows.push({
        id: newId(),
        file,
        fileName: file.name,
        count,
        overwrite: true,
        status,
        note: note || undefined,
      });
    }
    return rows;
  };

  const onImportFilesSelected = async (evt: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(evt.target.files || []);
    if (!files.length) return;
    setError(null);
    setMessage(null);
    setImportRows(await buildImportRows(files));
    evt.target.value = '';
  };

  const runBatchImport = async () => {
    const readyRows = importRows.filter((row) => row.status === 'ready');
    if (!readyRows.length) {
      setError('请先选择可导入的 JSONL 文件');
      return;
    }
    setImporting(true);
    setError(null);
    setMessage(null);
    try {
      let success = 0;
      let failed = 0;
      for (const row of readyRows) {
        setImportRows((prev) => prev.map((item) => item.id === row.id ? { ...item, status: 'importing', note: undefined } : item));
        try {
          const res = await lexiconApi.importPhoneticJsonl(token, { file: row.file, overwrite: row.overwrite });
          success += 1;
          setImportRows((prev) => prev.map((item) => item.id === row.id ? { ...item, status: 'success', note: `已导入 ${res.count} 条` } : item));
        } catch (e: any) {
          failed += 1;
          setImportRows((prev) => prev.map((item) => item.id === row.id ? { ...item, status: 'failed', note: e?.message || '导入失败' } : item));
        }
      }
      setMessage(`音标导入完成，成功 ${success} 个文件，失败 ${failed} 个文件`);
      await loadItems();
    } finally {
      setImporting(false);
    }
  };

  const statusLabel: Record<ImportStatus, string> = {
    invalid: '无效',
    ready: '可导入',
    importing: '导入中',
    success: '已导入',
    failed: '失败',
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-2xl font-black">音标管理</h3>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setShowImportModal(true)} className="px-4 py-2 rounded-lg border font-bold hover:bg-surface-container-low flex items-center gap-2">
            <Upload className="w-4 h-4" />
            导入 JSONL
          </button>
          <button onClick={deleteAll} disabled={deletingAll || loading} className="px-4 py-2 rounded-lg border border-red-300 text-red-700 font-bold hover:bg-red-50 disabled:opacity-40 flex items-center gap-2">
            <Trash2 className="w-4 h-4" />
            {deletingAll ? '删除中...' : '全部删除'}
          </button>
          <button onClick={createItem} className="px-4 py-2 rounded-lg border font-bold hover:bg-surface-container-low flex items-center gap-2">
            <Plus className="w-4 h-4" />
            新增音标
          </button>
        </div>
      </div>

      <div className="flex gap-3 text-sm">
        <span className="rounded-lg bg-surface-container-low px-3 py-1.5">总音标数：<b>{items.length}</b></span>
        <span className="rounded-lg bg-surface-container-low px-3 py-1.5">元音：<b>{items.filter((item) => item.category === 'vowel').length}</b></span>
        <span className="rounded-lg bg-surface-container-low px-3 py-1.5">辅音：<b>{items.filter((item) => item.category === 'consonant').length}</b></span>
      </div>

      {serverFile && <div className="text-xs text-on-surface-variant">数据来源：{serverFile}</div>}
      {message && <div className="rounded-lg bg-green-50 text-green-700 px-3 py-2 text-sm whitespace-pre-line">{message}</div>}
      {error && <div className="rounded-lg bg-red-50 text-red-700 px-3 py-2 text-sm whitespace-pre-line">{error}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-[520px_minmax(0,1fr)] gap-4 items-start">
        <div className="rounded-xl border border-outline-variant/30 overflow-hidden bg-surface-container-lowest h-[70vh] flex flex-col">
          <div className="overflow-y-auto flex-1">
            <table className="w-full border-collapse text-left table-fixed">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-outline-variant/30 bg-surface-container-low">
                <th className="p-3 w-28">分类</th>
                <th className="p-3 w-28">音标</th>
                <th className="p-3">示例词</th>
                </tr>
              </thead>
              <tbody>
                {!loading && items.length === 0 && (
                  <tr>
                    <td className="p-6 text-center text-on-surface-variant" colSpan={3}>当前暂无音标数据</td>
                  </tr>
                )}
                {items.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => selectItem(item.id)}
                    className={`border-b border-outline-variant/20 cursor-pointer ${selectedId === item.id ? 'bg-secondary-container/40' : 'hover:bg-surface-container-low'}`}
                  >
                    <td className="p-3">{item.category === 'vowel' ? '元音' : item.category === 'consonant' ? '辅音' : item.category}</td>
                    <td className="p-3 font-bold">{item.phonetic}</td>
                    <td className="p-3 truncate">{(item.example_words || []).map((row) => row.word).filter(Boolean).join(' / ') || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4 space-y-4">
          {!editing && <div className="text-sm text-on-surface-variant">请选择左侧音标，或点击“新增音标”创建新记录。</div>}
          {editing && (
            <>
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-black">{creating ? '新增音标' : '编辑音标'}</h4>
                <div className="flex items-center gap-2">
                  {!creating && (
                    <button onClick={deleteSelected} className="px-3 py-2 rounded-lg border border-red-300 text-red-700 font-bold hover:bg-red-50 flex items-center gap-2">
                      <Trash2 className="w-4 h-4" />
                      删除
                    </button>
                  )}
                  <button onClick={saveEditing} disabled={saving} className="px-3 py-2 rounded-lg bg-secondary text-on-secondary font-bold disabled:opacity-50 flex items-center gap-2">
                    <Save className="w-4 h-4" />
                    {saving ? '保存中...' : '保存'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="text-sm font-bold">音标ID</div>
                  <input value={editing.id} onChange={(e) => updateEditing({ id: e.target.value })} className="w-full border rounded px-3 py-2" placeholder="ph00000001" />
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-bold">类型</div>
                  <input value={editing.type} onChange={(e) => updateEditing({ type: e.target.value })} className="w-full border rounded px-3 py-2" placeholder="phoneme" />
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-bold">音标内容</div>
                  <input value={editing.phonetic} onChange={(e) => updateEditing({ phonetic: e.target.value })} className="w-full border rounded px-3 py-2" placeholder="/i:/" />
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-bold">分类</div>
                  <select value={editing.category} onChange={(e) => updateEditing({ category: e.target.value })} className="w-full border rounded px-3 py-2 bg-white">
                    <option value="vowel">vowel</option>
                    <option value="consonant">consonant</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-bold">音标音频</div>
                <div className="flex gap-2">
                  <input value={editing.phoneme_audio || ''} onChange={(e) => updateEditing({ phoneme_audio: e.target.value })} className="flex-1 border rounded px-3 py-2" placeholder="./audio/phonetics/ph00000001_phoneme.mp3" />
                  <button onClick={() => playAudio(editing.phoneme_audio)} disabled={!editing.phoneme_audio} className="px-3 py-2 rounded-lg border disabled:opacity-40 flex items-center gap-2">
                    <Volume2 className="w-4 h-4" />
                    试听
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold">示例单词</div>
                  <button onClick={addExample} className="px-3 py-1.5 rounded border text-sm font-bold">新增一行</button>
                </div>
                <div className="rounded-lg border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-container-low">
                      <tr>
                        <th className="p-2 text-left w-32">单词</th>
                        <th className="p-2 text-left w-32">音标</th>
                        <th className="p-2 text-left">中文释义</th>
                        <th className="p-2 text-left">音频路径</th>
                        <th className="p-2 text-left w-32">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(editing.example_words || []).map((row, index) => (
                        <tr key={`${editing.id || 'new'}-${index}`} className="border-t align-top">
                          <td className="p-2">
                            <input value={row.word || ''} onChange={(e) => updateExample(index, { word: e.target.value })} className="w-full border rounded px-2 py-1" />
                          </td>
                          <td className="p-2">
                            <input value={row.phonetic || ''} onChange={(e) => updateExample(index, { phonetic: e.target.value })} className="w-full border rounded px-2 py-1" placeholder="/si:/" />
                          </td>
                          <td className="p-2">
                            <input value={row.zh || ''} onChange={(e) => updateExample(index, { zh: e.target.value })} className="w-full border rounded px-2 py-1" />
                          </td>
                          <td className="p-2">
                            <input value={row.word_audio || ''} onChange={(e) => updateExample(index, { word_audio: e.target.value })} className="w-full border rounded px-2 py-1" placeholder="./audio/phonetics/ph00000001_word_1.mp3" />
                          </td>
                          <td className="p-2">
                            <div className="flex gap-2">
                              <button onClick={() => playAudio(row.word_audio)} disabled={!row.word_audio} className="px-2 py-1 rounded border disabled:opacity-40">试听</button>
                              <button onClick={() => removeExample(index)} className="px-2 py-1 rounded border text-red-700">删除</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-[min(980px,96vw)] rounded-xl bg-white border border-outline-variant/30 shadow-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-black">导入音标 JSONL</h4>
              <button onClick={() => setShowImportModal(false)} className="rounded-md p-1 hover:bg-surface-container-low">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="rounded-lg bg-surface-container-low p-3 text-sm text-on-surface-variant">
              请选择 `english_phonemes_seed.jsonl` 或 `english_phonemes_seed_mode6_working.jsonl` 这类音标源文件。导入会同步写入数据库。
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input type="file" accept=".jsonl" onChange={onImportFilesSelected} className="block border rounded-lg px-3 py-2" />
            </div>
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-container-low">
                  <tr>
                    <th className="p-3 text-left">文件名</th>
                    <th className="p-3 text-right">记录数</th>
                    <th className="p-3 text-left">覆盖现有数据</th>
                    <th className="p-3 text-left">状态</th>
                    <th className="p-3 text-left">说明</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.length === 0 && (
                    <tr>
                      <td className="p-4 text-center text-on-surface-variant" colSpan={5}>请选择要导入的 JSONL 文件</td>
                    </tr>
                  )}
                  {importRows.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="p-3">{row.fileName}</td>
                      <td className="p-3 text-right">{row.count}</td>
                      <td className="p-3">
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={row.overwrite}
                            disabled={importing || row.status === 'success'}
                            onChange={(e) => setImportRows((prev) => prev.map((item) => item.id === row.id ? { ...item, overwrite: e.target.checked } : item))}
                          />
                          <span>覆盖</span>
                        </label>
                      </td>
                      <td className="p-3">{statusLabel[row.status]}</td>
                      <td className="p-3 text-on-surface-variant">{row.note || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowImportModal(false)} className="px-4 py-2 border rounded-lg font-bold">取消</button>
              <button onClick={runBatchImport} disabled={importing || !importRows.length} className="px-4 py-2 rounded-lg bg-secondary text-on-secondary font-bold disabled:opacity-40">
                {importing ? '导入中...' : '开始导入'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
