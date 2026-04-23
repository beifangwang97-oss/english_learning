const API_BASE_URL = 'http://localhost:8080';

type ApiErrorWithUsage = Error & {
  usage?: {
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
    blocked?: boolean;
  };
};

export type LexiconMeaning = {
  pos: string;
  meaning: string;
  example: string;
  example_zh: string;
  example_audio: string;
};

export type LexiconItem = {
  id: string;
  word: string;
  phonetic: string;
  unit: string;
  group_no?: number;
  type: 'word' | 'phrase';
  book_version: string;
  grade: string;
  semester: string;
  source_tag?: string;
  meanings: LexiconMeaning[];
  word_audio?: string;
  phrase_audio?: string;
  syllable_text?: string;
  syllable_pronunciation?: string[];
  memory_tip?: string;
  proper_noun_type?: string;
};

export type LexiconGradeSemester = {
  bookVersion: string;
  grade: string;
  semester: string;
  label: string;
};

export type LexiconTaskTreeSemester = {
  semester: string;
  units: string[];
};

export type LexiconTaskTreeGrade = {
  grade: string;
  semesters: LexiconTaskTreeSemester[];
};

export type LexiconTaskTreeBook = {
  bookVersion: string;
  grades: LexiconTaskTreeGrade[];
};

export type TextbookScopeGradeRow = {
  grade: string;
  semesters: string[];
};

export type TextbookScopeBookRow = {
  bookVersion: string;
  grades: TextbookScopeGradeRow[];
};

const formatScopeUsageMessage = (
  fallback: string,
  usage?: {
    wordLexiconCount?: number;
    phraseLexiconCount?: number;
    passageCount?: number;
    unitCount?: number;
    userCount?: number;
    storeCount?: number;
  }
) => {
  if (!usage) return fallback;
  const parts = [
    `单词 ${usage.wordLexiconCount ?? 0}`,
    `短语 ${usage.phraseLexiconCount ?? 0}`,
    `课文 ${usage.passageCount ?? 0}`,
    `单元 ${usage.unitCount ?? 0}`,
    `用户 ${usage.userCount ?? 0}`,
    `门店 ${usage.storeCount ?? 0}`,
  ];
  return `${fallback}\n占用明细：${parts.join('，')}`;
};

const createApiError = (
  fallback: string,
  payload?: { error?: string; usage?: ApiErrorWithUsage['usage'] }
) => {
  const err = new Error(formatScopeUsageMessage(payload?.error || fallback, payload?.usage)) as ApiErrorWithUsage;
  if (payload?.usage) err.usage = payload.usage;
  return err;
};

export type LearningGroupSummary = {
  groupNo: number;
  count: number;
};

export type LearningSourceGroupSummary = {
  sourceTag: string;
  groups: LearningGroupSummary[];
  total: number;
};

export type LearningEntry = {
  id: string;
  word: string;
  phonetic: string;
  unit: string;
  group_no?: number;
  type: 'word' | 'phrase';
  book_version: string;
  grade: string;
  semester: string;
  source_tag?: string;
  meanings: LexiconMeaning[];
  word_audio?: string;
  phrase_audio?: string;
  syllable_text?: string;
  syllable_pronunciation?: string[];
  memory_tip?: string;
  proper_noun_type?: string;
};

export type PassageSentence = {
  en: string;
  zh: string;
  audio: string;
  paragraph_no?: number;
  sentence_no_in_paragraph?: number;
  newline_after?: number;
  is_paragraph_end?: boolean;
};

export type PassageItem = {
  id: string;
  type: 'passage';
  unit: string;
  unit_no?: number;
  is_starter?: boolean;
  section: string;
  label: string;
  labels?: string[];
  display_label?: string;
  task_kind?: string;
  target_id: string;
  title: string;
  passage_text: string;
  source_pages: number[];
  matched_labels?: string[];
  source_line?: number;
  raw_scope_line?: string;
  book_version: string;
  grade: string;
  semester: string;
  source_file?: string;
  sentence_count: number;
  sentences: PassageSentence[];
};

export type TextbookUnitItem = {
  id: number;
  book_version: string;
  grade: string;
  semester: string;
  unit: string;
  unit_title: string;
  unit_desc_short: string;
  sort_order: number;
  source_file?: string;
  source_pages: number[];
  active: boolean;
};

export type PhoneticExampleWord = {
  word: string;
  phonetic: string;
  zh: string;
  word_audio: string;
};

