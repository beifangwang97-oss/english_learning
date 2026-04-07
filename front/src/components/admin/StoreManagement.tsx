import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AdminStore, AdminUser, accountMetaApi, adminStoreApi, adminUserApi } from '../../lib/auth';

type EditableStore = AdminStore & { editing?: boolean };

type MultiSelectProps = {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
};

function normalizeStore(value?: string | null) {
  return (value || '').trim();
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

function keepOnlyDbValues(values: string[], dbValues: string[]) {
  const dbSet = new Set(dbValues);
  return unique(values).filter((v) => dbSet.has(v));
}

const CheckboxMultiSelect: React.FC<MultiSelectProps> = ({ options, value, onChange, placeholder }) => {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const text = value.length > 0 ? value.join('、') : placeholder;

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full border rounded px-2 py-2 text-sm text-left bg-white"
        title={text}
      >
        <span className="block truncate">{text}</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[220px] max-h-52 overflow-auto rounded border border-outline-variant/40 bg-white shadow-lg p-2 space-y-1">
          {options.map((opt) => {
            const checked = value.includes(opt);
            return (
              <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    if (e.target.checked) onChange(unique([...value, opt]));
                    else onChange(value.filter((v) => v !== opt));
                  }}
                />
                <span>{opt}</span>
              </label>
            );
          })}
          {options.length === 0 && <div className="text-xs text-on-surface-variant">暂无可选项</div>}
        </div>
      )}
    </div>
  );
};

