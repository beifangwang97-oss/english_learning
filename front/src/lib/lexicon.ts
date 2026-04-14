const API_BASE_URL = 'http://localhost:8080';

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
  meanings: LexiconMeaning[];
  word_audio?: string;
  phrase_audio?: string;
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

export type LearningGroupSummary = {
  groupNo: number;
  count: number;
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
  meanings: LexiconMeaning[];
  word_audio?: string;
  phrase_audio?: string;
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
    return payload as { bookVersions: string[]; grades: string[]; semesters: string[] };
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
    if (!response.ok) throw new Error(payload?.error || '删除年级失败');
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
    if (!response.ok) throw new Error(payload?.error || '删除册数失败');
    return payload as { message: string };
  },

  async deleteTextbookScopeTextbook(token: string, bookVersion: string) {
    const query = new URLSearchParams({ bookVersion });
    const response = await fetch(`${API_BASE_URL}/api/lexicon/tags/textbook-scopes/textbooks?${query.toString()}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || '删除教材版本失败');
    return payload as { message: string };
  },

  async getItems(
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
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || '\u52a0\u8f7d\u8bcd\u6761\u6570\u91cf\u5931\u8d25');
    }
    return payload as { file: string | null; units: string[]; items: LexiconItem[] };
  },

  async getItemsCount(
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
    const response = await fetch(`${API_BASE_URL}/api/lexicon/items/count?${query.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    // Backward compatibility: running backend may not include /items/count yet.
    if (response.status === 404) {
      const fallback = await this.getItems(token, type, bookVersion, grade, semester);
      return {
        type,
        bookVersion,
        grade,
        semester,
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
    }
  ) {
    const form = new FormData();
    form.append('file', params.file);
    form.append('type', params.type);
    form.append('bookVersion', params.bookVersion);
    form.append('grade', params.grade);
    form.append('semester', params.semester);
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

  async playAudioWithAuth(token: string, path?: string) {
    if (!token || !path) return;
    const response = await fetch(`${API_BASE_URL}/api/lexicon/audio?path=${encodeURIComponent(path)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      throw new Error('音频加载失败');
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const audio = new Audio(objectUrl);
    const cleanup = () => URL.revokeObjectURL(objectUrl);
    audio.addEventListener('ended', cleanup, { once: true });
    audio.addEventListener('error', cleanup, { once: true });
    try {
      await audio.play();
    } catch (e) {
      cleanup();
      throw e;
    }
  },

  async getLearningSummary(
    token: string,
    params: { type: 'word' | 'phrase'; bookVersion: string; grade: string; semester: string; unit: string }
  ) {
    const query = new URLSearchParams({
      type: params.type,
      bookVersion: params.bookVersion,
      grade: params.grade,
      semester: params.semester,
      unit: params.unit,
    });
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
      groups: LearningGroupSummary[];
      total: number;
    };
  },

  async getLearningItemsByGroup(
    token: string,
    params: { type: 'word' | 'phrase'; bookVersion: string; grade: string; semester: string; unit: string; groupNo: number }
  ) {
    const query = new URLSearchParams({
      type: params.type,
      bookVersion: params.bookVersion,
      grade: params.grade,
      semester: params.semester,
      unit: params.unit,
      groupNo: String(params.groupNo),
    });
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
      items: LearningEntry[];
      count: number;
    };
  },
};