export type PhoneticItem = {
  id: string;
  type: string;
  phonetic: string;
  category: 'vowel' | 'consonant' | string;
  phoneme_audio?: string;
  example_words: PhoneticExampleWord[];
};

export type ManagedAudioElement = HTMLAudioElement & {
  cleanupObjectUrl?: () => void;
};

const TEXTBOOK_ALIAS_GROUPS = [
  ['PEP', '人教版', '新版人教版'],
  ['FLTRP', '外研版'],
  ['SHJ', '上海版'],
];

export const getTextbookVersionCandidates = (value?: string) => {
  const normalized = (value || '').trim();
  if (!normalized) return [];
  const aliasGroup = TEXTBOOK_ALIAS_GROUPS.find((group) => group.includes(normalized));
  if (!aliasGroup) return [normalized];
  return Array.from(new Set([normalized, ...aliasGroup]));
};

export const normalizeTextbookPermissionToAvailable = (permission: string, availableBooks: string[]) => {
  const normalized = (permission || '').trim();
  if (!normalized) return '';
  if (availableBooks.includes(normalized)) return normalized;
  const candidates = getTextbookVersionCandidates(normalized);
  const hit = availableBooks.find((book) => candidates.includes((book || '').trim()));
  return hit || normalized;
};

export const formatSourceTagLabel = (tag?: string) => {
  const normalized = (tag || '').trim();
  if (!normalized) return '未标记';
  if (normalized === 'current_book') return '当前册单词';
  if (normalized === 'primary_school_review') return '小学复习';
  return normalized;
};