export const StoreManagement: React.FC = () => {
  const token = useMemo(() => localStorage.getItem('token') || '', []);

  const [stores, setStores] = useState<EditableStore[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [bookOptions, setBookOptions] = useState<string[]>([]);
  const [gradeOptions, setGradeOptions] = useState<string[]>([]);

  const [newStore, setNewStore] = useState<Omit<AdminStore, 'storeCode'>>({
    storeName: '',
    teacherMax: 5,
    studentMax: 200,
    textbookPermissions: [],
    gradePermissions: [],
  });

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [storeData, userData, optionData] = await Promise.all([
        adminStoreApi.getAllStores(token),
        adminUserApi.getAllUsers(token),
        accountMetaApi.getLexiconOptions(token),
      ]);

      const books = unique(optionData.bookVersions || []);
      const grades = unique(optionData.grades || []);
      setBookOptions(books);
      setGradeOptions(grades);
      setUsers(userData || []);

      const normalizedStores = (storeData || []).map((s) => ({
        ...s,
        textbookPermissions: keepOnlyDbValues(s.textbookPermissions || [], books),
        gradePermissions: keepOnlyDbValues(s.gradePermissions || [], grades),
        editing: false,
      }));
      setStores(normalizedStores);
    } catch (e: any) {
      setError(e?.message || '加载门店数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  const storeNameToCode = useMemo(() => {
    const map = new Map<string, string>();
    stores.forEach((s) => map.set(normalizeStore(s.storeName), s.storeCode));
    return map;
  }, [stores]);

  const storeCounts = useMemo(() => {
    const counter = new Map<string, { teacher: number; student: number }>();
    stores.forEach((s) => counter.set(s.storeCode, { teacher: 0, student: 0 }));
    users.forEach((u) => {
      if (u.role !== 'teacher' && u.role !== 'student') return;
      const raw = normalizeStore(u.storeName);
      const code = counter.has(raw) ? raw : (storeNameToCode.get(raw) || '');
      if (!code || !counter.has(code)) return;
      const c = counter.get(code)!;
      if (u.role === 'teacher') c.teacher += 1;
      if (u.role === 'student') c.student += 1;
    });
    return counter;
  }, [stores, users, storeNameToCode]);

  const updateStore = <K extends keyof EditableStore>(storeCode: string, key: K, value: EditableStore[K]) => {
    setStores((prev) => prev.map((s) => (s.storeCode === storeCode ? { ...s, [key]: value } : s)));
  };

  const toggleEdit = (storeCode: string) => {
    setStores((prev) => prev.map((s) => (s.storeCode === storeCode ? { ...s, editing: !s.editing } : s)));
  };

  const saveStore = async (row: EditableStore) => {
    if (!row.storeName.trim()) {
      setError('门店名称不能为空');
      return;
    }
    if (!row.teacherMax || row.teacherMax <= 0 || !row.studentMax || row.studentMax <= 0) {
      setError('老师上限和学生上限必须大于 0');
      return;
    }
    setSavingCode(row.storeCode);
    setError(null);
    setMessage(null);
    try {
      const saved = await adminStoreApi.updateStore(token, row.storeCode, {
        storeName: row.storeName.trim(),
        teacherMax: Number(row.teacherMax),
        studentMax: Number(row.studentMax),
        textbookPermissions: keepOnlyDbValues(row.textbookPermissions || [], bookOptions),
        gradePermissions: keepOnlyDbValues(row.gradePermissions || [], gradeOptions),
      });
      setStores((prev) => prev.map((s) => (s.storeCode === row.storeCode ? { ...saved, editing: false } : s)));
      setMessage(`门店 ${row.storeCode} 保存成功`);
    } catch (e: any) {
      setError(e?.message || '保存门店失败');
    } finally {
      setSavingCode(null);
    }
  };

  const createStore = async () => {
    if (!newStore.storeName.trim()) {
      setError('门店名称不能为空');
      return;
    }
    if (!newStore.teacherMax || newStore.teacherMax <= 0 || !newStore.studentMax || newStore.studentMax <= 0) {
      setError('老师上限和学生上限必须大于 0');
      return;
    }
    setCreating(true);
    setError(null);
    setMessage(null);
    try {
      const created = await adminStoreApi.createStore(token, {
        storeName: newStore.storeName.trim(),
        teacherMax: Number(newStore.teacherMax),
        studentMax: Number(newStore.studentMax),
        textbookPermissions: keepOnlyDbValues(newStore.textbookPermissions || [], bookOptions),
        gradePermissions: keepOnlyDbValues(newStore.gradePermissions || [], gradeOptions),
      });
      setStores((prev) => [{ ...created, editing: false }, ...prev]);
      setNewStore({
        storeName: '',
        teacherMax: 5,
        studentMax: 200,
        textbookPermissions: [],
        gradePermissions: [],
      });
      setMessage(`门店 ${created.storeCode} 新增成功`);
    } catch (e: any) {
      setError(e?.message || '新增门店失败');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-3">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">{message}</div>}

      <div className="rounded-xl border border-outline-variant/30 p-3 bg-surface-container-lowest">
        <div className="text-sm font-bold mb-2">新增门店</div>
        <div className="grid grid-cols-1 md:grid-cols-7 gap-2 items-start">
          <input
            className="border rounded px-2 py-2 text-sm"
            placeholder="门店名称"
            value={newStore.storeName}
            onChange={(e) => setNewStore((p) => ({ ...p, storeName: e.target.value }))}
          />
          <input
            type="number"
            min={1}
            className="border rounded px-2 py-2 text-sm"
            placeholder="老师上限"
            value={newStore.teacherMax}
            onChange={(e) => setNewStore((p) => ({ ...p, teacherMax: Number(e.target.value) }))}
          />
          <input
            type="number"
            min={1}
            className="border rounded px-2 py-2 text-sm"
            placeholder="学生上限"
            value={newStore.studentMax}
            onChange={(e) => setNewStore((p) => ({ ...p, studentMax: Number(e.target.value) }))}
          />

          <CheckboxMultiSelect
            options={bookOptions}
            value={newStore.textbookPermissions || []}
            onChange={(next) => setNewStore((p) => ({ ...p, textbookPermissions: keepOnlyDbValues(next, bookOptions) }))}
            placeholder="选择教材版本"
          />
          <CheckboxMultiSelect
            options={gradeOptions}
            value={newStore.gradePermissions || []}
            onChange={(next) => setNewStore((p) => ({ ...p, gradePermissions: keepOnlyDbValues(next, gradeOptions) }))}
            placeholder="选择年级范围"
          />
          <div className="text-sm text-on-surface-variant px-2 py-2" />
          <button
            onClick={createStore}
            disabled={creating}
            className="px-3 py-2 rounded-lg bg-primary text-on-primary text-sm font-bold disabled:opacity-40"
          >
            {creating ? '新增中...' : '新增门店'}
          </button>
        </div>
      </div>

      <div className="overflow-auto max-h-[62vh] border border-outline-variant/30 rounded-xl">
        <table className="w-full min-w-[1550px] text-left border-collapse">
          <thead>
            <tr className="bg-surface-container-low border-b border-outline-variant/30">
              <th className="p-3 font-bold">门店编码</th>
              <th className="p-3 font-bold">门店名称</th>
              <th className="p-3 font-bold">老师上限</th>
              <th className="p-3 font-bold">学生上限</th>
              <th className="p-3 font-bold">权限-教材版本</th>
              <th className="p-3 font-bold">权限-年级范围</th>
              <th className="p-3 font-bold">当前老师人数</th>
              <th className="p-3 font-bold">当前学生人数</th>
              <th className="p-3 font-bold text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="p-4 text-sm text-on-surface-variant">加载中...</td></tr>}
            {!loading && stores.map((s) => {
              const count = storeCounts.get(s.storeCode) || { teacher: 0, student: 0 };
              return (
                <tr key={s.storeCode} className="border-b border-outline-variant/20">
                  <td className="p-3 font-mono">{s.storeCode}</td>
                  <td className="p-3">
                    {s.editing ? (
                      <input className="border rounded px-2 py-1 w-44 text-sm" value={s.storeName} onChange={(e) => updateStore(s.storeCode, 'storeName', e.target.value)} />
                    ) : (
                      <span>{s.storeName}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {s.editing ? (
                      <input type="number" min={1} className="border rounded px-2 py-1 w-24 text-sm" value={s.teacherMax} onChange={(e) => updateStore(s.storeCode, 'teacherMax', Number(e.target.value))} />
                    ) : (
                      <span>{s.teacherMax}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {s.editing ? (
                      <input type="number" min={1} className="border rounded px-2 py-1 w-24 text-sm" value={s.studentMax} onChange={(e) => updateStore(s.storeCode, 'studentMax', Number(e.target.value))} />
                    ) : (
                      <span>{s.studentMax}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {s.editing ? (
                      <CheckboxMultiSelect
                        options={bookOptions}
                        value={s.textbookPermissions || []}
                        onChange={(next) => updateStore(s.storeCode, 'textbookPermissions', keepOnlyDbValues(next, bookOptions))}
                        placeholder="选择教材版本"
                      />
                    ) : (
                      <span className="text-sm block truncate max-w-[220px]" title={(s.textbookPermissions || []).join('、')}>
                        {(s.textbookPermissions || []).join('、') || '-'}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    {s.editing ? (
                      <CheckboxMultiSelect
                        options={gradeOptions}
                        value={s.gradePermissions || []}
                        onChange={(next) => updateStore(s.storeCode, 'gradePermissions', keepOnlyDbValues(next, gradeOptions))}
                        placeholder="选择年级范围"
                      />
                    ) : (
                      <span className="text-sm block truncate max-w-[220px]" title={(s.gradePermissions || []).join('、')}>
                        {(s.gradePermissions || []).join('、') || '-'}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-sm">{count.teacher}</td>
                  <td className="p-3 text-sm">{count.student}</td>
                  <td className="p-3 text-right">
                    {!s.editing ? (
                      <button onClick={() => toggleEdit(s.storeCode)} className="px-3 py-1.5 rounded-lg border border-outline-variant font-bold text-sm">
                        编辑
                      </button>
                    ) : (
                      <button onClick={() => saveStore(s)} disabled={savingCode === s.storeCode} className="px-3 py-1.5 rounded-lg bg-secondary text-on-secondary font-bold text-sm disabled:opacity-40">
                        {savingCode === s.storeCode ? '保存中...' : '保存'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