export const formatPassageDisplayLabel = (item: Pick<PassageItem, 'label' | 'display_label'> | { label?: string; display_label?: string }) => {
  const preferred = (item?.display_label || '').trim();
  if (preferred) return preferred;

  const raw = (item?.label || '').trim();
  if (!raw) return '';

  const normalized = raw
    .replace(/_and_/gi, ' and ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return raw;
  if (/[A-Z]/.test(normalized) || /\d/.test(normalized)) return normalized;

  return normalized.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
};

export const lexiconApi = {
  async getOptions(token: string, type: 'word' | 'phrase') {
    const response = await fetch(`${API_BASE_URL}/api/lexicon/options?type=${encodeURIComponent(type)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || '加载词库筛选项失败');
    }
    return payload as { bookVersions: string[]; grades: string[]; semesters: string[]; sourceTags: string[] };
  },

  async addTextbookVersion(token: string, name: string) {
    const response = await fetch(`${API_BASE_URL}/api/lexicon/tags/textbook-versions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || '新增教材版本失败');
    }
    return payload as { name: string };
  },

  async getTextbookScopes(token: string) {
    const response = await fetch(`${API_BASE_URL}/api/lexicon/tags/textbook-scopes`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || '加载教材结构失败');
    return payload as { tree: TextbookScopeBookRow[]; grades: string[]; semesters: string[] };
  },

  async createTextbookScopeTextbook(token: string, name: string) {
    const response = await fetch(`${API_BASE_URL}/api/lexicon/tags/textbook-scopes/textbooks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || '新增教材版本失败');
    return payload as { message: string; name: string };
  },

  async renameTextbookScopeTextbook(token: string, oldName: string, newName: string) {
    const response = await fetch(`${API_BASE_URL}/api/lexicon/tags/textbook-scopes/textbooks/rename`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ oldName, newName }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || '教材版本重命名失败');
    return payload as { message: string; oldName: string; newName: string };
  },

  async addTextbookScopeGrade(token: string, bookVersion: string, grade: string) {
    const response = await fetch(`${API_BASE_URL}/api/lexicon/tags/textbook-scopes/grades`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bookVersion, grade }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || '新增年级失败');
    return payload as { message: string };
  },

  async deleteTextbookScopeGrade(token: string, bookVersion: string, grade: string) {
    const query = new URLSearchParams({ bookVersion, grade });
    const response = await fetch(`${API_BASE_URL}/api/lexicon/tags/textbook-scopes/grades?${query.toString()}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) throw createApiError('删除年级失败', payload);
    return payload as { message: string };
  },

  async addTextbookScopeSemester(token: string, bookVersion: string, grade: string, semester: string) {
    const response = await fetch(`${API_BASE_URL}/api/lexicon/tags/textbook-scopes/semesters`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bookVersion, grade, semester }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || '新增册数失败');
    return payload as { message: string };
  },

  async deleteTextbookScopeSemester(token: string, bookVersion: string, grade: string, semester: string) {
    const query = new URLSearchParams({ bookVersion, grade, semester });
    const response = await fetch(`${API_BASE_URL}/api/lexicon/tags/textbook-scopes/semesters?${query.toString()}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) throw createApiError('删除册数失败', payload);
    return payload as { message: string };
  },

  async deleteTextbookScopeTextbook(token: string, bookVersion: string) {
    const query = new URLSearchParams({ bookVersion });
    const response = await fetch(`${API_BASE_URL}/api/lexicon/tags/textbook-scopes/textbooks?${query.toString()}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) throw createApiError('删除教材版本失败', payload);
    return payload as { message: string };
  },

  async cascadeDeleteTextbookScope(
    token: string,
    params: { bookVersion: string; grade?: string; semester?: string }
  ) {
    const response = await fetch(`${API_BASE_URL}/api/lexicon/tags/textbook-scopes/cascade-delete`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
    const payload = await response.json();
    if (!response.ok) throw createApiError('级联删除教材失败', payload);
    return payload as {
      message: string;
      deletedWords: number;
      deletedPhrases: number;
      deletedPassages: number;
      deletedUnits: number;
      deletedScopes: number;
      deletedTextbookTag: boolean;
      bookVersion: string;
      grade?: string;
      semester?: string;
    };
  },

  async getItems(
    token: string,
    type: 'word' | 'phrase',
    bookVersion: string,
    grade: string,
    semester: string,
    sourceTag?: string
  ) {
    const query = new URLSearchParams({
      type,
      bookVersion,
      grade,
      semester,
    });
    if (sourceTag !== undefined) query.set('sourceTag', sourceTag);
    const response = await fetch(`${API_BASE_URL}/api/lexicon/items?${query.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || '\u52a0\u8f7d\u8bcd\u6761\u6570\u91cf\u5931\u8d25');
    }
    return payload as { file: string | null; units: string[]; items: LexiconItem[]; sourceTag?: string };
  },

  async getItemsCount(
    token: string,
    type: 'word' | 'phrase',
    bookVersion: string,
    grade: string,
    semester: string,
    sourceTag?: string
  ) {
    const query = new URLSearchParams({
      type,
      bookVersion,
      grade,
      semester,
    });
    if (sourceTag !== undefined) query.set('sourceTag', sourceTag);
    const response = await fetch(`${API_BASE_URL}/api/lexicon/items/count?${query.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    // Backward compatibility: running backend may not include /items/count yet.
    if (response.status === 404) {
      const fallback = await this.getItems(token, type, bookVersion, grade, semester, sourceTag);
      return {
        type,
        bookVersion,
        grade,
        semester,
        sourceTag,
        count: Array.isArray(fallback.items) ? fallback.items.length : 0,
      };
    }

    let payload: any = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      payload = await response.json();
    } else {
      const text = await response.text();
      payload = { error: text || `HTTP ${response.status}` };
    }
    if (!response.ok) {
      throw new Error(payload?.error || '\u52a0\u8f7d\u8bcd\u6761\u6570\u91cf\u5931\u8d25');
    }
    return payload as {
      type: 'word' | 'phrase';
      bookVersion: string;
      grade: string;
      semester: string;
      sourceTag?: string;
      count: number;
    };
  },

  async getTaskTree(
    token: string,
    params?: {
      bookVersions?: string[];
      grades?: string[];
    }
  ) {
    const query = new URLSearchParams();
    if (params?.bookVersions?.length) {
      query.set('bookVersions', params.bookVersions.join(','));
    }
    if (params?.grades?.length) {
      query.set('grades', params.grades.join(','));
    }
    const suffix = query.toString() ? `?${query.toString()}` : '';
    const response = await fetch(`${API_BASE_URL}/api/lexicon/task-tree${suffix}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || '加载教学任务树失败');
    }
    return payload as { tree: LexiconTaskTreeBook[] };
  },

  async saveItems(
    token: string,
    type: 'word' | 'phrase',
    bookVersion: string,
    grade: string,
    semester: string,
    items: LexiconItem[]
  ) {
    const query = new URLSearchParams({
      type,
      bookVersion,
      grade,
      semester,
    });
    const response = await fetch(`${API_BASE_URL}/api/lexicon/items?${query.toString()}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(items),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || '\u52a0\u8f7d\u8bcd\u6761\u6570\u91cf\u5931\u8d25');
    }
    return payload as { message: string; file: string; count: number };
  },

  async deleteItems(
    token: string,
    type: 'word' | 'phrase',
    bookVersion: string,
    grade: string,
    semester: string
  ) {
    const query = new URLSearchParams({
      type,
      bookVersion,
      grade,
      semester,
    });
    const response = await fetch(`${API_BASE_URL}/api/lexicon/items?${query.toString()}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || '删除失败');
    }
    return payload as {
      message: string;
      type: 'word' | 'phrase';
      bookVersion: string;
      grade: string;
      semester: string;
      deletedEntries: number;
      deletedMeanings: number;
    };
  },

  async batchGroupItems(
    token: string,
    params: {
      type: 'word' | 'phrase';
      bookVersion: string;
      sourceTag?: string;
      groupSize?: number;
      clearOnly?: boolean;
    }
  ) {
    const query = new URLSearchParams({
      type: params.type,
      bookVersion: params.bookVersion,
    });
    if (params.sourceTag !== undefined) query.set('sourceTag', params.sourceTag);
    if (params.groupSize !== undefined) query.set('groupSize', String(params.groupSize));
    if (params.clearOnly !== undefined) query.set('clearOnly', String(params.clearOnly));
    const response = await fetch(`${API_BASE_URL}/api/lexicon/items/group-batch?${query.toString()}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || '批量分组失败');
    }
    return payload as {
      message: string;
      type: 'word' | 'phrase';
      bookVersion: string;
      sourceTag?: string | null;
      affectedScopes: number;
      affectedEntries: number;
      groupSize?: number | null;
    };
  },

  async previewDeleteItems(
    token: string,
    type: 'word' | 'phrase',
    bookVersion: string,
    grade: string,
    semester: string
  ) {
    const query = new URLSearchParams({
      type,
      bookVersion,
      grade,
      semester,
    });
    const response = await fetch(`${API_BASE_URL}/api/lexicon/items/delete-preview?${query.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || '删除预览失败');
    }
    return payload as {
      message: string;
      type: 'word' | 'phrase';
      bookVersion: string;
      grade: string;
      semester: string;
      deletedEntries: number;
      deletedMeanings: number;
    };
  },

  async proofreadJsonl(token: string, type: 'word' | 'phrase', file: File) {
    const form = new FormData();
    form.append('file', file);
    form.append('type', type);
    const response = await fetch(`${API_BASE_URL}/api/lexicon/proofread`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form,
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || '校对失败');
    }
    return payload as { items: LexiconItem[]; stats: Record<string, number> };
  },

  async importJsonl(
    token: string,
    params: {
      type: 'word' | 'phrase';
      bookVersion: string;
      grade: string;
      semester: string;
      file: File;
      proofread?: boolean;
      overwrite?: boolean;
      sourceTag?: string;
    }
  ) {
    const form = new FormData();
    form.append('file', params.file);
    form.append('type', params.type);
    form.append('bookVersion', params.bookVersion);
    form.append('grade', params.grade);
    form.append('semester', params.semester);
    if (params.sourceTag !== undefined) form.append('sourceTag', params.sourceTag);
    form.append('proofread', String(params.proofread ?? true));
    form.append('overwrite', String(params.overwrite ?? true));
    const response = await fetch(`${API_BASE_URL}/api/lexicon/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form,
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || '导入失败');
    }
    return payload as { message: string; count: number; proofread: boolean; stats: Record<string, number> };
  },

  audioUrl(path: string) {
    return `${API_BASE_URL}/api/lexicon/audio?path=${encodeURIComponent(path)}`;
  },

  async playAudioWithAuth(token: string, path?: string): Promise<ManagedAudioElement | undefined> {
    if (!token || !path) return;
    const response = await fetch(`${API_BASE_URL}/api/lexicon/audio?path=${encodeURIComponent(path)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      const contentType = response.headers.get('content-type') || '';
      let detail = '';
      try {
        if (contentType.includes('application/json')) {
          const payload = await response.json();
          detail = payload?.error || '';
        } else {
          detail = await response.text();
        }
      } catch {
        detail = '';
      }
      throw new Error(detail || `Audio load failed (HTTP ${response.status})`);
    }
    if (!response.ok) {
      throw new Error('音频加载失败');
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const audio = new Audio(objectUrl) as ManagedAudioElement;
    let released = false;
    const cleanup = () => {
      if (released) return;
      released = true;
      URL.revokeObjectURL(objectUrl);
    };
    audio.cleanupObjectUrl = cleanup;
    audio.addEventListener('ended', cleanup, { once: true });
    audio.addEventListener('error', cleanup, { once: true });
    try {
      await audio.play();
      return audio;
    } catch (e) {
      cleanup();
      throw e;
    }
  },

  async getLearningSummary(
    token: string,
    params: { type: 'word' | 'phrase'; bookVersion: string; grade: string; semester: string; unit: string; sourceTag?: string }
  ) {
    const query = new URLSearchParams({
      type: params.type,
      bookVersion: params.bookVersion,
      grade: params.grade,
      semester: params.semester,
      unit: params.unit,
    });
    if (params.sourceTag !== undefined) query.set('sourceTag', params.sourceTag);
    const response = await fetch(`${API_BASE_URL}/api/lexicon/learning/summary?${query.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to load learning summary');
    }
    return payload as {
      type: 'word' | 'phrase';
      bookVersion: string;
      grade: string;
      semester: string;
      unit: string;
      sourceTag?: string;
      groups: LearningGroupSummary[];
      sourceGroups: LearningSourceGroupSummary[];
      total: number;
    };
  },

  async getLearningItemsByGroup(
    token: string,
    params: { type: 'word' | 'phrase'; bookVersion: string; grade: string; semester: string; unit: string; groupNo: number; sourceTag?: string }
  ) {
    const query = new URLSearchParams({
      type: params.type,
      bookVersion: params.bookVersion,
      grade: params.grade,
      semester: params.semester,
      unit: params.unit,
      groupNo: String(params.groupNo),
    });
    if (params.sourceTag !== undefined) query.set('sourceTag', params.sourceTag);
    const response = await fetch(`${API_BASE_URL}/api/lexicon/learning/items?${query.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to load learning group items');
    }
    return payload as {
      type: 'word' | 'phrase';
      bookVersion: string;
      grade: string;
      semester: string;
      unit: string;
      groupNo: number;
      sourceTag?: string;
      items: LearningEntry[];
      count: number;
    };
  },

  async getPassages(token: string, bookVersion: string, grade: string, semester: string) {
    const query = new URLSearchParams({ bookVersion, grade, semester });
    const response = await fetch(`${API_BASE_URL}/api/lexicon/passages?${query.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || '加载课文失败');
    }
    return payload as { file: string; units: string[]; items: PassageItem[] };
  },

  async getPassagesCount(token: string, bookVersion: string, grade: string, semester: string) {
    const query = new URLSearchParams({ bookVersion, grade, semester });
    const response = await fetch(`${API_BASE_URL}/api/lexicon/passages/count?${query.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || '加载课文数量失败');
    }
    return payload as { bookVersion: string; grade: string; semester: string; count: number };
  },

  async importPassageJsonl(
    token: string,
    params: { file: File; bookVersion: string; grade: string; semester: string; overwrite?: boolean }
  ) {
    const form = new FormData();
    form.append('file', params.file);
    form.append('bookVersion', params.bookVersion);
    form.append('grade', params.grade);
    form.append('semester', params.semester);
    form.append('overwrite', String(params.overwrite ?? false));
    const response = await fetch(`${API_BASE_URL}/api/lexicon/passages/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || '导入课文失败');
    }
    return payload as { message: string; count: number };
  },

  async updatePassage(token: string, passageUid: string, payload: PassageItem) {
    const response = await fetch(`${API_BASE_URL}/api/lexicon/passages/${encodeURIComponent(passageUid)}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || '更新课文失败');
    }
    return data as { message: string; item: PassageItem };
  },

  async createPassage(token: string, payload: PassageItem) {
    const response = await fetch(`${API_BASE_URL}/api/lexicon/passages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || '新增课文失败');
    }
    return data as { message: string; item: PassageItem };
  },

  async deletePassage(token: string, passageUid: string) {
    const response = await fetch(`${API_BASE_URL}/api/lexicon/passages/${encodeURIComponent(passageUid)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || '删除课文失败');
    }
    return data as { message: string; passageUid: string };
  },

  async deletePassagesByScope(token: string, bookVersion: string, grade: string, semester: string) {
    const query = new URLSearchParams({ bookVersion, grade, semester });
    const response = await fetch(`${API_BASE_URL}/api/lexicon/passages/scope?${query.toString()}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || '删除本册课文失败');
    }
    return data as { message: string; count: number };
  },

  async getUnits(token: string, bookVersion: string, grade: string, semester: string) {
    const query = new URLSearchParams({ bookVersion, grade, semester });
    const response = await fetch(`${API_BASE_URL}/api/lexicon/units?${query.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || '加载单元失败');
    }
    return payload as { bookVersion: string; grade: string; semester: string; count: number; items: TextbookUnitItem[] };
  },

  async getUnitsCount(token: string, bookVersion: string, grade: string, semester: string) {
    const query = new URLSearchParams({ bookVersion, grade, semester });
    const response = await fetch(`${API_BASE_URL}/api/lexicon/units/count?${query.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || '加载单元数量失败');
    }
    return payload as { bookVersion: string; grade: string; semester: string; count: number };
  },

  async getUnitsDeletePreview(token: string, bookVersion: string, grade: string, semester: string) {
    const query = new URLSearchParams({ bookVersion, grade, semester });
    const response = await fetch(`${API_BASE_URL}/api/lexicon/units/delete-preview?${query.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || '加载删除预览失败');
    }
    return payload as {
      bookVersion: string;
      grade: string;
      semester: string;
      unitCount: number;
      wordLexiconCount: number;
      phraseLexiconCount: number;
      passageCount: number;
      blocked: boolean;
      note?: string;
    };
  },

  async createUnit(token: string, payload: Omit<TextbookUnitItem, 'id'>) {
    const response = await fetch(`${API_BASE_URL}/api/lexicon/units`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || '新增单元失败');
    }
    return data as { message: string; item: TextbookUnitItem };
  },

  async updateUnit(token: string, id: number, payload: Omit<TextbookUnitItem, 'id'>) {
    const response = await fetch(`${API_BASE_URL}/api/lexicon/units/${id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || '更新单元失败');
    }
    return data as { message: string; item: TextbookUnitItem };
  },

  async deleteUnit(token: string, id: number) {
    const response = await fetch(`${API_BASE_URL}/api/lexicon/units/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || '删除单元失败');
    }
    return data as { message: string; id: number };
  },

  async deleteUnitsByScope(token: string, bookVersion: string, grade: string, semester: string) {
    const query = new URLSearchParams({ bookVersion, grade, semester });
    const response = await fetch(`${API_BASE_URL}/api/lexicon/units?${query.toString()}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || '整册删除单元失败');
    }
    return data as { message: string; count: number };
  },

  async importUnitJsonl(
    token: string,
    params: { file: File; bookVersion: string; grade: string; semester: string; overwrite?: boolean }
  ) {
    const form = new FormData();
    form.append('file', params.file);
    form.append('bookVersion', params.bookVersion);
    form.append('grade', params.grade);
    form.append('semester', params.semester);
    form.append('overwrite', String(params.overwrite ?? true));
    const response = await fetch(`${API_BASE_URL}/api/lexicon/units/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || '导入单元失败');
    }
    return data as { message: string; count: number; bookVersion: string; grade: string; semester: string };
  },

  async getPhonetics(token: string) {
    const response = await fetch(`${API_BASE_URL}/api/lexicon/phonetics`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || '加载音标数据失败');
    }
    return payload as { file: string; count: number; items: PhoneticItem[] };
  },

  async createPhonetic(token: string, payload: PhoneticItem) {
    const response = await fetch(`${API_BASE_URL}/api/lexicon/phonetics`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || '新增音标失败');
    }
    return data as { message: string; item: PhoneticItem };
  },

  async updatePhonetic(token: string, phonemeUid: string, payload: PhoneticItem) {
    const response = await fetch(`${API_BASE_URL}/api/lexicon/phonetics/${encodeURIComponent(phonemeUid)}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || '更新音标失败');
    }
    return data as { message: string; item: PhoneticItem };
  },

  async deletePhonetic(token: string, phonemeUid: string) {
    const response = await fetch(`${API_BASE_URL}/api/lexicon/phonetics/${encodeURIComponent(phonemeUid)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || '删除音标失败');
    }
    return data as { message: string; id: string };
  },

  async deleteAllPhonetics(token: string) {
    const response = await fetch(`${API_BASE_URL}/api/lexicon/phonetics/all`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || '全部删除音标失败');
    }
    return data as { message: string; count: number };
  },

  async importPhoneticJsonl(token: string, params: { file: File; overwrite?: boolean }) {
    const form = new FormData();
    form.append('file', params.file);
    form.append('overwrite', String(params.overwrite ?? true));
    const response = await fetch(`${API_BASE_URL}/api/lexicon/phonetics/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || '导入音标 JSONL 失败');
    }
    return data as { message: string; count: number; meta?: Record<string, unknown> };
  },
};


